const crypto = require("crypto");

const HOURS = 8;
const OPEN = new Map();
let created = 0;

function open(userId, name, role, verificationStatus, remarks) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const session = {
    token,
    userId,
    name,
    role,
    verificationStatus: verificationStatus === undefined ? null : verificationStatus,
    remarks: remarks || "",
    expiresAt: Date.now() + HOURS * 3600000,
  };
  OPEN.set(token, session);
  created++;
  return session;
}

function find(token) {
  if (!token) return null;
  const session = OPEN.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    OPEN.delete(token);
    return null;
  }
  return session;
}

function close(token) {
  if (token) OPEN.delete(token);
}

function closeAllFor(userId) {
  for (const [token, session] of OPEN.entries()) {
    if (session.userId === userId) OPEN.delete(token);
  }
}

module.exports = { open, find, close, closeAllFor, createdCount: () => created, HOURS };
