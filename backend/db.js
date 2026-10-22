const { MongoClient } = require("mongodb");
const config = require("./config");

// Every original database table keeps its name (lower-case) and every column keeps
// its original name. The primary key is also stored once as the document _id.
const COLLECTIONS = {
  branch: { collection: "branch", pk: "Br_ID", prefix: "B", skip: 1 },
  institute: { collection: "institute", pk: "Ins_ID", prefix: "IN", skip: 2 },
  category: { collection: "category", pk: "Cat_ID", prefix: "CA", skip: 2 },
  subject: { collection: "subject", pk: "Sub_ID", prefix: "S", skip: 1 },
  users: { collection: "users", pk: "U_ID", prefix: "U", skip: 1 },
  user_phone: { collection: "user_phone", pk: "UP_ID", prefix: "UP", skip: 2 },
  admin: { collection: "admin", pk: "U_ID" },
  student: { collection: "student", pk: "U_ID" },
  taught_in: { collection: "taught_in", pk: "TI_ID", prefix: "TI", skip: 2 },
  bundle: { collection: "bundle", pk: "Bun_ID", prefix: "BN", skip: 2 },
  item: { collection: "item", pk: "I_ID", prefix: "I", skip: 1 },
  academic_item: { collection: "academic_item", pk: "I_ID" },
  general_item: { collection: "general_item", pk: "I_ID" },
  item_image: { collection: "item_image", pk: "Img_ID", prefix: "IM", skip: 2 },
  item_status_log: { collection: "item_status_log", pk: "Log_ID", prefix: "LG", skip: 2 },
  wishlist: { collection: "wishlist", pk: "W_ID", prefix: "W", skip: 1 },
  wish_match: { collection: "wish_match", pk: "WM_ID", prefix: "WM", skip: 2 },
  item_recommendation: { collection: "item_recommendation", pk: "IR_ID", prefix: "IR", skip: 2 },
  buy_request: { collection: "buy_request", pk: "Req_ID", prefix: "RQ", skip: 2 },
  rating: { collection: "rating", pk: "Rat_ID", prefix: "RT", skip: 2 },
  report: { collection: "report", pk: "Rep_ID", prefix: "RP", skip: 2 },
  verifies: { collection: "verifies", pk: "Ver_ID", prefix: "V", skip: 1 },
  resolves: { collection: "resolves", pk: "Res_ID", prefix: "RS", skip: 2 },
  rental_item: { collection: "rental_item", pk: "RI_ID", prefix: "RI", skip: 2 },
  rental_image: { collection: "rental_image", pk: "RImg_ID", prefix: "RM", skip: 2 },
  rental_booking: { collection: "rental_booking", pk: "Bk_ID", prefix: "BK", skip: 2 },
  bill: { collection: "bill", pk: "Bill_ID", prefix: "BL", skip: 2 },
  fraud_flag: { collection: "fraud_flag", pk: "FF_ID", prefix: "FF", skip: 2 },
  reviews_flag: { collection: "reviews_flag", pk: "Rv_ID", prefix: "RV", skip: 2 },
  admin_activity: { collection: "admin_activity", pk: "AA_ID", prefix: "AA", skip: 2 },
  price_history: { collection: "price_history", pk: "PH_ID", prefix: "PH", skip: 2 },
  site_setting: { collection: "site_setting", pk: "Set_Key" },
  notice: { collection: "notice", pk: "N_ID", prefix: "N", skip: 1 },
};

let client = null;
let database = null;

async function connect() {
  if (database) return database;
  client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  database = client.db(config.dbName);
  await database.command({ ping: 1 });
  await ensureCounters();
  return database;
}

async function ping() {
  await database.command({ ping: 1 });
}

function db() {
  if (!database) throw new Error("MongoDB is not connected yet.");
  return database;
}

const col = (name) => db().collection(name);

function spec(name) {
  const s = COLLECTIONS[name];
  if (!s) throw new Error("Unknown collection: " + name);
  return s;
}

// Counters hold the highest number already used for each generated id, so new ids
// keep the same shape as the SQL functions (U103 -> U104, I111 -> I112, ...).
async function ensureCounters() {
  for (const [name, s] of Object.entries(COLLECTIONS)) {
    if (!s.prefix) continue;
    const rows = await col(s.collection).find({}, { projection: { [s.pk]: 1 } }).toArray();
    let max = 100;
    for (const row of rows) {
      const raw = String(row[s.pk] || "");
      const number = parseInt(raw.slice(s.skip), 10);
      if (!Number.isNaN(number) && number > max) max = number;
    }
    await col("counters").updateOne({ _id: name }, { $max: { value: max } }, { upsert: true });
  }
  const billNos = await col("bill").find({}, { projection: { Bill_No: 1 } }).toArray();
  const year = new Date().getFullYear();
  let maxBill = 0;
  for (const row of billNos) {
    const match = String(row.Bill_No || "").match(/^CK-(\d{4})-(\d+)$/);
    if (match && Number(match[1]) === year) maxBill = Math.max(maxBill, Number(match[2]));
  }
  await col("counters").updateOne({ _id: "bill_no:" + year }, { $max: { value: maxBill } }, { upsert: true });
}

// Older MongoDB driver versions wrapped the modified document in a { value: doc }
// envelope; current versions return the document itself. Unwrap only the envelope.
function counterDoc(result) {
  if (result && typeof result === "object" && result.value && typeof result.value === "object") {
    return result.value;
  }
  return result;
}

async function nextId(name) {
  const s = spec(name);
  if (!s.prefix) throw new Error("Collection has no generated id: " + name);
  const result = await col("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return s.prefix + counterDoc(result).value;
}

async function nextBillNo() {
  const year = new Date().getFullYear();
  const key = "bill_no:" + year;
  const result = await col("counters").findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return `CK-${year}-${String(counterDoc(result).value).padStart(4, "0")}`;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}

module.exports = { connect, ping, db, col, spec, nextId, nextBillNo, close, ensureCounters, COLLECTIONS };
