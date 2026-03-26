import * as fs from 'fs';
import * as path from 'path';
import * as sax from 'sax';
import { getDb } from './db';

const FILES_DIR = path.resolve(__dirname, '../files/ItemReceipts');

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
  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.slice(1, -1);
  }
  s = s.replace(/[₱,\s]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseXmlSpreadsheetStream(filePath: string, onRow: (row: Record<string, any>) => Promise<void> | void) {
  return new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const parser = sax.createStream(true, { trim: false }); // Strict mode true

    let inTable = false;
    let inRow = false;
    let inCell = false;
    let inData = false;

    let headers: string[] = [];
    let currentRow: string[] = [];
    let currentCellIndex = 0;
    let currentData = '';
    let isHeaderRow = true; 

    parser.on('opentag', (node) => {
      const name = node.name.toLowerCase();
      const shortName = name.includes(':') ? name.split(':')[1] : name;
      
      if (shortName === 'table') {
        inTable = true;
      } else if (inTable && shortName === 'row') {
        inRow = true;
        currentRow = [];
        currentCellIndex = 0;
      } else if (inRow && shortName === 'cell') {
        inCell = true;
        const indexAttr = node.attributes['ss:Index'] || node.attributes['ss:index'];
        if (indexAttr) {
          currentCellIndex = parseInt(indexAttr as string, 10) - 1;
        }
      } else if (inCell && shortName === 'data') {
        inData = true;
        currentData = '';
      }
    });

    parser.on('text', (text) => {
      if (inData) {
        currentData += text;
      }
    });

    parser.on('closetag', async (name) => {
      name = name.toLowerCase();
      const shortName = name.includes(':') ? name.split(':')[1] : name;

      if (shortName === 'data') {
        inData = false;
        currentRow[currentCellIndex] = currentData;
      } else if (shortName === 'cell') {
        inCell = false;
        currentCellIndex++;
      } else if (shortName === 'row') {
        inRow = false;
        if (isHeaderRow) {
          headers = [...currentRow];
          isHeaderRow = false;
        } else {
          if (currentRow.length > 0) {
            const rowObj: Record<string, any> = {};
            for (let i = 0; i < headers.length; i++) {
              const header = headers[i];
              if (header) {
                rowObj[header] = currentRow[i] !== undefined ? currentRow[i] : null;
              }
            }
            
            stream.pause();
            try {
              await onRow(rowObj);
            } catch (e) {
              reject(e);
            }
            stream.resume();
          }
        }
      } else if (shortName === 'table') {
        inTable = false;
      }
    });

    parser.on('error', (e) => {
      reject(e);
    });

    parser.on('end', () => {
      resolve();
    });

    stream.pipe(parser);
  });
}

async function run() {
  const db = await getDb();
  if (!fs.existsSync(FILES_DIR)) {
    console.error(`Directory not found: ${FILES_DIR}`);
    return;
  }

  const files = fs.readdirSync(FILES_DIR).filter(f => /\.xlsx?$/.test(f));
  console.log(`Found ${files.length} files to process in ItemReceipts.`);

  for (const file of files) {
    console.log(`Processing: ${file}`);
    
    let lastId: string | number | null = null;
    let context: any = {};
    let inserted = 0;

    await db.exec('BEGIN TRANSACTION');
    
    try {
      const stmt = await db.prepare(`
        INSERT INTO item_receipts (
          internal_id, transaction_date, entity_name, document_number,
          status, item_name, quantity, amount, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await parseXmlSpreadsheetStream(path.join(FILES_DIR, file), async (row) => {
        const currentId = row['Internal ID'] ?? row['ID'] ?? row['internalid'];
        
        if (currentId && currentId !== lastId) {
          lastId = currentId;
          context = {
            id: currentId,
            date: row['Date'] ?? null,
            doc: row['Document Number'] ?? null,
            supplier: row['Company'] ?? null, 
          };
        }

        const complete: Record<string, any> = {
          ...row,
          'Internal ID': context.id ?? row['Internal ID'],
          'Date': context.date ?? row['Date'],
          'Document Number': context.doc ?? row['Document Number'],
          'Company': context.supplier ?? row['Company'],
        };

        const internalId = String(complete['Internal ID'] || '');
        if (!internalId) return;

        const date = parseExcelDate(complete['Date']);
        const entityName = complete['Company'] ?? null;
        const docNum = complete['Document Number'] ?? null;
        const status = 'Received'; 
        
        const lineName = complete['Item'] ?? complete['Item : Description'] ?? complete['Account'] ?? null;
        const qty = toNumber(complete['Quantity'] ?? 0);
        const amount = toNumber(complete['Amount'] ?? 0);

        await stmt.run(
          internalId,
          date,
          entityName,
          docNum,
          status,
          lineName,
          qty,
          amount,
          JSON.stringify(complete)
        );
        inserted++;
        
        if (inserted % 10000 === 0) {
          console.log(`  - Inserted ${inserted} records...`);
        }
      });

      await stmt.finalize();
      await db.exec('COMMIT');
      console.log(`  - Finished processing ${file}. Total inserted: ${inserted} records.`);
    } catch (e) {
      await db.exec('ROLLBACK');
      console.error(`  - Failed on ${file}:`, e);
    }
  }
  console.log('Done.');
}

run().catch(console.error);
