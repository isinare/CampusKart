const { col, nextId } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const R = require("../rules");
const A = require("./auth");
const G = require("./guard");
const mail = require("../mail");
const { ok } = require("../resp");

async function overview() {
  const students = await col("student").countDocuments({});
  const itemsOnSale = await col("item").countDocuments({ I_Status: { $in: ["AVAILABLE", "BUY_REQUESTED", "ACCEPTED"] } });
  const itemsSold = await col("item").countDocuments({ I_Status: "SOLD" });
  // Aggregation pipelines replace the Java loop-over-counts queries.
  const valueRows = await col("bill")
    .aggregate([
      { $match: { Req_ID: { $ne: null } } },
      { $group: { _id: null, total: { $sum: "$Bill_Amount" } } },
    ])
    .toArray();
  const valueSold = valueRows.length > 0 ? T.valueOf(valueRows[0].total) : 0;
  const openReports = await col("report").countDocuments({ Rep_Status: "OPEN" });
  const pendingVerifications = await col("student").countDocuments({ St_VerificationStatus: "PENDING" });
  const openFlags = await col("fraud_flag").countDocuments({ FF_Status: "OPEN" });
  const categoryRows = await col("item")
    .aggregate([
      { $match: { I_Status: { $ne: "REMOVED" } } },
      { $group: { _id: "$Cat_ID", count: { $sum: 1 } } },
      { $lookup: { from: "category", localField: "_id", foreignField: "Cat_ID", as: "category" } },
      { $unwind: "$category" },
      { $sort: { "category.Cat_ID": 1 } },
    ])
    .toArray();
  const byCategory = categoryRows.map((row) => ({ name: row.category.Cat_Name, count: row.count }));
  const statusRows = await col("item")
    .aggregate([{ $group: { _id: "$I_Status", count: { $sum: 1 } } }])
    .toArray();
  const statusCounts = new Map(statusRows.map((row) => [row._id, row.count]));
  const statuses = ["AVAILABLE", "BUY_REQUESTED", "ACCEPTED", "SOLD", "REMOVED"];
  const byStatus = statuses.map((status) => ({ name: status, count: statusCounts.get(status) || 0 }));
  return {
    students,
    items_on_sale: itemsOnSale,
    items_sold: itemsSold,
    value_sold: valueSold,
    open_reports: openReports,
    pending_verifications: pendingVerifications,
    open_flags: openFlags,
    by_category: byCategory,
    by_status: byStatus,
  };
}

async function users(request) {
  const q = request.s("q").toLowerCase();
  const rows = await col("student").find({}).sort({ U_ID: 1 }).toArray();
  const out = [];
  for (const s of rows) {
    const user = await col("users").findOne({ U_ID: s.U_ID });
    if (!user || user.U_Role !== "STUDENT") continue;
    const name = `${T.nz(user.U_FirstName)} ${T.nz(user.U_LastName)}`.trim();
    if (q && !(`${name} ${T.nz(user.U_Email)}`.toLowerCase().includes(q))) continue;
    out.push({
      user_id: user.U_ID,
      name,
      email: user.U_Email,
      is_active: T.truth(user.U_IsActive),
      verification_status: s.St_VerificationStatus,
      college_id: s.St_CollegeID,
      semester: T.valueOf(s.St_Semester),
    });
  }
  return out;
}

async function verifications() {
  const rows = await col("student").find({}).sort({ U_ID: 1 }).toArray();
  const pending = [];
  const verified = [];
  const rejected = [];
  for (const s of rows) {
    const user = await col("users").findOne({ U_ID: s.U_ID });
    if (!user || user.U_Role !== "STUDENT") continue;
    const st = await V.student(s.U_ID);
    if (!st) continue;
    const entry = V.studentJson(st);
    entry.name = `${T.nz(user.U_FirstName)} ${T.nz(user.U_LastName)}`.trim();
    entry.email = user.U_Email;
    if (st.verificationStatus === "PENDING") pending.push(entry);
    else if (st.verificationStatus === "VERIFIED") verified.push(entry);
    else rejected.push(entry);
  }
  return { pending, verified, rejected };
}

async function verifyStudent(request, session) {
  const userId = request.s("user_id");
  const st = await V.student(userId);
  if (!st) throw new T.ApiError("Student not found.");
  const status = request.s("status");
  if (status !== "VERIFIED" && status !== "REJECTED") throw new T.ApiError("Unknown status.");
  let remarks = T.trim(request.s("remarks"));
  if (status === "REJECTED" && !remarks) throw new T.ApiError("Add a remark so the student knows why.");
  if (remarks.length > 60) remarks = remarks.substring(0, 60);
  const decision = status === "VERIFIED" ? "APPROVED" : "REJECTED";
  await col("student").updateOne(
    { U_ID: userId },
    { $set: { St_VerificationStatus: status, St_VerificationMethod: "ADMIN", St_FlagReason: remarks ? remarks : null } }
  );
  const id = await nextId("verifies");
  await col("verifies").insertOne({
    _id: id,
    Ver_ID: id,
    Ver_On: T.today(),
    Ver_Decision: decision,
    Ver_Remarks: remarks ? remarks : null,
    Admin_U_ID: session.userId,
    Student_U_ID: userId,
  });
  await R.logAdmin(session.userId, status === "VERIFIED" ? "VERIFY" : "REVOKE", "STUDENT", userId, remarks);
  mail
    .notify(
      userId,
      status === "VERIFIED" ? "CampusKart: your ID card is verified" : "CampusKart: your ID card could not be verified",
      status === "VERIFIED"
        ? "You can now list items, send requests and rent on CampusKart."
        : `Your ID card was rejected. Reason: ${remarks}. Upload a clear card photo and try again.`
    )
    .catch(() => {});
  return ok();
}

async function reports() {
  const rows = await col("report").find({}).sort({ Rep_ID: -1 }).toArray();
  const out = [];
  for (const row of rows) {
    const item = await col("item").findOne({ I_ID: row.I_ID });
    const resolve = await col("resolves").findOne({ Rep_ID: row.Rep_ID });
    out.push({
      report_id: row.Rep_ID,
      reporter_id: row.U_ID,
      item_id: row.I_ID,
      reason: row.Rep_Reason,
      details: row.Rep_Details === undefined ? null : row.Rep_Details,
      reported_on: row.Rep_ReportedOn === undefined ? null : row.Rep_ReportedOn,
      status: row.Rep_Status,
      resolved_by: resolve ? resolve.U_ID : null,
      resolved_on: resolve ? (resolve.Res_On === undefined ? null : resolve.Res_On) : null,
      action_taken: resolve ? (resolve.Res_ActionTaken === undefined ? null : resolve.Res_ActionTaken) : null,
      item_name: item ? item.I_Name : "",
      item_status: item ? item.I_Status : "",
      seller_name: await V.userName(item ? item.U_ID : null),
      reporter_name: await V.userName(row.U_ID),
    });
  }
  return out;
}

async function resolveReport(request, session) {
  const reportId = request.s("report_id");
  const report = await col("report").findOne({ Rep_ID: reportId });
  if (!report || report.Rep_Status !== "OPEN") throw new T.ApiError("Report is not open.");
  const status = request.s("status");
  if (status !== "RESOLVED" && status !== "DISMISSED") throw new T.ApiError("Unknown status.");
  let action = T.trim(request.s("action_taken"));
  if (!action) throw new T.ApiError("Write the action taken.");
  if (action.length > 80) action = action.substring(0, 80);
  await col("report").updateOne({ Rep_ID: reportId }, { $set: { Rep_Status: status } });
  const id = await nextId("resolves");
  await col("resolves").insertOne({
    _id: id,
    Res_ID: id,
    Res_On: T.today(),
    Res_ActionTaken: action,
    U_ID: session.userId,
    Rep_ID: reportId,
  });
  await R.logAdmin(session.userId, "RESOLVE_REPORT", "REPORT", reportId, action);
  if (request.b("remove_item")) {
    const itemId = report.I_ID;
    const item = await V.itemById(itemId);
    if (item && item.bundleId) {
      const bundle = await V.bundleRow(item.bundleId);
      const bundleStatus = bundle ? bundle.Bun_Status : "";
      if (bundleStatus === "AVAILABLE" || bundleStatus === "REQUESTED") {
        await R.removeBundle(item.bundleId, "Item removed");
      }
    }
    if (item && item.status !== "REMOVED" && item.status !== "SOLD") {
      const fresh = await col("item").findOne({ I_ID: itemId });
      if (fresh && ["AVAILABLE", "BUY_REQUESTED", "ACCEPTED"].includes(fresh.I_Status)) {
        await R.moveItemStatus(fresh, "REMOVED");
      }
      await R.logAdmin(session.userId, "REMOVE_ITEM", "ITEM", itemId, action);
    }
  }
  return ok();
}

async function setActive(request, session) {
  const userId = request.s("user_id");
  const user = await col("users").findOne({ U_ID: userId });
  if (!user || user.U_Role === "ADMIN") throw new T.ApiError("User not found.");
  const active = request.b("is_active");
  await col("users").updateOne({ U_ID: userId }, { $set: { U_IsActive: active ? 1 : 0 } });
  await R.logAdmin(session.userId, active ? "UNBLOCK" : "BLOCK", "STUDENT", userId, "");
  return ok();
}

async function setSettings(request, session) {
  const banner = T.truth(request.raw("farewell_banner"));
  const result = await col("site_setting").updateOne(
    { Set_Key: "CLEAROUT_MODE" },
    { $set: { Set_Value: banner ? "1" : "0", Set_UpdatedOn: T.today(), U_ID: session.userId } }
  );
  if (result.matchedCount === 0) {
    await col("site_setting").insertOne({
      _id: "CLEAROUT_MODE",
      Set_Key: "CLEAROUT_MODE",
      Set_Value: banner ? "1" : "0",
      Set_UpdatedOn: T.today(),
      U_ID: session.userId,
    });
  }
  await R.logAdmin(session.userId, "SETTING_CHANGE", "SETTING", "CLEAROUT_MODE", banner ? "Farewell banner on" : "Farewell banner off");
  return A.settings();
}

async function fraudFlags() {
  const rows = await col("fraud_flag").find({}).sort({ FF_ID: -1 }).toArray();
  const out = [];
  for (const row of rows) {
    const user = await col("users").findOne({ U_ID: row.U_ID });
    const st = await col("student").findOne({ U_ID: row.U_ID });
    out.push({
      flag_id: row.FF_ID,
      student_id: row.U_ID,
      reason: row.FF_Reason,
      raised_on: row.FF_RaisedOn === undefined ? null : row.FF_RaisedOn,
      status: row.FF_Status,
      note: row.FF_Note === undefined ? null : row.FF_Note,
      reviewed_by: null,
      reviewed_on: null,
      student_name: await V.userName(row.U_ID),
      is_active: user ? T.truth(user.U_IsActive) : false,
      semester: st ? T.valueOf(st.St_Semester) : 0,
    });
  }
  return out;
}

async function reviewFlag(request, session) {
  const flagId = request.s("flag_id");
  const flag = await col("fraud_flag").findOne({ FF_ID: flagId });
  if (!flag || flag.FF_Status !== "OPEN") throw new T.ApiError("Flag is not open.");
  const action = request.s("action");
  let note = T.trim(request.s("note"));
  if (note.length > 150) note = note.substring(0, 150);
  await col("fraud_flag").updateOne(
    { FF_ID: flagId },
    { $set: { FF_Status: action === "BLOCK" ? "BLOCKED" : "CLEARED", FF_Note: note ? note : null } }
  );
  const id = await nextId("reviews_flag");
  await col("reviews_flag").insertOne({
    _id: id,
    Rv_ID: id,
    Rv_On: T.today(),
    Rv_Note: note ? note : null,
    U_ID: session.userId,
    FF_ID: flagId,
  });
  if (action === "BLOCK") {
    await col("users").updateOne({ U_ID: flag.U_ID }, { $set: { U_IsActive: 0 } });
    await R.logAdmin(session.userId, "BLOCK", "STUDENT", flag.U_ID, "Fraud flag " + flagId);
  }
  await R.logAdmin(session.userId, "REVIEW_FLAG", "FRAUD_FLAG", flagId, note ? note : (action === "BLOCK" ? "BLOCKED" : "CLEARED"));
  return ok();
}

async function activityLog() {
  const rows = await col("admin_activity").find({}).toArray();
  rows.sort((a, b) => {
    const at = String(a.AA_At || "");
    const bt = String(b.AA_At || "");
    if (at !== bt) return bt < at ? -1 : 1;
    return T.valueOf(b.AA_No) - T.valueOf(a.AA_No);
  });
  const out = [];
  for (const row of rows) {
    out.push({
      log_no: row.AA_No,
      admin_id: row.U_ID,
      admin_name: await V.userName(row.U_ID),
      action: row.AA_Action,
      target_type: row.AA_TargetType,
      target_id: row.AA_TargetID,
      performed_at: row.AA_At === undefined ? null : row.AA_At,
      remark: T.nz(row.AA_Remark),
    });
  }
  return out;
}

async function oversight() {
  const rentals = await V.rentalsActive();
  const rentalList = [];
  for (const rental of rentals) {
    const entry = await V.rentalJson(rental, null);
    entry.owner_name = await V.userName(rental.ownerId);
    const notes = await col("rental_booking").find({ RI_ID: rental.id, Bk_DamageNote: { $ne: null } }).sort({ Bk_ID: -1 }).toArray();
    const damage = [];
    for (const note of notes) {
      damage.push({
        booking_id: note.Bk_ID,
        renter_name: await V.userName(note.U_ID),
        note: note.Bk_DamageNote === undefined ? null : note.Bk_DamageNote,
        returned_on: note.Bk_ReturnedOn === undefined ? null : note.Bk_ReturnedOn,
      });
    }
    entry.damage_notes = damage;
    rentalList.push(entry);
  }
  const bundles = await col("bundle").find({ Bun_Status: { $in: ["AVAILABLE", "REQUESTED"] } }).sort({ Bun_ID: -1 }).toArray();
  const bundleList = [];
  for (const row of bundles) {
    const entry = await V.bundleJson(row, null);
    entry.seller_name = await V.userName(row.U_ID);
    bundleList.push(entry);
  }
  return { rentals: rentalList, bundles: bundleList };
}

async function removeRental(request, session) {
  const rentalId = request.s("rental_item_id");
  const rental = await V.rentalById(rentalId);
  if (!rental) throw new T.ApiError("Not found.");
  await col("rental_booking").updateMany({ RI_ID: rentalId, Bk_Status: "PENDING" }, { $set: { Bk_Status: "REJECTED" } });
  await col("rental_item").updateMany({ RI_ID: rentalId, RI_Status: { $ne: "ON_RENT" } }, { $set: { RI_Status: "REMOVED" } });
  await R.logAdmin(session.userId, "REMOVE_ITEM", "RENTAL_ITEM", rentalId, "Removed by admin");
  return ok();
}

async function removeBundle(request, session) {
  const bundleId = request.s("bundle_id");
  const bundle = await V.bundleRow(bundleId);
  if (!bundle) throw new T.ApiError("Not found.");
  await R.removeBundle(bundleId, "Removed by admin");
  await R.logAdmin(session.userId, "REMOVE_ITEM", "BUNDLE", bundleId, "Removed by admin");
  return ok();
}

const NAMES = [
  "adminOverview", "adminUsers", "adminVerifications", "verifyStudent", "adminReports", "resolveReport",
  "setActive", "setSettings", "fraudFlags", "reviewFlag", "activityLog", "adminOversight",
  "adminRemoveRental", "adminRemoveBundle",
];

async function handle(name, request, session) {
  await G.admin(session);
  switch (name) {
    case "adminOverview": return overview();
    case "adminUsers": return users(request);
    case "adminVerifications": return verifications();
    case "verifyStudent": return verifyStudent(request, session);
    case "adminReports": return reports();
    case "resolveReport": return resolveReport(request, session);
    case "setActive": return setActive(request, session);
    case "setSettings": return setSettings(request, session);
    case "fraudFlags": return fraudFlags();
    case "reviewFlag": return reviewFlag(request, session);
    case "activityLog": return activityLog();
    case "adminOversight": return oversight();
    case "adminRemoveRental": return removeRental(request, session);
    case "adminRemoveBundle": return removeBundle(request, session);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES };
