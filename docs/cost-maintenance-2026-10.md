# Cost maintenance review — October 2, 2026

Local evidence only; no live billing, cloud inventory, credentials, production logs,
deployments, commits, or external writes were accessed or performed. Existing
dirty files were preserved. Auth, exams, frontend, and backend were out of scope.

## Evidence and next actions

| Finding | Evidence | Action / limit |
| --- | --- | --- |
| Disk saving already applied | [September review](../ops/azure/cost-review.md) records P4 → E4: INR 504.44 → 252.24/month, plus SSD transactions. | Historical quoted reduction: INR 252.20/month; **not new savings**. Reconcile against October billing before claiming realized savings. Keep current capacity. |
| README changes can select unnecessary Vercel builds | `shouldBuild(['portal-app/README.md'])` returns `true`; CI scope returns both `false`. See `scripts/vercel-ignore.mjs:7`. | Consider an exact README exemption after confirming deployment inputs. Missing previous deployment must still build; never ignore all Markdown indiscriminately. No shared script edited. |
| Scope-test changes select both production paths | `scripts/ci-scope.mjs:10` selects all `scripts/` changes; workflow already runs scope tests before detection. | Separate validation from deployment eligibility in follow-up. Add regression coverage before changing this dirty shared file. No measured minutes or money saved. |
| Local docs releases still run all suites | `scripts/release.mjs:32–38` always installs/builds frontend and tests backend. | Potential local execution reduction only. Any future scoping must compare the complete pending release against the deployment base, preserving staged-snapshot validation. |
| Release-log accumulation is unmeasured | [Release guide](releasing.md) identifies per-SHA `build.log`/`tests.log` and retained rollback containers; it defines no retention period. | New offline audit below measures review candidates without cleanup. Reclaiming files would create disk headroom, not lower a provisioned disk's monthly rate. |
| Daily backup storage needs inventory | `ops/azure/backup/anon-backup.timer:4` schedules daily execution. | Confirm timer activation, object count/bytes, lifecycle rules, and restore requirements. Repository schedule alone proves neither current storage usage nor absent cloud retention. |

## Completed maintenance

Added `ops/azure/release-log-audit.py` and six offline tests. Before: no local
release-log retention inventory. After: bounded JSON reports counts, logical
bytes, and at most 20 candidates (configurable to 50), using metadata only.
It never reads file contents or changes files and has no apply mode.

Run against an authorized local release directory:

```sh
python3 ops/azure/release-log-audit.py /path/to/releases --keep-days 30 --keep-newest 3
```

Repeat `--protect FULL_SHA` for active/rollback releases. Directory mtime defines
“newest”; it does not identify the active deployment. Symlink entries, hardlinked
logs, unnamed files, recent logs/directories, and protected releases are excluded.
Use a quiescent directory; results are review candidates, not deletion approval
or guaranteed reclaimable allocated bytes. No production inventory was run.

## Verification and remaining chores

- Six Python audit tests passed on Python 3.14.7, including preservation and no-content-read checks.
- Three existing pure CI/Vercel scope tests passed on Node 26.8.1. The Git-fixture test was excluded because it creates commits; release automation was not run.
- `git diff --check -- scripts ops` passed; new-file whitespace checked separately.
- Backlog remains open: observe an actual docs-only deployment skip, review sanitized client-error summaries, inventory legacy assets, and measure mixed-load capacity. These need separate ownership or live evidence; none is marked shipped here.
