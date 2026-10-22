/*
 * Loads the live CampusKart data (exported from MySQL into database/seed.json)
 * into MongoDB and rebuilds the id counters, so the REST API behaves exactly
 * like the original database. Run with:  npm run seed
 */
const fs = require("fs");
const path = require("path");
const db = require("./db");
const config = require("./config");

const SEED_FILE = path.resolve(process.env.SEED_FILE || path.join(__dirname, "..", "database", "seed.json"));
const { INDEXES } = require("../database/indexes/indexes");

async function seed() {
  const raw = fs.readFileSync(SEED_FILE, "utf8");
  const data = JSON.parse(raw);
  const collections = data.collections || {};
  const counts = data.primaryKeys || {};

  await db.connect();
  console.log(`Connected to ${config.mongoUri} / ${config.dbName}`);
  console.log(`Seeding from ${SEED_FILE} (exported ${data.meta ? data.meta.exported_on : "?"})`);

  const names = new Set([...Object.keys(collections), ...Object.keys(counts), "counters"]);
  for (const name of names) {
    await db.col(name).deleteMany({});
  }

  let total = 0;
  for (const [name, rows] of Object.entries(collections)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const docs = rows.map((row) => (row && row._id !== undefined ? row : { ...row }));
    // Duplicate _id values would abort the insert; drop the index-restoring copy.
    await db.col(name).insertMany(docs, { ordered: false });
    total += docs.length;
    console.log(`  ${name.padEnd(22)} ${docs.length}`);
  }

  for (const [collection, keys, options] of INDEXES) {
    await db.col(collection).createIndex(keys, options);
  }
  console.log(`Created ${INDEXES.length} indexes.`);

  await db.ensureCounters();
  console.log(`Inserted ${total} documents. Counters are ready.`);
  await db.close();
}

seed().catch(async (error) => {
  console.error("Seeding failed:", error.message);
  await db.close().catch(() => {});
  process.exitCode = 1;
});
