/**
 * CLI refresh script
 * Usage: cd backend && npm run refresh
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchYahooData } from '../backend/lib/yahoo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'backend', 'data', 'andes360.db');
const db = new Database(dbPath);

async function main() {
  const tickers = db.prepare('SELECT ticker FROM companies').all().map(r => r.ticker);
  console.log(`Refreshing ${tickers.length} companies via Yahoo Finance...\n`);

  let success = 0;
  const delay = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    process.stdout.write(`  ${t} ... `);
    try {
      const data = await fetchYahooData(t);
      if (data) {
        db.prepare(`
          UPDATE companies 
          SET current_price = ?, market_cap = ?, above_50dma = ?, last_updated = ?
          WHERE ticker = ?
        `).run(data.lastClose, data.marketCap, data.above50DMA ? 1 : 0, new Date().toISOString(), t);
        console.log(`OK ($${data.lastClose.toFixed(2)} | ${data.above50DMA ? 'Above' : 'Below'} 50DMA)`);
        success++;
      } else {
        console.log('NO DATA');
      }
    } catch (e) {
      console.log('ERROR', e.message);
    }
    if (i < tickers.length - 1) await delay(620);
  }

  console.log(`\n✅ Done. ${success}/${tickers.length} updated.`);
  db.close();
}

main().catch(console.error);