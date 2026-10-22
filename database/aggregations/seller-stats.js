#!/usr/bin/env node
/* Seller performance: listings, sold count and realised value. */
const db = require("../../backend/db");

async function main() {
  await db.connect();
  const rows = await db.col("item").aggregate([
    {
      $group: {
        _id: "$U_ID",
        listings: { $sum: 1 },
        sold: { $sum: { $cond: [{ $eq: ["$I_Status", "SOLD"] }, 1, 0] } },
        available: { $sum: { $cond: [{ $eq: ["$I_Status", "AVAILABLE"] }, 1, 0] } },
        listed_value: { $sum: "$I_SellingPrice" },
      },
    },
    { $lookup: { from: "users", localField: "_id", foreignField: "U_ID", as: "user" } },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        user_id: "$_id",
        name: { $concat: ["$user.U_FirstName", " ", "$user.U_LastName"] },
        email: "$user.U_Email",
        listings: 1,
        sold: 1,
        available: 1,
        listed_value: 1,
        sell_through_percent: {
          $cond: [{ $gt: ["$listings", 0] }, { $round: [{ $multiply: [{ $divide: ["$sold", "$listings"] }, 100] }, 1] }, 0],
        },
      },
    },
    { $sort: { sold: -1, listings: -1, name: 1 } },
  ]).toArray();
  console.log(JSON.stringify(rows, null, 2));
  await db.close();
}

main().catch(async (e) => {
  console.error(e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
