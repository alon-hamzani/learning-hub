begin;
alter table public.question_attempts add column event_order bigint generated always as identity;
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
      (array_agg((action='answer' and correct) order by event_order))[1] as first_clean
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
