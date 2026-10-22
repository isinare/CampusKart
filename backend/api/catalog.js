const { col, nextId } = require("../db");
const C = require("../config");
const T = require("../util");
const V = require("../views");
const R = require("../rules");
const G = require("./guard");
const { ok } = require("../resp");

const OPEN = ["PENDING", "COUNTERED"];

async function viewer(session) {
  return session ? V.student(session.userId) : null;
}

function allowed(values, value) {
  return values.includes(value);
}

function compareNew(a, b) {
  const da = String(a.listed_on || "");
  const db = String(b.listed_on || "");
  if (da !== db) return db < da ? -1 : 1;
  return V.numeric(String(b.item_id || "")) - V.numeric(String(a.item_id || ""));
}

function sortNew(list) {
  list.sort(compareNew);
}

function score(item) {
  return item.relevance ? T.valueOf(item.relevance.score, 0) : -1;
}

/* --------------------------------------------------------------- home page */

async function stats() {
  return {
    items: (await col("item").countDocuments({ I_Status: { $in: ["AVAILABLE", "BUY_REQUESTED"] } })),
    bundles: await col("bundle").countDocuments({ Bun_Status: "AVAILABLE" }),
    rentals: await col("rental_item").countDocuments({ RI_Status: "AVAILABLE" }),
  };
}

async function home(session) {
  await R.runSweep();
  const me = await viewer(session);
  const live = await V.itemJsonList(await V.itemsLive(), me);
  sortNew(live);
  const out = { just_listed: live.slice(0, 6), stats: await stats() };
  if (me) {
    const kit = await semesterKit(me);
    out.kit = { covered: kit.covered, total: kit.total };
    const mine = await col("wishlist").countDocuments({ U_ID: me.userId, W_IsActive: 1 });
    const newMatches = await col("wish_match").aggregate([
      { $lookup: { from: "wishlist", localField: "W_ID", foreignField: "W_ID", as: "w" } },
      { $unwind: "$w" },
      { $match: { "w.U_ID": me.userId, WM_IsSeen: 0 } },
      { $count: "n" },
    ]).toArray();
    out.wishes = { count: mine, new_matches: newMatches.length ? newMatches[0].n : 0 };
    const picked = live
      .filter((item) => item.seller_id !== me.userId && item.relevance && T.valueOf(item.relevance.score, 0) >= 40)
      .sort((a, b) => score(b) - score(a));
    out.picked = picked.slice(0, 8);
  }
  return out;
}

/* ------------------------------------------------------------ listing page */

async function listItems(request, session) {
  await R.runSweep();
  const me = await viewer(session);
  const list = await V.itemJsonList(await V.itemsLive(), me);
  const q = request.s("q").toLowerCase();
  const kind = request.s("kind");
  const category = request.s("category_id");
  const branch = request.s("branch_id");
  const condition = request.s("condition");
  const subject = request.s("subject_id");
  const pickup = request.s("pickup");
  const semester = request.i("semester", 0);
  const minPrice = request.i("min_price", 0);
  const maxPrice = request.i("max_price", 0);
  const all = await V.allBranchId();
  const filtered = list.filter((item) => {
    if (q && !(`${item.item_name} ${item.description} ${item.subject_name || ""} ${item.brand || ""}`.toLowerCase().includes(q))) return false;
    if (kind && kind !== item.item_kind) return false;
    if (category && category !== item.category_id) return false;
    if (branch && !(item.item_kind === "ACADEMIC" && (branch === item.branch_id || T.nz(all) === item.branch_id))) return false;
    if (semester > 0 && !(item.item_kind === "ACADEMIC" && semester === T.valueOf(item.target_semester, 0))) return false;
    if (condition && condition !== item.item_condition) return false;
    if (subject && subject !== item.subject_id) return false;
    if (minPrice > 0 && T.valueOf(item.selling_price, 0) < minPrice) return false;
    if (maxPrice > 0 && T.valueOf(item.selling_price, 0) > maxPrice) return false;
    if (pickup && pickup !== item.pickup_location) return false;
    return true;
  });
  const sort = request.s("sort");
  if (sort === "price_asc") {
    filtered.sort((a, b) => T.valueOf(a.selling_price, 0) - T.valueOf(b.selling_price, 0));
  } else if (sort === "price_desc") {
    filtered.sort((a, b) => T.valueOf(b.selling_price, 0) - T.valueOf(a.selling_price, 0));
  } else if (sort === "new" || me === null) {
    sortNew(filtered);
  } else {
    filtered.sort((a, b) => {
      const byScore = score(b) - score(a);
      return byScore !== 0 ? byScore : compareNew(a, b);
    });
  }
  return V.pageOf(filtered, request.i("page", 1), C.pageSize);
}

async function getItem(request, session) {
  await R.runSweep();
  const me = await viewer(session);
  const itemId = request.s("item_id");
  const item = await V.itemById(itemId);
  if (!item) throw new T.ApiError("Item not found.");
  if (me) {
    const mine = await col("wishlist").find({ U_ID: me.userId }, { projection: { W_ID: 1 } }).toArray();
    if (mine.length) {
      await col("wish_match").updateMany({ I_ID: itemId, W_ID: { $in: mine.map((w) => w.W_ID) } }, { $set: { WM_IsSeen: 1 } });
    }
  }
  const raw = await col("item_status_log").find({ I_ID: itemId }).sort({ Log_No: 1 }).toArray();
  const log = raw.map((row) => ({
    item_id: itemId,
    log_no: row.Log_No,
    old_status: row.Log_OldStatus,
    new_status: row.Log_NewStatus,
    changed_at: row.Log_ChangedAt,
    changed_by: row.U_ID,
    remark: T.nz(row.Log_Remark),
  }));
  let myRequest = null;
  const swap = [];
  if (session) {
    const row = await col("buy_request").findOne(
      { I_ID: itemId, U_ID: session.userId },
      { sort: { Req_ID: -1 } }
    );
    if (row) myRequest = await V.requestJson(row, session.userId, false);
    if (me) {
      const mine = await V.itemsBySeller(me.userId, true);
      for (const choice of mine) {
        if (choice.bundleId || choice.id === itemId) continue;
        swap.push({ item_id: choice.id, item_name: choice.name, selling_price: choice.sellingPrice });
      }
    }
  }
  return { item: await V.itemJson(item, me), log, my_request: myRequest, swap_choices: swap };
}

async function myItems(session) {
  const me = await G.student(session);
  await R.runSweep();
  const items = await V.itemsBySeller(me.userId, false);
  const out = [];
  for (const item of items) {
    const json = await V.itemJson(item, me);
    json.waiting = await col("buy_request").countDocuments({ I_ID: item.id, Req_Status: { $in: ["PENDING", "COUNTERED"] } });
    out.push(json);
  }
  const accepted = await col("buy_request").find({ Req_Status: "ACCEPTED" }).toArray();
  let deals = 0;
  let earned = 0;
  for (const request of accepted) {
    let sold = false;
    if (request.Bun_ID) {
      const bundle = await col("bundle").findOne({ Bun_ID: request.Bun_ID });
      sold = !!bundle && bundle.U_ID === me.userId && bundle.Bun_Status === "SOLD";
    } else {
      const item = await col("item").findOne({ I_ID: request.I_ID });
      sold = !!item && item.U_ID === me.userId && item.I_Status === "SOLD";
    }
    if (sold) {
      deals++;
      const amount = await V.agreedPrice(request);
      earned += amount === null ? 0 : amount;
    }
  }
  return { items: out, total_earned: earned, deals };
}

/* -------------------------------------------------------------- create/edit */

async function matchWishes(item) {
  const wishes = await col("wishlist").find({ W_IsActive: 1 }).toArray();
  for (const wish of wishes) {
    if (!wishMatches(item, wish.Sub_ID, wish.Cat_ID, T.nz(wish.W_Keyword), T.int(wish, "W_MaxPrice"), wish.U_ID)) continue;
    const exists = await col("wish_match").countDocuments({ W_ID: wish.W_ID, I_ID: item.id });
    if (exists > 0) continue;
    const id = await nextId("wish_match");
    await col("wish_match").insertOne({ _id: id, WM_ID: id, WM_MatchedOn: T.today(), WM_IsSeen: 0, W_ID: wish.W_ID, I_ID: item.id });
  }
}

function wishMatches(item, subjectId, categoryId, keyword, maxPrice, ownerId) {
  if (ownerId && ownerId === item.ownerId) return false;
  if (subjectId && subjectId !== item.subjectId) return false;
  if (categoryId && categoryId !== item.categoryId) return false;
  if (keyword && !(`${item.name} ${item.description}`.toLowerCase().includes(keyword.toLowerCase()))) return false;
  if (maxPrice > 0 && item.sellingPrice > maxPrice) return false;
  return true;
}

async function createItem(request, session) {
  const me = await G.verifiedStudent(session);
  const categoryId = request.s("category_id");
  const category = await col("category").findOne({ Cat_ID: categoryId });
  if (!category) throw new T.ApiError("Choose a category.");
  const name = T.trim(request.s("item_name"));
  const description = T.trim(request.s("description"));
  if (!name) throw new T.ApiError("Item name is required.");
  if (description.length < 30) throw new T.ApiError("Description must be at least 30 characters.");
  if (name.length > 60) throw new T.ApiError("Item name can be at most 60 characters.");
  if (description.length > 200) throw new T.ApiError("Description can be at most 200 characters.");
  const pickup = request.s("pickup_location");
  if (!pickup) throw new T.ApiError("Choose a pickup place.");
  const condition = request.s("item_condition");
  if (!allowed(C.conditions, condition)) throw new T.ApiError("Choose the condition.");
  const original = request.i("original_price", 0);
  const selling = request.i("selling_price", 0);
  if (original <= 0 || selling <= 0 || selling > original) {
    throw new T.ApiError("Your price must be above 0 and not above the original price.");
  }
  const photos = request.photos();
  if (photos.length < 3 || photos.length > 5) throw new T.ApiError("A listing needs 3 to 5 clear photos.");
  const academic = T.truth(category.Cat_IsAcademic);
  const subjectId = request.s("subject_id");
  const branchId = request.s("branch_id");
  const targetSemester = request.i("target_semester", 0);
  const edition = T.trim(request.s("edition"));
  const brand = T.trim(request.s("brand"));
  const ageInMonths = request.i("age_in_months", 0);
  if (academic) {
    if (!subjectId || !branchId) throw new T.ApiError("Choose the subject and branch.");
    if (targetSemester < 1 || targetSemester > 8) throw new T.ApiError("Target semester must be 1 to 8.");
    if (!edition) throw new T.ApiError("Edition or model is required.");
  } else {
    if (!brand) throw new T.ApiError("Brand is required (write No brand if none).");
    if (!request.s("age_in_months") || ageInMonths < 0) throw new T.ApiError("Age in months is required.");
  }
  const itemId = await nextId("item");
  await col("item").insertOne({
    _id: itemId,
    I_ID: itemId,
    I_Name: name,
    I_Description: description,
    I_OriginalPrice: original,
    I_SellingPrice: selling,
    I_Condition: condition,
    I_PickupLocation: pickup,
    I_Status: "AVAILABLE",
    I_Kind: academic ? "ACADEMIC" : "GENERAL",
    I_ListedOn: T.today(),
    U_ID: me.userId,
    Cat_ID: categoryId,
    Bun_ID: null,
  });
  if (academic) {
    await col("academic_item").insertOne({
      _id: itemId,
      I_ID: itemId,
      AI_TargetSemester: targetSemester,
      AI_Edition: edition,
      Sub_ID: subjectId,
      Br_ID: branchId,
    });
  } else {
    await col("general_item").insertOne({ _id: itemId, I_ID: itemId, GI_Brand: brand, GI_AgeInMonths: ageInMonths });
  }
  const cover = request.i("cover", 0);
  for (let i = 0; i < photos.length; i++) {
    const imageId = await nextId("item_image");
    await col("item_image").insertOne({
      _id: imageId,
      Img_ID: imageId,
      Img_No: i + 1,
      Img_Path: photos[i],
      Img_IsPrimary: i === cover ? 1 : 0,
      I_ID: itemId,
    });
  }
  // AFTER INSERT trigger: first status log row.
  const logId = await nextId("item_status_log");
  await col("item_status_log").insertOne({
    _id: logId,
    Log_ID: logId,
    Log_No: 1,
    Log_OldStatus: null,
    Log_NewStatus: "AVAILABLE",
    Log_ChangedAt: T.now(),
    Log_Remark: "Item listed",
    I_ID: itemId,
    U_ID: me.userId,
  });
  const created = await V.itemById(itemId);
  await matchWishes(created);
  await R.checkFraud(me.userId);
  return { item_id: itemId };
}

async function updateItem(request, session) {
  const me = await G.verifiedStudent(session);
  const itemId = request.s("item_id");
  const item = await V.itemById(itemId);
  if (!item || item.ownerId !== me.userId) throw new T.ApiError("Not your item.");
  if (item.status !== "AVAILABLE") throw new T.ApiError("You can edit an item only while it is available.");
  const name = T.trim(request.s("item_name"));
  const description = T.trim(request.s("description"));
  if (!name) throw new T.ApiError("Item name is required.");
  if (description.length < 30) throw new T.ApiError("Description must be at least 30 characters.");
  if (name.length > 60) throw new T.ApiError("Item name can be at most 60 characters.");
  if (description.length > 200) throw new T.ApiError("Description can be at most 200 characters.");
  if (!request.s("pickup_location")) throw new T.ApiError("Choose a pickup place.");
  if (!allowed(C.conditions, request.s("item_condition"))) throw new T.ApiError("Choose the condition.");
  const selling = request.i("selling_price", 0);
  if (selling <= 0 || selling > item.originalPrice) {
    throw new T.ApiError("Your price must be above 0 and not above the original price.");
  }
  await R.updateItemFields(itemId, {
    I_Name: name,
    I_Description: description,
    I_SellingPrice: selling,
    I_Condition: request.s("item_condition"),
    I_PickupLocation: request.s("pickup_location"),
  });
  await R.checkFraud(me.userId);
  return ok();
}

async function withdrawItem(request, session) {
  const me = await G.verifiedStudent(session);
  const itemId = request.s("item_id");
  const item = await V.itemById(itemId);
  if (!item || item.ownerId !== me.userId) throw new T.ApiError("Not your item.");
  if (item.bundleId) {
    const bundle = await col("bundle").findOne({ Bun_ID: item.bundleId });
    const status = bundle ? bundle.Bun_Status : null;
    if (status !== "REMOVED" && status !== "SOLD") {
      throw new T.ApiError("This item is in a bundle. Withdraw the bundle first.");
    }
  }
  if (item.status !== "AVAILABLE" && item.status !== "BUY_REQUESTED") {
    throw new T.ApiError("This item can no longer be withdrawn.");
  }
  await col("buy_request").updateMany(
    { I_ID: itemId, Req_Status: { $in: OPEN } },
    { $set: { Req_Status: "REJECTED", Req_DecidedOn: T.now() } }
  );
  const fresh = await col("item").findOne({ I_ID: itemId });
  if (fresh && (fresh.I_Status === "AVAILABLE" || fresh.I_Status === "BUY_REQUESTED")) {
    await R.moveItemStatus(fresh, "REMOVED");
  }
  return ok();
}

/* --------------------------------------------------------------- seller card */

async function sellerCard(request, session) {
  const userId = request.s("user_id");
  const me = await viewer(session);
  const out = await V.trustCard(userId);
  const ratings = await col("rating").aggregate([
    { $lookup: { from: "buy_request", localField: "Req_ID", foreignField: "Req_ID", as: "r" } },
    { $unwind: "$r" },
    { $lookup: { from: "item", localField: "r.I_ID", foreignField: "I_ID", as: "i" } },
    { $lookup: { from: "bundle", localField: "r.Bun_ID", foreignField: "Bun_ID", as: "b" } },
    {
      $match: {
        $or: [
          { "i.U_ID": userId, "i.I_Status": "SOLD" },
          { "b.U_ID": userId, "b.Bun_Status": "SOLD" },
        ],
      },
    },
  ]).toArray();
  const reviews = [];
  for (const row of ratings) {
    const request = await col("buy_request").findOne({ Req_ID: row.Req_ID });
    reviews.push({
      stars: row.Rat_Stars,
      review: row.Rat_Review,
      rated_on: row.Rat_RatedOn,
      buyer_name: request ? await V.userName(request.U_ID) : "-",
      item_name: request ? (await V.requestTarget(request)).name : "-",
    });
  }
  const available = await V.itemsBySeller(userId, true);
  const items = [];
  for (const item of available) items.push(await V.itemJson(item, me));
  out.reviews = reviews;
  out.items = items;
  return out;
}

/* ------------------------------------------------------------- semester kit */

async function semesterKit(me) {
  const ids = await V.subjectIds(me);
  const all = await V.allBranchId();
  const bundles = await col("bundle").find({ Bun_Status: { $in: ["AVAILABLE", "REQUESTED"] }, U_ID: { $ne: me.userId } })
    .sort({ Bun_ID: -1 }).toArray();
  const bundledSubjects = new Set();
  const bundleList = [];
  for (const bundle of bundles) {
    const items = await V.itemsInBundle(bundle.Bun_ID);
    let relevant = false;
    for (const item of items) {
      if (item.subjectId) {
        bundledSubjects.add(item.subjectId);
        if (ids.includes(item.subjectId)) relevant = true;
      }
    }
    if (relevant) bundleList.push(await V.bundleJson(bundle, me));
  }
  const subjects = [];
  let covered = 0;
  let cheapestTotal = 0;
  for (const subjectId of ids) {
    const items = await V.itemsBySubject(subjectId);
    const shown = [];
    for (const item of items) {
      if (item.status !== "AVAILABLE" || item.ownerId === me.userId) continue;
      if (item.bundleId) {
        const bundle = await col("bundle").findOne({ Bun_ID: item.bundleId });
        if (bundle && bundle.Bun_Status !== "REMOVED") continue;
      }
      shown.push(await V.itemJson(item, me));
    }
    shown.sort((a, b) => T.valueOf(a.selling_price, 0) - T.valueOf(b.selling_price, 0));
    const viaBundle = bundledSubjects.has(subjectId);
    const subject = await col("subject").findOne({ Sub_ID: subjectId });
    const cheapest = shown.length ? T.valueOf(shown[0].selling_price, 0) : 0;
    subjects.push({
      subject_id: subjectId,
      subject_name: subject ? subject.Sub_Name : "",
      subject_code: subject ? subject.Sub_Code : "",
      items: shown,
      via_bundle: viaBundle,
      covered: shown.length > 0 || viaBundle,
      cheapest: shown.length ? cheapest : null,
    });
    if (shown.length || viaBundle) covered++;
    cheapestTotal += cheapest;
  }
  return {
    semester: me.semester,
    branch: me.branchCode,
    subjects,
    covered,
    total: ids.length,
    cheapest_total: cheapestTotal,
    bundles: bundleList,
    all_branch_id: all,
  };
}

/* ----------------------------------------------------------------- clearout */

async function clearoutPreview(me) {
  const mine = await V.itemsBySeller(me.userId, true);
  const today = T.today();
  const out = [];
  for (const item of mine) {
    const floor = Math.ceil(item.originalPrice * 0.4);
    const next = Math.max(floor, Math.round(item.sellingPrice * 0.9));
    let reason = "";
    const days = T.dayDiff(item.listedOn, today);
    const dropped = await V.lastPriceDrop(item.id);
    if (days < 7) reason = "Listed less than 7 days ago";
    else if (dropped !== null && T.dayDiff(dropped, today) < 7) reason = "Price already lowered this week";
    else if (next >= item.sellingPrice) reason = "Already at the 40% floor";
    out.push({
      item_id: item.id,
      item_name: item.name,
      original_price: item.originalPrice,
      current_price: item.sellingPrice,
      new_price: next,
      floor_price: floor,
      eligible: reason === "",
      reason,
      days_listed: days,
    });
  }
  return out;
}

async function clearoutApply(request, session) {
  const me = await G.verifiedStudent(session);
  const wanted = request.stringList("item_ids");
  const preview = await clearoutPreview(me);
  let updated = 0;
  for (const row of preview) {
    if (!T.truth(row.eligible) || !wanted.includes(T.nz(row.item_id))) continue;
    const item = await col("item").findOne({ I_ID: row.item_id });
    if (item && item.I_Status === "AVAILABLE") {
      await R.updateItemFields(row.item_id, { I_SellingPrice: row.new_price });
      updated++;
    }
  }
  if (updated === 0) throw new T.ApiError("Nothing to apply.");
  return { updated };
}

/* ------------------------------------------------------------------- report */

async function report(request, session) {
  const me = await G.student(session);
  const itemId = request.s("item_id");
  const item = await col("item").findOne({ I_ID: itemId });
  if (!item) throw new T.ApiError("Item not found.");
  if (item.U_ID === me.userId) throw new T.ApiError("You cannot report your own item.");
  if ((await col("report").countDocuments({ U_ID: me.userId, I_ID: itemId })) > 0) {
    throw new T.ApiError("You already reported this item.");
  }
  const reason = request.s("reason");
  if (!allowed(C.reportReasons, reason)) throw new T.ApiError("Pick a reason.");
  let details = request.s("details");
  if (details.length > 100) details = details.substring(0, 100);
  const id = await nextId("report");
  await col("report").insertOne({
    _id: id,
    Rep_ID: id,
    Rep_Reason: reason,
    Rep_Details: details,
    Rep_ReportedOn: T.today(),
    Rep_Status: "OPEN",
    U_ID: me.userId,
    I_ID: itemId,
  });
  await R.checkFraud(item.U_ID);
  return ok();
}

/* ------------------------------------------------------------------ wishlist */

async function wishlist(session) {
  const me = await G.student(session);
  const wishes = await col("wishlist").find({ U_ID: me.userId, W_IsActive: 1 }).sort({ W_ID: -1 }).toArray();
  const out = [];
  for (const wish of wishes) {
    const matches = await col("wish_match").find({ W_ID: wish.W_ID }).sort({ WM_ID: -1 }).toArray();
    const matched = [];
    for (const match of matches) {
      const item = await V.itemById(match.I_ID);
      if (!item || (item.status !== "AVAILABLE" && item.status !== "BUY_REQUESTED")) continue;
      const json = await V.itemJson(item, me);
      json.is_new = !T.truth(match.WM_IsSeen);
      matched.push(json);
    }
    const category = await col("category").findOne({ Cat_ID: wish.Cat_ID });
    const subject = await col("subject").findOne({ Sub_ID: wish.Sub_ID });
    out.push({
      wish_id: wish.W_ID,
      student_id: wish.U_ID,
      subject_id: wish.Sub_ID === undefined ? null : wish.Sub_ID,
      category_id: wish.Cat_ID === undefined ? null : wish.Cat_ID,
      keyword: wish.W_Keyword === undefined ? null : wish.W_Keyword,
      max_price: wish.W_MaxPrice,
      created_on: wish.W_CreatedOn,
      is_active: T.truth(wish.W_IsActive),
      category_name: category ? category.Cat_Name : null,
      subject_name: subject ? subject.Sub_Name : null,
      matches: matched,
    });
  }
  return out;
}

async function addWish(request, session) {
  const me = await G.student(session);
  const keyword = T.trim(request.s("keyword"));
  if (!keyword) throw new T.ApiError("Keyword is required.");
  if (keyword.length > 40) throw new T.ApiError("Keyword can be at most 40 characters.");
  const maxPrice = request.i("max_price", 0);
  if (maxPrice <= 0) throw new T.ApiError("Maximum price is required.");
  const subjectId = request.s("subject_id");
  const categoryId = request.s("category_id");
  const wishId = await nextId("wishlist");
  await col("wishlist").insertOne({
    _id: wishId,
    W_ID: wishId,
    W_Keyword: keyword,
    W_MaxPrice: maxPrice,
    W_CreatedOn: T.today(),
    W_IsActive: 1,
    U_ID: me.userId,
    Sub_ID: subjectId === "" ? null : subjectId,
    Cat_ID: categoryId === "" ? null : categoryId,
  });
  const live = await V.itemsLive();
  for (const item of live) {
    if (item.ownerId === me.userId) continue;
    if (item.status !== "AVAILABLE") continue;
    if (!wishMatches(item, subjectId, categoryId, keyword, maxPrice, me.userId)) continue;
    if ((await col("wish_match").countDocuments({ W_ID: wishId, I_ID: item.id })) > 0) continue;
    const id = await nextId("wish_match");
    await col("wish_match").insertOne({ _id: id, WM_ID: id, WM_MatchedOn: T.today(), WM_IsSeen: 0, W_ID: wishId, I_ID: item.id });
  }
  return ok();
}

async function removeWish(request, session) {
  const me = await G.student(session);
  await col("wishlist").updateOne({ W_ID: request.s("wish_id"), U_ID: me.userId }, { $set: { W_IsActive: 0 } });
  return ok();
}

async function rate(request, session) {
  const me = await G.student(session);
  const requestId = request.s("request_id");
  const row = await col("buy_request").findOne({ Req_ID: requestId });
  if (!row || row.U_ID !== me.userId) throw new T.ApiError("Only the buyer can rate.");
  let sold;
  if (row.Bun_ID) {
    const bundle = await col("bundle").findOne({ Bun_ID: row.Bun_ID });
    sold = !!bundle && bundle.Bun_Status === "SOLD";
  } else {
    const item = await col("item").findOne({ I_ID: row.I_ID });
    sold = !!item && item.I_Status === "SOLD";
  }
  if (row.Req_Status !== "ACCEPTED" || !sold) {
    throw new T.ApiError("You can rate the seller after the sale is complete.");
  }
  if ((await col("rating").countDocuments({ Req_ID: requestId })) > 0) {
    throw new T.ApiError("You already rated this deal.");
  }
  const stars = request.i("stars", 0);
  if (stars < 1 || stars > 5) throw new T.ApiError("Stars must be 1 to 5.");
  let review = request.s("review");
  if (review.length > 100) review = review.substring(0, 100);
  const id = await nextId("rating");
  await col("rating").insertOne({ _id: id, Rat_ID: id, Rat_Stars: stars, Rat_Review: review, Rat_RatedOn: T.today(), Req_ID: requestId });
  return ok();
}

const NAMES = [
  "home", "listItems", "getItem", "fairPrice", "myItems", "createItem", "updateItem", "withdrawItem",
  "sellerCard", "semesterKit", "clearoutPreview", "clearoutApply", "report", "notifications", "wishlist",
  "addWish", "removeWish", "rate",
];

async function handle(name, request, session) {
  switch (name) {
    case "home": return home(session);
    case "listItems": return listItems(request, session);
    case "getItem": return getItem(request, session);
    case "fairPrice": return V.fairPrice(request.i("original_price", 0), request.s("item_condition"), request.i("age_in_months", 0));
    case "myItems": return myItems(session);
    case "createItem": return createItem(request, session);
    case "updateItem": return updateItem(request, session);
    case "withdrawItem": return withdrawItem(request, session);
    case "sellerCard": return sellerCard(request, session);
    case "semesterKit": return semesterKit(await G.student(session));
    case "clearoutPreview": return clearoutPreview(await G.verifiedStudent(session));
    case "clearoutApply": return clearoutApply(request, session);
    case "report": return report(request, session);
    case "notifications": {
      const s = await G.user(session);
      await R.runSweep();
      return V.notifications(s.userId, s.role);
    }
    case "wishlist": return wishlist(session);
    case "addWish": return addWish(request, session);
    case "removeWish": return removeWish(request, session);
    case "rate": return rate(request, session);
    default: return undefined;
  }
}

module.exports = { handle, names: NAMES, semesterKit };
