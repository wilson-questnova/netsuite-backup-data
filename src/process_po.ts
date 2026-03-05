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
  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT INTO purchase_orders (
      internal_id, transaction_date, entity_name, document_number,
      status, item_name, quantity, amount, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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

    const insertMany = db.transaction((rowsToInsert: PORow[]) => {
      for (const row of rowsToInsert) {
        const currentId = row['Internal ID'];

        // Logic:
        // 1. If we have a NEW Internal ID, this is a new transaction.
        //    We expect the header fields (Supplier, Date, etc.) to be present on this row.
        //    We update the parentContext with whatever is in this row.
        // 2. If the Internal ID is the SAME as the last one (or missing, though we skip missing),
        //    we generally keep the old parentContext.
        //    HOWEVER, sometimes the header info might be spread out? (Unlikely for standard exports).
        //    The issue with the previous code was that it reset parentContext even for the same ID 
        //    if the row had an ID but no Supplier.

        if (currentId && currentId !== lastInternalId) {
          // New Transaction Group
          lastInternalId = currentId;
          
          // Reset context, taking available fields from the new header row
          parentContext = {
            'Internal ID': currentId,
            'Supplier Name': row['Supplier Name'], // Will be used for subsequent rows
            'Date': row['Date'],
            'Document Number': row['Document Number'],
            'Status': row['Status']
          };
        } else if (currentId && currentId === lastInternalId) {
          // Same Transaction, subsequent row.
          // The row MIGHT have empty header fields (like Supplier), so we rely on parentContext.
          // But if this row DOES have a value (e.g. a correction?), should we update?
          // Usually, for these exports, the first row is the authority. 
          // We will NOT update parentContext with empty values.
        }

        // Merge: Use parentContext as base, but current row's line items (Item, Amount) take precedence.
        // Important: We do NOT want to overwrite the "forward-filled" header fields with empty/undefined from the current row.
        // So we construct the complete row carefully.
        
        const completeRow = {
          ...row, // Start with current row (has Item, Amount, etc.)
          'Internal ID': parentContext['Internal ID'],
          'Supplier Name': parentContext['Supplier Name'], // Fill from parent
          'Date': parentContext['Date'],                   // Fill from parent
          'Document Number': parentContext['Document Number'],
          'Status': parentContext['Status']
        };

        // Data Cleaning & Type Casting
        const internalId = String(completeRow['Internal ID'] || '');
        // Skip if still no ID (garbage row)
        if (!internalId) continue;

        const date = parseExcelDate(completeRow['Date']);
        const supplier = completeRow['Supplier Name'] || null;
        const docNum = completeRow['Document Number'] || null;
        const status = completeRow['Status'] || null;
        const item = completeRow['Item'] || null;
        const qty = Number(completeRow['Quantity']) || 0;
        const amount = Number(completeRow['Amount']) || 0;

        insertStmt.run(
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
    });

    try {
      insertMany(rows);
      console.log(`  - Successfully inserted ${insertedCount} records.`);
    } catch (err) {
      console.error(`  - Error processing file ${file}:`, err);
    }
  }

  console.log('\nAll files processed.');
}

processFiles().catch(console.error);
