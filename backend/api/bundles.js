const { col, nextId } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const R = require("../rules");
const G = require("./guard");
const { ok } = require("../resp");

async function viewer(session) {
  return session ? V.student(session.userId) : null;
}

function bundleText(bundle) {
  let text = T.nz(bundle.bundle_name);
  for (const item of bundle.items || []) text += " " + T.nz(item.item_name);
  return text;
}

async function listBundles(request, session) {
  await R.runSweep();
  const me = await viewer(session);
  const q = request.s("q").toLowerCase();
  const rows = await col("bundle").find({ Bun_Status: { $in: ["AVAILABLE", "REQUESTED"] } }).sort({ Bun_ID: -1 }).toArray();
  const out = [];
  for (const row of rows) {
    const bundle = await V.bundleJson(row, me);
    if (!q || bundleText(bundle).toLowerCase().includes(q)) out.push(bundle);
  }
  return V.pageOf(out, request.i("page", 1), C.pageSize);
}

async function getBundle(request, session) {
  await R.runSweep();
  const me = await viewer(session);
  const bundleId = request.s("bundle_id");
  const row = await V.bundleRow(bundleId);
  if (!row) throw new T.ApiError("Bundle not found.");
  const json = await V.bundleJson(row, me);
  let requestJson = null;
  if (session) {
    const mine = await col("buy_request").findOne({ Bun_ID: bundleId, U_ID: session.userId }, { sort: { Req_ID: -1 } });
    if (mine) {
      requestJson = await V.requestJson(mine, session.userId, false);
      if (!(mine.Req_Status === "ACCEPTED" && row.Bun_Status !== "SOLD")) requestJson.pass = null;
    }
  }
  return { bundle: json, my_request: requestJson };
}

async function createBundle(request, session) {
  const me = await G.student(session);
  if (me.verificationStatus !== "VERIFIED") {
    throw new T.ApiError("Only a verified student can create a bundle");
  }
  let name = T.trim(request.s("bundle_name"));
  if (!name) throw new T.ApiError("Give the bundle a name.");
  const ids = request.stringList("item_ids");
  if (ids.length < 2) throw new T.ApiError("A bundle needs at least 2 items.");
  const items = [];
  for (const id of ids) {
    const item = await V.itemById(id);
    if (!item || item.ownerId !== me.userId || item.status !== "AVAILABLE" || item.bundleId) {
      throw new T.ApiError("Bundles can only hold your own available items that are not already in a bundle.");
    }
    if (item.kind !== "ACADEMIC") {
      throw new T.ApiError("Only academic items can go in a bundle");
    }
    items.push(item);
  }
  const bundleId = await nextId("bundle");
  if (name.length > 60) name = name.substring(0, 60);
  await col("bundle").insertOne({
    _id: bundleId,
    Bun_ID: bundleId,
    Bun_Name: name,
    Bun_DiscountPercent: C.bundleDiscount,
    Bun_Status: "AVAILABLE",
    Bun_CreatedOn: T.today(),
    U_ID: me.userId,
  });
  for (const item of items) {
    await col("item").updateOne({ I_ID: item.id, I_Status: "AVAILABLE" }, { $set: { Bun_ID: bundleId } });
  }
  return { bundle_id: bundleId };
}

async function myBundles(session) {
  const me = await G.student(session);
  await R.runSweep();
  const rows = await col("bundle").find({ U_ID: me.userId }).sort({ Bun_ID: -1 }).toArray();
  const out = [];
  for (const row of rows) out.push(await V.bundleJson(row, me));
  return out;
}

async function withdrawBundle(request, session) {
  const me = await G.student(session);
  const bundleId = request.s("bundle_id");
  const bundle = await V.bundleRow(bundleId);
  if (!bundle || bundle.U_ID !== me.userId) throw new T.ApiError("Not your bundle.");
  const status = bundle.Bun_Status;
  if (status !== "AVAILABLE" && status !== "REQUESTED") {
    throw new T.ApiError("This bundle can no longer be withdrawn.");
  }
  if ((await col("buy_request").countDocuments({ Bun_ID: bundleId, Req_Status: "ACCEPTED" })) > 0) {
    throw new T.ApiError("A buyer is already coming for this bundle.");
  }
  await R.removeBundle(bundleId, "Withdrawn");
  return ok();
}

const NAMES = ["listBundles", "getBundle", "createBundle", "myBundles", "withdrawBundle"];

async function handle(name, request, session) {
  switch (name) {
    case "listBundles": return listBundles(request, session);
    case "getBundle": return getBundle(request, session);
    case "createBundle": return createBundle(request, session);
    case "myBundles": return myBundles(session);
    case "withdrawBundle": return withdrawBundle(request, session);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES };
