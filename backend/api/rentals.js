const { col, nextId, nextBillNo } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const R = require("../rules");
const G = require("./guard");
const mail = require("../mail");
const { ok } = require("../resp");

async function viewer(session) {
  return session ? V.student(session.userId) : null;
}

async function overlap(rentalId, start, end, skip) {
  const rows = await col("rental_booking").find({ RI_ID: rentalId, Bk_Status: { $in: ["ACCEPTED", "HANDED_OVER"] } }).toArray();
  for (const row of rows) {
    if (skip && skip === row.Bk_ID) continue;
    const otherStart = T.nz(row.Bk_StartDate);
    const otherEnd = T.nz(row.Bk_EndDate);
    if (!(end < otherStart || start > otherEnd)) return true;
  }
  return false;
}

async function listRentals(request, session) {
  await R.runSweep();
  const me = await viewer(session);
  const q = request.s("q").toLowerCase();
  const category = request.s("category_id");
  const maxRate = request.i("max_rate", 0);
  const rentals = await V.rentalsActive();
  const out = [];
  for (const rental of rentals) {
    if (q && !(`${rental.name} ${rental.description}`.toLowerCase().includes(q))) continue;
    if (category && category !== rental.categoryId) continue;
    if (maxRate > 0 && rental.ratePerDay > maxRate) continue;
    out.push(await V.rentalJson(rental, me));
  }
  if (request.s("sort") === "price_asc") {
    out.sort((a, b) => T.valueOf(a.rate_per_day, 0) - T.valueOf(b.rate_per_day, 0));
  } else {
    out.sort((a, b) => V.numeric(T.nz(b.rental_item_id)) - V.numeric(T.nz(a.rental_item_id)));
  }
  return V.pageOf(out, request.i("page", 1), C.pageSize);
}

async function getRental(request, session) {
  await R.runSweep();
  const me = await viewer(session);
  const rentalId = request.s("rental_item_id");
  const rental = await V.rentalById(rentalId);
  if (!rental) throw new T.ApiError("Rental item not found.");
  const mine = [];
  if (session) {
    const rows = await col("rental_booking").find({ RI_ID: rentalId, U_ID: session.userId }).sort({ Bk_ID: -1 }).toArray();
    for (const row of rows) mine.push(await V.bookingJson(row));
  }
  return { rental: await V.rentalJson(rental, me), my_bookings: mine };
}

async function createRental(request, session) {
  const me = await G.verifiedStudent(session);
  const categoryId = request.s("category_id");
  const category = await col("category").findOne({ Cat_ID: categoryId });
  if (!category || !T.truth(category.Cat_IsRentable)) throw new T.ApiError("Choose a rentable category.");
  const name = T.trim(request.s("rental_name"));
  const description = T.trim(request.s("description"));
  if (!name) throw new T.ApiError("Name is required.");
  if (description.length < 30) throw new T.ApiError("Description must be at least 30 characters.");
  if (name.length > 60) throw new T.ApiError("Name can be at most 60 characters.");
  if (description.length > 200) throw new T.ApiError("Description can be at most 200 characters.");
  if (!C.conditions.includes(request.s("item_condition"))) throw new T.ApiError("Choose the condition.");
  if (!request.s("pickup_location")) throw new T.ApiError("Choose a pickup place.");
  const rate = request.i("rate_per_day", 0);
  if (rate <= 0) throw new T.ApiError("Rate per day must be above 0.");
  if (!request.s("deposit_amount") || request.i("deposit_amount", -1) < 0) {
    throw new T.ApiError("Enter the refundable deposit (0 if none).");
  }
  const maxDays = request.i("max_days", 0);
  if (maxDays < 1 || maxDays > 30) throw new T.ApiError("Maximum days must be 1 to 30.");
  const photos = request.photos();
  if (photos.length < 3 || photos.length > 5) throw new T.ApiError("A rental needs 3 to 5 clear photos.");
  const rentalId = await nextId("rental_item");
  await col("rental_item").insertOne({
    _id: rentalId,
    RI_ID: rentalId,
    RI_Name: name,
    RI_Description: description,
    RI_Condition: request.s("item_condition"),
    RI_RatePerDay: rate,
    RI_Deposit: request.i("deposit_amount", 0),
    RI_MaxDays: maxDays,
    RI_PickupLocation: request.s("pickup_location"),
    RI_Status: "AVAILABLE",
    RI_ListedOn: T.today(),
    U_ID: me.userId,
    Cat_ID: categoryId,
  });
  const cover = request.i("cover", 0);
  for (let i = 0; i < photos.length; i++) {
    const imageId = await nextId("rental_image");
    await col("rental_image").insertOne({
      _id: imageId,
      RImg_ID: imageId,
      RImg_No: i + 1,
      RImg_Path: photos[i],
      RImg_IsPrimary: i === cover ? 1 : 0,
      RI_ID: rentalId,
    });
  }
  return { rental_item_id: rentalId };
}

async function withdrawRental(request, session) {
  const me = await G.verifiedStudent(session);
  const rentalId = request.s("rental_item_id");
  const rental = await V.rentalById(rentalId);
  if (!rental || rental.ownerId !== me.userId) throw new T.ApiError("Not your rental item.");
  if ((await col("rental_booking").countDocuments({ RI_ID: rentalId, Bk_Status: { $in: ["ACCEPTED", "HANDED_OVER"] } })) > 0) {
    throw new T.ApiError("This item has an accepted or running booking.");
  }
  await col("rental_booking").updateMany({ RI_ID: rentalId, Bk_Status: "PENDING" }, { $set: { Bk_Status: "REJECTED" } });
  await col("rental_item").updateMany({ RI_ID: rentalId, RI_Status: { $ne: "ON_RENT" } }, { $set: { RI_Status: "REMOVED" } });
  return ok();
}

async function requestRental(request, session) {
  const me = await G.verifiedStudent(session);
  const rentalId = request.s("rental_item_id");
  const rental = await V.rentalById(rentalId);
  if (!rental || rental.status === "REMOVED") throw new T.ApiError("Rental item not found.");
  if (rental.ownerId === me.userId) throw new T.ApiError("You cannot rent your own item.");
  const start = T.dateOf(request.s("start_date"));
  const end = T.dateOf(request.s("end_date"));
  if (T.blank(request.s("start_date")) || T.blank(request.s("end_date"))) {
    throw new T.ApiError("Pick the start and end dates.");
  }
  if (start < T.today()) throw new T.ApiError("Start date cannot be in the past.");
  if (end < start) throw new T.ApiError("End date must be on or after the start date.");
  const days = T.dayDiff(start, end) + 1;
  if (days > rental.maxDays) throw new T.ApiError("This item can be rented for at most " + rental.maxDays + " days.");
  if (await overlap(rentalId, start, end, null)) throw new T.ApiError("Those dates clash with another booking.");
  if ((await col("rental_booking").countDocuments({ RI_ID: rentalId, U_ID: me.userId, Bk_Status: "PENDING" })) > 0) {
    throw new T.ApiError("You already have a waiting booking for this item.");
  }
  const bookingId = await nextId("rental_booking");
  await col("rental_booking").insertOne({
    _id: bookingId,
    Bk_ID: bookingId,
    Bk_StartDate: start,
    Bk_EndDate: end,
    Bk_RequestedOn: T.now(),
    Bk_Status: "PENDING",
    Bk_HandedOverOn: null,
    Bk_ReturnedOn: null,
    Bk_DamageNote: null,
    RI_ID: rentalId,
    U_ID: me.userId,
  });
  mail
    .notify(rental.U_ID, "CampusKart: new rental request", `A student asked to rent "${rental.RI_Name}" from ${start} to ${end}. Open My Rentals to answer it.`)
    .catch(() => {});
  return { booking_id: bookingId, rental_days: days, total_rent: days * rental.ratePerDay, deposit_amount: rental.deposit };
}

async function myRentals(session) {
  const me = await G.student(session);
  await R.runSweep();
  const mine = await V.rentalsByOwner(me.userId);
  const listings = [];
  for (const rental of mine) listings.push(await V.rentalJson(rental, me));
  const renterRows = await col("rental_booking").find({ U_ID: me.userId }).sort({ Bk_ID: -1 }).toArray();
  const asRenter = [];
  for (const row of renterRows) asRenter.push(await V.bookingJson(row));
  const ownerRows = await col("rental_booking").find({}).sort({ Bk_ID: -1 }).toArray();
  const asOwner = [];
  for (const row of ownerRows) {
    const rental = await col("rental_item").findOne({ RI_ID: row.RI_ID });
    if (rental && rental.U_ID === me.userId) asOwner.push(await V.bookingJson(row));
  }
  return { as_renter: asRenter, as_owner: asOwner, my_rentals: listings };
}

async function decideRental(request, session) {
  const me = await G.student(session);
  const bookingId = request.s("booking_id");
  const booking = await V.bookingRow(bookingId);
  const rental = booking ? await col("rental_item").findOne({ RI_ID: booking.RI_ID }) : null;
  if (!booking || !rental || rental.U_ID !== me.userId) throw new T.ApiError("Not your rental item.");
  if (booking.Bk_Status !== "PENDING") throw new T.ApiError("Already answered.");
  if (request.s("decision") === "ACCEPT") {
    const start = T.nz(booking.Bk_StartDate);
    const end = T.nz(booking.Bk_EndDate);
    if (await overlap(booking.RI_ID, start, end, bookingId)) {
      throw new T.ApiError("These dates now clash with an accepted booking.");
    }
    await col("rental_booking").updateOne({ Bk_ID: bookingId }, { $set: { Bk_Status: "ACCEPTED" } });
    mail
      .notify(booking.U_ID, "CampusKart: rental accepted", `Your rental of "${rental.RI_Name}" from ${start} to ${end} was accepted. Pay the rent and deposit in person at handover.`)
      .catch(() => {});
    return ok();
  }
  await col("rental_booking").updateOne({ Bk_ID: bookingId }, { $set: { Bk_Status: "REJECTED" } });
  mail.notify(booking.U_ID, "CampusKart: rental declined", `Your rental request for "${rental.RI_Name}" was declined.`).catch(() => {});
  return ok();
}

async function cancelBooking(request, session) {
  const me = await G.student(session);
  const bookingId = request.s("booking_id");
  const booking = await V.bookingRow(bookingId);
  if (!booking || booking.U_ID !== me.userId || (booking.Bk_Status !== "PENDING" && booking.Bk_Status !== "ACCEPTED")) {
    throw new T.ApiError("This booking cannot be cancelled.");
  }
  await col("rental_booking").updateOne({ Bk_ID: bookingId }, { $set: { Bk_Status: "CANCELLED" } });
  return ok();
}

async function handoverRental(request, session) {
  const me = await G.student(session);
  const bookingId = request.s("booking_id");
  const booking = await V.bookingRow(bookingId);
  const rental = booking ? await col("rental_item").findOne({ RI_ID: booking.RI_ID }) : null;
  if (!booking || !rental || rental.U_ID !== me.userId) throw new T.ApiError("Not your rental item.");
  if (booking.Bk_Status !== "ACCEPTED") throw new T.ApiError("Accept the booking first.");
  await col("rental_booking").updateOne({ Bk_ID: bookingId }, { $set: { Bk_Status: "HANDED_OVER", Bk_HandedOverOn: T.now() } });
  await col("rental_item").updateOne({ RI_ID: booking.RI_ID }, { $set: { RI_Status: "ON_RENT" } });
  return ok();
}

async function returnRental(request, session) {
  const me = await G.student(session);
  const bookingId = request.s("booking_id");
  const booking = await V.bookingRow(bookingId);
  const rental = booking ? await col("rental_item").findOne({ RI_ID: booking.RI_ID }) : null;
  if (!booking || !rental || rental.U_ID !== me.userId) throw new T.ApiError("Not your rental item.");
  if (booking.Bk_Status !== "HANDED_OVER") throw new T.ApiError("Mark it handed over first.");
  let damage = T.trim(request.s("damage_note"));
  if (damage.length > 150) throw new T.ApiError("Damage note can be at most 150 characters.");
  const start = T.nz(booking.Bk_StartDate);
  const end = T.nz(booking.Bk_EndDate);
  const days = T.dayDiff(start, end) + 1;
  const amount = days * T.valueOf(rental.RI_RatePerDay);
  await col("rental_booking").updateOne(
    { Bk_ID: bookingId },
    { $set: { Bk_Status: "RETURNED", Bk_ReturnedOn: T.now(), Bk_DamageNote: damage ? damage : null } }
  );
  await col("rental_item").updateOne({ RI_ID: booking.RI_ID }, { $set: { RI_Status: "AVAILABLE" } });
  const billId = await nextId("bill");
  const billNo = await nextBillNo();
  await col("bill").insertOne({
    _id: billId,
    Bill_ID: billId,
    Bill_No: billNo,
    Bill_IssuedOn: T.now(),
    Bill_Amount: amount,
    Bill_Deposit: T.valueOf(rental.RI_Deposit),
    Bill_PdfPath: "bills/" + billId + ".pdf",
    Req_ID: null,
    Bk_ID: bookingId,
  });
  mail
    .notify(booking.U_ID, "CampusKart: rental returned", `The item was returned. Your rental bill ${billId} is ready under My Rentals.`)
    .catch(() => {});
  return { bill_id: billId };
}

const NAMES = [
  "listRentals", "getRental", "createRental", "withdrawRental", "requestRental", "myRentals",
  "decideRental", "cancelBooking", "handoverRental", "returnRental",
];

async function handle(name, request, session) {
  switch (name) {
    case "listRentals": return listRentals(request, session);
    case "getRental": return getRental(request, session);
    case "createRental": return createRental(request, session);
    case "withdrawRental": return withdrawRental(request, session);
    case "requestRental": return requestRental(request, session);
    case "myRentals": return myRentals(session);
    case "decideRental": return decideRental(request, session);
    case "cancelBooking": return cancelBooking(request, session);
    case "handoverRental": return handoverRental(request, session);
    case "returnRental": return returnRental(request, session);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES };
