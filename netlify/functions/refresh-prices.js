// netlify/functions/refresh-prices.js
// Fetches live price + 50-day MA from Yahoo Finance (with smart fallbacks for junior miners)
// Many Canadian juniors + OTC names require .V / .TO suffixes or have sparse data.
// We never return 500 for "no data" cases — only real network/server errors.

const YAHOO_ALIASES = {
  'BYN':     ['BYN.V', 'BYN.TO'],
  'BCMDF':   ['BCM.V', 'BCM.TO'],
  'CXBMF':   ['CXB.TO', 'EQX.TO'], // Calibre was acquired by Equinox
  'DOLLF':   ['DV.V', 'DOLLF', 'DV'],
  'EGPFF':   ['EGP.V'],
  'FMLMF':   ['FML.V'],
  'FCUUF':   ['FCU.TO', 'FCU.V'],
  'MNRMF':   ['MNR.V', 'MNRMF'],
  'NGD':     ['NGD.TO', 'NGD'], // New Gold acquired / delisted from NYSE in 2025
  'NIGHT':   ['NHT.V', 'NIGHT.V'],
  'OCGCF':   ['OCG.V'],
  'PEXPF':   ['PEX.V'],
  'PRMNF':   ['PRM.V', 'PRM.TO'],
  'RMRMF':   ['RMR.V'],
  'SGSVF':   ['SGS.V', 'SAB.V'],
  'SAND':    ['SAND', 'SSL.TO'],
  'VZLAF':   ['VZLA.V', 'VZLA.TO'],
  'WAMLF':   ['WAML.V'],
  'XAMMF':   ['XAM.V'],
  'YORKF':   ['YORK.V'],
  'ZACAF':   ['ZAC.V'],
  'MAG':     ['MAG', 'MAG.TO'],
};

async function fetchYahoo(ticker, range = '3mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AndesCapital360/1.0)' },
  });
  if (!res.ok) return null;

  const json = await res.json();
  if (json?.chart?.error) return null;

  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const closes = result.indicators?.quote?.[0]?.close?.filter((c) => c != null) || [];
  if (closes.length === 0) return null;

  const price = closes[closes.length - 1];

  let sma50 = null;
  if (closes.length >= 50) {
    sma50 = closes.slice(-50).reduce((sum, v) => sum + v, 0) / 50;
  } else if (closes.length >= 5) {
    // fallback: use available history as "pseudo-SMA"
    sma50 = closes.reduce((sum, v) => sum + v, 0) / closes.length;
  }

  const meta = result.meta || {};

  return {
    price: Number(price.toFixed(4)),
    above_50dma: sma50 != null ? (price > sma50) : null,
    sma50: sma50 != null ? Number(sma50.toFixed(2)) : null,
    name: meta.shortName || meta.longName || null,
  };
}

async function fetchMarketCap(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AndesCapital360/1.0)' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const quote = json?.quoteResponse?.result?.[0];
    return quote?.marketCap ?? null;
  } catch (e) {
    return null;
  }
}

async function fetchCompanyInfo(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AndesCapital360/1.0)' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const quote = json?.quoteResponse?.result?.[0];
    if (!quote) return null;

    return {
      marketCap: quote.marketCap ?? null,
      shortName: quote.shortName || quote.longName || null,
      longBusinessSummary: quote.longBusinessSummary || null
    };
  } catch (e) {
    return null;
  }
}

exports.handler = async (event) => {
  const raw = (event.queryStringParameters?.ticker || '').trim().toUpperCase();
  if (!raw) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ticker parameter is required' }) };
  }

  const candidates = [raw, ...(YAHOO_ALIASES[raw] || [])];
  const tried = new Set();

  for (const sym of candidates) {
    if (tried.has(sym)) continue;
    tried.add(sym);

    try {
      // Try 3mo first (good balance), then shorter windows for illiquid names
      let data = await fetchYahoo(sym, '3mo')
               || await fetchYahoo(sym, '1mo')
               || await fetchYahoo(sym, '6mo');

      if (data && data.price != null) {
        const info = await fetchCompanyInfo(sym);
        const shortDescription = info?.longBusinessSummary 
          ? info.longBusinessSummary.substring(0, 280) + '...' 
          : null;

        return {
          statusCode: 200,
          body: JSON.stringify({
            ticker: raw,
            ...data,
            market_cap: info?.marketCap || null,
            name: info?.shortName || data.name || null,
            description: shortDescription,
            yahoo_symbol: sym,
          }),
        };
      }
    } catch (e) {
      // ignore individual failures, try next alias
    }
  }

  // All attempts exhausted — graceful response (critical for UX)
  return {
    statusCode: 200,
    body: JSON.stringify({
      ticker: raw,
      price: null,
      above_50dma: null,
      sma50: null,
      error: 'no_data',
      message: 'No recent trading data on Yahoo (very common for micro-cap juniors, OTC names, or companies that were acquired/delisted)',
    }),
  };
};