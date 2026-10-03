# Azure outage — September 19–20, 2026

## Was this an attack?

**The evidence points to a server resource problem, not a traffic attack.**
During the seven-hour incident window, Azure recorded only about **3.5 MB
incoming and 2.4 MB outgoing**. The huge numbers were reads from the server's
own disk, not visitors downloading hundreds of gigabytes.

We did not perform a full security forensic audit, so this is an evidence-based
assessment, not a guarantee that every possible attack was ruled out.

## Why were there so many reads with no users?

Think of RAM as a desk and the disk as a filing cabinet. If the desk becomes
full, the computer can spend all its time fetching the same things from the
cabinet repeatedly. Reading the same 1 GB a hundred times counts as 100 GB of
reads—even though there is only 1 GB of information.

That repeated rereading under memory pressure is the **likely explanation**.
This VM has only **892 MiB of usable RAM**. A scheduled firmware-information
refresh started immediately before the spike, and later logs explicitly
reported memory pressure. Extra monitoring services were also using a large
share of the available memory.

**The exact offending process was not captured because normal logging also
stalled.** The firmware refresh is the strongest suspected trigger, not a
proven software bug. We found no evidence tying the reads to user activity.

## Why didn't restarting fix it?

Restarting cleared the resource spike but changed the server's temporary
Cloudflare address. The website kept calling the old address. The backend was
healthy, but the website could no longer reach it. **This second problem was
confirmed directly.**

## What changed

- **Permanent HTTPS address:** replaced the temporary tunnel with a stable Azure
  hostname, updated the website, and disabled the old tunnel. HTTPS starts
  automatically and handles certificate renewal.
- **Stopped the suspected trigger:** disabled the scheduled firmware refresh
  and blocked its services from restarting. Normal OS security updates remain on.
- **Freed memory:** removed the extra guest monitoring agent. Azure's standard
  CPU/disk/network metrics remain available. Available RAM increased from about
  **164 MiB to 329 MiB**.
- **Contained runaway memory use:** capped the app at **384 MiB**, retained its
  low-memory admission checks, and added limits to HTTPS. The deployment script
  carries the app limits forward. A runaway app may restart at its limit;
  it cannot consume all the VM's RAM.

No VM size upgrade was made, and saved user sessions were preserved.

## Timeline and checks

Times are IST. On **September 19**, the firmware refresh began at **2:41 PM**;
CPU and reads rose immediately afterward. Worst-hour averages reached about
**95% CPU and 477 GB of disk reads per hour**. Reboot around **9:27 PM** cleared
the spike but broke the temporary address.

On **September 20**, the website was restored around **8:19 AM**. By **8:27 AM**,
the permanent connection and resource protections were applied and checked.
The public API returned successfully, including after stopping the old tunnel
and restarting HTTPS. A real Student Portal CAPTCHA loaded in **1.51 seconds**.
CPU returned near idle. Requests without the backend key remained blocked.

Full account sign-in and a whole-VM reboot were not tested. These changes address
the observed failure paths; they cannot guarantee unlimited capacity.

Technical configuration, evidence, changed files, and rollback instructions are
in [the recovery notes](ops/azure/incident-recovery.md). Infrastructure changes
are live; repository changes are local and uncommitted.

## Follow-up monitoring

A separate private dashboard now shows CPU, memory, disk reads, service health,
deployments, sanitized errors, and consented app activity. “Active users now”
means signed-in sessions active in the last two minutes; it is not an exact count
of people. Optional analytics can undercount visitors who decline it.

The monitor is deliberately small: a 100 MB memory ceiling, limited CPU, and
one-minute samples. It reads only new analytics log bytes, with a 256 KB limit
per collection, instead of repeatedly scanning old files. Old data expires.
Recovery actions require your password and have cooldowns; automatic recovery
starts off. These controls help detect a recurrence without adding another
heavy monitoring service to this small VM.

On September 20, 2026, the Grade / Mark & Credit report was verified in the
signed-in Student Portal. Anon now reads its official CGPA, earned and required
credits, semester GPAs, and subject grades. These fill the overall calculator
and a collapsible academic history view. Missing grades stay missing.

This feature uses the existing report sync. It adds at most two requests per
fetch, has a ten-second total timeout and a 512 KB response limit, and creates
no polling loop or background job. A failed fetch retains the last successful
history with a visible freshness warning. Student grades are not written to
analytics or operational logs.
