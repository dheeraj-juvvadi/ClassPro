#!/usr/bin/env bash
# Installed by the release workflow; root-only local summary, no outbound messages.
set -euo pipefail
umask 077
install -d -m 700 /var/log/anon/reports
docker exec classpro-azure python -c 'from client_logs import ClientLogStore; ClientLogStore("/app/client-logs").prune()'
docker exec classpro-azure python review_client_logs.py --directory /app/client-logs --days 1 \
  > /var/log/anon/reports/latest.json.tmp
mv /var/log/anon/reports/latest.json.tmp /var/log/anon/reports/latest.json
