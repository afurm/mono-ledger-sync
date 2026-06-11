# Security advisory process

This document is the operational handbook for how the project handles
security vulnerabilities from first report through public disclosure. It
complements the policy page in [`../SECURITY.md`](../SECURITY.md), which
spells out the high-level reporting rules; this page spells out the
process after the report has arrived.

## Supported versions

| Version line | Supported with security fixes                          |
| ------------ | ------------------------------------------------------ |
| `0.1.x`      | Yes — the current 0.x line is the supported line.      |
| `< 0.1.0`    | No — pre-release builds receive no security backports. |

The project is pre-1.0, so there is exactly one supported line at a
time. The supported line tracks the latest released minor version and
receives security fixes until the next minor is released. A new minor
becomes supported the day it is published; the previous minor is
unsupported from that same day.

When a critical-severity advisory is published, the maintainer may
cut a patch release on the current supported line even if no other
change is queued, so that the fix is installable on the version users
are most likely to be running.

## Reporting a vulnerability

Send a private email to the maintainer at the address listed in
[`SECURITY.md`](../SECURITY.md). Please do not open a public GitHub
issue for vulnerabilities that could expose tokens, account
identifiers, or personal financial data.

The report should include:

- A short description of the vulnerability and the attack surface it
  affects.
- A reproducer — input, command, or sequence of steps — that
  demonstrates the issue against the current supported release.
- The version of the project you tested against and the OS / Node
  version you observed the issue on.
- Your expected disclosure timeline, if any, and whether you would
  like to be credited in the public advisory.

The maintainer will acknowledge the report within five business days.
If the report does not receive an acknowledgement in that window,
follow up on the same thread; the address is monitored by the
maintainer directly.

## Embargo and coordinated disclosure

The default embargo window is 90 days from the date the maintainer
acknowledges the report. The reporter may request a longer or shorter
embargo; the maintainer will negotiate in good faith and prefer
shorter embargos when the technical fix is straightforward.

The embargo covers:

- The reporter and any colleagues they explicitly loop in.
- The maintainer and any reviewers they explicitly loop in.
- Anyone the reporter asks the maintainer to coordinate with (for
  example, the Monobank team if the report depends on a Monobank
  server-side behavior).

The embargo does not cover general public discussion. Do not post
about the vulnerability on social media, public issue trackers, or
other public channels before the coordinated disclosure date.

If a vulnerability is being actively exploited in the wild before the
embargo expires, the maintainer will publish an advisory immediately
and notify the reporter of the early disclosure.

## Response and disclosure timeline

The target timeline, from report to public advisory, is:

| Day | Action                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Report received.                                                                                                                                                       |
| 5   | Maintainer acknowledges and assigns a severity (Critical, High, Medium, Low) using the CVSS v3.1 base score.                                                           |
| 10  | Reproducer confirmed; fix drafted on a private branch.                                                                                                                 |
| 25  | Fix reviewed and merged to a private security branch; advisory draft started on GitHub Security Advisories.                                                            |
| 60  | Patch release published; advisory goes to "Private" state for the reporter to verify the fix.                                                                          |
| 90  | Public disclosure — advisory is published, a GitHub Security Advisory is created, a release note is added, and a CVE is requested if the severity is Medium or higher. |

The timeline above is a target, not a contract. The maintainer will
communicate any slip explicitly. The reporter can request a longer
embargo if they need time to coordinate a downstream fix.

## Credit and recognition

Reporters who follow the process above are credited in the published
advisory under the name they provide. Reporters who prefer to remain
anonymous are listed as "Anonymous reporter".

The maintainer does not currently run a paid bug-bounty program.
Recognition, embargo coordination, and timely fixes are the project's
contribution back to the security research community.

## Where advisories are published

Public advisories for this project are published on GitHub Security
Advisories at:

```
https://github.com/afurm/mono-ledger-sync/security/advisories
```

Subscribe to that page (or to the repository's Releases feed) to
receive notifications when a new advisory is published.
