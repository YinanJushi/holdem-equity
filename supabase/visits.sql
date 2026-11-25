-- Visitor counter for Odds Lounge.
-- Each browser gets a random anonymous id (no personal data). A visit is one row per visitor, per page,
-- per 30 minutes, so reloads don't count twice. The table can't be read or written directly by the site:
-- only through the two functions below.
create table if not exists public.site_visits (
  id bigserial primary key,
  page text not null,
  visitor uuid not null,
  created_at timestamptz not null default now()
);
alter table public.site_visits enable row level security;
create index if not exists site_visits_visitor_page on public.site_visits (visitor, page, created_at);
create index if not exists site_visits_created on public.site_visits (created_at);

-- totals: page views, different visitors, and visitors today (China time)
create or replace function public.site_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'views', (select count(*) from site_visits),
    'visitors', (select count(distinct visitor) from site_visits),
    'today', (select count(distinct visitor) from site_visits
              where created_at >= (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'))
  );
$$;

-- record a visit, then return the totals
create or replace function public.log_visit(p_page text, p_visitor uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_page is null or p_page !~ '^[a-z0-9_-]{1,30}$' then raise exception 'bad page'; end if;
  if not exists (select 1 from site_visits where visitor = p_visitor and page = p_page and created_at > now() - interval '30 minutes') then
    insert into site_visits(page, visitor) values (p_page, p_visitor);
  end if;
  return public.site_stats();
end $$;

revoke all on public.site_visits from anon, authenticated;
grant execute on function public.site_stats() to anon, authenticated;
grant execute on function public.log_visit(text, uuid) to anon, authenticated;
