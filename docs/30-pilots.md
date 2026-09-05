# Running a pilot

For a company, a school, a ministry or a university deciding whether to put Kodukeel in front of a
group of people. It says what a pilot is, what it costs, what is asked of you, what you get back,
and what happens to your people's data. If something here is not answered, the address at the
bottom reaches a person.

## What this is honest about first

There is no reference customer to name and no case study to send. This project has been built and
measured in public and has not yet been run at scale by anybody else, and a page claiming otherwise
would be the first thing a careful reader caught. What there is instead is the evidence in this
repository: the app, the tests, the security review in `docs/27-security.md`, the impact assessment
in `docs/24-dpia.md`, and a cost model in `lib/funding/` that publishes what it costs to run and
where every figure came from. A first pilot is a first pilot. It is priced and scoped accordingly.

## The three shapes a pilot takes

**A workplace.** A group of colleagues learning Estonian, usually because they moved here for the
job. The sponsor gets a cohort view that shows effort and a readiness band, never a percentage and
never an individual's answers. That boundary is in the code rather than in a policy: `workplaceRoster`
in `lib/classroom/roster.ts` does not select the column a teacher's view uses, and an employer's
list is ordered by name so it cannot be read as a league table. Enterprise sign-in is available
through SAML, so nobody is asked to make another account.

**A class.** A teacher and their pupils. A teacher sees more than an employer, because they have a
lesson to plan: effort, the group's weakest cases, and each pupil's own weakest case as a rolled-up
percentage over enough answers to mean something. Still never a pupil's deck, their searches or
their answer history. The join screen says all of this before anybody joins.

**An institution.** A ministry, a university department or a language school evaluating whether this
is worth supporting or building on. Usually the interesting output is not the learners at all but
the research export in `docs/19-research-export.md`: which cases and which gradation patterns
learners actually get wrong, at a scale no classroom reaches, published under statistical disclosure
control and labelled where it is self-reported.

## What it costs

Nothing to run a pilot, and that is not an introductory offer. The app is free to use, there is
nothing to buy and nothing about anybody is sold. `/funding` publishes the whole bill and the
arithmetic behind it: the floor is a few hundred dollars a month before a single learner arrives,
most of it does not move when they do, and the first thousand people are close to free to serve. A
pilot of thirty people costs the operator almost exactly what an empty deployment costs.

What a pilot can cost you is time, and it is worth naming: somebody has to introduce it, and
somebody has to tell us what went wrong. That second one is the part that is actually valuable.

## What is asked of you

1. **A named contact.** One person who can answer a question and pass one on.
2. **A start date and an end date.** Six to twelve weeks is enough to see whether anybody comes back
   in the second month, which is the only retention number worth having.
3. **Permission to count, not to watch.** The figures in `docs/23-impact.md` are aggregates over
   people who have not opted out, with floors that suppress a number rather than report a small one.
   Nobody is asked a question they did not volunteer for and no analytics vendor is involved,
   because there is not one anywhere in this app.
4. **Honesty at the end**, including if the answer is that it did not work. A pilot that quietly
   fades out teaches nobody anything.

## What you get back

- The app, with every part of it switched on, for as long as the pilot runs.
- Enterprise sign-in through your own identity provider, where you have one.
- A cohort view scoped to what your role is entitled to see.
- A written summary at the end: how many people started, how many were still there in the second
  month, how much study that came to, and how many conversations in Estonian they reported having
  outside the app. That last one is the number this project says it is measured by, and it is
  self-reported, and the summary will say so.
- Whatever we learned about where the software got in the way.

## What happens to your people's data

The full answer is `/privacy` and `docs/24-dpia.md`. The short version:

- Every learner can take their whole record out in one file at any time, and delete their account
  from inside the app.
- There is no analytics script, no advertising identifier and no third-party tracker on any page.
- What a sponsor sees is fixed in code, not in a setting somebody could widen later.
- A photograph of a page is read and never stored.
- The subprocessor register is `docs/26-subprocessors.md`, and the live list is generated from the
  deployment's own configuration, so the document and the running app cannot silently disagree.
- Ending a pilot does not take anybody's account away. It is their account.

## What this is not ready for

Said here rather than discovered in procurement.

- **There is no SOC 2 report and no ISO 27001 certificate.** `docs/29-controls.md` is a
  self-assessment against both, written to be checked rather than believed.
- **No external penetration test has been carried out.** The threat model and the review are in
  `docs/27-security.md` and they are our own work.
- **There is no contractual uptime commitment.** What there is instead is an app that keeps working
  with no network for the pages a learner has already opened, and holds grades until it can send
  them.
- **The accessibility claim is partial conformance, not full**, with the gaps named on
  `/accessibility` rather than rounded up.

Any of those can change, and each has a note on what would trigger it. None of them is going to be
claimed before it is true.

## Getting in touch

privacy@upthink.ee reaches the operator named on `/privacy`, which is the same address a data
protection question goes to. There is no separate sales address, because there is nobody in sales.
