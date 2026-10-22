#!/usr/bin/env node
/* Catalogue value by category. Run: node database/aggregations/category-stats.js */
const db = require("../../backend/db");

async function main() {
  await db.connect();
  const rows = await db.col("item").aggregate([
    { $match: { I_Status: { $in: ["AVAILABLE", "BUY_REQUESTED", "RESERVED", "ACCEPTED", "SOLD"] } } },
    {
      $group: {
        _id: "$Cat_ID",
        listings: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ["$I_Status", "AVAILABLE"] }, 1, 0] } },
        sold: { $sum: { $cond: [{ $eq: ["$I_Status", "SOLD"] }, 1, 0] } },
        average_price: { $avg: "$I_SellingPrice" },
        catalogue_value: { $sum: "$I_SellingPrice" },
      },
    },
    { $sort: { listings: -1, _id: 1 } },
    { $lookup: { from: "category", localField: "_id", foreignField: "Cat_ID", as: "category" } },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        category_id: "$_id",
        category: { $ifNull: ["$category.Cat_Name", "Unknown"] },
        listings: 1,
        available: 1,
        sold: 1,
        average_price: { $round: ["$average_price", 2] },
        catalogue_value: 1,
      },
    },
  ]).toArray();
  console.log(JSON.stringify(rows, null, 2));
  await db.close();
}

main().catch(async (e) => {
  console.error(e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
