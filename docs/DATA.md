# Data Model & Ingestion

## Schema
Single generic table with raw JSON for flexibility:

purchase_orders
- internal_id TEXT
- transaction_date TEXT (YYYY-MM-DD)
- entity_name TEXT
- document_number TEXT
- status TEXT
- item_name TEXT
- quantity REAL
- amount REAL
- raw_data JSON

Indexed: internal_id, entity_name, document_number, transaction_date

## Ingestion (Forward-Fill)
Source: `src/process_po.ts`
- Netsuite exports group transactions: the first row has header fields, subsequent line rows omit them.
- The importer forward-fills header fields using the last seen "Internal ID" group.
- Normalizes the date and casts numerics.
- Stores the full source row as `raw_data` to preserve extra columns.

Mapped columns:
- Internal ID → internal_id
- Supplier Name → entity_name
- Date → transaction_date
- Document Number → document_number
- Status → status
- Item → item_name
- Quantity → quantity
- Amount → amount

## Detail Enrichment
Source: `src/server.ts` (detail endpoint)
- Header Location read from `raw_data`: `Location` or `Location Name`
- Line extras:
  - Rate from `Item Rate` or `Rate`
  - SRP from `SRP` or `Suggested Retail Price` (invalid becomes 0)
  - Discount from `Discount` or `Item Discount`
- Currency parsing strips `₱`, commas, and spaces safely.

## Importing New Exports
- Put Excel files in `files/PurchaseOrders/`
- Run:
  - Dev: `npm run etl:po`
  - Prod: `npm run etl:po:prod`

