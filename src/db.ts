import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const envPath = process.env.NETSUITE_DB_PATH && process.env.NETSUITE_DB_PATH.trim()
  ? process.env.NETSUITE_DB_PATH.trim()
  : null;
const resolvedDbPath = envPath ? path.resolve(envPath) : path.resolve(__dirname, '../data/netsuite.db');
export const dbFilePath = resolvedDbPath;

let dbInstance: Database | null = null;

async function ensureSchema(db: Database) {
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

    CREATE TABLE IF NOT EXISTS vendor_payments (
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

    CREATE INDEX IF NOT EXISTS idx_vp_internal_id ON vendor_payments(internal_id);
    CREATE INDEX IF NOT EXISTS idx_vp_entity_name ON vendor_payments(entity_name);
    CREATE INDEX IF NOT EXISTS idx_vp_document_number ON vendor_payments(document_number);
    CREATE INDEX IF NOT EXISTS idx_vp_date ON vendor_payments(transaction_date);

    CREATE TABLE IF NOT EXISTS invoices (
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

    CREATE INDEX IF NOT EXISTS idx_inv_internal_id ON invoices(internal_id);
    CREATE INDEX IF NOT EXISTS idx_inv_entity_name ON invoices(entity_name);
    CREATE INDEX IF NOT EXISTS idx_inv_document_number ON invoices(document_number);
    CREATE INDEX IF NOT EXISTS idx_inv_date ON invoices(transaction_date);
  `;

  await db.exec(schema);
}

export async function getDb() {
  if (dbInstance) return dbInstance;
  await fs.promises.mkdir(path.dirname(dbFilePath), { recursive: true });
  
  const openDb = (mode: number) =>
    open({
      filename: dbFilePath,
      driver: sqlite3.Database,
      mode,
    });
  
  try {
    dbInstance = await openDb(sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
  } catch (e) {
    dbInstance = await openDb(sqlite3.OPEN_READONLY);
  }

  try {
    await dbInstance.exec('PRAGMA journal_mode = WAL');
  } catch (_) {
    // ignore
  }

  try {
    await ensureSchema(dbInstance);
  } catch (_) {
    // ignore (e.g. readonly database)
  }
  
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();

  await ensureSchema(db);
  console.log('Database initialized at:', dbFilePath);
}

// Run init if called directly
if (require.main === module) {
  initDb().catch(console.error);
}
