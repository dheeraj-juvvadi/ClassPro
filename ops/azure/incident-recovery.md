# Azure incident recovery — September 20, 2026

Plain-language report: [postmortem](../../postmortem.md).

## Current production configuration

- VM: `classpro-test`, resource group `CLASSPRO-TEST-RG`.
- Existing static public IP: `4.213.123.231`.
- Backend: `https://classpro-api-beac400e.centralindia.cloudapp.azure.com`.
- Azure public-IP resource: `classpro-testPublicIP`; DNS label:
  `classpro-api-beac400e`.
- NSG: `classpro-testNSG`, rule `classpro-https`, TCP 80/443, priority 1010.
  Port 80 serves HTTPS redirects/ACME; port 8080 stays bound to loopback.
- Caddy configuration: `/etc/caddy/Caddyfile`; service drop-in:
  `/etc/systemd/system/caddy.service.d/resources.conf`. Source copies are here.
  Caddy is enabled at boot, has a 128 MiB maximum and 50% of one CPU.
  Certificate renewal is handled by Caddy; its state is under `/var/lib/caddy`.
- Vercel project: `revamp-tracker`; public alias: `anon-tracker.vercel.app`.
  Production `BACKEND_URL` uses the stable HTTPS backend. `BACKEND_TOKEN` was
  retained. Direct API calls still require that key.
- Container: `classpro-azure`; existing image/restart policy preserved.
  Memory: 384 MiB hard / 256 MiB soft reservation; total memory+swap 384 MiB.
  CPU: existing 1.8 CPUs. Existing 160 MiB admission reserve remains enabled.
- Masked: `fwupd.service`, `fwupd-refresh.service`, `fwupd-refresh.timer`.
- Disabled/stopped: `classpro-tunnel.service`.
- Removed: Azure extension `AzureMonitorLinuxAgent` and its guest collectors.
  Platform metrics and `sysstat` remain; guest-agent metrics do not.

## Evidence and interpretation

Azure minute metrics show CPU increasing from 0.72% at 09:11 UTC to 30.22% at
09:13 UTC on September 19. Disk reads then reached roughly 7.95 GB/minute.
The journal's preceding entry was `fwupdmgr` updating LVFS at 09:11:27 UTC.
The 09:32:05 and 12:20:52 UTC entries reported memory pressure. `sar` stopped
recording after 09:10:05 until the reboot. There was no swap configured.

This supports file-cache reclaim/rereading under memory pressure, with the
firmware refresh as the likely trigger. It does not prove the specific process
or identify a confirmed fwupd defect. Monitoring consumed substantial memory,
but was not proven to be the process generating the reads. No recorded OOM kill
was found in the inspected journal. Traffic totals did not indicate a flood.

The post-reboot routing failure was separately proven: loopback health returned
200 while the public API returned `BACKEND_UNREACHABLE`/502; updating the backend
address restored 200 responses. The saved-session database was about 980 KiB.

## Verification and recovery references

Stable-endpoint deployment: `revamp-tracker-1gwsdv46a-dheeraj-chandras-projects.vercel.app`.
Recovery source was deployed revision `060877eade2420636a2a897724ba24f9c522a803`,
with `ignoreCommand: exit 1` in an isolated copy to allow a configuration-only
recovery build. The first redeploy was canceled by the unchanged-build check;
a second upload failed its root-directory check. Neither replaced production.
Repository frontend files and unrelated local changes were not released.

Checked public session 200, real Portal CAPTCHA 200, test-session cleanup 200,
unauthorized direct API 401, valid HTTPS, and recovery across a Caddy restart
with the tunnel stopped. A whole-VM reboot and authenticated report refresh
were not tested. `deploy_azure.py` passed Python compilation.

Host backups: `/root/classpro-incident-20260920/` contains the original container
inspection (mode 600), firmware unit state, original Caddy configuration, and
original tunnel unit. The container inspection contains secrets; do not commit
or print it. Local `/tmp/classpro-azure-monitor-before.json` is mode 600.

Local incident metrics: `/tmp/classpro-azure-metrics.json`,
`/tmp/classpro-incident-start.json`, `/tmp/classpro-incident-network.json`,
and `/tmp/classpro-activity.json`. These paths are temporary, not durable storage.

## Rollback and future changes

1. For an HTTPS problem, inspect `journalctl -u caddy` and validate with
   `caddy validate --config /etc/caddy/Caddyfile`. Restore the source configuration
   here before considering the old tunnel. The tunnel would issue a new random
   URL; it requires updating Vercel and redeploying again. Never restore an old
   `BACKEND_URL` blindly.
2. Before closing NSG ports 80/443 or removing the DNS label, verify production
   has been moved to another working HTTPS backend. Keep the backend key check.
3. Firmware jobs can be restored with `systemctl unmask fwupd.service
   fwupd-refresh.service fwupd-refresh.timer`, followed by enabling the timer.
   Investigate their resource use or provide more memory before doing so.
   Normal apt security updates were not changed by this incident response.
4. Restore guest monitoring only after budgeting RAM; its Azure publisher/type
   were `Microsoft.Azure.Monitor` / `AzureMonitorLinuxAgent`, handler `1.0`.
   Use the saved extension configuration and the intended data-collection rule.
5. Memory limits are also set in `portal-backend/deploy_azure.py`; keep live
   Docker limits and that file consistent. Raising concurrency/session capacity
   requires another memory/load test. The previous 2,000-session benchmark is
   not a verification of the newly bounded deployment.

The repository changes are uncommitted. Live infrastructure settings survive
reboot, and the existing deployment script copies the container HostConfig;
the explicit repository memory limits make the policy visible for future work.
No new paid monitoring or VM size upgrade was added. Alerts and a full reboot
drill are future follow-up, not claimed as completed prevention measures.
