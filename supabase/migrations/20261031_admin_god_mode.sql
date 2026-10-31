begin;
-- Pin the existing verified Google administrator once. This is an allowlist,
-- not a setting that clients (or future administrators) can assign themselves.
create table private.god_mode_owner (
 singleton boolean primary key default true check(singleton),
 owner_id uuid not null unique references auth.users(id) on delete cascade
);
alter table private.god_mode_owner enable row level security;
revoke all on private.god_mode_owner from public,anon,authenticated;
insert into private.god_mode_owner(singleton,owner_id)
select true,u.id from public.app_users u join auth.users a on a.id=u.id
where u.email='alon.hamzani@gmail.com' and u.role='super_admin' and u.status='approved'
and a.email_confirmed_at is not null and a.raw_app_meta_data->>'provider'='google';
do $$ begin
 if (select count(*) from private.god_mode_owner)<>1 then raise exception 'Verified project owner must exist before installing God Mode';end if;
end;$$;

create function public.god_mode_capability() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed boolean;
begin
 select exists(select 1 from private.god_mode_owner pinned
   join public.app_users u on u.id=pinned.owner_id join auth.users a on a.id=u.id
   where u.id=auth.uid() and u.role='super_admin' and u.status='approved'
   and u.email='alon.hamzani@gmail.com' and a.email_confirmed_at is not null
   and a.raw_app_meta_data->>'provider'='google'
   and coalesce(auth.jwt()->>'session_id','')<>'') into allowed;
 return jsonb_build_object('allowed',allowed,'session_key',case when allowed then auth.jwt()->>'session_id' else null end);
end;$$;
revoke all on function public.god_mode_capability() from public,anon;
grant execute on function public.god_mode_capability() to authenticated;

create function private.reject_sandbox_profile() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.id like 'god-mode:%' then raise exception 'Sandbox profiles cannot be persisted' using errcode='22023';end if;
 return new;
end;$$;
revoke all on function private.reject_sandbox_profile() from public,anon,authenticated;
create trigger reject_sandbox_profile before insert or update on public.student_profiles
for each row execute function private.reject_sandbox_profile();
commit;
