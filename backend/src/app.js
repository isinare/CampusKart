/*
 * Thin application entry point used by tests and deployment platforms.
 * The Express app itself lives in backend/server.js so the original action
 * routes stay in one auditable place.
 */
const { app } = require("../server");

module.exports = app;
