const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const config = require("./config");
const db = require("./db");
const sessions = require("./sessions");
const T = require("./util");
const apiReq = require("./api/req");
const { Resp } = require("./resp");

const auth = require("./api/auth");
const catalog = require("./api/catalog");
const requests = require("./api/requests");
const bundles = require("./api/bundles");
const rentals = require("./api/rentals");
const admin = require("./api/admin");
const account = require("./api/account");
const events = require("./src/events");
const { startExpiryJob } = require("./src/jobs/expiry");
const registerRest = require("./rest");

/* --------------------------------------------------------------- locations */

const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "uploads"));
const distDir = path.resolve(process.env.WEB_DIR || path.join(__dirname, "..", "frontend", "dist"));
fs.mkdirSync(uploadDir, { recursive: true });

/* ----------------------------------------------------------------- routing */

// Every operation name from the Java ApiServer is registered to one handler,
// so POST /campuskart/api/<name> behaves exactly like the original server.
const ROUTES = new Map();
for (const module of [auth, catalog, requests, bundles, rentals, admin, account]) {
  for (const name of module.names) ROUTES.set(name, module.handle);
}

/* ------------------------------------------------------------------ uploads */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
    if (ext.length > 6) ext = ext.slice(0, 6);
    cb(null, crypto.randomUUID().replace(/-/g, "") + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype) || file.fieldname === "id_card"),
});

/* --------------------------------------------------------------- app setup */

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = config.corsOrigins;
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (!origin) {
    // Same-origin requests and health checks do not need CORS headers.
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (config.secureCookies) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

/* ------------------------------------------------------------------ health */

async function health(req, res) {
  try {
    await db.ping();
    return sendJson(res, 200, {
      status: "ok",
      service: "campuskart-api",
      database: "connected",
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 503, {
      status: "degraded",
      service: "campuskart-api",
      database: "disconnected",
      error: "MongoDB is not reachable",
    });
  }
}

app.get("/health", health);
app.get(`${config.apiRoot}/health`, health);

/* ------------------------------------------------------------------- the API */

const multiPart = upload.fields([{ name: "photos", maxCount: 5 }, { name: "id_card", maxCount: 1 }]);

app.post(`${config.apiRoot}/api/:name`, multiPart, async (req, res) => {
  const name = req.params.name;
  const handler = ROUTES.get(name);
  if (!handler) return sendJson(res, 404, { error: "Unknown call." });
  try {
    const request = apiReq.build(name, req, uploadDir);
    const session = sessions.find(request.token);
    const value = await handler(name, request, session, uploadDir);
    if (value === undefined) return sendJson(res, 404, { error: "Unknown call." });
    events.publish(name, value, session);
    if (value instanceof Resp) {
      if (value.cookie) res.setHeader("Set-Cookie", value.cookie);
      return sendJson(res, 200, value.body);
    }
    return sendJson(res, 200, value);
  } catch (error) {
    if (error instanceof T.ApiError) return sendJson(res, error.status || 400, { error: error.message });
    console.error(`[${name}]`, error);
    return sendJson(res, 500, { error: "Something went wrong on the server. Please try again." });
  }
});

// Conventional REST surface for Postman, mobile clients and future React pages.
// The preserved screens keep using the original POST /campuskart/api/<name> shape.
registerRest(app, { routes: ROUTES, upload, uploadDir, sendJson });

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/* -------------------------------------------------------------- static files */

app.use("/uploads", express.static(uploadDir, { fallthrough: true }));
app.use("/images", express.static(path.join(distDir, "images"), { fallthrough: true }));
app.use(express.static(distDir, { index: false }));

// Single page app: any other GET that wants HTML gets the React shell.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const index = path.join(distDir, "index.html");
  if (!fs.existsSync(index)) return next();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(fs.readFileSync(index));
});

app.use((req, res) => sendJson(res, 404, { error: "Unknown call." }));

/* --------------------------------------------------------- centralized errors */

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each file must be 3 MB or smaller."
        : error.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected file field."
          : "The upload could not be processed.";
    return sendJson(res, 400, { error: message });
  }
  if (error && error.type === "entity.parse.failed") {
    return sendJson(res, 400, { error: "Request body must be valid JSON." });
  }
  if (error && /image|jpeg|png|webp|file/i.test(error.message || "")) {
    return sendJson(res, 400, { error: error.message });
  }
  console.error("[unhandled]", error);
  return sendJson(res, 500, { error: "Something went wrong on the server. Please try again." });
});

/* --------------------------------------------------------------------- start */

async function start() {
  try {
    await db.connect();
    console.log(`MongoDB connected: ${config.mongoUri} / ${config.dbName}`);
  } catch (error) {
    console.error("Could not reach MongoDB:", error.message);
    console.error("Set MONGODB_URI in backend/.env and make sure MongoDB is running.");
    process.exitCode = 1;
    return;
  }
  startExpiryJob();
  return app.listen(config.port, () => {
    console.log(`CampusKart API listening on http://localhost:${config.port}${config.apiRoot}/api/<name>`);
    console.log(`${ROUTES.size} operations registered; REST API at /api/v1.`);
    if (fs.existsSync(distDir)) console.log(`Serving the built site from ${distDir}`);
    else console.log("No frontend build found yet - run the Vite dev server or 'npm run build' in frontend/.");
  });
}

if (require.main === module) start();

module.exports = { app, start, ROUTES };
