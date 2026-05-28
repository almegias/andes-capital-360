# Phase 2 Checklist – Seeding Data + Adding Live Prices
# Follow these steps in order after completing the first 4 steps.

---

## Step 5: Seed Your 100 Companies into Supabase

**Goal:** Move your company data from being hardcoded in the website to being stored in Supabase.

### Option A: Easiest for Beginners (Recommended)

1. Open your Supabase project.
2. Go to **Table Editor** → Click on the `companies` table.
3. Click the **Insert** button (top right) → **Import data from CSV**.
4. I can generate a CSV file for you with all 100 companies.

   **Reply with:** "Please generate the CSV for the 100 companies"

   Once I give it to you:
   - Copy the content into a new file on your computer called `companies.csv`
   - Make sure it ends with `.csv`
   - Upload that file in the Supabase import screen.

### Option B: Using the SQL Editor (Faster if you prefer)

Reply with "Please generate the SQL insert statements" and I will give you a big block of SQL you can paste directly into the SQL Editor.

---

## Step 6: Add the Live Price Refresh Function

### 6.1 Make sure the function file exists

Run this command in Terminal to create the folder and file if they don’t exist yet:

```bash
cd /Users/alainmegias/andes360-capital
mkdir -p netlify/functions
```

### 6.2 Create or update the function file

Create a new file at this exact location:

`/Users/alainmegias/andes360-capital/netlify/functions/refresh-prices.js`

Paste the following code into it and save:

```js
// netlify/functions/refresh-prices.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const ticker = event.queryStringParameters.ticker;

  if (!ticker) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Ticker is required' }),
    };
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=4mo`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const data = await response.json();
    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(c => c !== null);
    const price = closes[closes.length - 1];

    let sma50 = null;
    if (closes.length >= 50) {
      const slice = closes.slice(-50);
      sma50 = slice.reduce((a, b) => a + b, 0) / 50;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ticker: ticker.toUpperCase(),
        price,
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
```

### 6.3 Update your index.html to use the live function

Open your `index.html` and find this function:

```js
function refreshAllPrices() {
    alert('Live price refresh will use a Netlify Function (to be added).');
}
```

Replace it with this improved version:

```js
async function refreshAllPrices() {
    if (!confirm('Fetch live prices for all companies? This may take 30–60 seconds.')) return;

    const btnText = document.getElementById('refresh-btn-text');
    const icon = document.getElementById('refresh-icon');
    const allButtons = document.querySelectorAll('button');

    allButtons.forEach(btn => btn.disabled = true);
    if (icon) icon.classList.add('animate-spin');

    const originalText = btnText.textContent;
    btnText.textContent = 'Refreshing...';

    const total = companies.length;
    let successCount = 0;

    for (let i = 0; i < total; i++) {
        const company = companies[i];
        if (!company.ticker) continue;

        try {
            const response = await fetch(`/.netlify/functions/refresh-prices?ticker=${company.ticker}`);
            if (response.ok) {
                const data = await response.json();
                if (data.price !== undefined) {
                    company.current_price = data.price;
                    company.above_50dma = data.above_50dma;
                    successCount++;
                }
            }
        } catch (e) {
            console.warn('Failed to refresh:', company.ticker);
        }

        // Update progress text every 10 companies
        if ((i + 1) % 10 === 0 || i === total - 1) {
            btnText.textContent = `Refreshing ${i + 1}/${total}`;
        }

        // Small delay to avoid rate limits
        if ((i + 1) % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    renderTable(companies);
    updateStats();

    btnText.textContent = `Done (${successCount} updated)`;
    if (icon) icon.classList.remove('animate-spin');

    await new Promise(resolve => setTimeout(resolve, 1500));
    btnText.textContent = originalText;
    allButtons.forEach(btn => btn.disabled = false);
}
```

---

## Step 7: Test Locally with `netlify dev`

### 7.1 Install Netlify CLI (one time only)

Open Terminal and run:

```bash
npm install -g netlify-cli
```

### 7.2 Run the site locally with functions

In the project folder, run:

```bash
cd /Users/alainmegias/andes360-capital
netlify dev
```

This will start your site at `http://localhost:8888` (or similar) **and** run your functions locally.

Open that address in your browser and test the **Refresh Prices** button.

---

## Step 8: Push Everything and Deploy

Run these commands:

```bash
cd /Users/alainmegias/andes360-capital
git add .
git commit -m "Add Supabase integration + Netlify price refresh function"
git push
```

Go to Netlify → Your site → Deploys tab. You should see the new deployment in progress.

Once it finishes, test the live site (especially the Refresh Prices button).

---

**Next Phase After This (Optional but recommended later):**

- Add proper user authentication (so each person has their own persistent watchlist)
- Add Stripe for real Premium features
- Create an admin page to manage companies easily

---

Would you like me to give you the **exact commands and checklist for the phase after this** (authentication + payments)? Or do you want help with any specific step above right now?