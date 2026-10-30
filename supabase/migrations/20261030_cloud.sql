-- Multiplication Quest Cloud: run once in Supabase SQL Editor.
-- The *only* role bootstrap is a verified Google identity for the exact admin email.
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.access_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.access_role as enum ('user', 'super_admin');

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  avatar_url text,
  role public.access_role not null default 'user',
  status public.access_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  last_login_at timestamptz
);
create index app_users_status_idx on public.app_users(status, created_at desc);

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_users u
    where u.id = (select auth.uid()) and u.role = 'super_admin'
      and u.status = 'approved' and u.email = 'alon.hamzani@gmail.com'
  );
$$;
create or replace function private.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users u
    where u.id = (select auth.uid()) and u.status = 'approved');
$$;
revoke all on function private.is_admin(), private.is_approved() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(), private.is_approved() to authenticated;

create or replace function private.handle_auth_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare is_google boolean;
begin
  is_google := (new.raw_app_meta_data ->> 'provider') = 'google'
    and new.email_confirmed_at is not null;
  insert into public.app_users (id,email,full_name,avatar_url,role,status,approved_at)
  values (
    new.id, lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    case when is_google and lower(new.email) = 'alon.hamzani@gmail.com'
      then 'super_admin'::public.access_role else 'user'::public.access_role end,
    case when is_google and lower(new.email) = 'alon.hamzani@gmail.com'
      then 'approved'::public.access_status else 'pending'::public.access_status end,
    case when is_google and lower(new.email) = 'alon.hamzani@gmail.com'
      then now() else null end
  );
  return new;
end;
$$;
create trigger auth_signup_create_user after insert on auth.users
for each row execute function private.handle_auth_signup();

create table public.student_profiles (
  id text primary key,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  avatar text not null default '🦊',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_id_valid check (char_length(id) between 3 and 100)
);
create index student_owner_idx on public.student_profiles(owner_id);

create table public.game_sessions (
  id text primary key,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  student_id text not null references public.student_profiles(id) on delete cascade,
  world_id integer not null,
  mode text not null check (char_length(mode) between 1 and 35),
  question_count integer not null check (question_count between 1 and 100),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score integer check (score between 0 and 100),
  first_correct integer not null default 0,
  wrong_answers integer not null default 0,
  hints_used integer not null default 0,
  unique (id, owner_id, student_id)
);
create index sessions_by_student_idx on public.game_sessions(student_id, started_at desc);
create index sessions_by_owner_idx on public.game_sessions(owner_id, started_at desc);

create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  owner_id uuid not null,
  student_id text not null,
  question_uid text not null check (char_length(question_uid) between 1 and 110),
  a integer not null check (a between 0 and 10),
  b integer not null check (b between 0 and 10),
  kind text not null check (kind in ('number','choice','missing','truefalse','story','visual')),
  shown_result integer,
  missing_side text check (missing_side in ('left','right')),
  action text not null check (action in ('answer','hint','reveal')),
  response text,
  correct boolean generated always as (
    case when action <> 'answer' then false
      when kind = 'truefalse' then response = (case when shown_result = a*b then 'נכון' else 'לא נכון' end)
      when kind = 'missing' then response = (case when missing_side='left' then a else b end)::text
      else response = (a*b)::text
    end
  ) stored,
  created_at timestamptz not null default now(),
  foreign key (session_id,owner_id,student_id)
    references public.game_sessions(id,owner_id,student_id) on delete cascade,
  check (action <> 'answer' or response is not null),
  check (kind <> 'missing' or missing_side is not null),
  check (kind <> 'truefalse' or shown_result is not null)
);
create index attempts_session_idx on public.question_attempts(session_id, created_at, id);
create index attempts_student_idx on public.question_attempts(student_id, created_at desc);

create table public.activity_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  student_id text references public.student_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('login','logout','lesson_completed','profile_created','profile_reset','profile_deleted','mini_game')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_by_owner_idx on public.activity_events(owner_id, created_at desc);

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid references public.app_users(id) on delete set null,
  target_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.approval_notifications (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger app_users_touch before update on public.app_users
for each row execute function private.touch_updated_at();
create trigger student_profiles_touch before update on public.student_profiles
for each row execute function private.touch_updated_at();

-- The database, not the browser, grades first-try answers and the session's /100 score.
create or replace function public.finalize_game(p_session_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.game_sessions%rowtype;
  v_resolved integer;
  v_first integer;
  v_wrong integer;
  v_hints integer;
  v_score integer;
begin
  if not private.is_approved() then raise exception 'Access denied'; end if;
  select * into v_session from public.game_sessions
    where id = p_session_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Session not found'; end if;
  if v_session.finished_at is not null then
    return jsonb_build_object('score', v_session.score, 'first_correct', v_session.first_correct);
  end if;
  with answer_groups as (
    select question_uid,
      count(*) filter (where action='answer' and correct) as hits,
      bool_or(action='reveal') as revealed,
      (array_agg((action='answer' and correct) order by created_at, id))[1] as first_clean
    from public.question_attempts where session_id = p_session_id
    group by question_uid
  )
  select count(*) filter (where hits > 0 or revealed),
         count(*) filter (where first_clean and hits > 0)
  into v_resolved, v_first from answer_groups;
  if coalesce(v_resolved,0) < v_session.question_count then
    raise exception 'Session not complete: % of % questions', coalesce(v_resolved,0), v_session.question_count;
  end if;
  select count(*) filter(where action='answer' and not correct),
         count(*) filter(where action='hint')
    into v_wrong, v_hints
    from public.question_attempts where session_id = p_session_id;
  v_score := round(100.0 * coalesce(v_first,0) / v_session.question_count);
  update public.game_sessions set finished_at=now(), score=v_score,
    first_correct=coalesce(v_first,0), wrong_answers=coalesce(v_wrong,0), hints_used=coalesce(v_hints,0)
    where id=p_session_id;
  return jsonb_build_object('score',v_score,'first_correct',coalesce(v_first,0),
    'wrong_answers',coalesce(v_wrong,0),'hints_used',coalesce(v_hints,0));
end;
$$;
revoke all on function public.finalize_game(text) from public;
grant execute on function public.finalize_game(text) to authenticated;

alter table public.app_users enable row level security;
alter table public.student_profiles enable row level security;
alter table public.game_sessions enable row level security;
alter table public.question_attempts enable row level security;
alter table public.activity_events enable row level security;
alter table public.admin_audit enable row level security;
alter table public.approval_notifications enable row level security;

-- Explicit SQL privileges: no ordinary user may update roles, statuses or grades.
revoke all on public.app_users,public.student_profiles,public.game_sessions,
  public.question_attempts,public.activity_events,public.admin_audit,
  public.approval_notifications from anon,authenticated;
grant select on public.app_users to authenticated;
grant select, insert, update, delete on public.student_profiles to authenticated;
grant select on public.game_sessions to authenticated;
grant insert (id,owner_id,student_id,world_id,mode,question_count) on public.game_sessions to authenticated;
grant select on public.question_attempts to authenticated;
grant insert (session_id,owner_id,student_id,question_uid,a,b,kind,shown_result,missing_side,action,response) on public.question_attempts to authenticated;
grant select on public.activity_events to authenticated;
grant insert (owner_id,student_id,event_type,payload) on public.activity_events to authenticated;
grant usage, select on sequence public.activity_events_id_seq to authenticated;
grant select on public.admin_audit to authenticated;

create policy app_users_select on public.app_users for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy students_read on public.student_profiles for select to authenticated
using ((select private.is_approved()) and (owner_id = (select auth.uid()) or (select private.is_admin())));
create policy students_insert on public.student_profiles for insert to authenticated
with check ((select private.is_approved()) and owner_id = (select auth.uid()));
create policy students_update on public.student_profiles for update to authenticated
using ((select private.is_approved()) and owner_id = (select auth.uid()))
with check ((select private.is_approved()) and owner_id = (select auth.uid()));
create policy students_delete on public.student_profiles for delete to authenticated
using ((select private.is_approved()) and owner_id = (select auth.uid()));

create policy sessions_read on public.game_sessions for select to authenticated
using ((select private.is_approved()) and (owner_id = (select auth.uid()) or (select private.is_admin())));
create policy sessions_insert on public.game_sessions for insert to authenticated
with check ((select private.is_approved()) and owner_id = (select auth.uid()) and
  exists (select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid())));

create policy attempts_read on public.question_attempts for select to authenticated
using ((select private.is_approved()) and (owner_id = (select auth.uid()) or (select private.is_admin())));
create policy attempts_insert on public.question_attempts for insert to authenticated
with check ((select private.is_approved()) and owner_id = (select auth.uid()) and
  exists (select 1 from public.game_sessions s where s.id=session_id
    and s.owner_id=(select auth.uid()) and s.student_id=student_id and s.finished_at is null));

create policy events_read on public.activity_events for select to authenticated
using ((select private.is_approved()) and (owner_id=(select auth.uid()) or (select private.is_admin())));
create policy events_insert on public.activity_events for insert to authenticated
with check (owner_id = (select auth.uid()) and
  (student_id is null or ((select private.is_approved()) and exists (
   select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid())
  ))));
create policy audit_admin_read on public.admin_audit for select to authenticated
using ((select private.is_admin()));

-- All admin mutations and approval notifications are done via authenticated Edge Functions
-- using the server-only service role key; no ordinary SQL API rights are granted above.

create or replace function public.touch_login() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.app_users set last_login_at=now() where id=auth.uid()
    and (last_login_at is null or last_login_at < now()-interval '10 minutes');
  if found then
    insert into public.activity_events (owner_id,event_type) values(auth.uid(),'login');
  end if;
end;
$$;
revoke all on function public.touch_login() from public;
grant execute on function public.touch_login() to authenticated;
