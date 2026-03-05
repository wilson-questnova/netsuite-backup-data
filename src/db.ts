import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../data/netsuite.db');
const db = new Database(dbPath);

export function initDb() {
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create the main records table
  // We use a generic schema but index key fields for performance
  const schema = `
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      internal_id TEXT,
      transaction_date TEXT,
      entity_name TEXT,
      document_number TEXT,
      status TEXT,
      item_name TEXT,
      quantity REAL,
      amount REAL,
      raw_data JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_po_internal_id ON purchase_orders(internal_id);
    CREATE INDEX IF NOT EXISTS idx_po_entity_name ON purchase_orders(entity_name);
    CREATE INDEX IF NOT EXISTS idx_po_document_number ON purchase_orders(document_number);
    CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(transaction_date);
  `;

  db.exec(schema);
  console.log('Database initialized at:', dbPath);
}

export const getDb = () => db;

// Run init if called directly
if (require.main === module) {
  initDb();
}
