-- Learning Hub additive migration. Run AFTER 20261030_cloud.sql.
-- Existing game_sessions/attempts and legacy student snapshots are retained.
begin;
create table public.games (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  module_key text not null unique check (module_key ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title text not null check (char_length(title) between 2 and 90),
  description text not null default '' check (char_length(description) <= 380),
  icon text not null default '🎮' check (char_length(icon) <= 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.games (id,module_key,title,description,icon,active)
values ('multiplication-quest','multiplication-quest','מסע הכפל שלי',
        'לומדים את לוח הכפל בשלבים, מרוויחים כוכבים ויוצאים להרפתקה!', '⭐', true)
on conflict (id) do nothing;
create trigger games_touch before update on public.games
for each row execute function private.touch_updated_at();

create table public.user_game_permissions (
  user_id uuid not null references public.app_users(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  granted_by uuid references public.app_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key(user_id,game_id)
);
create index game_permissions_by_game on public.user_game_permissions(game_id);

create or replace function private.has_game_access(p_game text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (
    private.is_approved() and exists (
      select 1 from public.games g
      join public.user_game_permissions p on p.game_id=g.id
      where g.id=p_game and g.active and p.user_id=(select auth.uid())
    )
  );
$$;
revoke all on function private.has_game_access(text) from public;
grant execute on function private.has_game_access(text) to authenticated;

-- Backfill permission for legacy approved accounts: no previously-approved user loses access.
insert into public.user_game_permissions(user_id,game_id)
select id,'multiplication-quest' from public.app_users
where status='approved' and role='user'
on conflict do nothing;

-- Student identity belongs to the household. Learning progress belongs to a specific game.
create table public.game_progress (
  owner_id uuid not null references public.app_users(id) on delete cascade,
  student_id text not null references public.student_profiles(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(student_id, game_id)
);
create index game_progress_by_owner_game on public.game_progress(owner_id, game_id);
create trigger game_progress_touch before update on public.game_progress
for each row execute function private.touch_updated_at();
-- Copy legacy game progress unchanged, incl. achievements, XP, mastery, activity and scores.
insert into public.game_progress(owner_id, student_id, game_id, snapshot)
select owner_id,id,'multiplication-quest',snapshot from public.student_profiles
where snapshot <> '{}'::jsonb
on conflict do nothing;

alter table public.game_sessions add column game_id text not null default 'multiplication-quest'
  references public.games(id);
create index sessions_by_game_idx on public.game_sessions(game_id,started_at desc);
alter table public.activity_events add column game_id text references public.games(id);
-- Historical events were captured by the original game, except account-wide login/logout.
update public.activity_events set game_id='multiplication-quest'
where event_type not in ('login','logout') and game_id is null;

alter table public.games enable row level security;
alter table public.user_game_permissions enable row level security;
alter table public.game_progress enable row level security;
revoke all on public.games, public.user_game_permissions, public.game_progress from anon,authenticated;
grant select on public.games,public.user_game_permissions to authenticated;
grant select,insert,update,delete on public.game_progress to authenticated;
create policy games_visible on public.games for select to authenticated
using ((select private.is_admin()) or ((select private.is_approved()) and active and
  exists (select 1 from public.user_game_permissions p where p.game_id=id and p.user_id=(select auth.uid()))));
create policy grants_visible on public.user_game_permissions for select to authenticated
using ((select private.is_admin()) or ((select private.is_approved()) and user_id=(select auth.uid())));
create policy progress_read on public.game_progress for select to authenticated
using ((select private.is_admin()) or (owner_id=(select auth.uid()) and (select private.has_game_access(game_id))));
create policy progress_insert on public.game_progress for insert to authenticated
with check (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)) and
  exists(select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid())));
create policy progress_update on public.game_progress for update to authenticated
using (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)))
with check (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)));
create policy progress_delete on public.game_progress for delete to authenticated
using (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)));

-- The old student_profiles.snapshot column contains progress for the original game.
-- Retain it for rollback/backup, but do NOT expose that legacy cross-game data to clients.
revoke select on public.student_profiles from authenticated;
grant select(id, owner_id, name, avatar, created_at, updated_at) on public.student_profiles to authenticated;

-- Enforce per-game permissions on all direct SQL routes, including historical attempts.
drop policy sessions_read on public.game_sessions;
create policy sessions_read on public.game_sessions for select to authenticated
using ((select private.is_admin()) or (owner_id=(select auth.uid()) and (select private.has_game_access(game_id))));
drop policy sessions_insert on public.game_sessions;
create policy sessions_insert on public.game_sessions for insert to authenticated
with check (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)) and
  exists(select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid())));
grant insert(id,owner_id,student_id,world_id,mode,question_count,game_id) on public.game_sessions to authenticated;
-- PostgreSQL column grant from first migration is still additive; explicit grant above enables game_id.

drop policy attempts_read on public.question_attempts;
create policy attempts_read on public.question_attempts for select to authenticated
using ((select private.is_admin()) or (owner_id=(select auth.uid()) and exists(
  select 1 from public.game_sessions s where s.id=session_id and s.owner_id=(select auth.uid())
  and (select private.has_game_access(s.game_id))
)));
drop policy attempts_insert on public.question_attempts;
create policy attempts_insert on public.question_attempts for insert to authenticated
with check (owner_id=(select auth.uid()) and exists(
  select 1 from public.game_sessions s where s.id=session_id and s.owner_id=(select auth.uid())
    and s.student_id=student_id and s.finished_at is null and (select private.has_game_access(s.game_id))
));

drop policy events_read on public.activity_events;
create policy events_read on public.activity_events for select to authenticated
using ((select private.is_admin()) or (owner_id=(select auth.uid()) and
  (game_id is null or (select private.has_game_access(game_id)))));
drop policy events_insert on public.activity_events;
create policy events_insert on public.activity_events for insert to authenticated
with check (owner_id=(select auth.uid()) and
  ((game_id is null and student_id is null and event_type in ('login','logout'))
    or (game_id is not null and (select private.has_game_access(game_id)) and
      (student_id is null or exists (select 1 from public.student_profiles s
       where s.id=student_id and s.owner_id=(select auth.uid()))))));
grant insert(owner_id,student_id,event_type,payload,game_id) on public.activity_events to authenticated;

-- Generic per-game activity for new modules. No new event_type enum migration is needed.
create table public.game_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  student_id text not null references public.student_profiles(id) on delete cascade,
  game_id text not null references public.games(id),
  event_kind text not null check (char_length(event_kind) between 1 and 70),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index generic_game_events_idx on public.game_events(game_id,student_id,created_at desc);
alter table public.game_events enable row level security;
revoke all on public.game_events from anon,authenticated;
grant select on public.game_events to authenticated;
grant insert(owner_id,student_id,game_id,event_kind,payload) on public.game_events to authenticated;
grant usage,select on sequence public.game_events_id_seq to authenticated;
create policy generic_events_read on public.game_events for select to authenticated
using ((select private.is_admin()) or (owner_id=(select auth.uid()) and (select private.has_game_access(game_id))));
create policy generic_events_insert on public.game_events for insert to authenticated
with check (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)) and
  exists(select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid())));

-- Separately indexed results table, server-filled from DB-graded sessions, never client-edited.
create table public.game_results (
  session_id text primary key references public.game_sessions(id) on delete cascade,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  student_id text not null references public.student_profiles(id) on delete cascade,
  game_id text not null references public.games(id),
  score integer not null check (score between 0 and 100),
  first_correct integer not null,
  wrong_answers integer not null,
  hints_used integer not null,
  completed_at timestamptz not null
);
create index game_results_student_idx on public.game_results(game_id, student_id, completed_at desc);
create or replace function private.capture_game_result() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.finished_at is not null and new.score is not null then
    insert into public.game_results(session_id,owner_id,student_id,game_id,score,first_correct,wrong_answers,hints_used,completed_at)
    values(new.id,new.owner_id,new.student_id,new.game_id,new.score,new.first_correct,new.wrong_answers,new.hints_used,new.finished_at)
    on conflict (session_id) do update set score=excluded.score, first_correct=excluded.first_correct,
      wrong_answers=excluded.wrong_answers,hints_used=excluded.hints_used,completed_at=excluded.completed_at;
  end if;
  return new;
end; $$;
create trigger capture_result_after_update after update of finished_at,score on public.game_sessions
for each row execute function private.capture_game_result();
insert into public.game_results(session_id,owner_id,student_id,game_id,score,first_correct,wrong_answers,hints_used,completed_at)
select id,owner_id,student_id,game_id,score,first_correct,wrong_answers,hints_used,finished_at
from public.game_sessions where finished_at is not null and score is not null
on conflict do nothing;
alter table public.game_results enable row level security;
revoke all on public.game_results from anon,authenticated;
grant select on public.game_results to authenticated;
create policy game_results_read on public.game_results for select to authenticated
using ((select private.is_admin()) or (owner_id=(select auth.uid()) and (select private.has_game_access(game_id))));

-- Enforce permission even on SECDEF RPCs if game access is revoked during a session.
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
  where id=p_session_id and owner_id=auth.uid() for update;
  if not found or not private.has_game_access(v_session.game_id) then raise exception 'Game access denied'; end if;
  if v_session.finished_at is not null then
    return jsonb_build_object('score',v_session.score,'first_correct',v_session.first_correct);
  end if;
  with answer_groups as (
    select question_uid,
      count(*) filter (where action='answer' and correct) as hits,
      bool_or(action='reveal') as revealed,
      (array_agg((action='answer' and correct) order by created_at, id))[1] as first_clean
    from public.question_attempts where session_id=p_session_id
    group by question_uid
  )
  select count(*) filter (where hits>0 or revealed),
         count(*) filter (where first_clean and hits>0)
  into v_resolved,v_first from answer_groups;
  if coalesce(v_resolved,0) < v_session.question_count then
    raise exception 'Session not complete: % of % questions',coalesce(v_resolved,0),v_session.question_count;
  end if;
  select count(*) filter(where action='answer' and not correct),
         count(*) filter(where action='hint') into v_wrong,v_hints
  from public.question_attempts where session_id=p_session_id;
  v_score:=round(100.0*coalesce(v_first,0)/v_session.question_count);
  update public.game_sessions set finished_at=now(),score=v_score,
    first_correct=coalesce(v_first,0),wrong_answers=coalesce(v_wrong,0),hints_used=coalesce(v_hints,0)
  where id=p_session_id;
  return jsonb_build_object('score',v_score,'first_correct',coalesce(v_first,0),
    'wrong_answers',coalesce(v_wrong,0),'hints_used',coalesce(v_hints,0));
end; $$;
revoke all on function public.finalize_game(text) from public;
grant execute on function public.finalize_game(text) to authenticated;
commit;
