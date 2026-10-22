/*
 * Route registry. Each controller exports `names` and `handle(name, request,
 * session, uploadDir)`. backend/server.js builds the POST action map from this
 * registry; backend/rest.js exposes the same handlers as REST resources.
 */
const modules = [
  require("../controllers/auth"),
  require("../controllers/catalog"),
  require("../controllers/requests"),
  require("../controllers/bundles"),
  require("../controllers/rentals"),
  require("../controllers/admin"),
  require("../controllers/account"),
];

const ROUTES = new Map();
for (const controller of modules) {
  for (const name of controller.names) ROUTES.set(name, controller.handle);
}

module.exports = { ROUTES, modules };
