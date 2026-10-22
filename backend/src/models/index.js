/*
 * Model registry.
 *
 * CampusKart uses the MongoDB Node.js driver rather than an ODM. This module is
 * the single place where collection names, business-key metadata and JSON
 * Schema validators are registered, so controllers never hard-code a collection
 * shape. It is intentionally small and data-driven: adding a model means adding
 * an entry to db.js and (optionally) a validator here.
 */
const { COLLECTIONS } = require("../../db");
const { VALIDATORS } = require("../../../database/schemas/validators");

const MODELS = Object.entries(COLLECTIONS).reduce((acc, [name, spec]) => {
  acc[name] = {
    name,
    collection: spec.collection,
    pk: spec.pk,
    idPrefix: spec.prefix || null,
    validator: VALIDATORS[name] || null,
  };
  return acc;
}, {});

module.exports = { MODELS, COLLECTIONS, VALIDATORS };
