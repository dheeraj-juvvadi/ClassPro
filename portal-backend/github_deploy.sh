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
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
cd "$release"
image="anon-api:git-$revision"
sudo docker build -f portal-backend/Dockerfile -t "$image" . > build.log 2>&1 || {
  tail -30 build.log; exit 1;
}
sudo docker run --rm --network none --cpus .5 --memory 256m \
  -e APP_ORIGIN=http://localhost:8089 -e MEMORY_RESERVE_MB=20 "$image" \
  python -m unittest discover > tests.log 2>&1 || { tail -30 tests.log; exit 1; }
grep -E '^Ran |^OK$' tests.log
sudo DEPLOY_IMAGE="$image" ROLLBACK_NAME="anon-api-rollback-${revision:0:12}" \
  python3 portal-backend/deploy_azure.py
if test -f portal-backend/client_log_review.sh; then
  sudo install -m 755 portal-backend/client_log_review.sh /usr/local/bin/anon-client-review
  sudo install -m 644 portal-backend/anon-client-review.service portal-backend/anon-client-review.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now anon-client-review.timer
  sudo systemctl start anon-client-review.service
fi
echo "Azure production deployed: $revision"
