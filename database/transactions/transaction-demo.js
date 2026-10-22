#!/usr/bin/env node
/*
 * Multi-document transaction demonstration.
 *
 * Local development may use a standalone `mongod`, which does not support
 * transactions. On a replica set (including MongoDB Atlas), this script starts a
 * transaction, writes two temporary documents, aborts the transaction and proves
 * that neither document was committed.
 *
 *   node database/transactions/transaction-demo.js
 */
const db = require("../../backend/db");

async function main() {
  await db.connect();
  const hello = await db.db().admin().command({ hello: 1 });
  if (!hello.setName) {
    console.log("SKIPPED: transactions require a replica set. Local standalone server detected.");
    console.log("Run against MongoDB Atlas or a local replica set to execute the demo.");
    await db.close();
    return;
  }

  const session = db.db().client.startSession();
  try {
    session.startTransaction();
    const collection = db.db().collection("transaction_demo");
    await collection.insertOne({ _id: "txn-1", note: "must be rolled back" }, { session });
    await collection.insertOne({ _id: "txn-2", note: "must be rolled back" }, { session });
    await session.abortTransaction();
    const remaining = await collection.countDocuments();
    console.log(`Transaction aborted. Documents left behind: ${remaining}`);
    if (remaining !== 0) process.exitCode = 1;
  } finally {
    await session.endSession();
    await db.db().collection("transaction_demo").drop().catch(() => {});
    await db.close();
  }
}

main().catch(async (error) => {
  console.error("Transaction demo failed:", error.message);
  await db.close().catch(() => {});
  process.exit(1);
});
