begin;
create function public.admin_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select jsonb_build_object(
    'users',(select count(*) from public.app_users),
    'approved',(select count(*) from public.app_users where status='approved'),
    'pending',(select count(*) from public.app_users where status='pending'),
    'games',(select count(*) from public.games),
    'active7',(select count(distinct owner_id) from public.activity_events where created_at>=now()-interval '7 days'),
    'active30',(select count(distinct owner_id) from public.activity_events where created_at>=now()-interval '30 days'),
    'finished',(select count(*) from public.game_sessions where finished_at is not null and score is not null),
    'average',(select coalesce(round(avg(score)),0) from public.game_sessions where finished_at is not null and score is not null),
    'byUser',coalesce((select jsonb_object_agg(owner_id,stats) from (
      select owner_id,jsonb_build_object('sessions',count(*),'average',round(avg(score))) stats
      from public.game_sessions group by owner_id) s),'{}'::jsonb),
    'byGame',coalesce((select jsonb_object_agg(g.id,jsonb_build_object(
      'sessions',(select count(*) from public.game_sessions where game_id=g.id and finished_at is not null and score is not null),
      'users',(select count(distinct owner_id) from public.game_sessions where game_id=g.id and finished_at is not null and score is not null),
      'average',(select round(avg(score)) from public.game_sessions where game_id=g.id and finished_at is not null and score is not null),
      'grants',(select count(*) from public.user_game_permissions where game_id=g.id))) from public.games g),'{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_dashboard_summary() from public,anon;
grant execute on function public.admin_dashboard_summary() to authenticated;
commit;
