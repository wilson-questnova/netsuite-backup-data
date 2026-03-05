import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getDb } from './db';

const FILES_DIR = path.resolve(__dirname, '../files/PurchaseOrders');

// Interface matching the Netsuite export structure
interface PORow {
  'Internal ID'?: string | number;
  'Supplier Name'?: string;
  'Date'?: string; // Often comes as Excel serial date
  'Document Number'?: string;
  'Status'?: string;
  'Item'?: string;
  'Quantity'?: number;
  'Amount'?: number;
  [key: string]: any; // For other columns
}

// Helper to convert Excel serial date to JS Date string (YYYY-MM-DD)
function parseExcelDate(dateVal: any): string | null {
  if (!dateVal) return null;
  if (typeof dateVal === 'number') {
    // Excel date to JS date
    const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  // Try to parse string date "MM/DD/YYYY" or similar
  const date = new Date(dateVal);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  return String(dateVal);
}

async function processFiles() {
  const db = await getDb();
  
  if (!fs.existsSync(FILES_DIR)) {
    console.error(`Directory not found: ${FILES_DIR}`);
    return;
  }

  const files = fs.readdirSync(FILES_DIR).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
  
  console.log(`Found ${files.length} files to process.`);

  for (const file of files) {
    const filePath = path.join(FILES_DIR, file);
    console.log(`Processing: ${file}...`);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert sheet to JSON array
    const rows: PORow[] = XLSX.utils.sheet_to_json(sheet);

    console.log(`  - Read ${rows.length} rows.`);

    let parentContext: Partial<PORow> = {};
    let insertedCount = 0;

    // Track the last seen Internal ID to detect new groups
    let lastInternalId: string | number | null = null;

    // Begin transaction
    await db.exec('BEGIN TRANSACTION');

    try {
      const insertStmt = await db.prepare(`
        INSERT INTO purchase_orders (
          internal_id, transaction_date, entity_name, document_number,
          status, item_name, quantity, amount, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        const currentId = row['Internal ID'];

        if (currentId && currentId !== lastInternalId) {
          // New Transaction Group
          lastInternalId = currentId;
          
          // Reset context
          parentContext = {
            'Internal ID': currentId,
            'Supplier Name': row['Supplier Name'],
            'Date': row['Date'],
            'Document Number': row['Document Number'],
            'Status': row['Status']
          };
        }

        const completeRow = {
          ...row, 
          'Internal ID': parentContext['Internal ID'],
          'Supplier Name': parentContext['Supplier Name'], 
          'Date': parentContext['Date'],                   
          'Document Number': parentContext['Document Number'],
          'Status': parentContext['Status']
        };

        const internalId = String(completeRow['Internal ID'] || '');
        if (!internalId) continue;

        const date = parseExcelDate(completeRow['Date']);
        const supplier = completeRow['Supplier Name'] || null;
        const docNum = completeRow['Document Number'] || null;
        const status = completeRow['Status'] || null;
        const item = completeRow['Item'] || null;
        const qty = Number(completeRow['Quantity']) || 0;
        const amount = Number(completeRow['Amount']) || 0;

        await insertStmt.run(
          internalId,
          date,
          supplier,
          docNum,
          status,
          item,
          qty,
          amount,
          JSON.stringify(completeRow)
        );
        insertedCount++;
      }

      await insertStmt.finalize();
      await db.exec('COMMIT');
      console.log(`  - Successfully inserted ${insertedCount} records.`);

    } catch (err) {
      await db.exec('ROLLBACK');
      console.error(`  - Error processing file ${file}:`, err);
    }
  }

  console.log('\nAll files processed.');
}

processFiles().catch(console.error);
