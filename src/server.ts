import express from 'express';
import cors from 'cors';
import path from 'path';
import { getDb } from './db';

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
      SELECT internal_id, transaction_date, entity_name, document_number, 
             status, item_name, quantity, amount 
      FROM purchase_orders
      WHERE 1=1
    `;
    
    let countQuery = `SELECT COUNT(*) as total FROM purchase_orders WHERE 1=1`;
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

    // Order by date desc
    query += ` ORDER BY transaction_date DESC LIMIT ? OFFSET ?`;
    
    // For main query, we need limit/offset params
    const queryParams = [...params, limit, offset];

    const totalResult = await db.get(countQuery, params) as { total: number };
    const rows = await db.all(query, queryParams);

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
    const header = await db.get(`
      SELECT internal_id, transaction_date, entity_name, document_number, status
      FROM purchase_orders
      WHERE document_number = ?
      ORDER BY transaction_date DESC
      LIMIT 1
    `, docNumber);

    if (!header) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const lines = await db.all(`
      SELECT item_name AS item, quantity, amount
      FROM purchase_orders
      WHERE document_number = ? AND item_name IS NOT NULL AND item_name != ''
      ORDER BY rowid ASC
    `, docNumber);

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

// Serve static files from the React app (in production)
// For dev, we run Vite separately.
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
