#!/usr/bin/env node
/*
 * The exported seed file referred to image names that were never shipped with
 * the frontend (images/i101_1.jpg, uploads/up...png). The original product
 * artwork lives in frontend/public/images/products. This migration points the
 * seeded rows at the real files so the preserved gallery loads instead of
 * falling back to a placeholder.
 */
const db = require("../../backend/db");

const MAP = {
  "images/i101_1.jpg": "images/products/c1-v1.jpg",
  "images/i101_2.jpg": "images/products/c1-v2.jpg",
  "images/i101_3.jpg": "images/products/c1-v3.jpg",
  "images/i102_1.jpg": "images/products/c1-v4.jpg",
  "images/i102_2.jpg": "images/products/c1-v1.jpg",
  "images/i102_3.jpg": "images/products/c1-v2.jpg",
  "images/i104_1.jpg": "images/products/c4-v1.jpg",
  "images/i104_2.jpg": "images/products/c4-v2.jpg",
  "images/i104_3.jpg": "images/products/c4-v3.jpg",
  "uploads/up179235325715998885.png": "images/products/c8-v1.jpg",
  "uploads/up17923532571625530.png": "images/products/c8-v2.jpg",
  "uploads/up179235325716495772.png": "images/products/c8-v3.jpg",
  "images/ri101_1.jpg": "images/products/c8-v1.jpg",
  "images/ri101_2.jpg": "images/products/c8-v2.jpg",
  "images/ri101_3.jpg": "images/products/c8-v3.jpg",
  "images/ri103_1.jpg": "images/products/c3-v1.jpg",
  "images/ri103_2.jpg": "images/products/c3-v2.jpg",
  "images/ri103_3.jpg": "images/products/c3-v3.jpg",
};

async function main() {
  await db.connect();
  let changed = 0;
  for (const [oldPath, newPath] of Object.entries(MAP)) {
    const itemResult = await db.col("item_image").updateMany({ Img_Path: oldPath }, { $set: { Img_Path: newPath } });
    const rentalResult = await db.col("rental_image").updateMany({ RImg_Path: oldPath }, { $set: { RImg_Path: newPath } });
    changed += itemResult.modifiedCount + rentalResult.modifiedCount;
  }
  console.log(`Updated ${changed} image path(s) in ${db.db().databaseName}.`);
  await db.close();
}

main().catch(async (e) => {
  console.error(e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
