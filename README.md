# Andes Capital 360

**Andes Capital 360's selection of 100 junior miners** — high risk, high reward.

A clean, self-contained static website showcasing 100 promising junior mining companies. Built for easy deployment and beautiful presentation.

![Andes Capital 360](https://via.placeholder.com/800x400?text=Andes+Capital+360)

## Features

- 100 junior and emerging mining companies (gold, silver, copper, uranium, critical minerals)
- Real-time simulated price & 50-day MA updates
- Powerful filtering, search, sorting, and watchlist
- Professional dark finance theme with custom Andes + Mendoza vineyard logo
- One-click Excel export (Premium)
- Detailed thesis notes (Premium)
- Fully responsive and mobile-friendly

## Project Structure (Clean Static Version)

```
andes360-capital/
├── index.html          # Main site (self-contained)
├── netlify.toml        # Netlify configuration
├── README.md
│
├── frontend/           # Original source (optional)
│   └── index.html
│
├── backend/            # Full-stack version (Node + SQLite) - optional
│   └── ...
│
└── scripts/            # Utility scripts (seed, refresh)
```

> **Note**: For Netlify and most static hosting, use the root `index.html`. The `frontend/` folder is kept for reference.

## Local Development

### Quick Preview

Just open the file directly:

```bash
open index.html
```

Or serve it locally for a better experience:

```bash
# Using Python
python -m http.server 8000

# Then visit http://localhost:8000
```

## Deployment to Netlify (Recommended)

This site is optimized for **Netlify** static hosting.

### Option 1: Drag & Drop (Fastest)

1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `andes360-capital` folder into the window.
3. Netlify will detect `netlify.toml` and deploy automatically.
4. Your site will be live at a random `.netlify.app` URL.

### Option 2: Connect via Git (Best for ongoing updates)

1. Push this folder to a GitHub, GitLab, or Bitbucket repository.
2. Log in to [Netlify](https://app.netlify.com).
3. Click **"Add new site" → "Import an existing project"**.
4. Connect your Git provider and select the repository.
5. Netlify will automatically use the settings from `netlify.toml`.
6. Deploy!

### Custom Domain

After deployment:

1. In Netlify, go to **Domain settings → Add custom domain**.
2. Enter `andescapital360.com` (or your chosen domain).
3. Follow the DNS instructions (usually add a CNAME record).

## Netlify Configuration

The included `netlify.toml` provides:

- SPA-style redirects (so all paths serve `index.html`)
- Basic security headers
- Proper caching for the main file

## Premium Features (Simulated)

The following are marked as **Premium** in the UI:

- Full detailed investment theses
- Real-time price refresh from Yahoo Finance
- Excel export
- Add Company form (in production)

In a real deployment you would connect these to a backend or Supabase/Firebase.

## Backend (Optional Full Version)

A Node.js + SQLite backend exists in the `backend/` folder with:

- Live Yahoo Finance price fetching
- 50-day moving average calculation
- Company CRUD + watchlist
- Excel export endpoint

To run it locally:

```bash
cd backend
npm install
npm run seed
npm start
```

## Domain Name Advice

Free domains are limited and often unreliable. Recommended path:

1. **Buy a cheap domain** — Porkbun or Namecheap (~$8–12/year, often with free privacy).
2. **Host for free** on Netlify (or Vercel / GitHub Pages).
3. Point your domain using Netlify's nameservers or a simple CNAME record.

This is the most reliable "free hosting + cheap domain" combination in 2026.

## License

This project is for educational and demonstration purposes only. Not investment advice.

## Credits

Built with ❤️ using Tailwind CSS (via CDN) and vanilla JavaScript.

---

**Ready to deploy?** Just drag the folder to Netlify or connect it via Git. Your site will be live in under a minute.