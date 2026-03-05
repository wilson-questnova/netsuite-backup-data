import { getDb } from './db';

const db = getDb();

function verify() {
  console.log('--- Verification Report ---');

  // 1. Total Count
  const count = db.prepare('SELECT COUNT(*) as count FROM purchase_orders').get() as { count: number };
  console.log(`Total Records: ${count.count}`);

  // 2. Missing Internal IDs (Should be 0)
  const missingId = db.prepare("SELECT COUNT(*) as count FROM purchase_orders WHERE internal_id IS NULL OR internal_id = ''").get() as { count: number };
  console.log(`Rows with missing Internal ID: ${missingId.count}`);

  // 3. Missing Supplier (Should be 0 if forward-fill worked)
  const missingSupplier = db.prepare("SELECT COUNT(*) as count FROM purchase_orders WHERE entity_name IS NULL OR entity_name = ''").get() as { count: number };
  console.log(`Rows with missing Supplier Name: ${missingSupplier.count}`);

  // 4. Sample Data (First 5 rows with an Item)
  console.log('\n--- Sample Data (Line Items) ---');
  const samples = db.prepare(`
    SELECT internal_id, transaction_date, entity_name, document_number, item_name, amount 
    FROM purchase_orders 
    WHERE item_name IS NOT NULL AND item_name != '' 
    LIMIT 5
  `).all();
  
  console.table(samples);
}

verify();
