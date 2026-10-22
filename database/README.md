# CampusKart database

MongoDB 8 is the system of record. `seed.json` is the exported source data
(181 documents); the documents keep the original MySQL names (`U_ID`, `I_ID`,
`Req_ID`, ...) so the UI, reports and exports retain the same meaning.

## Quick start

```powershell
# from the repository root
npm run db:init --prefix backend
npm run seed --prefix backend
npm run db:verify --prefix backend
```

`db:init` creates missing collections, applies `$jsonSchema` validation and
builds 33 indexes. `seed` wipes and reloads the database. `db:verify` runs 43
count and relationship checks.

## Files

| Path | Purpose |
| --- | --- |
| `seed.json` | Exported source rows (`meta`, `primaryKeys`, `collections`) |
| `schemas/collections.json` | Collection catalogue, business keys and design notes |
| `schemas/validators.js` | MongoDB `$jsonSchema` rules |
| `indexes/indexes.js` | Shared index definitions |
| `seed/seed.js` | Convenience entry point for the loader |
| `migrations/001-init.js` | Idempotent collections + validation + indexes |
| `migrations/002-image-paths.js` | Point seeded rows at the shipped product artwork |
| `aggregations/` | Category, seller, monthly-sales, rental and admin reports |
| `queries/examples.js` | Read queries plus a temporary safe write example |
| `transactions/` | Replica-set transaction demo and sale transaction notes |
| `tests/verify.js` | 43 integrity checks |
| `backups/` | Local dump folder (contents gitignored) |

## Model

- **Accounts**: `users`, `student`, `admin`, `user_phone`.
- **Reference**: `institute`, `branch`, `category`, `subject`, `taught_in`.
- **Catalogue**: `item`, `academic_item`, `general_item`, `item_image`,
  `item_status_log`, `bundle`, `price_history`.
- **Transactions**: `buy_request`, `rating`, `bill`, `report`, `resolves`.
- **Rentals**: `rental_item`, `rental_image`, `rental_booking`.
- **Discovery/moderation**: `wishlist`, `wish_match`, `item_recommendation`,
  `fraud_flag`, `reviews_flag`, `admin_activity`, `site_setting`, `notice`.
- **Infrastructure**: `counters` issues ids atomically with
  `findOneAndUpdate({ $inc: { value: 1 } })`.

References use the original business keys. Indexes cover every foreign key used
by a list/detail screen (`item.U_ID`, `item.Cat_ID`, `buy_request.I_ID`,
`rental_booking.RI_ID`, `bill.Req_ID`, ...). Images and status history stay in
their own collections so item documents remain small and auditable. Reports use
`$lookup`, `$group`, `$unwind`, `$project` and date pipelines.

## Validation

`schemas/validators.js` mirrors the SQL CHECK/ENUM rules for users, students,
items, requests, rentals, bookings, bills, ratings, reports and wishlists. The
migration applies them with:

```json
{ "validationLevel": "moderate", "validationAction": "error" }
```

Existing documents remain readable; new writes must satisfy the core identity,
enum and price rules.

## Aggregations

```powershell
node database/aggregations/category-stats.js
node database/aggregations/seller-stats.js
node database/aggregations/monthly-sales.js
node database/aggregations/rental-stats.js
node database/aggregations/admin-summary.js
node database/queries/examples.js
```

## Atlas

1. Create a free cluster and database user.
2. Add your IP under **Network Access**.
3. Put the driver URI in `backend/.env` as `MONGODB_URI`.
4. Run `npm run db:init` and `npm run seed` once.
5. Set `MONGODB_DB=campuskart`.

Atlas is a replica set, so multi-document transactions are available. The local
standalone demo uses guarded single-document updates and an hourly expiry sweep;
on Atlas, a sale can be wrapped in `withTransaction` without changing the API.

## Backups

```powershell
mongodump --db campuskart --out database/backups/2026-10-22
mongorestore --db campuskart database/backups/2026-10-22/campuskart
```

The backup folder is gitignored. Never commit a dump containing real user data.
