const T = require("../util");
const V = require("../views");

async function user(session) {
  if (!session) throw new T.ApiError("Your session expired. Please log in again.", 401);
  return session;
}

async function student(session) {
  await user(session);
  const st = await V.student(session.userId);
  if (!st) throw new T.ApiError("Students only.");
  return st;
}

async function verifiedStudent(session) {
  const st = await student(session);
  if (st.verificationStatus !== "VERIFIED") {
    throw new T.ApiError("Only verified students can do this. Your ID card must be verified first.");
  }
  return st;
}

async function admin(session) {
  await user(session);
  if (session.role !== "ADMIN") throw new T.ApiError("Admins only.");
  return session;
}

module.exports = { user, student, verifiedStudent, admin };
