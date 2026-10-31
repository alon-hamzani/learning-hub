-- Legacy points already include completed-stage bonuses. Reserve those reward keys
-- without awarding them again when an existing child repeats an old stage.
begin;
insert into public.learning_rewards(owner_id,student_id,game_id,reward_key,points)
select gp.owner_id,gp.student_id,gp.game_id,'milestone:'||world.key||':'||stage.key,0
from public.game_progress gp
cross join lateral jsonb_each(coalesce(gp.snapshot->'progress','{}'::jsonb)) world
cross join lateral jsonb_each(world.value) stage
where stage.key in ('lesson','guided','practice','checkpoint') and stage.value='true'::jsonb
and exists(select 1 from public.learning_rewards baseline
  where baseline.student_id=gp.student_id and baseline.game_id=gp.game_id and baseline.reward_key='baseline')
on conflict(student_id,game_id,reward_key) do nothing;
commit;
