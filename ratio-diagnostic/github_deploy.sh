#!/usr/bin/env bash
# Forced SSH command for the GitHub deployment key. Receives one source archive.
set -euo pipefail
umask 077
revision="${SSH_ORIGINAL_COMMAND:-}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a commit SHA'; exit 1; }
exec 9>/home/azureuser/anon-github-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
release="/home/azureuser/anon-releases/$revision"
mkdir -p "$release"
tar --extract --gzip --file=- --directory="$release" --no-same-owner
cd "$release"
image="classpro-diag:git-$revision"
sudo docker build -f ratio-diagnostic/Dockerfile -t "$image" . > build.log 2>&1 || {
  tail -30 build.log; exit 1;
}
sudo docker run --rm --network none -e APP_ORIGIN=http://localhost:8089 "$image" \
  python -m unittest discover > tests.log 2>&1 || { tail -30 tests.log; exit 1; }
grep -E '^Ran |^OK$' tests.log
sudo DEPLOY_IMAGE="$image" ROLLBACK_NAME="classpro-azure-rollback-${revision:0:12}" \
  python3 ratio-diagnostic/deploy_azure.py
echo "Azure production deployed: $revision"
