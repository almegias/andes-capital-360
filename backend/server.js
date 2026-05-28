import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchYahooData, calculate50DMA } from './lib/yahoo.js';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Database setup
const dbPath = path.join(__dirname, 'data', 'andes360.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    risk TEXT NOT NULL CHECK(risk IN ('Low', 'Medium', 'High')),
    jurisdiction TEXT DEFAULT 'Various',
    overall_score INTEGER DEFAULT 65,
    market_cap INTEGER,
    above_50dma INTEGER DEFAULT 0,
    current_price REAL,
    comment TEXT,
    pros TEXT,
    cons TEXT,
    last_updated TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS refresh_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT,
    status TEXT,
    message TEXT,
    refreshed_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Lightweight migration for existing databases (add new columns if missing)
try {
  const cols = db.prepare("PRAGMA table_info(companies)").all().map(c => c.name);
  if (!cols.includes('jurisdiction')) {
    db.exec("ALTER TABLE companies ADD COLUMN jurisdiction TEXT DEFAULT 'Various'");
  }
  if (!cols.includes('overall_score')) {
    db.exec("ALTER TABLE companies ADD COLUMN overall_score INTEGER DEFAULT 65");
  }
} catch (e) {
  console.warn('Migration check failed:', e.message);
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve the beautiful frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ===== API ROUTES =====

// GET all companies — Alphabetical order by name (user request)
app.get('/api/companies', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, name, ticker, type, category, risk, jurisdiction, overall_score,
             market_cap, above_50dma, current_price, 
             comment, pros, cons, last_updated
      FROM companies 
      ORDER BY name ASC
    `);
    const companies = stmt.all().map(c => ({
      ...c,
      above_50dma: !!c.above_50dma,
      market_cap: c.market_cap || 0,
      overall_score: c.overall_score || 65
    }));
    res.json(companies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET single company
app.get('/api/companies/:id', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Not found' });
  company.above_50dma = !!company.above_50dma;
  res.json(company);
});

// POST - Add new company (from the form) — now includes jurisdiction + overall_score
app.post('/api/companies', (req, res) => {
  const { name, ticker, type, category, risk, jurisdiction, overall_score, comment, pros, cons } = req.body;

  if (!name || !ticker || !type || !category || !risk) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const upperTicker = ticker.toUpperCase().trim();

  try {
    const stmt = db.prepare(`
      INSERT INTO companies 
      (name, ticker, type, category, risk, jurisdiction, overall_score, comment, pros, cons, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      name.trim(),
      upperTicker,
      type,
      category,
      risk,
      jurisdiction || 'Various',
      overall_score || 65,
      comment || '',
      pros || '',
      cons || '',
      new Date().toISOString()
    );

    const newCompany = db.prepare('SELECT * FROM companies WHERE id = ?').get(info.lastInsertRowid);
    newCompany.above_50dma = !!newCompany.above_50dma;
    res.status(201).json(newCompany);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ticker already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to add company' });
  }
});

// PUT - Update company (now supports jurisdiction + score)
app.put('/api/companies/:id', (req, res) => {
  const id = req.params.id;
  const { name, type, category, risk, jurisdiction, overall_score, comment, pros, cons } = req.body;

  try {
    const stmt = db.prepare(`
      UPDATE companies 
      SET name = COALESCE(?, name),
          type = COALESCE(?, type),
          category = COALESCE(?, category),
          risk = COALESCE(?, risk),
          jurisdiction = COALESCE(?, jurisdiction),
          overall_score = COALESCE(?, overall_score),
          comment = COALESCE(?, comment),
          pros = COALESCE(?, pros),
          cons = COALESCE(?, cons),
          last_updated = ?
      WHERE id = ?
    `);
    stmt.run(name, type, category, risk, jurisdiction, overall_score, comment, pros, cons, new Date().toISOString(), id);
    const updated = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    updated.above_50dma = !!updated.above_50dma;
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE company
app.delete('/api/companies/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ===== LIVE DATA REFRESH (Yahoo Finance) =====
app.post('/api/refresh/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  
  try {
    const data = await fetchYahooData(ticker);
    if (!data) {
      return res.status(404).json({ error: 'Could not fetch data for ticker' });
    }

    const { price, marketCap, above50DMA, lastClose } = data;

    const stmt = db.prepare(`
      UPDATE companies 
      SET current_price = ?, 
          market_cap = ?, 
          above_50dma = ?, 
          last_updated = ?
      WHERE ticker = ?
    `);
    const result = stmt.run(lastClose, marketCap, above50DMA ? 1 : 0, new Date().toISOString(), ticker);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Ticker not in database' });
    }

    // Log refresh
    db.prepare('INSERT INTO refresh_log (ticker, status, message) VALUES (?, ?, ?)').run(
      ticker, 'success', `Price: ${lastClose}, MktCap: ${marketCap}`
    );

    const updated = db.prepare('SELECT * FROM companies WHERE ticker = ?').get(ticker);
    updated.above_50dma = !!updated.above_50dma;
    res.json(updated);

  } catch (err) {
    console.error('Refresh error for', ticker, err.message);
    db.prepare('INSERT INTO refresh_log (ticker, status, message) VALUES (?, ?, ?)').run(
      ticker, 'error', err.message
    );
    res.status(500).json({ error: 'Refresh failed', details: err.message });
  }
});

// Batch refresh (used by "Refresh All" button)
app.post('/api/refresh', async (req, res) => {
  const { tickers } = req.body; // optional array, otherwise all
  let targetTickers = tickers;

  if (!targetTickers) {
    targetTickers = db.prepare('SELECT ticker FROM companies').all().map(r => r.ticker);
  }

  const results = [];
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < targetTickers.length; i++) {
    const ticker = targetTickers[i];
    try {
      const data = await fetchYahooData(ticker);
      if (data) {
        const stmt = db.prepare(`
          UPDATE companies 
          SET current_price = ?, market_cap = ?, above_50dma = ?, last_updated = ?
          WHERE ticker = ?
        `);
        stmt.run(data.lastClose, data.marketCap, data.above50DMA ? 1 : 0, new Date().toISOString(), ticker);
        results.push({ ticker, success: true, ...data });
      } else {
        results.push({ ticker, success: false, error: 'No data' });
      }
    } catch (e) {
      results.push({ ticker, success: false, error: e.message });
    }
    // Be nice to Yahoo free endpoint
    if (i < targetTickers.length - 1) await delay(650);
  }

  res.json({ 
    updated: results.filter(r => r.success).length, 
    total: targetTickers.length,
    results 
  });
});

// Get refresh status / logs
app.get('/api/refresh/logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM refresh_log ORDER BY refreshed_at DESC LIMIT 30').all();
  res.json(logs);
});

// ===== EXPORT TO EXCEL =====
app.get('/api/export/excel', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT name, ticker, type, category, risk, jurisdiction, overall_score,
             market_cap, current_price, 
             CASE WHEN above_50dma = 1 THEN 'Above' ELSE 'Below' END as fifty_day_ma,
             comment, pros, cons, last_updated
      FROM companies 
      ORDER BY name ASC
    `).all();

    // Prepare nice data for Excel
    const excelData = rows.map(r => ({
      'Company': r.name,
      'US Ticker': r.ticker,
      'Type': r.type,
      'Category': r.category,
      'Risk': r.risk,
      'Jurisdiction': r.jurisdiction,
      'Score (1-100)': r.overall_score,
      'Market Cap (USD)': r.market_cap,
      'Current Price (USD)': r.current_price,
      '50-Day MA': r.fifty_day_ma,
      'Thesis / Comment': r.comment,
      'Pros': r.pros,
      'Cons': r.cons,
      'Last Updated': r.last_updated
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Auto column widths
    const colWidths = [
      { wch: 32 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
      { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
      { wch: 55 }, { wch: 45 }, { wch: 40 }, { wch: 20 }
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Andes 360 Universe');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="andes360-smallcap-universe-${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Excel export failed' });
  }
});

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Fallback to index.html for SPA-like behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Andes 360 Capital backend running on http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/companies`);
});