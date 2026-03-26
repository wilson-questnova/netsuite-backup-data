import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { getDb, dbFilePath } from './db';

const app = express();
const PORT = process.env.PORT || 3001;
const BASIC_USER = process.env.BASIC_USER || 'admin';
const BASIC_PASS = process.env.BASIC_PASS || '@dmin';

app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

function basicAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === 'OPTIONS') return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
    return res.status(401).send('Authentication required');
  }
  try {
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
    const [user, pass] = credentials.split(':');
    if (user === BASIC_USER && pass === BASIC_PASS) {
      return next();
    }
  } catch (_) {
    // fallthrough to 401
  }
  return res.status(401).send('Invalid credentials');
}

// Protect all API endpoints
app.use('/api', basicAuth);

app.get('/api/auth/me', (req, res) => {
  res.json({ user: BASIC_USER });
});

app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    const fileExists = fs.existsSync(dbFilePath);
    const tablesRaw = await db.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
    ) as { name: string }[];

    let purchaseOrdersCount: number | null = null;
    let purchaseOrdersCountError: string | null = null;
    try {
      const row = await db.get('SELECT COUNT(*) as count FROM purchase_orders') as { count: number };
      purchaseOrdersCount = row?.count ?? 0;
    } catch (e) {
      purchaseOrdersCountError = e instanceof Error ? e.message : String(e);
    }

    res.json({
      ok: true,
      dbFilePath,
      fileExists,
      tables: tablesRaw.map((t) => t.name),
      purchaseOrdersCount,
      purchaseOrdersCountError,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      dbFilePath,
      fileExists: fs.existsSync(dbFilePath),
    });
  }
});

// API Routes
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string || '').trim();
    const startDate = (req.query.startDate as string || '').trim();
    const endDate = (req.query.endDate as string || '').trim();
    const status = (req.query.status as string || '').trim();
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        MAX(internal_id) as internal_id, 
        MAX(transaction_date) as transaction_date, 
        MAX(entity_name) as entity_name, 
        document_number, 
        MAX(status) as status, 
        SUM(CASE WHEN item_name IS NOT NULL AND item_name != '' THEN quantity ELSE 0 END) as quantity, 
        SUM(CASE WHEN item_name IS NOT NULL AND item_name != '' THEN amount ELSE 0 END) as amount 
      FROM purchase_orders
      WHERE 1=1
    `;
    
    let countQuery = `SELECT COUNT(DISTINCT document_number) as total FROM purchase_orders WHERE 1=1`;
    const params: any[] = [];

    if (search) {
      const searchCondition = `
        AND (
          document_number LIKE ? 
          OR entity_name LIKE ? 
          OR item_name LIKE ?
          OR internal_id LIKE ?
        )
      `;
      query += searchCondition;
      countQuery += searchCondition;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    if (startDate) {
      const dateCondition = ` AND transaction_date >= ?`;
      query += dateCondition;
      countQuery += dateCondition;
      params.push(startDate);
    }

    if (endDate) {
      const dateCondition = ` AND transaction_date <= ?`;
      query += dateCondition;
      countQuery += dateCondition;
      params.push(endDate);
    }

    if (status) {
      const statusCondition = ` AND status = ?`;
      query += statusCondition;
      countQuery += statusCondition;
      params.push(status);
    }

    // Group by document number and order
    query += ` GROUP BY document_number ORDER BY MAX(transaction_date) DESC LIMIT ? OFFSET ?`;
    
    // For main query, we need limit/offset params
    const queryParams = [...params, limit, offset];

    const totalResult = await db.get(countQuery, ...params) as { total: number };
    const rows = await db.all(query, ...queryParams);

    res.json({
      data: rows,
      meta: {
        total: totalResult.total,
        page,
        limit,
        totalPages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/purchase-orders-statuses', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT DISTINCT status
      FROM purchase_orders
      WHERE status IS NOT NULL AND status != ''
      ORDER BY status ASC
    `) as { status: string }[];
    res.json({ statuses: rows.map(r => r.status) });
  } catch (e) {
    console.error('Statuses error:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Detail view for a specific Document Number
app.get('/api/purchase-orders/:docNumber', async (req, res) => {
  const docNumber = (req.params.docNumber || '').trim();
  if (!docNumber) {
    return res.status(400).json({ error: 'Missing document number' });
  }

  try {
    const db = await getDb();
    const headerRow = await db.get(`
      SELECT internal_id, transaction_date, entity_name, document_number, status, raw_data
      FROM purchase_orders
      WHERE document_number = ?
      ORDER BY rowid ASC
      LIMIT 1
    `, docNumber) as any;

    const rawHeader = (() => {
      try { return headerRow?.raw_data ? JSON.parse(headerRow.raw_data) : null; } catch { return null; }
    })();

    const location =
      rawHeader?.['Location'] ??
      rawHeader?.['location'] ??
      rawHeader?.['Location Name'] ??
      null;

    const header = headerRow
      ? {
          internal_id: headerRow.internal_id,
          transaction_date: headerRow.transaction_date,
          entity_name: headerRow.entity_name,
          document_number: headerRow.document_number,
          status: headerRow.status,
          location,
        }
      : null;

    if (!header) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const rows = await db.all(`
      SELECT item_name AS item, quantity, amount, raw_data
      FROM purchase_orders
      WHERE document_number = ? AND item_name IS NOT NULL AND item_name != ''
      ORDER BY rowid ASC
    `, docNumber) as any[];

    const parseNumber = (v: any): number => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      let s = String(v).trim();
      const isParenNegative = /^\(.*\)$/.test(s);
      s = s.replace(/[₱,\s]/g, '').replace(/\(/g, '').replace(/\)/g, '');
      const n = parseFloat(s);
      if (!isFinite(n)) return 0;
      return isParenNegative ? -n : n;
    };

    const lines = rows.map(r => {
      let raw: any = null;
      try { raw = r.raw_data ? JSON.parse(r.raw_data) : null; } catch { raw = null; }
      const rate = raw ? (raw['Item Rate'] ?? raw['Rate'] ?? null) : null;
      const srp = raw ? (raw['SRP'] ?? raw['Suggested Retail Price'] ?? null) : null;
      const discount = raw ? (raw['Discount'] ?? raw['Item Discount'] ?? null) : null;
      return {
        item: r.item,
        quantity: r.quantity,
        amount: parseNumber(r.amount),
        rate: parseNumber(rate),
        srp: parseNumber(srp), // if NaN, becomes 0
        discount: discount ?? '',
      };
    });

    const totals = await db.get(`
      SELECT 
        SUM(COALESCE(quantity,0)) AS total_qty,
        SUM(COALESCE(amount,0))   AS total_amount
      FROM purchase_orders
      WHERE document_number = ?
        AND item_name IS NOT NULL AND item_name != ''
    `, docNumber);

    res.json({ header, lines, totals });
  } catch (e) {
    console.error('Detail error:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Vendor Payments APIs
app.get('/api/vendor-payments', async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string || '').trim();
    const startDate = (req.query.startDate as string || '').trim();
    const endDate = (req.query.endDate as string || '').trim();
    const status = (req.query.status as string || '').trim();
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        MAX(internal_id) as internal_id, 
        MAX(transaction_date) as transaction_date, 
        MAX(entity_name) as entity_name, 
        document_number, 
        MAX(status) as status, 
        SUM(CASE WHEN item_name IS NOT NULL AND item_name != '' THEN quantity ELSE 0 END) as quantity, 
        SUM(CASE WHEN item_name IS NOT NULL AND item_name != '' THEN amount ELSE 0 END) as amount 
      FROM vendor_payments
      WHERE 1=1
    `;
    
    let countQuery = `SELECT COUNT(DISTINCT document_number) as total FROM vendor_payments WHERE 1=1`;
    const params: any[] = [];

    if (search) {
      const searchCondition = `
        AND (
          document_number LIKE ? 
          OR entity_name LIKE ? 
          OR item_name LIKE ?
          OR internal_id LIKE ?
        )
      `;
      query += searchCondition;
      countQuery += searchCondition;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    if (startDate) {
      const dateCondition = ` AND transaction_date >= ?`;
      query += dateCondition;
      countQuery += dateCondition;
      params.push(startDate);
    }

    if (endDate) {
      const dateCondition = ` AND transaction_date <= ?`;
      query += dateCondition;
      countQuery += dateCondition;
      params.push(endDate);
    }

    if (status) {
      const statusCondition = ` AND status = ?`;
      query += statusCondition;
      countQuery += statusCondition;
      params.push(status);
    }

    query += ` GROUP BY document_number ORDER BY MAX(transaction_date) DESC LIMIT ? OFFSET ?`;
    const queryParams = [...params, limit, offset];

    const totalResult = await db.get(countQuery, ...params) as { total: number };
    const rows = await db.all(query, ...queryParams);

    res.json({
      data: rows,
      meta: {
        total: totalResult.total,
        page,
        limit,
        totalPages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Vendor payments search error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/vendor-payments-statuses', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT DISTINCT status
      FROM vendor_payments
      WHERE status IS NOT NULL AND status != ''
      ORDER BY status ASC
    `) as { status: string }[];
    res.json({ statuses: rows.map(r => r.status) });
  } catch (e) {
    console.error('Vendor payment statuses error:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/vendor-payments/:docNumber', async (req, res) => {
  const docNumber = (req.params.docNumber || '').trim();
  if (!docNumber) {
    return res.status(400).json({ error: 'Missing document number' });
  }
  try {
    const db = await getDb();
    const headerRow = await db.get(`
      SELECT internal_id, transaction_date, entity_name, document_number, status, raw_data
      FROM vendor_payments
      WHERE document_number = ?
      ORDER BY rowid ASC
      LIMIT 1
    `, docNumber) as any;

    const rawHeader = (() => {
      try { return headerRow?.raw_data ? JSON.parse(headerRow.raw_data) : null; } catch { return null; }
    })();
    const location =
      rawHeader?.['Location'] ??
      rawHeader?.['location'] ??
      rawHeader?.['Location Name'] ??
      null;

    const header = headerRow
      ? {
          internal_id: headerRow.internal_id,
          transaction_date: headerRow.transaction_date,
          entity_name: headerRow.entity_name,
          document_number: headerRow.document_number,
          status: headerRow.status,
          location,
        }
      : null;

    if (!header) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const rows = await db.all(`
      SELECT item_name AS item, quantity, amount, raw_data
      FROM vendor_payments
      WHERE document_number = ? AND item_name IS NOT NULL AND item_name != ''
      ORDER BY rowid ASC
    `, docNumber) as any[];

    const parseNumber = (v: any): number => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      const s = String(v).replace(/[₱,\s]/g, '');
      const n = parseFloat(s);
      return isFinite(n) ? n : 0;
    };

    const lines = rows.map(r => {
      let raw: any = null;
      try { raw = r.raw_data ? JSON.parse(r.raw_data) : null; } catch { raw = null; }
      const item =
        r.item ??
        raw?.['Applied To'] ??
        raw?.['Applied To Transaction'] ??
        raw?.['Applied To Transact'] ??
        raw?.['Memo'] ??
        raw?.['Memo (Main)'] ??
        raw?.['Account'] ??
        raw?.['Account (Main)'] ??
        '';
      const rate = raw ? (raw['Item Rate'] ?? raw['Rate'] ?? null) : null;
      const discount = raw ? (raw['Discount'] ?? raw['Item Discount'] ?? null) : null;
      return {
        item,
        quantity: r.quantity,
        amount: parseNumber(r.amount),
        rate: parseNumber(rate),
        srp: 0,
        discount: discount ?? '',
      };
    });

    const totals = await db.get(`
      SELECT 
        SUM(COALESCE(quantity,0)) AS total_qty,
        SUM(COALESCE(amount,0))   AS total_amount
      FROM vendor_payments
      WHERE document_number = ? AND item_name IS NOT NULL AND item_name != ''
    `, docNumber);

    res.json({ header, lines, totals });
  } catch (e) {
    console.error('Vendor payment detail error:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve static files from the React app (in production)
// For dev, we run Vite separately.
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
  
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
