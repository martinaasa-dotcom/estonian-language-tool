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
// Floor: 44, measured in the state CI seeds, with first run not yet done.
const { check, absent, done } = suite("Level check", { floor: 44 });

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
  (await page.getByText(/no verified Estonian speech recogniser/i).count()) > 0);
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
let saidNotScored = false;

for (let step = 0; step < 80; step++) {
  if ((await page.getByText("Skill by skill").count()) > 0) break;

  // A section opens with what it measures and how.
  const startSection = page.getByRole("button", { name: /^Start this section$/ });
  if (await startSection.count()) {
    if ((await page.getByText("Speaking", { exact: true }).count()) > 0) sawSpeaking = true;
    await startSection.first().click();
    await page.waitForTimeout(120);
    continue;
  }

  // A written answer: the form is checked against the dictionary, no AI involved.
  const sentence = page.getByLabel("Your sentence");
  if (await sentence.count()) {
    sawWriting = true;
    await sentence.fill("Ma olen kodus ja loen.");
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

// ─── The result ───────────────────────────────────────────────────────────────

await page.waitForTimeout(600);
check("it ends on a result", (await page.getByText("Skill by skill").count()) > 0);
check("the result says how few questions it came from",
  (await page.getByText(/scored questions?\./i).count()) > 0);
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
await page.getByRole("button", { name: /Citizenship or residence/ }).click();
await page.getByRole("button", { name: /^B1 · Live in the language$/ }).click();
await page.getByRole("button", { name: /In six months/ }).click();
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
  absent(18, "a learner who has not been through first run: this database has");
  /*
    A learner who has already been through it is sent to Today, which is the
    documented behaviour rather than a gap in this run: a wizard that reappears
    for an established learner is worse than no wizard. It also means this suite
    can be run twice against the same database without lying about the second.
  */
  check("the walkthrough does not reappear for somebody who has done it", true, page.url());
} else {
  check("first run opens the walkthrough", true, page.url());
  await page.getByLabel(/What should we call you/i).fill("Test");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("it asks why, before it asks which level",
    (await page.getByText(/Why Estonian\?/).count()) > 0);
  check("one of the reasons is the one with an exam attached",
    (await page.getByText(/Citizenship or residence/).count()) > 0);
  await page.getByRole("button", { name: /Citizenship or residence/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("a level is described by what it lets you do",
    (await page.getByText(/naturalisation exam asks for/i).count()) > 0);
  check("and by what it still does not",
    (await page.getByText(/Still out of reach/i).count()) > 0);
  check("it asks for a deadline", (await page.getByText(/In six months/).count()) > 0);
  check("and how many days a week are realistic",
    (await page.getByText(/Days a week you will really practise/i).count()) > 0);
  await page.getByRole("button", { name: /In a year/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("the level step offers a measurement first",
    (await page.getByRole("button", { name: /Take the level check/ }).count()) > 0);
  check("and an estimate for anyone in a hurry",
    (await page.getByText(/a guess is a guess/i).count()) > 0);
  await page.getByRole("button", { name: /I get by/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("the pace step says what a daily goal actually buys",
    (await page.getByText(/ten reviews over its first year/i).count()) > 0);
  await page.getByRole("button", { name: /^Continue$/ }).click();

  const planStep = await page.locator("main, body").first().innerText();
  check("the plan is shown before any words are chosen", /study hours to go/i.test(planStep));
  check("an estimated level is flagged as estimated on the plan",
    /Take the check when you have ten minutes/i.test(planStep));
  await page.getByRole("button", { name: /^Continue$/ }).click();

  const tourStep = await page.locator("body").innerText();
  check("the walkthrough covers what the app does", /what it does/i.test(tourStep));
  check("and what it does not", /what it does not/i.test(tourStep));
  check("it names every screen", /Dictionary/.test(tourStep) && /Level check/.test(tourStep));
  await page.getByRole("button", { name: /^Continue$/ }).click();

  check("the deck step comes last", (await page.getByText(/Your first units/i).count()) > 0);
  await page.getByRole("button", { name: /Start learning/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/start"), { timeout: 20000 });
  check("finishing lands in the app", !page.url().includes("/start"), page.url());

  await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
  const saved = await page.locator("main").innerText();
  check("the goals the wizard asked for were kept", /Why you are learning/i.test(saved));
  check("and the level check is offered from settings too",
    (await page.locator('a[href="/assess"]').count()) > 0);
}

console.log("");
check("no page error anywhere in the flow", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
done();
