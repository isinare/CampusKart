#!/usr/bin/env node
/*
 * Creates the CampusKart collections, applies $jsonSchema validation and builds
 * every index. Safe to run repeatedly: existing collections get collMod and
 * existing indexes are reused by name.
 *
 *   node database/migrations/001-init.js
 */
const db = require("../../backend/db");
const { INDEXES } = require("../indexes/indexes");
const { VALIDATORS } = require("../schemas/validators");

async function main() {
  await db.connect();
  const database = db.db();
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

  let created = 0;
  let validated = 0;
  for (const [name, spec] of Object.entries(db.COLLECTIONS)) {
    const validator = VALIDATORS[name];
    if (!existing.has(spec.collection)) {
      await database.createCollection(spec.collection, validator ? { validator, validationLevel: "moderate", validationAction: "error" } : {});
      created++;
      continue;
    }
    if (validator) {
      await database.command({
        collMod: spec.collection,
        validator,
        validationLevel: "moderate",
        validationAction: "error",
      });
      validated++;
    }
  }

  for (const [collection, keys, options] of INDEXES) {
    await db.col(collection).createIndex(keys, options);
  }

  console.log(`Collections created: ${created}`);
  console.log(`Collections validated: ${validated}`);
  console.log(`Indexes ensured: ${INDEXES.length}`);
  console.log(`Database: ${database.databaseName}`);
  await db.close();
}

main().catch(async (error) => {
  console.error("Migration failed:", error.message);
  try {
    await db.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
