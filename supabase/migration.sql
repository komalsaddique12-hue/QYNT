-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Stores each user's app data (transactions, categories, wallets, budgets, savings, profile,
-- daily limit) as JSON blobs keyed per user, mirroring the app's existing storage keys.

create table if not exists app_data (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table app_data enable row level security;

drop policy if exists "Users manage their own data" on app_data;
create policy "Users manage their own data"
  on app_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
