begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  table_name text;
  privilege_name text;
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'service_role must retain audited RLS bypass';
  end if;

  foreach table_name in array array['goscrape', 'gocal'] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if not has_table_privilege('service_role', format('public.%I', table_name),
          privilege_name) then
          raise exception 'Missing service role % on %', privilege_name, table_name;
        end if;
      end loop;
      execute format('revoke all privileges on table public.%I
        from public, anon, authenticated', table_name);
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;

  if to_regclass('public.gocal_id_seq') is not null then
    revoke all privileges on sequence public.gocal_id_seq
      from public, anon, authenticated;
  end if;

  if to_regprocedure('public.delete_from_gocal()') is not null then
    revoke all privileges on function public.delete_from_gocal()
      from public, anon, authenticated;
  end if;
end;
$$;

commit;
