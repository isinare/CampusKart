const apiReq = require("./api/req");
const sessions = require("./sessions");
const T = require("./util");
const db = require("./db");
const { Resp } = require("./resp");

/*
 * Conventional REST surface over the same business rules used by the preserved
 * POST /campuskart/api/<name> endpoints.
 *
 * The original CampusKart client posts an operation name plus a form body. That
 * contract is kept for the UI. This router maps normal HTTP methods and paths
 * onto the same handlers so the API can be used from Postman, mobile clients or
 * future React pages with standard status codes and resource URLs.
 */
function registerRest(app, { routes: ROUTES, upload, uploadDir, sendJson }) {
  const multiPart = upload.fields([
    { name: "photos", maxCount: 5 },
    { name: "id_card", maxCount: 1 },
  ]);

  async function invoke(action, req, fields) {
    const handler = ROUTES.get(action);
    if (!handler) throw new T.ApiError("Unknown operation: " + action, 404);
    const fake = {
      body: fields,
      files: req.files || {},
      headers: req.headers,
    };
    const request = apiReq.build(action, fake, uploadDir);
    const session = sessions.find(request.token);
    return handler(action, request, session, uploadDir);
  }

  function send(res, value, status) {
    if (value === undefined) return sendJson(res, 404, { error: "Unknown operation." });
    if (value instanceof Resp) {
      if (value.cookie) res.setHeader("Set-Cookie", value.cookie);
      return sendJson(res, status, value.body);
    }
    return sendJson(res, status, value);
  }

  function route(method, path, action, options = {}) {
    const chain = [];
    if (options.multipart) chain.push(multiPart);
    chain.push(async (req, res) => {
      const fields = {
        ...(req.query || {}),
        ...(req.params || {}),
        ...(req.body && typeof req.body === "object" ? req.body : {}),
      };
      try {
        const value = await invoke(action, req, fields);
        return send(res, value, options.status || 200);
      } catch (error) {
        if (error instanceof T.ApiError) {
          return sendJson(res, error.status || 400, { error: error.message });
        }
        console.error(`[REST ${method.toUpperCase()} ${path}]`, error);
        return sendJson(res, 500, { error: "Something went wrong on the server. Please try again." });
      }
    });
    app[method](path, ...chain);
  }

  app.get("/api/v1/health", async (req, res) => {
    try {
      await db.ping();
      return sendJson(res, 200, { status: "ok", database: "connected" });
    } catch {
      return sendJson(res, 503, { status: "degraded", database: "disconnected" });
    }
  });

  // Discovery document.
  app.get("/api/v1", (req, res) =>
    sendJson(res, 200, {
      name: "CampusKart REST API",
      version: "1.0.0",
      health: "/health",
      authentication: "8-hour HttpOnly ck_session cookie",
      operations: ROUTES.size,
      examples: [
        "GET /api/v1/items?q=dbms&max_price=400&sort=price_asc",
        "GET /api/v1/items/I101",
        "POST /api/v1/auth/login",
        "GET /api/v1/users/me",
        "POST /api/v1/requests",
      ],
    })
  );

  // Reference data and public catalogue.
  route("get", "/api/v1/meta", "meta");
  route("get", "/api/v1/settings", "settings");
  route("get", "/api/v1/home", "home");
  route("get", "/api/v1/fair-price", "fairPrice");
  route("get", "/api/v1/items", "listItems");
  route("get", "/api/v1/items/:item_id", "getItem");
  route("get", "/api/v1/sellers/:user_id", "sellerCard");
  route("get", "/api/v1/bundles", "listBundles");
  route("get", "/api/v1/bundles/:bundle_id", "getBundle");
  route("get", "/api/v1/rentals", "listRentals");
  route("get", "/api/v1/rentals/:rental_item_id", "getRental");

  // Authentication and profile.
  route("post", "/api/v1/auth/login", "login");
  route("post", "/api/v1/auth/register", "register", { multipart: true, status: 201 });
  route("post", "/api/v1/auth/logout", "logout");
  route("get", "/api/v1/users/me", "profile");
  route("patch", "/api/v1/users/me", "updateProfile");
  route("post", "/api/v1/users/me/phones", "addPhone", { status: 201 });
  route("delete", "/api/v1/users/me/phones/:phone_no", "removePhone");
  route("post", "/api/v1/users/me/password", "changePassword");

  // Selling, bundles, wishlist and notifications.
  route("post", "/api/v1/items", "createItem", { multipart: true, status: 201 });
  route("patch", "/api/v1/items/:item_id", "updateItem");
  route("delete", "/api/v1/items/:item_id", "withdrawItem");
  route("get", "/api/v1/my/items", "myItems");
  route("post", "/api/v1/bundles", "createBundle", { status: 201 });
  route("delete", "/api/v1/bundles/:bundle_id", "withdrawBundle");
  route("get", "/api/v1/my/bundles", "myBundles");
  route("get", "/api/v1/wishlist", "wishlist");
  route("post", "/api/v1/wishlist", "addWish", { status: 201 });
  route("delete", "/api/v1/wishlist/:wish_id", "removeWish");
  route("get", "/api/v1/kit", "semesterKit");
  route("get", "/api/v1/clearout", "clearoutPreview");
  route("post", "/api/v1/clearout", "clearoutApply");
  route("post", "/api/v1/reports", "report", { status: 201 });
  route("get", "/api/v1/notifications", "notifications");

  // Requests, handover, bills and ratings.
  route("get", "/api/v1/requests", "myRequests");
  route("get", "/api/v1/requests/incoming", "incomingRequests");
  route("post", "/api/v1/requests", "sendRequest", { status: 201 });
  route("patch", "/api/v1/requests/:request_id", "decideRequest");
  route("post", "/api/v1/requests/:request_id/respond-counter", "respondCounter");
  route("delete", "/api/v1/requests/:request_id", "cancelRequest");
  route("post", "/api/v1/requests/:request_id/complete", "markSold");
  route("post", "/api/v1/requests/:request_id/rate", "rate", { status: 201 });
  route("get", "/api/v1/bills/:bill_id", "bill");

  // Rentals and bookings.
  route("post", "/api/v1/rentals", "createRental", { multipart: true, status: 201 });
  route("delete", "/api/v1/rentals/:rental_item_id", "withdrawRental");
  route("post", "/api/v1/rentals/:rental_item_id/bookings", "requestRental", { status: 201 });
  route("get", "/api/v1/bookings", "myRentals");
  route("patch", "/api/v1/bookings/:booking_id", "decideRental");
  route("delete", "/api/v1/bookings/:booking_id", "cancelBooking");
  route("post", "/api/v1/bookings/:booking_id/handover", "handoverRental");
  route("post", "/api/v1/bookings/:booking_id/return", "returnRental");

  // Admin moderation.
  route("get", "/api/v1/admin/overview", "adminOverview");
  route("get", "/api/v1/admin/users", "adminUsers");
  route("get", "/api/v1/admin/verifications", "adminVerifications");
  route("patch", "/api/v1/admin/students/:user_id/verification", "verifyStudent");
  route("get", "/api/v1/admin/reports", "adminReports");
  route("patch", "/api/v1/admin/reports/:report_id", "resolveReport");
  route("patch", "/api/v1/admin/users/:user_id/active", "setActive");
  route("patch", "/api/v1/admin/settings", "setSettings");
  route("get", "/api/v1/admin/fraud-flags", "fraudFlags");
  route("patch", "/api/v1/admin/fraud-flags/:flag_id", "reviewFlag");
  route("get", "/api/v1/admin/activity", "activityLog");
  route("get", "/api/v1/admin/oversight", "adminOversight");
  route("delete", "/api/v1/admin/rentals/:rental_item_id", "adminRemoveRental");
  route("delete", "/api/v1/admin/bundles/:bundle_id", "adminRemoveBundle");

  // Account closure.
  route("get", "/api/v1/account/impact", "accountImpact");
  route("delete", "/api/v1/account", "deleteAccount");

  app.use("/api/v1", (req, res) => sendJson(res, 404, { error: "Unknown REST resource." }));
}

module.exports = registerRest;
