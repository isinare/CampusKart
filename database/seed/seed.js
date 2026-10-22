#!/usr/bin/env node
/*
 * Convenience entry point for `node database/seed/seed.js`.
 * The actual loader lives in backend/seed.js because it shares the connection
 * and counter logic with the API. It wipes and reloads the seed file, so run it
 * against a development or CI database, never production.
 */
const path = require("path");

process.env.SEED_FILE =
  process.env.SEED_FILE || path.join(__dirname, "..", "seed.json");

require("../../backend/seed.js");
