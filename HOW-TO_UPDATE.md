# HOW TO UPDATE ANDES CAPITAL 360

This document contains the most common tasks for maintaining the Andes Capital 360 site.

## 1. Run the site locally (for testing changes)

```bash
cd ~/andes360-capital
netlify dev
```

Then open http://localhost:8888

Use Cmd + Shift + R (hard refresh) after code changes.

## 2. Refresh live prices (the most important maintenance task)

1. Go to the live site (https://www.andescapital360.com or your Netlify URL).
2. Click the **"Refresh Prices"** button in the top navigation.
3. Confirm the dialog.
4. Wait 30–60 seconds. The button will show progress.
5. When finished it will say something like "Done (78 live prices, 18 no Yahoo data) — saved to database".

**Important:** This now saves the fresh prices directly into Supabase. All future visitors will see the updated prices instead of old seeded values.

- Some very illiquid junior miners will still show cached/old prices (this is normal and noted on the page).
- You should run this roughly once a week or when markets move significantly.

## 3. Update or add companies (the list)

### Preferred method (recommended)

1. Edit `companies.csv` in the project folder (use Excel, Numbers, or a text editor).
   - Keep the exact column headers.
   - Sort alphabetically by name if adding many.
   - Remove any duplicates.

2. In Supabase:
   - Go to Table Editor → companies
   - Click the three dots → **Truncate** (this clears the table safely).
   - Or run this SQL first if you want to be careful:
     ```sql
     TRUNCATE companies RESTART IDENTITY CASCADE;
     ```

3. Import the CSV:
   - In Supabase Table Editor, click **Insert** → **Import data from CSV**.
   - Upload your updated `companies.csv`.
   - Map columns if needed and import.

4. Push the CSV change to GitHub so it is versioned:
   ```bash
   git add companies.csv
   git commit -m "Update company list"
   git push
   ```

## 4. Deploy changes to the live site

After any edit to `index.html`, the Netlify function, `netlify.toml`, or `companies.csv`:

```bash
cd ~/andes360-capital

# Stage everything
git add .

# Commit with a clear message
git commit -m "Update prices / fix refresh / add new company"

# Push to GitHub (Netlify will automatically redeploy)
git push
```

Netlify usually deploys in 1–2 minutes. Hard refresh the live site afterwards.

## 5. Common Supabase SQL commands

```sql
-- See current number of companies
SELECT COUNT(*) FROM companies;

-- Delete specific acquired or problematic companies
DELETE FROM companies WHERE ticker IN ('CXBMF', 'NGD');

-- View companies that have never had a price refreshed
SELECT ticker, name, current_price FROM companies WHERE current_price IS NULL OR current_price = 0;

-- Quick check of recently updated prices
SELECT ticker, name, current_price, above_50dma FROM companies ORDER BY updated_at DESC NULLS LAST LIMIT 20;
```

## 6. If the Refresh Prices button does not work on the live site (www.andescapital360.com)

This usually happens for one of these reasons:

1. **Old cached version** — Hard refresh (Cmd + Shift + R) or open in Incognito/Private window.
2. **Deployment not finished** — After `git push`, wait 2 minutes and check the Deploy log in Netlify.
3. **www vs non-www** — Make sure both versions are added in Netlify (Domain settings) and your DNS (Porkbun) points correctly.
4. **Function not deployed** — The `netlify/functions/refresh-prices.js` file must be in the repo you connected to Netlify.

**Temporary workaround while fixing:**
- Run `netlify dev` locally.
- Use the Refresh button on `http://localhost:8888` (it will save prices to Supabase).
- The live site will then show the new prices.

## 7. Custom domain (andescapital360.com)

- In Netlify: Site settings → Domain management → Add custom domain.
- Add both `andescapital360.com` and `www.andescapital360.com`.
- In Porkbun: Create CNAME record for `www` pointing to your Netlify site (e.g. `your-site.netlify.app`).
- For the apex (root) domain, use ALIAS/ANAME if available, or Cloudflare for easier proxying.

## 8. Other useful local commands

```bash
# See what files have changed
git status

# Undo last commit (keep changes)
git reset --soft HEAD~1

# View recent deploys (after pushing)
# Check the "Deploys" tab in Netlify dashboard
```

---

**Pro tip:** Always hard refresh (Cmd/Ctrl + Shift + R) after deploying or when testing the Refresh Prices button.

## 9. Remaining Features to Make the Site Fully Functional (Prioritized)

- **Watchlist on Stocks & Crypto pages** (High priority)
- **Working "Add Company / Add Token" with premium detailed thesis** (High priority)
- **Proprietary Scoring Algorithm** (to generate the 1-10 scores) — to be developed in parallel with Watchlist
- Improved mobile experience
- Better error handling and loading states on refresh

The Algorithm feature will determine how the Score column is calculated across all pages.

## 9. New Multi-Page Structure (April 2026 update)

The site now has a proper homepage + three sections:

- `index.html`          → Welcome / Landing page (new homepage)
- `mining.html`         → Full Junior Miners table (your previous heavy table)
- `stocks.html`         → Other Stocks (TSLA, BMNR, NVDA, IREN, RIOT)
- `crypto.html`         → Crypto (BTC, ETH, SOL, FARTCOIN, USELESS)

### How to set this up correctly

1. Your old full mining table code should live in `mining.html`.
2. The landing page (`index.html`) already links to `mining.html`, `stocks.html`, and `crypto.html`.
3. On the live site, the homepage is now the beautiful welcome page with the Andes + vineyard hero.

**Important:** Download the hero image generated for you and save it as `hero-andes.jpg` in the project root folder.

### Updating any of the three sections

- Mining companies → edit `mining.html`
- Other Stocks → edit `stocks.html`
- Crypto → edit `crypto.html`

After edits:

```bash
git add .
git commit -m "Update mining / stocks / crypto page"
git push
```

---

Last updated: April 2026
