const T = require("../utils").util;

/*
 * Server-side input validators. Every API controller validates before it writes;
 * the browser validators in frontend/src/validation are only a UX convenience.
 */
const RULES = {
  collegeEmail: (value) => T.collegeEmail(value),
  phone: (value) => /^\d{10}$/.test(String(value || "")),
  password: (value) => String(value || "").length >= 8,
  prn: (value) => /^[A-Za-z0-9-]{5,24}$/.test(String(value || "").trim()),
  semester: (year, semester) => {
    const y = Number(year);
    const s = Number(semester);
    return Number.isInteger(y) && y >= 1 && y <= 5 && (s === 2 * y - 1 || s === 2 * y);
  },
  condition: (value) => ["NEW", "GOOD", "FAIR", "POOR"].includes(value),
  listing: (value) => {
    const name = T.trim(value.item_name);
    const description = T.trim(value.description);
    return (
      name.length > 0 &&
      name.length <= 60 &&
      description.length >= 30 &&
      description.length <= 200 &&
      RULES.condition(value.item_condition) &&
      Boolean(T.trim(value.pickup_location))
    );
  },
  price: (originalPrice, sellingPrice) => {
    const original = Number(originalPrice);
    const selling = Number(sellingPrice);
    return Number.isFinite(original) && Number.isFinite(selling) && original > 0 && selling > 0 && selling <= original;
  },
};

function requireFields(payload, fields) {
  const missing = fields.filter((field) => !T.trim(payload[field]));
  if (missing.length) {
    throw new T.ApiError(`Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
  }
}

module.exports = { RULES, requireFields };
