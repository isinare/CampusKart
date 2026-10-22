/**
 * Frontend API services.
 *
 * `api()` is the operation-oriented endpoint used by the preserved screens.
 * `rest()` exposes the conventional REST surface under `/api/v1` so the same
 * backend can also be consumed by Postman, mobile clients and future React
 * pages without the legacy action names.
 */
export { api, session } from "../legacy/api.js";

export const API_ROOT = "/campuskart";
export const REST_ROOT = "/api/v1";

export async function rest(path, options = {}) {
  const response = await fetch(`${REST_ROOT}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty 204 response */
  }
  if (!response.ok) {
    throw new Error((data && data.error) || `Server error ${response.status}`);
  }
  return data;
}
