const { col, nextId } = require("./db");
const C = require("./config");
const T = require("./util");
const V = require("./views");

/*
 * Business rules that the original database enforced with triggers and stored
 * procedures. MongoDB has no triggers, so the API layer applies the same rules
 * and writes the same audit rows (item status log, price history, ...).
 */

async function nextLogNo(itemId) {
  const rows = await col("item_status_log").find({ I_ID: itemId }, { projection: { Log_No: 1 } }).toArray();
  let max = 0;
  for (const row of rows) max = Math.max(max, T.valueOf(row.Log_No));
  return max + 1;
}

const STATUS_REMARKS = {
  BUY_REQUESTED: "Buy request received",
  ACCEPTED: "Request accepted",
  SOLD: "Handover done, item sold",
  REMOVED: "Removed by admin",
};

function validItemStatusChange(from, to) {
  if (from === to) return true;
  if (from === "AVAILABLE") return to === "BUY_REQUESTED" || to === "REMOVED";
  if (from === "BUY_REQUESTED") return to === "ACCEPTED" || to === "AVAILABLE" || to === "REMOVED";
  if (from === "ACCEPTED") return to === "SOLD" || to === "AVAILABLE" || to === "REMOVED";
  return false;
}

// Sets a new status only when the item is currently in `from` (mirrors the
// "UPDATE ... WHERE I_Status = 'from'" style used by the Java rules).
async function setItemStatusFrom(itemId, from, to) {
  const item = await col("item").findOne({ I_ID: itemId });
  if (!item || item.I_Status !== from) return false;
  await moveItemStatus(item, to);
  return true;
}

async function moveItemStatus(item, to) {
  const from = item.I_Status;
  if (from === to) return;
  if (!validItemStatusChange(from, to)) {
    throw new T.ApiError("Invalid item status change");
  }
  const patch = { I_Status: to };
  if ((to === "SOLD" || to === "REMOVED") && item.Bun_ID) {
    const bundle = await col("bundle").findOne({ Bun_ID: item.Bun_ID });
    if (!bundle || bundle.Bun_Status !== "SOLD") patch.Bun_ID = null;
  }
  await col("item").updateOne({ I_ID: item.I_ID }, { $set: patch });
  const no = await nextLogNo(item.I_ID);
  await col("item_status_log").insertOne({
    _id: await nextIdTracked("item_status_log"),
    Log_ID: lastGeneratedId,
    Log_No: no,
    Log_OldStatus: from,
    Log_NewStatus: to,
    Log_ChangedAt: T.now(),
    Log_Remark: STATUS_REMARKS[to] || "Back on sale",
    I_ID: item.I_ID,
    U_ID: null,
  });
}

// Small helper so the id we insert matches the returned nextId value.
let lastGeneratedId = null;
async function nextIdTracked(name) {
  lastGeneratedId = await nextId(name);
  return lastGeneratedId;
}

// Records a price edit exactly like trigger trg_item_au: any selling-price
// change writes a Price_History row with reason SELLER_EDIT.
async function recordPriceChange(itemId, oldPrice, newPrice) {
  if (oldPrice === newPrice) return;
  await col("price_history").insertOne({
    _id: await nextIdTracked("price_history"),
    PH_ID: lastGeneratedId,
    PH_OldPrice: oldPrice,
    PH_NewPrice: newPrice,
    PH_ChangedOn: T.today(),
    PH_Reason: "SELLER_EDIT",
    I_ID: itemId,
  });
}

// Applies a validated item edit (name/description/price/condition/pickup) and
// keeps the status log and price history in step with the database triggers.
async function updateItemFields(itemId, patch) {
  const item = await col("item").findOne({ I_ID: itemId });
  if (!item) throw new T.ApiError("Item not found.");
  if (patch.I_Description !== undefined && T.trim(patch.I_Description).length < 30) {
    throw new T.ApiError("The description must be at least 30 characters");
  }
  const nextPrice = patch.I_SellingPrice === undefined ? T.valueOf(item.I_SellingPrice) : T.valueOf(patch.I_SellingPrice);
  const original = T.valueOf(item.I_OriginalPrice);
  if (nextPrice <= 0 || nextPrice > original) {
    throw new T.ApiError("Selling price must be above 0 and not more than the original price");
  }
  if (patch.I_Status !== undefined && patch.I_Status !== item.I_Status) {
    if (!validItemStatusChange(item.I_Status, patch.I_Status)) {
      throw new T.ApiError("Invalid item status change");
    }
    const bun = patch.Bun_ID !== undefined ? patch.Bun_ID : item.Bun_ID;
    if ((patch.I_Status === "SOLD" || patch.I_Status === "REMOVED") && bun) {
      const bundle = await col("bundle").findOne({ Bun_ID: bun });
      if (!bundle || bundle.Bun_Status !== "SOLD") patch.Bun_ID = null;
    }
  }
  await col("item").updateOne({ I_ID: itemId }, { $set: patch });
  if (patch.I_Status !== undefined && patch.I_Status !== item.I_Status) {
    const no = await nextLogNo(itemId);
    await col("item_status_log").insertOne({
      _id: await nextIdTracked("item_status_log"),
      Log_ID: lastGeneratedId,
      Log_No: no,
      Log_OldStatus: item.I_Status,
      Log_NewStatus: patch.I_Status,
      Log_ChangedAt: T.now(),
      Log_Remark: STATUS_REMARKS[patch.I_Status] || "Back on sale",
      I_ID: itemId,
      U_ID: null,
    });
  }
  if (patch.I_SellingPrice !== undefined) {
    await recordPriceChange(itemId, T.valueOf(item.I_SellingPrice), nextPrice);
  }
}

async function releaseTarget(itemId, bundleId) {
  if (itemId !== null && itemId !== undefined && itemId !== "") {
    const open = await col("buy_request").countDocuments({
      I_ID: itemId,
      Req_Status: { $in: ["PENDING", "COUNTERED"] },
    });
    if (open === 0) {
      const item = await col("item").findOne({ I_ID: itemId });
      if (item && item.I_Status === "BUY_REQUESTED") await moveItemStatus(item, "AVAILABLE");
    }
  } else if (bundleId !== null && bundleId !== undefined && bundleId !== "") {
    const open = await col("buy_request").countDocuments({
      Bun_ID: bundleId,
      Req_Status: { $in: ["PENDING", "COUNTERED", "ACCEPTED"] },
    });
    if (open === 0) {
      await col("bundle").updateOne(
        { Bun_ID: bundleId, Bun_Status: "REQUESTED" },
        { $set: { Bun_Status: "AVAILABLE" } }
      );
    }
  }
}

async function logAdmin(adminId, action, targetType, targetId, remark) {
  const admin = await col("admin").findOne({ U_ID: adminId });
  if (!admin) throw new T.ApiError("Only an admin can do this");
  const rows = await col("admin_activity").find({ U_ID: adminId }, { projection: { AA_No: 1 } }).toArray();
  let max = 0;
  for (const row of rows) max = Math.max(max, T.valueOf(row.AA_No));
  await col("admin_activity").insertOne({
    _id: await nextIdTracked("admin_activity"),
    AA_ID: lastGeneratedId,
    AA_No: max + 1,
    AA_Action: action,
    AA_TargetType: targetType,
    AA_TargetID: T.nz(targetId),
    AA_At: T.now(),
    AA_Remark: T.trim(remark),
    U_ID: adminId,
  });
}

async function raiseFlag(studentId, reason) {
  const open = await col("fraud_flag").countDocuments({ U_ID: studentId, FF_Reason: reason, FF_Status: "OPEN" });
  if (open === 0) {
    await col("fraud_flag").insertOne({
      _id: await nextIdTracked("fraud_flag"),
      FF_ID: lastGeneratedId,
      FF_Reason: reason,
      FF_RaisedOn: T.today(),
      FF_Status: "OPEN",
      U_ID: studentId,
    });
  }
}

async function checkFraud(studentId) {
  const reports = await col("report").aggregate([
    { $match: { Rep_Status: "OPEN" } },
    { $lookup: { from: "item", localField: "I_ID", foreignField: "I_ID", as: "i" } },
    { $unwind: "$i" },
    { $match: { "i.U_ID": studentId } },
    { $count: "n" },
  ]).toArray();
  if ((reports.length ? reports[0].n : 0) >= 3) await raiseFlag(studentId, "REPEATED_REPORTS");

  const cut = T.addDays(T.today(), -30) + " 00:00:00";
  const rejected = await col("buy_request").countDocuments({
    U_ID: studentId,
    Req_Status: "REJECTED",
    Req_RequestedOn: { $gte: cut },
  });
  if (rejected >= 5) await raiseFlag(studentId, "MANY_REJECTIONS");

  const items = await col("item").find({ U_ID: studentId, I_Status: "AVAILABLE" }).toArray();
  for (const item of items) {
    const original = T.valueOf(item.I_OriginalPrice);
    const selling = T.valueOf(item.I_SellingPrice);
    const general = await col("general_item").findOne({ I_ID: item.I_ID });
    const age = general ? T.valueOf(general.GI_AgeInMonths) : 0;
    const fair = V.fairPrice(original, item.I_Condition, age);
    if (original > 0 && selling > T.valueOf(fair.high)) {
      await raiseFlag(studentId, "PRICE_ABOVE_GUIDE");
      break;
    }
  }
}

// The Java code walks AVAILABLE -> BUY_REQUESTED -> ACCEPTED -> SOLD with three
// conditional updates, so each real transition leaves its own status-log row.
async function sellItem(itemId) {
  await setItemStatusFrom(itemId, "AVAILABLE", "BUY_REQUESTED");
  await setItemStatusFrom(itemId, "BUY_REQUESTED", "ACCEPTED");
  await setItemStatusFrom(itemId, "ACCEPTED", "SOLD");
}

async function expire() {
  const today = T.today();
  const stale = await col("buy_request").find({
    Req_Status: { $in: ["PENDING", "COUNTERED"] },
    Req_ExpiresOn: { $lt: today },
  }).toArray();
  for (const request of stale) {
    await col("buy_request").updateOne({ Req_ID: request.Req_ID }, { $set: { Req_Status: "EXPIRED" } });
    await releaseTarget(request.I_ID, request.Bun_ID);
  }
  return stale.length;
}

async function removeBundle(bundleId, remark) {
  await col("buy_request").updateMany(
    { Bun_ID: bundleId, Req_Status: { $in: ["PENDING", "COUNTERED"] } },
    { $set: { Req_Status: "REJECTED", Req_DecidedOn: T.now() } }
  );
  await col("item").updateMany({ Bun_ID: bundleId }, { $set: { Bun_ID: null } });
  await col("bundle").updateOne({ Bun_ID: bundleId }, { $set: { Bun_Status: "REMOVED" } });
}

async function runSweep() {
  return expire();
}

module.exports = {
  releaseTarget,
  logAdmin,
  raiseFlag,
  checkFraud,
  sellItem,
  expire,
  removeBundle,
  runSweep,
  moveItemStatus,
  setItemStatusFrom,
  updateItemFields,
  recordPriceChange,
  nextLogNo,
};
