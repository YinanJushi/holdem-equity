-- Odds Lounge: accounts and synced chips.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to run again; it only creates what is missing and replaces the functions.
--
-- How it is protected:
-- * The browser can only READ its own wallet row. Every change goes through the functions below,
--   which run on the server and check the rules (one daily claim, each secret code once per account,
--   chips never below zero).
-- * Secret codes are stored only as SHA-256 hashes, so the code itself is never in the database or the site.

create extension if not exists pgcrypto with schema extensions;

-- one wallet per account
create table if not exists public.wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  chips      numeric(12, 1) not null default 1000 check (chips >= 0),
  tz         text not null default 'UTC',          -- the day boundary for the daily claim; fixed when the wallet is created
  last_claim date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- secret codes (hash only) and who has used them
create table if not exists public.secret_codes (
  code_hash text primary key,
  amount    int not null default 1000 check (amount > 0 and amount <= 100000),
  active    boolean not null default true
);
create table if not exists public.code_redemptions (
  user_id     uuid references auth.users (id) on delete cascade,
  code_hash   text references public.secret_codes (code_hash) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (user_id, code_hash)
);
create table if not exists public.code_attempts (
  user_id uuid references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists code_attempts_user_at on public.code_attempts (user_id, at);

alter table public.wallets          enable row level security;
alter table public.secret_codes     enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.code_attempts    enable row level security;

drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets for select to authenticated using (auth.uid() = user_id);
-- no other policies: secret_codes, code_redemptions and code_attempts are not readable or writable from the browser

-- what the browser gets back after every call
create or replace function public.wallet_state(w public.wallets)
returns json language sql stable set search_path = public as $$
  select json_build_object(
    'chips', w.chips,
    'can_claim', w.last_claim is null or w.last_claim < (now() at time zone w.tz)::date,
    'next_claim_at', ((((now() at time zone w.tz)::date + 1)::timestamp) at time zone w.tz)
  );
$$;

-- load (and on first sign-in create) the wallet; a new account starts with 1,000 chips, which counts as today's claim
create or replace function public.get_wallet(p_tz text default 'UTC')
returns json language plpgsql security definer set search_path = public as $$
declare
  w  public.wallets;
  tz text := 'UTC';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz) then tz := p_tz; end if;
  insert into public.wallets (user_id, chips, tz, last_claim)
  values (auth.uid(), 1000, tz, (now() at time zone tz)::date)
  on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = auth.uid();
  return public.wallet_state(w);
end $$;

-- the free daily chips, once per calendar day in the wallet's time zone
create or replace function public.claim_daily()
returns json language plpgsql security definer set search_path = public as $$
declare w public.wallets;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.wallets
     set chips = chips + 1000, last_claim = (now() at time zone tz)::date, updated_at = now()
   where user_id = auth.uid()
     and (last_claim is null or last_claim < (now() at time zone tz)::date)
  returning * into w;
  if not found then raise exception 'already claimed today'; end if;
  return public.wallet_state(w);
end $$;

-- a secret code: each code once per account; at most 10 tries per hour per account
create or replace function public.redeem_code(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  h   text := encode(extensions.digest(lower(trim(coalesce(p_code, ''))), 'sha256'), 'hex');
  amt int;
  w   public.wallets;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.code_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    return json_build_object('error', 'Too many tries. Try again in an hour.');
  end if;
  insert into public.code_attempts (user_id) values (auth.uid());
  select amount into amt from public.secret_codes where code_hash = h and active;
  if amt is null then return json_build_object('error', 'That code isn''t valid.'); end if;
  if exists (select 1 from public.code_redemptions where user_id = auth.uid() and code_hash = h) then
    return json_build_object('error', 'You''ve already used this code.');
  end if;
  insert into public.code_redemptions (user_id, code_hash) values (auth.uid(), h);
  update public.wallets set chips = chips + amt, updated_at = now() where user_id = auth.uid() returning * into w;
  return jsonb_build_object('ok', true, 'amount', amt, 'wallet', public.wallet_state(w)::jsonb)::json;
end $$;

-- chips won or lost in a game; the balance can never go below zero
create or replace function public.apply_delta(p_delta numeric)
returns json language plpgsql security definer set search_path = public as $$
declare w public.wallets;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_delta is null or p_delta > 20000 or p_delta < -1000000 then raise exception 'bad amount'; end if;
  update public.wallets set chips = chips + p_delta, updated_at = now()
   where user_id = auth.uid() and chips + p_delta >= 0
  returning * into w;
  if not found then raise exception 'not enough chips'; end if;
  return public.wallet_state(w);
end $$;

revoke all on function public.wallet_state(public.wallets) from public, anon, authenticated;
revoke all on function public.get_wallet(text)      from public, anon;
revoke all on function public.claim_daily()         from public, anon;
revoke all on function public.redeem_code(text)     from public, anon;
revoke all on function public.apply_delta(numeric)  from public, anon;
grant execute on function public.get_wallet(text)     to authenticated;
grant execute on function public.claim_daily()        to authenticated;
grant execute on function public.redeem_code(text)    to authenticated;
grant execute on function public.apply_delta(numeric) to authenticated;
