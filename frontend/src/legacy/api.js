/*
 * CampusKart browser API client.
 *
 * This file replaces the original browser mock. Every screen calls the Express
 * backend through the same operation names, so the preserved renderer does not
 * need to change. No sample data, fake latency or local mock database is used.
 */
const BASE_URL = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) || "/campuskart";
const SESSION_KEY = "ck_session";
const SESSION_HOURS = 8;
const BUNDLE_DISCOUNT = 40;

function clearSession(expired = false) {
  try {
    localStorage.removeItem(SESSION_KEY);
    if (expired) localStorage.setItem("ck_expired", "1");
  } catch (e) {
    /* storage can be unavailable in private mode */
  }
  window.dispatchEvent(new Event("ck-auth"));
}

function session() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!value) return null;
    if (value.expires && Date.now() > value.expires) {
      clearSession(true);
      return null;
    }
    return value;
  } catch (e) {
    return null;
  }
}

function appendForm(fd, key, value) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => fd.append(key, entry));
  } else {
    fd.append(key, value);
  }
}

async function api(name, payload = {}) {
  const hasFiles = payload.photos || payload.id_card;
  const options = { method: "POST", credentials: "include" };

  if (hasFiles) {
    const fd = new FormData();
    Object.entries(payload).forEach(([key, value]) => appendForm(fd, key, value));
    options.body = fd;
  } else {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(`${BASE_URL}/api/${name}`, options);
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (response.status === 401) {
    clearSession(true);
    throw new Error("Your session expired. Please log in again.");
  }
  if (!response.ok) {
    throw new Error((data && data.error) || `Server error ${response.status}`);
  }

  if (name === "login") {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify(Object.assign({ expires: Date.now() + SESSION_HOURS * 36e5 }, data))
      );
      localStorage.removeItem("ck_expired");
    } catch (e) {
      /* the in-memory session still works for this page */
    }
    window.dispatchEvent(new Event("ck-auth"));
  }
  if (name === "logout" || name === "deleteAccount") clearSession(false);
  return data;
}

export { api, session, BUNDLE_DISCOUNT };
