# Netsuite Data Viewer

Universal viewer for Netsuite CSV/Excel exports with forward-filled normalization, SQLite storage, and a fast React UI.

## Stack
- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Node.js (Express 5)
- Database: SQLite (node-sqlite/sqlite3)

## Key Features
- Forward-fill ingestion for grouped exports.
- Flexible schema: generic purchase_orders table with raw JSON column.
- Fast search with pagination, date and status filters.
- Detail modal with totals and line items.
- Health endpoint and Basic Auth for all APIs.

## Scripts
- `npm run build` – compile server and build client
- `npm start` – start compiled server on PORT (default 3001)
- `npm run start:server` – dev server with ts-node
- `npm run init:db` – initialize DB schema
- `npm run etl:po` – import Purchase Orders from `files/PurchaseOrders/` (dev)
- `npm run etl:po:prod` – run compiled importer in production
- `npm run db:export` – produce a single-file DB at `data/netsuite.upload.db`

## Environment
- `BASIC_USER` – API basic auth user (default `admin`)
- `BASIC_PASS` – API basic auth pass (default `@dmin`)
- `NETSUITE_DB_PATH` – optional absolute path to persistent `netsuite.db`
- `PORT` – server port (default `3001`)
  
## API
- `GET /api/purchase-orders` – list with search, filters, pagination
- `GET /api/purchase-orders-statuses` – distinct statuses
- `GET /api/purchase-orders/:docNumber` – header + lines + totals
- `GET /api/health` – diagnostics (protected)

## Auth
All `/api` routes require Basic Auth. Use the headers:
`Authorization: Basic base64(username:password)`

## Development
1. `npm install`
2. `npm run init:db`
3. `npm run etl:po` (optional, to load sample data)
4. `npm run build && npm start`

## File Map
- Server: `src/server.ts`
- DB: `src/db.ts`
- Importer: `src/process_po.ts`
- Frontend: `client/src/App.tsx`
- Docs: `docs/*`

See `docs/OPERATIONS.md` and `docs/DATA.md` for deployment and ingestion details.

