# Reporting a security problem

Kodukeel is an Estonian learning app. It holds people's study history, their level checks and the
things they have written, so a fault here costs somebody more than a broken screen. If you have
found one, we want to hear about it.

## Where to send it

**privacy@upthink.ee**

There is no separate security address yet. That mailbox is read by the same people, and it is the
address on the privacy page, so it is the one that is certain to reach somebody. Put "security" in
the subject line and it gets looked at first.

The operator is Upthink Solutions OÜ, registry code 16683946, Aiandi tn 8/2-28, 12915 Tallinn,
Estonia.

If the report is sensitive enough that plain email worries you, say so in a one line message with no
detail in it and we will arrange another channel.

## What to include

Enough to reproduce it. A URL, the request, what you expected and what happened. If you have a
proof of concept, send it. If you found it by reading the source, name the file and the line.

## What you can expect

We are a very small operation, so these are the times we can actually keep rather than the times
that would look good here.

| Stage | Time |
| --- | --- |
| We acknowledge your mail | 3 working days |
| We tell you whether we agree it is a problem, and how severe | 10 working days |
| Fix for something critical or high | Aimed at 30 days from confirmation |
| Fix for anything lower | Aimed at 90 days, and we will say if it slips |
| We tell you it is fixed | Same day it ships |

If we go quiet past those, chase us. Silence from us is a fault on our side, not an answer.

We will credit you by name in the release notes if you want that, and leave you out of them if you
do not. Say which.

## Scope

In scope:

- The deployment at **kodukeel.ee** and anything under it.
- The source in this repository, including the CI workflows and the seed data.
- The Supabase project and the database behind that deployment, where the fault is in how this app
  configures or uses them.

Out of scope, because they are not ours to fix:

- Supabase, Vercel, Google Sign-In, Ekilex, Wiktionary and TartuNLP as services. Report those to
  their own teams. If the fault is that **we** use one of them badly, that is in scope.
- Somebody else's installation of this app. It is software people run themselves, so their copy is
  theirs. We will pass a report on if you cannot reach them.
- Findings from a scanner with no working attack behind them: a missing header on a static file, a
  version number in a lockfile, a rating from a tool with no path to exploitation.
- Denial of service by volume, spam of the sign-in form, and social engineering of anybody involved.
- Reports that a self-hosted install with no Supabase keys has no sign-in. That is local mode and it
  is documented behaviour: one learner, one machine, no gate.

## Safe harbour

If you are researching in good faith, we will not pursue you and we will not ask anybody else to.
That holds as long as you:

- stay within the scope above,
- use only accounts you created yourself, and stop the moment you reach somebody else's data,
- do not run destructive tests, mass scans, or anything that degrades the service for learners,
- do not keep, publish or pass on any personal data you happen to reach, and tell us about it
  instead, and
- give us a reasonable window to fix it before you write it up.

Meet those and we consider your work authorised. We will say so in writing if you need us to.

If you break one of them by accident, tell us. Coming to us first is what good faith looks like from
our side of it.

## What we do not offer

**There is no bug bounty and no payment.** We have no budget for one. This is a small project run by
a small company, it is free to learners, and what it costs to run is published at `/funding`. If a
paid programme is what you are looking for, this is not it, and we would rather say so at the top
than waste your afternoon.

We also do not offer a private disclosure portal, a CVE numbering authority, or a signed
vulnerability report. What we have is a mailbox somebody reads and a repository where you can see
whether the fix landed.

## Related reading

- `docs/27-security.md`, the threat model and the controls, with the file each one lives in.
- `docs/28-incident-response.md`, what we do when something has already gone wrong.
- `docs/29-controls.md`, a self-assessment against ISO 27001 and SOC 2, with the overclaims left out.
- `/privacy` on the deployment, which names the controller and the supervisory authority.
