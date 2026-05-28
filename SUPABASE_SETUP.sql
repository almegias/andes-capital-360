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
-- Done! After running this, go to Table Editor in Supabase
-- and you should see both tables.
-- =====================================================