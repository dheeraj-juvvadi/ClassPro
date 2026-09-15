# SRM campus wrapper comparison — 2026-09-15

## AP: StoreVia/Srmap-Api

`src/server/auth/login.ts` uses direct fetch requests to
`student.srmap.edu.in/srmapstudentcorner/StudentLoginPage`, then `/captchas`,
then `/StudentLoginToPortal`. It extracts JSESSIONID and submits `txtUserName`,
`txtAuthKey`, and `ccode`. Its headers preserve that session between requests.
This differs from KTR's LoginServlet, dynamic guard fields, and telemetry. It
does not establish that KTR can use AP's simpler login protocol.

Source: https://github.com/StoreVia/Srmap-Api/blob/main/src/server/auth/login.ts

## Chennai/Ramapuram: Muhammad-Owais-Warsi/srm_attendance

`index.js` uses browser automation and CAPTCHA OCR on `sp.srmist.edu.in`, the
same host as our app. It types into `#login`, `#passwd`, and `#ccode`, then
clicks the form submit button. Those selectors differ from the current
`#username`, `#password`, and `#captcha`. Last repository push inspected was
February 2025. Treat it as a historical implementation, not current compatibility
or hosted-authentication proof.

Source: https://github.com/Muhammad-Owais-Warsi/srm_attendance/blob/master/index.js

## KTR/current Student Portal

The separately reviewed wrappers use cookie jars, dynamic domain/interaction
fields, and sometimes a fingerprint handshake or persistent proxy selection.
Our current combined experiment has successfully obtained an fpToken remotely
but still received a login rejection. These observations supersede generic
wrapper claims for the tested account/session.

## NCR/Ghaziabad/Modinagar and Haryana

GitHub repository/code searches for SRM NCR, Ghaziabad, Modinagar attendance,
srmncr, erpsrm.com, and srmhonline did not locate a relevant maintained login
wrapper in the examined results. Results were mostly student-club sites or
unrelated datasets. This is a search limitation, not proof no wrapper exists.
No campus endpoint was assumed to share the KTR authentication contract.

## Added measurement

`portal_network_evidence` records system DNS addresses, actual browser response
server addresses, TLS protocol/certificate identity, server Date versus local
receipt time, public guard-script hashes, login-form structure flags, and
CAPTCHA timestamp age. It emits on challenge completion and after login.
No login is needed to compare initial page and CAPTCHA behavior. It does not
reveal Render's source IP as observed by SRM, prove backend session validity,
or identify an upstream load-balancer node hidden behind one public IP.

## First deployed comparison

Release `dbd756b` was confirmed live on Render. A credential-free challenge probe
returned 200 and its session was deleted. Render DNS and the observed response
destination both were `103.4.223.143`, matching local DNS. All three downloaded
guard scripts matched freshly downloaded local files byte-for-byte by SHA-256.
TLS was 1.2 with a Sectigo certificate for `*.srmist.edu.in`. The login response
Date was 323 ms behind receipt; script responses were under one second behind.
CAPTCHA Date was 3.218 seconds behind receipt, consistent with transfer/scheduling
delay but not sufficient to identify its source. Challenge age at inspection was
8.467 seconds. The expected form action and all four guard configuration fields
were present, and the CAPTCHA used a blob URL.

This probe found no different public destination, guard-script version, or gross
server clock offset on Render. It did not authenticate or expose SRM-side policy,
session storage, internal load-balancer routing, or the client IP SRM observes.
