alter table public.player_accounts
  add column if not exists jersey_code text,
  add column if not exists remember boolean default true,
  add column if not exists user_agent text,
  add column if not exists today_key text,
  add column if not exists today_shots integer default 0,
  add column if not exists today_makes integer default 0,
  add column if not exists profile_json jsonb,
  add column if not exists profile_updated_at timestamptz;

create index if not exists player_accounts_today_key_idx
  on public.player_accounts (today_key);

create index if not exists player_accounts_profile_updated_at_idx
  on public.player_accounts (profile_updated_at);

create unique index if not exists player_accounts_name_code_uidx
  on public.player_accounts (player_name, jersey_code);

grant select, insert, update on public.player_accounts to anon, authenticated;

alter table public.player_accounts enable row level security;

drop policy if exists player_accounts_select_public on public.player_accounts;
create policy player_accounts_select_public
  on public.player_accounts
  for select
  to anon, authenticated
  using (true);

drop policy if exists player_accounts_insert_public on public.player_accounts;
create policy player_accounts_insert_public
  on public.player_accounts
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists player_accounts_update_public on public.player_accounts;
create policy player_accounts_update_public
  on public.player_accounts
  for update
  to anon, authenticated
  using (true)
  with check (true);
