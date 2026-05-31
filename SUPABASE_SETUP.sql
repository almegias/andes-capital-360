-- =====================================================
-- Andes Capital 360 - Supabase Table Setup
-- Copy and paste this entire file into the Supabase SQL Editor
-- =====================================================

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

-- 2. Watchlists table (for user watchlists)
create table if not exists public.watchlists (
    id bigint generated always as identity primary key,
    user_id text not null,
    company_id bigint not null references public.companies(id) on delete cascade,
    created_at timestamptz default now(),
    unique (user_id, company_id)
);

-- Enable Row Level Security (recommended)
alter table public.companies enable row level security;
alter table public.watchlists enable row level security;

-- Basic policies (allow public read for now)
-- You can make these stricter later when you add authentication

create policy "Allow public read access to companies"
on public.companies for select
using (true);

create policy "Allow public insert to companies"
on public.companies for insert
with check (true);

create policy "Allow public read access to watchlists"
on public.watchlists for select
using (true);

create policy "Allow users to manage their own watchlist"
on public.watchlists for all
using (auth.role() = 'anon' or auth.role() = 'authenticated');

-- Optional: Create an index for faster searches
create index if not exists idx_companies_name on public.companies (name);
create index if not exists idx_watchlists_user on public.watchlists (user_id);

-- =====================================================
-- SCORE ALGORITHM SUPPORT (Run these ALTER statements)
-- =====================================================

-- Add columns needed for the new weighted scoring system
alter table public.companies
  add column if not exists beta numeric,
  add column if not exists insider_ownership_pct numeric,
  add column if not exists x_sentiment_score numeric,
  add column if not exists score_breakdown jsonb;

-- LLM-powered News & Thesis fields (for Mentions/News sub-score + Investment Thesis)
alter table public.companies
  add column if not exists llm_news_score numeric,           -- 1-10 score from LLM (used for X/News sub-score)
  add column if not exists investment_thesis text,           -- Full LLM-generated analysis + recommendation (premium content)
  add column if not exists public_teaser text,               -- Short public-facing comment (visible to all users)
  add column if not exists llm_last_analyzed timestamptz,
  add column if not exists market_cap_override bigint;       -- Manual override when auto-fetch fails

-- Optional: change overall_score to support decimals (if it was integer)
-- alter table public.companies alter column overall_score type numeric;

-- =====================================================
-- Done! After running this, go to Table Editor in Supabase
-- and you should see both tables.
-- =====================================================