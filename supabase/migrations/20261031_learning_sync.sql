begin;
create table private.learning_operations (
 id uuid primary key,owner_id uuid not null references public.app_users(id) on delete cascade,
 kind text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
revoke all on private.learning_operations from public,anon,authenticated;
create function private.record_mini_interaction(p_event uuid,p_student text,p_game text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare q jsonb:=p_payload->'question';sid text:='mini_'||(p_payload->'question'->>'uid');run public.game_sessions;result jsonb;
begin
 if not private.has_game_access(p_game) or not exists(select 1 from public.student_profiles where id=p_student and owner_id=auth.uid()) then raise exception 'Owned child required';end if;
 select * into run from public.game_sessions where id=sid;
 if not found then
   insert into public.game_sessions(id,owner_id,student_id,world_id,mode,question_count,game_id)
   values(sid,auth.uid(),p_student,(q->>'a')::integer,'mini',1,p_game);
   perform public.register_learning_questions(sid,jsonb_build_array(q));
 elsif run.owner_id<>auth.uid() or run.student_id<>p_student or run.game_id<>p_game then raise exception 'Owned run required';end if;
 result:=public.record_learning_event(p_event,sid,q->>'uid',p_payload->>'action',p_payload->>'response');
 if (result->>'resolved')::boolean then perform public.finalize_game(sid);end if;
end;$$;
revoke all on function private.record_mini_interaction(uuid,text,text,jsonb) from public,anon,authenticated;
create function public.sync_learning_operation(p_operation_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous private.learning_operations; run public.game_sessions; sid text; child text; game text:=p_payload->>'gameId'; result jsonb:='{}'; revision bigint; meta jsonb;
begin
 if auth.uid() is null or not private.has_game_access(game) then raise exception 'Game access required' using errcode='42501';end if;
 -- Serialize operations from two devices and make lost-response retries safe.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,444));
 select * into previous from private.learning_operations where id=p_operation_id;
 if found then
  if previous.owner_id<>auth.uid() or previous.kind<>p_kind or previous.payload<>p_payload then raise exception 'Operation identifier reused';end if;
  return previous.result;
 end if;
 case p_kind
 when 'profile' then
   child:=p_payload->'snapshot'->>'id';
   revision:=public.save_game_profile(child,game,p_payload->'snapshot',(p_payload->>'revision')::bigint);
   result:=jsonb_build_object('revision',revision);
 when 'run' then
   child:=p_payload->'run'->>'studentId';sid:=p_payload->'run'->>'id';
   if not exists(select 1 from public.student_profiles where id=child and owner_id=auth.uid()) then raise exception 'Owned child required';end if;
   insert into public.game_sessions(id,owner_id,student_id,world_id,mode,question_count,game_id)
   values(sid,auth.uid(),child,(p_payload->'run'->>'worldId')::integer,p_payload->'run'->>'mode',(p_payload->'run'->>'count')::integer,game);
   perform public.register_learning_questions(sid,p_payload->'run'->'questions');
 when 'answer' then
   result:=public.record_learning_event(p_operation_id,p_payload->>'sessionId',p_payload->'question'->>'uid',p_payload->>'action',p_payload->>'response');
   select student_id into child from public.game_sessions where id=p_payload->>'sessionId' and owner_id=auth.uid() and game_id=game;
 when 'finish' then
   sid:=p_payload->>'sessionId';
   result:=public.finalize_game(sid);
   select * into run from public.game_sessions where id=sid and owner_id=auth.uid() and game_id=game;
   if not found then raise exception 'Owned run required';end if;
   child:=run.student_id;
   perform public.award_learning_milestone(child,game,run.world_id,run.mode,sid);
 when 'module' then
   child:=p_payload->>'studentId';
   if not exists(select 1 from public.student_profiles where id=child and owner_id=auth.uid()) then raise exception 'Owned child required';end if;
   if p_payload->>'eventKind'='mini_interaction' then perform private.record_mini_interaction(p_operation_id,child,game,p_payload->'payload');end if;
   insert into public.game_events(owner_id,student_id,game_id,event_kind,payload) values(auth.uid(),child,game,left(p_payload->>'eventKind',70),coalesce(p_payload->'payload','{}'));
 when 'activity' then
   child:=p_payload->>'studentId';meta:=coalesce(p_payload->'meta','{}');
   if child is not null and not exists(select 1 from public.student_profiles where id=child and owner_id=auth.uid()) then raise exception 'Owned child required';end if;
   if p_payload->>'kind'='lesson_completed' then perform public.award_learning_milestone(child,game,(meta->>'worldId')::integer,'lesson');end if;
   insert into public.activity_events(owner_id,student_id,game_id,event_type,payload) values(auth.uid(),child,game,p_payload->>'kind',meta);
 else raise exception 'Unknown operation';
 end case;
 if child is not null then
   update public.game_progress set snapshot=jsonb_set(snapshot,'{xp}',to_jsonb((select coalesce(sum(points),0)::integer from public.learning_rewards where student_id=child and game_id=game)))
   where student_id=child and game_id=game and owner_id=auth.uid();
 end if;
 insert into private.learning_operations(id,owner_id,kind,payload,result) values(p_operation_id,auth.uid(),p_kind,p_payload,result);
 return result;
end;$$;
revoke all on function public.sync_learning_operation(uuid,text,jsonb) from public,anon;
grant execute on function public.sync_learning_operation(uuid,text,jsonb) to authenticated;

create or replace function public.reset_game_profile(p_student_id text,p_game_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_parent();
 if not private.has_game_access(p_game_id) then raise exception 'Game access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,444));
 perform pg_advisory_xact_lock(hashtextextended(p_student_id,0));
 if not exists(select 1 from public.student_profiles where id=p_student_id and owner_id=auth.uid()) then raise exception 'Owned child required';end if;
 delete from public.learning_rewards where student_id=p_student_id and game_id=p_game_id and owner_id=auth.uid();
 update public.game_progress set snapshot=jsonb_build_object('id',p_student_id,'name',snapshot->>'name','avatar',snapshot->>'avatar','joined',snapshot->'joined',
 'xp',0,'sound',coalesce(snapshot->'sound','false'::jsonb),'progress','{}'::jsonb,'skills','{}'::jsonb,'activity','[]'::jsonb,'earnedBadges','[]'::jsonb),revision=revision+1
 where student_id=p_student_id and game_id=p_game_id and owner_id=auth.uid();
 if not found then raise exception 'Profile not found';end if;
end;$$;

create or replace function private.guard_learning_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 select coalesce(sum(points),0)::integer into total from public.learning_rewards where student_id=new.student_id and game_id=new.game_id;
 new.snapshot:=jsonb_set(new.snapshot,'{xp}',to_jsonb(total));
 if tg_op='UPDATE' and auth.uid() is not null and (
   exists(select 1 from jsonb_each(coalesce(old.snapshot->'progress','{}')) w cross join jsonb_each(w.value) flag
     where flag.key in ('lesson','guided','practice','checkpoint') and flag.value='true'::jsonb and new.snapshot->'progress'->w.key->flag.key is distinct from 'true'::jsonb)
   or not coalesce(new.snapshot->'earnedBadges','[]'::jsonb) @> coalesce(old.snapshot->'earnedBadges','[]'::jsonb)
   or exists(select 1 from jsonb_each(coalesce(old.snapshot->'skills','{}')) skill
     where coalesce((new.snapshot->'skills'->skill.key->>'seen')::integer,0)<coalesce((skill.value->>'seen')::integer,0))
 ) then perform private.require_parent();end if;
 return new;
end;$$;
commit;
