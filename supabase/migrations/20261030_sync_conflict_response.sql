-- Business conflicts return HTTP 409 instead of retryable transaction failures.
begin;
create or replace function public.save_game_profile(p_student_id text, p_game_id text, p_snapshot jsonb, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_revision bigint;
  v_student_owner uuid;
begin
  if v_owner is null or not private.has_game_access(p_game_id) then
    raise exception 'Game access required' using errcode='42501';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot->>'id' is distinct from p_student_id
    or length(trim(coalesce(p_snapshot->>'name',''))) not between 1 and 22
    or length(coalesce(p_snapshot->>'avatar','')) not between 1 and 16 then
    raise exception 'Invalid profile' using errcode='22023';
  end if;
  -- One lock per child serializes first inserts, writes and explicit deletion across games.
  perform pg_advisory_xact_lock(hashtextextended(p_student_id,0));
  select owner_id into v_student_owner from public.student_profiles where id=p_student_id for update;
  if found and v_student_owner <> v_owner then
    raise exception 'Profile ownership required' using errcode='42501';
  end if;
  select revision into v_revision from public.game_progress
    where student_id=p_student_id and game_id=p_game_id for update;
  if v_revision is distinct from p_expected_revision then
    raise exception 'Progress changed on another device. Reload before continuing.' using errcode='PT409';
  end if;
  if v_student_owner is null and p_expected_revision is not null then
    raise exception 'Profile no longer exists. Reload before continuing.' using errcode='PT409';
  end if;
  insert into public.student_profiles(id,owner_id,name,avatar)
    values(p_student_id,v_owner,trim(p_snapshot->>'name'),p_snapshot->>'avatar')
    on conflict(id) do update set name=excluded.name,avatar=excluded.avatar;
  insert into public.game_progress(owner_id,student_id,game_id,snapshot,revision)
    values(v_owner,p_student_id,p_game_id,p_snapshot - '_revision',1)
    on conflict(student_id,game_id) do update set snapshot=excluded.snapshot,revision=public.game_progress.revision+1
    returning revision into v_revision;
  return v_revision;
end;
$$;

commit;
