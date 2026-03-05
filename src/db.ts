import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../data/netsuite.db');
export const dbFilePath = dbPath;

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
  `;

  await db.exec(schema);
}

export async function getDb() {
  if (dbInstance) return dbInstance;
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
  
  const openDb = (mode: number) =>
    open({
      filename: dbPath,
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
  console.log('Database initialized at:', dbPath);
}

// Run init if called directly
if (require.main === module) {
  initDb().catch(console.error);
}
