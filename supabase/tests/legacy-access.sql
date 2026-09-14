begin;

do $$
declare
  table_name text;
  role_name text;
  privilege_name text;
begin
  foreach table_name in array array['goscrape', 'gocal'] loop
    if not (select relrowsecurity from pg_catalog.pg_class
      where oid = format('public.%I', table_name)::regclass) then
      raise exception 'RLS disabled on %', table_name;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
      foreach privilege_name in array array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ] loop
        if has_table_privilege(role_name, format('public.%I', table_name), privilege_name) then
          raise exception 'Unexpected % % on %', role_name, privilege_name, table_name;
        end if;
      end loop;
      if has_any_column_privilege(role_name, format('public.%I', table_name),
        'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Unexpected column access for % on %', role_name, table_name;
      end if;
    end loop;
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', format('public.%I', table_name), privilege_name) then
        raise exception 'Service role lost % on %', privilege_name, table_name;
      end if;
    end loop;
  end loop;

  foreach role_name in array array['anon', 'authenticated'] loop
    if has_sequence_privilege(role_name, 'public.gocal_id_seq', 'SELECT,UPDATE,USAGE')
      or has_function_privilege(role_name, 'public.delete_from_gocal()', 'EXECUTE') then
      raise exception 'Unexpected calendar sequence/function access for %', role_name;
    end if;
  end loop;
  if not (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role')
    or not has_function_privilege('service_role', 'public.delete_from_gocal()', 'EXECUTE')
    or not has_sequence_privilege('service_role', 'public.gocal_id_seq', 'USAGE') then
    raise exception 'Service role calendar/RLS capability changed';
  end if;
end;
$$;

set local role anon;
do $$
declare
  query_text text;
begin
  foreach query_text in array array[
    'explain select 1 from public.goscrape where false',
    'explain insert into public.goscrape default values',
    'explain update public.goscrape set token = token where false',
    'explain delete from public.goscrape where false',
    'explain select 1 from public.gocal where false',
    'explain insert into public.gocal default values',
    'explain update public.gocal set event = event where false',
    'explain delete from public.gocal where false'
  ] loop
    begin
      execute query_text;
      raise exception 'Anonymous operation unexpectedly permitted: %', query_text;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

rollback;
