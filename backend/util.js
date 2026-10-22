const crypto = require("crypto");

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const nz = (value) => (value === null || value === undefined ? "" : String(value));

const trim = (value) => nz(value).trim();

const upper = (value) => nz(value).toUpperCase();

const join = (separator, ...parts) => parts.join(separator);

function valueOf(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function decimal(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = parseFloat(String(value).trim());
  return Number.isNaN(parsed) ? fallback : parsed;
}

function truth(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const s = String(value).trim();
  return s === "1" || s.toLowerCase() === "true" || s.toLowerCase() === "yes" || s === "on";
}

const blank = (value) => value === null || value === undefined || String(value).trim() === "";

function digits(value, length) {
  if (value === null || value === undefined) return false;
  const s = String(value);
  if (s.length !== length) return false;
  return /^\d+$/.test(s);
}

function collegeEmail(value) {
  const v = trim(value).toLowerCase();
  return v.endsWith(".edu.in") || v.endsWith(".ac.in");
}

const sha256 = (value) => crypto.createHash("sha256").update(nz(value), "utf8").digest("hex");

const pad2 = (n) => String(n).padStart(2, "0");

function now(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function today(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function normalize(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace("T", " ");
  if (s.length === 10) return s + " 00:00:00";
  if (s.length === 16) return s + ":00";
  return s;
}

function dateOf(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace("T", " ");
  return s.length > 10 ? s.substring(0, 10) : s;
}

function dateOnly(value) {
  const s = dateOf(value);
  if (!s) return null;
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays(date, days) {
  const parsed = dateOnly(date);
  if (!parsed) return dateOf(date);
  parsed.setDate(parsed.getDate() + days);
  return today(parsed);
}

function dayDiff(from, to) {
  const a = dateOnly(from);
  const b = dateOnly(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function parseDateTime(value) {
  const s = normalize(value);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function hoursBetween(from, to) {
  const a = parseDateTime(from);
  const b = parseDateTime(to);
  if (!a || !b) return 0;
  return (b.getTime() - a.getTime()) / 3600000;
}

function beforeNow(value) {
  const d = parseDateTime(value);
  if (!d) return true;
  return d.getTime() < Date.now();
}

function stamp(value) {
  const d = parseDateTime(value);
  return d ? d.getTime() : 0;
}

const round5 = (value) => Math.max(5, Math.round(value / 5) * 5);

function numeric(id) {
  let value = 0;
  let seen = false;
  const source = nz(id);
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c >= "0" && c <= "9") {
      value = value * 10 + (c.charCodeAt(0) - 48);
      seen = true;
    } else if (seen) {
      break;
    }
  }
  return value;
}

const pad = (number, width) => String(number).padStart(width, "0");

const int = (row, key, fallback = 0) => valueOf(row ? row[key] : null, fallback);

const val = (row, key, fallback = null) => (row && row[key] !== undefined ? row[key] : fallback);

function words(value, count) {
  const parts = trim(value).split(/\s+/).filter(Boolean);
  return parts.slice(0, count).join(" ");
}

const allowed = (values, value) => values.includes(value);

module.exports = {
  ApiError,
  nz,
  trim,
  upper,
  join,
  valueOf,
  decimal,
  truth,
  blank,
  digits,
  collegeEmail,
  sha256,
  now,
  today,
  normalize,
  dateOf,
  addDays,
  dayDiff,
  hoursBetween,
  beforeNow,
  stamp,
  round5,
  numeric,
  pad,
  int,
  val,
  words,
  allowed,
};
