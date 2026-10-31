begin;
create table private.parent_pins (
  owner_id uuid primary key references public.app_users(id) on delete cascade,
  pin_hash text not null, failed integer not null default 0,
  locked_until timestamptz, updated_at timestamptz not null default now()
);
create table private.parent_unlocks (
  owner_id uuid not null references public.app_users(id) on delete cascade,
  session_id text not null, expires_at timestamptz not null,
  primary key(owner_id,session_id)
);
revoke all on private.parent_pins,private.parent_unlocks from public,anon,authenticated;

create function private.pin_crypt(p_pin text,p_hash text default null) returns text
language plpgsql security definer set search_path='' as $$
declare ns text; result text;
begin
  select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if ns is null then raise exception 'pgcrypto is required'; end if;
  if p_hash is null then
    execute format('select %I.crypt($1,%I.gen_salt(''bf'',10))',ns,ns) into result using p_pin;
  else execute format('select %I.crypt($1,$2)',ns) into result using p_pin,p_hash;
  end if;
  return result;
end; $$;
revoke all on function private.pin_crypt(text,text) from public,anon,authenticated;

create function public.parent_pin_status() returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object('configured',exists(select 1 from private.parent_pins where owner_id=auth.uid()));
$$;
create function private.require_parent() returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_approved() or not exists(
    select 1 from private.parent_unlocks where owner_id=auth.uid()
    and session_id=coalesce(auth.jwt()->>'session_id','') and session_id<>'' and expires_at>now()
  ) then raise exception 'Parent PIN required' using errcode='42501';end if;
end;$$;
revoke all on function private.require_parent() from public,anon,authenticated;
create function public.parent_authorized() returns boolean
language plpgsql security definer set search_path='' as $$
begin perform private.require_parent();return true;end;$$;
revoke all on function public.parent_authorized() from public,anon;
grant execute on function public.parent_authorized() to authenticated;

create function public.set_parent_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_approved() or p_pin !~ '^[0-9]{4}$' or p_pin is null then
    raise exception 'Approved account and four digits required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,117));
  if exists(select 1 from private.parent_pins where owner_id=auth.uid()) then perform private.require_parent();end if;
  insert into private.parent_pins(owner_id,pin_hash) values(auth.uid(),private.pin_crypt(p_pin))
    on conflict(owner_id) do update set pin_hash=excluded.pin_hash,failed=0,locked_until=null,updated_at=now();
  delete from private.parent_unlocks where owner_id=auth.uid();
  return jsonb_build_object('ok',true);
end;$$;
create function public.verify_parent_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row private.parent_pins; sid text:=coalesce(auth.jwt()->>'session_id','');
begin
  if auth.uid() is null or not private.is_approved() or sid='' then raise exception 'Approved session required' using errcode='42501';end if;
  select * into row from private.parent_pins where owner_id=auth.uid() for update;
  if not found then return jsonb_build_object('ok',false);end if;
  if row.locked_until>now() then return jsonb_build_object('ok',false,'locked',true);end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or private.pin_crypt(p_pin,row.pin_hash)<>row.pin_hash then
    update private.parent_pins set failed=case when locked_until<=now() then 1 else failed+1 end,
      locked_until=case when (case when locked_until<=now() then 1 else failed+1 end)>=5 then now()+interval '5 minutes' else null end
      where owner_id=auth.uid();
    return jsonb_build_object('ok',false,'locked',(select locked_until>now() from private.parent_pins where owner_id=auth.uid()));
  end if;
  update private.parent_pins set failed=0,locked_until=null where owner_id=auth.uid();
  insert into private.parent_unlocks values(auth.uid(),sid,now()+interval '5 minutes')
    on conflict(owner_id,session_id) do update set expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true);
end;$$;

create or replace function public.delete_student_profile(p_student_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_parent();
  perform pg_advisory_xact_lock(hashtextextended(p_student_id,0));
  delete from public.student_profiles where id=p_student_id and owner_id=auth.uid();
  if not found then raise exception 'Profile not found' using errcode='42501';end if;
end;$$;

create function public.reset_game_profile(p_student_id text,p_game_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_parent();
  if not private.has_game_access(p_game_id) then raise exception 'Game access required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id,0));
  update public.game_progress set snapshot=jsonb_build_object(
    'id',p_student_id,'name',snapshot->>'name','avatar',snapshot->>'avatar','joined',snapshot->'joined',
    'xp',0,'sound',coalesce(snapshot->'sound','false'::jsonb),'progress','{}'::jsonb,'skills','{}'::jsonb,'activity','[]'::jsonb,'earnedBadges','[]'::jsonb),revision=revision+1
    where student_id=p_student_id and game_id=p_game_id and owner_id=auth.uid();
  if not found then raise exception 'Profile not found' using errcode='42501';end if;
end;$$;
revoke all on function public.parent_pin_status(),public.set_parent_pin(text),public.verify_parent_pin(text),public.reset_game_profile(text,text) from public,anon;
grant execute on function public.parent_pin_status(),public.set_parent_pin(text),public.verify_parent_pin(text),public.reset_game_profile(text,text) to authenticated;
commit;
