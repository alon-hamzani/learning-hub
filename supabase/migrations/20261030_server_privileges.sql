-- Explicit least-privilege grants for the three authenticated Edge Functions.
-- Some projects disable automatic table grants, including service_role grants.
begin;
grant usage on schema public to service_role;
grant select, update on public.app_users to service_role;
grant select, insert, update on public.games to service_role;
grant select, insert, delete on public.user_game_permissions to service_role;
grant insert on public.admin_audit to service_role;
grant usage, select on sequence public.admin_audit_id_seq to service_role;
grant select, insert, update, delete on public.approval_notifications to service_role;
commit;
