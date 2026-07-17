begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.meetings
  add column if not exists share_code text;

create or replace function public.generate_meeting_share_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  candidate text;
begin
  loop
    candidate := translate(
      rtrim(encode(gen_random_bytes(6), 'base64'), E'\n='),
      '+/',
      '-_'
    );
    if not exists (select 1 from public.meetings where share_code = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_meeting_share_code() from public;
grant execute on function public.generate_meeting_share_code() to anon, authenticated;

do $$
declare
  meeting_id uuid;
begin
  for meeting_id in select id from public.meetings where share_code is null loop
    update public.meetings
      set share_code = public.generate_meeting_share_code()
      where id = meeting_id;
  end loop;
end;
$$;

create unique index if not exists meetings_share_code_key
  on public.meetings (share_code);

alter table public.meetings
  alter column share_code set default public.generate_meeting_share_code();

alter table public.meetings
  alter column share_code set not null;

commit;
