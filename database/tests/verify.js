#!/usr/bin/env node
/*
 * Data-integrity checks for the seeded MongoDB database.
 * Exit code 0 means every count and relationship matched database/seed.json.
 */
const fs = require("fs");
const path = require("path");
const db = require("../../backend/db");

const SEED_FILE = path.resolve(process.env.SEED_FILE || path.join(__dirname, "..", "seed.json"));
let pass = 0;
let fail = 0;

function check(name, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " - " + detail : ""}`);
  }
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  await db.connect();

  for (const [name, rows] of Object.entries(seed.collections || {})) {
    const actual = await db.col(name).countDocuments();
    check(`count ${name} = ${rows.length}`, actual === rows.length, `found ${actual}`);
  }

  const userIds = new Set((await db.col("users").distinct("U_ID")));
  const listedItemIds = new Set((await db.col("item").distinct("I_ID")));
  const categoryIds = new Set((await db.col("category").distinct("Cat_ID")));
  const subjectIds = new Set((await db.col("subject").distinct("Sub_ID")));
  const bundleIds = new Set((await db.col("bundle").distinct("Bun_ID")));
  const rentalIds = new Set((await db.col("rental_item").distinct("RI_ID")));
  const requestIds = new Set((await db.col("buy_request").distinct("Req_ID")));
  const bookingIds = new Set((await db.col("rental_booking").distinct("Bk_ID")));
  const billIds = new Set((await db.col("bill").distinct("Bill_ID")));

  const badSellers = await db.col("item").countDocuments({ U_ID: { $nin: [...userIds] } });
  check("every item has an existing seller", badSellers === 0, `${badSellers} orphan(s)`);

  const badCategories = await db.col("item").countDocuments({ Cat_ID: { $nin: [...categoryIds] } });
  check("every item has an existing category", badCategories === 0, `${badCategories} orphan(s)`);

  const badSubjects = await db.col("academic_item").countDocuments({ Sub_ID: { $nin: [...subjectIds] } });
  check("every academic item has an existing subject", badSubjects === 0, `${badSubjects} orphan(s)`);

  const badBundles = await db.col("item").countDocuments({ Bun_ID: { $ne: null, $nin: [...bundleIds] } });
  check("every bundle reference is valid", badBundles === 0, `${badBundles} orphan(s)`);

  const badRequests = await db.col("buy_request").countDocuments({
    $or: [
      { I_ID: { $ne: null, $nin: [...listedItemIds] } },
      { Bun_ID: { $ne: null, $nin: [...bundleIds] } },
    ],
  });
  check("every request points at a real item or bundle", badRequests === 0, `${badRequests} orphan(s)`);

  const badBookings = await db.col("rental_booking").countDocuments({ RI_ID: { $nin: [...rentalIds] } });
  check("every booking points at a real rental item", badBookings === 0, `${badBookings} orphan(s)`);

  const badBills = await db.col("bill").countDocuments({
    $or: [
      { Req_ID: { $ne: null, $nin: [...requestIds] } },
      { Bk_ID: { $ne: null, $nin: [...bookingIds] } },
    ],
  });
  check("every bill points at a known source (request or booking id)", badBills === 0, `${badBills} orphan(s)`);

  const badRatings = await db.col("rating").countDocuments({ Req_ID: { $nin: [...requestIds] } });
  check("every rating points at a known request", badRatings === 0, `${badRatings} orphan(s)`);

  const duplicateEmails = await db.col("users").aggregate([
    { $group: { _id: { $toLower: "$U_Email" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  check("e-mail addresses are unique", duplicateEmails.length === 0, `${duplicateEmails.length} duplicate(s)`);

  check("at least one bill exists", billIds.size > 0);

  const indexCount = (await db.col("item").indexes()).length;
  check("item collection has indexes", indexCount > 1, `${indexCount} index(es)`);

  console.log(`\n${pass} checks passed, ${fail} failed`);
  await db.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Verification failed:", e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
