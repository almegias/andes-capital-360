# Andes Capital 360 – Next Steps (Beginner-Friendly Checklist)

This document gives you the exact next 4 steps to move your project forward with Supabase and GitHub.

Follow them **in order**. Do not skip ahead.

---

## Step 1: Create the Supabase Tables

This creates the two tables we need: `companies` and `watchlists`.

### What to do:

1. Go to your Supabase project:  
   https://supabase.com/dashboard/project/vlvpksaearjobaqppeiu

2. In the left sidebar, click **SQL Editor**.

3. Click **New query**.

4. Copy and paste the entire block below into the editor:

```sql
-- 1. Companies table
create table if not exists public.companies (
    id bigint generated always as identity primary key,
    name text not null,
    ticker text not null unique,
    type text,
    category text,
    risk text,
    jurisdiction text,
    overall_score integer,
    market_cap bigint,
    above_50dma boolean,
    current_price numeric,
    comment text,
    pros text,
    cons text,
    created_at timestamptz default now()
);

-- 2. Watchlists table
create table if not exists public.watchlists (
    id bigint generated always as identity primary key,
    user_id text not null,
    company_id bigint not null references public.companies(id) on delete cascade,
    created_at timestamptz default now(),
    unique (user_id, company_id)
);

-- Enable Row Level Security
alter table public.companies enable row level security;
alter table public.watchlists enable row level security;

-- Basic policies (safe for now)
create policy "Allow public read access to companies"
on public.companies for select using (true);

create policy "Allow public insert to companies"
on public.companies for insert with check (true);

create policy "Allow public read access to watchlists"
on public.watchlists for select using (true);

create policy "Allow users to manage their own watchlist"
on public.watchlists for all using (true);
```

5. Click the **Run** button (top right).

6. You should see a green "Success" message.

**Verification:**
- Go to the left sidebar → **Table Editor**
- You should now see two tables: `companies` and `watchlists`

---

## Step 2: Update Your index.html with Supabase Logic

This replaces the old hardcoded JavaScript with clean code that talks to Supabase.

### What to do:

1. Open the file in your editor:
   ```
   /Users/alainmegias/andes360-capital/index.html
   ```

2. Scroll all the way to the bottom.

3. Find the big `<script>` tag (it starts with `<script>` and ends with `</script>`).

4. **Delete everything** from `<script>` to `</script>` (do not delete the HTML before or after it).

5. Paste the entire clean script below in its place:

```html
<script>
    // ==================== SUPABASE CONFIG ====================
    const SUPABASE_URL = 'https://vlvpksaearjobaqppeiu.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_9hiVf1uRz_CkTEcgVKeLQg_74By8nsH';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // ==================== STATE ====================
    let companies = [];
    let watchlist = [];

    // ==================== HELPERS ====================
    function getUserId() {
        let id = localStorage.getItem('andes_user_id');
        if (!id) {
            id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
            localStorage.setItem('andes_user_id', id);
        }
        return id;
    }

    function formatMarketCap(value) {
        if (!value) return '—';
        if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
        return '$' + (value / 1e6).toFixed(0) + 'M';
    }

    // ==================== DATA LOADING ====================
    async function loadCompaniesFromSupabase() {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            companies = data || [];
        } catch (err) {
            console.error('Failed to load from Supabase:', err);
            companies = [];
        }
    }

    async function loadWatchlistFromSupabase() {
        const userId = getUserId();
        try {
            const { data, error } = await supabase
                .from('watchlists')
                .select('company_id')
                .eq('user_id', userId);

            if (error) throw error;
            watchlist = data ? data.map(item => item.company_id) : [];
        } catch (err) {
            console.warn('Could not load watchlist from Supabase');
            watchlist = JSON.parse(localStorage.getItem('andes360_watchlist') || '[]');
        }
    }

    // ==================== RENDERING ====================
    function updateStats() {
        const totalEl = document.getElementById('stat-total');
        const dmaEl = document.getElementById('stat-dma');
        if (totalEl) totalEl.textContent = companies.length;

        const above = companies.filter(c => c.above_50dma).length;
        if (dmaEl) dmaEl.innerHTML = `${above}<span class="text-xl text-zinc-400">/${companies.length}</span>`;
    }

    function renderTable(data) {
        const tbody = document.getElementById('table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const countEl = document.getElementById('visible-count');
        if (countEl) countEl.textContent = data.length;

        data.forEach(c => {
            const isWatched = watchlist.includes(c.id);
            const riskClass = c.risk === 'Low' ? 'risk-low' : c.risk === 'Medium' ? 'risk-medium' : 'risk-high';
            const dmaClass = c.above_50dma ? 'dma-above' : 'dma-below';
            const dmaText = c.above_50dma ? 'Above' : 'Below';
            const typeClass = `type-${(c.type || '').toLowerCase().replace(' ', '')}`;
            const juris = c.jurisdiction || 'Various';
            const score = c.overall_score || 65;

            const row = document.createElement('tr');
            row.className = 'company-row text-sm';
            row.innerHTML = `
                <td class="pl-4 py-2.5">
                    <button onclick="toggleWatchlist(${c.id}, event)" class="watch-star text-lg ${isWatched ? 'text-amber-400' : 'text-slate-600'}">
                        <i class="fa-solid fa-star"></i>
                    </button>
                </td>
                <td class="font-medium py-2.5 pr-2">${c.name}</td>
                <td class="py-2.5"><span class="font-mono text-xs bg-zinc-800 px-2 py-px rounded">${c.ticker}</span></td>
                <td class="py-2.5"><span class="data-badge px-2 py-px rounded-2xl ${typeClass}">${c.type}</span></td>
                <td class="py-2.5 text-zinc-300">${c.category}</td>
                <td class="py-2.5 text-center"><span class="data-badge px-2 py-px rounded-2xl ${riskClass}">${c.risk}</span></td>
                <td class="py-2.5 text-center"><span class="px-2 py-px text-[10px] rounded-xl bg-zinc-800 text-zinc-300">${juris}</span></td>
                <td class="py-2.5 text-center"><span class="data-badge px-2 py-px rounded-2xl font-semibold bg-emerald-900 text-emerald-300">${score}</span></td>
                <td class="py-2.5 text-right pr-3 tabular-nums font-medium">${formatMarketCap(c.market_cap)}</td>
                <td class="py-2.5 text-right pr-3">$${c.current_price ? c.current_price.toFixed(2) : '—'}</td>
                <td class="py-2.5 text-center"><span class="data-badge px-2 py-px rounded-2xl ${dmaClass}">${dmaText}</span></td>
                <td class="py-2.5 pl-2 pr-1 text-xs text-zinc-400 max-w-[260px] line-clamp-2">
                    ${c.comment || ''} <span class="text-amber-400/70 text-[10px]">(detailed thesis for premium users)</span>
                </td>
                <td class="py-2.5 pr-4 text-right">
                    <button onclick="showDetail(${c.id})" class="text-xs px-3 py-1 border border-zinc-600 rounded-2xl hover:bg-zinc-800">Details</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function filterTable() {
        const searchInput = document.getElementById('search');
        const term = searchInput ? searchInput.value.toLowerCase() : '';
        const filtered = companies.filter(c =>
            c.name.toLowerCase().includes(term) || c.ticker.toLowerCase().includes(term)
        );
        renderTable(filtered);
    }

    // ==================== WATCHLIST (Supabase) ====================
    async function toggleWatchlist(companyId, event) {
        event.stopImmediatePropagation();
        const userId = getUserId();

        try {
            if (watchlist.includes(companyId)) {
                await supabase.from('watchlists').delete()
                    .eq('user_id', userId)
                    .eq('company_id', companyId);
                watchlist = watchlist.filter(id => id !== companyId);
            } else {
                await supabase.from('watchlists').insert({ user_id: userId, company_id: companyId });
                watchlist.push(companyId);
            }
            document.getElementById('watchlist-count').textContent = watchlist.length;
            filterTable();
        } catch (err) {
            alert('Watchlist update failed: ' + err.message);
        }
    }

    function showWatchlist() {
        const filtered = companies.filter(c => watchlist.includes(c.id));
        renderTable(filtered);
    }

    // ==================== ADD COMPANY (Supabase) ====================
    async function submitNewCompany() {
        const payload = {
            name: document.getElementById('add-name').value.trim(),
            ticker: document.getElementById('add-ticker').value.trim().toUpperCase(),
            type: document.getElementById('add-type').value,
            category: document.getElementById('add-category').value,
            risk: document.getElementById('add-risk').value,
            jurisdiction: document.getElementById('add-jurisdiction').value.trim() || 'Various',
            overall_score: parseInt(document.getElementById('add-score').value) || 65,
            comment: document.getElementById('add-comment').value.trim()
        };

        if (!payload.name || !payload.ticker) {
            alert("Name and Ticker are required.");
            return;
        }

        try {
            const { error } = await supabase.from('companies').insert([payload]);
            if (error) throw error;

            alert('Company added to Supabase!');
            hideAddModal();
            await loadCompaniesFromSupabase();
        } catch (err) {
            alert('Error adding company: ' + err.message);
        }
    }

    // ==================== UI HELPERS ====================
    function showDetail(id) {
        const c = companies.find(x => x.id === id);
        if (c) alert(`${c.name}\n\n${c.comment || 'No thesis yet.'}`);
    }

    function showAddCompanyModal() {
        document.getElementById('add-modal').classList.remove('hidden');
        document.getElementById('add-modal').classList.add('flex');
    }
    function hideAddModal() {
        document.getElementById('add-modal').classList.remove('flex');
        document.getElementById('add-modal').classList.add('hidden');
    }

    function showSubscribeModal() {
        document.getElementById('subscribe-modal').classList.remove('hidden');
        document.getElementById('subscribe-modal').classList.add('flex');
    }
    function hideSubscribeModal() {
        document.getElementById('subscribe-modal').classList.remove('flex');
        document.getElementById('subscribe-modal').classList.add('hidden');
    }

    function refreshAllPrices() {
        alert('Live price refresh will use a Netlify Function (to be added).');
    }
    function exportToExcel() {
        alert('Excel export is a Premium feature.');
    }

    function updateStats() {
        const totalEl = document.getElementById('stat-total');
        if (totalEl) totalEl.textContent = companies.length;
    }

    // ==================== INITIALIZATION ====================
    async function init() {
        document.getElementById('watchlist-count').textContent = '0';

        await loadCompaniesFromSupabase();
        await loadWatchlistFromSupabase();

        document.getElementById('watchlist-count').textContent = watchlist.length;
        renderTable(companies);
        updateStats();
    }

    window.onload = init;
</script>
```

6. Save the file.

---

## Step 3: Initialize Git and Create a GitHub Repository

This moves you from drag-and-drop to proper version control.

### What to do:

1. Open **Terminal**.

2. Run these commands one by one:

```bash
cd /Users/alainmegias/andes360-capital
```

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Initial commit with Supabase-ready structure"
```

3. Go to GitHub in your browser and create a new repository:
   - Name it: `andes-capital-360`
   - Make it **Public**
   - Do **NOT** check "Add a README file"
   - Click **Create repository**

4. After creating the repo, GitHub will show you commands. Copy and run the two commands that look like this:

```bash
git remote add origin https://github.com/YOUR-USERNAME/andes-capital-360.git
git push -u origin main
```

(Replace `YOUR-USERNAME` with your actual GitHub username)

---

## Step 4: Connect Your GitHub Repo to Netlify

This sets up automatic deployment.

### What to do:

1. Go to [https://app.netlify.com](https://app.netlify.com) and log in.

2. Click **"Add new site"** → **"Import an existing project"**.

3. Click **"Deploy with GitHub"**.

4. Authorize Netlify if asked.

5. Find and select your repository: `andes-capital-360`.

6. On the next screen:
   - Build command: leave **blank**
   - Publish directory: type `.` (just a dot)

7. Click **"Deploy site"**.

8. Wait for the deploy to finish (usually 1–2 minutes).

9. Click on the random Netlify domain (something like `random-name.netlify.app`) to test your site.

---

### After These 4 Steps

You will have:
- Proper Supabase tables
- A clean Supabase-integrated website
- Version control with GitHub
- Automatic deployments via Netlify

---

**Next actions after completing these 4 steps:**

- Seed your 100 companies into the Supabase `companies` table
- Add the Netlify Function for live price refresh
- Connect your custom domain `andescapital360.com`

Would you like me to give you the next checklist once you finish these four steps? Just reply when you're ready.