# CampusKart backend

Node.js 20.19+ / Express 5 API, MongoDB 8, multer uploads, optional Nodemailer
e-mail, and an EventEmitter audit bus. It keeps the original Java API path,
payload names, error messages and status codes, and adds a conventional REST v1
surface.

```powershell
npm install
Copy-Item .env.example .env    # optional
npm run db:init                # collections, $jsonSchema, 33 indexes
npm run seed                   # reload 181 documents from ../database/seed.json
npm start                      # http://localhost:8080
npm run dev                    # node --watch
npm test                       # 8 unit tests
npm run db:verify              # 43 database checks
```

## Endpoints

- `POST /campuskart/api/<name>` - all 67 original UI operations.
- `GET /health` - liveness + MongoDB connectivity.
- `GET /api/v1` - REST discovery document.
- `GET|POST|PATCH|DELETE /api/v1/...` - resource-oriented API (see
  `../postman/CampusKart-REST.postman_collection.json`).
- Static files: Express serves `../frontend/dist` and `/uploads`.

The action route exists because the preserved frontend calls operation names.
The REST route is an adapter over the same controllers; it does not duplicate
business rules.

## Layout

| Path | Purpose |
| --- | --- |
| `server.js` | Express app, action route, CORS, multipart, static SPA, health |
| `rest.js` | REST v1 route table and response handling |
| `config.js` | `.env` loading, port, Mongo URI, CORS, SMTP |
| `db.js` | MongoDB connection, collection map, counters, `nextId` |
| `api/` | Controllers for auth, catalog, requests, bundles, rentals, admin, account |
| `views.js` | JSON shapes and derived values (port of the Java `Views` layer) |
| `rules.js` | Trigger/procedure rules: status transitions, fraud checks, expiry |
| `idcard.js` | ID-card text checks used during registration/verification |
| `mail.js` | EventEmitter e-mail queue with optional SMTP |
| `sessions.js` | 8-hour session store |
| `src/routes/` | Controller registry |
| `src/models/` | Collection metadata + validator registry |
| `src/middleware/` | Auth/request/response adapters |
| `src/services/` | Rules, views and ID-card services |
| `src/validators/` | Server-side input rules |
| `src/events/` | Audit events and `logs/events.log` |
| `src/jobs/` | Hourly request-expiry job |
| `src/templates/` | Plain-text e-mail templates |
| `src/tests/` | Node test-runner unit suite |
| `examples/` | Native `http`/`url` coursework demos |
| `tests/e2e.py` | 148-check HTTP end-to-end suite |

## Environment

| Key | Default | Meaning |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | MongoDB or Atlas connection string |
| `MONGODB_DB` | `campuskart` | Database name |
| `PORT` | `8080` | HTTP port |
| `UPLOAD_DIR` | `backend/uploads` | Upload destination |
| `WEB_DIR` | `frontend/dist` | Built frontend served by Express |
| `CORS_ORIGINS` | empty | Comma-separated allowed frontend origins |
| `SMTP_*` | empty | Optional mail; empty disables delivery |

## Security

- scrypt password hashes, HttpOnly `ck_session` cookie, `SameSite=Lax`,
  `Secure` in production.
- Role and verification guards on every protected operation.
- Server-side validation of e-mail domain, PRN, phone, password, semester,
  prices, conditions, ownership and request transitions.
- Upload MIME/extension/size checks, random names, private ID cards.
- CORS allow-list, JSON limits, no `x-powered-by`, generic 500 responses.

## E-mail and events

`mail.js` and `src/events` use Node `EventEmitter`. A slow SMTP server never
blocks a request. When SMTP is not configured, notifications are skipped without
changing the API response. Critical state is always written to MongoDB first;
events are non-critical side effects.

## Tests

```powershell
npm test
$env:MONGODB_DB='campuskart_e2e'
npm run db:init
npm run seed
$env:PORT='8081'
node server.js
python tests/e2e.py http://localhost:8081
```

The e2e suite wipes the database named by `MONGODB_DB`. Never point it at the
demo database.
