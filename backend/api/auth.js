const crypto = require("crypto");
const { col, nextId } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const G = require("./guard");
const R = require("../rules");
const ID = require("../idcard");
const sessions = require("../sessions");
const { Resp, ok } = require("../resp");

async function settings() {
  const row = await col("site_setting").findOne({ Set_Key: "CLEAROUT_MODE" });
  return { farewell_banner: T.nz(row && row.Set_Value) === "1" };
}

async function meta() {
  const branches = await col("branch").find({}).sort({ Br_ID: 1 }).toArray();
  const categories = await col("category").find({}).sort({ Cat_ID: 1 }).toArray();
  const institutes = await col("institute").find({}).sort({ Ins_ID: 1 }).toArray();
  const subjects = await col("subject").find({}).sort({ Sub_ID: 1 }).toArray();
  return {
    branches: branches.map((r) => ({ branch_id: r.Br_ID, branch_name: r.Br_Name, branch_code: r.Br_Code })),
    categories: categories.map((r) => ({
      category_id: r.Cat_ID,
      category_name: r.Cat_Name,
      is_academic: T.truth(r.Cat_IsAcademic),
      is_rentable: T.truth(r.Cat_IsRentable),
      parent_category_id: r.Cat_ParentID === undefined ? null : r.Cat_ParentID,
    })),
    subjects: subjects.map((r) => ({ subject_id: r.Sub_ID, subject_name: r.Sub_Name, subject_code: r.Sub_Code })),
    institutes: institutes.map((r) => ({ institute_id: r.Ins_ID, institute_name: r.Ins_Name, institute_code: r.Ins_Code })),
    locations: C.locations,
    settings: await settings(),
  };
}

function sessionJson(session) {
  return {
    user_id: session.userId,
    name: session.name,
    role: session.role,
    verification_status: session.verificationStatus,
    remarks: T.nz(session.remarks),
  };
}

async function login(request) {
  await R.runSweep();
  const email = T.trim(request.s("email"));
  const password = request.s("password");
  // The original query was LOWER(U_Email) = ?, so e-mail is case-insensitive.
  const row = await col("users").findOne({ U_Email: email }, { collation: { locale: "en", strength: 2 } });
  if (!row || T.nz(row.U_PasswordHash) !== T.sha256(password)) {
    throw new T.ApiError("Wrong email or password.");
  }
  if (!T.truth(row.U_IsActive)) {
    throw new T.ApiError("Your account is blocked. Please contact the admin.");
  }
  const st = await V.student(row.U_ID);
  const session = sessions.open(
    row.U_ID,
    `${T.nz(row.U_FirstName)} ${T.nz(row.U_LastName)}`.trim(),
    row.U_Role,
    st ? st.verificationStatus : null,
    st ? T.nz(st.remarks) : ""
  );
  return new Resp(
    sessionJson(session),
    `ck_session=${session.token}; Path=/; Max-Age=28800; HttpOnly; SameSite=Lax${C.secureCookies ? "; Secure" : ""}`
  );
}

async function register(request) {
  const full = T.trim(request.s("full_name")).replace(/\s+/g, " ");
  const parts = full.split(" ");
  if (!full || parts.length < 2) {
    throw new T.ApiError("Enter your full name exactly as on your ID card.");
  }
  const email = T.trim(request.s("email"));
  if (!T.collegeEmail(email)) {
    throw new T.ApiError("Use your college email ending in .edu.in or .ac.in");
  }
  if (
    (await col("users").countDocuments({ U_Email: email }, { collation: { locale: "en", strength: 2 } })) > 0
  ) {
    throw new T.ApiError("This email is already registered.");
  }
  let collegeId = T.trim(request.s("college_id"));
  if ((await col("student").countDocuments({ St_CollegeID: collegeId })) > 0) {
    throw new T.ApiError("This college ID / PRN is already registered.");
  }
  const phone = T.trim(request.s("phone_no"));
  if (!T.digits(phone, 10)) {
    throw new T.ApiError("Phone number must be 10 digits.");
  }
  const password = request.s("password");
  if (password.length < 8) {
    throw new T.ApiError("Password must be at least 8 characters.");
  }
  const age = request.i("age", 0);
  if (age < 15 || age > 60) {
    throw new T.ApiError("Age must be between 15 and 60.");
  }
  const gender = request.s("gender");
  if (gender !== "Female" && gender !== "Male" && gender !== "Other") {
    throw new T.ApiError("Select your gender.");
  }
  const year = request.i("year", 0);
  const semester = request.i("semester", 0);
  if (year < 1 || year > 4) {
    throw new T.ApiError("Year must be 1 to 4.");
  }
  if (semester !== 2 * year - 1 && semester !== 2 * year) {
    throw new T.ApiError("Semester " + semester + " does not belong to year " + year + ".");
  }
  const instituteId = request.s("institute_id");
  const branchId = request.s("branch_id");
  if (!instituteId || !branchId) {
    throw new T.ApiError("Select your college and branch.");
  }
  if ((await col("institute").countDocuments({ Ins_ID: instituteId })) === 0) {
    throw new T.ApiError("Select your college and branch.");
  }
  if ((await col("branch").countDocuments({ Br_ID: branchId })) === 0) {
    throw new T.ApiError("Select your college and branch.");
  }
  const cardPath = request.file("id_card");
  if (!cardPath) {
    throw new T.ApiError("Upload a photo of your ID card.");
  }
  const card = ID.check(request.s("card_text"), full, collegeId);
  const status = card.verified ? "VERIFIED" : "PENDING";
  const method = card.verified ? "ID_CARD_AUTO" : "ADMIN";
  const flagReason = card.reason();

  const firstName = parts[0].length > 30 ? parts[0].substring(0, 30) : parts[0];
  const lastName = parts.slice(1).join(" ").substring(0, 30);
  const nameOnId = T.upper(full.length > 60 ? full.substring(0, 60) : full);
  collegeId = collegeId.length > 15 ? collegeId.substring(0, 15) : collegeId;

  // Standalone MongoDB has no multi-document transaction, so we write in order
  // and tidy up the rows we already wrote if a later step fails.
  const userId = await nextId("users");
  const phoneId = await nextId("user_phone");
  const inserted = [];
  try {
    await col("users").insertOne({
      _id: userId,
      U_ID: userId,
      U_FirstName: firstName,
      U_LastName: lastName,
      U_Email: email,
      U_PasswordHash: T.sha256(password),
      U_Role: "STUDENT",
      U_IsActive: 1,
      U_RegisteredOn: T.today(),
    });
    inserted.push(["users", { U_ID: userId }]);
    await col("user_phone").insertOne({
      _id: phoneId,
      UP_ID: phoneId,
      UP_PhoneNo: phone,
      U_ID: userId,
    });
    inserted.push(["user_phone", { UP_ID: phoneId }]);
    await col("student").insertOne({
      _id: userId,
      U_ID: userId,
      St_CollegeID: collegeId,
      St_NameOnId: nameOnId,
      St_Gender: gender,
      St_Age: age,
      St_Year: year,
      St_Semester: semester,
      St_VerificationStatus: status,
      St_VerificationMethod: method,
      St_FlagReason: flagReason,
      St_IdCardPath: cardPath,
      Br_ID: branchId,
      Ins_ID: instituteId,
    });
    inserted.push(["student", { U_ID: userId }]);
  } catch (e) {
    for (const [collection, filter] of inserted.reverse()) {
      await col(collection).deleteOne(filter).catch(() => {});
    }
    throw e;
  }

  const st = await V.student(userId);
  const checked = ["college e-mail address", "phone number, age and gender", "year and semester"];
  for (const extra of card.matched) checked.push(extra);
  return {
    verified: card.verified,
    flagged: !card.verified,
    problems: card.problems,
    checked,
    read_text: card.readText,
    name_on_card: card.nameOnCard,
    message: card.verified
      ? "Your ID card matched your name and college ID, so your account is verified. You can log in and start buying and selling."
      : "Your account was created and is waiting for an admin to check it.",
    user_id: st.userId,
  };
}

async function profile(session) {
  await G.user(session);
  const user = await col("users").findOne({ U_ID: session.userId });
  const phones = await col("user_phone").find({ U_ID: session.userId }).sort({ UP_ID: 1 }).toArray();
  const st = await V.student(session.userId);
  return {
    user_id: session.userId,
    first_name: user.U_FirstName,
    last_name: user.U_LastName,
    email: user.U_Email,
    role: user.U_Role,
    phones: phones.map((p) => p.UP_PhoneNo),
    student: st ? V.studentJson(st) : null,
  };
}

async function updateProfile(request, session) {
  const st = await G.student(session);
  const first = T.trim(request.s("first_name"));
  const last = T.trim(request.s("last_name"));
  if (!first || !last) throw new T.ApiError("Name cannot be empty.");
  const semester = request.i("semester", 0);
  if (semester < 1 || semester > 8) throw new T.ApiError("Semester must be 1 to 8.");
  const year = Math.ceil(semester / 2);
  await col("users").updateOne({ U_ID: st.userId }, { $set: { U_FirstName: first, U_LastName: last } });
  await col("student").updateOne({ U_ID: st.userId }, { $set: { St_Semester: semester, St_Year: year } });
  return ok();
}

async function addPhone(request, session) {
  await G.user(session);
  const phone = T.trim(request.s("phone_no"));
  if (!T.digits(phone, 10)) throw new T.ApiError("Phone number must be 10 digits.");
  const exists = await col("user_phone").countDocuments({ U_ID: session.userId, UP_PhoneNo: phone });
  if (exists > 0) throw new T.ApiError("You already added this number.");
  const id = await nextId("user_phone");
  await col("user_phone").insertOne({ _id: id, UP_ID: id, UP_PhoneNo: phone, U_ID: session.userId });
  return ok();
}

async function removePhone(request, session) {
  await G.user(session);
  const phone = T.trim(request.s("phone_no"));
  const mine = await col("user_phone").countDocuments({ U_ID: session.userId });
  if (mine <= 1) throw new T.ApiError("At least one phone number must stay.");
  await col("user_phone").deleteMany({ U_ID: session.userId, UP_PhoneNo: phone });
  return ok();
}

async function changePassword(request, session) {
  await G.user(session);
  const oldPassword = request.s("old_password");
  const newPassword = request.s("new_password");
  const user = await col("users").findOne({ U_ID: session.userId });
  if (T.nz(user.U_PasswordHash) !== T.sha256(oldPassword)) {
    throw new T.ApiError("Current password is wrong.");
  }
  if (newPassword.length < 8) throw new T.ApiError("New password must be at least 8 characters.");
  await col("users").updateOne({ U_ID: session.userId }, { $set: { U_PasswordHash: T.sha256(newPassword) } });
  return ok();
}

async function logout(request) {
  sessions.close(request.token);
  return new Resp(ok(), `ck_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${C.secureCookies ? "; Secure" : ""}`);
}

const NAMES = ["meta", "settings", "login", "register", "logout", "profile", "updateProfile", "addPhone", "removePhone", "changePassword"];

async function handle(name, request, session) {
  switch (name) {
    case "meta": return meta();
    case "settings": return settings();
    case "login": return login(request);
    case "register": return register(request);
    case "logout": return logout(request);
    case "profile": return profile(session);
    case "updateProfile": return updateProfile(request, session);
    case "addPhone": return addPhone(request, session);
    case "removePhone": return removePhone(request, session);
    case "changePassword": return changePassword(request, session);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES, settings, sessionJson, meta };
