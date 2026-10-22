const { col, nextId, nextBillNo } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const R = require("../rules");
const G = require("./guard");
const mail = require("../mail");
const templates = require("../src/templates/notifications");
const { ok } = require("../resp");

const OPEN = ["PENDING", "COUNTERED"];

async function sendRequest(request, session) {
  const me = await G.verifiedStudent(session);
  await R.runSweep();
  let type = request.first("request_type");
  if (!type) type = "BUY";
  const message = request.s("message");
  if (message.length > 100) throw new T.ApiError("Message can be at most 100 characters.");
  const bundleId = request.s("bundle_id");
  const requestId = await nextId("buy_request");
  if (bundleId) {
    const bundle = await V.bundleRow(bundleId);
    if (!bundle) throw new T.ApiError("This bundle is no longer available.");
    if (bundle.U_ID === me.userId) throw new T.ApiError("You cannot request your own bundle.");
    if (type !== "BUY") throw new T.ApiError("Bundles can only be requested at the bundle price.");
    // Rules the original database enforced with a trigger.
    if (bundle.Bun_Status !== "AVAILABLE" && bundle.Bun_Status !== "REQUESTED") {
      throw new T.ApiError("This bundle is not available");
    }
    if ((await col("item").countDocuments({ Bun_ID: bundleId })) < 2) {
      throw new T.ApiError("A bundle needs at least 2 items");
    }
    if ((await col("buy_request").countDocuments({ U_ID: me.userId, Bun_ID: bundleId, Req_Status: "PENDING" })) > 0) {
      throw new T.ApiError("You already have a pending request for this bundle");
    }
    await col("buy_request").insertOne({
      _id: requestId,
      Req_ID: requestId,
      Req_RequestedOn: T.now(),
      Req_Message: message,
      Req_Type: "BUY",
      Req_OfferedPrice: null,
      Req_CounterPrice: null,
      Req_Status: "PENDING",
      Req_ExpiresOn: T.addDays(T.today(), C.requestDays),
      Req_DecidedOn: null,
      Req_HandoverLocation: null,
      Req_HandoverTime: null,
      U_ID: me.userId,
      I_ID: null,
      Bun_ID: bundleId,
      Swap_I_ID: null,
    });
    await col("bundle").updateOne({ Bun_ID: bundleId, Bun_Status: "AVAILABLE" }, { $set: { Bun_Status: "REQUESTED" } });
    mail
      .notify(bundle.U_ID, "CampusKart: new request for your bundle", `A student sent a request for "${bundle.Bun_Name}". Open My Orders to answer it.`)
      .catch(() => {});
    return { request_id: requestId };
  }
  const itemId = request.s("item_id");
  const item = await V.itemById(itemId);
  if (!item) throw new T.ApiError("Item not found.");
  if (item.ownerId === me.userId) throw new T.ApiError("You cannot request your own item.");
  if (item.status !== "AVAILABLE" && item.status !== "BUY_REQUESTED") {
    throw new T.ApiError("This item is no longer available.");
  }
  if (item.bundleId && (item.bundleStatus === "AVAILABLE" || item.bundleStatus === "REQUESTED")) {
    throw new T.ApiError("This item is part of a bundle. Request the bundle instead.");
  }
  if ((await col("buy_request").countDocuments({ U_ID: me.userId, I_ID: itemId, Req_Status: { $in: OPEN } })) > 0) {
    throw new T.ApiError("You already have a waiting request for this item.");
  }
  let offeredPrice = null;
  let swapItemId = null;
  if (type === "OFFER") {
    const offer = request.i("offered_price", 0);
    if (offer <= 0 || offer > item.sellingPrice) {
      throw new T.ApiError("Your offer must be above 0 and not above " + item.sellingPrice + ".");
    }
    if (offer >= item.sellingPrice || offer * 2 < item.sellingPrice) {
      throw new T.ApiError("An offer must be below the selling price and at least half of it");
    }
    offeredPrice = offer;
  } else if (type === "SWAP") {
    swapItemId = request.s("offered_item_id");
    const mine = await V.itemById(swapItemId);
    if (!mine || mine.ownerId !== me.userId || mine.status !== "AVAILABLE" || mine.id === itemId || mine.bundleId) {
      throw new T.ApiError("Pick one of your own available items to swap.");
    }
  } else if (type !== "BUY") {
    throw new T.ApiError("Unknown request type.");
  }
  await col("buy_request").insertOne({
    _id: requestId,
    Req_ID: requestId,
    Req_RequestedOn: T.now(),
    Req_Message: message,
    Req_Type: type,
    Req_OfferedPrice: offeredPrice,
    Req_CounterPrice: null,
    Req_Status: "PENDING",
    Req_ExpiresOn: T.addDays(T.today(), C.requestDays),
    Req_DecidedOn: null,
    Req_HandoverLocation: null,
    Req_HandoverTime: null,
    U_ID: me.userId,
    I_ID: itemId,
    Bun_ID: null,
    Swap_I_ID: swapItemId,
  });
  // The original trigger wrote a status-log row for this transition.
  await R.setItemStatusFrom(itemId, "AVAILABLE", "BUY_REQUESTED");
  mail
    .notify(item.ownerId, "CampusKart: new request for your item", `A student sent a request for "${item.name}". Open My Orders to answer it.`)
    .catch(() => {});
  return { request_id: requestId };
}

async function myRequests(session) {
  const me = await G.student(session);
  await R.runSweep();
  const rows = await col("buy_request").find({ U_ID: me.userId }).sort({ Req_ID: -1 }).toArray();
  const out = [];
  for (const row of rows) out.push(await V.requestJson(row, me.userId, false));
  return out;
}

async function incomingRequests(session) {
  const me = await G.student(session);
  await R.runSweep();
  const rows = await col("buy_request").find({}).sort({ Req_ID: -1 }).toArray();
  const out = [];
  for (const row of rows) {
    let sellerId;
    if (row.Bun_ID) {
      const bundle = await col("bundle").findOne({ Bun_ID: row.Bun_ID });
      sellerId = bundle ? bundle.U_ID : null;
    } else {
      const item = await col("item").findOne({ I_ID: row.I_ID });
      sellerId = item ? item.U_ID : null;
    }
    if (sellerId !== me.userId) continue;
    out.push(await V.requestJson(row, me.userId, true));
  }
  return out;
}

async function decideRequest(request, session) {
  const me = await G.student(session);
  const requestId = request.s("request_id");
  const row = await col("buy_request").findOne({ Req_ID: requestId });
  if (!row) throw new T.ApiError("Request not found.");
  const itemId = row.I_ID;
  const bundleId = row.Bun_ID;
  let sellerId;
  if (bundleId) {
    const bundle = await col("bundle").findOne({ Bun_ID: bundleId });
    sellerId = bundle ? bundle.U_ID : null;
  } else {
    const item = await col("item").findOne({ I_ID: itemId });
    sellerId = item ? item.U_ID : null;
  }
  if (me.userId !== sellerId) throw new T.ApiError("Not your listing.");
  if (row.Req_Status !== "PENDING") throw new T.ApiError("This request is already answered or waiting for the buyer.");
  const target = await V.requestTarget(row);
  const decision = request.s("decision");
  if (decision === "ACCEPT") {
    const place = T.trim(request.s("handover_location"));
    const when = T.normalize(request.s("handover_time"));
    if (!place || T.blank(request.s("handover_time"))) throw new T.ApiError("Choose a campus place and a time.");
    if (T.beforeNow(when)) throw new T.ApiError("Handover time must be in the future.");
    if (row.Req_Type === "SWAP") {
      const swap = await col("item").findOne({ I_ID: row.Swap_I_ID });
      if (!swap || swap.I_Status !== "AVAILABLE") {
        throw new T.ApiError("The item offered in the swap is no longer available.");
      }
    }
    await col("buy_request").updateOne(
      { Req_ID: requestId },
      { $set: { Req_Status: "ACCEPTED", Req_DecidedOn: T.now(), Req_HandoverLocation: place, Req_HandoverTime: when } }
    );
    const rivals = await col("buy_request").find({
      Req_ID: { $ne: requestId },
      Req_Status: { $in: OPEN },
      ...(itemId !== null ? { I_ID: itemId } : { Bun_ID: bundleId }),
    }).toArray();
    for (const rival of rivals) {
      await col("buy_request").updateOne({ Req_ID: rival.Req_ID }, { $set: { Req_Status: "REJECTED", Req_DecidedOn: T.now() } });
    }
    if (itemId !== null) {
      await R.setItemStatusFrom(itemId, "BUY_REQUESTED", "ACCEPTED");
    }
    const acceptedMail = templates.requestAccepted({ targetName: target.name, place, when });
    mail.notify(row.U_ID, acceptedMail.subject, acceptedMail.text).catch(() => {});
    return ok();
  }
  if (decision === "REJECT") {
    await col("buy_request").updateOne({ Req_ID: requestId }, { $set: { Req_Status: "REJECTED", Req_DecidedOn: T.now() } });
    await R.releaseTarget(itemId, bundleId);
    await R.checkFraud(row.U_ID);
    const declinedMail = templates.requestDeclined({ targetName: target.name });
    mail.notify(row.U_ID, declinedMail.subject, declinedMail.text).catch(() => {});
    return ok();
  }
  if (decision === "COUNTER") {
    if (row.Req_Type !== "OFFER") throw new T.ApiError("Only offers can be countered.");
    if (row.Req_CounterPrice !== null && row.Req_CounterPrice !== undefined) throw new T.ApiError("You can counter only once.");
    const counter = request.i("counter_price", 0);
    const selling = T.valueOf(target.price, 0);
    if (counter <= T.valueOf(row.Req_OfferedPrice, 0) || counter > selling) {
      throw new T.ApiError("Counter price must be above the offer and not above " + selling + ".");
    }
    await col("buy_request").updateOne(
      { Req_ID: requestId },
      { $set: { Req_CounterPrice: counter, Req_Status: "COUNTERED", Req_DecidedOn: T.now() } }
    );
    const counterMail = templates.requestCountered({ targetName: target.name, counter });
    mail.notify(row.U_ID, counterMail.subject, counterMail.text).catch(() => {});
    return ok();
  }
  throw new T.ApiError("Unknown decision.");
}

async function respondCounter(request, session) {
  const me = await G.student(session);
  const requestId = request.s("request_id");
  const row = await col("buy_request").findOne({ Req_ID: requestId });
  if (!row || row.U_ID !== me.userId || row.Req_Status !== "COUNTERED") throw new T.ApiError("Nothing to answer.");
  if (request.b("accept")) {
    const itemId = row.I_ID;
    const bundleId = row.Bun_ID;
    let place = "Main Gate";
    if (itemId !== null) {
      const item = await col("item").findOne({ I_ID: itemId });
      if (item && item.I_PickupLocation) place = item.I_PickupLocation;
    }
    await col("buy_request").updateOne(
      { Req_ID: requestId },
      { $set: { Req_Status: "ACCEPTED", Req_DecidedOn: T.now(), Req_HandoverLocation: place, Req_HandoverTime: T.addDays(T.today(), 1) + " 17:00:00" } }
    );
    const rivals = await col("buy_request").find({
      Req_ID: { $ne: requestId },
      Req_Status: { $in: OPEN },
      ...(itemId !== null ? { I_ID: itemId } : { Bun_ID: bundleId }),
    }).toArray();
    for (const rival of rivals) {
      await col("buy_request").updateOne({ Req_ID: rival.Req_ID }, { $set: { Req_Status: "REJECTED", Req_DecidedOn: T.now() } });
    }
    if (itemId !== null) {
      await R.setItemStatusFrom(itemId, "BUY_REQUESTED", "ACCEPTED");
    }
    return ok();
  }
  await col("buy_request").updateOne({ Req_ID: requestId }, { $set: { Req_Status: "CANCELLED", Req_DecidedOn: T.now() } });
  await R.releaseTarget(row.I_ID, row.Bun_ID);
  return ok();
}

async function cancelRequest(request, session) {
  const me = await G.student(session);
  const requestId = request.s("request_id");
  const row = await col("buy_request").findOne({ Req_ID: requestId });
  if (!row || row.U_ID !== me.userId || !OPEN.includes(row.Req_Status)) {
    throw new T.ApiError("This request cannot be cancelled.");
  }
  await col("buy_request").updateOne({ Req_ID: requestId }, { $set: { Req_Status: "CANCELLED", Req_DecidedOn: T.now() } });
  await R.releaseTarget(row.I_ID, row.Bun_ID);
  return ok();
}

async function createBill(request) {
  const billId = await nextId("bill");
  const billNo = await nextBillNo();
  const amount = await V.agreedPrice(request);
  await col("bill").insertOne({
    _id: billId,
    Bill_ID: billId,
    Bill_No: billNo,
    Bill_IssuedOn: T.now(),
    Bill_Amount: amount === null ? 0 : amount,
    Bill_Deposit: null,
    Bill_PdfPath: "bills/" + billId + ".pdf",
    Req_ID: request.Req_ID,
    Bk_ID: null,
  });
  return billId;
}

async function markSold(request, session) {
  const me = await G.student(session);
  const requestId = request.s("request_id");
  const row = await col("buy_request").findOne({ Req_ID: requestId });
  if (!row || row.Req_Status !== "ACCEPTED") throw new T.ApiError("This request is not ready for handover.");
  const itemId = row.I_ID;
  const bundleId = row.Bun_ID;
  if (bundleId) {
    const bundle = await V.bundleRow(bundleId);
    if (!bundle || bundle.U_ID !== me.userId) throw new T.ApiError("Not your listing.");
    if (bundle.Bun_Status === "SOLD") throw new T.ApiError("Already sold.");
  } else {
    const item = await V.itemById(itemId);
    if (!item || item.ownerId !== me.userId) throw new T.ApiError("Not your listing.");
    if (item.status === "SOLD") throw new T.ApiError("Already sold.");
  }
  const expected = V.passFor(requestId, T.nz(row.Req_HandoverTime));
  if (String(request.s("pass")).trim() !== expected) {
    throw new T.ApiError("Wrong handover pass. Ask the buyer to show the 4-digit code in their Requests page.");
  }
  if (itemId !== null) {
    await R.sellItem(itemId);
    if (row.Swap_I_ID !== null && row.Swap_I_ID !== undefined) {
      const swap = await col("item").findOne({ I_ID: row.Swap_I_ID });
      if (swap && swap.I_Status === "AVAILABLE") await R.sellItem(row.Swap_I_ID);
    }
  } else {
    await col("bundle").updateOne({ Bun_ID: bundleId }, { $set: { Bun_Status: "SOLD" } });
    const items = await V.itemsInBundle(bundleId);
    for (const item of items) await R.sellItem(item.id);
  }
  const billId = await createBill(row);
  const handoverMail = templates.handoverRecorded({ billId });
  mail.notify(row.U_ID, handoverMail.subject, handoverMail.text).catch(() => {});
  return { bill_id: billId };
}

async function bill(request, session) {
  await G.user(session);
  const billId = request.s("bill_id");
  const billRow = await col("bill").findOne({ Bill_ID: billId });
  if (!billRow) throw new T.ApiError("Bill not found.");
  const out = {
    bill_id: billRow.Bill_ID,
    bill_no: billRow.Bill_No,
    issued_on: billRow.Bill_IssuedOn === undefined ? null : billRow.Bill_IssuedOn,
    amount: T.valueOf(billRow.Bill_Amount),
    deposit_amount: billRow.Bill_Deposit === null || billRow.Bill_Deposit === undefined ? null : T.valueOf(billRow.Bill_Deposit),
    pdf_path: billRow.Bill_PdfPath === undefined ? null : billRow.Bill_PdfPath,
    buyer_emailed_on: billRow.Bill_BuyerEmailedOn === undefined ? null : billRow.Bill_BuyerEmailedOn,
    seller_emailed_on: billRow.Bill_SellerEmailedOn === undefined ? null : billRow.Bill_SellerEmailedOn,
    request_id: billRow.Req_ID === undefined ? null : billRow.Req_ID,
    booking_id: billRow.Bk_ID === undefined ? null : billRow.Bk_ID,
  };
  if (billRow.Req_ID !== null && billRow.Req_ID !== undefined) {
    const row = await col("buy_request").findOne({ Req_ID: billRow.Req_ID });
    const buyerId = row.U_ID;
    const bundleId = row.Bun_ID;
    let sellerId;
    if (bundleId) {
      const bundle = await col("bundle").findOne({ Bun_ID: bundleId });
      sellerId = bundle ? bundle.U_ID : null;
    } else {
      const item = await col("item").findOne({ I_ID: row.I_ID });
      sellerId = item ? item.U_ID : null;
    }
    if (session.userId !== buyerId && session.userId !== sellerId && session.role !== "ADMIN") {
      throw new T.ApiError("This bill is not yours.");
    }
    const target = await V.requestTarget(row);
    const lines = [];
    let percent = null;
    if (bundleId) {
      const items = await V.itemsInBundle(bundleId);
      for (const item of items) lines.push({ name: item.name, price: item.sellingPrice });
      const bundle = await col("bundle").findOne({ Bun_ID: bundleId });
      percent = bundle ? T.valueOf(bundle.Bun_DiscountPercent, C.bundleDiscount) : C.bundleDiscount;
    } else {
      lines.push({ name: target.name, price: target.price });
    }
    out.kind = "SALE";
    out.buyer = await V.userName(buyerId);
    out.seller = await V.userName(sellerId);
    out.buyer_email = await V.userEmail(buyerId);
    out.seller_email = await V.userEmail(sellerId);
    out.lines = lines;
    out.title = target.name;
    out.place = row.Req_HandoverLocation === undefined ? null : row.Req_HandoverLocation;
    out.date = row.Req_HandoverTime === undefined ? null : row.Req_HandoverTime;
    out.request_type = row.Req_Type;
    out.swapped_for = row.Swap_I_ID === null || row.Swap_I_ID === undefined
      ? null
      : (await col("item").findOne({ I_ID: row.Swap_I_ID }, { projection: { I_Name: 1 } }))?.I_Name ?? null;
    out.discount_percent = percent;
    return out;
  }
  const booking = await col("rental_booking").findOne({ Bk_ID: billRow.Bk_ID });
  const rental = await col("rental_item").findOne({ RI_ID: booking.RI_ID });
  const renterId = booking.U_ID;
  const ownerId = rental.U_ID;
  if (session.userId !== renterId && session.userId !== ownerId && session.role !== "ADMIN") {
    throw new T.ApiError("This bill is not yours.");
  }
  const start = T.nz(booking.Bk_StartDate);
  const end = T.nz(booking.Bk_EndDate);
  const days = T.dayDiff(start, end) + 1;
  const rate = T.valueOf(rental.RI_RatePerDay);
  out.kind = "RENTAL";
  out.buyer = await V.userName(renterId);
  out.seller = await V.userName(ownerId);
  out.buyer_email = await V.userEmail(renterId);
  out.seller_email = await V.userEmail(ownerId);
  out.lines = [{ name: `${rental.RI_Name} (${days} day${days > 1 ? "s" : ""} at ${rate} per day)`, price: days * rate }];
  out.title = rental.RI_Name;
  out.place = rental.RI_PickupLocation === undefined ? null : rental.RI_PickupLocation;
  out.date = start + " to " + end;
  out.damage_note = booking.Bk_DamageNote === undefined ? null : booking.Bk_DamageNote;
  return out;
}

const NAMES = ["sendRequest", "myRequests", "incomingRequests", "decideRequest", "respondCounter", "cancelRequest", "markSold", "bill"];

async function handle(name, request, session) {
  switch (name) {
    case "sendRequest": return sendRequest(request, session);
    case "myRequests": return myRequests(session);
    case "incomingRequests": return incomingRequests(session);
    case "decideRequest": return decideRequest(request, session);
    case "respondCounter": return respondCounter(request, session);
    case "cancelRequest": return cancelRequest(request, session);
    case "markSold": return markSold(request, session);
    case "bill": return bill(request, session);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES };
