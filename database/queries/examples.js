#!/usr/bin/env node
/*
 * MongoDB query examples used in the report/viva.
 * The read queries use the real seeded data. The write example uses a temporary
 * collection and removes it again, so running this never changes CampusKart.
 */
const db = require("../../backend/db");

async function main() {
  await db.connect();

  const cheapest = await db.col("item")
    .find({ I_Status: "AVAILABLE" }, { projection: { I_ID: 1, I_Name: 1, I_SellingPrice: 1, U_ID: 1 } })
    .sort({ I_SellingPrice: 1 })
    .limit(5)
    .toArray();
  console.log("1. Cheapest available listings");
  console.table(cheapest);

  const bySubject = await db.col("academic_item").aggregate([
    { $group: { _id: "$Sub_ID", items: { $sum: 1 } } },
    { $lookup: { from: "subject", localField: "_id", foreignField: "Sub_ID", as: "subject" } },
    { $unwind: "$subject" },
    { $project: { _id: 0, subject: "$subject.Sub_Name", items: 1 } },
    { $sort: { items: -1 } },
  ]).toArray();
  console.log("2. Academic listings by subject");
  console.table(bySubject);

  const requestTimeline = await db.col("buy_request")
    .find({}, { projection: { Req_ID: 1, Req_Status: 1, Req_RequestedOn: 1, I_ID: 1 } })
    .sort({ Req_RequestedOn: -1 })
    .limit(5)
    .toArray();
  console.log("3. Latest requests");
  console.table(requestTimeline);

  const demo = db.col("demo_notes");
  await demo.deleteMany({});
  await demo.insertOne({ _id: "demo-1", text: "temporary write example", created_at: new Date().toISOString() });
  await demo.updateOne({ _id: "demo-1" }, { $set: { reviewed: true } });
  const written = await demo.findOne({ _id: "demo-1" });
  console.log("4. Insert + update + find", written);
  await demo.drop();
  console.log("Temporary collection removed.");

  await db.close();
}

main().catch(async (e) => {
  console.error(e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
