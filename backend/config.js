const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq < 0) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    });
  } catch (e) {
    /* no .env file - environment variables only */
  }
}

loadEnvFile(path.join(__dirname, ".env"));

module.exports = {
  port: Number(process.env.PORT || 8080),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  dbName: process.env.MONGODB_DB || "campuskart",
  apiRoot: "/campuskart",
  pageSize: 12,
  requestDays: 3,
  bundleDiscount: 40,
  passSecret: 7919,
  locations: ["Library", "Hostel Gate", "Canteen", "Main Gate", "Hostel Block A", "Hostel Block B", "Department Lobby"],
  conditions: ["NEW", "GOOD", "FAIR", "POOR"],
  reportReasons: ["FAKE", "INAPPROPRIATE", "WRONG_INFO", "SPAM", "OTHER"],
  // Comma-separated frontend origins when the SPA is deployed separately.
  // Leave empty for the combined same-origin deployment.
  corsOrigins: String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  // Secure cookies require HTTPS. Render sets NODE_ENV=production.
  secureCookies: process.env.NODE_ENV === "production" || String(process.env.COOKIE_SECURE || "").toLowerCase() === "true",
  // Optional SMTP settings. Leave SMTP_HOST empty to disable e-mail notifications.
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "",
  },
};
