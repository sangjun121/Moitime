create extension if not exists pgcrypto with schema extensions;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null default '모임',
  meeting_type text not null check (meeting_type in ('work', 'regular')),
  dates text[] not null check (cardinality(dates) > 0),
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour smallint not null check (end_hour between 0 and 23),
  expected_participants smallint check (expected_participants is null or expected_participants > 0),
  notification_channel text not null default '받지 않음',
  created_at timestamptz not null default now(),
  constraint meetings_valid_hours check (start_hour <= end_hour)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, meeting_id),
  unique (meeting_id, name)
);

create unique index if not exists participants_meeting_lower_name_idx
  on public.participants (meeting_id, lower(name));

create table if not exists public.participant_credentials (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.responses (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  participant_id uuid not null,
  slot_key text not null check (char_length(slot_key) between 4 and 100),
  created_at timestamptz not null default now(),
  primary key (participant_id, slot_key),
  foreign key (participant_id, meeting_id)
    references public.participants(id, meeting_id)
    on delete cascade
);

alter table public.meetings enable row level security;
alter table public.participants enable row level security;
alter table public.participant_credentials enable row level security;
alter table public.responses enable row level security;

grant select on public.meetings to anon, authenticated;
grant insert on public.meetings to anon, authenticated;
grant select on public.participants to anon, authenticated;
grant select on public.responses to anon, authenticated;
revoke all on public.participant_credentials from anon, authenticated;

drop policy if exists meetings_public_read on public.meetings;
create policy meetings_public_read
  on public.meetings for select
  to anon, authenticated
  using (true);

drop policy if exists meetings_public_create on public.meetings;
create policy meetings_public_create
  on public.meetings for insert
  to anon, authenticated
  with check (true);

drop policy if exists participants_public_read on public.participants;
create policy participants_public_read
  on public.participants for select
  to anon, authenticated
  using (true);

drop policy if exists responses_public_read on public.responses;
create policy responses_public_read
  on public.responses for select
  to anon, authenticated
  using (true);

create or replace function public.join_meeting(
  p_meeting_id uuid,
  p_name text,
  p_password text
)
returns table(participant_id uuid, participant_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := trim(p_name);
  v_participant_id uuid;
  v_participant_name text;
  v_password_hash text;
begin
  if p_meeting_id is null or char_length(v_name) not between 1 and 80 or char_length(coalesce(p_password, '')) < 4 then
    raise exception 'participant_auth_failed';
  end if;

  select p.id, p.name, c.password_hash
    into v_participant_id, v_participant_name, v_password_hash
  from public.participants p
  join public.participant_credentials c on c.participant_id = p.id
  where p.meeting_id = p_meeting_id
    and lower(p.name) = lower(v_name)
  limit 1;

  if v_participant_id is not null then
    if crypt(p_password, v_password_hash) <> v_password_hash then
      raise exception 'participant_auth_failed';
    end if;

    return query select v_participant_id, v_participant_name;
    return;
  end if;

  if not exists (select 1 from public.meetings where id = p_meeting_id) then
    raise exception 'meeting_not_found';
  end if;

  insert into public.participants (meeting_id, name)
    values (p_meeting_id, v_name)
    returning id, name into v_participant_id, v_participant_name;

  insert into public.participant_credentials (participant_id, password_hash)
    values (v_participant_id, crypt(p_password, gen_salt('bf')));

  return query select v_participant_id, v_participant_name;
exception
  when unique_violation then
    raise exception 'participant_auth_failed';
end;
$$;

create or replace function public.save_participant_availability(
  p_meeting_id uuid,
  p_participant_id uuid,
  p_password text,
  p_slot_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_password_hash text;
begin
  select c.password_hash
    into v_password_hash
  from public.participants p
  join public.participant_credentials c on c.participant_id = p.id
  where p.id = p_participant_id
    and p.meeting_id = p_meeting_id;

  if v_password_hash is null or crypt(p_password, v_password_hash) <> v_password_hash then
    raise exception 'participant_auth_failed';
  end if;

  delete from public.responses
  where participant_id = p_participant_id
    and meeting_id = p_meeting_id;

  with requested as (
    select distinct trim(value) as slot_key,
      regexp_replace(trim(value), '-([0-9]{2}):([03]0)$', '') as date_key,
      (regexp_match(trim(value), '-([0-9]{2}:[03]0)$'))[1] as time_key
    from unnest(coalesce(p_slot_keys, '{}'::text[])) as value
  ), valid_slots as (
    select r.slot_key
    from requested r
    join public.meetings m on m.id = p_meeting_id
    where r.time_key is not null
      and r.date_key = any(m.dates)
      and split_part(r.time_key, ':', 1)::smallint between m.start_hour and m.end_hour
      and not (
        split_part(r.time_key, ':', 1)::smallint = m.end_hour
        and r.time_key like '%:30'
      )
  )
  insert into public.responses (meeting_id, participant_id, slot_key)
    select p_meeting_id, p_participant_id, slot_key
    from valid_slots
    on conflict (participant_id, slot_key) do nothing;
end;
$$;

revoke all on function public.join_meeting(uuid, text, text) from public;
grant execute on function public.join_meeting(uuid, text, text) to anon, authenticated;
revoke all on function public.save_participant_availability(uuid, uuid, text, text[]) from public;
grant execute on function public.save_participant_availability(uuid, uuid, text, text[]) to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.participants;
  exception when duplicate_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.responses;
  exception when duplicate_object then
    null;
  end;
end;
$$;
