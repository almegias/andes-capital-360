// netlify/functions/refresh-prices.js
// Simple function to fetch live price + 50-day MA from Yahoo Finance

const fetch = require('node-fetch');

exports.handler = async (event) => {
  const ticker = event.queryStringParameters.ticker;

  if (!ticker) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Ticker parameter is required' }),
    };
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=4mo`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AndesCapital360/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance request failed with status ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error('No chart data returned');
    }

    const closes = result.indicators?.quote?.[0]?.close?.filter((c) => c !== null) || [];
    const price = closes[closes.length - 1];

    // Calculate simple 50-day SMA
    let sma50 = null;
    if (closes.length >= 50) {
      const slice = closes.slice(-50);
      sma50 = slice.reduce((sum, val) => sum + val, 0) / 50;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ticker: ticker.toUpperCase(),
        price: price ?? null,
        above_50dma: sma50 ? price > sma50 : null,
        sma50: sma50 ? Number(sma50.toFixed(2)) : null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};