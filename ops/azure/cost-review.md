# Azure cost review — September 20, 2026

Azure ActualCost reports INR 116.13 month-to-date (usage September 16–20,
latest day incomplete): disk 67.71, public IP 46.16, Monitor 2.25,
bandwidth 0.01, VM compute 0. Current zero compute cost is not a guarantee
about future billing. The disk charge was unchanged on the incident day.

With owner approval, converted the existing 30 GiB OS disk (32 GiB billing
tier) from Premium_LRS/P4 to StandardSSD_LRS/E4. Azure's Central India
retail API quoted INR 504.44 versus 252.24 per month, plus Standard SSD
operations at INR 0.1911 per 10,000. Public IP is about INR 344/month
at the observed daily rate and remains necessary for the current endpoint.

The same disk, VM, static IP, session mount, and encryption key were retained.
Stopped the app cleanly, backed up the encrypted session database/key under
/root/anon-disk-saving-20260920, deallocated, converted, and restarted.
All nine unexpired saved session payloads were identical after restart; all
nine authenticated successfully without new credentials. Public API, app
health, Caddy, and anon-ops were verified. Owner's report still returned six
semesters, official CGPA, and credits. Resource limits remain unchanged.

Lower options checked: 32 GiB Standard HDD about INR 161.43/month, with
less consistent latency; 16 GiB Standard SSD about INR 126.12/month.
Azure does not support shrinking this existing OS disk. A smaller SSD needs
a separate rebuild/migration. Neither alternative was applied.

Rollback requires another maintenance window: stop app, deallocate VM,
change this disk back to Premium_LRS, start VM, and start anon-api.
Do not restore an old session database over new activity. Azure allows
at most two disk-type changes per day. No paid snapshot was created.
