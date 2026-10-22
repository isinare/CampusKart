/*
 * Index definitions shared by `backend/seed.js` and `database/migrations`.
 * We intentionally do not force index names: an existing database created by an
 * older seed may already have the same key pattern under MongoDB's generated
 * name. createIndex() then reuses it instead of failing with a name conflict.
 */
const INDEXES = [
  ["users", { U_Email: 1 }, { unique: true }],
  ["users", { U_Role: 1, U_IsActive: 1 }, {}],
  ["student", { St_CollegeID: 1 }, { unique: true }],
  ["student", { St_VerificationStatus: 1 }, {}],
  ["item", { I_Status: 1 }, {}],
  ["item", { U_ID: 1 }, {}],
  ["item", { Cat_ID: 1 }, {}],
  ["item", { Bun_ID: 1 }, {}],
  ["item", { I_ListedOn: -1 }, {}],
  ["item", { I_Status: 1, I_ListedOn: -1 }, {}],
  ["item_image", { I_ID: 1, Img_No: 1 }, {}],
  ["item_status_log", { I_ID: 1, Log_No: 1 }, {}],
  ["price_history", { I_ID: 1 }, {}],
  ["wishlist", { U_ID: 1, W_IsActive: 1 }, {}],
  ["wishlist", { Sub_ID: 1, Cat_ID: 1 }, {}],
  ["wish_match", { W_ID: 1, I_ID: 1 }, {}],
  ["buy_request", { Req_Status: 1 }, {}],
  ["buy_request", { U_ID: 1 }, {}],
  ["buy_request", { I_ID: 1 }, {}],
  ["buy_request", { Bun_ID: 1 }, {}],
  ["buy_request", { Req_Status: 1, Req_ExpiresOn: 1 }, {}],
  ["report", { Rep_Status: 1 }, {}],
  ["report", { I_ID: 1 }, {}],
  ["fraud_flag", { U_ID: 1, FF_Status: 1 }, {}],
  ["rental_item", { RI_Status: 1 }, {}],
  ["rental_item", { U_ID: 1 }, {}],
  ["rental_image", { RI_ID: 1, RImg_No: 1 }, {}],
  ["rental_booking", { RI_ID: 1, Bk_Status: 1 }, {}],
  ["rental_booking", { U_ID: 1 }, {}],
  ["bill", { Req_ID: 1 }, {}],
  ["bill", { Bk_ID: 1 }, {}],
  ["taught_in", { TI_Semester: 1, Br_ID: 1 }, {}],
  ["admin_activity", { AA_At: -1 }, {}],
];

module.exports = { INDEXES };
