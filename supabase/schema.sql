create extension if not exists pgcrypto;

create table if not exists public.reports (
  id text primary key,
  title text not null check (char_length(title) between 3 and 90),
  description text not null check (char_length(description) between 3 and 800),
  category text not null check (category in ('Streetlight', 'Road damage', 'Waste', 'Water & drainage', 'Other')),
  location text not null check (char_length(location) between 2 and 100),
  area text not null check (char_length(area) between 2 and 80),
  priority text not null check (priority in ('High', 'Medium', 'Low')),
  score integer not null default 0 check (score between 0 and 100),
  status text not null default 'Submitted' check (status in ('Submitted', 'In progress', 'Resolved')),
  reported_at timestamptz not null default now(),
  department text not null,
  reporter text not null default 'Resident',
  image_url text,
  lat double precision,
  lng double precision,
  duplicate_of text,
  resolution text,
  resolution_image_url text,
  resolved_at timestamptz,
  history jsonb not null default '[]'::jsonb
);

create index if not exists reports_reported_at_idx on public.reports (reported_at desc);
create index if not exists reports_area_status_idx on public.reports (area, status);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end;
$$;

create table if not exists public.priority_rules (
  id integer primary key check (id = 1),
  rules jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.priority_rules (id, rules)
values (1, '{"baseHigh":72,"baseMedium":48,"ageBoost":1.4,"duplicateBoost":12,"urgentBoost":18}'::jsonb)
on conflict (id) do nothing;

create or replace function public.is_civicpulse_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'civicpulse_admin', 'false') = 'true';
$$;

alter table public.reports enable row level security;
alter table public.priority_rules enable row level security;

grant select, insert on public.reports to anon, authenticated;
grant update, delete on public.reports to authenticated;
grant select on public.priority_rules to anon, authenticated;
grant insert, update on public.priority_rules to authenticated;

drop policy if exists "Reports are publicly readable" on public.reports;
create policy "Reports are publicly readable" on public.reports
  for select to anon, authenticated using (true);

drop policy if exists "Residents can submit reports" on public.reports;
create policy "Residents can submit reports" on public.reports
  for insert to anon, authenticated with check (
    status = 'Submitted' and resolution is null and resolution_image_url is null
  );

drop policy if exists "Administrators can update reports" on public.reports;
create policy "Administrators can update reports" on public.reports
  for update to authenticated using (public.is_civicpulse_admin())
  with check (public.is_civicpulse_admin());

drop policy if exists "Administrators can delete reports" on public.reports;
create policy "Administrators can delete reports" on public.reports
  for delete to authenticated using (public.is_civicpulse_admin());

drop policy if exists "Priority rules are publicly readable" on public.priority_rules;
create policy "Priority rules are publicly readable" on public.priority_rules
  for select to anon, authenticated using (true);

drop policy if exists "Administrators can manage priority rules" on public.priority_rules;
create policy "Administrators can manage priority rules" on public.priority_rules
  for all to authenticated using (public.is_civicpulse_admin())
  with check (public.is_civicpulse_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('civicpulse-evidence', 'civicpulse-evidence', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CivicPulse evidence is publicly readable" on storage.objects;
create policy "CivicPulse evidence is publicly readable" on storage.objects
  for select to anon, authenticated using (bucket_id = 'civicpulse-evidence');

drop policy if exists "Residents can upload report photos" on storage.objects;
create policy "Residents can upload report photos" on storage.objects
  for insert to anon, authenticated with check (
    bucket_id = 'civicpulse-evidence'
    and (storage.foldername(name))[1] = 'reports'
    and coalesce((metadata ->> 'size')::bigint, 0) <= 5242880
  );

drop policy if exists "Administrators can upload resolution photos" on storage.objects;
create policy "Administrators can upload resolution photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'civicpulse-evidence'
    and (storage.foldername(name))[1] = 'resolutions'
    and public.is_civicpulse_admin()
    and coalesce((metadata ->> 'size')::bigint, 0) <= 5242880
  );

drop policy if exists "Administrators can delete evidence" on storage.objects;
create policy "Administrators can delete evidence" on storage.objects
  for delete to authenticated using (
    bucket_id = 'civicpulse-evidence' and public.is_civicpulse_admin()
  );
