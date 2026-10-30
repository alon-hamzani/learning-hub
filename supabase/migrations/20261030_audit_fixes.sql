-- Additive repair for existing Learning Hub installations. Run after both initial migrations.
begin;

alter policy progress_update on public.game_progress
with check (owner_id=(select auth.uid()) and (select private.has_game_access(game_id)) and
  exists(select 1 from public.student_profiles s
    where s.id=student_id and s.owner_id=(select auth.uid())));

-- Normalize digits before PostgreSQL evaluates the generated correctness column.
-- Avoid integer conversion of arbitrary untrusted strings.
create or replace function private.normalize_numeric_response() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.kind <> 'truefalse' and new.action='answer' and new.response ~ '^[0-9]+$' then
    new.response := coalesce(nullif(ltrim(new.response,'0'),''),'0');
  end if;
  return new;
end; $$;
revoke all on function private.normalize_numeric_response() from public;
create trigger normalize_numeric_response before insert on public.question_attempts
for each row execute function private.normalize_numeric_response();

-- Google confirmation can arrive after the initial auth.users insert.
create or replace function private.confirm_admin_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if lower(new.email)='alon.hamzani@gmail.com'
    and new.email_confirmed_at is not null
    and new.raw_app_meta_data->>'provider'='google' then
    update public.app_users set role='super_admin',status='approved',approved_at=coalesce(approved_at,now())
    where id=new.id and email='alon.hamzani@gmail.com' and role='user' and status='pending';
  end if;
  return new;
end; $$;
revoke all on function private.confirm_admin_identity() from public;
create trigger confirm_admin_identity after update of email_confirmed_at,raw_app_meta_data on auth.users
for each row execute function private.confirm_admin_identity();
commit;
