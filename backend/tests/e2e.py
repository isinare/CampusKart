"""
End-to-end HTTP test for the Node.js + Express + MongoDB CampusKart API.

It mirrors the HTTP cases described in the original Java README: public
catalogue, guards, registration with a multipart ID-card upload, wishlist,
a full sale (accept -> handover pass -> bill -> rating), bundles, offers and
counters, cancellations, rentals, reports, admin tools and account deletion.

Run it against a scratch database and server, for example:

    set MONGODB_DB=campuskart_e2e
    npm run seed
    set PORT=8081
    node server.js
    python tests/e2e.py http://localhost:8081

Every check prints PASS/FAIL and the script exits non-zero on a failure.
"""

import io
import os
import re
import sys
import datetime

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8081").rstrip("/")
API = BASE + "/campuskart/api/"
UPLOADS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
BEFORE_FILES = set(os.listdir(UPLOADS)) if os.path.isdir(UPLOADS) else set()
TEST_UPLOAD = re.compile(r"^[0-9a-f]{32}\.(png|jpe?g|gif|webp)$", re.IGNORECASE)


def clean_test_uploads():
    """Remove multer's random-named uploads (the seeded files start with 'up')."""
    if not os.path.isdir(UPLOADS):
        return
    for name in os.listdir(UPLOADS):
        if name in BEFORE_FILES and not TEST_UPLOAD.match(name):
            continue
        if TEST_UPLOAD.match(name):
            try:
                os.remove(os.path.join(UPLOADS, name))
            except OSError:
                pass


clean_test_uploads()

PASSED = 0
FAILED = []


def check(label, condition, detail=""):
    global PASSED
    if condition:
        PASSED += 1
    else:
        FAILED.append(label)
        print("FAIL:", label, detail)


def call(session, name, payload=None, files=None):
    response = session.post(
        API + name,
        json=None if files else (payload or {}),
        data=payload if files else None,
        files=files,
        timeout=30,
    )
    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text}
    return response.status_code, body


def login(email, password):
    session = requests.Session()
    status, body = call(session, "login", {"email": email, "password": password})
    check("login %s" % email, status == 200 and body.get("role") in ("STUDENT", "ADMIN"), (status, body))
    return session, body


# A 1x1 PNG is enough: the API stores bytes and only the client-side OCR reads pixels.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c636000000002000155d2f2ee0000000049454e44ae426082"
)


def photos(count=3):
    return [("photos", ("photo%d.png" % i, io.BytesIO(PNG), "image/png")) for i in range(1, count + 1)]


def register(full_name, email, college_id, phone, password, card_text, verified=True):
    session = requests.Session()
    data = {
        "full_name": full_name,
        "email": email,
        "college_id": college_id,
        "phone_no": phone,
        "password": password,
        "age": "20",
        "gender": "Female",
        "year": "2",
        "semester": "3",
        "institute_id": META["institutes"][0]["institute_id"],
        "branch_id": META["branches"][0]["branch_id"],
        "card_text": card_text,
    }
    files = [("id_card", ("card.png", io.BytesIO(PNG), "image/png"))] + photos(1)
    return call(session, "register", data, files)


def academic_item(session, name, price, original=600, description=None):
    data = {
        "item_name": name,
        "description": description
        or "A well kept copy used for one semester, with all pages and no writing inside.",
        "category_id": META["categories"][0]["category_id"],
        "item_condition": "GOOD",
        "original_price": str(original),
        "selling_price": str(price),
        "pickup_location": META["locations"][0],
        "kind": "ACADEMIC",
        "subject_id": META["subjects"][0]["subject_id"],
        "branch_id": META["branches"][0]["branch_id"],
        "target_semester": "3",
        "edition": "3rd",
        "cover": "0",
    }
    return call(session, "createItem", data, photos(3))


def tomorrow(days=1):
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()


# ---------------------------------------------------------------- 1. catalogue
public = requests.Session()
status, META = call(public, "meta")
check("meta 200", status == 200)
check("meta branches", len(META.get("branches", [])) == 7)
check("meta categories", len(META.get("categories", [])) == 11)
check("meta subjects", len(META.get("subjects", [])) == 5)
check("meta institutes", len(META.get("institutes", [])) == 5)
check("meta locations", len(META.get("locations", [])) == 7)
check("meta settings", isinstance(META.get("settings", {}).get("farewell_banner"), bool))

status, home = call(public, "home")
check("home 200", status == 200)
check("home just listed", len(home.get("just_listed", [])) == 6, home.get("just_listed"))
check("home stats items", home.get("stats", {}).get("items") == 8, home.get("stats"))

status, items = call(public, "listItems", {"page": 1})
check("listItems 200", status == 200)
check("listItems total", items.get("total") == 8, items.get("total"))
check("listItems page", len(items.get("items", [])) == 8)

status, cheap = call(public, "listItems", {"sort": "price_asc"})
prices = [i["selling_price"] for i in cheap.get("items", [])]
check("listItems price sort", prices == sorted(prices), prices)

status, found = call(public, "listItems", {"q": "notes"})
check("listItems search", found.get("total", 0) >= 1, found.get("total"))

status, item = call(public, "getItem", {"item_id": "I101"})
check("getItem 200", status == 200 and item.get("item", {}).get("item_id") == "I101")
check("getItem photos", len(item.get("item", {}).get("images", [])) == 3, item.get("item", {}).get("images"))
status, logged = call(public, "getItem", {"item_id": "I102"})
check("getItem log", len(logged.get("log", [])) >= 1, logged.get("log"))

status, fair = call(public, "fairPrice", {"original_price": 1000, "item_condition": "GOOD", "age_in_months": 12})
check("fairPrice values", (fair.get("low"), fair.get("suggested"), fair.get("high")) == (525, 620, 710), fair)

status, bundles = call(public, "listBundles")
check("listBundles", status == 200 and bundles.get("total") == 2, bundles.get("total"))
status, bundle = call(public, "getBundle", {"bundle_id": "BN101"})
body = bundle.get("bundle", {})
check("getBundle items", len(body.get("items", [])) == 3, body.get("items"))
check("getBundle price", body.get("bundle_price") == 330 and body.get("discount_percent") == 40, body)

status, rentals = call(public, "listRentals")
check("listRentals", status == 200 and rentals.get("total") == 5, rentals.get("total"))
status, rental = call(public, "getRental", {"rental_item_id": "RI101"})
check("getRental", status == 200 and rental.get("rental", {}).get("rate_per_day", 0) > 0, rental.get("rental"))

# ------------------------------------------------------------------- 2. guards
status, body = call(public, "profile")
check("profile guard 401", status == 401, (status, body))
status, body = call(public, "adminOverview")
check("admin guard 401", status == 401, (status, body))
status, body = call(public, "login", {"email": "aarav.sharma@college.edu.in", "password": "nope"})
check("wrong password 400", status == 400 and body.get("error") == "Wrong email or password.", (status, body))

# ------------------------------------------------------------- 3. registration
stamp = "2507012%04d" % (int(datetime.datetime.now().timestamp()) % 10000)
SELLER_EMAIL = "e2e.seller.%s@college.edu.in" % stamp
BUYER_EMAIL = "e2e.buyer.%s@college.edu.in" % stamp
PENDING_EMAIL = "e2e.pending.%s@college.edu.in" % stamp
REJECT_EMAIL = "e2e.reject.%s@college.edu.in" % stamp
DELETE_EMAIL = "e2e.delete.%s@college.edu.in" % stamp
PASSWORD = "Testpass1"

status, body = register(
    "E2E Seller", SELLER_EMAIL, stamp + "1", "9876500001", PASSWORD,
    "Name : E2E SELLER\nPRN : %s1\nCollege : SIT" % stamp,
)
check("register seller verified", status == 200 and body.get("verified") is True, (status, body))
SELLER_ID = body.get("user_id")

status, body = register(
    "E2E Buyer", BUYER_EMAIL, stamp + "2", "9876500002", PASSWORD,
    "Name : E2E BUYER\nPRN : %s2\nCollege : SIT" % stamp,
)
check("register buyer verified", status == 200 and body.get("verified") is True, (status, body))
BUYER_ID = body.get("user_id")

status, body = register(
    "E2E Pending", PENDING_EMAIL, stamp + "3", "9876500003", PASSWORD,
    "Name : SOMEBODY ELSE\nPRN : 11111111111",
)
check("register mismatch flagged", status == 200 and body.get("flagged") is True, (status, body))
PENDING_ID = body.get("user_id")
check("register stored card text", bool(body.get("read_text")))

status, body = register(
    "E2E Reject", REJECT_EMAIL, stamp + "4", "9876500004", PASSWORD,
    "Name : SOMEBODY ELSE\nPRN : 22222222222",
)
REJECT_ID = body.get("user_id")

status, body = call(requests.Session(), "register", {
    "full_name": "No Card",
    "email": "e2e.nocard.%s@college.edu.in" % stamp,
    "college_id": stamp + "9",
    "phone_no": "9876500009",
    "password": PASSWORD,
    "age": "20",
    "gender": "Female",
    "year": "2",
    "semester": "3",
    "institute_id": META["institutes"][0]["institute_id"],
    "branch_id": META["branches"][0]["branch_id"],
})
check("register needs card", status == 400 and "ID card" in body.get("error", ""), (status, body))

seller, seller_session = login(SELLER_EMAIL, PASSWORD)
buyer, buyer_session = login(BUYER_EMAIL, PASSWORD)
pending, _ = login(PENDING_EMAIL, PASSWORD)
check("seller verified", seller_session.get("verification_status") == "VERIFIED", seller_session)
check("buyer verified", buyer_session.get("verification_status") == "VERIFIED", buyer_session)
check("pending not verified", pending is not None)

status, profile = call(seller, "profile")
check("profile seller", status == 200 and profile.get("email") == SELLER_EMAIL, profile)
status, body = call(seller, "adminOverview")
check("student admin refused", status == 400 and "Admins only" in body.get("error", ""), (status, body))
for endpoint in ["myItems", "myRequests", "incomingRequests", "notifications", "wishlist",
                 "myBundles", "myRentals", "semesterKit", "clearoutPreview"]:
    status, _ = call(seller, endpoint)
    check("student read " + endpoint, status == 200, status)

# ---------------------------------------------------------------- 4. wishlist
status, _ = call(seller, "addWish", {"keyword": "quantum", "max_price": 500})
check("addWish", status == 200)
status, wishes = call(seller, "wishlist")
check("wishlist has wish", status == 200 and len(wishes) == 1 and wishes[0]["keyword"] == "quantum", wishes)
WISH_ID = wishes[0]["wish_id"] if wishes else None
status, _ = call(seller, "removeWish", {"wish_id": WISH_ID})
status, wishes = call(seller, "wishlist")
check("removeWish", status == 200 and len(wishes) == 0, wishes)

# ------------------------------------------------------------------- 5. selling
status, body = academic_item(seller, "E2E Data Structures Textbook", 300)
check("createItem", status == 200 and body.get("item_id"), (status, body))
ITEM1 = body.get("item_id")
status, detail = call(seller, "getItem", {"item_id": ITEM1})
check("created item photos", len(detail.get("item", {}).get("images", [])) == 3, detail)
check("created item available", detail.get("item", {}).get("status") == "AVAILABLE", detail.get("item"))
check("created item log", len(detail.get("log", [])) == 1, detail.get("log"))

status, _ = call(seller, "updateItem", {
    "item_id": ITEM1,
    "item_name": "E2E Data Structures Textbook",
    "description": "A well kept copy used for one semester, with all pages and no writing inside.",
    "item_condition": "GOOD",
    "selling_price": "280",
    "pickup_location": META["locations"][0],
})
check("updateItem", status == 200, status)
status, detail = call(seller, "getItem", {"item_id": ITEM1})
check("price updated", detail.get("item", {}).get("selling_price") == 280, detail.get("item"))

status, body = academic_item(seller, "E2E Bad Price", 900, original=500)
check("createItem price guard", status == 400, (status, body))

status, body = call(buyer, "sendRequest", {"item_id": ITEM1, "message": "Can meet tomorrow."})
check("sendRequest", status == 200 and body.get("request_id"), (status, body))
REQ1 = body.get("request_id")
status, incoming = call(seller, "incomingRequests")
check("incoming has request", any(r["request_id"] == REQ1 and r["status"] == "PENDING" for r in incoming), incoming)
status, _ = call(seller, "decideRequest", {
    "request_id": REQ1,
    "decision": "ACCEPT",
    "handover_location": "Library",
    "handover_time": tomorrow() + " 17:00:00",
})
check("decideRequest accept", status == 200, status)
status, mine = call(buyer, "myRequests")
accepted = [r for r in mine if r["request_id"] == REQ1][0]
check("accepted request", accepted["status"] == "ACCEPTED" and accepted.get("pass"), accepted)
PASS1 = accepted.get("pass")
status, body = call(seller, "markSold", {"request_id": REQ1, "pass": "0000"})
check("wrong pass refused", status == 400 and "pass" in body.get("error", "").lower(), (status, body))
status, body = call(seller, "markSold", {"request_id": REQ1, "pass": PASS1})
check("markSold", status == 200 and body.get("bill_id"), (status, body))
BILL1 = body.get("bill_id")
status, sold = call(buyer, "getItem", {"item_id": ITEM1})
check("item sold", sold.get("item", {}).get("status") == "SOLD", sold.get("item"))

status, bill = call(buyer, "bill", {"bill_id": BILL1})
check("sale bill", status == 200 and bill.get("kind") == "SALE", bill)
check("sale amount", bill.get("amount") == 280, bill.get("amount"))
check("sale bill number", str(bill.get("bill_no", "")).startswith("CK-"), bill.get("bill_no"))
check("sale lines", len(bill.get("lines", [])) == 1, bill.get("lines"))
status, denied = call(pending, "bill", {"bill_id": BILL1})
check("bill refused to stranger", status == 400, (status, denied))

status, _ = call(buyer, "rate", {"request_id": REQ1, "stars": 5, "review": "Smooth handover, thanks!"})
check("rate", status == 200, status)
status, body = call(buyer, "rate", {"request_id": REQ1, "stars": 5, "review": "Again"})
check("rate twice refused", status == 400, (status, body))
status, card = call(public, "sellerCard", {"user_id": SELLER_ID})
check("seller card review", card.get("rating_count", 0) >= 1, card)

# -------------------------------------------------------------------- 6. bundle
status, a = academic_item(seller, "E2E Bundle Book One", 200)
ITEM_B1 = a.get("item_id")
status, b = academic_item(seller, "E2E Bundle Book Two", 300)
ITEM_B2 = b.get("item_id")
status, body = call(seller, "createBundle", {"bundle_name": "E2E Kit", "item_ids": [ITEM_B1, ITEM_B2]})
check("createBundle", status == 200 and body.get("bundle_id"), (status, body))
BUNDLE1 = body.get("bundle_id")
status, got = call(buyer, "getBundle", {"bundle_id": BUNDLE1})
check("bundle discount", got.get("bundle", {}).get("discount_percent") == 40, got.get("bundle"))
check("bundle price", got.get("bundle", {}).get("bundle_price") == 300, got.get("bundle"))
status, body = call(buyer, "sendRequest", {"bundle_id": BUNDLE1})
REQ_B = body.get("request_id")
status, got = call(buyer, "getBundle", {"bundle_id": BUNDLE1})
check("bundle requested", got.get("bundle", {}).get("status") == "REQUESTED", got.get("bundle"))
status, _ = call(seller, "decideRequest", {
    "request_id": REQ_B, "decision": "ACCEPT",
    "handover_location": "Main Gate", "handover_time": tomorrow(2) + " 11:00:00",
})
status, mine = call(buyer, "myRequests")
row = [r for r in mine if r["request_id"] == REQ_B][0]
PASS_B = row.get("pass")
status, body = call(seller, "markSold", {"request_id": REQ_B, "pass": PASS_B})
check("bundle markSold", status == 200, (status, body))
BILL_B = body.get("bill_id")
status, bill = call(buyer, "bill", {"bill_id": BILL_B})
check("bundle bill", status == 200 and bill.get("kind") == "SALE", bill)
check("bundle bill lines", len(bill.get("lines", [])) == 2, bill.get("lines"))
check("bundle bill amount", bill.get("amount") == 300, bill.get("amount"))
status, got = call(buyer, "getBundle", {"bundle_id": BUNDLE1})
check("bundle sold", got.get("bundle", {}).get("status") == "SOLD", got.get("bundle"))
status, one = call(buyer, "getItem", {"item_id": ITEM_B1})
check("bundle item sold", one.get("item", {}).get("status") == "SOLD", one.get("item"))

# -------------------------------------------------------- 7. offer and counter
status, c = academic_item(seller, "E2E Offer Book", 300)
ITEM_OFFER = c.get("item_id")
status, body = call(buyer, "sendRequest", {
    "item_id": ITEM_OFFER, "request_type": "OFFER", "offered_price": 150, "message": "Would 150 work?",
})
check("send OFFER", status == 200, (status, body))
REQ_OFFER = body.get("request_id")
status, _ = call(seller, "decideRequest", {"request_id": REQ_OFFER, "decision": "COUNTER", "counter_price": 200})
check("counter", status == 200, status)
status, mine = call(buyer, "myRequests")
row = [r for r in mine if r["request_id"] == REQ_OFFER][0]
check("counter seen", row["status"] == "COUNTERED" and row.get("counter_price") == 200, row)
status, _ = call(buyer, "respondCounter", {"request_id": REQ_OFFER, "accept": True})
check("accept counter", status == 200, status)
status, mine = call(buyer, "myRequests")
row = [r for r in mine if r["request_id"] == REQ_OFFER][0]
status, body = call(seller, "markSold", {"request_id": REQ_OFFER, "pass": row.get("pass")})
check("counter sale", status == 200, (status, body))
status, bill = call(buyer, "bill", {"bill_id": body.get("bill_id")})
check("counter amount", bill.get("amount") == 200, bill.get("amount"))

# -------------------------------------------------------------- 8. cancellation
status, d = academic_item(seller, "E2E Cancelled Book", 250)
ITEM_CANCEL = d.get("item_id")
status, body = call(buyer, "sendRequest", {"item_id": ITEM_CANCEL})
REQ_CANCEL = body.get("request_id")
status, _ = call(buyer, "cancelRequest", {"request_id": REQ_CANCEL})
check("cancelRequest", status == 200, status)
status, back = call(buyer, "getItem", {"item_id": ITEM_CANCEL})
check("cancel released item", back.get("item", {}).get("status") == "AVAILABLE", back.get("item"))

# ------------------------------------------------------------------ 8b. swap
status, target = academic_item(seller, "E2E Swap Target", 400)
ITEM_SWAP_TARGET = target.get("item_id")
status, offered = academic_item(buyer, "E2E Swap Offer", 250)
ITEM_SWAP_OFFER = offered.get("item_id")
status, body = call(buyer, "sendRequest", {
    "item_id": ITEM_SWAP_TARGET,
    "request_type": "SWAP",
    "offered_item_id": ITEM_SWAP_OFFER,
    "message": "Swap my book for yours?",
})
check("send SWAP", status == 200, (status, body))
REQ_SWAP = body.get("request_id")
status, _ = call(seller, "decideRequest", {
    "request_id": REQ_SWAP, "decision": "ACCEPT",
    "handover_location": "Library", "handover_time": tomorrow(2) + " 15:00:00",
})
check("accept swap", status == 200, status)
status, mine = call(buyer, "myRequests")
swap_row = [r for r in mine if r["request_id"] == REQ_SWAP][0]
status, body = call(seller, "markSold", {"request_id": REQ_SWAP, "pass": swap_row.get("pass")})
check("swap handover", status == 200 and body.get("bill_id"), (status, body))
status, bill = call(buyer, "bill", {"bill_id": body.get("bill_id")})
check("swap bill", bill.get("kind") == "SALE" and bill.get("amount") == 0, bill)
check("swap bill records item", bill.get("swapped_for") == "E2E Swap Offer", bill.get("swapped_for"))
status, one = call(buyer, "getItem", {"item_id": ITEM_SWAP_TARGET})
check("swap target sold", one.get("item", {}).get("status") == "SOLD", one.get("item"))
status, two = call(buyer, "getItem", {"item_id": ITEM_SWAP_OFFER})
check("swap offer sold", two.get("item", {}).get("status") == "SOLD", two.get("item"))

# -------------------------------------------------------------------- 9. rental
status, body = call(seller, "createRental", {
    "rental_name": "E2E Lab Kit",
    "description": "A complete lab kit with all the tools needed for the electronics lab course.",
    "category_id": "CA103",
    "item_condition": "GOOD",
    "rate_per_day": "50",
    "deposit_amount": "200",
    "max_days": "5",
    "pickup_location": META["locations"][0],
    "cover": "0",
}, photos(3))
check("createRental", status == 200 and body.get("rental_item_id"), (status, body))
RENTAL1 = body.get("rental_item_id")

status, body = call(buyer, "requestRental", {
    "rental_item_id": RENTAL1, "start_date": tomorrow(1), "end_date": tomorrow(3),
})
check("requestRental", status == 200 and body.get("rental_days") == 3 and body.get("total_rent") == 150, (status, body))
BOOKING1 = body.get("booking_id")
check("rental deposit", body.get("deposit_amount") == 200, body)
status, body = call(buyer, "requestRental", {
    "rental_item_id": RENTAL1, "start_date": tomorrow(1), "end_date": tomorrow(20),
})
check("rental max days refused", status == 400, (status, body))
status, body = call(buyer, "requestRental", {
    "rental_item_id": RENTAL1, "start_date": tomorrow(-3), "end_date": tomorrow(-1),
})
check("rental past refused", status == 400, (status, body))
status, _ = call(seller, "decideRental", {"booking_id": BOOKING1, "decision": "ACCEPT"})
check("decideRental", status == 200, status)
status, _ = call(seller, "handoverRental", {"booking_id": BOOKING1})
check("handoverRental", status == 200, status)
status, got = call(seller, "getRental", {"rental_item_id": RENTAL1})
check("rental on rent", got.get("rental", {}).get("status") == "ON_RENT", got.get("rental"))
status, body = call(seller, "returnRental", {"booking_id": BOOKING1, "damage_note": "Small scratch on the case."})
check("returnRental", status == 200 and body.get("bill_id"), (status, body))
BILL_R = body.get("bill_id")
status, bill = call(buyer, "bill", {"bill_id": BILL_R})
check("rental bill", status == 200 and bill.get("kind") == "RENTAL", bill)
check("rental bill amount", bill.get("amount") == 150 and bill.get("deposit_amount") == 200, bill)
status, got = call(seller, "getRental", {"rental_item_id": RENTAL1})
check("rental back", got.get("rental", {}).get("status") == "AVAILABLE", got.get("rental"))

# ------------------------------------------------------------------ 10. reports
status, _ = call(buyer, "report", {"item_id": ITEM_CANCEL, "reason": "FAKE", "details": "Looks like a fake listing."})
check("report", status == 200, status)
status, body = call(buyer, "report", {"item_id": ITEM_CANCEL, "reason": "SPAM"})
check("report twice refused", status == 400, (status, body))
status, notes = call(buyer, "notifications")
check("notifications", status == 200 and len(notes) >= 1, notes)

# -------------------------------------------------------------------- 11. admin
admin, _ = login("neha.kulkarni@college.edu.in", "Nebula!23")
status, overview = call(admin, "adminOverview")
check("adminOverview", status == 200 and overview.get("students") >= 9, overview)
status, users = call(admin, "adminUsers", {"q": "E2E"})
check("adminUsers search", status == 200 and len(users) >= 2, users)
status, pending_list = call(admin, "adminVerifications")
check("adminVerifications pending", any(u["user_id"] == PENDING_ID for u in pending_list.get("pending", [])), pending_list.get("pending"))
status, _ = call(admin, "verifyStudent", {"user_id": PENDING_ID, "status": "VERIFIED", "remarks": "Card checked by hand."})
check("verifyStudent", status == 200, status)
_, verified_session = login(PENDING_EMAIL, PASSWORD)
check("approved user verified", verified_session.get("verification_status") == "VERIFIED", verified_session)
status, body = call(admin, "verifyStudent", {"user_id": REJECT_ID, "status": "REJECTED"})
check("reject needs remark", status == 400, (status, body))
status, _ = call(admin, "verifyStudent", {"user_id": REJECT_ID, "status": "REJECTED", "remarks": "Photo unreadable."})
check("reject with remark", status == 200, status)

status, reports = call(admin, "adminReports")
open_reports = [r for r in reports if r["status"] == "OPEN"]
check("adminReports", status == 200 and len(open_reports) >= 1, reports)
REPORT_ID = open_reports[0]["report_id"]
status, _ = call(admin, "resolveReport", {"report_id": REPORT_ID, "status": "RESOLVED", "action_taken": "Checked and closed."})
check("resolveReport", status == 200, status)
status, body = call(admin, "resolveReport", {"report_id": REPORT_ID, "status": "DISMISSED", "action_taken": "Again"})
check("resolve twice refused", status == 400, (status, body))
status, flags = call(admin, "fraudFlags")
check("fraudFlags", status == 200, flags)
if flags:
    open_flag = [f for f in flags if f.get("status") == "OPEN"]
    if open_flag:
        status, _ = call(admin, "reviewFlag", {"flag_id": open_flag[0]["flag_id"], "action": "CLEAR", "note": "Reviewed."})
        check("reviewFlag", status == 200, status)
status, _ = call(admin, "activityLog")
check("activityLog", status == 200)
status, oversight = call(admin, "adminOversight")
check("adminOversight", status == 200 and "rentals" in oversight and "bundles" in oversight)

status, settings = call(admin, "setSettings", {"farewell_banner": 1})
check("setSettings on", settings.get("farewell_banner") is True, settings)
status, settings = call(admin, "setSettings", {"farewell_banner": 0})
check("setSettings off", settings.get("farewell_banner") is False, settings)

status, _ = call(admin, "setActive", {"user_id": BUYER_ID, "is_active": False})
check("block user", status == 200, status)
blocked = requests.Session()
status, body = call(blocked, "login", {"email": BUYER_EMAIL, "password": PASSWORD})
check("blocked login refused", status == 400, (status, body))
status, _ = call(admin, "setActive", {"user_id": BUYER_ID, "is_active": True})
check("unblock user", status == 200, status)

# Admin removals on fresh objects.
status, e = academic_item(seller, "E2E Bundle For Admin", 150)
status, f = academic_item(seller, "E2E Bundle For Admin 2", 160)
status, body = call(seller, "createBundle", {"bundle_name": "E2E Admin Bundle", "item_ids": [e.get("item_id"), f.get("item_id")]})
ADMIN_BUNDLE = body.get("bundle_id")
status, _ = call(admin, "adminRemoveBundle", {"bundle_id": ADMIN_BUNDLE})
check("adminRemoveBundle", status == 200, status)
status, got = call(admin, "getBundle", {"bundle_id": ADMIN_BUNDLE})
check("admin removed bundle", got.get("bundle", {}).get("status") == "REMOVED", got.get("bundle"))

status, body = call(seller, "createRental", {
    "rental_name": "E2E Admin Rental",
    "description": "A spare lab coat and safety glasses kept in good condition for lab days.",
    "category_id": "CA103",
    "item_condition": "GOOD",
    "rate_per_day": "30",
    "deposit_amount": "0",
    "max_days": "3",
    "pickup_location": META["locations"][0],
    "cover": "0",
}, photos(3))
ADMIN_RENTAL = body.get("rental_item_id")
status, _ = call(admin, "adminRemoveRental", {"rental_item_id": ADMIN_RENTAL})
check("adminRemoveRental", status == 200, status)

# ----------------------------------------------------------- 12. delete account
status, body = register(
    "E2E Delete", DELETE_EMAIL, stamp + "5", "9876500005", PASSWORD,
    "Name : E2E DELETE\nPRN : %s5" % stamp,
)
DELETE_ID = body.get("user_id")
fresh_session, _ = login(DELETE_EMAIL, PASSWORD)
status, impact = call(fresh_session, "accountImpact")
check("fresh account real delete", impact.get("real_delete") is True, impact)
status, body = call(fresh_session, "deleteAccount", {"password": "wrong-pass"})
check("delete wrong password refused", status == 400, (status, body))
status, _ = call(fresh_session, "deleteAccount", {"password": PASSWORD})
check("delete fresh account", status == 200, status)
status, body = call(requests.Session(), "login", {"email": DELETE_EMAIL, "password": PASSWORD})
check("deleted account cannot log in", status == 400, (status, body))

status, impact = call(seller, "accountImpact")
check("seller has history", impact.get("real_delete") is False, impact)
status, _ = call(seller, "deleteAccount", {"password": PASSWORD})
check("close seller account", status == 200, status)
status, body = call(requests.Session(), "login", {"email": SELLER_EMAIL, "password": PASSWORD})
check("closed account cannot log in", status == 400, (status, body))

# ------------------------------------------------------------------ 13. logout
buyer_alive, _ = login(BUYER_EMAIL, PASSWORD)
status, _ = call(buyer_alive, "logout")
status, body = call(buyer_alive, "profile")
check("logout ends session", status == 401, (status, body))

# ---------------------------------------------------------------- tidy uploads
clean_test_uploads()

print()
print("%d checks passed, %d failed" % (PASSED, len(FAILED)))
if FAILED:
    print("Failed checks:")
    for name in FAILED:
        print(" -", name)
    sys.exit(1)
print("E2E TEST PASSED")
