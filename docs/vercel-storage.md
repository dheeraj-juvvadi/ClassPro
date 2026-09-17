# Vercel deployment storage

Team: `dheeraj-chandras-projects`. Production app: `revamp-tracker`, served at
`anon-tracker.vercel.app`. Storage cleanup was requested on September 17, 2026
after the team reached its 10 GB included deployment-storage allowance.

The inventory contained 324 deployments across 34 projects. Cleanup targets only
obsolete deployments with no current alias and empty projects with no deployment,
domain or Git connection. All currently aliased deployments and the two newest
successful deployments per project are protected. Aliases were checked again
immediately before deletion. Final readback: 269 deployments removed, 55 retained,
all 76 aliases unchanged. The eight apparently empty projects were retained after
their final domain checks showed assigned domains. Live projects, Git repositories
and databases remain.

The 26 nonempty projects now have seven-day preview/production retention and
one-day cancelled/errored retention, verified by API readback. Vercel's protected
deployment exceptions still apply; this is not a strict retained-count limit.

Anon ships 13,555,778 bytes of duplicate precompressed OCR siblings in its source
tree. `portal-app/public/.vercelignore` excludes those ten `.br`/`.gz` siblings
from Vercel uploads. Original OCR files remain, as does local Express compression.
Production HEAD requests confirm that the original ONNX and WASM assets already
receive Brotli encoding. Verify exclusion on the next deployed revision.

Vercel CLI `usage --group-by project --json` and the billing charges API both
returned `Costs not found` for this Hobby team. The available browser requires
Vercel login. No refreshed storage total or exact reclaimed GB is established by
the deletion count. The user subsequently confirmed the dashboard showed 2 GB,
down from the 10 GB warning. Retention/recovery and usage refresh can delay reclamation;
do not equate removed deployment count with an immediate billing-counter reset.

Operational checks:

- List deployments and aliases before cleanup; preserve live aliases and rollback.
- Inspect project `deploymentExpiration` after changing retention.
- Check production home, favicon, API session and original OCR assets afterward.
- Compare Deployment Storage and Functions Storage in team Usage when available.

References: Vercel Deployment Storage, Optimize Deployment Storage, Deployment
Retention, CDN Compression, and the official Terraform provider's
`client/project_deployment_retention.go` (retention API contract).
