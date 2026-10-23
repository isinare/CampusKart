# CampusKart - MERN Edition

CampusKart is a campus student marketplace: students buy, sell, exchange and rent
pre-owned textbooks, notes, calculators, cycles, hostel furniture and lab gear.
This folder is a complete React + Node.js/Express + MongoDB implementation of the
existing CampusKart product.

The original project at `D:\Documents\Projects\Java & DBMS CampusKart` was treated
as **read-only**. It contains the vanilla HTML/CSS/JavaScript frontend, the
product artwork and the full MySQL schema (`database/campuskart.sql`). It does
**not** contain Java backend source (the only backend artifact is
`backend/Java Lab Manual.pdf`), so the Node API was reimplemented from the
frontend behaviour, the SQL schema, the triggers/procedures and the seeded data.
No file in the source directory was modified, moved or deleted.

| Layer | Original source | This project |
| --- | --- | --- |
| UI | HTML + CSS + vanilla JavaScript | React 19 + Vite 8; same `style.css`, same images, same screens |
| API | Browser mock API + MySQL schema | Node.js + Express 5; 67 action endpoints and a 67-route REST v1 surface |
| Database | MySQL 8 (`campuskart`) | MongoDB 8 / Atlas (`campuskart`) |
| Auth | 8-hour session | 8-hour HttpOnly `ck_session` cookie; scrypt password hashes |
| Uploads | `multipart/form-data` | `multer` with MIME, extension and size checks |
| Test data | 181 MySQL rows | 181 documents in `database/seed.json` |
| Delivery | - | Postman collections, 148-check HTTP suite, Jenkinsfile, Render blueprints, isolated Tomcat demo |

## 1. Quick start (local)

### Requirements

- Node.js 20.19+ or 22.12+ (tested with Node 24.13.1)
- MongoDB 6+ running locally, or a MongoDB Atlas connection string
- Python 3 + `requests` only for the HTTP end-to-end suite
- Maven + Tomcat 9 only for the optional `tomcat-demo`

### Install, seed and run

```powershell
cd D:\Documents\Projects\CampusKart

# 1. backend dependencies
npm install --prefix backend

# 2. optional local settings
Copy-Item backend\.env.example backend\.env

# 3. create validation/indexes and load the 181 seed documents
npm run db:init --prefix backend
npm run seed --prefix backend

# 4. build the React frontend
npm install --prefix frontend
npm run build --prefix frontend

# 5. start Express; it serves the API and the built frontend on one port
npm start --prefix backend
```

Open <http://localhost:8080>. The health check is
<http://localhost:8080/health> and the REST discovery document is
<http://localhost:8080/api/v1>.

### Development mode (hot reload)

```powershell
# terminal 1 - API
cd D:\Documents\Projects\CampusKart\backend
npm run dev

# terminal 2 - Vite dev server with /campuskart and /uploads proxied to :8080
cd D:\Documents\Projects\CampusKart\frontend
npm run dev
```

Open <http://localhost:5173>. The Vite proxy is configured in
`frontend/vite.config.js`, so the preserved client uses relative URLs in both
development and production.

### Demo accounts

| Role | E-mail | Password |
| --- | --- | --- |
| Admin | `neha.kulkarni@college.edu.in` | `Nebula!23` |
| Admin | `rohan.mehta@college.edu.in` | `Nebula!23` |
| Student (verified) | `aarav.sharma@college.edu.in` | `pass1234` |
| Student (verified) | `priya.singh@college.edu.in` | `pass1234` |
| Student (verified) | `sneha.patil@college.edu.in` | `pass1234` |
| Student (verified) | `vivek.desai@college.edu.in` | `pass1234` |
| Student (verified) | `karan.joshi@college.edu.in` | `pass1234` |
| Student (verified) | `ishita.kulkarni@college.edu.in` | `pass1234` |

Passwords are stored as scrypt hashes, never as plain text.

## 2. Project structure

```text
CampusKart/
  backend/
    server.js                 Express app, action route, static SPA, health
    rest.js                   Conventional REST v1 adapter over the same services
    config.js  db.js          Environment, MongoDB connection, counters
    api/                      Action controllers: auth, catalog, requests,
                              bundles, rentals, admin, account
    views.js  rules.js        Query/view shapes and trigger/procedure rules
    idcard.js  mail.js        ID-card checks and optional SMTP notifications
    sessions.js  resp.js      Session store and response helpers
    src/
      config/                 Config and connection entry points
      routes/                 Route registry
      controllers/            Thin controller re-exports
      services/               Views, rules and ID-card services
      models/                 Collection metadata and validation registry
      middleware/             Auth, request and response middleware
      validators/             Server-side validation rules
      events/                 EventEmitter audit bus
      email/                  E-mail service entry point
      jobs/                   Hourly request-expiry job
      templates/              Plain-text e-mail templates
      tests/                  Node test-runner unit suite
    examples/
      native-http-server.js   Native `http` + `url` coursework demo
      url-demo.js             URL/URLSearchParams demonstration
    tests/e2e.py              148-check HTTP end-to-end suite
    uploads/                  Runtime item photos and ID cards (gitignored)
  frontend/
    src/
      App.jsx  main.jsx       React root + React Router
      pages/                  CampusKart page wrapper
      components/             Layout containers and error boundary
      context/                React auth context
      hooks/                  Legacy renderer lifecycle hook
      services/               Action and REST client services
      validation/             Browser-side validation
      utils/                  Formatting helpers
      tests/                  Vitest unit tests
      legacy/                 Preserved app.js, api.js and renderer
    public/                   Original style.css, images and icons
  database/
    seed.json                 Exported source rows (181 documents)
    schemas/                  Collection catalogue and $jsonSchema validators
    indexes/indexes.js        Shared index definitions
    seed/seed.js              Convenience seed entry point
    migrations/               Collection/validation and image-path migrations
    aggregations/             Reporting and analytics pipelines
    queries/examples.js       Read/write query examples
    transactions/             Replica-set transaction demo and sale notes
    tests/verify.js           43 count and relationship checks
    backups/                  Local dump folder (contents gitignored)
  postman/
    CampusKart.postman_collection.json       All 67 UI action operations
    CampusKart-REST.postman_collection.json  REST v1 examples
  tomcat-demo/                Isolated Java servlet WAR (no Node dependency)
  Jenkinsfile                 CI pipeline
  render.yaml                 Combined one-service deployment
  render.backend.yaml         Separate API service (optional)
  render.frontend.yaml        Separate static frontend (optional)
```

## 3. Frontend

The visible UI is intentionally identical to the source. The original
`app.js`, `api.js`, `style.css` and images were copied into
`frontend/src/legacy` / `frontend/public` and are mounted by React. React owns
the page shell, routing, error boundary, auth context and lifecycle; the
preserved renderer owns the 30+ screens, markup and interactions.

- **React 19 + Vite 8** with `react-router-dom`.
- **React Router** owns the top-level URL. Deep links such as `/browse` are
  translated to the original hash route (`#/browse`), so the Render SPA fallback
  and old bookmarks still work.
- **Hooks/context**: `useLegacyApp` starts the renderer once; `AuthProvider`
  mirrors the 8-hour session into React and listens for `ck-auth` events.
- **Services**: `services/api.js` exports the action client and a `rest()` helper
  for the conventional API.
- **No redesign**: the original CSS classes, labels, empty states, validation
  messages, rupees formatting and product artwork are preserved.
- **Real data only**: the browser mock in `api.js` is disabled (`USE_MOCK=false`);
  every screen calls the Express API. Uploaded files are sent as
  `multipart/form-data`.
- **Separate deployment support**: `VITE_API_BASE` and `VITE_UPLOAD_BASE` let the
  same build talk to an API on another origin. They are empty in the combined
  deployment.

Frontend tests cover the extracted validation and formatting helpers:

```powershell
npm test --prefix frontend
```

## 4. Backend

The NODE server keeps the original operation contract
`POST /campuskart/api/<name>` because that is what the preserved screens call.
It also exposes a conventional REST surface at `/api/v1` with GET, POST, PATCH
and DELETE methods, status codes and resource URLs. Both surfaces call the same
controllers and business rules, so there is no duplicate logic.

- **Routes**: action route in `server.js`; REST adapter in `rest.js`.
- **Controllers/services**: `api/` modules with shared `views.js` and `rules.js`.
- **Models**: `src/models/index.js` registers every collection, business key and
  JSON Schema validator.
- **Middleware**: `src/middleware/` exposes auth guards, request parsing and
  response helpers; `server.js` also configures CORS, JSON limits, multer and
  static serving.
- **Validators**: `src/validators/` mirrors the server-side SQL CHECK rules.
- **Events**: `src/events/` uses Node `EventEmitter` for audit events after
  listing, sale, rental, verification and moderation changes.
- **Jobs**: `src/jobs/expiry.js` runs the request-expiry sweep hourly.
- **E-mail**: `backend/mail.js` uses an EventEmitter queue and Nodemailer. SMTP is
  optional; if `SMTP_HOST` is empty the API behaves exactly the same and no mail
  is sent.
- **Files**: item photos and ID cards are validated (JPG/PNG/WebP, 3 MB limit)
  and stored under `backend/uploads`; the folder is gitignored.

### Action API (67 operations)

All operations are listed in `postman/CampusKart.postman_collection.json`,
grouped as: Authentication (10), Catalogue (18), Requests and bills (8),
Bundles (5), Rentals (10), Admin (14), My account (2).

Representative operations:

| Area | Operations |
| --- | --- |
| Auth/profile | `meta`, `settings`, `login`, `register`, `logout`, `profile`, `updateProfile`, `addPhone`, `removePhone`, `changePassword` |
| Catalogue/selling | `home`, `listItems`, `getItem`, `fairPrice`, `createItem`, `updateItem`, `withdrawItem`, `myItems`, `sellerCard`, `semesterKit`, `clearoutPreview`, `clearoutApply`, `wishlist`, `addWish`, `removeWish`, `notifications`, `report` |
| Requests/bills | `sendRequest`, `myRequests`, `incomingRequests`, `decideRequest`, `respondCounter`, `cancelRequest`, `markSold`, `rate`, `bill` |
| Bundles | `listBundles`, `getBundle`, `createBundle`, `myBundles`, `withdrawBundle` |
| Rentals | `listRentals`, `getRental`, `createRental`, `withdrawRental`, `requestRental`, `myRentals`, `decideRental`, `cancelBooking`, `handoverRental`, `returnRental` |
| Admin | `adminOverview`, `adminUsers`, `adminVerifications`, `verifyStudent`, `adminReports`, `resolveReport`, `setActive`, `setSettings`, `fraudFlags`, `reviewFlag`, `activityLog`, `adminOversight`, `adminRemoveRental`, `adminRemoveBundle` |
| Account | `accountImpact`, `deleteAccount` |

### REST API v1

The REST adapter is documented at `GET /api/v1`. Examples:

```http
GET    /api/v1/items?q=dbms&max_price=400&sort=price_asc
GET    /api/v1/items/I101
GET    /api/v1/sellers/U103
POST   /api/v1/auth/login
GET    /api/v1/users/me
POST   /api/v1/requests
GET    /api/v1/requests/incoming
POST   /api/v1/requests/:request_id/complete
GET    /api/v1/rentals
POST   /api/v1/rentals/:rental_item_id/bookings
GET    /api/v1/admin/overview
PATCH  /api/v1/admin/students/:user_id/verification
DELETE /api/v1/account
```

Import `postman/CampusKart-REST.postman_collection.json` and run the requests in
order; the login request stores the session cookie and later requests reuse it.

## 5. Database design

MongoDB is the system of record. The collection names and business keys keep the
original SQL names (`U_ID`, `I_ID`, `Req_ID`, ...) so reports, seed exports and
the UI retain the same meaning. The data layer uses the official MongoDB
Node.js driver (no ODM); `backend/src/models` is the model registry and
`database/schemas/validators.js` provides native `$jsonSchema` validation.

### Collections and relationships

- **Accounts**: `users`, `student`, `admin`, `user_phone`.
- **Reference data**: `institute`, `branch`, `category`, `subject`, `taught_in`.
- **Catalogue**: `item`, `academic_item`, `general_item`, `item_image`,
  `item_status_log`, `bundle`, `price_history`.
- **Transactions**: `buy_request`, `rating`, `bill`, `report`, `resolves`.
- **Rentals**: `rental_item`, `rental_image`, `rental_booking`.
- **Discovery/moderation**: `wishlist`, `wish_match`, `item_recommendation`,
  `fraud_flag`, `reviews_flag`, `admin_activity`, `site_setting`, `notice`.
- **Infrastructure**: `counters` issues human-readable ids atomically
  (`U104`, `I112`, `RQ110`, `CK-2026-0005`).

Relationships use references to the business keys, with indexes for every list
and detail screen. Small independent settings and counters stay separate;
images and status history stay in their own collections so item documents remain
small and auditable. This is a relationship-aware document model, not a blind
one-collection-per-table copy: the API uses `$lookup`, `$group`, `$facet` and
projection pipelines where a report needs joined data.

### Validation, indexes and migrations

```powershell
npm run db:init --prefix backend     # collections + $jsonSchema + 33 indexes
npm run db:verify --prefix backend   # 43 count/relationship checks
```

- `database/schemas/validators.js` contains `$jsonSchema` rules for users,
  students, items, requests, rentals, bookings, bills, ratings, reports and
  wishlists. They are applied with `validationLevel: "moderate"` and
  `validationAction: "error"`, so old documents stay readable while new writes
  must be valid.
- `database/indexes/indexes.js` defines 33 indexes, including unique e-mail and
  PRN indexes, status/date indexes, and foreign-key indexes.
- `database/migrations/001-init.js` creates missing collections and applies
  validation/indexes idempotently.
- `database/migrations/002-image-paths.js` points seeded image rows at the real
  artwork in `frontend/public/images/products`.
- `database/seed/seed.js` reloads `database/seed.json` (181 documents) and rebuilds
  counters. The seed is destructive by design; never point it at production.

### Aggregations and queries

```powershell
node database/aggregations/category-stats.js
node database/aggregations/seller-stats.js
node database/aggregations/monthly-sales.js
node database/aggregations/rental-stats.js
node database/aggregations/admin-summary.js
node database/queries/examples.js
node database/transactions/transaction-demo.js
```

The aggregation scripts demonstrate `$group`, `$lookup`, `$unwind`, `$project`,
`$dateDiff`, `$facet`-style operational counts and calculated fields.

### MongoDB Atlas

1. Create a free Atlas cluster and a database user.
2. Add your IP address (or a restricted demo range) under **Network Access**.
3. Copy the driver connection string into `backend/.env` as `MONGODB_URI`.
4. Run `npm run db:init` and `npm run seed` once, or restore a dump.
5. Set `MONGODB_DB=campuskart` (or your chosen database name).

### Replication, transactions and storage

The local demo uses a standalone `mongod`; standalone servers do not support
multi-document transactions. Critical sale/rental steps therefore use ordered,
idempotent single-document updates guarded by status checks, and the hourly sweep
re-runs expiry. On Atlas (a replica set), the same services can wrap a sale in a
transaction; `withTransaction` is the recommended extension point.
`database/transactions/transaction-demo.js` runs a real abort/rollback test on a
replica set and prints `SKIPPED` on a standalone server. Atlas also provides
replication, point-in-time backups and encrypted storage at rest.
Uploaded files live on local/ephemeral disk in the free Render setup; for
production, use S3-compatible object storage or a persistent Render disk.

## 6. Security

- scrypt password hashing with per-user salts; no plain-text passwords.
- 8-hour HttpOnly `ck_session` cookie; `SameSite=Lax`; `Secure` in production.
- Role guards (`STUDENT`, `ADMIN`) and verification guards on every protected
  operation; the browser never decides authorization.
- Server-side validation for e-mail domains, PRN, phone, password, semester,
  prices, conditions, request transitions and ownership.
- `multer` file type/extension/size checks; generated random filenames; ID cards
  are not exposed in public listing responses.
- Helmet-style headers, `x-powered-by` disabled, JSON body limit, CORS allow-list
  via `CORS_ORIGINS`, and generic 500 errors so internals are not leaked.
- Admin-only moderation, verification, fraud and activity-log endpoints.
- Source maps are disabled in the production build.

## 7. Tests and verification

Run everything locally:

```powershell
npm test --prefix frontend
npm test --prefix backend
npm run db:init --prefix backend
npm run seed --prefix backend
npm run db:verify --prefix backend
npm run build --prefix frontend
python -m pip install requests
python backend/tests/e2e.py http://localhost:8080
```

### Verified on 22 October 2026

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend production build | **PASS** | `vite build`, 33 modules, `frontend/dist` produced |
| Frontend unit tests | **PASS** | 10/10 Vitest tests |
| Backend unit tests | **PASS** | 8/8 Node test-runner tests |
| Database schema + indexes | **PASS** | 33 indexes, 10 validated collections |
| Seed + relationship verification | **PASS** | 181 documents, 43/43 checks |
| HTTP end-to-end suite | **PASS** | 148/148 checks against a scratch database |
| Browser workflow smoke test | **PASS** | home, login, browse, item detail, admin dashboard; product images load |
| Native HTTP/URL demos | **PASS** | `/health` and `/echo` on port 8090 |
| Tomcat WAR build | **PASS** | `mvn clean package` produced `campuskart-demo.war` |
| Tomcat runtime | **NOT TESTED** | no `CATALINA_HOME`/Tomcat installation on this machine |
| Render/Atlas deployment | **NOT TESTED** | local MongoDB only; credentials not available |
| SMTP delivery | **NOT TESTED** | `SMTP_HOST` intentionally empty |
| MySQL task (`CampusKart_Complete.sql`) | **PASS** (separate task) | executed end-to-end earlier; 13 tables, 5 triggers, 8 functions, 9 procedures, 3 views |

The e2e suite uses a separate database (`campuskart_e2e`) so the demo data is not
mutated. It covers registration with an ID-card upload, login/guards, catalogue,
wishlist, a full sale (accept, handover pass, bill, rating), bundles, offers and
counters, cancellations, rentals, reports, admin tools and account deletion.

## 8. Deployment

### Combined Render service (recommended)

`render.yaml` builds the frontend and starts Express as one web service:

- health check: `/health`
- persistent API and SPA on one origin
- set `MONGODB_URI` in the Render dashboard (never commit it)
- optional SMTP variables

### Separate Render services (optional)

- `render.backend.yaml`: API service with `CORS_ORIGINS`
- `render.frontend.yaml`: static site with `VITE_API_BASE` and
  `VITE_UPLOAD_BASE`
- Set `VITE_API_BASE=https://<api>.onrender.com/campuskart` and
  `VITE_UPLOAD_BASE=https://<api>.onrender.com`
- Set `CORS_ORIGINS=https://<web>.onrender.com` on the API

### Jenkins

`Jenkinsfile` has stages for checkout, backend install/syntax/unit tests,
frontend install/unit tests, schema + indexes, seed, relationship verification,
frontend build, health/REST smoke check, 148-check e2e, and artifact archiving.
It expects a `node-22` tool, Python 3 + `requests`, and a
`campuskart-mongodb-uri` credential. It never seeds the demo database.

### Tomcat demo

`tomcat-demo/` is a separate WAR with a `HelloServlet` and no dependency on Node
or MongoDB:

```powershell
cd tomcat-demo
mvn clean package
# copy target/campuskart-demo.war to %CATALINA_HOME%\webapps\
# open http://localhost:8080/campuskart-demo/health
```

### Native HTTP and URL demos

```powershell
npm run demo:http --prefix backend
node backend/examples/url-demo.js
```

`examples/native-http-server.js` uses only `http` and `url`; it serves `/health`
and `/echo` on port 8090.

## 9. Known limitations

- The source project has no Java backend source. The Node API is an independent
  reimplementation, not a line-by-line port.
- The preserved renderer remains vanilla JavaScript inside React. This is a
  deliberate fidelity choice: rewriting 30+ screens would risk changing the UI.
  New React pages can use `services/rest()`, `AuthContext` and the component
  folders without touching the legacy screens.
- ID-card OCR runs in the browser through the preserved renderer; the server
  stores the uploaded card privately and an admin can review pending accounts.
- The free Render filesystem is ephemeral; use object storage for durable
  uploads in production.
- Atlas/Render/SMTP were not executed in this environment; their configuration is
  committed but not claimed as passing.

## 10. Source preservation

The following source files were used as the behavioural reference and were never
modified:

- `frontend/app.js` - routes, markup, events and validation messages
- `frontend/api.js` - mock handlers, seed data and business rules
- `frontend/style.css` - complete visual system
- `frontend/images/products/` - product artwork
- `database/campuskart.sql` - schema, constraints, triggers, procedures and seed
- `backend/Java Lab Manual.pdf` - the only backend artifact present

The destination is self-contained: `database/seed.json` and
`frontend/public/` are committed, so the app does not read from the source
directory at runtime.
