import { api, session, BUNDLE_DISCOUNT } from "./api.js";

// The React shell mounts the containers first, then hands the view layer the
// #app element it renders into (see startLegacyApp below).
let $app = null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
let META = null, SETTINGS = {};

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const asDate = s => new Date(String(s).replace(" ", "T"));
const fmt = s => s ? asDate(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "-";
const fmtD = s => s ? asDate(String(s).slice(0, 10)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";
const nice = s => String(s || "").replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase());
const pluralize = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const opts = (arr, v, l, sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : "") + arr.map(x => `<option value="${esc(x[v])}" ${String(x[v]) === String(sel) ? "selected" : ""}>${esc(x[l])}</option>`).join("");
const formData = f => Object.fromEntries(new FormData(f).entries());
const qs = o => Object.entries(o).filter(([, v]) => v !== "" && v != null).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
const me = () => session();

const STATUS_CHIP = { AVAILABLE: "green", BUY_REQUESTED: "amber", ACCEPTED: "blue", SOLD: "dark", REMOVED: "red", PENDING: "amber", COUNTERED: "orange", REJECTED: "red", EXPIRED: "", CANCELLED: "", OPEN: "amber", RESOLVED: "green", DISMISSED: "", VERIFIED: "green", ON_RENT: "amber", HANDED_OVER: "blue", RETURNED: "dark", CLEARED: "green", BLOCKED: "red", REQUESTED: "amber" };
const chip = (s, label) => `<span class="chip ${STATUS_CHIP[s] || ""}">${esc(label || nice(s))}</span>`;
const starsHtml = n => n == null ? `<span class="muted small">New seller</span>` : `<span class="stars" aria-label="${n} out of 5">${"★".repeat(Math.round(n))}${"☆".repeat(5 - Math.round(n))}</span> <span class="small">${n}</span>`;

const ICONS = {
  1: '<rect x="14" y="10" width="36" height="46" rx="3"/><path d="M22 10v46M28 22h16M28 30h16"/>',
  2: '<path d="M16 8h26l8 8v40H16z"/><path d="M24 26h20M24 34h20M24 42h14"/>',
  3: '<path d="M20 12h24v40H20z"/><path d="M14 18v40h24"/><path d="M26 22h12M26 30h12"/>',
  4: '<rect x="16" y="8" width="32" height="48" rx="4"/><rect x="22" y="14" width="20" height="9"/><path d="M24 32h4M32 32h4M40 32h2M24 40h4M32 40h4M40 40h2M24 48h4M32 48h4"/>',
  5: '<rect x="20" y="20" width="24" height="24" rx="2"/><path d="M26 12v8M32 12v8M38 12v8M26 44v8M32 44v8M38 44v8M12 26h8M12 32h8M12 38h8M44 26h8M44 32h8M44 38h8"/>',
  6: '<path d="M26 8h12M28 8v16L14 52a3 3 0 0 0 3 4h30a3 3 0 0 0 3-4L36 24V8"/><path d="M20 42h24"/>',
  7: '<rect x="16" y="18" width="32" height="38" rx="8"/><path d="M24 18v-6h16v6M24 36h16M22 56v-8M42 56v-8"/>',
  8: '<circle cx="16" cy="42" r="10"/><circle cx="48" cy="42" r="10"/><path d="M16 42l10-18h14l8 18M26 24l8 18M22 20h8M38 24l-3-8h8"/>',
  9: '<path d="M22 10l10 8 10-8 14 8-6 12-6-3v27H20V27l-6 3-6-12z"/>',
  10: '<path d="M8 22h48M12 22v32M52 22v32M16 22v-8h32v8"/>',
  11: '<rect x="8" y="22" width="48" height="20" rx="4"/><path d="M18 32h4M30 32h4M42 32h4"/>'
};
const IMG_FALLBACK = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="#eef0f3"/><g transform="translate(48 16)" fill="none" stroke="#9aa3b5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="10" width="36" height="46" rx="3"/><path d="M22 10v46M28 22h16M28 30h16"/></g></svg>');
function imgSrc(path) {
  if (!path) path = "ph:1:1:0";
  if (!String(path).startsWith("ph:")) {
    if (String(path).startsWith("uploads/") && window.CK_UPLOAD_BASE) return window.CK_UPLOAD_BASE + "/" + path;
    return path;
  }
  const [, cat, n, seed] = path.split(":");
  const v = ((+seed || 0) + (+n || 1) - 1) % 4 + 1, key = "products/c" + (ICONS[cat] ? cat : 1) + "-v" + v + ".jpg";
  return (window.IMGDATA && window.IMGDATA[key]) || "images/" + key;
}
document.addEventListener("error", e => { const el = e.target; if (el && el.tagName === "IMG" && !el.dataset.fb) { el.dataset.fb = "1"; el.src = IMG_FALLBACK; } }, true);
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 9h5l4 18h19l3-13H10" fill="none" stroke="#e8742a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="19" width="15" height="4" fill="#1f56b8"/><rect x="15" y="14.5" width="13" height="4" fill="#2f7d3b"/><path d="M13 12.5l9-4.5 9 4.5-9 4.5z" fill="#14284b" transform="translate(-1 -3)"/><circle cx="15" cy="33" r="2.6" fill="#14284b"/><circle cx="28" cy="33" r="2.6" fill="#14284b"/></svg>`;
const NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v10H3z"/></svg>',
  browse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>',
  sell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  req: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v12H8l-4 4z"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg>',
  rent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/></svg>'
};

let toastT;
function toast(msg, err) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4000); }
async function run(fn, okMsg) { try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? true : r; } catch (e) { toast(e.message, true); if (/session expired/i.test(e.message)) { setTimeout(() => { location.hash = "#/login"; }, 600); } return null; } }
function confirmBox(message, okLabel = "Confirm") {
  return new Promise(res => {
    const m = $("#modal");
    m.className = "modal"; m.hidden = false;
    m.innerHTML = `<div class="card" role="dialog" aria-modal="true"><p>${esc(message)}</p><div class="row" style="justify-content:flex-end"><button class="btn secondary" data-v="0">Cancel</button><button class="btn danger" data-v="1">${esc(okLabel)}</button></div></div>`;
    const done = v => { m.hidden = true; m.innerHTML = ""; res(v); };
    $$("button", m).forEach(b => { b.onclick = () => done(b.dataset.v === "1"); });
    $("button", m).focus();
  });
}

function parseHash() {
  const raw = (location.hash || "#/").slice(1), [path, query] = raw.split("?");
  const q = {}; (query || "").split("&").filter(Boolean).forEach(p => { const [k, v] = p.split("="); q[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " ")); });
  return { parts: path.split("/").filter(Boolean), q };
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function seenKey() { const u = me(); return "ck_seen_" + (u ? u.user_id : 0); }
function getSeen() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
function setSeen(n) { try { localStorage.setItem(seenKey(), String(n)); } catch (e) { } }

let WISHED = {};
const wishKey = n => String(n || "").trim().slice(0, 40).toLowerCase();
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-5-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6-8 11-8 11z"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>';
async function renderHeader() {
  renderFooter();
  const u = me(), { parts, q } = parseHash(), p0 = parts[0] || "", tab = q.tab || "";
  let notes = [];
  WISHED = {};
  if (u) { try { notes = await api("notifications"); } catch (e) { notes = []; } }
  if (u && u.role === "STUDENT") { try { (await api("wishlist")).forEach(w => { if (w.keyword) WISHED[wishKey(w.keyword)] = w.wish_id; }); } catch (e) { } }
  const seen = getSeen(), unread = notes.filter(n => n.notification_id > seen).length;
  const isStudent = u && u.role === "STUDENT", isAdmin = u && u.role === "ADMIN";
  const bell = u ? `<details class="menu" id="bell"><summary class="bellbtn" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${NAV_ICONS.bell}${unread ? `<span class="badge">${unread}</span>` : ""}</summary>
      <div class="drop notes">${notes.length ? notes.map(n => `<a class="note ${n.notification_id > seen ? "unread" : ""}" href="${esc(n.link)}">${esc(n.text)}<small>${fmt(n.created_on)}</small></a>`).join("") : `<div class="note muted">No notifications in the last 14 days.</div>`}</div></details>` : "";
  const account = u ? `<details class="menu"><summary aria-label="Account menu">${NAV_ICONS.me}<span class="hide-m">${esc(u.name.split(" ")[0])}</span></summary><div class="drop">
      ${isStudent ? `<a href="#/profile">Profile</a><a href="#/sell">Sell an item</a><a href="#/requests">My requests</a><a href="#/my-listings">My listings</a><a href="#/my-bundles">My bundles</a><a href="#/my-rentals">My rentals</a><a href="#/wishlist">Wishlist</a><a href="#/kit">My Semester Kit</a><a href="#/clearout">Semester-End Clearout</a><hr>` : ""}
      <button id="logout">Log out</button></div></details>` : `<a href="#/login" class="hide-s">Login</a><a href="#/register" class="nbtn solid">Sign Up</a>`;
  const lk = (href, label, on) => `<a href="${href}" class="${on ? "on" : ""}">${label}</a>`;
  const links = isAdmin ? lk("#/admin", "Admin panel", p0 === "admin")
    : lk("#/", "Home", !p0) + lk("#/browse", "Browse", ["browse", "item"].includes(p0) && !["bundles", "rent"].includes(tab)) + lk("#/browse?tab=bundles", "Bundles", tab === "bundles" && p0 === "browse" || p0 === "bundle") + lk("#/browse?tab=rent", "Rent", tab === "rent" && p0 === "browse" || p0 === "rental");
  $("#header").innerHTML = `<header class="topbar"><div class="wrap">
      <a class="logo" href="#/" aria-label="CampusKart home">${LOGO}<span>Campus<span class="k">Kart</span></span></a>
      <nav class="mainnav" aria-label="Main"><div class="links">${links}</div>
        <div class="tools">
          <form class="search hdr" id="hs" role="search">${SEARCH_ICON}<input type="search" name="q" placeholder="Search books, kits, cycles" aria-label="Search items"></form>
          ${isAdmin ? "" : `<a href="#/sell" class="nbtn hide-s">Sell an Item</a>`}
          ${isStudent ? `<a href="#/wishlist" class="iconlink hide-m" aria-label="Wishlist">${HEART}</a>` : ""}
          ${bell}${account}
        </div></nav></div></header>`;
  $("#hs").onsubmit = e => { e.preventDefault(); go("#/browse?" + qs({ q: new FormData(e.target).get("q") })); };
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await run(() => api("logout")); go("#/"); };
  const b = $("#bell"); if (b) b.addEventListener("toggle", () => { if (b.open && notes.length) { setSeen(Math.max(...notes.map(n => n.notification_id))); const bd = $(".badge", b); if (bd) bd.remove(); $$(".note.unread", b).forEach(x => x.classList.add("unread")); } });
  const bar = (href, key, label, ic) => `<a href="${href}" class="${key.split(" ")[0] === p0 || (key === "home" && !p0) ? "on" : ""} ${key.includes("fab") ? "fab" : ""}">${NAV_ICONS[ic]}${label}</a>`;
  $("#bottombar").innerHTML = isAdmin
    ? bar("#/admin", "admin", "Dashboard", "shield") + bar("#/admin/verifications", "x1", "Verify", "me") + bar("#/admin/reports", "x2", "Reports", "req") + bar("#/admin/users", "x3", "Users", "browse") + bar("#/admin/settings", "x4", "Settings", "sell")
    : isStudent ? bar("#/", "home", "Home", "home") + bar("#/browse", "browse", "Browse", "browse") + bar("#/sell", "sell fab", "Sell", "sell") + bar("#/requests", "requests", "Orders", "req") + bar("#/profile", "profile", "Me", "me")
      : bar("#/", "home", "Home", "home") + bar("#/browse", "browse", "Browse", "browse") + bar("#/browse?tab=rent", "rental", "Rent", "rent") + bar("#/browse?tab=bundles", "x5", "Bundles", "sell") + bar("#/login", "login", "Log in", "me");
}
document.addEventListener("click", async ev => {
  const h = ev.target.closest && ev.target.closest(".heart"); if (!h) return;
  ev.preventDefault(); ev.stopPropagation();
  const u = me(); if (!u) { go("#/login"); return; }
  if (u.role !== "STUDENT") return;
  const key = wishKey(h.dataset.name);
  if (WISHED[key]) { const r = await run(() => api("removeWish", { wish_id: WISHED[key] }), "Removed from your wishlist"); if (r) { delete WISHED[key]; $$(".heart").forEach(x => { if (wishKey(x.dataset.name) === key) { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); } }); } return; }
  const r = await run(() => api("addWish", { keyword: String(h.dataset.name).slice(0, 40), max_price: h.dataset.price }), "Saved to your wishlist");
  if (r) { const list = await api("wishlist").catch(() => []); const w = list.find(x => wishKey(x.keyword) === key); if (w) WISHED[key] = w.wish_id; $$(".heart").forEach(x => { if (wishKey(x.dataset.name) === key) { x.classList.add("on"); x.setAttribute("aria-pressed", "true"); } }); }
}, true);

let VSTATUS = null;
async function renderStrips() {
  const u = me(); let html = ""; VSTATUS = null;
  try { SETTINGS = await api("settings"); } catch (e) { SETTINGS = {}; }
  if (SETTINGS.farewell_banner) html += `<div class="strip sale"><div class="wrap"><b>Farewell sale is on.</b> Seniors are lowering prices on unsold items before the semester ends. <a href="#/browse?sort=price_asc">See the cheapest items</a></div></div>`;
  if (u && u.role === "STUDENT") {
    try {
      const p = await api("profile"), st = p.student; VSTATUS = st && st.verification_status;
      if (st && st.verification_status === "PENDING") html += `<div class="strip warn"><div class="wrap">Your ID card is waiting for a manual check. You can browse now and trade as soon as an admin verifies you.</div></div>`;
      if (st && st.verification_status === "REJECTED") html += `<div class="strip bad"><div class="wrap">Your verification was not accepted${st.remarks ? ": " + esc(st.remarks) : ""}. You cannot trade until an admin verifies you again.</div></div>`;
    } catch (e) { }
  }
  $("#strips").innerHTML = html;
}

function pager(page, pages, hashFor) {
  if (pages <= 1) return "";
  const out = [];
  for (let n = 1; n <= pages; n++) out.push(n === page ? `<span class="on" aria-current="page">${n}</span>` : `<a href="${hashFor(n)}">${n}</a>`);
  return `<nav class="pager" aria-label="Pages">${page > 1 ? `<a href="${hashFor(page - 1)}">Previous</a>` : ""}${out.join("")}${page < pages ? `<a href="${hashFor(page + 1)}">Next</a>` : ""}</nav>`;
}
const EMPTY_ART = `<svg class="eart" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 16l16-8 16 8v16L24 40 8 32z"/><path d="M8 16l16 8 16-8M24 24v16"/></svg>`;
const emptyBox = (text, extra = "") => `<div class="empty">${EMPTY_ART}<div>${esc(text)}</div>${extra ? `<div style="margin-top:12px">${extra}</div>` : ""}</div>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const sidePanel = (title, points) => `<aside class="sidepanel"><h2>${esc(title)}</h2><p>Your campus marketplace for books, kits, cycles and hostel essentials.</p><ul>${points.map(p => `<li>${CHECK}<span>${esc(p)}</span></li>`).join("")}</ul></aside>`;
const catIcon = (c, n) => `<svg viewBox="0 0 64 64" aria-hidden="true">${ICONS[c.category_id] || ICONS[(n % 11) + 1]}</svg>`;
const WHY = [
  ["Safe and trusted", "Every member is verified with a student ID card.", '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'],
  ["Meet on campus", "Hand over at a campus spot with a 4-digit Handover Pass.", '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'],
  ["Fair prices", "The Fair-Price Guide shows what a used item should cost.", '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'],
  ["Made for your semester", "Items matched to your branch, semester and subjects.", '<path d="M3 8l9-5 9 5-9 5z"/><path d="M7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5"/>']
];
const whySection = () => `<section class="why"><div class="wrap"><div class="items">${WHY.map(w => `<div class="it"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">${w[2]}</svg></span><div><b>${w[0]}</b><span>${w[1]}</span></div></div>`).join("")}</div></div></section>`;
const catTiles = () => `<div class="cattiles">${META.categories.map((c, n) => `<a class="cattile" href="#/browse?category_id=${c.category_id}"><div class="ic">${catIcon(c, n)}</div>${esc(c.category_name)}</a>`).join("")}</div>`;
function renderFooter() {
  const u = me();
  $("#foot").innerHTML = `<div class="wrap"><div class="cols">
    <div><a class="logo" href="#/" aria-label="CampusKart home">${LOGO}<span>Campus<span class="k">Kart</span></span></a><p>A campus-based student marketplace to buy, sell, swap and rent second-hand books, kits and hostel items.</p><p>Built as a DBMS and Java college project.</p></div>
    <div><h4>Quick links</h4><a href="#/">Home</a><a href="#/browse">Browse</a><a href="#/browse?tab=rent">Rent</a>${u && u.role === "STUDENT" ? `<a href="#/sell">Sell an item</a><a href="#/wishlist">Wishlist</a><a href="#/requests">My orders</a>` : `<a href="#/login">Login / Sign Up</a>`}</div>
    <div><h4>How it works</h4><p>Only ID-verified students can trade.</p><p>No payment in the app. Money changes hands in person on campus.</p><p>A bill is issued for every completed deal.</p></div></div>
    <div class="legal">© CampusKart. Built by students, for students.</div></div>`;
}
const condChip = c => `<span class="chip ${c === "NEW" || c === "GOOD" ? "green" : "amber"}">${esc(nice(c))}</span>`;
const VER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const metaRow = s => `<div class="meta"><span class="inst">${esc((s && s.institute) || "Campus")}${s && s.avg_rating != null ? " · ★ " + s.avg_rating : ""}</span>${s && s.verification_status === "VERIFIED" ? `<span class="ver">${VER}Verified</span>` : ""}</div>`;
const heartBtn = i => { const on = !!WISHED[wishKey(i.item_name)]; return `<button type="button" class="heart ${on ? "on" : ""}" data-name="${esc(i.item_name)}" data-price="${i.selling_price}" aria-pressed="${on}" aria-label="Save ${esc(i.item_name)} to wishlist">${HEART}</button>`; };
function itemCard(i) {
  const rel = i.relevance && i.relevance.score >= 40 ? `<span class="chip blue">${esc(i.relevance.label)} · ${i.relevance.score}</span>` : "";
  const st = i.bundle ? `<span class="chip orange">In a bundle</span>` : i.status === "BUY_REQUESTED" ? `<span class="chip amber">Requested</span>` : "";
  const good = i.item_condition === "NEW" || i.item_condition === "GOOD";
  return `<article class="pcard"><div class="img"><img loading="lazy" src="${imgSrc(i.cover)}" alt="${esc(i.item_name)}"><span class="cond ${good ? "good" : ""}">${esc(nice(i.item_condition))}</span>${heartBtn(i)}</div>
    <div class="body">${metaRow(i.seller)}<h3 class="name"><a href="#/item/${i.item_id}">${esc(i.item_name)}</a></h3><p class="desc">${esc(i.description)}</p>${rel || st ? `<div class="chips">${rel}${st}</div>` : ""}
    <div class="foot2"><div class="price">${money(i.selling_price)}<s>${money(i.original_price)}</s></div><span class="cat">${esc(i.category_name)}</span></div></div></article>`;
}
function bundleCard(b) {
  return `<article class="pcard"><div class="img"><img loading="lazy" src="${imgSrc(b.cover)}" alt="${esc(b.bundle_name)}"><span class="cond dark">${b.discount_percent}% off</span></div>
    <div class="body">${metaRow(b.seller)}<h3 class="name"><a href="#/bundle/${b.bundle_id}">${esc(b.bundle_name)}</a></h3><p class="desc">${pluralize(b.items.length, "item")} sold together. You save ${money(b.saving)} on the combined price.</p>
    <div class="foot2"><div class="price">${money(b.bundle_price)}<s>${money(b.total_price)}</s></div><span class="cat">Bundle</span></div></div></article>`;
}
function rentalCard(r) {
  return `<article class="pcard"><div class="img"><img loading="lazy" src="${imgSrc(r.cover)}" alt="${esc(r.rental_name)}">${r.status === "ON_RENT" ? `<span class="cond">On rent now</span>` : `<span class="cond good">Available</span>`}</div>
    <div class="body">${metaRow(r.owner)}<h3 class="name"><a href="#/rental/${r.rental_item_id}">${esc(r.rental_name)}</a></h3><p class="desc">Deposit ${money(r.deposit_amount)}. Rent for up to ${r.max_days} days.</p>
    <div class="foot2"><div class="price">${money(r.rate_per_day)}<s style="text-decoration:none"> / day</s></div><span class="cat">For rent</span></div></div></article>`;
}

function setErr(form, name, msg) {
  const el = form.elements[name]; if (!el) return;
  const f = (el.length && !el.tagName ? el[0] : el).closest(".field"); if (!f) return;
  f.classList.toggle("bad", !!msg);
  let e = $(".err", f); if (!e) { e = document.createElement("div"); e.className = "err"; f.appendChild(e); }
  e.textContent = msg || "";
}
function clearErrs(form) { $$(".field.bad", form).forEach(f => { f.classList.remove("bad"); const e = $(".err", f); if (e) e.textContent = ""; }); }
function requireFields(form, rules) {
  clearErrs(form); let ok = true, first = null;
  rules.forEach(([name, label, test]) => {
    const v = (form.elements[name] && form.elements[name].value || "").trim();
    const msg = !v ? label + " is required." : (test ? test(v) : "");
    if (msg) { setErr(form, name, msg); ok = false; if (!first) first = form.elements[name]; }
  });
  if (first) first.focus();
  return ok;
}
function strengthOf(p) { let s = 0; if (p.length >= 8) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s; }
function bindStrength(input, bar, text) {
  const upd = () => { const s = strengthOf(input.value); bar.style.width = ["0%", "25%", "50%", "75%", "100%"][s]; bar.style.background = s <= 1 ? "var(--bad)" : s === 2 ? "var(--accent)" : "var(--good)"; text.textContent = input.value ? "Password strength: " + ["Too short", "Weak", "Fair", "Good", "Strong"][s] : "Use 8+ characters with letters and numbers"; };
  input.addEventListener("input", upd); upd();
}

document.addEventListener("click", ev => { $$("details.menu[open]").forEach(d => { if (!d.contains(ev.target)) d.open = false; }); });

async function route() {
  if (!META) META = await api("meta");
  await Promise.all([renderHeader(), renderStrips()]);
  const { parts, q } = parseHash(), u = me();
  const need = role => { if (!u) { go("#/login"); return false; } if (role && u.role !== role) { go("#/"); return false; } return true; };
  window.scrollTo(0, 0);
  $("#herohost").innerHTML = "";
  try {
    const p = parts[0] || "", a = parts[1];
    if (!p) return await viewHome();
    if (p === "browse") return await viewBrowse(q);
    if (p === "item") return await viewItem(a);
    if (p === "seller") return await viewSeller(a);
    if (p === "login") return viewLogin();
    if (p === "register") return viewRegister();
    if (p === "bundle") return a === "new" ? (need("STUDENT") && await viewBundleBuilder()) : await viewBundle(a);
    if (p === "rental") return await viewRental(a);
    if (p === "bill") return need() && await viewBill(a);
    if (p === "sell") return need("STUDENT") && await viewSell(a);
    if (p === "rent" && a === "new") return need("STUDENT") && await viewRentalForm();
    if (p === "my-listings") return need("STUDENT") && await viewMyListings();
    if (p === "my-bundles") return need("STUDENT") && await viewMyBundles();
    if (p === "my-rentals") return need("STUDENT") && await viewMyRentals(q);
    if (p === "requests") return need("STUDENT") && await viewRequests(q);
    if (p === "kit") return need("STUDENT") && await viewKit();
    if (p === "wishlist") return need("STUDENT") && await viewWishlist();
    if (p === "clearout") return need("STUDENT") && await viewClearout();
    if (p === "profile") return need("STUDENT") && await viewProfile();
    if (p === "admin") return need("ADMIN") && await viewAdmin(a || "dashboard");
    $app.innerHTML = emptyBox("This page does not exist.", `<a href="#/">Go to home</a>`);
  } catch (e) {
    if (/session expired/i.test(e.message)) { go("#/login"); return; }
    $app.innerHTML = emptyBox("Something went wrong: " + e.message);
  }
}
window.addEventListener("hashchange", route);

async function viewHome() {
  const u = me(), h = await api("home");
  if (!u) {
    $("#herohost").innerHTML = `<section class="herofull"><div class="wrap">
        <div class="eyebrow">Student marketplace</div>
        <h1>Buy. Sell. Exchange.<br>Everything You Need, On Campus.</h1>
        <p class="lead">Second-hand books, kits, cycles and hostel essentials from verified students at your college. Meet on campus, pay in person.</p>
        <form class="search" id="hh" role="search">${SEARCH_ICON}<input type="search" name="q" placeholder="Search for books, calculators, cycles, hostel items" aria-label="Search items"><button class="btn">Search</button></form>
        <div class="ctas"><a class="btn primary lg" href="#/browse">Start Browsing</a><a class="btn outline lg" href="#/sell">Sell Your Items</a></div></div>
      <div class="herostats"><div class="wrap"><div><b>${h.stats.items}</b><span>Items for sale</span></div><div><b>${h.stats.bundles}</b><span>Kit bundles</span></div><div><b>${h.stats.rentals}</b><span>Rentals</span></div><div><b>40%</b><span>Off every bundle</span></div></div></div></section>${whySection()}`;
    $app.innerHTML = `<div class="sechead" style="margin-top:8px"><h2>Shop by Category</h2><a href="#/browse">View all</a></div>${catTiles()}
      <div class="sechead"><h2>Featured Items</h2><a href="#/browse">View all ${h.stats.items} items</a></div><div class="grid">${h.just_listed.slice(0, 4).map(itemCard).join("")}</div>
      <p style="margin-top:20px" class="muted"><a href="#/browse?tab=bundles">${pluralize(h.stats.bundles, "bundle")}</a> and <a href="#/browse?tab=rent">${pluralize(h.stats.rentals, "rental")}</a> are also available.</p>
      <div class="sechead"><h2>How it works</h2></div>
      <div class="steps3" style="margin-top:0">
        <div class="card"><span class="num">1</span><div><h3>Register with your ID card</h3><p class="muted small" style="margin:0">Your details must match your student ID card. A match verifies you at once.</p></div></div>
        <div class="card"><span class="num">2</span><div><h3>Find it or list it</h3><p class="muted small" style="margin:0">Search items, bundles and rentals, or list your own with clear photos.</p></div></div>
        <div class="card"><span class="num">3</span><div><h3>Meet on campus</h3><p class="muted small" style="margin:0">Hand over with a 4-digit Handover Pass. Money changes hands in person.</p></div></div></div>`;
    $("#hh").onsubmit = e => { e.preventDefault(); go("#/browse?" + qs({ q: new FormData(e.target).get("q") })); };
    return;
  }
  if (u.role === "ADMIN") { go("#/admin"); return; }
  const feed = (h.picked && h.picked.length) ? h.picked : [];
  $app.innerHTML = `<div class="pagehead"><div><h1>Hi, ${esc(u.name.split(" ")[0])}</h1><p class="sub">Here is what is useful for your semester.</p></div>
      <div class="row right"><a class="btn" href="#/sell">Sell an item</a><a class="btn secondary" href="#/rent/new">List a rental</a></div></div>
    <div class="cols3">
      <div class="card"><h3>My Semester Kit</h3><div class="price">${h.kit.covered} of ${h.kit.total}<span class="muted small" style="font-weight:400"> subjects covered</span></div>
        <div class="progress" aria-hidden="true"><i style="width:${h.kit.total ? Math.round(h.kit.covered / h.kit.total * 100) : 0}%"></i></div><a href="#/kit">Open my kit</a></div>
      <div class="card"><h3>Wishlist Radar</h3><div class="price">${h.wishes.new_matches}<span class="muted small" style="font-weight:400"> new match${h.wishes.new_matches === 1 ? "" : "es"}</span></div>
        <p class="muted small" style="margin:4px 0 8px">${pluralize(h.wishes.count, "active wish")}</p><a href="#/wishlist">${h.wishes.count ? "See matches" : "Add a wish"}</a></div>
      <div class="card"><h3>Shortcuts</h3><div class="stack small"><div><a href="#/browse?tab=bundles">Kit bundles at 40% off</a></div><div><a href="#/browse?tab=rent">Rent for a few days</a></div><div><a href="#/requests">My requests and handover passes</a></div></div></div></div>
    <h2>Picked for your semester</h2>
    ${feed.length ? `<div class="grid">${feed.map(i => `<div>${itemCard(i)}<div class="row" style="gap:4px;margin-top:6px">${i.relevance.why.map(w => `<span class="chip blue">${esc(w)}</span>`).join("")}</div></div>`).join("")}</div>` : emptyBox("Nothing matches your semester yet. Browse everything instead.", `<a href="#/browse">Browse items</a>`)}
    <div class="sechead"><h2>Shop by Category</h2><a href="#/browse">View all</a></div>${catTiles()}
    <div class="sechead"><h2>Just listed</h2><a href="#/browse">View all</a></div><div class="grid">${h.just_listed.slice(0, 4).map(itemCard).join("")}</div>`;
}

async function viewBrowse(q) {
  const tab = q.tab === "bundles" || q.tab === "rent" ? q.tab : "items", u = me();
  const tabs = `<div class="tabs" role="tablist"><a href="#/browse" class="${tab === "items" ? "on" : ""}">Items</a><a href="#/browse?tab=bundles" class="${tab === "bundles" ? "on" : ""}">Bundles</a><a href="#/browse?tab=rent" class="${tab === "rent" ? "on" : ""}">Rent</a></div>`;
  if (tab === "bundles") {
    const r = await api("listBundles", q);
    $app.innerHTML = `<div class="pagehead"><div><h1>Kit bundles</h1><p class="sub">Several items from one senior at a fixed 40% off the total.</p></div>${u && u.role === "STUDENT" ? `<a class="btn right" href="#/bundle/new">Create a bundle</a>` : ""}</div>${tabs}
      <form id="bf" class="row" style="margin-bottom:14px"><input style="max-width:320px" type="search" name="q" value="${esc(q.q || "")}" placeholder="Search bundles" aria-label="Search bundles"><button class="btn secondary">Search</button></form>
      ${r.items.length ? `<div class="grid wide">${r.items.map(bundleCard).join("")}</div>` : emptyBox("No bundles yet.")}${pager(r.page, r.pages, n => "#/browse?" + qs({ ...q, page: n }))}`;
    $("#bf").onsubmit = e => { e.preventDefault(); go("#/browse?" + qs({ tab: "bundles", q: new FormData(e.target).get("q") })); };
    return;
  }
  if (tab === "rent") {
    const r = await api("listRentals", q), cats = META.categories.filter(c => c.is_rentable);
    $app.innerHTML = `<div class="pagehead"><div><h1>Rent for a few days</h1><p class="sub">Hardware kits, calculators, lab gear and outdoor items. Rent and deposit are paid in person.</p></div>${u && u.role === "STUDENT" ? `<a class="btn right" href="#/rent/new">List a rental</a>` : ""}</div>${tabs}
      <form id="rf" class="row" style="margin-bottom:14px;align-items:flex-end"><div style="flex:1;min-width:200px"><label for="rq">Search</label><input id="rq" type="search" name="q" value="${esc(q.q || "")}" placeholder="Search rentals"></div>
        <div style="min-width:180px"><label for="rc">Category</label><select id="rc" name="category_id">${opts(cats, "category_id", "category_name", q.category_id, "All categories")}</select></div>
        <div style="width:140px"><label for="rm">Max price per day</label><input id="rm" type="number" min="1" name="max_rate" value="${esc(q.max_rate || "")}"></div>
        <div style="width:170px"><label for="rs">Sort</label><select id="rs" name="sort"><option value="">Newest</option><option value="price_asc" ${q.sort === "price_asc" ? "selected" : ""}>Price: low to high</option></select></div></form>
      ${r.items.length ? `<div class="grid">${r.items.map(rentalCard).join("")}</div>` : emptyBox("No rental items match.")}${pager(r.page, r.pages, n => "#/browse?" + qs({ ...q, page: n }))}`;
    $("#rf").onchange = e => go("#/browse?" + qs({ tab: "rent", ...formData($("#rf")) }));
    $("#rf").onsubmit = e => { e.preventDefault(); go("#/browse?" + qs({ tab: "rent", ...formData(e.target) })); };
    return;
  }
  const student = u && u.role === "STUDENT", r = await api("listItems", q);
  const catLink = (id, name) => `<a href="#/browse?${qs({ ...q, category_id: id, page: "" })}" class="${String(q.category_id || "") === String(id) ? "on" : ""}">${esc(name)}</a>`;
  const sorts = [[student ? "match" : "", student ? "Best match" : "Newest"], ...(student ? [["new", "Newest"]] : []), ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"]];
  $app.innerHTML = `<div class="pagehead"><div><h1>Browse items</h1><p class="sub">${pluralize(r.total, "item")} found</p></div></div>${tabs}
    <div class="layout"><aside class="card filters"><form id="ff">
      <div class="field"><label for="fq">Search</label><input id="fq" type="search" name="q" value="${esc(q.q || "")}" placeholder="Name, subject or brand"></div>
      <div class="field"><label for="fk">Type</label><select id="fk" name="kind"><option value="">Academic and general</option><option value="ACADEMIC" ${q.kind === "ACADEMIC" ? "selected" : ""}>Academic</option><option value="GENERAL" ${q.kind === "GENERAL" ? "selected" : ""}>General</option></select></div>
      <div class="field"><label for="fb">Branch</label><select id="fb" name="branch_id">${opts(META.branches.filter(b => b.branch_code !== "ALL"), "branch_id", "branch_code", q.branch_id, "Any branch")}</select></div>
      <div class="field"><label for="fs">Semester</label><select id="fs" name="semester">${opts([1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ v: n, l: "Semester " + n })), "v", "l", q.semester, "Any semester")}</select></div>
      <div class="field"><label for="fj">Subject</label><select id="fj" name="subject_id">${opts(META.subjects, "subject_id", "subject_name", q.subject_id, "Any subject")}</select></div>
      <div class="field"><label for="fc">Condition</label><select id="fc" name="condition">${opts(["NEW", "GOOD", "FAIR", "POOR"].map(c => ({ v: c, l: nice(c) })), "v", "l", q.condition, "Any condition")}</select></div>
      <div class="row" style="flex-wrap:nowrap"><div class="field"><label for="fmin">Min ₹</label><input id="fmin" type="number" min="0" name="min_price" value="${esc(q.min_price || "")}"></div><div class="field"><label for="fmax">Max ₹</label><input id="fmax" type="number" min="0" name="max_price" value="${esc(q.max_price || "")}"></div></div>
      <div class="field"><label for="fp">Pickup place</label><select id="fp" name="pickup">${opts(META.locations.map(l => ({ v: l, l })), "v", "l", q.pickup, "Any place")}</select></div>
      <div class="field"><label for="fo">Sort by</label><select id="fo" name="sort">${sorts.map(s => `<option value="${s[0]}" ${(q.sort || (student ? "match" : "")) === s[0] ? "selected" : ""}>${s[1]}</option>`).join("")}</select></div>
      <a href="#/browse" class="small">Clear filters</a></form>
      <h3 style="margin-top:16px">Categories</h3><div class="catlist">${catLink("", "All categories")}${META.categories.map(c => catLink(c.category_id, c.category_name)).join("")}</div></aside>
      <section>${r.items.length ? `<div class="grid">${r.items.map(itemCard).join("")}</div>` : emptyBox("No items match these filters.", `<a href="#/browse">Clear filters</a>`)}${pager(r.page, r.pages, n => "#/browse?" + qs({ ...q, page: n }))}</section></div>`;
  const ff = $("#ff");
  ff.onchange = () => go("#/browse?" + qs({ ...formData(ff), category_id: q.category_id }));
  ff.onsubmit = e => { e.preventDefault(); go("#/browse?" + qs({ ...formData(ff), category_id: q.category_id })); };
}

function fairBar(i) {
  const f = i.fair, max = i.original_price;
  if (!f || !f.high) return "";
  const sp = i.selling_price, verdict = sp < f.low ? "Below the guide, a good price" : sp <= f.high ? "Within the fair range" : "Above the guide";
  const pct = n => Math.min(100, Math.max(0, n / max * 100));
  return `<div class="fair"><div class="small"><b>Fair-Price Guide</b> · ${money(f.low)} to ${money(f.high)} · suggested ${money(f.suggested)}</div>
    <div class="fairbar" role="img" aria-label="${esc(verdict)}"><div class="range" style="left:${pct(f.low)}%;width:${pct(f.high) - pct(f.low)}%"></div><div class="dot" style="left:calc(${pct(sp)}% - 2px)" data-l="${money(sp)}"></div></div>
    <div class="small ${sp > f.high ? "" : "muted"}" style="${sp > f.high ? "color:var(--bad)" : ""}">${verdict}</div></div>`;
}
function dealTimeline(status) {
  if (status === "REMOVED") return `<div class="chip red">This listing was removed</div>`;
  const steps = ["Listed", "Requested", "Handover set", "Sold"], idx = { AVAILABLE: 0, BUY_REQUESTED: 1, ACCEPTED: 2, SOLD: 3 }[status] || 0;
  return `<ol class="timeline" aria-label="Deal timeline">${steps.map((s, n) => `<li class="${n <= idx ? "done" : ""} ${n === idx ? "now" : ""}">${s}</li>`).join("")}</ol>`;
}
function sellerBlock(s, label = "Seller") {
  return `<div class="card flat"><div class="row between" style="flex-wrap:nowrap"><div class="row" style="flex-wrap:nowrap"><span class="avatar lg" aria-hidden="true">${esc((s.name || "?").trim().charAt(0).toUpperCase())}</span><div><div class="muted small">${label}</div><a href="#/seller/${s.user_id}"><b>${esc(s.name)}</b></a> ${s.verification_status === "VERIFIED" ? `<span class="chip green">ID verified</span>` : ""}</div></div><div>${starsHtml(s.avg_rating)}</div></div>
    <div class="small muted" style="margin-top:6px">${pluralize(s.sales_count, "deal")} done · ${s.reply_hours != null ? "usually replies in " + (s.reply_hours < 1 ? "under an hour" : Math.round(s.reply_hours) + " h") : "no replies yet"} · ${esc(s.institute || "")} ${s.semester ? "sem " + s.semester : ""}</div></div>`;
}
function galleryHtml(images, alt) {
  const list = images.length ? images : ["ph:1:1:0"];
  return `<div class="gallery"><div class="main"><img id="gmain" src="${imgSrc(list[0])}" alt="${esc(alt)}"></div><div class="thumbs">${list.map((p, n) => `<button type="button" class="${n === 0 ? "on" : ""}" data-src="${esc(imgSrc(p))}" aria-label="Photo ${n + 1}"><img src="${imgSrc(p)}" alt=""></button>`).join("")}</div></div>`;
}
function bindGallery() { $$(".thumbs button").forEach(b => { b.onclick = () => { $("#gmain").src = b.dataset.src; $$(".thumbs button").forEach(x => x.classList.toggle("on", x === b)); }; }); }

async function viewItem(id) {
  const d = await api("getItem", { item_id: id }), i = d.item, u = me(), student = u && u.role === "STUDENT", own = u && u.user_id === i.seller_id, mine = d.my_request;
  const canAsk = student && !own && ["AVAILABLE", "BUY_REQUESTED"].includes(i.status) && !(mine && ["PENDING", "COUNTERED"].includes(mine.status)) && !i.bundle;
  const verified = VSTATUS === "VERIFIED";
  let action = "";
  if (!u) action = `<a class="btn block" href="#/login">Log in to send a request</a>`;
  else if (u.role === "ADMIN") action = `<div class="muted small">Admins cannot trade.</div>`;
  else if (own) action = `<div class="row"><span class="chip blue">Your listing</span>${i.status === "AVAILABLE" ? `<a class="btn secondary sm" href="#/sell/${i.item_id}">Edit</a><button class="btn danger secondary sm" id="wd">Withdraw</button>` : ""}</div>`;
  else if (i.bundle) action = `<div class="strip info" style="border:1px solid #c9daf5;border-radius:6px;padding:10px 12px">This item is part of the bundle <a href="#/bundle/${i.bundle.bundle_id}"><b>${esc(i.bundle.bundle_name)}</b></a>. Request the whole bundle at 40% off.</div>`;
  else if (!["AVAILABLE", "BUY_REQUESTED"].includes(i.status)) action = `<div class="muted">This item is ${nice(i.status).toLowerCase()}.</div>`;
  else if (!verified) action = `<div class="strip warn" style="border:1px solid #f0dca5;border-radius:6px;padding:10px 12px">Only verified students can send requests. Your ID card has not been verified yet.</div>`;
  const myReq = mine ? `<div class="card flat" style="margin-top:12px"><div class="row between"><b>Your request</b>${chip(mine.status)}</div>
      <div class="small muted">${esc(nice(mine.request_type))}${mine.request_type === "OFFER" ? " · offered " + money(mine.offered_price) : ""}${mine.counter_price ? " · seller countered " + money(mine.counter_price) : ""}</div>
      ${mine.status === "ACCEPTED" && mine.pass ? `<p class="small" style="margin:10px 0 4px">Meet at <b>${esc(mine.handover_location)}</b> on <b>${fmt(mine.handover_time)}</b>. Show this Handover Pass to the seller:</p><div class="pass" aria-label="Handover pass ${mine.pass.split("").join(" ")}">${esc(mine.pass)}</div>` : ""}
      ${mine.status === "COUNTERED" ? `<p class="small" style="margin:8px 0 0"><a href="#/requests">Answer the counter price in My requests</a></p>` : ""}</div>` : "";
  $app.innerHTML = `<div class="crumb"><a href="#/browse">Browse</a> / ${esc(i.category_name)}</div>
    <div class="detail"><div>${galleryHtml(i.images, i.item_name)}<h2>Deal timeline</h2>${dealTimeline(i.status)}</div>
    <div><h1>${esc(i.item_name)}</h1><div class="row" style="margin:6px 0 10px">${chip(i.status)}<span class="chip">${esc(i.category_name)}</span><span class="chip">${nice(i.item_kind)}</span>${i.relevance && i.relevance.score >= 40 ? `<span class="chip blue">${esc(i.relevance.label)} · ${i.relevance.score}</span>` : ""}</div>
      <div class="bigprice">${money(i.selling_price)} <span class="muted small" style="font-weight:400"><s>${money(i.original_price)}</s></span> <span class="chip green">Save ${money(i.original_price - i.selling_price)} · ${i.discount_percent}% off</span></div>
      ${fairBar(i)}
      <p style="margin:10px 0">${esc(i.description)}</p>
      <dl class="kv"><dt>Condition</dt><dd>${esc(nice(i.item_condition))}</dd><dt>Pickup place</dt><dd>${esc(i.pickup_location)}</dd><dt>Listed</dt><dd>${fmtD(i.listed_on)}</dd>
      ${i.item_kind === "ACADEMIC" ? `<dt>Subject</dt><dd>${esc(i.subject_name || "-")}</dd><dt>Branch</dt><dd>${esc(i.branch_code)}</dd><dt>Semester</dt><dd>${esc(i.target_semester)}</dd><dt>Edition</dt><dd>${esc(i.edition)}</dd>` : `<dt>Brand</dt><dd>${esc(i.brand)}</dd><dt>Age</dt><dd>${pluralize(i.age_in_months, "month")}</dd>`}</dl>
      ${i.relevance && i.relevance.why.length ? `<div class="row" style="gap:5px;margin-top:10px">${i.relevance.why.map(w => `<span class="chip blue">${esc(w)}</span>`).join("")}</div>` : ""}
      <div style="margin-top:14px">${sellerBlock(i.seller)}</div>
      <div style="margin-top:14px" id="actionbox">${action}</div>${myReq}
      ${canAsk && verified ? `<form id="req" class="card" style="margin-top:12px" novalidate><div class="seg" role="group" aria-label="Request type"><button type="button" data-t="BUY" class="on">Buy</button><button type="button" data-t="OFFER">Make an offer</button><button type="button" data-t="SWAP">Swap</button></div>
        <div id="rfields" style="margin-top:12px"></div><button class="btn block">Send request</button><p class="hint">Waiting requests expire after 3 days. Payment is in person on campus.</p></form>` : ""}
      ${student && !own ? `<details style="margin-top:14px"><summary class="small muted" style="cursor:pointer">Report this listing</summary><form id="rp" class="card" style="margin-top:8px"><div class="field"><label for="rr">Reason</label><select id="rr" name="reason">${["FAKE", "INAPPROPRIATE", "WRONG_INFO", "SPAM", "OTHER"].map(r => `<option value="${r}">${nice(r)}</option>`).join("")}</select></div><div class="field"><label for="rd">Details</label><textarea id="rd" name="details" maxlength="100" rows="2"></textarea></div><button class="btn danger sm">Submit report</button></form></details>` : ""}
    </div></div>
    <h2>Status history</h2><div class="tblwrap"><table class="tbl stackm"><tr><th>When</th><th>From</th><th>To</th><th>Remark</th></tr>${d.log.map(l => `<tr><td>${fmt(l.changed_at)}</td><td>${esc(l.old_status ? nice(l.old_status) : "-")}</td><td>${esc(nice(l.new_status))}</td><td>${esc(l.remark)}</td></tr>`).join("")}</table></div>`;
  bindGallery();
  const wd = $("#wd"); if (wd) wd.onclick = async () => { if (await confirmBox("Withdraw this listing? Waiting requests will be rejected.", "Withdraw")) if (await run(() => api("withdrawItem", { item_id: i.item_id }), "Listing withdrawn")) go("#/my-listings"); };
  const rp = $("#rp"); if (rp) rp.onsubmit = async e => { e.preventDefault(); if (await run(() => api("report", { item_id: i.item_id, ...formData(rp) }), "Report submitted")) rp.reset(); };
  const rq = $("#req");
  if (rq) {
    let type = "BUY";
    const draw = () => {
      $("#rfields").innerHTML = `${type === "OFFER" ? `<div class="field"><label for="rop">Your price (₹)</label><input id="rop" name="offered_price" type="number" min="1" max="${i.selling_price}" placeholder="Below ${i.selling_price}"><div class="hint">The seller can accept, reject or counter once.</div></div>` : ""}
        ${type === "SWAP" ? `<div class="field"><label for="rsw">Offer one of your items</label>${d.swap_choices.length ? `<select id="rsw" name="offered_item_id">${opts(d.swap_choices, "item_id", "item_name", "")}</select>` : `<div class="hint">You have no other available item to swap. <a href="#/sell">List one first</a>.</div>`}</div>` : ""}
        <div class="field"><label for="rmsg">Message to seller (optional)</label><input id="rmsg" name="message" maxlength="100" placeholder="Up to 100 characters"></div>`;
    };
    $$(".seg button", rq).forEach(b => { b.onclick = () => { type = b.dataset.t; $$(".seg button", rq).forEach(x => x.classList.toggle("on", x === b)); draw(); }; });
    draw();
    rq.onsubmit = async e => { e.preventDefault(); const f = formData(rq); if (await run(() => api("sendRequest", { item_id: i.item_id, request_type: type, ...f }), "Request sent")) go("#/item/" + i.item_id); };
  }
}

async function viewSeller(id) {
  const s = await api("sellerCard", { user_id: id });
  $app.innerHTML = `<div class="crumb"><a href="#/browse">Browse</a> / Seller</div>
    <div class="pagehead"><div><h1>${esc(s.name)}</h1><p class="sub">${esc(s.institute || "")} · ${esc(s.branch || "")} · semester ${esc(s.semester || "-")} · member since ${fmtD(s.member_since)}</p></div>${s.verification_status === "VERIFIED" ? `<span class="chip green right">ID verified</span>` : ""}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <div class="tile"><b>${s.avg_rating != null ? s.avg_rating + " ★" : "-"}</b><span>${pluralize(s.rating_count, "rating")}</span></div>
      <div class="tile"><b>${s.sales_count}</b><span>Deals done</span></div>
      <div class="tile"><b>${s.reply_hours != null ? (s.reply_hours < 1 ? "<1 h" : Math.round(s.reply_hours) + " h") : "-"}</b><span>Usual reply time</span></div></div>
    <h2>Reviews</h2>${s.reviews.length ? s.reviews.map(r => `<div class="card"><div class="row between"><span class="stars" aria-label="${r.stars} stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span><span class="muted small">${fmtD(r.rated_on)}</span></div><p style="margin:6px 0 2px">${esc(r.review || "No written review.")}</p><div class="muted small">${esc(r.buyer_name)} · ${esc(r.item_name)}</div></div>`).join("") : emptyBox("No reviews yet.")}
    <h2>Items for sale</h2>${s.items.length ? `<div class="grid">${s.items.map(itemCard).join("")}</div>` : emptyBox("Nothing listed right now.")}`;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}
function sharpness(img) {
  const k = 256 / Math.max(img.width, img.height), w = Math.max(8, Math.round(img.width * Math.min(1, k))), h = Math.max(8, Math.round(img.height * Math.min(1, k)));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let sum = 0, sq = 0, n = 0;
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const l = 4 * g[yy * w + xx] - g[yy * w + xx - 1] - g[yy * w + xx + 1] - g[(yy - 1) * w + xx] - g[(yy + 1) * w + xx];
    sum += l; sq += l * l; n++;
  }
  return sq / n - (sum / n) * (sum / n);
}
async function checkPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, reason: "only JPG, PNG or WebP files are allowed" };
  if (file.size > 3 * 1024 * 1024) return { ok: false, reason: "file is larger than 3 MB" };
  let r; try { r = await readImage(file); } catch (e) { return { ok: false, reason: "the file could not be read as an image" }; }
  const { img, url } = r, short = Math.min(img.width, img.height);
  try {
    if (short < 600) return { ok: false, reason: `too small (${img.width}×${img.height}); the short side must be at least 600 px` };
    if (sharpness(img) < 25) return { ok: false, reason: "the photo looks blurry; retake it in good light" };
  } finally { URL.revokeObjectURL(url); }
  return { ok: true };
}

function photoPicker(mount, { min = 3, max = 5 } = {}) {
  const st = { items: [], cover: 0 };
  mount.innerHTML = `<label for="${mount.id}-in">Photos (${min} to ${max})</label><input id="${mount.id}-in" type="file" accept="image/jpeg,image/png,image/webp" multiple>
    <div class="hint">JPG, PNG or WebP · up to 3 MB each · at least 600 px on the short side · sharp, not blurry. Pick the cover photo with “Cover”.</div><div class="photoerr" role="alert"></div><div class="photos"></div>`;
  const input = $("input", mount), err = $(".photoerr", mount), box = $(".photos", mount);
  const render = () => {
    box.innerHTML = st.items.map((p, n) => `<div class="photo ${n === st.cover ? "cover" : ""}"><img src="${p.url}" alt="Photo ${n + 1}"><div class="bar"><button type="button" data-c="${n}">${n === st.cover ? "Cover ✓" : "Cover"}</button><button type="button" data-r="${n}" ${st.items.length === min ? "disabled" : ""} aria-label="Remove photo ${n + 1}">Remove</button></div></div>`).join("");
    $$("[data-c]", box).forEach(b => { b.onclick = () => { st.cover = +b.dataset.c; render(); }; });
    $$("[data-r]", box).forEach(b => { b.onclick = () => { const n = +b.dataset.r; st.items.splice(n, 1); if (st.cover >= st.items.length) st.cover = 0; else if (n < st.cover) st.cover--; render(); }; });
  };
  input.onchange = async () => {
    const errs = [];
    for (const f of Array.from(input.files)) {
      if (st.items.length >= max) { errs.push(`Only ${max} photos are allowed.`); break; }
      const r = await checkPhoto(f);
      if (r.ok) st.items.push({ file: f, url: URL.createObjectURL(f) }); else errs.push(`${f.name}: ${r.reason}.`);
    }
    err.innerHTML = errs.map(esc).join("<br>"); input.value = ""; render();
  };
  return { get files() { return st.items.map(x => x.file); }, get cover() { return st.cover; }, get count() { return st.items.length; }, showError(m) { err.textContent = m; } };
}

function viewLogin() {
  const expired = localStorage.getItem("ck_expired"); localStorage.removeItem("ck_expired");
  $app.innerHTML = `<div class="auth2" style="grid-template-columns:320px 1fr;max-width:900px">${sidePanel("Welcome back", ["Buy and sell pre-loved items", "Connect with fellow students", "Safe and trusted community"])}<div style="max-width:440px;width:100%;margin:0 auto">${expired ? `<div class="strip warn" style="border:1px solid #f0dca5;border-radius:6px;padding:10px 12px;margin-bottom:12px">Your session expired. Please log in again.</div>` : ""}
    <div class="card"><h1>Welcome Back</h1><p class="muted small">Log in with your college email.</p>
      <form id="lf" novalidate><div class="field"><label for="le">College email</label><input id="le" name="email" type="email" autocomplete="username"></div>
      <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password"></div><button class="btn block">Log in</button></form>
      <p class="small" style="margin:14px 0 0">New here? <a href="#/register">Register with your ID card</a></p></div>
</div></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    if (!requireFields(f, [["email", "Email"], ["password", "Password"]])) return;
    const r = await run(() => api("login", formData(f)));
    if (r) go(r.role === "ADMIN" ? "#/admin" : "#/");
  };
}

let OCR_P = null;
function loadOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!OCR_P) OCR_P = new Promise((res, rej) => { const s = document.createElement("script"); s.src = window.OCR_SRC || "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = () => res(window.Tesseract); s.onerror = () => { OCR_P = null; rej(new Error("OCR unavailable")); }; document.head.appendChild(s); });
  return OCR_P;
}
async function cardPage(file, mode) {
  const { img, url } = await readImage(file);
  const w = Math.max(1000, Math.min(2400, img.width < 1000 ? img.width * 2 : img.width));
  const h = Math.max(1, Math.round(img.height * w / img.width));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  if (mode === "color") return c;
  const d = x.getImageData(0, 0, w, h), p = d.data, n = w * h, g = new Float32Array(n);
  let sum = 0, lo = 255, hi = 0;
  for (let i = 0; i < n; i++) { const v = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; g[i] = v; sum += v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const mean = sum / n, span = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const v = mode === "binary" ? ((g[i] - lo) / span > 0.42 ? 255 : 0) : Math.max(0, Math.min(255, (g[i] - mean) * 1.4 + 128));
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v;
  }
  x.putImageData(d, 0, 0);
  return c;
}
function cardHasAll(text, name, id) {
  const flat = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const words = flat(name).split(" ").filter(Boolean), seen = flat(text), have = " " + seen + " ", want = flat(id).replace(/ /g, "");
  return { name: words.length > 0 && words.every(w => have.includes(" " + w + " ")), id: want.length >= 4 && seen.replace(/ /g, "").includes(want) };
}
async function readIdCard(file, name, id) {
  const T = await loadOcr().catch(() => null);
  if (!T) return "";
  const seen = new Set(), out = [];
  for (const [mode, psm] of [["color", "6"], ["gray", "6"], ["binary", "11"]]) {
    try {
      const page = await cardPage(file, mode), r = await T.recognize(page, "eng", Object.assign({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:/-()'" }, window.OCR_OPTS || {}));
      const t = String((r && r.data && r.data.text) || "").replace(/[ \t]+/g, " ").trim();
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    } catch (e) { continue; }
    const hit = cardHasAll(out.join("\n"), name, id);
    if (hit.name && hit.id) break;
  }
  return out.join("\n");
}

function viewRegister() {
  const years = [1, 2, 3, 4, 5].map(n => ({ v: n, l: "Year " + n }));
  $app.innerHTML = `<div class="auth2">${sidePanel("Join CampusKart", ["Buy and sell pre-loved items", "Connect with fellow students", "Safe and trusted community"])}<div><div class="crumb"><a href="#/login">Log in</a> / Register</div><h1>Register with your ID card</h1>
    <p class="muted">You are verified only if the details you type match the ID card you upload. Type your first and last name exactly as they are printed on the card, and check that your PRN is clearly readable in the photo.</p>
    <form id="rf" novalidate>
      <fieldset><legend>Your details</legend><div class="fgrid">
        <div class="field full"><label for="rn">Full name, exactly as on your ID card</label><input id="rn" name="full_name" autocomplete="name" placeholder="e.g. JANHAVI UMESH PHALE"></div>
        <div class="field"><label for="ra">Age</label><input id="ra" name="age" type="number" min="15" max="60"></div>
        <div class="field"><label for="rg">Gender</label><select id="rg" name="gender">${opts(["Female", "Male", "Other"].map(x => ({ v: x, l: x })), "v", "l", "", "Select")}</select></div></div></fieldset>
      <fieldset><legend>Academic details</legend><div class="fgrid">
        <div class="field full"><label for="ri">College</label><select id="ri" name="institute_id">${opts(META.institutes, "institute_id", "institute_name", "", "Select your college")}</select></div>
        <div class="field"><label for="rb">Branch</label><select id="rb" name="branch_id">${opts(META.branches.filter(b => b.branch_code !== "ALL"), "branch_id", "branch_name", "", "Select branch")}</select></div>
        <div class="field"><label for="rc">College ID / PRN</label><input id="rc" name="college_id"></div>
        <div class="field"><label for="ry">Year</label><select id="ry" name="year">${opts(years, "v", "l", "", "Select year")}</select></div>
        <div class="field"><label for="rs">Semester</label><select id="rs" name="semester"><option value="">Select year first</option></select></div></div></fieldset>
      <fieldset><legend>Account</legend><div class="fgrid">
        <div class="field"><label for="re">College email</label><input id="re" name="email" type="email" autocomplete="email" placeholder="you@college.edu.in"><div class="hint">Must end with .edu.in or .ac.in</div></div>
        <div class="field"><label for="rp">Phone number</label><input id="rp" name="phone_no" inputmode="numeric" maxlength="10" placeholder="10 digits"></div>
        <div class="field full"><label for="rw">Password</label><input id="rw" name="password" type="password" autocomplete="new-password"><div class="meter"><i id="pwb"></i></div><div class="hint" id="pwt"></div></div></div></fieldset>
      <fieldset><legend>ID card photo</legend><div class="field"><label for="rcard">Upload a clear photo of your student ID card</label><input id="rcard" name="id_card" type="file" accept="image/jpeg,image/png,image/webp"><div class="hint">Kept private. Your details are checked automatically against the text on the card.</div></div>
        <img id="cardprev" alt="ID card preview" style="max-width:280px;border:1px solid var(--line);border-radius:4px;margin-bottom:12px" hidden>
</fieldset>
      <button class="btn">Create account</button></form><div id="rres"></div></div></div>`;
  const f = $("#rf");
  bindStrength(f.password, $("#pwb"), $("#pwt"));
  f.year.onchange = () => { const y = +f.year.value; f.semester.innerHTML = y ? `<option value="">Select semester</option><option value="${2 * y - 1}">Semester ${2 * y - 1}</option><option value="${2 * y}">Semester ${2 * y}</option>` : `<option value="">Select year first</option>`; };
  f.id_card.onchange = () => { const file = f.id_card.files[0], p = $("#cardprev"); if (file) { p.src = URL.createObjectURL(file); p.hidden = false; } else p.hidden = true; };
  f.onsubmit = async e => {
    e.preventDefault();
    const ok = requireFields(f, [
      ["full_name", "Full name", v => v.split(/\s+/).length < 2 ? "Enter your full name as on the card." : ""],
      ["age", "Age", v => +v < 15 || +v > 60 ? "Age must be between 15 and 60." : ""], ["gender", "Gender"], ["institute_id", "College"], ["branch_id", "Branch"], ["college_id", "College ID / PRN"],
      ["year", "Year"], ["semester", "Semester"],
      ["email", "College email", v => /\.(edu\.in|ac\.in)$/i.test(v) ? "" : "Email must end with .edu.in or .ac.in"],
      ["phone_no", "Phone number", v => /^\d{10}$/.test(v) ? "" : "Enter a valid 10-digit phone number."],
      ["password", "Password", v => strengthOf(v) < 2 || v.length < 8 ? "Use at least 8 characters with letters and numbers." : ""]]);
    const card = f.id_card.files[0]; let cardOk = true;
    setErr(f, "id_card", "");
    if (!card) { setErr(f, "id_card", "ID card photo is required."); cardOk = false; }
    else if (!["image/jpeg", "image/png", "image/webp"].includes(card.type) || card.size > 3 * 1024 * 1024) { setErr(f, "id_card", "Use a JPG, PNG or WebP photo up to 3 MB."); cardOk = false; }
    else { const q = await checkPhoto(card); if (!q.ok) { setErr(f, "id_card", `ID card: ${q.reason}.`); cardOk = false; } }
    if (!ok || !cardOk) return;
    const data = formData(f); data.id_card = card;
    const btn = $("button.btn", f); btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Reading your ID card...";
    data.card_text = await readIdCard(card, f.full_name.value, f.college_id.value);
    btn.textContent = "Creating account...";
    const r = await run(() => api("register", data));
    btn.disabled = false; btn.textContent = label;
    if (r && r.message) {
      $("#rres").innerHTML = `<div class="card" style="margin-top:16px;border-color:${r.verified ? "var(--good)" : "var(--warn)"}"><h2 style="margin-top:0">${r.verified ? "You are verified" : "Account flagged for review"}</h2><p>${esc(r.message)}</p>${r.problems && r.problems.length ? `<ul class="small">${r.problems.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${r.name_on_card ? `<p class="small"><b>Name read from your card:</b> ${esc(r.name_on_card)}</p>` : ""}${r.checked && r.checked.length ? `<p class="small muted">Matched: ${r.checked.map(esc).join(", ")}.</p>` : ""}${r.read_text ? `<details><summary class="small">Text read from your card</summary><pre class="small" style="white-space:pre-wrap;word-break:break-word">${esc(r.read_text)}</pre></details>` : ""}<a class="btn" href="#/login">Log in</a></div>`;
      f.hidden = true; window.scrollTo(0, 0);
    }
  };
}

async function viewProfile() {
  const p = await api("profile"), st = p.student;
  $app.innerHTML = `<div class="pagehead"><div><h1>Profile</h1><p class="sub">${esc(p.email)}</p></div>${st ? `<span class="right">${chip(st.verification_status)}</span>` : ""}</div>
    <div class="cols2"><div>
      <form class="card" id="pf" novalidate><h3>Your details</h3><div class="fgrid">
        <div class="field"><label for="pfn">First name</label><input id="pfn" name="first_name" value="${esc(p.first_name)}"></div>
        <div class="field"><label for="pln">Last name</label><input id="pln" name="last_name" value="${esc(p.last_name)}"></div>
        <div class="field"><label for="psm">Semester</label><select id="psm" name="semester">${opts([1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ v: n, l: "Semester " + n })), "v", "l", st.semester)}</select></div>
        <div class="field"><label>Year</label><input value="Year ${st.year}" disabled></div></div>
        <button class="btn">Save changes</button></form>
      <div class="card"><h3>Verification</h3><dl class="kv"><dt>Status</dt><dd>${chip(st.verification_status)}</dd><dt>Method</dt><dd>${st.verification_method === "ID_CARD_AUTO" ? "ID card matched" : st.verification_method === "ADMIN" ? "Checked by an admin" : "Waiting"}</dd><dt>Name on card</dt><dd>${esc(st.name_on_id)}</dd><dt>College</dt><dd>${esc(st.institute_code)} · ${esc(st.branch_code)}</dd><dt>College ID</dt><dd>${esc(st.college_id)}</dd>${st.remarks ? `<dt>Admin remark</dt><dd>${esc(st.remarks)}</dd>` : ""}</dl></div></div>
    <div>
      <div class="card"><h3>Phone numbers</h3>${p.phones.map(n => `<div class="row between" style="margin-bottom:6px"><span>${esc(n)}</span><button class="btn danger secondary sm" data-rm="${esc(n)}" ${p.phones.length === 1 ? "disabled" : ""} aria-label="Remove ${esc(n)}">Remove</button></div>`).join("")}
        <form id="phf" class="row" style="margin-top:10px;align-items:flex-start;flex-wrap:nowrap" novalidate><div class="field" style="flex:1;margin:0"><label class="sr" for="phn">New phone number</label><input id="phn" name="phone_no" inputmode="numeric" maxlength="10" placeholder="Add a 10-digit number"></div><button class="btn secondary">Add</button></form></div>
      <form class="card" id="pwf" novalidate><h3>Change password</h3>
        <div class="field"><label for="po">Current password</label><input id="po" name="old_password" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pn">New password</label><input id="pn" name="new_password" type="password" autocomplete="new-password"><div class="meter"><i id="pb"></i></div><div class="hint" id="pt"></div></div><button class="btn">Update password</button></form>
      <div class="card" style="border-color:#f1c4c0"><h3>Delete account</h3>
        <p class="small muted">This closes your CampusKart account for good. You will not be able to log in with it again.</p>
        <button class="btn danger secondary" id="dzopen">Delete my account…</button>
        <div id="dzbody" hidden></div></div></div></div>`;
  bindStrength($("#pn"), $("#pb"), $("#pt"));
  $("#pf").onsubmit = async e => { e.preventDefault(); const f = e.target; if (!requireFields(f, [["first_name", "First name"], ["last_name", "Last name"]])) return; if (await run(() => api("updateProfile", formData(f)), "Profile saved")) route(); };
  $("#phf").onsubmit = async e => { e.preventDefault(); const f = e.target; if (!requireFields(f, [["phone_no", "Phone number", v => /^\d{10}$/.test(v) ? "" : "Enter 10 digits."]])) return; if (await run(() => api("addPhone", formData(f)), "Number added")) route(); };
  $$("[data-rm]").forEach(b => { b.onclick = async () => { if (await run(() => api("removePhone", { phone_no: b.dataset.rm }), "Number removed")) route(); }; });
  $("#pwf").onsubmit = async e => { e.preventDefault(); const f = e.target; if (!requireFields(f, [["old_password", "Current password"], ["new_password", "New password", v => v.length < 8 ? "Use at least 8 characters." : ""]])) return; if (await run(() => api("changePassword", formData(f)), "Password updated")) f.reset(); };
  $("#dzopen").onclick = () => openDeletePanel();
}

const CLOSE_LABEL = { listings: "listing", bundles: "bundle", rentals: "rental item", requests: "open request", bookings: "rental booking" };
const ERASE_LABEL = { phone_numbers: "phone number", wishes: "saved wish", recommendations: "recommendation", verification_records: "verification record", reports: "report you filed", flags: "fraud flag", offers: "request you made" };

function tallyLines(counts, labels) {
  return Object.keys(labels).filter(k => (counts && counts[k]) > 0).map(k => pluralize(counts[k], labels[k]));
}

async function openDeletePanel() {
  const btn = $("#dzopen"), box = $("#dzbody");
  btn.disabled = true;
  let impact = null;
  try { impact = await api("accountImpact"); } catch (e) { btn.disabled = false; toast(e.message, true); return; }
  btn.disabled = false;
  if (!impact.allowed) {
    box.hidden = false;
    box.innerHTML = `<div class="strip warn" style="border:1px solid #efdcaa;border-radius:6px;padding:10px 12px;margin-top:12px">An admin account cannot be deleted from the profile page.</div>`;
    return;
  }
  const closing = tallyLines(impact.closing, CLOSE_LABEL), erasing = tallyLines(impact.erasing, ERASE_LABEL), gone = closing.concat(erasing);
  box.hidden = false;
  box.innerHTML = `<div class="strip ${impact.real_delete ? "bad" : "warn"}" style="border:1px solid #f1c4c0;border-radius:6px;padding:10px 12px;margin-top:12px">
      ${impact.real_delete
        ? `<b>Your whole account is removed.</b> You have never listed an item or made a deal, so the database can delete every row about you.`
        : `<b>Your account is closed and emptied.</b> Your name, e-mail, PRN, phone numbers, password and ID-card photo are destroyed and you can never log in again. Past listings stay on record as “Deleted account”, because the database does not allow listings to be deleted.`}</div>
    ${gone.length ? `<p class="small" style="margin:12px 0 0"><b>What this will do now:</b></p><ul class="small" style="margin:6px 0 0 18px">${gone.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p class="small" style="margin:12px 0 0">You have no open listings or deals, so nothing else changes.</p>`}
    <form id="dzf" novalidate style="margin-top:12px">
      <div class="field"><label for="dzpw">Your password</label><input id="dzpw" name="password" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="dzcy">Type DELETE to confirm</label><input id="dzcy" name="confirm" autocomplete="off" placeholder="DELETE"></div>
      <div class="row"><button class="btn danger">Delete my account permanently</button><button type="button" class="btn secondary" id="dzcancel">Cancel</button></div></form>`;
  $("#dzcancel").onclick = () => { box.hidden = true; box.innerHTML = ""; };
  const f = $("#dzf");
  f.onsubmit = async e => {
    e.preventDefault();
    if (!requireFields(f, [["password", "Your password"], ["confirm", "The word DELETE", v => v === "DELETE" ? "" : "Type DELETE in capitals."]])) return;
    if (!await confirmBox("Delete your CampusKart account permanently? This cannot be undone.", "Delete my account")) return;
    const b = $("button.btn.danger", f); b.disabled = true;
    const r = await run(() => api("deleteAccount", { password: f.elements.password.value }));
    b.disabled = false;
    if (r && r.deleted !== undefined) closedAccount(r);
  };
}

function closedAccount(r) {
  const lines = tallyLines(r.closed, CLOSE_LABEL).concat(tallyLines(r.erased, ERASE_LABEL));
  $app.innerHTML = `<div class="pagehead"><div><h1>Your account is closed</h1><p class="sub">Thank you for using CampusKart.</p></div></div>
    <div class="card" style="max-width:640px"><div class="strip bad" style="border:1px solid #f1c4c0;border-radius:6px;padding:10px 12px">${esc(r.message)}</div>
      ${lines.length ? `<p class="small" style="margin:12px 0 0"><b>What happened to your data:</b></p><ul class="small" style="margin:6px 0 0 18px">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      <div class="row" style="margin-top:14px"><a class="btn" href="#/">Back to the home page</a><a class="btn secondary" href="#/register">Register a new account</a></div></div>`;
  renderHeader();
  window.scrollTo(0, 0);
}

function fairPanel(form, getAge) {
  const box = $("#fairbox"); let last = 0, shown = "";
  const upd = async () => {
    const op = +form.elements.original_price.value, cond = form.elements.item_condition.value;
    if (!(op > 0)) { shown = ""; box.innerHTML = `<div class="hint">Enter the original price to see the Fair-Price Guide.</div>`; return; }
    const stamp = ++last, g = await api("fairPrice", { original_price: op, item_condition: cond, age_in_months: getAge() });
    if (stamp !== last) return;
    const key = g.low + "-" + g.high + "-" + g.suggested;
    if (key === shown) return;
    shown = key;
    box.innerHTML = `<div class="card flat" style="background:var(--primary-soft);border-color:#c9daf5"><b>Fair-Price Guide</b><div class="small">Typical range ${money(g.low)} to ${money(g.high)} · suggested <b>${money(g.suggested)}</b></div><button type="button" class="btn secondary sm" id="usefair" style="margin-top:8px">Use ${money(g.suggested)}</button></div>`;
    $("#usefair").onclick = () => { form.elements.selling_price.value = g.suggested; };
  };
  ["original_price", "item_condition", "age_in_months"].forEach(n => { if (form.elements[n]) { form.elements[n].addEventListener("input", upd); form.elements[n].addEventListener("change", upd); } });
  upd();
}

async function viewSell(editId) {
  const loc = META.locations;
  if (editId) {
    const d = await api("getItem", { item_id: editId }), i = d.item;
    if (!me() || me().user_id !== i.seller_id || i.status !== "AVAILABLE") { $app.innerHTML = emptyBox("You can edit an item only while it is available.", `<a href="#/my-listings">Back to my listings</a>`); return; }
    $app.innerHTML = `<div class="crumb"><a href="#/my-listings">My listings</a> / Edit</div><h1>Edit listing</h1><p class="muted">You can change the name, description, price, condition and pickup place.</p>
      <form class="card" id="ef" novalidate style="max-width:700px"><div class="fgrid">
        <div class="field full"><label for="en">Item name</label><input id="en" name="item_name" maxlength="60" value="${esc(i.item_name)}"></div>
        <div class="field full"><label for="ed">Description (at least 30 characters)</label><textarea id="ed" name="description" maxlength="200" rows="3">${esc(i.description)}</textarea></div>
        <div class="field"><label for="eo">Original price (₹)</label><input id="eo" name="original_price" value="${i.original_price}" disabled></div>
        <div class="field"><label for="ep">Your price (₹)</label><input id="ep" name="selling_price" type="number" min="1" max="${i.original_price}" value="${i.selling_price}"></div>
        <div class="field"><label for="ec">Condition</label><select id="ec" name="item_condition">${opts(["NEW", "GOOD", "FAIR", "POOR"].map(c => ({ v: c, l: nice(c) })), "v", "l", i.item_condition)}</select></div>
        <div class="field"><label for="el">Pickup place</label><select id="el" name="pickup_location">${opts(loc.map(l => ({ v: l, l })), "v", "l", i.pickup_location)}</select></div>
        <div class="full" id="fairbox"></div></div><div class="row"><button class="btn">Save changes</button><a class="btn secondary" href="#/my-listings">Cancel</a></div></form>`;
    const f = $("#ef"); fairPanel(f, () => i.age_in_months || 0);
    f.onsubmit = async e => { e.preventDefault(); if (!requireFields(f, [["item_name", "Item name"], ["description", "Description", v => v.length < 30 ? "Write at least 30 characters (" + v.length + " so far)." : ""], ["selling_price", "Your price", v => +v <= 0 || +v > i.original_price ? "Price must be above 0 and not above " + money(i.original_price) + "." : ""]])) return;
      if (await run(() => api("updateItem", { item_id: i.item_id, ...formData(f) }), "Listing updated")) go("#/item/" + i.item_id); };
    return;
  }
  let kind = "ACADEMIC";
  $app.innerHTML = `<div class="auth2">${sidePanel("Good things find new homes", ["Every detail is compulsory", "Add 3 to 5 clear photos", "Price at or below the original price"])}<div><div class="crumb"><a href="#/my-listings">My listings</a> / New</div><h1>Sell an item</h1><p class="muted">Every detail is compulsory. Clear photos help it sell faster.</p>
    <div class="seg" role="group" aria-label="Item type" style="margin-bottom:14px"><button type="button" data-k="ACADEMIC" class="on">Academic item</button><button type="button" data-k="GENERAL">General item</button></div>
    <form id="sf" novalidate><fieldset><legend>About the item</legend><div class="fgrid">
      <div class="field"><label for="sc">Category</label><select id="sc" name="category_id"></select></div>
      <div class="field"><label for="sn">Item name</label><input id="sn" name="item_name" maxlength="60"></div>
      <div class="field full"><label for="sd">Description (at least 30 characters)</label><textarea id="sd" name="description" maxlength="200" rows="3"></textarea><div class="hint" id="dc">0 / 30 characters</div></div>
      <div id="kindfields" class="full fgrid" style="padding:0"></div>
      <div class="field"><label for="sco">Condition</label><select id="sco" name="item_condition">${opts(["NEW", "GOOD", "FAIR", "POOR"].map(c => ({ v: c, l: nice(c) })), "v", "l", "GOOD")}</select></div>
      <div class="field"><label for="sl">Pickup place</label><select id="sl" name="pickup_location">${opts(loc.map(l => ({ v: l, l })), "v", "l", "", "Select a place")}</select></div></div></fieldset>
    <fieldset><legend>Price</legend><div class="fgrid"><div class="field"><label for="so">Original price (₹)</label><input id="so" name="original_price" type="number" min="1"></div>
      <div class="field"><label for="sp">Your price (₹)</label><input id="sp" name="selling_price" type="number" min="1"><div class="hint">Cannot be above the original price.</div></div><div class="full" id="fairbox"></div></div></fieldset>
    <fieldset><legend>Photos</legend><div id="pp"></div></fieldset><div class="row"><button class="btn accent">Publish listing</button><a class="btn secondary" href="#/my-listings">Cancel</a></div></form></div></div>`;
  const f = $("#sf"), pp = photoPicker($("#pp"));
  const drawKind = () => {
    f.category_id.innerHTML = opts(META.categories.filter(c => c.is_academic === (kind === "ACADEMIC")), "category_id", "category_name", "", "Select a category");
    $("#kindfields").innerHTML = kind === "ACADEMIC"
      ? `<div class="field"><label for="ss">Subject</label><select id="ss" name="subject_id">${opts(META.subjects, "subject_id", "subject_name", "", "Select a subject")}</select></div>
         <div class="field"><label for="sb">Branch</label><select id="sb" name="branch_id">${opts(META.branches, "branch_id", "branch_name", "", "Select a branch")}</select></div>
         <div class="field"><label for="st">Semester that needs it</label><select id="st" name="target_semester">${opts([1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ v: n, l: "Semester " + n })), "v", "l", "", "Select a semester")}</select></div>
         <div class="field"><label for="se">Edition or model</label><input id="se" name="edition" maxlength="20"></div>`
      : `<div class="field"><label for="sbr">Brand</label><input id="sbr" name="brand" maxlength="30" placeholder="Write No brand if none"></div>
         <div class="field"><label for="sa">Age in months</label><input id="sa" name="age_in_months" type="number" min="0"></div>`;
    if (f.elements.age_in_months) { f.elements.age_in_months.addEventListener("input", () => f.elements.item_condition.dispatchEvent(new Event("change"))); }
  };
  $$(".seg button").forEach(b => { b.onclick = () => { kind = b.dataset.k; $$(".seg button").forEach(x => x.classList.toggle("on", x === b)); drawKind(); }; });
  drawKind(); fairPanel(f, () => +(f.elements.age_in_months && f.elements.age_in_months.value) || 0);
  f.description.addEventListener("input", () => { const n = f.description.value.trim().length; $("#dc").textContent = n + " / 30 characters"; $("#dc").style.color = n >= 30 ? "var(--good)" : ""; });
  f.onsubmit = async e => {
    e.preventDefault();
    const rules = [["category_id", "Category"], ["item_name", "Item name"], ["description", "Description", v => v.length < 30 ? "Write at least 30 characters (" + v.length + " so far)." : ""], ["item_condition", "Condition"], ["pickup_location", "Pickup place"],
      ["original_price", "Original price", v => +v <= 0 ? "Must be above 0." : ""], ["selling_price", "Your price", v => +v <= 0 ? "Must be above 0." : +v > +f.original_price.value ? "Cannot be above the original price." : ""]];
    if (kind === "ACADEMIC") rules.push(["subject_id", "Subject"], ["branch_id", "Branch"], ["target_semester", "Semester"], ["edition", "Edition or model"]); else rules.push(["brand", "Brand"], ["age_in_months", "Age in months", v => +v < 0 ? "Cannot be negative." : ""]);
    let ok = requireFields(f, rules);
    if (pp.count < 3) { pp.showError("Add at least 3 clear photos."); ok = false; } else pp.showError("");
    if (!ok) return;
    const btn = $("button.btn", f); btn.disabled = true;
    const r = await run(() => api("createItem", { ...formData(f), photos: pp.files, cover: pp.cover }), "Listing published");
    btn.disabled = false; if (r && r.item_id) go("#/item/" + r.item_id);
  };
}

async function viewMyListings() {
  const d = await api("myItems");
  $app.innerHTML = `<div class="pagehead"><div><h1>My listings</h1><p class="sub">Items you are selling.</p></div><div class="row right"><a class="btn" href="#/sell">Sell an item</a><a class="btn secondary" href="#/bundle/new">Create a bundle</a></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px"><div class="tile"><b>${money(d.total_earned)}</b><span>Total earned</span></div><div class="tile"><b>${d.deals}</b><span>Deals completed</span></div><div class="tile"><b>${d.items.filter(i => i.status === "AVAILABLE" || i.status === "BUY_REQUESTED").length}</b><span>Items on sale</span></div></div>
    ${d.items.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Item</th><th>Price</th><th>Status</th><th>Waiting requests</th><th></th></tr>${d.items.map(i => `<tr>
      <td><div class="row" style="flex-wrap:nowrap"><img src="${imgSrc(i.cover)}" alt="" style="width:52px;height:40px;object-fit:cover;border-radius:3px"><div><a href="#/item/${i.item_id}"><b>${esc(i.item_name)}</b></a>${i.bundle ? `<div class="small muted">In bundle ${esc(i.bundle.bundle_name)}</div>` : ""}</div></div></td>
      <td>${money(i.selling_price)}</td><td>${chip(i.status)}</td><td>${i.waiting ? `<a href="#/requests?tab=inbox">${i.waiting} waiting</a>` : "-"}</td>
      <td><div class="row" style="gap:6px">${i.status === "AVAILABLE" ? `<a class="btn secondary sm" href="#/sell/${i.item_id}">Edit</a>` : ""}${["AVAILABLE", "BUY_REQUESTED"].includes(i.status) && !i.bundle ? `<button class="btn danger secondary sm" data-wd="${i.item_id}">Withdraw</button>` : ""}</div></td></tr>`).join("")}</table></div>` : emptyBox("You have not listed anything yet.", `<a class="btn" href="#/sell">Sell your first item</a>`)}`;
  $$("[data-wd]").forEach(b => { b.onclick = async () => { if (await confirmBox("Withdraw this listing? Waiting requests will be rejected.", "Withdraw")) if (await run(() => api("withdrawItem", { item_id: b.dataset.wd }), "Listing withdrawn")) route(); }; });
}

function slotDefault() { const d = new Date(Date.now() + 864e5); d.setHours(11, 0, 0, 0); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

function buyerRequestCard(r) {
  const price = r.request_type === "OFFER" ? `Offer ${money(r.offered_price)}${r.counter_price ? " · counter " + money(r.counter_price) : ""}` : r.request_type === "SWAP" ? "Swap for " + esc(r.offered_item_name) : "Full price " + money(r.target.price);
  return `<div class="card"><div class="row top between"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><img src="${imgSrc(r.target.cover)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:3px">
      <div><a href="${r.target.kind === "BUNDLE" ? "#/bundle/" : "#/item/"}${r.target.id}"><b>${esc(r.target.name)}</b></a> ${r.target.kind === "BUNDLE" ? `<span class="chip orange">Bundle</span>` : ""}
      <div class="small muted">${esc(price)} · seller <a href="#/seller/${r.seller.user_id}">${esc(r.seller.name)}</a></div><div class="small muted">Sent ${fmt(r.requested_on)}${["PENDING", "COUNTERED"].includes(r.status) ? " · expires " + fmtD(r.expires_on) : ""}</div></div></div>
      <div class="row">${chip(r.status)}<span class="chip">${nice(r.request_type)}</span></div></div>
    ${r.message ? `<p class="small" style="margin:8px 0 0">“${esc(r.message)}”</p>` : ""}
    ${r.status === "COUNTERED" ? `<div class="strip info" style="border:1px solid #c9daf5;border-radius:6px;padding:10px 12px;margin-top:10px">The seller countered with <b>${money(r.counter_price)}</b> (your offer was ${money(r.offered_price)}). The seller can counter only once.<div class="row" style="margin-top:8px"><button class="btn sm" data-ca="${r.request_id}">Accept ${money(r.counter_price)}</button><button class="btn danger secondary sm" data-cd="${r.request_id}">Decline</button></div></div>` : ""}
    ${r.status === "ACCEPTED" && !r.sold ? `<div style="margin-top:10px"><div class="small">Meet at <b>${esc(r.handover_location)}</b> on <b>${fmt(r.handover_time)}</b>${r.agreed_price != null ? " · agreed " + (r.request_type === "SWAP" ? "swap" : money(r.agreed_price)) : ""}. Show this Handover Pass to the seller:</div><div class="pass" style="margin-top:6px" aria-label="Handover pass ${r.pass.split("").join(" ")}">${esc(r.pass)}</div></div>` : ""}
    ${r.sold && r.status === "ACCEPTED" ? `<div class="row" style="margin-top:10px"><span class="chip green">Deal complete</span>${r.bill_id ? `<a class="btn secondary sm" href="#/bill/${r.bill_id}">View bill</a>` : ""}</div>
      ${r.rated ? `<div class="small muted" style="margin-top:6px">You rated this deal.</div>` : `<form class="row rate" data-id="${r.request_id}" style="margin-top:10px;align-items:flex-end"><div><label for="st${r.request_id}">Rate the seller</label><select id="st${r.request_id}" name="stars">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} star${n > 1 ? "s" : ""}</option>`).join("")}</select></div><div style="flex:1;min-width:180px"><label for="rv${r.request_id}">Short review</label><input id="rv${r.request_id}" name="review" maxlength="100"></div><button class="btn sm">Submit rating</button></form>`}` : ""}
    ${["PENDING", "COUNTERED"].includes(r.status) ? `<div style="margin-top:10px"><button class="btn danger secondary sm" data-cx="${r.request_id}">Cancel request</button></div>` : ""}</div>`;
}

function sellerRequestCard(r) {
  const what = r.request_type === "OFFER" ? `Offers <b>${money(r.offered_price)}</b> for ${money(r.target.price)}${r.counter_accepted ? ` · accepted your counter of <b>${money(r.counter_price)}</b>` : ""}` : r.request_type === "SWAP" ? `Wants to swap <a href="#/item/${r.offered_item.item_id}"><b>${esc(r.offered_item.item_name)}</b></a> (${money(r.offered_item.selling_price)})` : `Buy at full price ${money(r.target.price)}`;
  let act = "";
  if (r.status === "PENDING") {
    const canCounter = r.request_type === "OFFER" && r.counter_price == null;
    act = `<form class="decide" data-id="${r.request_id}" style="margin-top:10px"><div class="row" style="align-items:flex-end"><div><label for="hl${r.request_id}">Handover place</label><select id="hl${r.request_id}" name="handover_location">${opts(META.locations.map(l => ({ v: l, l })), "v", "l", "")}</select></div>
      <div><label for="ht${r.request_id}">Handover time</label><input id="ht${r.request_id}" type="datetime-local" name="handover_time" value="${slotDefault()}"></div>
      <button class="btn sm" value="ACCEPT">Accept</button>${canCounter ? `<div><label for="cp${r.request_id}">Counter price (₹)</label><input id="cp${r.request_id}" name="counter_price" type="number" min="1" max="${r.target.price}" style="width:120px"></div><button class="btn secondary sm" value="COUNTER" formnovalidate>Counter once</button>` : ""}<button class="btn danger secondary sm" value="REJECT" formnovalidate>Reject</button></div></form>`;
  } else if (r.status === "COUNTERED") act = `<div class="small muted" style="margin-top:8px">Waiting for the buyer to answer your counter of ${money(r.counter_price)}.</div>`;
  else if (r.status === "ACCEPTED" && !r.sold) act = `<form class="sold" data-id="${r.request_id}" style="margin-top:10px"><div class="small" style="margin-bottom:6px">Meet at <b>${esc(r.handover_location)}</b> on <b>${fmt(r.handover_time)}</b>. Ask the buyer for their 4-digit Handover Pass and enter it to complete the sale.</div><div class="row" style="align-items:flex-end"><div><label for="pc${r.request_id}">Handover Pass</label><input id="pc${r.request_id}" name="pass" inputmode="numeric" maxlength="4" style="width:110px" autocomplete="off"></div><button class="btn good sm">Mark as sold</button></div></form>`;
  else if (r.sold && r.status === "ACCEPTED") act = `<div class="row" style="margin-top:8px"><span class="chip green">Sold</span>${r.bill_id ? `<a class="btn secondary sm" href="#/bill/${r.bill_id}">View bill</a>` : ""}</div>`;
  return `<div class="card"><div class="row top between"><div><a href="${r.target.kind === "BUNDLE" ? "#/bundle/" : "#/item/"}${r.target.id}"><b>${esc(r.target.name)}</b></a> ${r.target.kind === "BUNDLE" ? `<span class="chip orange">Bundle</span>` : ""}
      <div class="small">From <a href="#/seller/${r.buyer_id}">${esc(r.buyer_name)}</a> (semester ${r.buyer_semester}) · ${fmt(r.requested_on)}</div><div class="small" style="margin-top:2px">${what}</div></div>
      <div class="row">${chip(r.status)}<span class="chip">${nice(r.request_type)}</span></div></div>${r.message ? `<p class="small" style="margin:8px 0 0">“${esc(r.message)}”</p>` : ""}${act}</div>`;
}

async function viewRequests(q) {
  const [mine, inc] = await Promise.all([api("myRequests"), api("incomingRequests")]);
  const tab = q.tab === "inbox" ? "inbox" : "mine", waiting = inc.filter(r => r.status === "PENDING").length;
  $app.innerHTML = `<div class="pagehead"><div><h1>My Orders</h1><p class="sub">Requests move from waiting to accepted, rejected or expired. A request nobody answers expires after 3 days.</p></div></div>
    <div class="tabs"><a href="#/requests" class="${tab === "mine" ? "on" : ""}">My requests (${mine.length})</a><a href="#/requests?tab=inbox" class="${tab === "inbox" ? "on" : ""}">Requests on my items (${inc.length}${waiting ? ", " + waiting + " waiting" : ""})</a></div>
    <div class="stack">${tab === "mine" ? (mine.length ? mine.map(buyerRequestCard).join("") : emptyBox("You have not asked for anything yet.", `<a class="btn" href="#/browse">Browse items</a>`)) : (inc.length ? inc.map(sellerRequestCard).join("") : emptyBox("No requests on your items yet."))}</div>`;
  const again = () => route();
  $$("[data-ca]").forEach(b => { b.onclick = async () => { if (await run(() => api("respondCounter", { request_id: b.dataset.ca, accept: true }), "Counter accepted. The seller will set the handover.")) again(); }; });
  $$("[data-cd]").forEach(b => { b.onclick = async () => { if (await run(() => api("respondCounter", { request_id: b.dataset.cd, accept: false }), "Counter declined")) again(); }; });
  $$("[data-cx]").forEach(b => { b.onclick = async () => { if (await confirmBox("Cancel this request?", "Cancel request")) if (await run(() => api("cancelRequest", { request_id: b.dataset.cx }), "Request cancelled")) again(); }; });
  $$("form.rate").forEach(f => { f.onsubmit = async e => { e.preventDefault(); if (await run(() => api("rate", { request_id: f.dataset.id, ...formData(f) }), "Thanks for rating")) again(); }; });
  $$("form.decide").forEach(f => { f.onsubmit = async e => {
    e.preventDefault(); const decision = e.submitter.value;
    if (decision === "COUNTER" && !f.elements.counter_price.value) { toast("Enter a counter price first.", true); return; }
    if (await run(() => api("decideRequest", { request_id: f.dataset.id, decision, ...formData(f) }), decision === "ACCEPT" ? "Accepted. Other waiting buyers were told it is taken." : decision === "COUNTER" ? "Counter sent" : "Request rejected")) again(); }; });
  $$("form.sold").forEach(f => { f.onsubmit = async e => {
    e.preventDefault(); if (!/^\d{4}$/.test(f.elements.pass.value.trim())) { toast("Enter the 4-digit pass.", true); return; }
    const r = await run(() => api("markSold", { request_id: f.dataset.id, pass: f.elements.pass.value }), "Sold. A bill was created for both of you.");
    if (r && r.bill_id) go("#/bill/" + r.bill_id); }; });
}

async function viewKit() {
  const k = await api("semesterKit");
  $app.innerHTML = `<div class="pagehead"><div><h1>My Semester Kit</h1><p class="sub">Semester ${k.semester} · ${esc(k.branch)} · books and tools available for each subject</p></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:16px"><div class="tile"><b>${k.covered} of ${k.total}</b><span>subjects covered</span><div class="progress"><i style="width:${k.total ? Math.round(k.covered / k.total * 100) : 0}%"></i></div></div>
      <div class="tile"><b>${money(k.cheapest_total)}</b><span>cheapest total for single items</span></div></div>
    ${k.bundles.length ? `<h2>Bundles that match your subjects</h2><div class="grid wide">${k.bundles.map(bundleCard).join("")}</div>` : ""}
    <h2>Subject by subject</h2><div class="stack">${k.subjects.length ? k.subjects.map(s => `<div class="card"><div class="row between"><div><b>${esc(s.subject_name)}</b> <span class="muted small">${esc(s.subject_code)}</span></div>${s.items.length ? `<span class="chip green">${pluralize(s.items.length, "item")} from ${money(s.cheapest)}</span>` : s.via_bundle ? `<span class="chip orange">In a bundle</span>` : `<span class="chip">Not available yet</span>`}</div>
      ${s.items.length ? `<div class="stack" style="margin-top:8px">${s.items.map(i => `<a class="row between" href="#/item/${i.item_id}" style="color:inherit;border-top:1px solid var(--line);padding-top:8px"><span>${esc(i.item_name)} <span class="muted small">· ${esc(nice(i.item_condition))}</span></span><b>${money(i.selling_price)}</b></a>`).join("")}</div>` : `<p class="small muted" style="margin:6px 0 0">${s.via_bundle ? "This subject is covered by a bundle above." : `Nothing listed yet. <a href="#/wishlist?subject=${s.subject_id}">Add it to your wishlist</a> and we will tell you when it appears.`}</p>`}</div>`).join("") : emptyBox("No subjects are set up for your branch and semester yet.")}</div>`;
}

async function viewWishlist() {
  const ws = await api("wishlist"), pre = parseHash().q.subject || "";
  $app.innerHTML = `<div class="pagehead"><div><h1>Wishlist Radar</h1><p class="sub">Say what you want and your maximum price. New matching listings show up under each wish.</p></div></div>
    <form class="card" id="wf" novalidate style="margin-bottom:16px"><div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
      <div class="field"><label for="wk">What do you want?</label><input id="wk" name="keyword" maxlength="40" placeholder="e.g. DBMS book"></div>
      <div class="field"><label for="ws">Subject (optional)</label><select id="ws" name="subject_id">${opts(META.subjects, "subject_id", "subject_name", pre, "Any subject")}</select></div>
      <div class="field"><label for="wc">Category (optional)</label><select id="wc" name="category_id">${opts(META.categories, "category_id", "category_name", "", "Any category")}</select></div>
      <div class="field"><label for="wm">Maximum price (₹)</label><input id="wm" name="max_price" type="number" min="1"></div></div><button class="btn">Add wish</button></form>
    ${ws.length ? ws.map(w => `<div class="card"><div class="row between"><div><b>${esc([w.keyword, w.subject_name, w.category_name].filter(Boolean).join(" · "))}</b>${w.max_price ? ` <span class="muted small">under ${money(w.max_price)}</span>` : ""}</div><button class="btn danger secondary sm" data-rm="${w.wish_id}">Remove</button></div>
      <h3 style="margin-top:10px">Matches</h3>${w.matches.length ? `<div class="grid">${w.matches.map(m => `<div style="position:relative">${m.is_new ? `<span class="chip orange" style="position:absolute;left:10px;top:42px;z-index:4">New</span>` : ""}${itemCard(m)}</div>`).join("")}</div>` : `<p class="muted small" style="margin:0">No matches yet.</p>`}</div>`).join("") : emptyBox("No wishes yet.")}`;
  $("#wf").onsubmit = async e => { e.preventDefault(); if (!requireFields(e.target, [["keyword", "Keyword"], ["max_price", "Maximum price", v => +v <= 0 ? "Must be above 0." : ""]])) return; if (await run(() => api("addWish", formData(e.target)), "Wish saved")) go("#/wishlist"); };
  $$("[data-rm]").forEach(b => { b.onclick = async () => { await run(() => api("removeWish", { wish_id: b.dataset.rm })); route(); }; });
}

async function viewClearout() {
  const pv = await api("clearoutPreview"), el = pv.filter(x => x.eligible);
  $app.innerHTML = `<div class="pagehead"><div><h1>Semester-End Clearout</h1><p class="sub">Lower the price of unsold items by 10% a week, never below 40% of the original price. Review the preview, then apply.</p></div></div>
    ${pv.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th></th><th>Item</th><th>Original</th><th>Now</th><th>After clearout</th><th>Note</th></tr>${pv.map(x => `<tr><td><input type="checkbox" data-id="${x.item_id}" ${x.eligible ? "checked" : "disabled"} aria-label="Select ${esc(x.item_name)}"></td><td><a href="#/item/${x.item_id}">${esc(x.item_name)}</a><div class="small muted">Listed ${x.days_listed} days ago</div></td><td>${money(x.original_price)}</td><td>${money(x.current_price)}</td><td>${x.eligible ? `<b>${money(x.new_price)}</b> <span class="small muted">(floor ${money(x.floor_price)})</span>` : "-"}</td><td class="small muted">${esc(x.reason || "Ready")}</td></tr>`).join("")}</table></div>
      <div class="row" style="margin-top:14px"><button class="btn" id="apply" ${el.length ? "" : "disabled"}>Apply to selected items</button><span class="muted small">${el.length ? pluralize(el.length, "item") + " ready" : "No items are ready this week."}</span></div>` : emptyBox("You have no available items.", `<a class="btn" href="#/sell">Sell an item</a>`)}`;
  const ap = $("#apply"); if (ap) ap.onclick = async () => {
    const ids = $$("input[data-id]:checked").map(c => c.dataset.id);
    if (!ids.length) { toast("Select at least one item.", true); return; }
    if (await confirmBox("Lower the price of " + pluralize(ids.length, "item") + " as shown in the preview?", "Apply")) if (await run(() => api("clearoutApply", { item_ids: ids }), "Prices updated")) route();
  };
}

async function viewBill(id) {
  const b = await api("bill", { bill_id: id }), total = b.lines.reduce((a, l) => a + l.price, 0);
  const sale = b.kind === "SALE", discount = sale && b.discount_percent ? total - b.amount : 0;
  $app.innerHTML = `<div class="row noprint" style="margin-bottom:12px"><a href="#/requests">← Back</a><button class="btn secondary sm right" id="pr">Print or save as PDF</button></div>
    <div class="bill"><div class="row between"><div class="logo">${LOGO}<span>Campus<span class="k">Kart</span></span></div><div style="text-align:right"><b>${esc(b.bill_no)}</b><div class="muted small">${fmt(b.issued_on)}</div></div></div>
      <h2 style="margin-top:18px">${sale ? "Sale bill" : "Rental bill"}</h2>
      <div class="cols2 small"><div><div class="muted">${sale ? "Buyer" : "Renter"}</div><b>${esc(b.buyer)}</b><div>${esc(b.buyer_email)}</div></div><div><div class="muted">${sale ? "Seller" : "Owner"}</div><b>${esc(b.seller)}</b><div>${esc(b.seller_email)}</div></div></div>
      <table><tr><th>Item</th><th>Price</th></tr>${b.lines.map(l => `<tr><td>${esc(l.name)}</td><td>${money(l.price)}</td></tr>`).join("")}
        ${discount ? `<tr><td>Bundle discount (${b.discount_percent}%)</td><td>-${money(discount)}</td></tr>` : ""}
        ${b.swapped_for ? `<tr><td>Swapped for ${esc(b.swapped_for)}</td><td>No cash</td></tr>` : ""}
        <tr class="total"><td>${sale ? "Amount agreed" : "Total rent"}</td><td>${money(b.amount)}</td></tr>
        ${b.deposit_amount != null ? `<tr><td>Refundable deposit (returned in person)</td><td>${money(b.deposit_amount)}</td></tr>` : ""}</table>
      <div class="small"><div>${sale ? "Handover" : "Rental period"}: ${esc(sale ? fmt(b.date) : b.date)} · ${esc(b.place)}</div>${b.damage_note ? `<div>Damage note: ${esc(b.damage_note)}</div>` : ""}</div>
      <p class="muted small" style="margin:14px 0 0">No payment happens in the app. This bill records the deal made in person on campus.</p>
      <p class="muted small" style="margin:4px 0 0">Email copy: buyer ${b.buyer_emailed_on ? "sent " + fmt(b.buyer_emailed_on) : "not sent yet"} · seller ${b.seller_emailed_on ? "sent " + fmt(b.seller_emailed_on) : "not sent yet"}.</p></div>`;
  $("#pr").onclick = () => window.print();
}

async function viewBundleBuilder() {
  const d = await api("myItems"), free = d.items.filter(i => i.status === "AVAILABLE" && !i.bundle);
  $app.innerHTML = `<div class="crumb"><a href="#/my-bundles">My bundles</a> / New</div><h1>Create a Kit Bundle</h1><p class="muted">Group at least 2 of your available items. The bundle price is fixed at 40% below the total of the item prices.</p>
    ${free.length < 2 ? emptyBox("You need at least 2 available items that are not already in a bundle.", `<a class="btn" href="#/sell">Sell an item</a>`) : `<form id="bf" novalidate class="layout" style="grid-template-columns:1fr 280px">
      <div><div class="field"><label for="bn">Bundle name</label><input id="bn" name="bundle_name" maxlength="60" placeholder="e.g. Semester 3 CSE Kit"></div>
        <div class="stack">${free.map(i => `<label class="card row" style="cursor:pointer;margin:0;flex-wrap:nowrap"><input type="checkbox" name="item_ids" value="${i.item_id}" data-p="${i.selling_price}" style="width:18px;height:18px"><img src="${imgSrc(i.cover)}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:3px"><span style="flex:1"><b>${esc(i.item_name)}</b><span class="small muted" style="display:block">${esc(i.category_name)} · ${esc(nice(i.item_condition))}</span></span><b>${money(i.selling_price)}</b></label>`).join("")}</div></div>
      <aside class="card" style="position:sticky;top:76px"><h3>Bundle price</h3><dl class="kv" style="grid-template-columns:1fr auto"><dt>Items chosen</dt><dd id="bc">0</dd><dt>Total</dt><dd id="bt">${money(0)}</dd><dt>Discount (fixed ${BUNDLE_DISCOUNT}%)</dt><dd id="bd">-${money(0)}</dd></dl><hr style="border:0;border-top:1px solid var(--line)"><div class="row between"><b>Bundle price</b><span class="bigprice" id="bp" style="font-size:22px">${money(0)}</span></div><button class="btn block" style="margin-top:12px">Create bundle</button><p class="hint">The discount cannot be changed.</p></aside></form>`}`;
  const f = $("#bf"); if (!f) return;
  const calc = () => {
    const picks = $$("input[name=item_ids]:checked", f), total = picks.reduce((a, c) => a + +c.dataset.p, 0), price = Math.round(total * (1 - BUNDLE_DISCOUNT / 100));
    $("#bc").textContent = picks.length; $("#bt").textContent = money(total); $("#bd").textContent = "-" + money(total - price); $("#bp").textContent = money(price);
  };
  f.onchange = calc;
  f.onsubmit = async e => {
    e.preventDefault();
    const ids = $$("input[name=item_ids]:checked", f).map(c => c.value);
    if (!requireFields(f, [["bundle_name", "Bundle name"]])) return;
    if (ids.length < 2) { toast("Tick at least 2 items.", true); return; }
    const r = await run(() => api("createBundle", { bundle_name: f.bundle_name.value, item_ids: ids }), "Bundle created");
    if (r && r.bundle_id) go("#/bundle/" + r.bundle_id);
  };
}

async function viewMyBundles() {
  const bs = await api("myBundles");
  $app.innerHTML = `<div class="pagehead"><div><h1>My bundles</h1><p class="sub">Kit bundles you created.</p></div><a class="btn right" href="#/bundle/new">Create a bundle</a></div>
    ${bs.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Bundle</th><th>Items</th><th>Price</th><th>Status</th><th></th></tr>${bs.map(b => `<tr><td><a href="#/bundle/${b.bundle_id}"><b>${esc(b.bundle_name)}</b></a></td><td>${b.items.length}</td><td>${money(b.bundle_price)} <span class="muted small"><s>${money(b.total_price)}</s></span></td><td>${chip(b.status)}</td><td>${["AVAILABLE", "REQUESTED"].includes(b.status) ? `<button class="btn danger secondary sm" data-wd="${b.bundle_id}">Withdraw</button>` : ""}</td></tr>`).join("")}</table></div>` : emptyBox("No bundles yet.", `<a class="btn" href="#/bundle/new">Create your first bundle</a>`)}`;
  $$("[data-wd]").forEach(b => { b.onclick = async () => { if (await confirmBox("Withdraw this bundle? Its items go back to normal listings.", "Withdraw")) if (await run(() => api("withdrawBundle", { bundle_id: b.dataset.wd }), "Bundle withdrawn")) route(); }; });
}

async function viewBundle(id) {
  const d = await api("getBundle", { bundle_id: id }), b = d.bundle, u = me(), mine = d.my_request, own = u && u.user_id === b.seller_id, student = u && u.role === "STUDENT";
  const open = ["AVAILABLE", "REQUESTED"].includes(b.status), canAsk = student && !own && open && VSTATUS === "VERIFIED" && !(mine && ["PENDING", "COUNTERED", "ACCEPTED"].includes(mine.status));
  $app.innerHTML = `<div class="crumb"><a href="#/browse?tab=bundles">Bundles</a> / ${esc(b.bundle_name)}</div>
    <div class="detail"><div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${b.items.map(i => `<a class="pcard" href="#/item/${i.item_id}"><div class="img"><img src="${imgSrc(i.cover)}" alt="${esc(i.item_name)}"></div><div class="body"><div class="name" style="min-height:0">${esc(i.item_name)}</div><div class="small muted">${money(i.selling_price)}</div></div></a>`).join("")}</div></div>
    <div><h1>${esc(b.bundle_name)}</h1><div class="row" style="margin:6px 0 10px">${chip(b.status)}<span class="chip orange">${b.discount_percent}% off the total</span><span class="chip">${pluralize(b.items.length, "item")}</span></div>
      <div class="bigprice">${money(b.bundle_price)} <span class="muted small" style="font-weight:400"><s>${money(b.total_price)}</s></span> <span class="chip green">You save ${money(b.saving)}</span></div>
      <table class="tbl" style="margin:12px 0"><tr><th>Item</th><th>Price</th></tr>${b.items.map(i => `<tr><td>${esc(i.item_name)}</td><td>${money(i.selling_price)}</td></tr>`).join("")}<tr><td><b>Total</b></td><td>${money(b.total_price)}</td></tr><tr><td>Bundle discount (${b.discount_percent}%)</td><td>-${money(b.saving)}</td></tr><tr><td><b>Bundle price</b></td><td><b>${money(b.bundle_price)}</b></td></tr></table>
      ${sellerBlock(b.seller)}
      <div style="margin-top:14px">${!u ? `<a class="btn block" href="#/login">Log in to request this bundle</a>` : own ? `<span class="chip blue">Your bundle</span> <a href="#/my-bundles">Manage</a>` : !open ? `<div class="muted">This bundle is ${nice(b.status).toLowerCase()}.</div>` : student && VSTATUS !== "VERIFIED" ? `<div class="strip warn" style="border:1px solid #f0dca5;border-radius:6px;padding:10px 12px">Only verified students can send requests.</div>` : ""}</div>
      ${mine ? `<div class="card flat" style="margin-top:12px"><div class="row between"><b>Your request</b>${chip(mine.status)}</div>${mine.status === "ACCEPTED" && mine.pass ? `<p class="small" style="margin:8px 0 4px">Meet at <b>${esc(mine.handover_location)}</b> on <b>${fmt(mine.handover_time)}</b>. One Handover Pass covers the whole bundle:</p><div class="pass">${esc(mine.pass)}</div>` : ""}</div>` : ""}
      ${canAsk ? `<form id="bq" class="card" style="margin-top:12px" novalidate><div class="field"><label for="bm">Message to seller (optional)</label><input id="bm" name="message" maxlength="100"></div><button class="btn block">Request the whole bundle</button><p class="hint">One request, one Handover Pass and one bill for all items.</p></form>` : ""}</div></div>`;
  const f = $("#bq"); if (f) f.onsubmit = async e => { e.preventDefault(); if (await run(() => api("sendRequest", { bundle_id: b.bundle_id, request_type: "BUY", message: f.message.value }), "Request sent")) go("#/bundle/" + b.bundle_id); };
}

const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function calendar(mount, booked, maxDays, onChange) {
  const t = new Date(); let y = t.getFullYear(), m = t.getMonth(), start = null, end = null; const todayS = dstr(t);
  const isBooked = s => booked.some(b => s >= b.start_date && s <= b.end_date);
  const clash = (a, z) => booked.some(b => !(z < b.start_date || a > b.end_date));
  const draw = () => {
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), pad0 = (first.getDay() + 6) % 7;
    let cells = ""; for (let i = 0; i < pad0; i++) cells += "<span></span>";
    for (let d = 1; d <= days; d++) {
      const s = dstr(new Date(y, m, d)), dis = s < todayS || isBooked(s), cls = s === start || s === end ? "sel" : start && end && s > start && s < end ? "in" : "";
      cells += `<button type="button" data-d="${s}" class="${cls}" ${dis ? "disabled" : ""} aria-label="${s}${isBooked(s) ? " booked" : ""}">${d}</button>`;
    }
    mount.innerHTML = `<div class="cal"><div class="head"><button type="button" id="cp" aria-label="Previous month">‹</button><span>${first.toLocaleString("en-IN", { month: "long", year: "numeric" })}</span><button type="button" id="cn" aria-label="Next month">›</button></div>
      <div class="g"><b>Mo</b><b>Tu</b><b>We</b><b>Th</b><b>Fr</b><b>Sa</b><b>Su</b>${cells}</div><div class="legend"><span><i style="background:#e3e8f0"></i>Booked or past</span><span><i style="background:var(--primary)"></i>Your dates</span></div></div>`;
    $("#cp", mount).onclick = () => { m--; if (m < 0) { m = 11; y--; } draw(); };
    $("#cn", mount).onclick = () => { m++; if (m > 11) { m = 0; y++; } draw(); };
    $$("[data-d]", mount).forEach(b => { b.onclick = () => {
      const s = b.dataset.d;
      if (!start || (start && end) || s < start) { start = s; end = null; }
      else if (clash(start, s)) { toast("Those dates include a booked day.", true); start = s; end = null; }
      else end = s;
      draw(); onChange(start, end);
    }; });
  };
  draw();
}

async function viewRental(id) {
  const d = await api("getRental", { rental_item_id: id }), r = d.rental, u = me(), own = u && u.user_id === r.owner_id, student = u && u.role === "STUDENT";
  const canAsk = student && !own && r.status !== "REMOVED" && VSTATUS === "VERIFIED";
  $app.innerHTML = `<div class="crumb"><a href="#/browse?tab=rent">Rent</a> / ${esc(r.category_name)}</div>
    <div class="detail"><div>${galleryHtml(r.images, r.rental_name)}</div>
    <div><h1>${esc(r.rental_name)}</h1><div class="row" style="margin:6px 0 10px">${chip(r.status)}<span class="chip">${esc(r.category_name)}</span><span class="chip">${esc(nice(r.item_condition))}</span></div>
      <div class="bigprice">${money(r.rate_per_day)} <span class="muted small" style="font-weight:400">per day</span></div>
      <p style="margin:10px 0">${esc(r.description)}</p>
      <dl class="kv"><dt>Refundable deposit</dt><dd>${money(r.deposit_amount)} (handed over in person)</dd><dt>Longest rental</dt><dd>${pluralize(r.max_days, "day")}</dd><dt>Pickup place</dt><dd>${esc(r.pickup_location)}</dd></dl>
      <div style="margin-top:14px">${sellerBlock(r.owner, "Owner")}</div>
      ${!u ? `<a class="btn block" style="margin-top:14px" href="#/login">Log in to book</a>` : own ? `<div class="row" style="margin-top:14px"><span class="chip blue">Your rental item</span><a href="#/my-rentals?tab=listings">Manage</a></div>` : student && VSTATUS !== "VERIFIED" ? `<div class="strip warn" style="border:1px solid #f0dca5;border-radius:6px;padding:10px 12px;margin-top:14px">Only verified students can rent.</div>` : ""}
      ${d.my_bookings.length ? `<div class="card flat" style="margin-top:12px"><b>Your bookings</b>${d.my_bookings.map(b => `<div class="row between small" style="margin-top:6px"><span>${fmtD(b.start_date)} to ${fmtD(b.end_date)}</span>${chip(b.status)}</div>`).join("")}</div>` : ""}
      ${canAsk ? `<h2>Pick your dates</h2><div id="cal"></div><form id="rb" class="card" style="margin-top:12px;max-width:340px" novalidate><div id="sum" class="small muted">Choose a start date and an end date on the calendar.</div><button class="btn block" style="margin-top:10px" disabled>Send booking request</button></form>` : ""}</div></div>`;
  bindGallery();
  if (!canAsk) return;
  let s = null, e = null; const btn = $("#rb button");
  calendar($("#cal"), r.booked, r.max_days, (a, z) => {
    s = a; e = z;
    if (!a || !z) { $("#sum").textContent = a ? "Now pick the end date (same day for a one-day rental)." : "Choose a start date and an end date on the calendar."; btn.disabled = true; return; }
    const days = Math.round((new Date(z) - new Date(a)) / 864e5) + 1, ok = days <= r.max_days;
    $("#sum").innerHTML = `<dl class="kv" style="grid-template-columns:1fr auto"><dt>Dates</dt><dd>${fmtD(a)} to ${fmtD(z)}</dd><dt>Days</dt><dd>${days}</dd><dt>Rent</dt><dd>${money(days * r.rate_per_day)}</dd><dt>Refundable deposit</dt><dd>${money(r.deposit_amount)}</dd></dl>${ok ? "" : `<div class="photoerr">This item can be rented for at most ${r.max_days} days.</div>`}`;
    btn.disabled = !ok;
  });
  $("#rb").onsubmit = async ev => { ev.preventDefault(); if (await run(() => api("requestRental", { rental_item_id: r.rental_item_id, start_date: s, end_date: e }), "Booking request sent")) go("#/rental/" + r.rental_item_id); };
}

async function viewRentalForm() {
  const cats = META.categories.filter(c => c.is_rentable);
  $app.innerHTML = `<div class="crumb"><a href="#/my-rentals?tab=listings">My rentals</a> / New</div><h1>List an item for rent</h1><p class="muted">For things people need for a few days. Rent and deposit are handed over in person.</p>
    <form id="rf" novalidate style="max-width:760px"><fieldset><legend>About the item</legend><div class="fgrid">
      <div class="field"><label for="rc">Category</label><select id="rc" name="category_id">${opts(cats, "category_id", "category_name", "", "Select a category")}</select></div>
      <div class="field"><label for="rn">Name</label><input id="rn" name="rental_name" maxlength="60"></div>
      <div class="field full"><label for="rd">Description (at least 30 characters)</label><textarea id="rd" name="description" maxlength="200" rows="3"></textarea></div>
      <div class="field"><label for="rco">Condition</label><select id="rco" name="item_condition">${opts(["NEW", "GOOD", "FAIR", "POOR"].map(c => ({ v: c, l: nice(c) })), "v", "l", "GOOD")}</select></div>
      <div class="field"><label for="rl">Pickup place</label><select id="rl" name="pickup_location">${opts(META.locations.map(l => ({ v: l, l })), "v", "l", "", "Select a place")}</select></div></div></fieldset>
    <fieldset><legend>Rent and deposit</legend><div class="fgrid"><div class="field"><label for="rr">Rent per day (₹)</label><input id="rr" name="rate_per_day" type="number" min="1"></div>
      <div class="field"><label for="rdp">Refundable deposit (₹)</label><input id="rdp" name="deposit_amount" type="number" min="0"></div>
      <div class="field"><label for="rm">Longest rental (days)</label><input id="rm" name="max_days" type="number" min="1" max="30"></div></div></fieldset>
    <fieldset><legend>Photos</legend><div id="pp"></div></fieldset><button class="btn">Publish rental</button></form>`;
  const f = $("#rf"), pp = photoPicker($("#pp"));
  f.onsubmit = async e => {
    e.preventDefault();
    let ok = requireFields(f, [["category_id", "Category"], ["rental_name", "Name"], ["description", "Description", v => v.length < 30 ? "Write at least 30 characters (" + v.length + " so far)." : ""], ["pickup_location", "Pickup place"],
      ["rate_per_day", "Rent per day", v => +v <= 0 ? "Must be above 0." : ""], ["deposit_amount", "Deposit", v => +v < 0 ? "Cannot be negative." : ""], ["max_days", "Longest rental", v => +v < 1 || +v > 30 ? "Between 1 and 30 days." : ""]]);
    if (pp.count < 3) { pp.showError("Add at least 3 clear photos."); ok = false; } else pp.showError("");
    if (!ok) return;
    const r = await run(() => api("createRental", { ...formData(f), photos: pp.files, cover: pp.cover }), "Rental published");
    if (r && r.rental_item_id) go("#/rental/" + r.rental_item_id);
  };
}

function bookingTimeline(b) {
  if (["REJECTED", "CANCELLED"].includes(b.status)) return `<div>${chip(b.status)}</div>`;
  const steps = ["Requested", "Accepted", "Handed over", "Returned"], idx = { PENDING: 0, ACCEPTED: 1, HANDED_OVER: 2, RETURNED: 3 }[b.status];
  return `<ol class="timeline" aria-label="Rental steps" style="margin-top:8px">${steps.map((s, n) => `<li class="${n <= idx ? "done" : ""} ${n === idx ? "now" : ""}">${s}</li>`).join("")}</ol>`;
}
function bookingCard(b, role) {
  const other = role === "owner" ? "Renter " + esc(b.renter_name) : "Owner " + esc(b.owner_name);
  return `<div class="card"><div class="row top between"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><img src="${imgSrc(b.cover)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:3px"><div><a href="#/rental/${b.rental_item_id}"><b>${esc(b.rental_name)}</b></a><div class="small muted">${other} · ${fmtD(b.start_date)} to ${fmtD(b.end_date)} · ${pluralize(b.rental_days, "day")}</div>
      <div class="small">Rent ${money(b.total_rent)} · deposit ${money(b.deposit_amount)} · ${esc(b.pickup_location)}</div></div></div><div class="row">${b.is_late ? `<span class="chip red">Late</span>` : ""}${chip(b.status)}</div></div>
    ${b.is_late ? `<div class="strip bad" style="border:1px solid #f1c4c0;border-radius:6px;padding:8px 12px;margin-top:10px">Reminder: this rental was due back on ${fmtD(b.end_date)}.${role === "renter" ? " Please return it to the owner." : " Ask the renter to return it."}</div>` : ""}
    ${bookingTimeline(b)}
    ${b.damage_note ? `<div class="small" style="margin-top:8px"><b>Damage note:</b> ${esc(b.damage_note)}</div>` : ""}
    <div class="row" style="margin-top:10px">
      ${role === "owner" && b.status === "PENDING" ? `<button class="btn sm" data-bk="${b.booking_id}" data-a="decideRental" data-v="ACCEPT">Accept</button><button class="btn danger secondary sm" data-bk="${b.booking_id}" data-a="decideRental" data-v="REJECT">Reject</button>` : ""}
      ${role === "owner" && b.status === "ACCEPTED" ? `<button class="btn sm" data-bk="${b.booking_id}" data-a="handoverRental">Mark handed over</button>` : ""}
      ${role === "owner" && b.status === "HANDED_OVER" ? `<form class="row ret" data-bk="${b.booking_id}" style="align-items:flex-end"><div style="min-width:220px"><label for="dn${b.booking_id}">Damage note (optional)</label><input id="dn${b.booking_id}" name="damage_note" maxlength="150"></div><button class="btn good sm">Mark returned</button></form>` : ""}
      ${role === "renter" && ["PENDING", "ACCEPTED"].includes(b.status) ? `<button class="btn danger secondary sm" data-bk="${b.booking_id}" data-a="cancelBooking">Cancel booking</button>` : ""}
      ${b.bill_id ? `<a class="btn secondary sm" href="#/bill/${b.bill_id}">View bill</a>` : ""}</div></div>`;
}

async function viewMyRentals(q) {
  const d = await api("myRentals"), tab = ["owner", "listings"].includes(q.tab) ? q.tab : "renter";
  const late = d.as_renter.filter(b => b.is_late).length;
  $app.innerHTML = `<div class="pagehead"><div><h1>My rentals</h1><p class="sub">Each step is shown on both sides: requested, accepted, handed over, returned.</p></div><a class="btn right" href="#/rent/new">List a rental</a></div>
    ${late ? `<div class="strip bad" style="border:1px solid #f1c4c0;border-radius:6px;padding:10px 12px;margin-bottom:12px">You have ${pluralize(late, "late rental")}. Please return it as soon as you can.</div>` : ""}
    <div class="tabs"><a href="#/my-rentals" class="${tab === "renter" ? "on" : ""}">I am renting (${d.as_renter.length})</a><a href="#/my-rentals?tab=owner" class="${tab === "owner" ? "on" : ""}">Bookings on my items (${d.as_owner.length})</a><a href="#/my-rentals?tab=listings" class="${tab === "listings" ? "on" : ""}">My rental listings (${d.my_rentals.length})</a></div>
    ${tab === "renter" ? (d.as_renter.length ? `<div class="stack">${d.as_renter.map(b => bookingCard(b, "renter")).join("")}</div>` : emptyBox("You have not booked anything.", `<a class="btn" href="#/browse?tab=rent">Browse rentals</a>`))
    : tab === "owner" ? (d.as_owner.length ? `<div class="stack">${d.as_owner.map(b => bookingCard(b, "owner")).join("")}</div>` : emptyBox("No bookings on your items yet."))
    : (d.my_rentals.length ? `<div class="grid">${d.my_rentals.map(r => `<div>${rentalCard(r)}<div style="margin-top:6px"><button class="btn danger secondary sm" data-wr="${r.rental_item_id}">Withdraw</button></div></div>`).join("")}</div>` : emptyBox("You have not listed anything for rent.", `<a class="btn" href="#/rent/new">List a rental</a>`))}`;
  $$("[data-bk][data-a]").forEach(b => { b.onclick = async () => { const msg = { decideRental: b.dataset.v === "ACCEPT" ? "Booking accepted" : "Booking rejected", handoverRental: "Marked as handed over", cancelBooking: "Booking cancelled" }[b.dataset.a]; if (await run(() => api(b.dataset.a, { booking_id: b.dataset.bk, decision: b.dataset.v }), msg)) route(); }; });
  $$("form.ret").forEach(f => { f.onsubmit = async e => { e.preventDefault(); const r = await run(() => api("returnRental", { booking_id: f.dataset.bk, damage_note: f.elements.damage_note.value }), "Returned. A rental bill was created for both of you."); if (r) route(); }; });
  $$("[data-wr]").forEach(b => { b.onclick = async () => { if (await confirmBox("Withdraw this rental listing?", "Withdraw")) if (await run(() => api("withdrawRental", { rental_item_id: b.dataset.wr }), "Rental withdrawn")) route(); }; });
}

function promptBox(message, { required = false, okLabel = "Confirm", label = "Remark", max = 60 } = {}) {
  return new Promise(res => {
    const m = $("#modal");
    m.className = "modal"; m.hidden = false;
    m.innerHTML = `<form class="card" role="dialog" aria-modal="true" novalidate><p>${esc(message)}</p><div class="field"><label for="pb-in">${esc(label)}${required ? "" : " (optional)"}</label><input id="pb-in" maxlength="${max}"><div class="err"></div></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-v="0">Cancel</button><button class="btn">${esc(okLabel)}</button></div></form>`;
    const done = v => { m.hidden = true; m.innerHTML = ""; res(v); };
    $("[data-v]", m).onclick = () => done(null);
    $("form", m).onsubmit = e => { e.preventDefault(); const v = $("#pb-in", m).value.trim(); if (required && !v) { $(".err", m).textContent = label + " is required."; return; } done(v); };
    $("#pb-in", m).focus();
  });
}

const ADMIN_TABS = [["dashboard", "Dashboard"], ["verifications", "Verifications"], ["reports", "Reports"], ["users", "Users"], ["fraud", "Fraud flags"], ["oversight", "Rentals & bundles"], ["activity", "Activity log"], ["settings", "Settings"]];
const barRows = rows => { const max = Math.max(1, ...rows.map(r => r.count)); return rows.map(r => `<div class="r"><span>${esc(nice(r.name))}</span><div class="t"><i style="width:${r.count / max * 100}%"></i></div><b>${r.count}</b></div>`).join(""); };

async function viewAdmin(section) {
  const known = ADMIN_TABS.some(t => t[0] === section) ? section : "dashboard";
  const title = ADMIN_TABS.find(t => t[0] === known)[1];
  const head = `<div class="adminlayout"><aside class="sidenav"><h3>Admin panel</h3>${ADMIN_TABS.map(t => `<a href="#/admin/${t[0]}" class="${t[0] === known ? "on" : ""}">${t[1]}</a>`).join("")}</aside><div><div class="pagehead"><h1>${title}</h1></div><div id="asec"></div></div></div>`;
  const view = { dashboard: adminDashboard, verifications: adminVerifications, reports: adminReports, users: adminUsers, fraud: adminFraud, oversight: adminOversight, activity: adminActivity, settings: adminSettings }[known];
  $app.innerHTML = head;
  await view($("#asec"));
}

async function adminDashboard(el) {
  const o = await api("adminOverview");
  el.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
    <div class="tile ic"><span class="ti b"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg></span><div><b>${o.students}</b><span>Students</span></div></div>
    <div class="tile ic"><span class="ti o"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg></span><div><b>${o.items_on_sale}</b><span>Items on sale</span></div></div>
    <div class="tile ic"><span class="ti g"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg></span><div><b>${o.items_sold}</b><span>Items sold</span></div></div>
    <div class="tile ic"><span class="ti g"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10M7 9h10M9 5c5 0 5 7 0 7H7l8 7"/></svg></span><div><b>${money(o.value_sold)}</b><span>Value sold</span></div></div>
    <a class="tile ic" href="#/admin/reports" style="color:inherit"><span class="ti o"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v18M5 4h12l-2 4 2 4H5"/></svg></span><div><b>${o.open_reports}</b><span>Open reports</span></div></a>
    <a class="tile ic" href="#/admin/verifications" style="color:inherit"><span class="ti b"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg></span><div><b>${o.pending_verifications}</b><span>Waiting for ID check</span></div></a>
    <a class="tile ic" href="#/admin/fraud" style="color:inherit"><span class="ti o"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg></span><div><b>${o.open_flags}</b><span>Open fraud flags</span></div></a></div>
    <div class="cols2" style="margin-top:16px"><div class="card bars"><h3>Items by category</h3>${barRows(o.by_category)}</div><div class="card bars"><h3>Items by status</h3>${barRows(o.by_status)}</div></div>`;
}

async function adminVerifications(el) {
  const v = await api("adminVerifications");
  const info = s => `<div class="small muted">${esc(s.email)} · ${esc(s.institute_code)} · ${esc(s.branch_code)} · year ${s.year}, semester ${s.semester}</div><div class="small">PRN ${esc(s.college_id)} · name on ID card: <b>${esc(s.name_on_id)}</b> · ${esc(s.gender)}, ${s.age}</div>`;
  el.innerHTML = `<h2 style="margin-top:0">Needs a manual look</h2>${v.pending.length ? v.pending.map(s => `<div class="card"><div class="row between top"><div><b>${esc(s.name)}</b>${info(s)}${s.remarks ? `<div class="small" style="margin-top:6px;color:var(--warn)"><b>Flag:</b> ${esc(s.remarks)}</div>` : ""}<div class="small muted" style="margin-top:4px">The ID card photo is stored privately on the server.</div></div>
      <div class="row"><button class="btn good sm" data-ok="${s.user_id}">Approve</button><button class="btn danger secondary sm" data-no="${s.user_id}">Reject</button></div></div></div>`).join("") : emptyBox("Nobody is waiting.")}
    <h2>Verified students</h2>${v.verified.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Name</th><th>College</th><th>PRN</th><th>Method</th><th></th></tr>${v.verified.map(s => `<tr><td>${esc(s.name)}<div class="small muted">${esc(s.email)}</div></td><td>${esc(s.institute_code)} · ${esc(s.branch_code)}</td><td>${esc(s.college_id)}</td><td>${s.verification_method === "ID_CARD_AUTO" ? "ID card match" : "Admin"}</td><td><button class="btn danger secondary sm" data-rv="${s.user_id}">Revoke</button></td></tr>`).join("")}</table></div>` : emptyBox("No verified students.")}
    ${v.rejected.length ? `<h2>Rejected or revoked</h2><div class="tblwrap"><table class="tbl stackm"><tr><th>Name</th><th>Remark</th><th></th></tr>${v.rejected.map(s => `<tr><td>${esc(s.name)}<div class="small muted">${esc(s.email)}</div></td><td>${esc(s.remarks)}</td><td><button class="btn good sm" data-ok="${s.user_id}">Approve</button></td></tr>`).join("")}</table></div>` : ""}`;
  const act = async (id, status, remarks, msg) => { if (await run(() => api("verifyStudent", { user_id: id, status, remarks }), msg)) route(); };
  $$("[data-ok]").forEach(b => { b.onclick = async () => { const r = await promptBox("Approve this student?", { okLabel: "Approve" }); if (r !== null) act(b.dataset.ok, "VERIFIED", r, "Student verified"); }; });
  $$("[data-no]").forEach(b => { b.onclick = async () => { const r = await promptBox("Reject this registration. The student will see your remark.", { required: true, okLabel: "Reject" }); if (r !== null) act(b.dataset.no, "REJECTED", r, "Student rejected"); }; });
  $$("[data-rv]").forEach(b => { b.onclick = async () => { const r = await promptBox("Revoke this student's verification. They cannot trade until verified again.", { required: true, okLabel: "Revoke" }); if (r !== null) act(b.dataset.rv, "REJECTED", r, "Verification revoked"); }; });
}

async function adminReports(el) {
  const all = await api("adminReports"), show = parseHash().q.all === "1" ? all : all.filter(r => r.status === "OPEN");
  el.innerHTML = `<div class="row between" style="margin-bottom:12px"><div class="seg"><a class="btn sm ${show === all ? "secondary" : ""}" href="#/admin/reports">Open (${all.filter(r => r.status === "OPEN").length})</a></div><a href="#/admin/reports?all=1" class="small">Show all reports (${all.length})</a></div>
    ${show.length ? show.map(r => `<div class="card"><div class="row between top"><div><a href="#/item/${r.item_id}"><b>${esc(r.item_name)}</b></a> ${chip(r.item_status)}<div class="small muted">Seller ${esc(r.seller_name)} · reported by ${esc(r.reporter_name)} · ${fmt(r.reported_on)}</div><div class="small" style="margin-top:4px">${chip("OPEN", nice(r.reason)).replace("amber", "")} ${esc(r.details)}</div>${r.status !== "OPEN" ? `<div class="small muted" style="margin-top:4px">${nice(r.status)}: ${esc(r.action_taken)}</div>` : ""}</div>
      ${r.status === "OPEN" ? `<div class="row"><button class="btn sm" data-rs="${r.report_id}" data-rm="1">Resolve and remove item</button><button class="btn secondary sm" data-rs="${r.report_id}">Resolve</button><button class="btn danger secondary sm" data-ds="${r.report_id}">Dismiss</button></div>` : chip(r.status)}</div></div>`).join("") : emptyBox("No reports here.")}`;
  const act = async (id, status, rm, label) => { const note = await promptBox(label, { required: true, label: "Action taken", okLabel: "Save", max: 80 }); if (note === null) return; if (await run(() => api("resolveReport", { report_id: id, status, action_taken: note, remove_item: rm }), "Report closed")) route(); };
  $$("[data-rs]").forEach(b => { b.onclick = () => act(b.dataset.rs, "RESOLVED", !!b.dataset.rm, b.dataset.rm ? "Resolve this report and remove the item." : "Resolve this report."); });
  $$("[data-ds]").forEach(b => { b.onclick = () => act(b.dataset.ds, "DISMISSED", false, "Dismiss this report."); });
}

async function adminUsers(el) {
  const q = parseHash().q.q || "", us = await api("adminUsers", { q });
  el.innerHTML = `<form id="uf" class="row" style="margin-bottom:12px"><input type="search" name="q" value="${esc(q)}" placeholder="Search by name or email" aria-label="Search users" style="max-width:320px"><button class="btn secondary">Search</button></form>
    ${us.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Name</th><th>College ID</th><th>Sem</th><th>Verification</th><th>Account</th><th></th></tr>${us.map(u => `<tr><td>${esc(u.name)}<div class="small muted">${esc(u.email)}</div></td><td>${esc(u.college_id)}</td><td>${u.semester}</td><td>${chip(u.verification_status)}</td><td>${u.is_active ? `<span class="chip green">Active</span>` : `<span class="chip red">Blocked</span>`}</td><td><button class="btn ${u.is_active ? "danger secondary" : "secondary"} sm" data-u="${u.user_id}" data-to="${u.is_active ? 0 : 1}">${u.is_active ? "Block" : "Unblock"}</button></td></tr>`).join("")}</table></div>` : emptyBox("No users found.")}`;
  $("#uf").onsubmit = e => { e.preventDefault(); go("#/admin/users?" + qs({ q: new FormData(e.target).get("q") })); };
  $$("[data-u]").forEach(b => { b.onclick = async () => { if (+b.dataset.to === 0 && !(await confirmBox("Block this user? They will not be able to log in.", "Block"))) return; if (await run(() => api("setActive", { user_id: b.dataset.u, is_active: b.dataset.to }), +b.dataset.to ? "User unblocked" : "User blocked")) route(); }; });
}

async function adminFraud(el) {
  const fs = await api("fraudFlags"), why = { REPEATED_REPORTS: "3 or more open reports", MANY_REJECTIONS: "5 or more rejected requests in 30 days", PRICE_ABOVE_GUIDE: "Price far above the Fair-Price Guide", OTHER: "Other" };
  el.innerHTML = `<p class="muted">Accounts flagged automatically for repeated reports, many rejected requests, or prices far above the Fair-Price Guide.</p>${fs.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Student</th><th>Reason</th><th>Raised</th><th>Status</th><th></th></tr>${fs.map(f => `<tr><td>${esc(f.student_name)}<div class="small muted">${f.is_active ? "Active" : "Blocked"} · semester ${f.semester}</div></td><td>${esc(why[f.reason] || nice(f.reason))}</td><td>${fmt(f.raised_on)}</td><td>${chip(f.status)}${f.note ? `<div class="small muted">${esc(f.note)}</div>` : ""}</td>
      <td>${f.status === "OPEN" ? `<div class="row" style="gap:6px"><button class="btn secondary sm" data-fc="${f.flag_id}">Clear</button><button class="btn danger sm" data-fb="${f.flag_id}">Block student</button></div>` : ""}</td></tr>`).join("")}</table></div>` : emptyBox("No flags.")}`;
  const act = async (id, action, label) => { const note = await promptBox(label, { okLabel: action === "BLOCK" ? "Block" : "Clear", max: 100 }); if (note === null) return; if (await run(() => api("reviewFlag", { flag_id: id, action, note }), action === "BLOCK" ? "Student blocked" : "Flag cleared")) route(); };
  $$("[data-fc]").forEach(b => { b.onclick = () => act(b.dataset.fc, "CLEAR", "Clear this flag. Add a note if you like."); });
  $$("[data-fb]").forEach(b => { b.onclick = () => act(b.dataset.fb, "BLOCK", "Block this student. They will not be able to log in."); });
}

async function adminOversight(el) {
  const d = await api("adminOversight");
  el.innerHTML = `<h2 style="margin-top:0">Rental items</h2>${d.rentals.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Item</th><th>Owner</th><th>Status</th><th>Damage notes</th><th></th></tr>${d.rentals.map(r => `<tr><td><a href="#/rental/${r.rental_item_id}">${esc(r.rental_name)}</a></td><td>${esc(r.owner_name)}</td><td>${chip(r.status)}</td><td>${r.damage_notes.length ? r.damage_notes.map(n => `<div class="small">${esc(n.note)} <span class="muted">(${esc(n.renter_name)}, ${fmtD(n.returned_on)})</span></div>`).join("") : `<span class="muted small">None</span>`}</td><td><button class="btn danger secondary sm" data-rr="${r.rental_item_id}">Remove</button></td></tr>`).join("")}</table></div>` : emptyBox("No rental items.")}
    <h2>Bundles</h2>${d.bundles.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>Bundle</th><th>Seller</th><th>Items</th><th>Price</th><th></th></tr>${d.bundles.map(b => `<tr><td><a href="#/bundle/${b.bundle_id}">${esc(b.bundle_name)}</a></td><td>${esc(b.seller_name)}</td><td>${b.items.length}</td><td>${money(b.bundle_price)}</td><td><button class="btn danger secondary sm" data-rb="${b.bundle_id}">Remove</button></td></tr>`).join("")}</table></div>` : emptyBox("No bundles.")}`;
  $$("[data-rr]").forEach(b => { b.onclick = async () => { if (await confirmBox("Remove this rental listing?", "Remove")) if (await run(() => api("adminRemoveRental", { rental_item_id: b.dataset.rr }), "Rental removed")) route(); }; });
  $$("[data-rb]").forEach(b => { b.onclick = async () => { if (await confirmBox("Remove this bundle? Its items go back to normal listings.", "Remove")) if (await run(() => api("adminRemoveBundle", { bundle_id: b.dataset.rb }), "Bundle removed")) route(); }; });
}

async function adminActivity(el) {
  const log = await api("activityLog");
  el.innerHTML = log.length ? `<div class="tblwrap"><table class="tbl stackm"><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Remark</th></tr>${log.map(l => `<tr><td>${fmt(l.performed_at)}</td><td>${esc(l.admin_name)}</td><td>${chip("", nice(l.action))}</td><td>${esc(nice(l.target_type))} ${esc(l.target_id)}</td><td>${esc(l.remark)}</td></tr>`).join("")}</table></div>` : emptyBox("No admin actions yet.");
}

async function adminSettings(el) {
  const s = await api("settings");
  el.innerHTML = `<div class="card" style="max-width:560px"><h3>Semester-End Farewell Sale banner</h3><p class="muted small">Shows a banner to every visitor while seniors clear out their unsold items.</p>
    <label class="row" style="cursor:pointer"><input type="checkbox" id="fb" ${s.farewell_banner ? "checked" : ""} style="width:18px;height:18px"><span>Show the farewell sale banner</span></label></div>`;
  $("#fb").onchange = async e => { if (await run(() => api("setSettings", { farewell_banner: e.target.checked ? 1 : 0 }), e.target.checked ? "Banner is on" : "Banner is off")) renderStrips(); };
}

/**
 * Boots the original CampusKart view layer inside the React shell.
 * Called once from App.jsx after the layout containers have been mounted.
 */
export function startLegacyApp(root) {
  $app = root || document.getElementById("app");
  if (!$app) throw new Error("The #app container is missing.");
  return route();
}
