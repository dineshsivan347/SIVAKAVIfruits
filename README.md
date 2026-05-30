# SK SK Fruits - Fruit Stock Analyzer

## Project Summary

SK Fruits is a small, self-contained Fruit Stock Analyzer intended for local shop owners and small retailers. It provides a lightweight web dashboard and API to track inventory, record sales/restocks/waste, and generate a daily sales report. Data is stored in MongoDB (Atlas or self-hosted).

Key features:
- Inventory management (add/update/remove fruit varieties)
- Record transactions: Sale, Restock, Waste
- Activity log and stock history with simple metrics
- Daily sales reporting UI (React page)
- Seeded admin user for first-run access

Status: working prototype — MongoDB-backed. Recommended improvements for production: auth/session hardening, automated tests, CI, and containerization.

This repository contains a small Fruit Stock Analyzer application: an Express API backed by **MongoDB**, and a lightweight frontend served as static files.

**Stack:** Node.js (ESM), Express, MongoDB, vanilla JS + a React-based daily report page.

**This README** contains quick start, maintenance, API examples, and troubleshooting tips.

**Prerequisites**
- Node.js 16+ installed
- (Windows) Build tools for native modules may be needed to install `bcrypt` and `sqlite3` (e.g. Visual Studio Build Tools / Python). On other OSes ensure build toolchain is available.

Install dependencies
```bash
npm install
```

Configure MongoDB
```bash
# Copy the example env file and set your Atlas connection string
copy .env.example .env
# Edit .env → set MONGO_URI and optionally MONGO_DB_NAME
```

Run (development)
```bash
# uses nodemon (installed as a devDependency)
npm run dev
```

Run (production)
```bash
node server.js
```

Behavior notes
- The server serves static frontend files from the project root. By default it listens on port `3000`; if the port is busy it will automatically try the next port (3001, 3002, ...).
- **`MONGO_URI` is required** (MongoDB Atlas or local MongoDB). Data is stored in the database named `MONGO_DB_NAME` (default: `sk_fruits`).
- Collections: `users`, `inventory`, `metrics`, `activity_log`, `stock_history`.
- `npm test` uses an in-memory database when `MONGO_URI` is not set.
- `nodemon` is intentionally in `devDependencies` to keep production installs minimal.

Default admin user (initial seed)
- username: `admin`
- password: `admin123`

Security note: change the default admin password after first login. Passwords are stored hashed in the `users` collection.

Quick DB reset / reseed
- In MongoDB Atlas (or Compass), drop the `sk_fruits` database (or empty collections), then restart the server; the seed routine will recreate the default admin and sample fruits on first run.

API Examples
- Login (get token):
```bash
curl -s -X POST http://localhost:3000/api/login \
	-H 'Content-Type: application/json' \
	-d '{"username":"admin","password":"admin123"}' | jq
```

- Use token for protected endpoints (example `GET /api/state`):
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/state | jq
```

Daily sales report UI
- Open `/daily-sales` (served as `daily-sales.html`) in the browser while the server is running.

Dependencies & maintenance
- Address vulnerabilities: `npm audit fix` (and `npm audit fix --force` only if you accept potential breaking changes).
- Some packages compile native code during install (`bcrypt`, `sqlite3`). If install fails on Windows, install the recommended build tools and retry.

Troubleshooting
- Port in use: the server will try the next port automatically; check console output to see which port started.
- `401 Unauthorized` from API: ensure you send `Authorization: Bearer <token>` header after login.
- `git` not available: this environment may not have `git`; commit locally where git is configured.

No automated tests
- There are no unit or integration tests in this repo yet. Recommended next steps: add a small Jest + supertest suite for API endpoints, and a basic E2E smoke test for the frontend.

Recommended next steps
- Add basic tests and a CI workflow (GitHub Actions) to run `npm test` and `npm audit`.
- Add a `Dockerfile` + `docker-compose.yml` for reproducible local development and production packaging.
- Replace the in-memory token store with a persistent session / JWT with expiry for production.

Files changed during cleanup
- Moved dev artifacts to `cleanup_removed/` and moved `nodemon` into `devDependencies` in `package.json`.

If you want, I can:
- create a `Dockerfile` and `docker-compose.yml`, or
- add a minimal test suite and CI workflow, or
- prepare a git commit patch for your review.
