#!/usr/bin/env node
/* Rental utilisation and deposit exposure by booking status. */
const db = require("../../backend/db");

async function main() {
  await db.connect();
  const rows = await db.col("rental_booking").aggregate([
    {
      $addFields: {
        days: {
          $max: [
            1,
            {
              $dateDiff: {
                startDate: { $dateFromString: { dateString: "$Bk_StartDate" } },
                endDate: { $dateFromString: { dateString: "$Bk_EndDate" } },
                unit: "day",
              },
            },
          ],
        },
      },
    },
    { $lookup: { from: "rental_item", localField: "RI_ID", foreignField: "RI_ID", as: "rental" } },
    { $unwind: { path: "$rental", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$Bk_Status",
        bookings: { $sum: 1 },
        booked_days: { $sum: "$days" },
        estimated_rent: { $sum: { $multiply: ["$days", { $ifNull: ["$rental.RI_RatePerDay", 0] }] } },
        deposit_exposure: { $sum: { $ifNull: ["$rental.RI_Deposit", 0] } },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        status: "$_id",
        bookings: 1,
        booked_days: 1,
        estimated_rent: 1,
        deposit_exposure: 1,
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
