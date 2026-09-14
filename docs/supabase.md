# ClassPro revamp persistence

## Scope and current status

Both private-schema and legacy-containment migrations are applied remotely;
CLI 2.117.0 is linked to the
existing `classpro` project: `nnimfkjcnswmffdlkxcq`, Mumbai (`ap-south-1`),
PostgreSQL 15.14. Browser CLI login succeeded.
The organization is on the Free plan with no selected project add-ons. The user
confirmed using this existing deployment. Its Management API restore request was
accepted (HTTP 200); the final observed project/database/REST/Auth statuses are
`ACTIVE_HEALTHY`. No new project or paid resource was created. Destructive cleanup
scope is unresolved: do not remove existing tables or data. The restored original
`public.goscrape` and `public.gocal` tables are preserved.

Restore timing: early database health preceded completion of the backup restore.
An early additive migration was replaced by the restore, except its cluster role.
After all services and the project reported healthy, the safe restricted role was
validated and the migration reapplied, with remote migration history confirmed.
Always wait for project-level `ACTIVE_HEALTHY` before future migration runs.

Legacy `backend/README.md` defines `public.goscrape` and `public.gocal`.
The old database helper indexes academic data using a cookie-derived token.
`frontend/utils/Database/supabase.ts` reads `NEXT_PUBLIC_SERVICE_KEY`.
Those files are outside this task and unchanged. Do not carry that public-key
configuration into the revamp; if a real privileged key was shipped through it,
rotate it and remove the exposure separately. These are source findings, not
evidence of an exposed deployed credential.

Remote legacy exposure was contained by migration `20260914000200` after user
authorization. Both tables previously had RLS disabled and full table privileges
for anon/authenticated; the calendar sequence and delete RPC were also exposed.
Metadata inspection found no legacy policies, explicit column ACLs, inherited
browser role memberships, or public security-definer functions. The only public
function was `delete_from_gocal()`, a security-invoker DELETE function.

Exact containment changes:

- Revoke all table privileges on `public.goscrape` and `public.gocal` from PUBLIC,
  anon and authenticated; enable RLS on both with no browser policies.
- Revoke all privileges on `public.gocal_id_seq` from the same roles.
- Revoke EXECUTE on `public.delete_from_gocal()` from the same roles.
- Preserve postgres ownership and service_role table/sequence/function grants.
  Service_role has audited BYPASSRLS; no FORCE RLS or backend policy changes.

No legacy rows were read, changed or deleted. Existing backend requests using
service_role retain their database capabilities. Any old browser/client requests
using anon or authenticated now receive permission errors intentionally, including
calendar reads. A legacy backend using an anon key also loses access and must use
an audited server credential. This does not make a leaked service key safe: remove
any frontend service-key exposure and rotate a shipped key separately.

Remote checks passed: anon SELECT/INSERT/UPDATE/DELETE query plans are rejected on
both tables; effective table/column/sequence/RPC permissions are absent for anon
and authenticated. Service_role plans all four operations on both tables with
EXPLAIN only (no execution), and retains calendar function/sequence access.
Private tenant-isolation tests still pass; random test fixtures and temporary
membership grants were rolled back. Migration history contains both migrations.

Emergency rollback is stored outside automatic migrations at
`supabase/rollback/20260914000200_contain_legacy_public_access.sql`. It restores the
audited prior RLS flags and browser grants, including public RPC execution, and
therefore reopens the vulnerability. Do not run it without explicit approval and
alternative containment. It deletes no data. Local disposable-database tests
verified forward migration, access denial, service-role preservation and rollback.

The private schema is provisioned but application usage remains disabled: no
runtime LOGIN role/connection credentials were provisioned by this task, no Go
integration was added, and the verified student identity contract is pending.
`classpro_app` remains NOLOGIN with no persistent members.

The private migration stores only an attendance target and a manually maintained weekly
schedule. No passwords, upstream cookies, session tokens, raw portal responses,
names, registration numbers, attendance records, or marks are stored. It does not
migrate legacy data or change auth settings. The separately authorized containment
migration changes legacy permissions/RLS as detailed above, never row data.

## Backend contract for Hooke

There are no Supabase Auth identities. Never fabricate `auth.uid()` or accept a
database owner from a request body, URL, header, or localStorage. The Go backend
must first establish a stable student identifier from its authenticated upstream
session. A submitted username alone is insufficient. Until that contract exists,
keep persistence disabled and retain the existing local schedule behavior.

Derive `owner_key` as lowercase hex HMAC-SHA256 of a canonical, versioned identity
tuple (provider, institution, verified student ID), using a dedicated server-only
secret. Define canonicalization jointly with the session adapter. Never derive it
from password, cookie, bearer token, or session ID. This key is a pseudonym, not
an authentication credential. Rotation requires an explicit migration strategy.

Proposed application API seam, for backend review (not implemented here):

- GET/PATCH `/api/preferences`: validated integer `attendanceTarget`, 1–100.
- GET/PUT `/api/schedule`: full validated weekly schedule, at most 100 entries.
- DELETE `/api/persistence`: delete this owner's preferences and schedule.

Protect mutations with the application's session, CSRF/origin validation and
rate limits. Reject unknown fields. Import localStorage only after explicit user
action and normal validation; it is untrusted input. Handle unavailable storage
without breaking login or academic reads. Do not silently acknowledge failed saves.

## Database isolation

`classpro_private` is outside the Data API. Browser roles and `service_role`
receive no schema/table privileges. Both tables enable and force RLS. The
`classpro_app` role is NOLOGIN, NOBYPASSRLS and not an owner. A missing owner
context denies reads and writes. UPDATE checks both the old and new owner.

Provision a separate server login through a trusted database-admin session:
create a LOGIN role with NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
NOREPLICATION and NOBYPASSRLS; grant it `classpro_app`. Set its generated password
through the secure deployment secret workflow, never committed SQL or chat.
Do not give the application postgres/admin/service-role credentials. Do not grant
this membership to anon, authenticated, authenticator or service_role.

Every operation must use one transaction on one acquired connection:

```sql
begin;
set local role classpro_app;
select set_config('classpro.owner_key', $1, true);
select attendance_target
from classpro_private.student_preferences where owner_key = $1;
commit;
```

`$1` is a bound parameter containing the server-derived owner key. Bind all other
values too. `SET LOCAL` and transaction-local `set_config` prevent context leaking
between pooled requests. Roll back on every error. A full schedule replacement
must delete/insert for that owner in the same transaction. Owner keys supplied in
SQL are always backend-derived, even though RLS independently checks them.

RLS protects against omitted owner predicates and accidental cross-user writes.
It does not authenticate the Go server: that trusted role can set another owner
context. Compromise of its credential or SQL injection defeats that boundary.

## Server environment and usage budget

Required only when enabling persistence:

| Variable | Server-only purpose |
| --- | --- |
| `CLASSPRO_DATABASE_URL` | TLS Postgres/pooler URL for the dedicated restricted login |
| `CLASSPRO_OWNER_HMAC_KEY` | Independent random secret of at least 32 bytes |

These names are a proposed Go integration contract, not existing configuration.
Use Supabase's dashboard-provided connection string with certificate verification
(`sslmode=verify-full` and the provider CA where required). Prefer transaction
pooling for the small Render service. Bound the Go pool initially to 2 connections,
use transaction-compatible driver settings, and set query/request timeouts.
Never expose either variable through `NEXT_PUBLIC_*`, `VITE_*`, public assets,
logs, error responses, health checks, screenshots, or committed env files.
No Supabase URL/key is needed by the browser. No service key is needed by Go.

Load preferences/schedule on demand, cache by authenticated owner briefly in Go,
and invalidate after writes. Save only explicit user edits; debounce rapid changes.
No polling, realtime subscriptions, periodic heartbeats, or database calls from
liveness endpoints. Readiness may use a cached bounded check. External health
polling can prevent Render idle suspension; it does not extend free-tier runtime.
Never call Supabase on every login-animation frame or academic API request.
Set body limits and enforce the 100-entry schedule cap in Go; the database bounds
individual rows but does not impose a per-owner count or endpoint rate limit.

## Deployment procedure

1. Use authenticated CLI `npx --yes supabase@2.117.0 projects list`. Do not print
   access tokens, API keys or connection strings. Resume the confirmed existing
   project through the dashboard only when approved; do not create paid resources.
2. Link using `npx --yes supabase@2.117.0 link --project-ref <confirmed-ref>`.
   Enter database credentials privately if requested. `.temp/` is ignored.
3. Check existing role/schema names for collisions with `classpro_app` and
   `classpro_private`. Schema collisions fail. An existing role is accepted only
   if all restricted attributes match and it has no memberships. Inspect history;
   existing public tables are outside this migration and must remain untouched.
4. Run `npx --yes supabase@2.117.0 db push --linked --dry-run`, review the exact
   proposed migration, then apply the reviewed additive migration. Never run
   `db reset` against the remote database or push unrelated migrations.
5. Provision the restricted login, store secrets in Render, verify the backend
   identity contract and transaction handling, and run isolation checks before
   enabling persistence. Do not deploy a postgres/admin connection as a shortcut.

`supabase/config.toml` disables unneeded local services and uses PostgreSQL 15,
matching the discovered project. Local configuration does not disable hosted Auth,
Storage or Data API. Keep `classpro_private` out of hosted exposed schemas and
Realtime publications. No existing Supabase feature settings are changed here.

## Required verification

Test as the actual restricted deployment login, never only as postgres:
missing context returns no rows and rejects inserts; owner A can CRUD A; owner B
cannot read, update or delete A; ownership cannot be reassigned; transaction
rollback/commit clears role and context before pooled reuse. Verify anon,
authenticated and service_role cannot access the private schema. Verify invalid
targets, invalid times and oversized values fail. Include backend tests proving
request-supplied owner keys are ignored and unauthenticated calls never reach DB.
These are deployment gates, not a claim that backend integration already exists.

Remote verification: after full restore, the isolation SQL passed against actual
PostgreSQL 15 through the Management API, using random fixture owners and a
transaction-local test membership grant to postgres. All fixtures and that grant
were rolled back; zero remaining role memberships were verified. Migration
`20260914000100`, both private tables, their RLS policies, forced RLS, and denied
browser/service-role schema access were confirmed. Runtime-login/pooler testing
still awaits backend secret wiring and a verified student identity contract.

Local verification: the migration and `supabase/tests/isolation.sql` executed
successfully in isolated PGlite PostgreSQL with mocked Supabase role names.
Checks cover missing context, own reads, cross-owner read/update/delete/insert,
ownership reassignment, target/time constraints, transaction context cleanup and
private schema grants. No project dependencies were changed for this check.
Docker/Podman is unavailable, so a full local Supabase run and tests
through the actual pooler/deployment login remain outstanding. Run the SQL check
only in a disposable database: it uses synthetic owners and rolls back fixtures.
