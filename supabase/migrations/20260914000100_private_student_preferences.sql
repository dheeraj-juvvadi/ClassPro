begin;

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'classpro_app') then
    if exists (
      select 1 from pg_catalog.pg_roles
      where rolname = 'classpro_app' and
        (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or
         rolinherit or rolreplication or rolbypassrls)
    ) or exists (
      select 1 from pg_catalog.pg_auth_members
      where roleid = 'classpro_app'::regrole or member = 'classpro_app'::regrole
    ) then
      raise exception 'classpro_app has unexpected privileges or memberships';
    end if;
  else
    create role classpro_app nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
end;
$$;

create schema classpro_private;
revoke all on schema classpro_private from public, anon, authenticated, service_role;
grant usage on schema classpro_private to classpro_app;

create table classpro_private.student_preferences (
  owner_key text primary key check (owner_key ~ '^[a-f0-9]{64}$'),
  attendance_target smallint not null default 75
    check (attendance_target between 1 and 100)
);

create table classpro_private.schedule_entries (
  owner_key text not null check (owner_key ~ '^[a-f0-9]{64}$'),
  entry_id uuid not null default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  course_code text not null check (length(course_code) between 1 and 64),
  course_title text not null check (length(course_title) between 1 and 160),
  location text not null default '' check (length(location) <= 160),
  primary key (owner_key, entry_id),
  check (ends_at > starts_at)
);

revoke all on all tables in schema classpro_private
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema classpro_private
  to classpro_app;

alter table classpro_private.student_preferences enable row level security;
alter table classpro_private.student_preferences force row level security;
alter table classpro_private.schedule_entries enable row level security;
alter table classpro_private.schedule_entries force row level security;

create policy owner_only on classpro_private.student_preferences
  for all to classpro_app
  using (owner_key = nullif(current_setting('classpro.owner_key', true), ''))
  with check (owner_key = nullif(current_setting('classpro.owner_key', true), ''));

create policy owner_only on classpro_private.schedule_entries
  for all to classpro_app
  using (owner_key = nullif(current_setting('classpro.owner_key', true), ''))
  with check (owner_key = nullif(current_setting('classpro.owner_key', true), ''));

commit;
