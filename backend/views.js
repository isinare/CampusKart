const { col } = require("./db");
const C = require("./config");
const T = require("./util");

/* ------------------------------------------------------------------ helpers */

function fairPrice(originalPrice, condition, ageInMonths) {
  let factor = 0.5;
  if (condition === "NEW") factor = 0.85;
  else if (condition === "GOOD") factor = 0.65;
  else if (condition === "FAIR") factor = 0.45;
  else if (condition === "POOR") factor = 0.3;
  if (originalPrice <= 0) return { low: 0, suggested: 0, high: 0 };
  const scaled = originalPrice * factor * (1 - Math.min(ageInMonths, 48) * 0.004);
  const suggested = Math.min(originalPrice, T.round5(scaled));
  const low = Math.min(suggested, T.round5(scaled * 0.85));
  const high = Math.min(originalPrice, T.round5(scaled * 1.15));
  return { low, suggested, high };
}

function passFor(requestId, handoverTime) {
  let hash = T.numeric(requestId) * 31 + C.passSecret;
  const when = T.nz(handoverTime);
  for (let i = 0; i < when.length; i++) {
    hash = (hash * 131 + when.charCodeAt(i)) % 1000003;
  }
  return String(1000 + (hash % 9000));
}

/* -------------------------------------------------------------------- users */

async function userName(userId) {
  const user = await col("users").findOne({ U_ID: userId }, { projection: { U_FirstName: 1, U_LastName: 1 } });
  if (!user) return "-";
  return `${T.nz(user.U_FirstName)} ${T.nz(user.U_LastName)}`.trim();
}

async function userEmail(userId) {
  const user = await col("users").findOne({ U_ID: userId }, { projection: { U_Email: 1 } });
  return user ? user.U_Email : null;
}

function userJson(user) {
  return {
    user_id: user.U_ID,
    first_name: user.U_FirstName,
    last_name: user.U_LastName,
    name: `${T.nz(user.U_FirstName)} ${T.nz(user.U_LastName)}`.trim(),
    email: user.U_Email,
    role: user.U_Role,
    is_active: T.int(user, "U_IsActive", 1) === 1,
    registered_on: user.U_RegisteredOn,
  };
}

async function student(userId) {
  const user = await col("users").findOne({ U_ID: userId });
  if (!user) return null;
  const s = await col("student").findOne({ U_ID: userId });
  if (!s) return null;
  const branch = s.Br_ID ? await col("branch").findOne({ Br_ID: s.Br_ID }) : null;
  const institute = s.Ins_ID ? await col("institute").findOne({ Ins_ID: s.Ins_ID }) : null;
  const st = {
    userId: user.U_ID,
    firstName: user.U_FirstName,
    lastName: user.U_LastName,
    email: user.U_Email,
    role: user.U_Role,
    active: T.int(user, "U_IsActive", 1) === 1,
    registeredOn: user.U_RegisteredOn,
    collegeId: s.St_CollegeID,
    nameOnId: s.St_NameOnId,
    gender: s.St_Gender,
    age: T.valueOf(s.St_Age),
    year: T.valueOf(s.St_Year),
    semester: T.valueOf(s.St_Semester),
    verificationStatus: s.St_VerificationStatus,
    verificationMethod: s.St_VerificationMethod,
    remarks: s.St_FlagReason,
    branchId: s.Br_ID,
    branchCode: branch ? branch.Br_Code : null,
    instituteId: s.Ins_ID,
    instituteCode: institute ? institute.Ins_Code : null,
    idCardPath: s.St_IdCardPath,
  };
  st.toJson = () => studentJson(st);
  return st;
}

function studentJson(st) {
  return {
    user_id: st.userId,
    first_name: st.firstName,
    last_name: st.lastName,
    name: `${T.nz(st.firstName)} ${T.nz(st.lastName)}`.trim(),
    email: st.email,
    role: st.role,
    is_active: st.active,
    registered_on: st.registeredOn,
    college_id: st.collegeId,
    name_on_id: st.nameOnId,
    gender: st.gender,
    age: st.age,
    year: st.year,
    semester: st.semester,
    verification_status: st.verificationStatus,
    verification_method: st.verificationMethod,
    remarks: T.nz(st.remarks),
    branch_id: st.branchId,
    branch_code: st.branchCode,
    institute_id: st.instituteId,
    institute_code: st.instituteCode,
    id_card_path: st.idCardPath,
  };
}

/* ------------------------------------------------------------------- items */

async function decorateItem(row) {
  const category = await col("category").findOne({ Cat_ID: row.Cat_ID });
  const academic = row.I_Kind === "ACADEMIC" ? await col("academic_item").findOne({ I_ID: row.I_ID }) : null;
  const general = row.I_Kind === "GENERAL" ? await col("general_item").findOne({ I_ID: row.I_ID }) : null;
  const branch = academic ? await col("branch").findOne({ Br_ID: academic.Br_ID }) : null;
  const subject = academic ? await col("subject").findOne({ Sub_ID: academic.Sub_ID }) : null;
  const bundle = row.Bun_ID ? await col("bundle").findOne({ Bun_ID: row.Bun_ID }) : null;
  return {
    id: row.I_ID,
    name: row.I_Name,
    description: row.I_Description,
    originalPrice: T.valueOf(row.I_OriginalPrice),
    sellingPrice: T.valueOf(row.I_SellingPrice),
    conditionValue: row.I_Condition,
    pickupLocation: row.I_PickupLocation,
    status: row.I_Status,
    kind: row.I_Kind,
    listedOn: row.I_ListedOn,
    ownerId: row.U_ID,
    categoryId: row.Cat_ID,
    categoryName: category ? category.Cat_Name : null,
    bundleId: row.Bun_ID,
    bundleName: bundle ? bundle.Bun_Name : null,
    bundleStatus: bundle ? bundle.Bun_Status : null,
    subjectId: academic ? academic.Sub_ID : null,
    subjectName: subject ? subject.Sub_Name : null,
    branchId: academic ? academic.Br_ID : null,
    branchCode: branch ? branch.Br_Code : null,
    targetSemester: academic ? T.valueOf(academic.AI_TargetSemester) : 0,
    edition: academic ? academic.AI_Edition : null,
    brand: general ? general.GI_Brand : null,
    ageInMonths: general ? T.valueOf(general.GI_AgeInMonths) : 0,
  };
}

function itemToJson(item) {
  const discount = item.originalPrice <= 0
    ? 0
    : Math.round(((item.originalPrice - item.sellingPrice) / item.originalPrice) * 100);
  const json = {
    listing_id: item.id,
    name: item.name,
    description: item.description,
    item_condition: item.conditionValue,
    pickup_location: item.pickupLocation,
    status: item.status,
    listed_on: item.listedOn,
    owner_id: item.ownerId,
    category_id: item.categoryId,
    category_name: item.categoryName,
    cover: null,
    images: [],
    discount_percent: discount,
    item_id: item.id,
    item_name: item.name,
    item_kind: item.kind,
    original_price: item.originalPrice,
    selling_price: item.sellingPrice,
    seller_id: item.ownerId,
    bundle_id: item.bundleId,
  };
  if (item.kind === "ACADEMIC") {
    json.subject_id = item.subjectId;
    json.subject_name = item.subjectName;
    json.branch_id = item.branchId;
    json.branch_code = item.branchCode;
    json.target_semester = item.targetSemester;
    json.edition = item.edition;
  } else {
    json.brand = item.brand;
    json.age_in_months = item.ageInMonths;
  }
  return json;
}

async function itemById(itemId) {
  const row = await col("item").findOne({ I_ID: itemId });
  return row ? decorateItem(row) : null;
}

async function itemsFromRows(rows) {
  return Promise.all(rows.map((row) => decorateItem(row)));
}

async function itemsLive() {
  const rows = await col("item").find({ I_Status: { $in: ["AVAILABLE", "BUY_REQUESTED"] } })
    .sort({ I_ListedOn: -1, I_ID: -1 }).toArray();
  return itemsFromRows(rows);
}

async function itemsBySeller(sellerId, availableOnly) {
  const filter = availableOnly
    ? { U_ID: sellerId, I_Status: "AVAILABLE" }
    : { U_ID: sellerId };
  const rows = await col("item").find(filter).sort({ I_ID: -1 }).toArray();
  return itemsFromRows(rows);
}

async function itemsInBundle(bundleId) {
  const rows = await col("item").find({ Bun_ID: bundleId }).sort({ I_ID: 1 }).toArray();
  return itemsFromRows(rows);
}

async function itemsBySubject(subjectId) {
  const academic = await col("academic_item").find({ Sub_ID: subjectId }, { projection: { I_ID: 1 } }).toArray();
  const ids = academic.map((a) => a.I_ID);
  if (!ids.length) return [];
  const rows = await col("item").find({ I_ID: { $in: ids } }).sort({ I_SellingPrice: 1 }).toArray();
  return itemsFromRows(rows);
}

async function imagePaths(itemId) {
  const rows = await col("item_image").find({ I_ID: itemId }).sort({ Img_No: 1 }).toArray();
  const paths = [];
  let primary = null;
  for (const row of rows) {
    paths.push(row.Img_Path);
    if (T.truth(row.Img_IsPrimary)) primary = row.Img_Path;
  }
  if (primary !== null) {
    const at = paths.indexOf(primary);
    if (at > 0) {
      paths.splice(at, 1);
      paths.unshift(primary);
    }
  }
  return paths;
}

async function cover(itemId) {
  const rows = await col("item_image").find({ I_ID: itemId }).sort({ Img_IsPrimary: -1, Img_No: 1 }).limit(1).toArray();
  return rows.length ? rows[0].Img_Path : null;
}

async function allBranchId() {
  const row = await col("branch").findOne({ Br_Code: "ALL" });
  return row ? row.Br_ID : null;
}

async function subjectIds(st) {
  if (!st) return [];
  const all = await allBranchId();
  const rows = await col("taught_in").find({
    TI_Semester: st.semester,
    $or: [{ Br_ID: st.branchId }, { Br_ID: all }],
  }).sort({ Sub_ID: 1 }).toArray();
  return rows.map((r) => r.Sub_ID);
}

async function wishMatches(item, studentId) {
  // SQL: SELECT COUNT(*) FROM Wishlist w WHERE w.U_ID = studentId AND w.W_IsActive = 1
  //      AND w.U_ID <> item.ownerId AND w.W_MaxPrice >= price AND (Sub_ID IS NULL OR = subject)
  //      AND (Cat_ID IS NULL OR = category) AND topic LIKE keyword
  if (studentId === item.ownerId) return false;
  const wishes = await col("wishlist").find({ U_ID: studentId, W_IsActive: 1 }).toArray();
  const haystack = (item.name + " " + item.description).toLowerCase();
  for (const w of wishes) {
    if (T.int(w, "W_MaxPrice") < item.sellingPrice) continue;
    if (w.Sub_ID && w.Sub_ID !== item.subjectId) continue;
    if (w.Cat_ID && w.Cat_ID !== item.categoryId) continue;
    if (w.W_Keyword && !haystack.includes(String(w.W_Keyword).toLowerCase())) continue;
    return true;
  }
  return false;
}

async function relevance(item, st) {
  if (!st || item.kind !== "ACADEMIC") return null;
  let score = 0;
  const why = [];
  const all = await allBranchId();
  if (item.branchId && (item.branchId === st.branchId || item.branchId === all)) {
    score += 30;
    why.push("Your branch");
  }
  if (item.targetSemester === st.semester) {
    score += 30;
    why.push("Your semester");
  }
  if (item.subjectId && (await subjectIds(st)).includes(item.subjectId)) {
    score += 25;
    why.push("Subject you study");
  }
  if (await wishMatches(item, st.userId)) {
    score += 15;
    why.push("On your wishlist");
  }
  const label = score >= 80 ? "Highly relevant" : score >= 60 ? "Relevant" : score >= 40 ? "Possibly relevant" : "Low";
  return { score, label, why };
}

async function trustCard(userId) {
  const out = {};
  const user = await col("users").findOne({ U_ID: userId });
  if (!user) return out;
  const s = await col("student").findOne({ U_ID: userId });
  const branch = s && s.Br_ID ? await col("branch").findOne({ Br_ID: s.Br_ID }) : null;
  const institute = s && s.Ins_ID ? await col("institute").findOne({ Ins_ID: s.Ins_ID }) : null;
  out.user_id = userId;
  out.name = `${T.nz(user.U_FirstName)} ${T.nz(user.U_LastName)}`.trim();
  out.semester = s ? T.valueOf(s.St_Semester) : null;
  out.branch = branch ? branch.Br_Code : null;
  out.institute = institute ? institute.Ins_Code : null;
  out.verification_status = s ? s.St_VerificationStatus : null;
  out.member_since = T.dateOf(user.U_RegisteredOn);

  const accepted = await col("buy_request").find({ Req_Status: "ACCEPTED" }).toArray();
  let deals = 0;
  const soldRequestIds = [];
  for (const r of accepted) {
    if (r.Bun_ID) {
      const bundle = await col("bundle").findOne({ Bun_ID: r.Bun_ID });
      if (bundle && bundle.U_ID === userId && bundle.Bun_Status === "SOLD") {
        deals++;
        soldRequestIds.push(r.Req_ID);
      }
    } else {
      const item = await col("item").findOne({ I_ID: r.I_ID });
      if (item && item.U_ID === userId && item.I_Status === "SOLD") {
        deals++;
        soldRequestIds.push(r.Req_ID);
      }
    }
  }
  out.sales_count = deals;

  const ratings = await col("rating").find(soldRequestIds.length ? { Req_ID: { $in: soldRequestIds } } : { Req_ID: null }).toArray();
  out.rating_count = ratings.length;
  out.avg_rating = ratings.length
    ? Math.round((ratings.reduce((sum, r) => sum + T.int(r, "Rat_Stars"), 0) / ratings.length) * 10) / 10
    : null;

  const decided = await col("buy_request").find({ Req_DecidedOn: { $ne: null } }).toArray();
  let spent = 0;
  let answered = 0;
  for (const r of decided) {
    let mine = false;
    if (r.Bun_ID) {
      const bundle = await col("bundle").findOne({ Bun_ID: r.Bun_ID });
      mine = bundle && bundle.U_ID === userId;
    } else {
      const item = await col("item").findOne({ I_ID: r.I_ID });
      mine = item && item.U_ID === userId;
    }
    if (!mine) continue;
    spent += T.hoursBetween(r.Req_RequestedOn, r.Req_DecidedOn);
    answered++;
  }
  out.reply_hours = answered === 0 ? null : Math.round((spent / answered) * 10) / 10;
  return out;
}

async function lastPriceDrop(itemId) {
  const rows = await col("price_history").find({ I_ID: itemId }, { projection: { PH_ChangedOn: 1 } }).toArray();
  let max = null;
  for (const r of rows) if (max === null || String(r.PH_ChangedOn) > String(max)) max = r.PH_ChangedOn;
  return max;
}

async function itemJson(item, viewer) {
  const paths = await imagePaths(item.id);
  const json = itemToJson(item);
  json.cover = paths.length ? paths[0] : null;
  json.images = paths;
  json.image_count = paths.length;
  json.fair = fairPrice(item.originalPrice, item.conditionValue, item.ageInMonths);
  json.seller = await trustCard(item.ownerId);
  json.relevance = await relevance(item, viewer);
  json.last_price_drop_on = await lastPriceDrop(item.id);
  if (item.bundleId && (item.bundleStatus === "AVAILABLE" || item.bundleStatus === "REQUESTED")) {
    json.bundle = { bundle_id: item.bundleId, bundle_name: item.bundleName };
  } else {
    json.bundle = null;
  }
  return json;
}

async function itemJsonList(items, viewer) {
  const out = [];
  for (const item of items) out.push(await itemJson(item, viewer));
  return out;
}

/* ----------------------------------------------------------------- bundles */

async function bundleRow(bundleId) {
  return col("bundle").findOne({ Bun_ID: bundleId });
}

async function bundleJson(bundle, viewer) {
  const bundleId = bundle.Bun_ID;
  const percent = T.int(bundle, "Bun_DiscountPercent");
  const items = await itemsInBundle(bundleId);
  const itemList = await itemJsonList(items, viewer);
  const total = items.reduce((sum, item) => sum + item.sellingPrice, 0);
  const price = Math.round(total * (1 - percent / 100));
  return {
    bundle_id: bundleId,
    bundle_name: bundle.Bun_Name,
    discount_percent: percent,
    status: bundle.Bun_Status,
    created_on: bundle.Bun_CreatedOn,
    seller_id: bundle.U_ID,
    items: itemList,
    total_price: total,
    bundle_price: price,
    saving: total - price,
    seller: await trustCard(bundle.U_ID),
    cover: itemList.length ? itemList[0].cover : null,
  };
}

async function marketCover(bundleId) {
  const items = await col("item").find({ Bun_ID: bundleId }, { projection: { I_ID: 1 } }).toArray();
  const ids = items.map((i) => i.I_ID);
  if (!ids.length) return null;
  const rows = await col("item_image").find({ I_ID: { $in: ids } }).sort({ Img_IsPrimary: -1, Img_No: 1 }).limit(1).toArray();
  return rows.length ? rows[0].Img_Path : null;
}

/* ----------------------------------------------------------------- rentals */

async function rentalById(rentalId) {
  const row = await col("rental_item").findOne({ RI_ID: rentalId });
  return row ? decorateRental(row) : null;
}

async function decorateRental(row) {
  const category = await col("category").findOne({ Cat_ID: row.Cat_ID });
  return {
    id: row.RI_ID,
    name: row.RI_Name,
    description: row.RI_Description,
    conditionValue: row.RI_Condition,
    pickupLocation: row.RI_PickupLocation,
    status: row.RI_Status,
    listedOn: row.RI_ListedOn,
    ownerId: row.U_ID,
    categoryId: row.Cat_ID,
    categoryName: category ? category.Cat_Name : null,
    ratePerDay: T.valueOf(row.RI_RatePerDay),
    deposit: T.valueOf(row.RI_Deposit),
    maxDays: T.valueOf(row.RI_MaxDays, 1),
  };
}

async function rentalsActive() {
  const rows = await col("rental_item").find({ RI_Status: { $ne: "REMOVED" } }).sort({ RI_ID: -1 }).toArray();
  return Promise.all(rows.map(decorateRental));
}

async function rentalsByOwner(ownerId) {
  const rows = await col("rental_item").find({ U_ID: ownerId, RI_Status: { $ne: "REMOVED" } }).sort({ RI_ID: -1 }).toArray();
  return Promise.all(rows.map(decorateRental));
}

function rentalToJson(rental) {
  return {
    listing_id: rental.id,
    name: rental.name,
    description: rental.description,
    item_condition: rental.conditionValue,
    pickup_location: rental.pickupLocation,
    status: rental.status,
    listed_on: rental.listedOn,
    owner_id: rental.ownerId,
    category_id: rental.categoryId,
    category_name: rental.categoryName,
    cover: null,
    images: [],
    discount_percent: 0,
    rental_item_id: rental.id,
    rental_name: rental.name,
    rate_per_day: rental.ratePerDay,
    deposit_amount: rental.deposit,
    max_days: rental.maxDays,
  };
}

async function rentalJson(rental, viewer) {
  const rows = await col("rental_image").find({ RI_ID: rental.id }).sort({ RImg_No: 1 }).toArray();
  const paths = [];
  let primary = null;
  for (const row of rows) {
    paths.push(row.RImg_Path);
    if (T.truth(row.RImg_IsPrimary)) primary = row.RImg_Path;
  }
  if (primary === null && paths.length) primary = paths[0];
  const json = rentalToJson(rental);
  json.images = paths;
  json.cover = primary;
  json.owner = await trustCard(rental.ownerId);
  const booked = await col("rental_booking").find({ RI_ID: rental.id, Bk_Status: { $in: ["ACCEPTED", "HANDED_OVER"] } }).sort({ Bk_StartDate: 1 }).toArray();
  json.booked = booked.map((b) => ({ start_date: b.Bk_StartDate, end_date: b.Bk_EndDate }));
  return json;
}

async function bookingRow(bookingId) {
  return col("rental_booking").findOne({ Bk_ID: bookingId });
}

async function bookingJson(booking) {
  if (!booking) return null;
  const rental = await col("rental_item").findOne({ RI_ID: booking.RI_ID });
  const start = T.nz(booking.Bk_StartDate);
  const end = T.nz(booking.Bk_EndDate);
  const days = T.dayDiff(start, end) + 1;
  const rate = rental ? T.int(rental, "RI_RatePerDay") : 0;
  const coverRows = await col("rental_image").find({ RI_ID: booking.RI_ID }).sort({ RImg_IsPrimary: -1, RImg_No: 1 }).limit(1).toArray();
  const bill = await col("bill").findOne({ Bk_ID: booking.Bk_ID });
  return {
    booking_id: booking.Bk_ID,
    rental_item_id: booking.RI_ID,
    renter_id: booking.U_ID,
    buyer_id: booking.U_ID,
    start_date: start,
    end_date: end,
    requested_on: booking.Bk_RequestedOn,
    status: booking.Bk_Status,
    handed_over_on: booking.Bk_HandedOverOn,
    returned_on: booking.Bk_ReturnedOn,
    damage_note: booking.Bk_DamageNote,
    late_notified: false,
    rental_name: rental ? rental.RI_Name : null,
    cover: coverRows.length ? coverRows[0].RImg_Path : null,
    owner_id: rental ? rental.U_ID : null,
    owner_name: rental ? await userName(rental.U_ID) : "-",
    renter_name: await userName(booking.U_ID),
    rental_days: days,
    total_rent: days * rate,
    deposit_amount: rental ? T.int(rental, "RI_Deposit") : 0,
    rate_per_day: rate,
    pickup_location: rental ? rental.RI_PickupLocation : null,
    is_late: booking.Bk_Status === "HANDED_OVER" && end < T.today(),
    bill_id: bill ? bill.Bill_ID : null,
  };
}

/* ---------------------------------------------------------------- requests */

async function requestTarget(request) {
  const target = {};
  if (request.Bun_ID) {
    const bundle = await bundleRow(request.Bun_ID);
    const items = await col("item").find({ Bun_ID: request.Bun_ID }).toArray();
    const total = items.reduce((sum, i) => sum + T.int(i, "I_SellingPrice"), 0);
    const percent = bundle ? T.int(bundle, "Bun_DiscountPercent") : 0;
    target.kind = "BUNDLE";
    target.id = request.Bun_ID;
    target.name = bundle ? bundle.Bun_Name : null;
    target.price = Math.round(total * (1 - percent / 100));
    target.cover = await marketCover(request.Bun_ID);
  } else {
    const item = await col("item").findOne({ I_ID: request.I_ID });
    target.kind = "ITEM";
    target.id = request.I_ID;
    target.name = item ? item.I_Name : null;
    target.price = item ? T.int(item, "I_SellingPrice") : 0;
    target.cover = await cover(request.I_ID);
  }
  return target;
}

async function agreedPrice(request) {
  if (request.Req_Status !== "ACCEPTED") return null;
  const type = request.Req_Type;
  if (type === "SWAP") return 0;
  if (type === "OFFER") {
    return request.Req_CounterPrice === null || request.Req_CounterPrice === undefined
      ? T.valueOf(request.Req_OfferedPrice)
      : T.valueOf(request.Req_CounterPrice);
  }
  if (request.Bun_ID) {
    const items = await col("item").find({ Bun_ID: request.Bun_ID }).toArray();
    const total = items.reduce((sum, i) => sum + T.int(i, "I_SellingPrice"), 0);
    const bundle = await col("bundle").findOne({ Bun_ID: request.Bun_ID });
    const percent = bundle ? T.int(bundle, "Bun_DiscountPercent") : C.bundleDiscount;
    return Math.round(total * (1 - percent / 100));
  }
  const item = await col("item").findOne({ I_ID: request.I_ID });
  return item ? T.int(item, "I_SellingPrice") : 0;
}

async function requestJson(request, viewerId, sellerSide) {
  const requestId = request.Req_ID;
  const status = request.Req_Status;
  const json = {
    request_id: requestId,
    buyer_id: request.U_ID,
    request_type: request.Req_Type,
    message: T.nz(request.Req_Message),
    offered_price: request.Req_OfferedPrice === null || request.Req_OfferedPrice === undefined ? null : T.valueOf(request.Req_OfferedPrice),
    counter_price: request.Req_CounterPrice === null || request.Req_CounterPrice === undefined ? null : T.valueOf(request.Req_CounterPrice),
    counter_accepted: status === "ACCEPTED" && request.Req_CounterPrice !== null && request.Req_CounterPrice !== undefined,
    agreed_price: await agreedPrice(request),
    offered_item_id: request.Swap_I_ID,
    item_id: request.I_ID,
    bundle_id: request.Bun_ID,
    status,
    decided_on: request.Req_DecidedOn,
    handover_location: request.Req_HandoverLocation,
    handover_time: request.Req_HandoverTime,
    requested_on: request.Req_RequestedOn,
    expires_on: request.Req_ExpiresOn,
  };
  let sold;
  let sellerId;
  if (request.Bun_ID) {
    const bundle = await col("bundle").findOne({ Bun_ID: request.Bun_ID });
    sold = bundle && bundle.Bun_Status === "SOLD";
    sellerId = bundle ? bundle.U_ID : null;
  } else {
    const item = await col("item").findOne({ I_ID: request.I_ID });
    sold = item && item.I_Status === "SOLD";
    sellerId = item ? item.U_ID : null;
  }
  json.target = await requestTarget(request);
  json.sold = !!sold;
  const bill = await col("bill").findOne({ Req_ID: requestId });
  json.bill_id = bill ? bill.Bill_ID : null;
  if (sellerSide) {
    json.buyer_name = await userName(request.U_ID);
    const buyer = await col("student").findOne({ U_ID: request.U_ID });
    json.buyer_semester = buyer ? T.int(buyer, "St_Semester") : 0;
    if (request.Swap_I_ID === null || request.Swap_I_ID === undefined) {
      json.offered_item = null;
    } else {
      const offered = await col("item").findOne({ I_ID: request.Swap_I_ID });
      json.offered_item = offered
        ? {
          item_id: offered.I_ID,
          item_name: offered.I_Name,
          selling_price: T.int(offered, "I_SellingPrice"),
          status: offered.I_Status,
        }
        : null;
    }
  } else {
    json.seller = { user_id: sellerId, name: await userName(sellerId) };
    json.offered_item_name = request.Swap_I_ID === null || request.Swap_I_ID === undefined
      ? null
      : (await col("item").findOne({ I_ID: request.Swap_I_ID }, { projection: { I_Name: 1 } }))?.I_Name ?? null;
    json.pass = status === "ACCEPTED" && !sold ? passFor(requestId, request.Req_HandoverTime) : null;
    const rating = await col("rating").countDocuments({ Req_ID: requestId });
    json.rated = rating > 0;
  }
  return json;
}

/* ------------------------------------------------------------- pagination */

function pageOf(list, page, size) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  let current = page <= 0 ? 1 : page;
  if (current > pages) current = pages;
  const from = (current - 1) * size;
  const to = Math.min(from + size, total);
  return {
    items: list.slice(Math.min(from, total), to),
    total,
    page: current,
    pages,
  };
}

/* ------------------------------------------------------------ notifications */

function javaHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return hash;
}

function note(userId, type, text, link, created) {
  const stampText = T.normalize(created);
  const id = T.stamp(stampText) * 1000 + (Math.abs(javaHash(text)) % 1000);
  return {
    notification_id: id,
    user_id: userId,
    type,
    text,
    link,
    created_on: stampText,
  };
}

async function notifications(userId, role) {
  const notes = [];
  const cut = T.addDays(T.today(), -14) + " 00:00:00";

  if (role === "STUDENT") {
    const sent = await col("buy_request").find({ U_ID: userId, Req_Status: { $in: ["ACCEPTED", "REJECTED", "COUNTERED", "EXPIRED"] } })
      .sort({ Req_ID: -1 }).toArray();
    for (const request of sent) {
      const target = await requestTarget(request);
      const status = request.Req_Status;
      let sellerId;
      if (request.Bun_ID) {
        const bundle = await col("bundle").findOne({ Bun_ID: request.Bun_ID });
        sellerId = bundle ? bundle.U_ID : null;
      } else {
        const item = await col("item").findOne({ I_ID: request.I_ID });
        sellerId = item ? item.U_ID : null;
      }
      let text;
      let created;
      if (status === "ACCEPTED") {
        text = `${await userName(sellerId)} accepted your request for ${target.name}. Meet at ${T.nz(request.Req_HandoverLocation)}.`;
        created = request.Req_DecidedOn;
      } else if (status === "REJECTED") {
        text = `Your request for ${target.name} was rejected.`;
        created = request.Req_DecidedOn;
      } else if (status === "COUNTERED") {
        text = `${await userName(sellerId)} countered your offer for ${target.name} with ${T.int(request, "Req_CounterPrice")}.`;
        created = request.Req_DecidedOn;
      } else {
        text = `Your request for ${target.name} expired.`;
        created = request.Req_ExpiresOn + " 00:00:00";
      }
      notes.push(note(userId, status, text, "#/requests", created));
    }

    const received = await col("buy_request").find({ Req_Status: "PENDING" }).sort({ Req_ID: -1 }).toArray();
    for (const request of received) {
      let mine = false;
      if (request.Bun_ID) {
        const bundle = await col("bundle").findOne({ Bun_ID: request.Bun_ID });
        mine = bundle && bundle.U_ID === userId;
      } else {
        const item = await col("item").findOne({ I_ID: request.I_ID });
        mine = item && item.U_ID === userId;
      }
      if (!mine) continue;
      const target = await requestTarget(request);
      const text = `${await userName(request.U_ID)} sent a ${T.nz(request.Req_Type).toLowerCase()} request for ${target.name}.`;
      notes.push(note(userId, "REQUEST", text, "#/requests", request.Req_RequestedOn));
    }

    const bookings = await col("rental_booking").find({}).sort({ Bk_ID: -1 }).toArray();
    for (const booking of bookings) {
      const rental = await col("rental_item").findOne({ RI_ID: booking.RI_ID });
      if (!rental) continue;
      const ownerId = rental.U_ID;
      const renterId = booking.U_ID;
      const status = booking.Bk_Status;
      const name = rental.RI_Name;
      if (userId === ownerId && status === "PENDING") {
        notes.push(note(userId, "RENTAL", `${await userName(renterId)} wants to rent ${name} from ${booking.Bk_StartDate} to ${booking.Bk_EndDate}.`, "#/my-rentals", booking.Bk_RequestedOn));
      }
      if (userId === renterId && status === "ACCEPTED") {
        notes.push(note(userId, "RENTAL", `${await userName(ownerId)} accepted your booking for ${name}.`, "#/my-rentals", booking.Bk_RequestedOn));
      }
      if (userId === renterId && status === "HANDED_OVER") {
        notes.push(note(userId, "RENTAL", `${name} was handed over. Return it by ${booking.Bk_EndDate}.`, "#/my-rentals", booking.Bk_HandedOverOn));
      }
      if (status === "HANDED_OVER" && T.dayDiff(booking.Bk_EndDate, T.today()) > 0) {
        if (userId === renterId) {
          notes.push(note(userId, "RENTAL_LATE", `${name} was due back on ${booking.Bk_EndDate}. Please return it.`, "#/my-rentals", booking.Bk_EndDate + " 00:00:00"));
        }
        if (userId === ownerId) {
          notes.push(note(userId, "RENTAL_LATE", `${await userName(renterId)} has not returned ${name} yet.`, "#/my-rentals", booking.Bk_EndDate + " 00:00:00"));
        }
      }
    }

    const matches = await col("wish_match").find({ WM_IsSeen: 0 }).sort({ WM_ID: -1 }).toArray();
    for (const match of matches) {
      const wish = await col("wishlist").findOne({ W_ID: match.W_ID });
      if (!wish || wish.U_ID !== userId) continue;
      const item = await col("item").findOne({ I_ID: match.I_ID });
      notes.push(note(userId, "MATCH", `New match for your wish: ${T.nz(item ? item.I_Name : "")}.`, "#/item/" + match.I_ID, match.WM_MatchedOn + " 00:00:00"));
    }

    const st = await col("student").findOne({ U_ID: userId });
    if (st && st.St_VerificationStatus === "PENDING") {
      const user = await col("users").findOne({ U_ID: userId });
      notes.push(note(userId, "VERIFICATION", "Your ID card check is waiting for a manual review by an admin.", "#/", T.nz(user && user.U_RegisteredOn) + " 00:00:00"));
    } else if (st && st.St_VerificationStatus === "REJECTED") {
      const onRows = await col("verifies").find({ Student_U_ID: userId, Ver_Decision: "REJECTED" }).toArray();
      let on = null;
      for (const row of onRows) if (on === null || row.Ver_On > on) on = row.Ver_On;
      const user = await col("users").findOne({ U_ID: userId });
      const created = T.nz(on) === "" ? T.nz(user && user.U_RegisteredOn) + " 00:00:00" : on + " 00:00:00";
      notes.push(note(userId, "VERIFICATION", `Your verification was not accepted: ${T.nz(st.St_FlagReason)}`, "#/", created));
    }
  }

  const bills = await col("bill").find({}).sort({ Bill_ID: -1 }).toArray();
  for (const bill of bills) {
    let involved = false;
    let label = null;
    if (bill.Req_ID) {
      const request = await col("buy_request").findOne({ Req_ID: bill.Req_ID });
      if (request) {
        const item = request.I_ID ? await col("item").findOne({ I_ID: request.I_ID }) : null;
        const bundle = request.Bun_ID ? await col("bundle").findOne({ Bun_ID: request.Bun_ID }) : null;
        involved = request.U_ID === userId || (item && item.U_ID === userId) || (bundle && bundle.U_ID === userId);
        label = item ? item.I_Name : null;
        if (label === null && bundle) label = bundle.Bun_Name;
      }
    }
    if (bill.Bk_ID) {
      const booking = await col("rental_booking").findOne({ Bk_ID: bill.Bk_ID });
      if (booking) {
        const rental = await col("rental_item").findOne({ RI_ID: booking.RI_ID });
        involved = booking.U_ID === userId || (rental && rental.U_ID === userId);
        label = rental ? rental.RI_Name : null;
      }
    }
    if (!involved) continue;
    notes.push(note(userId, "BILL", `Bill ${bill.Bill_No} for ${T.nz(label)} is ready.`, "#/bill/" + bill.Bill_ID, bill.Bill_IssuedOn));
  }

  const recent = notes.filter((n) => n.created_on >= cut);
  recent.sort((a, b) => {
    if (b.created_on !== a.created_on) return b.created_on > a.created_on ? 1 : -1;
    return b.notification_id - a.notification_id;
  });
  return recent;
}

/* ----------------------------------------------------------------- settings */

async function settings() {
  const row = await col("site_setting").findOne({ Set_Key: "CLEAROUT_MODE" });
  return { farewell_banner: T.nz(row && row.Set_Value) === "1" };
}

module.exports = {
  fairPrice,
  passFor,
  userName,
  userEmail,
  userJson,
  student,
  studentJson,
  itemToJson,
  itemById,
  itemsLive,
  itemsBySeller,
  itemsInBundle,
  itemsBySubject,
  itemJson,
  itemJsonList,
  imagePaths,
  cover,
  allBranchId,
  subjectIds,
  wishMatches,
  relevance,
  trustCard,
  lastPriceDrop,
  bundleRow,
  bundleJson,
  marketCover,
  rentalById,
  rentalsActive,
  rentalsByOwner,
  rentalJson,
  rentalToJson,
  bookingRow,
  bookingJson,
  requestTarget,
  agreedPrice,
  requestJson,
  pageOf,
  notifications,
  settings,
  numeric: T.numeric,
};
