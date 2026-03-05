# Operations & Deployment

## Hostinger Deployment
- Redeploy replaces the app directory; keep the DB outside the deploy folder.
- Set `NETSUITE_DB_PATH` to a persistent absolute path:
  `/home/<user>/domains/<domain>/storage/netsuite.db`
- Upload the DB there and restart the Node app.

## Environment Variables
- `BASIC_USER` / `BASIC_PASS` – Basic Auth credentials for `/api/*`
- `NETSUITE_DB_PATH` – absolute path to `netsuite.db` for persistence
- `PORT` – server port (default 3001)

## Common Tasks
- Build: `npm run build`
- Start: `npm start`
- Import POs (prod): `npm run etl:po:prod`
- Health: open `/api/health` (requires Basic Auth)

## Data Upload Options
1. Single-file DB export (recommended)
   - Run `npm run db:export` locally
   - Upload `data/netsuite.upload.db` to `NETSUITE_DB_PATH` (rename to `netsuite.db`)
   - Restart app; verify `/api/health`
2. Upload WAL triple (fallback)
   - Upload `netsuite.db`, `netsuite.db-wal`, `netsuite.db-shm`
   - Restart app; verify `/api/health`
3. Server import
   - Upload Excel files to `files/PurchaseOrders/`
   - Run `npm run etl:po:prod`

## Troubleshooting
- 401 on `/api/*`: credentials mismatch; set `BASIC_USER` and `BASIC_PASS`.
- `purchaseOrdersCount: 0` on health: DB has no rows; import or upload a populated DB.
- Express catch-all crash in Express 5: fixed via regex route.
- Client calling `localhost`: fixed; client uses same-origin in production.

