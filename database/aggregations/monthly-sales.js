#!/usr/bin/env node
/* Monthly bill totals. Works on the original YYYY-MM-DD HH:MM:SS strings. */
const db = require("../../backend/db");

async function main() {
  await db.connect();
  const rows = await db.col("bill").aggregate([
    {
      $group: {
        _id: { $substrBytes: ["$Bill_IssuedOn", 0, 7] },
        bills: { $sum: 1 },
        revenue: { $sum: "$Bill_Amount" },
        deposits: { $sum: { $ifNull: ["$Bill_Deposit", 0] } },
        average_bill: { $avg: "$Bill_Amount" },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        month: "$_id",
        bills: 1,
        revenue: 1,
        deposits: 1,
        average_bill: { $round: ["$average_bill", 2] },
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
