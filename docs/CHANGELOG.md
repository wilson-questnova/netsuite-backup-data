# Changelog

All notable changes to this project will be documented here.

## 2026-03-05
- Add Location to PO detail header; add Rate, SRP, Discount to line items; coerce SRP to 0 when invalid.
- Make PO detail modal scrollable; close on overlay click and Esc.
- Fix React error #310 by ensuring stable hook order around login vs. modal.
- Support `NETSUITE_DB_PATH` to keep DB persistent across Hostinger redeploys.
- Add DB export script (`npm run db:export`) to produce single-file SQLite for upload.
- Fix SQLite parameter binding in list queries.
- Add `/api/health` diagnostics endpoint.
- Auto-create SQLite schema on startup.
- Client uses same-origin API in production (no `localhost`).
- Express 5 safe catch-all route for SPA serving.

