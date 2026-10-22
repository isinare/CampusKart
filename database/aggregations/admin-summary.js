#!/usr/bin/env node
/* One-page operational summary for the admin dashboard. */
const db = require("../../backend/db");

async function main() {
  await db.connect();
  const [
    users,
    verified,
    pendingVerification,
    availableItems,
    soldItems,
    openReports,
    openFraudFlags,
    activeRentals,
    unpaidBills,
  ] = await Promise.all([
    db.col("users").countDocuments({ U_IsActive: 1 }),
    db.col("student").countDocuments({ St_VerificationStatus: "VERIFIED" }),
    db.col("student").countDocuments({ St_VerificationStatus: "PENDING" }),
    db.col("item").countDocuments({ I_Status: "AVAILABLE" }),
    db.col("item").countDocuments({ I_Status: "SOLD" }),
    db.col("report").countDocuments({ Rep_Status: "OPEN" }),
    db.col("fraud_flag").countDocuments({ FF_Status: "OPEN" }),
    db.col("rental_booking").countDocuments({ Bk_Status: { $in: ["ACCEPTED", "HANDED_OVER"] } }),
    db.col("bill").countDocuments({ Bill_BuyerEmailedOn: null }),
  ]);

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        database: db.db().databaseName,
        active_users: users,
        verified_students: verified,
        pending_verifications: pendingVerification,
        available_listings: availableItems,
        sold_listings: soldItems,
        open_reports: openReports,
        open_fraud_flags: openFraudFlags,
        active_rentals: activeRentals,
        bills_without_buyer_email: unpaidBills,
      },
      null,
      2
    )
  );
  await db.close();
}

main().catch(async (e) => {
  console.error(e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
