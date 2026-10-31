begin;
create table private.learning_questions (
 session_id text not null references public.game_sessions(id) on delete cascade,
 uid text not null, a integer not null check(a between 0 and 10), b integer not null check(b between 0 and 10),
 kind text not null, missing_side text, shown_result integer,
 wrong integer not null default 0,hints integer not null default 0,resolved boolean not null default false,
 primary key(session_id,uid)
);
create table private.learning_receipts (
 id uuid primary key, owner_id uuid not null references public.app_users(id) on delete cascade,
 session_id text not null references public.game_sessions(id) on delete cascade,
 uid text not null, action text not null,response text, result jsonb not null
);
create table public.learning_rewards (
 id bigint generated always as identity primary key,
 owner_id uuid not null references public.app_users(id) on delete cascade,
 student_id text not null references public.student_profiles(id) on delete cascade,
 game_id text not null references public.games(id) on delete cascade,
 reward_key text not null,points integer not null check(points>=0),created_at timestamptz not null default now(),
 unique(student_id,game_id,reward_key)
);
alter table public.learning_rewards enable row level security;
revoke all on public.learning_rewards from public,anon,authenticated;
grant select on public.learning_rewards to authenticated;
create policy rewards_read on public.learning_rewards for select to authenticated
using(owner_id=auth.uid() and private.has_game_access(game_id));
revoke all on private.learning_questions,private.learning_receipts from public,anon,authenticated;
-- Existing test balances are retained as a server-owned baseline; no client can insert rewards.
insert into public.learning_rewards(owner_id,student_id,game_id,reward_key,points)
select owner_id,student_id,game_id,'baseline',greatest(0,coalesce((snapshot->>'xp')::integer,0)) from public.game_progress;

create function public.register_learning_questions(p_session_id text,p_questions jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare run public.game_sessions; q jsonb; side text;
begin
 select * into run from public.game_sessions where id=p_session_id and owner_id=auth.uid() for update;
 if not found or not private.has_game_access(run.game_id) or run.finished_at is not null then raise exception 'Active owned session required' using errcode='42501';end if;
 if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)<>run.question_count then raise exception 'Question count mismatch';end if;
 for q in select value from jsonb_array_elements(p_questions) loop
   if q->>'type' not in ('number','choice','missing','truefalse','story','visual') or length(q->>'uid') not between 1 and 110 then raise exception 'Invalid question';end if;
   side:=case when q->>'type'='missing' then case when left(trim(q->>'prompt'),1)='?' then 'left' else 'right' end end;
   insert into private.learning_questions(session_id,uid,a,b,kind,missing_side,shown_result)
     values(p_session_id,q->>'uid',(q->>'a')::integer,(q->>'b')::integer,q->>'type',side,(q->>'shownResult')::integer)
     on conflict(session_id,uid) do nothing;
   if not exists(select 1 from private.learning_questions where session_id=p_session_id and uid=q->>'uid' and a=(q->>'a')::integer and b=(q->>'b')::integer and kind=q->>'type' and missing_side is not distinct from side and shown_result is not distinct from (q->>'shownResult')::integer) then raise exception 'Registered question cannot change';end if;
 end loop;
 if (select count(*) from private.learning_questions where session_id=p_session_id)<>run.question_count then raise exception 'Duplicate question identifier';end if;
end;$$;

create function public.record_learning_event(p_event_id uuid,p_session_id text,p_uid text,p_action text,p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.game_sessions; q private.learning_questions; previous private.learning_receipts; answer text; correct boolean:=false; points integer:=0; result jsonb;
begin
 select * into run from public.game_sessions where id=p_session_id and owner_id=auth.uid();
 if not found or not private.has_game_access(run.game_id) then raise exception 'Game access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(run.student_id,0));
 select * into previous from private.learning_receipts where id=p_event_id;
 if found then
   if previous.owner_id<>auth.uid() or previous.session_id<>p_session_id or previous.uid<>p_uid or previous.action<>p_action or previous.response is distinct from p_response then raise exception 'Event identifier reused';end if;
   return previous.result;
 end if;
 if run.finished_at is not null then raise exception 'Session is finished';end if;
 select * into q from private.learning_questions where session_id=p_session_id and uid=p_uid for update;
 if not found or p_action not in ('answer','hint','reveal') or q.resolved then raise exception 'Unresolved registered question required';end if;
 if p_action='answer' then
   if p_response is null or length(p_response)>100 then raise exception 'Response required';end if;
   answer:=case when q.kind='truefalse' then case when q.shown_result=q.a*q.b then 'נכון' else 'לא נכון' end
     when q.kind='missing' then (case when q.missing_side='left' then q.a else q.b end)::text else (q.a*q.b)::text end;
   correct:=case when q.kind='truefalse' then p_response=answer when p_response~'^[0-9]{1,3}$' then p_response::integer=answer::integer else false end;
   if correct then points:=case when q.hints>0 then 3 when q.wrong>0 then 6 else 10 end;end if;
 end if;
 insert into public.question_attempts(session_id,owner_id,student_id,question_uid,a,b,kind,shown_result,missing_side,action,response)
 values(p_session_id,auth.uid(),run.student_id,p_uid,q.a,q.b,q.kind,q.shown_result,q.missing_side,p_action,p_response);
 update private.learning_questions set wrong=wrong+case when p_action='answer' and not correct then 1 else 0 end,
   hints=hints+case when p_action='hint' then 1 else 0 end,resolved=correct or p_action='reveal' where session_id=p_session_id and uid=p_uid;
 if correct or p_action='reveal' then
   insert into public.learning_rewards(owner_id,student_id,game_id,reward_key,points)
   values(auth.uid(),run.student_id,run.game_id,'question:'||p_session_id||':'||p_uid,points) on conflict do nothing;
 end if;
 result:=jsonb_build_object('correct',correct,'points',points,'resolved',correct or p_action='reveal');
 insert into private.learning_receipts values(p_event_id,auth.uid(),p_session_id,p_uid,p_action,p_response,result);
 return result;
end;$$;

create function public.award_learning_milestone(p_student_id text,p_game_id text,p_world integer,p_kind text,p_session text default null) returns void
language plpgsql security definer set search_path='' as $$
declare run public.game_sessions; points integer; key text;
begin
 if not private.has_game_access(p_game_id) or not exists(select 1 from public.student_profiles where id=p_student_id and owner_id=auth.uid()) then raise exception 'Owned child and game access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id,0));
 if p_world not in (0,1,10,2,5,3,4,6,7,8,9,99) then raise exception 'Invalid world';end if;
 if p_kind='lesson' then points:=30;
 else
   select * into run from public.game_sessions where id=p_session and owner_id=auth.uid() and student_id=p_student_id and game_id=p_game_id and world_id=p_world and finished_at is not null;
   if not found or run.mode<>p_kind then raise exception 'Completed matching session required';end if;
   if p_kind in ('guided','practice') then points:=35;
   elsif p_kind='checkpoint' and run.score>=(case when p_world=99 then 90 else 85 end) then
     if p_world=99 and (select count(*) from public.game_progress gp cross join generate_series(1,10) a cross join generate_series(1,10) b
       where gp.student_id=p_student_id and gp.game_id=p_game_id
       and coalesce((gp.snapshot->'skills'->(a::text||'x'||b::text)->>'firstCorrect')::integer,0)>=2
       and coalesce((gp.snapshot->'skills'->(a::text||'x'||b::text)->>'streak')::integer,0)>=2
       and jsonb_array_length(coalesce(gp.snapshot->'skills'->(a::text||'x'||b::text)->'days','[]'))>=2)<100 then return;end if;
     points:=100;
   else return;end if;
 end if;
 key:='milestone:'||p_world::text||':'||p_kind;
 insert into public.learning_rewards(owner_id,student_id,game_id,reward_key,points) values(auth.uid(),p_student_id,p_game_id,key,points) on conflict do nothing;
end;$$;

create function private.guard_learning_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 select coalesce(sum(points),0)::integer into total from public.learning_rewards where student_id=new.student_id and game_id=new.game_id;
 new.snapshot:=jsonb_set(new.snapshot,'{xp}',to_jsonb(total));
 if tg_op='UPDATE' and auth.uid() is not null and (
   not coalesce(new.snapshot->'progress','{}'::jsonb) @> coalesce(old.snapshot->'progress','{}'::jsonb)
   or not coalesce(new.snapshot->'earnedBadges','[]'::jsonb) @> coalesce(old.snapshot->'earnedBadges','[]'::jsonb)
 ) then perform private.require_parent();end if;
 return new;
end;$$;
create trigger guard_learning_snapshot before insert or update on public.game_progress for each row execute function private.guard_learning_snapshot();
-- Every attempt now passes through the validating RPC, including retries from offline storage.
revoke insert on public.question_attempts from authenticated;
revoke insert(session_id,owner_id,student_id,question_uid,a,b,kind,shown_result,missing_side,action,response) on public.question_attempts from authenticated;
revoke all on function public.register_learning_questions(text,jsonb),public.record_learning_event(uuid,text,text,text,text),public.award_learning_milestone(text,text,integer,text,text),private.guard_learning_snapshot() from public,anon;
grant execute on function public.register_learning_questions(text,jsonb),public.record_learning_event(uuid,text,text,text,text),public.award_learning_milestone(text,text,integer,text,text) to authenticated;
commit;
