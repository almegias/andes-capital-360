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

// Cached crumb/cookies for Yahoo v7 quote (which now often requires it to avoid "Unauthorized")
let cachedYahooCrumb = null;
let cachedYahooCookies = '';

async function getYahooCrumb() {
  if (cachedYahooCrumb) return { crumb: cachedYahooCrumb, cookies: cachedYahooCookies };
  try {
    // Use very realistic browser headers so Yahoo serves the full page HTML containing the crumb (anti-bot is strict)
    const pageUrl = 'https://finance.yahoo.com/quote/NVDA/';
    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    const html = await pageRes.text();
    // Try several common patterns for the crumb (page structure changes)
    let match = html.match(/"crumb"\s*:\s*"([^"]+)"/);
    if (!match) match = html.match(/CrumbStore[^}]*"crumb"\s*:\s*"([^"]+)"/);
    if (!match) match = html.match(/crumb["']?\s*[:=]\s*["']([^"']+)["']/i);
    if (match) cachedYahooCrumb = match[1];
    const setCookie = pageRes.headers.get('set-cookie');
    if (setCookie) {
      cachedYahooCookies = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    }
    return { crumb: cachedYahooCrumb, cookies: cachedYahooCookies };
  } catch (e) {
    return { crumb: null, cookies: '' };
  }
}

async function fetchYahooQuote(ticker) {
  // Try direct first (works for some), fallback to crumb+cookie if Unauthorized
  try {
    let url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`;
    let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };
    let res = await fetch(url, { headers });
    let json = null;
    if (res.ok) {
      json = await res.json();
    }
    const hasError = json?.quoteResponse?.error || json?.finance?.error;
    if (!res.ok || hasError) {
      // Get crumb and retry
      const { crumb, cookies } = await getYahooCrumb();
      if (crumb) {
        url += `&crumb=${encodeURIComponent(crumb)}`;
        if (cookies) headers['Cookie'] = cookies;
        res = await fetch(url, { headers });
        if (res.ok) {
          json = await res.json();
        }
      }
    }
    if (!json || json?.quoteResponse?.error || json?.finance?.error) return null;
    return json?.quoteResponse?.result?.[0] || null;
  } catch (e) {
    return null;
  }
}

async function fetchYahoo(ticker, range = '3mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
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
    const quote = await fetchYahooQuote(ticker);
    if (!quote) return null;

    let marketCap = quote.marketCap ?? null;

    // Fallback calculation if marketCap is missing but we have shares and price
    if (!marketCap && quote.sharesOutstanding && quote.regularMarketPrice) {
      marketCap = Math.round(quote.sharesOutstanding * quote.regularMarketPrice);
    }

    return marketCap;
  } catch (e) {
    return null;
  }
}

async function fetchCompanyInfo(ticker) {
  try {
    const quote = await fetchYahooQuote(ticker);
    if (!quote) return null;

    return {
      marketCap: quote.marketCap ?? null,
      shortName: quote.shortName || quote.longName || null,
      longBusinessSummary: quote.longBusinessSummary || null,
      beta: quote.beta ?? null,
      // Note: Yahoo rarely returns reliable insider ownership via this free endpoint
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
        // Get the best possible market cap
        let marketCap = await fetchMarketCap(sym);

        const info = await fetchCompanyInfo(sym);
        if (!marketCap && info?.marketCap) {
          marketCap = info.marketCap;
        }

        // Final fallback using sharesOutstanding from the quote (via crumb-aware helper)
        if (!marketCap && info) {
          try {
            const q = await fetchYahooQuote(sym);
            if (q?.sharesOutstanding && q?.regularMarketPrice) {
              marketCap = Math.round(q.sharesOutstanding * q.regularMarketPrice);
            }
          } catch (e) {}
        }

        const shortDescription = info?.longBusinessSummary 
          ? info.longBusinessSummary.substring(0, 280) + '...' 
          : null;

        return {
          statusCode: 200,
          body: JSON.stringify({
            ticker: raw,
            ...data,
            market_cap: marketCap,
            name: info?.shortName || data.name || null,
            description: shortDescription,
            yahoo_symbol: sym,
            beta: info?.beta ?? null,
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