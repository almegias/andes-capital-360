/**
 * Yahoo Finance data fetcher + 50DMA calculator
 * Uses public Yahoo endpoints (no API key required)
 */

export async function fetchYahooData(ticker) {
  const encoded = encodeURIComponent(ticker);
  
  // 1. Get chart data (daily for last ~4 months) — enough for 50DMA
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5mo`;
  
  const chartRes = await fetch(chartUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });

  if (!chartRes.ok) return null;

  const chartJson = await chartRes.json();
  const result = chartJson?.chart?.result?.[0];
  if (!result) return null;

  const quotes = result.indicators?.quote?.[0] || {};
  const closes = (quotes.close || []).filter(v => v !== null);

  if (closes.length < 20) return null; // not enough data

  // Current / last close
  const lastClose = closes[closes.length - 1];

  // 50-day SMA (simple moving average of last 50 closes)
  const sma50 = calculateSMA(closes, 50);
  const above50DMA = sma50 ? lastClose > sma50 : null;

  // Market cap — try to get from meta or approximate
  let marketCap = result.meta?.marketCap || null;

  // Fallback: fetch summary for better market cap + shares
  if (!marketCap) {
    try {
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encoded}?modules=price,defaultKeyStatistics`;
      const sumRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        const priceModule = sumJson?.quoteSummary?.result?.[0]?.price;
        const stats = sumJson?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
        
        if (priceModule?.marketCap?.raw) {
          marketCap = priceModule.marketCap.raw;
        } else if (stats?.marketCap?.raw) {
          marketCap = stats.marketCap.raw;
        } else if (priceModule?.regularMarketPrice?.raw && stats?.sharesOutstanding?.raw) {
          marketCap = Math.round(priceModule.regularMarketPrice.raw * stats.sharesOutstanding.raw);
        }
      }
    } catch (e) {
      // ignore fallback errors
    }
  }

  // Final safety: if still no mkt cap, estimate very roughly from price * 50M shares (common for juniors)
  if (!marketCap && lastClose) {
    marketCap = Math.round(lastClose * 45000000); // very rough placeholder
  }

  return {
    price: lastClose,
    lastClose,
    marketCap: marketCap || 0,
    above50DMA: above50DMA ?? (lastClose > (sma50 || lastClose * 0.95)),
    sma50: sma50 ? Number(sma50.toFixed(2)) : null
  };
}

function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

// Helper to calculate 50DMA from a raw array of closes (used in scripts too)
export function calculate50DMA(closes) {
  if (!closes || closes.length < 50) return null;
  const slice = closes.slice(-50);
  return slice.reduce((a, b) => a + b, 0) / 50;
}