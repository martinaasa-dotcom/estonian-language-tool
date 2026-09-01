import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

/**
 * The level check and the onboarding it sits inside.
 *
 * What this drives for real, rather than asserting about markup: a whole paper
 * from the first question to a stored result, the honesty the feature is built
 * on (no Estonian without a source, no score on a recording, no certificate
 * claimed), and the plan screen that turns a level and a deadline into hours.
 *
 * The failures worth catching here are the ones a unit test cannot see. A paper
 * that runs out of questions halfway. A listening section that dead ends when
 * the speech service is unavailable, which is exactly what happens on a
 * deployment with no key. A result screen that reports a level without saying
 * how few questions it came from.
 */
const B = baseUrl();
// Floor: 52, measured in the state CI seeds, with first run not yet done.
const { check, absent, done } = suite("Level check", { floor: 52 });

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  /*
    A refusal from the speech proxy is the state this suite exists to walk
    through, not a fault in the page: with no speech service configured every
    play fails, the button removes itself and the listening section abandons
    itself as unmeasured. Counting the browser's own note about that response
    would make this check fail on exactly the deployment it is verifying.
  */
  if (m.location()?.url?.includes("/api/tts")) return;
  errors.push(m.text());
});

// ─── What the app is, kept at a URL ───────────────────────────────────────────

await page.goto(`${B}/guide`, { waitUntil: "networkidle" });
check("the guide says what the app does", (await page.getByText("What it does", { exact: true }).count()) > 0);
check("and gives equal room to what it does not",
  (await page.getByText("What it does not").count()) > 0);
check("it admits it cannot score pronunciation",
  (await page.getByText(/recognises spoken Estonian reliably/i).count()) > 0);
check("it admits it is not a course",
  (await page.getByText(/Replace a course or a teacher/i).count()) > 0);
check("every screen is listed with a reason to open it",
  (await page.locator('a[href="/review"]').count()) > 0 &&
  (await page.locator('a[href="/dictionary"]').count()) > 0);

// ─── The hub, before anything has been measured ───────────────────────────────

await page.goto(`${B}/assess`, { waitUntil: "networkidle" });
const measuredAlready = (await page.getByText("Skill by skill").count()) > 0;
check("an unmeasured learner gets an empty state, not a zero",
  measuredAlready || (await page.getByText(/Nothing measured yet/i).count()) > 0);
check("it says up front that speaking is judged by the learner",
  measuredAlready || (await page.getByText(/judge yourself/i).count()) > 0);

// ─── A whole paper ────────────────────────────────────────────────────────────

await page.goto(`${B}/assess?take=1`, { waitUntil: "networkidle" });

const provenance = [];
let asked = 0;
let sawSpeaking = false;
let sawWriting = false;
let sawWritingGap = false;
let saidNotScored = false;
let namedACase = false;

/*
  The Estonian case names, which may appear in an explanation after an answer
  and never in a question. `docs/16-exam.md` has the published task types the
  state examination sets, and naming a case is not one of them.
*/
const CASE_NAMES = [
  "nimetav", "omastav", "osastav", "sisseütlev", "seesütlev", "seestütlev",
  "alaleütlev", "alalütlev", "alaltütlev", "saav", "rajav", "olev",
  "ilmaütlev", "kaasaütlev",
];

/*
  A cap on the loop rather than on the paper. It was 80, which was comfortable
  when the paper was nineteen questions and is the paper's own length now, so a
  sitting that climbed would have run out of steps before the result screen and
  reported it as the paper not ending.
*/
for (let step = 0; step < 200; step++) {
  if ((await page.getByText("Skill by skill").count()) > 0) break;

  // A section opens with what it measures and how.
  const startSection = page.getByRole("button", { name: /^Start this section$/ });
  if (await startSection.count()) {
    if ((await page.getByText("Speaking", { exact: true }).count()) > 0) sawSpeaking = true;
    await startSection.first().click();
    await page.waitForTimeout(120);
    continue;
  }

  // A written answer: a gap in a recorded sentence, typed. The form is checked
  // against the dictionary by string comparison, so no AI is involved.
  const missing = page.getByLabel("The missing word");
  if (await missing.count()) {
    sawWriting = true;
    sawWritingGap ||= (await page.locator("main .sr-only", { hasText: "blank" }).count()) > 0;
    await missing.fill("toas");
    await page.getByRole("button", { name: /^Check$/ }).click();
    await page.waitForTimeout(150);
    const next = page.getByRole("button", { name: /Next question/ });
    if (await next.count()) { asked++; await next.click(); await page.waitForTimeout(120); }
    continue;
  }

  // Dictation, where there is audio to write down.
  const heard = page.getByLabel("What you heard");
  if (await heard.count()) {
    await heard.fill("Ma olen toas");
    await page.getByRole("button", { name: /^Check$/ }).click();
    await page.waitForTimeout(150);
    const next = page.getByRole("button", { name: /Next question/ });
    if (await next.count()) { asked++; await next.click(); await page.waitForTimeout(120); }
    continue;
  }

  // Speaking is rated by the learner and never scored.
  const selfRating = page.getByRole("button", { name: /Recognisable/ });
  if (await selfRating.count()) {
    saidNotScored ||= (await page.getByText(/never moves your level/i).count()) > 0;
    await selfRating.click();
    await page.waitForTimeout(150);
    continue;
  }

  // Listening needs the speech service played first. Where there is none the
  // section abandons itself, which is the honest outcome rather than a zero.
  const play = page.getByRole("button", { name: /Play the (Estonian|sentence)/ });
  if (await play.count() && (await page.locator("main button:disabled").count()) > 0) {
    await play.first().click();
    await page.waitForTimeout(400);
    continue;
  }

  // Multiple choice. Every question carries where its Estonian came from.
  const choice = page.locator("main button:not([disabled])").filter({ hasText: /^[1-4]\S/ });
  if (await choice.count()) {
    /*
      A placement question may not be a grammar quiz. Nobody sitting a real
      Estonian test is asked to name a case, and this check used to spend half
      of its reading section doing exactly that, in a section that is supposed
      to measure reading. Asserted from the screen rather than from the source,
      because the source check cannot see a case name arriving through an
      interpolated option.
    */
    const asking = (await page.locator("main").innerText()).toLowerCase();
    for (const name of CASE_NAMES) {
      if (asking.includes(`which case`) || new RegExp(`in the ${name}\\b`).test(asking)) {
        namedACase = true;
      }
    }
    await choice.first().click();
    await page.waitForTimeout(150);
    const note = await page.getByText(/No Estonian on this screen was written/i).count();
    provenance.push(note > 0);
    const next = page.getByRole("button", { name: /Next question/ });
    if (await next.count()) { asked++; await next.click(); await page.waitForTimeout(120); }
    continue;
  }

  const skipSection = page.getByRole("button", { name: /^Skip / });
  if (await skipSection.count()) { await skipSection.first().click(); await page.waitForTimeout(120); continue; }
  break;
}

check("a paper can be sat from end to end", asked >= 4, `${asked} questions answered`);
check("every question says where its Estonian came from",
  provenance.length > 0 && provenance.every(Boolean), `${provenance.filter(Boolean).length}/${provenance.length}`);
check("the paper reaches the writing section", sawWriting);
check("the paper reaches the speaking section", sawSpeaking);
check("speaking says out loud that it is not scored", saidNotScored);
check("no question asks a learner to name a case", !namedACase);
check("the writing section is a gap in a real sentence, not an essay prompt", sawWritingGap);

// ─── The result ───────────────────────────────────────────────────────────────

await page.waitForTimeout(600);
check("it ends on a result", (await page.getByText("Skill by skill").count()) > 0);
check("the result says how few questions it came from",
  // Matched to the end of the count rather than to a full stop: the sentence
  // now carries on to say how many of those questions were at the levels the
  // level actually turned on, which is the same claim made better.
  (await page.getByText(/scored questions?[,.]/i).count()) > 0);
check("it refuses to call itself a certificate",
  (await page.getByText(/Not a certificate/i).count()) > 0);
check("it keeps speaking out of the level",
  (await page.getByText(/never part of the level/i).count()) > 0);

// ─── It was kept, and it drives the plan ──────────────────────────────────────

await page.goto(`${B}/assess`, { waitUntil: "networkidle" });
check("the result was stored and comes back", (await page.getByText("Skill by skill").count()) > 0);
check("the hub offers the check again", (await page.getByText(/Take it again/i).count()) > 0);
check("the plan is on the same screen as the level",
  (await page.getByText(/Study hours to go/i).count()) > 0 ||
  (await page.getByText(/Set a goal/i).count()) > 0);

// ─── Goals turn a level into a timeline ───────────────────────────────────────

await page.goto(`${B}/settings#goals`, { waitUntil: "networkidle" });
check("goals are editable for ever, not just at first run",
  (await page.getByText("Why you are learning").count()) > 0);
// A goal answer is a `radio` and not a `button`: these are mutually
// exclusive, so the set is one radio group rather than eight toggle switches
// each announcing itself as pressed or not. See components/Choice.tsx.
await page.getByRole("radio", { name: /Citizenship or residence/ }).click();
await page.getByRole("radio", { name: /^B1 · Live in the language$/ }).click();
await page.getByRole("radio", { name: /In six months/ }).click();
await page.getByRole("button", { name: /^Save goals$/ }).click();
await page.waitForTimeout(900);

await page.goto(`${B}/assess`, { waitUntil: "networkidle" });
// innerText, so the label styles that uppercase these are already applied.
const planText = await page.locator("main").innerText();
check("the plan is in hours, not badges", /study hours to go/i.test(planText));
check("it names its sources rather than asserting", /Foreign Service Institute/.test(planText));
check("it says what the app itself cannot cover",
  /beyond this app/i.test(planText) || /covers it/i.test(planText));
check("it does not promise the exam", /check the current requirement/i.test(planText));

// ─── First run ────────────────────────────────────────────────────────────────

/*
  The wizard, driven the way somebody in a hurry drives it: estimate rather than
  measure. That path is the one worth checking, because it is where the app has
  to keep being honest without a measurement to lean on. Sitting the check
  inside the wizard uses the same runner already exercised above.

  It runs last: finishing it marks this learner as onboarded, and /start
  redirects for anyone who is.
*/
await page.goto(`${B}/start`, { waitUntil: "networkidle" });
const onboarded = !page.url().includes("/start");

if (onboarded) {
  /*
    A WAIVER THAT FIRED ON EVERY RUN, WHICH IS A HOLE RATHER THAN A WAIVER.

    `/start` redirects anyone carrying `onboardedAt` *or a single card*. CI
    built the demo deck before starting the server, so this branch was the only
    one that had ever been taken: the whole of first run waived here, and waived
    the same way on anybody's machine, for as long as this suite has existed.
    Honestly reported and under the half that fails a suite outright, so nothing
    complained, and first run was verified by nothing. The checks below all
    pass; they had simply never been asked.

    The fixture moved after this suite in `.github/workflows/ci.yml`, which is
    the precondition this branch is now stating rather than inheriting, and an
    invariant asserts that ordering. Locally the deck is usually already there,
    so this branch is still the one a developer takes.

    THE COUNT IS THE BLOCK'S OWN, and it had drifted. It said 18 against a
    branch holding 25, which is the one arithmetic error a waiver must not make:
    the floor comes down by less than the run lost, so a suite that waived
    honestly failed anyway, and it failed on the machine of whoever ran the
    fixture before the suite rather than on CI, where the ordering above keeps
    this branch untaken. The prose beside it had drifted the same way, still
    naming a sixteen and a forty-two from before the merge that made this
    fifty-two. Numbers in a comment are checked by nobody, so they are gone; the
    one number left is the one `absent` reads, and it is the count of `check`
    calls between here and the end of the else below.
  */
  /*
    24 is the checks inside the `else` branch below, minus the one this branch
    runs in their place. It was 18, which is the figure from before #58 rewrote
    the deck step: that turned two checks into nine inside that branch and took
    it from 17 to 25, and the waiver was never recounted. 52 minus 18 is 34, a
    waived run reaches 28, and the suite failed reporting a block having stopped
    running when nothing had. Measured in a browser in both states rather than
    counted by eye, because counting by eye is what produced 18.
  */
  absent(24, "a learner who has not been through first run: this database has a deck, " +
    "so /start correctly redirects. CI runs this suite before the demo fixture");
  /*
    A learner who has already been through it is sent to Today, which is the
    documented behaviour rather than a gap in this run: a wizard that reappears
    for an established learner is worse than no wizard. It also means this suite
    can be run twice against the same database without lying about the second.
  */
  check("the walkthrough does not reappear for somebody who has done it", true, page.url());
} else {
  /*
    Four screens: You, Level, Goal, Start. It was eight, and the order is the
    argument. The limits are stated on the first screen, before anything is
    asked for. The level is measured or estimated second, because the plan is
    built on it. The plan sits under the answers that produce it rather than on
    a screen of its own, and it is still seen before a single word is chosen,
    which is the property that mattered about the old shape.
  */
  check("first run opens the walkthrough", true, page.url());
  const opening = await page.locator("body").innerText();
  check("it states what the app cannot do before it asks for anything",
    /will not score your pronunciation/i.test(opening));
  check("and links both lists in full",
    (await page.locator('a[href="/guide"]').count()) > 0);
  await page.getByLabel(/What should we call you/i).fill("Test");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("the level step offers a measurement first",
    (await page.getByRole("button", { name: /Take the level check/ }).count()) > 0);
  check("and an estimate for anyone in a hurry",
    (await page.getByText(/a guess is a guess/i).count()) > 0);
  await page.getByRole("radio", { name: /I get by/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("it asks why, and one of the reasons is the one with an exam attached",
    (await page.getByText(/Citizenship or residence/).count()) > 0);
  await page.getByRole("radio", { name: /Citizenship or residence/ }).click();

  const goalStep = await page.locator("body").innerText();
  check("choosing a reason names the level it needs, by what it lets you do",
    /naturalisation exam asks for/i.test(goalStep));
  check("and by what it still does not", /Still out of reach/i.test(goalStep));
  check("it asks for a deadline", (await page.getByText(/In six months/).count()) > 0);
  check("and how many days a week are realistic",
    (await page.getByText(/Days a week you will really practise/i).count()) > 0);
  check("the plan sits under the answers that build it", /study hours to go/i.test(goalStep));
  check("an estimated level is flagged as estimated on the plan",
    /Take the ten-minute check/i.test(goalStep));
  await page.getByRole("button", { name: /^Continue$/ }).click();

  const deckStep = await page.locator("body").innerText();
  check("the deck step comes last", (await page.getByText(/Your first words/i).count()) > 0);

  /*
    The deck is stated, not chosen. It used to be fourteen units with
    checkboxes, which is fourteen decisions handed to somebody ninety seconds
    into the app, and the honest reading of a list like that is "tick
    everything": at A1 that is 2063 cards, which at the pace this app itself
    calls sustainable is a four year backlog built by accident. So the course
    picks the first three units, names them, and says how big they are.
  */
  check("it names the units it is giving rather than asking which to take",
    /Tervitused|Minevik|Sihitis/.test(deckStep));
  check("and asks nobody to pick, because a stranger cannot answer that yet",
    (await page.getByRole("button", { name: /Units to start with/i }).count()) === 0);

  /*
    The count and the timeline. `words * 2` was the old estimate and it is out
    by a factor of four at A2, where every unit drills seven cases and up to two
    recorded sentences on top of recognition and production. A screen promising
    a hundred cards where the deck is four hundred and sixty has misdescribed
    the next year of somebody's evenings, so the server builds the cards and
    counts them.
  */
  check("it says how many cards that actually is", /\d+ words, \d+ cards/.test(deckStep));
  check("and how long they take at the chosen pace", /\d+ weeks to work through/.test(deckStep));
  check("and that the rest of the course is still there",
    /on the path whenever you want them/i.test(deckStep));

  /*
    The sentence this screen exists to get right. It read "setting this higher
    does not make words arrive faster", which is the reverse of what
    `sustainableNewCardsPerDay` computes: forty a day introduces four new cards
    where ten introduces one. What is true is that a goal counts reviews rather
    than new words, and that is what it has to say.
  */
  check("the daily goal is a row on it rather than a screen of its own",
    (await page.getByRole("radio", { name: /Regular/ }).count()) > 0);
  check("and it says a goal counts reviews, not new words",
    /not \d+ new ones/i.test(deckStep));
  check("and no longer claims a faster pace changes nothing",
    !/does not make words arrive faster/i.test(deckStep));
  await page.getByRole("button", { name: /Start learning/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/start"), { timeout: 20000 });
  check("finishing lands in the app", !page.url().includes("/start"), page.url());

  /*
    What the wizard collected, read back off a different screen in a different
    request. This asked whether the string "Why you are learning" appeared,
    which is the `ChoiceGroup`'s own label and is drawn whether or not anybody
    ever answered it: the check passed on an empty panel and could not fail.
    The chosen chip carries `aria-checked`, and the name is an input's value, so
    both of these are the wizard's answers having survived a round trip through
    the database rather than the panel having rendered.
  */
  await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
  const chosen = page.getByRole("radio", { name: /Citizenship or residence/ }).first();
  check("the reason the wizard asked for was kept",
    (await chosen.getAttribute("aria-checked")) === "true");
  check("and the name they gave is the name the app uses",
    (await page.getByLabel(/Name your class sees/i).inputValue()) === "Test");
  check("and the level check is offered from settings too",
    (await page.locator('a[href="/assess"]').count()) > 0);
}

console.log("");
check("no page error anywhere in the flow", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
done();
