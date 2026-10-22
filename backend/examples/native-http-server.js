#!/usr/bin/env node
/*
 * Syllabus demonstration: a tiny HTTP server built only with Node's native
 * `http` and `url` modules. It is intentionally isolated from Express so the
 * request/response lifecycle can be shown in a lab without starting MongoDB.
 *
 *   node examples/native-http-server.js
 *   curl http://localhost:8090/health
 *   curl "http://localhost:8090/echo?name=Aarav&semester=5"
 */
const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.DEMO_PORT || 8090);

function send(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "X-Demo-Server": "native-http",
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const base = `http://${req.headers.host || "localhost"}`;
  const url = new URL(req.url, base);

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { status: "ok", server: "native-http", uptime: process.uptime() });
  }

  if (req.method === "GET" && url.pathname === "/echo") {
    const params = Object.fromEntries(url.searchParams.entries());
    return send(res, 200, { method: req.method, path: url.pathname, query: params });
  }

  if (req.method === "POST" && url.pathname === "/echo") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      let parsed = null;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        return send(res, 400, { error: "Body must be valid JSON." });
      }
      return send(res, 200, { method: req.method, path: url.pathname, body: parsed });
    });
    return;
  }

  return send(res, 404, { error: "Not found", path: url.pathname });
});

server.listen(PORT, () => {
  console.log(`Native HTTP demo on http://localhost:${PORT}`);
  console.log("Try /health, GET /echo?name=Aarav and POST /echo with JSON.");
});
