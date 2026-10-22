# Transactions

CampusKart is designed so the local standalone `mongod` can run the whole demo
without transactions. Critical state changes use ordered, idempotent
single-document updates guarded by status checks, and the hourly sweep repairs
expired requests.

On a replica set (MongoDB Atlas, or a local replica set), a sale can be wrapped
in a transaction. The relevant writes are:

1. item status -> `ACCEPTED` / `SOLD`
2. bundle status -> `SOLD` (when the request targets a bundle)
3. `item_status_log` insert
4. `bill` insert

Sketch:

```js
const session = db.db().client.startSession();
await session.withTransaction(async () => {
  await db.col("item").updateOne(
    { I_ID: itemId, I_Status: "ACCEPTED" },
    { $set: { I_Status: "SOLD" } },
    { session }
  );
  await db.col("bill").insertOne(bill, { session });
});
await session.endSession();
```

## Run the demo

```powershell
node database/transactions/transaction-demo.js
# or
npm run db:transaction-demo --prefix backend
```

On a standalone server it prints `SKIPPED` and exits 0. On Atlas or a local
replica set it starts a transaction, writes two temporary documents, aborts the
transaction and verifies that zero documents were committed.

## Why the app does not force it locally

Forcing a transaction against a standalone server raises
`Transaction numbers are only allowed on a replica set member or mongos` and
would make the local demo fail. The API therefore uses status-guarded atomic
updates locally. The same sale service can use `withTransaction` unchanged when
deployed to Atlas.
