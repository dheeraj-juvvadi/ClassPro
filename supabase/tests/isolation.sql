begin;
set local role classpro_app;

do $$
begin
  begin
    insert into classpro_private.student_preferences(owner_key)
    values (repeat('a', 64));
    raise exception 'missing context allowed insertion';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('classpro.owner_key', repeat('a', 64), true);
insert into classpro_private.student_preferences(owner_key) values (repeat('a', 64));
insert into classpro_private.schedule_entries
  (owner_key, weekday, starts_at, ends_at, course_code, course_title)
values (repeat('a', 64), 1, '10:30', '12:30', 'CS101', 'Data Structures');

do $$
begin
  if (select count(*) from classpro_private.student_preferences) <> 1 then
    raise exception 'owner cannot read own preferences';
  end if;
  begin
    update classpro_private.student_preferences set owner_key = repeat('b', 64);
    raise exception 'ownership reassignment succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update classpro_private.student_preferences set attendance_target = 101;
    raise exception 'invalid attendance target accepted';
  exception when check_violation then null;
  end;
  begin
    update classpro_private.schedule_entries set ends_at = '09:00';
    raise exception 'invalid schedule time accepted';
  exception when check_violation then null;
  end;
end;
$$;

select set_config('classpro.owner_key', repeat('b', 64), true);
do $$
declare
  affected integer;
begin
  if exists (select 1 from classpro_private.student_preferences)
    or exists (select 1 from classpro_private.schedule_entries) then
    raise exception 'cross-owner read succeeded';
  end if;
  update classpro_private.student_preferences set attendance_target = 80;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner update succeeded'; end if;
  delete from classpro_private.schedule_entries;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner delete succeeded'; end if;
  begin
    insert into classpro_private.student_preferences(owner_key)
    values (repeat('c', 64));
    raise exception 'cross-owner insert succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

do $$
declare
  role_name text;
begin
  if nullif(current_setting('classpro.owner_key', true), '') is not null then
    raise exception 'owner context leaked beyond transaction';
  end if;
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(role_name, 'classpro_private', 'USAGE') then
      raise exception 'unexpected schema access: %', role_name;
    end if;
  end loop;
end;
$$;
