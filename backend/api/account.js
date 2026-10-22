const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { col } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const R = require("../rules");
const G = require("./guard");
const sessions = require("../sessions");
const { Resp } = require("../resp");

// Same three helper SQL-fragments used by the Java implementation.
async function myRequestFilter(userId) {
  const itemIds = (await col("item").find({ U_ID: userId }, { projection: { I_ID: 1 } }).toArray()).map((r) => r.I_ID);
  const bundleIds = (await col("bundle").find({ U_ID: userId }, { projection: { Bun_ID: 1 } }).toArray()).map((r) => r.Bun_ID);
  return { $or: [{ U_ID: userId }, { I_ID: { $in: itemIds } }, { Bun_ID: { $in: bundleIds } }] };
}

async function myBookingFilter(userId) {
  const rentalIds = (await col("rental_item").find({ U_ID: userId }, { projection: { RI_ID: 1 } }).toArray()).map((r) => r.RI_ID);
  return { $or: [{ U_ID: userId }, { RI_ID: { $in: rentalIds } }] };
}

async function openRequestFilter() {
  const billed = (await col("bill").find({ Req_ID: { $ne: null } }, { projection: { Req_ID: 1 } }).toArray()).map((r) => r.Req_ID);
  return {
    $or: [
      { Req_Status: { $in: ["PENDING", "COUNTERED"] } },
      { Req_Status: "ACCEPTED", Req_ID: { $nin: billed } },
    ],
  };
}

async function closing(userId) {
  const listingItems = await col("item").find({ U_ID: userId, I_Status: { $in: ["AVAILABLE", "BUY_REQUESTED", "ACCEPTED"] } }).toArray();
  const listingBundles = await col("bundle").find({ U_ID: userId, Bun_Status: { $in: ["AVAILABLE", "REQUESTED"] } }).toArray();
  const rentalItems = await col("rental_item").find({ U_ID: userId, RI_Status: { $in: ["AVAILABLE", "ON_RENT"] } }).toArray();
  const reqFilter = await myRequestFilter(userId);
  const openFilter = await openRequestFilter();
  const requests = await col("buy_request").find({ $and: [reqFilter, openFilter] }).toArray();
  const bookFilter = await myBookingFilter(userId);
  const bookings = await col("rental_booking").find({
    $and: [bookFilter, { Bk_Status: { $in: ["PENDING", "ACCEPTED", "HANDED_OVER"] } }],
  }).toArray();
  return {
    listings: listingItems.length,
    bundles: listingBundles.length,
    rentals: rentalItems.length,
    requests: requests.length,
    bookings: bookings.length,
  };
}

async function erasing(userId) {
  const billed = (await col("bill").find({ Req_ID: { $ne: null } }, { projection: { Req_ID: 1 } }).toArray()).map((r) => r.Req_ID);
  const rated = (await col("rating").find({}, { projection: { Req_ID: 1 } }).toArray()).map((r) => r.Req_ID);
  const offers = await col("buy_request").find({ U_ID: userId, Req_ID: { $nin: billed.concat(rated) } }).toArray();
  return {
    phone_numbers: await col("user_phone").countDocuments({ U_ID: userId }),
    wishes: await col("wishlist").countDocuments({ U_ID: userId }),
    recommendations: await col("item_recommendation").countDocuments({ U_ID: userId }),
    verification_records: await col("verifies").countDocuments({ Student_U_ID: userId }),
    reports: await col("report").countDocuments({ U_ID: userId }),
    flags: await col("fraud_flag").countDocuments({ U_ID: userId }),
    offers: offers.length,
  };
}

async function history(userId) {
  return (
    (await col("item").countDocuments({ U_ID: userId })) +
    (await col("bundle").countDocuments({ U_ID: userId })) +
    (await col("buy_request").countDocuments({ U_ID: userId })) +
    (await col("rental_item").countDocuments({ U_ID: userId })) +
    (await col("rental_booking").countDocuments({ U_ID: userId })) +
    (await col("report").countDocuments({ U_ID: userId })) +
    (await col("fraud_flag").countDocuments({ U_ID: userId })) +
    (await col("verifies").countDocuments({ Student_U_ID: userId })) +
    (await col("item_status_log").countDocuments({ U_ID: userId }))
  );
}

async function accountImpact(session) {
  const me = await G.user(session);
  const userId = me.userId;
  return {
    allowed: me.role !== "ADMIN",
    real_delete: (await history(userId)) === 0,
    closing: await closing(userId),
    erasing: await erasing(userId),
  };
}

async function closeActivity(userId) {
  const closed = {};
  const bookFilter = await myBookingFilter(userId);
  const handedOver = await col("rental_booking").find({
    $and: [bookFilter, { Bk_Status: "HANDED_OVER" }],
  }).toArray();
  for (const booking of handedOver) {
    await col("rental_booking").updateOne({ Bk_ID: booking.Bk_ID }, { $set: { Bk_Status: "RETURNED", Bk_ReturnedOn: T.now() } });
  }
  const cancellable = await col("rental_booking").find({
    $and: [bookFilter, { Bk_Status: { $in: ["PENDING", "ACCEPTED"] } }],
  }).toArray();
  for (const booking of cancellable) {
    await col("rental_booking").updateOne({ Bk_ID: booking.Bk_ID }, { $set: { Bk_Status: "CANCELLED" } });
  }
  closed.bookings = handedOver.length + cancellable.length;

  const reqFilter = await myRequestFilter(userId);
  const openFilter = await openRequestFilter();
  const openRequests = await col("buy_request").find({ $and: [reqFilter, openFilter] }).toArray();
  for (const request of openRequests) {
    await col("buy_request").updateOne({ Req_ID: request.Req_ID }, { $set: { Req_Status: "CANCELLED", Req_DecidedOn: T.now() } });
  }
  closed.requests = openRequests.length;

  const myRentals = await col("rental_item").find({ U_ID: userId, RI_Status: { $in: ["AVAILABLE", "ON_RENT"] } }).toArray();
  for (const rental of myRentals) {
    await col("rental_item").updateOne({ RI_ID: rental.RI_ID }, { $set: { RI_Status: "REMOVED" } });
  }
  closed.rentals = myRentals.length;

  const myBundles = await col("bundle").find({ U_ID: userId, Bun_Status: { $in: ["AVAILABLE", "REQUESTED"] } }).toArray();
  for (const bundle of myBundles) {
    await col("bundle").updateOne({ Bun_ID: bundle.Bun_ID }, { $set: { Bun_Status: "REMOVED" } });
  }
  closed.bundles = myBundles.length;

  const myItems = await col("item").find({ U_ID: userId, I_Status: { $in: ["AVAILABLE", "BUY_REQUESTED", "ACCEPTED"] } }).toArray();
  for (const item of myItems) {
    const fresh = await col("item").findOne({ I_ID: item.I_ID });
    if (fresh && ["AVAILABLE", "BUY_REQUESTED", "ACCEPTED"].includes(fresh.I_Status)) {
      await R.moveItemStatus(fresh, "REMOVED");
    }
  }
  closed.listings = myItems.length;
  return closed;
}

async function erase(userId) {
  const erased = {};
  erased.recommendations = (await col("item_recommendation").deleteMany({ U_ID: userId })).deletedCount;
  const wishes = await col("wishlist").find({ U_ID: userId }, { projection: { W_ID: 1 } }).toArray();
  await col("wish_match").deleteMany({ W_ID: { $in: wishes.map((w) => w.W_ID) } });
  erased.wishes = (await col("wishlist").deleteMany({ U_ID: userId })).deletedCount;
  erased.phone_numbers = (await col("user_phone").deleteMany({ U_ID: userId })).deletedCount;
  const flags = await col("fraud_flag").find({ U_ID: userId }, { projection: { FF_ID: 1 } }).toArray();
  await col("reviews_flag").deleteMany({ FF_ID: { $in: flags.map((f) => f.FF_ID) } });
  erased.flags = (await col("fraud_flag").deleteMany({ U_ID: userId })).deletedCount;
  erased.verification_records = (await col("verifies").deleteMany({ Student_U_ID: userId })).deletedCount;
  const reports = await col("report").find({ U_ID: userId }, { projection: { Rep_ID: 1 } }).toArray();
  await col("resolves").deleteMany({ Rep_ID: { $in: reports.map((r) => r.Rep_ID) } });
  erased.reports = (await col("report").deleteMany({ U_ID: userId })).deletedCount;
  const billed = (await col("bill").find({ Req_ID: { $ne: null } }, { projection: { Req_ID: 1 } }).toArray()).map((r) => r.Req_ID);
  const rated = (await col("rating").find({}, { projection: { Req_ID: 1 } }).toArray()).map((r) => r.Req_ID);
  erased.offers = (await col("buy_request").deleteMany({ U_ID: userId, Req_ID: { $nin: billed.concat(rated) } })).deletedCount;

  await col("student").updateOne(
    { U_ID: userId },
    {
      $set: {
        St_CollegeID: "DEL" + userId,
        St_NameOnId: "DELETED ACCOUNT",
        St_VerificationStatus: "REJECTED",
        St_FlagReason: "This account was deleted by the student.",
        St_IdCardPath: "",
      },
    }
  );
  await col("users").updateOne(
    { U_ID: userId },
    {
      $set: {
        U_FirstName: "Deleted",
        U_LastName: "Account",
        U_Email: "deleted-" + userId + "@campuskart.invalid",
        U_PasswordHash: T.sha256(crypto.randomUUID()),
        U_IsActive: 0,
      },
    }
  );
  return erased;
}

async function removeEverything(userId) {
  const erased = {};
  erased.recommendations = (await col("item_recommendation").deleteMany({ U_ID: userId })).deletedCount;
  const wishes = await col("wishlist").find({ U_ID: userId }, { projection: { W_ID: 1 } }).toArray();
  await col("wish_match").deleteMany({ W_ID: { $in: wishes.map((w) => w.W_ID) } });
  erased.wishes = (await col("wishlist").deleteMany({ U_ID: userId })).deletedCount;
  erased.phone_numbers = (await col("user_phone").deleteMany({ U_ID: userId })).deletedCount;
  await col("student").deleteMany({ U_ID: userId });
  await col("users").deleteMany({ U_ID: userId });
  erased.flags = 0;
  erased.verification_records = 0;
  erased.reports = 0;
  erased.offers = 0;
  return erased;
}

async function deleteAccount(request, session, uploadDir) {
  const me = await G.user(session);
  const userId = me.userId;
  if (me.role === "ADMIN") throw new T.ApiError("An admin account cannot be deleted from the profile page.");
  const user = await col("users").findOne({ U_ID: userId });
  if (T.nz(user.U_PasswordHash) !== T.sha256(request.s("password"))) {
    throw new T.ApiError("That password is wrong, so nothing was deleted.");
  }
  const st = await col("student").findOne({ U_ID: userId });
  const cardPath = st ? st.St_IdCardPath : null;
  const real = (await history(userId)) === 0;
  let closed = {};
  let erased = {};
  if (real) {
    erased = await removeEverything(userId);
  } else {
    closed = await closeActivity(userId);
    erased = await erase(userId);
  }
  sessions.closeAllFor(userId);
  discard(uploadDir, cardPath);
  const body = {
    deleted: real,
    message: real
      ? "Your account has been deleted from the database. You can register again with the same college e-mail address and PRN."
      : "Your account has been closed and every personal detail about you has been erased. Your past listings stay on record as \"Deleted account\", because the database does not allow listings to be deleted. You can register again with the same college e-mail address and PRN.",
    closed,
    erased,
  };
  return new Resp(body, `ck_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${C.secureCookies ? "; Secure" : ""}`);
}

function discard(uploadDir, cardPath) {
  if (!uploadDir || !cardPath) return;
  const name = String(cardPath).replace(/\\/g, "/");
  const slash = name.lastIndexOf("/");
  const base = slash < 0 ? name : name.substring(slash + 1);
  if (!base || base.includes("..")) return;
  try {
    const file = path.join(uploadDir, base);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {
    /* ignore file cleanup problems */
  }
}

const NAMES = ["accountImpact", "deleteAccount"];

async function handle(name, request, session, uploadDir) {
  switch (name) {
    case "accountImpact": return accountImpact(session);
    case "deleteAccount": return deleteAccount(request, session, uploadDir);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES };
