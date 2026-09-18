# Production releases

Stage only the completed agenda. The release command validates that exact Git
index snapshot in a temporary directory, commits it, and pushes to `revamp/main`.
Unstaged work is excluded. No force push or automatic staging is performed.

For frontend edits, run `npm run build:offline` from portal-app before staging.
Include the generated index.html asset hashes and service-worker.js. Build
validation fails if the staged offline shell does not match its public assets.

```sh
PLAYWRIGHT_CHANNEL=chrome RELEASE_PYTHON=/tmp/anon-release-venv/bin/python \
  node scripts/release.mjs "Describe the completed agenda"
```

Requirements: Node 22+, npm, Git, Chrome (or installed Playwright Chromium), and
a Python 3.11 environment containing `ratio-diagnostic/requirements.txt`.
Without `PLAYWRIGHT_CHANNEL`, install Chromium with `npx playwright install chromium`
from portal-app. Local tests must pass before any commit or push occurs.

Vercel's GitHub integration deploys the frontend from `portal-app/public`.
The GitHub workflow independently runs static checks, browser tests, a Docker
build, and backend tests. Successful main-branch runs deploy Azure; pull requests
only validate. Vercel and Azure are separate deployments, not an atomic release.
Keep API changes backward compatible across the two deployment windows.

Azure uses repository secrets `AZURE_DEPLOY_KEY`, `AZURE_KNOWN_HOSTS` and variable
`AZURE_DEPLOY_HOST`. Its dedicated SSH key is restricted in authorized_keys to
`/usr/local/bin/anon-github-deploy`; it cannot open an ordinary shell or tunnel.
The host command accepts a 40-character commit SHA and a source archive, serializes
deployments with flock, builds `classpro-diag:git-<sha>` and reruns backend tests.
Build and test failure leaves the current container running. The replacement
preserves configuration and the session-data mount. A failed local health check
automatically restarts the previous container.

The workflow requires `contents:read`; production secrets are unavailable to
fork pull requests. Action versions are pinned to reviewed commit hashes.

## Rollback and investigation

Check GitHub Actions logs and the VM's `/home/azureuser/anon-releases/<sha>/`
build.log/tests.log. Operational service logs come from `docker logs classpro-azure`.
The previous container is retained as `classpro-azure-rollback-<sha prefix>`.
For a manual rollback, stop the new container, rename it for inspection, rename
the selected rollback container to classpro-azure, and start it. Keep the shared
session mount. Do not restore an old session database over current user data.

The service's live session response and health check do not prove real-account
authentication or sustainable simultaneous login capacity.
