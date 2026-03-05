import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../data/netsuite.db');

let dbInstance: Database | null = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
  
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Enable WAL mode for better concurrency
  await dbInstance.exec('PRAGMA journal_mode = WAL');
  
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();

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

  await db.exec(schema);
  console.log('Database initialized at:', dbPath);
}

// Run init if called directly
if (require.main === module) {
  initDb().catch(console.error);
}
