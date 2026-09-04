# Ready for the real thing

What this app is for, as of September 2026, what was built to make that true, what was measured,
what is honest about its limits, and what a funder is being asked to pay for. Written for three
readers at once: the Integration Foundation, which wants to know whether this gets people using
Estonian in real settings; a university or a ministry, which wants to know what happens when the
money stops; and an investor, who wants to know what is different and how anybody will know it
worked.

## 1. The problem, stated the way the people who have it state it

Almost everybody learning Estonian in Estonia freezes at a counter long after they can pass a
vocabulary test. They hold a streak, they know the case endings, and the receptionist says one
sentence too fast, has no appointment on Thursday, and switches to English the moment they
hesitate. That is the moment integration turns on, and no learning app on the market is built for
it. Every one of them is built to keep you on the app, because that is their business, and a
learner who has moved on to real conversations is a learner who has left.

So the purpose of this app is to be left. It teaches the words properly, because the words are
the means. It rehearses the conversation with somebody who has an agenda of their own. It sets one
small thing to say out loud to a real person today. And it counts the conversations somebody had
outside it, which is the one number no learning app reports and the one that matters.

## 2. What is built

**Situations** (`lib/scenes/`, `/situations`). Four scenes: a shop at A1, a health centre and an
office counter at A2, a landlord on the phone at B1. Each is a machine authored in English that
knows the shape of an encounter and holds not one word of Estonian. The other side speaks in a
sentence a lexicographer recorded where one fits the beat, and otherwise in a line composed inside
the scene's own closed word list and checked four ways before anybody sees it: the shape, every
word against the list, the register, and a government check that was measured before it shipped.
A line that fails is withheld whole and the screen narrates in English that they did not catch
that. The learner's turn is read against the dictionary only, so no model ever decides whether
somebody was understood. Personas carry a voice and an agenda; difficulty is a budget of things
that go wrong; you can walk out. The debrief leads with what happened, counts what got done, and
never scores.

**Hearing the way people talk** (`lib/audio/conditions.ts`). Every listening exercise used to play
one clean synthetic voice in a silent room. A word a learner knows well now comes back at speed,
over café noise, down a phone line, from halfway through, in a different voice each time. The
words never change, because a mumbled spelling would be this app writing Estonian; the delivery
does, made in the browser out of filtered noise and a band-pass, so nothing ships and nothing
needs a licence.

**Say it today** (`lib/collections/errands.ts`). One errand a day drawn from the units the learner
has started, and one press to report how it went in one of three words: they understood me, they
switched to English, I did not manage it. That report is an `Encounter` row, append-only, and
Progress leads with it ahead of every chart. The research export carries the same figure under
the same disclosure gate as everything else, labelled as self-reported.

**What you can do.** The course has made eighty-one claims of the form "you can book a doctor's
appointment" since the day it was written, and none of them was ever tested. Progress lists the
claims for the units a learner has started, each with the situation that tests it and how the
last run went.

**Where the people are.** The situations screen names the Integration Foundation's Estonian
Language Houses, the state's Settle in Estonia programme and the Keeleklikk course, with links
opened before they were written down. A learning app that never says where the people are is one
that would rather you stayed.

## 3. What was measured

The gate on a composed line is the thing the whole module rests on, and the number to watch is
the share of lines it withholds, against a stated line of one in twenty. `npm run eval:scene`
measured it against real models three times.

| Run | What changed | Withheld |
|---|---|---|
| August, before this pass | the scenes as first written | 60 to 70 percent |
| September, first | the encounter verbs added to the course | 54 percent |
| September, second | the scenes declaring the units those verbs live in | 30 to 51 percent |

The residual is still not the gate and not the model. Reading the ranked list of words the model
reached for, every one of the commonest was a word the course teaches in a unit no scene had
declared, or a form no rule reaches: the past participle, `kestnud`, `olnud`, `tulnud`, which is
how anybody says "it has lasted since Tuesday". The next step is stored forms rather than gate
tuning, and it is a harvest change against Ekilex rather than a decision about a model.

Two other measurements decide the shape of the module. Retrieval fills the greeting, the offer,
the confirmation and the closing of every scene, and almost none of the beats that carry the
encounter, because a lexicographer records a sentence to illustrate a word and only four percent
of what Ekilex holds is a question. So a deployment with no model key gets a real but shorter
scene, narrated in English wherever nothing recorded fits, and the reviewed phrase bank of the
design's Phase 3 is what turns that into a whole conversation. And speech recognition was
measured and turned down: the one recogniser reachable from here gets native speakers wrong on
exactly the sounds a learner is weakest at, so speaking is rehearsed and never scored.

## 4. What is honest about it

**The app never writes Estonian.** Not a form, not a sentence, not a line of dialogue. Every
Estonian character a learner meets came from the Institute of the Estonian Language's own
dictionary, from a native speaker who typed it into a form and had it checked word by word, or
from a model working inside a closed list and gated against that list. This is the founding rule
of the codebase (ADR-005) and Situations extends it rather than bending it.

**No model marks anybody.** Whether a turn did the beat is a string comparison against forms the
dictionary vouches for, and the finished run is read again on the server before a grade is
written. A learner meeting this app for the first time cannot tell when a machine is the one that
is confused, so the machine is never the judge.

**Nothing in a transcript is about the learner.** The role card is fiction: you are a patient
whose throat has hurt since Saturday, with a reference number that is made up. A doctor scene
where somebody types about their own health is a database of health data about an identified
person, and the role card removes the question rather than managing it. The privacy page says so.

**Pronunciation is not scored,** for the measured reason above, and the app says so on the first
screen of first run rather than in a footnote.

**The switch to English is the honest metric and it is self-reported.** It is the most real thing
that happens to a foreigner speaking Estonian in Tallinn, it is a large part of why people stop
practising, and it should fall as their Estonian holds. It is one press and it can be lied about.
Across a cohort it is still the only signal anybody has, and it is published under a disclosure
gate that shows nothing resting on fewer than ten people.

**The classroom has not been piloted.** It is built, and a language house can set a scene for a
week and see who finished it and which objective the group missed most, and see no transcript at
all. It should not be cited as a result until one class has run one course with it.

## 5. What it costs, and what happens when the money stops

`/funding` publishes the bill, generated from a registry of every service the app runs on, with
where each price came from and the day it was read. The one line that could run away is the
model, and it reads the same ledger that rations the running app, so the page cannot show a bill
the app would refuse to run up. A composed line is metered under its own kind, `SCENE`, at about
sixty a day per learner; a scene at Ordinary day composes between two and six lines.

The floor is about three hundred dollars a month before a learner arrives and most of it does not
move when they do. What is given, Ekilex, Wiktionary and TartuNLP's speech, is credited and never
billed. The code is MIT. The data is the Institute's and Wiktionary's under their own licences. If
the money stops, the app keeps working with no model key at all: the dictionary, the course, the
review, the hearing conditions and the errands need none, and Situations plays the beats retrieval
can fill and says so.

## 6. What a pilot would measure

For a language house running one course with this beside it, the numbers worth asking for at the
end of the term, all of which the app already produces without a survey:

- conversations reported per learner per week, and the share in which the other person switched
  to English, at the start of the course and at the end;
- for each unit's "you can do this" claim, the share of learners who got every required beat of its
  situation done at least once;
- which objective a class most often missed, which is what the class panel already shows a teacher;
- the gate rejection rate on the deployment's own model, which says whether composition is
  carrying the encounter or the phrase bank is needed first.

None of that is a certificate and none of it should be read as one. It is the difference between a
course that ends with a test and a course that ends with somebody booking their own appointment.

## 7. What is deliberately not done

- No two learners in one scene: it needs realtime infrastructure this app does not have.
- No hand-written dialogue and no slang, by the founding rule.
- No spoken turns marked by a recogniser, measured and turned down.
- No score on a conversation. Every version of a percentage read worse than the sentence that
  replaced it.
- No business model beyond what `/funding` states. That page argues nothing is sold and no margin
  is taken, and an investor pitch that needs one is a conversation to have rather than a line to
  invent here.
