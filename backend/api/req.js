const T = require("../util");

// Rebuilds the small request object used by the Java Req class: form fields,
// uploaded files and the session cookie, with the same accessor behaviour.
function build(name, expressReq, uploadDir) {
  const body = expressReq.body && typeof expressReq.body === "object" ? expressReq.body : {};
  const fields = {};
  for (const key of Object.keys(body)) fields[key] = body[key];

  const fileMap = {};
  const photos = [];
  const files = expressReq.files || {};
  for (const key of Object.keys(files)) {
    const list = Array.isArray(files[key]) ? files[key] : [files[key]];
    for (const file of list) {
      const path = "uploads/" + file.filename;
      fileMap[key] = path;
      if (key === "photos") photos.push(path);
    }
  }

  const request = {
    name,
    token: cookie(expressReq.headers.cookie, "ck_session"),
    uploads: uploadDir,
    raw: (key) => fields[key],
    has: (key) => fields[key] !== undefined && fields[key] !== null && String(fields[key]) !== "",
    s: (key) => (fields[key] === undefined || fields[key] === null ? "" : String(fields[key])),
    first(...keys) {
      for (const key of keys) if (request.has(key)) return request.s(key);
      return "";
    },
    i: (key, fallback) => T.valueOf(request.s(key), fallback),
    b: (key) => T.truth(fields[key]),
    stringList(key) {
      const value = fields[key];
      const out = [];
      if (Array.isArray(value)) {
        for (const v of value) if (v !== null && v !== undefined) out.push(String(v));
      } else if (value !== undefined && value !== null && String(value) !== "") {
        out.push(String(value));
      }
      return out;
    },
    photos: () => photos,
    file: (key) => (fileMap[key] === undefined ? null : fileMap[key]),
  };
  return request;
}

function cookie(header, key) {
  if (!header) return null;
  for (const part of String(header).split(";")) {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");
    if (equals > 0 && trimmed.substring(0, equals) === key) return trimmed.substring(equals + 1);
  }
  return null;
}

module.exports = { build };
