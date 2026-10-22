export const COLLEGE_EMAIL_RE = /\.(edu\.in|ac\.in)$/i;
export const PHONE_RE = /^\d{10}$/;
export const PRN_RE = /^[A-Za-z0-9-]{5,24}$/;
export const PASSWORD_MIN = 8;
export const ITEM_NAME_MAX = 60;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 200;

export function isCollegeEmail(value) {
  return COLLEGE_EMAIL_RE.test(String(value || "").trim());
}

export function isPhone(value) {
  return PHONE_RE.test(String(value || "").trim());
}

export function isStrongEnoughPassword(value) {
  return String(value || "").length >= PASSWORD_MIN;
}

export function validSemester(year, semester) {
  const y = Number(year);
  const s = Number(semester);
  return Number.isInteger(y) && y >= 1 && y <= 5 && (s === 2 * y - 1 || s === 2 * y);
}

export function validListing({ item_name, description, item_condition, pickup_location }) {
  const name = String(item_name || "").trim();
  const text = String(description || "").trim();
  return (
    name.length > 0 &&
    name.length <= ITEM_NAME_MAX &&
    text.length >= DESCRIPTION_MIN &&
    text.length <= DESCRIPTION_MAX &&
    ["NEW", "GOOD", "FAIR", "POOR"].includes(item_condition) &&
    Boolean(String(pickup_location || "").trim())
  );
}

export function validPrice(originalPrice, sellingPrice) {
  const original = Number(originalPrice);
  const selling = Number(sellingPrice);
  return Number.isFinite(original) && Number.isFinite(selling) && original > 0 && selling > 0 && selling <= original;
}
