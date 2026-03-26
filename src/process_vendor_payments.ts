import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getDb } from './db';

const FILES_DIR = path.resolve(__dirname, '../files/VendorPayments');

function parseExcelDate(val: any): string | null {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return String(val);
}

function toNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  const isParenNegative = /^\(.*\)$/.test(s);
  s = s.replace(/[₱,\s]/g, '').replace(/\(/g, '').replace(/\)/g, '');
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return isParenNegative ? -n : n;
}

async function run() {
  const db = await getDb();
  if (!fs.existsSync(FILES_DIR)) {
    console.error(`Directory not found: ${FILES_DIR}`);
    return;
  }

  const files = fs.readdirSync(FILES_DIR).filter(f => /\.xlsx?$/.test(f));
  console.log(`Found ${files.length} files to process.`);

  for (const file of files) {
    console.log(`Processing: ${file}`);
    const workbook = XLSX.readFile(path.join(FILES_DIR, file));
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    console.log(`  - Read ${rows.length} rows.`);

    let lastId: string | number | null = null;
    let context: any = {};
    let inserted = 0;

    await db.exec('BEGIN TRANSACTION');
    try {
      const stmt = await db.prepare(`
        INSERT INTO vendor_payments (
          internal_id, transaction_date, entity_name, document_number,
          status, item_name, quantity, amount, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        const currentId = row['Internal ID'] ?? row['ID'] ?? row['internalid'];
        if (currentId && currentId !== lastId) {
          lastId = currentId;
          context = {
            id: currentId,
            vendor: row['Vendor Name'] ?? row['Main Line Name'] ?? row['Payee'] ?? row['Supplier Name'] ?? row['Entity'] ?? null,
            date: row['Date'] ?? row['Transaction Date'] ?? row['Date Processed'] ?? null,
            doc: row['Document Number'] ?? row['Transaction Number'] ?? row['Payment Number'] ?? row['Number'] ?? null,
            status: row['Status'] ?? row['Document Status'] ?? null,
          };
        }

        const complete = {
          ...row,
          'Internal ID': context.id ?? row['Internal ID'],
          'Vendor Name': context.vendor ?? row['Vendor Name'] ?? row['Main Line Name'],
          'Date': context.date ?? row['Date'] ?? row['Transaction Date'] ?? row['Date Processed'],
          'Document Number': context.doc ?? row['Document Number'] ?? row['Transaction Number'],
          'Status': context.status ?? row['Status'],
        };

        const internalId = String(complete['Internal ID'] || '');
        if (!internalId) continue;

        const date = parseExcelDate(complete['Date']);
        const vendor = complete['Vendor Name'] ?? complete['Main Line Name'] ?? complete['Payee'] ?? complete['Supplier Name'] ?? complete['Entity'] ?? null;
        const docNum = complete['Document Number'] ?? complete['Transaction Number'] ?? complete['Payment Number'] ?? complete['Number'] ?? null;
        const status = complete['Status'] ?? null;
        const lineName =
          complete['Applied To'] ??
          complete['Applied To Transaction'] ??
          complete['Applied To Transact'] ??
          complete['Memo'] ??
          complete['Memo (Main)'] ??
          complete['Account'] ??
          complete['Account (Main)'] ??
          complete['Line'] ??
          null;
        const qty = toNumber(complete['Quantity'] ?? 0); // most VP rows have no quantity; remains 0
        const amount = toNumber(complete['Amount'] ?? complete['Payment Amount'] ?? complete['Applied Amount'] ?? 0);

        await stmt.run(
          internalId,
          date,
          vendor,
          docNum,
          status,
          lineName,
          qty,
          amount,
          JSON.stringify(complete)
        );
        inserted++;
      }

      await stmt.finalize();
      await db.exec('COMMIT');
      console.log(`  - Inserted ${inserted} records.`);
    } catch (e) {
      await db.exec('ROLLBACK');
      console.error(`  - Failed on ${file}:`, e);
    }
  }
  console.log('Done.');
}

run().catch(console.error);
