/**
 * The shapes the funding page is built out of.
 *
 * Their own module because the registry in `services.ts` and the arithmetic in
 * `model.ts` both need them, and each importing the other is how a cycle
 * starts. Nothing here has any behaviour.
 */

/** How the tutor is paid for. There is no free option: see `services.ts`. */
export type TutorMode = "paid" | "off";

export interface Shape {
  /** Learners who open the app in a month. */
  learners: number;
  /** Sittings a week each. */
  sessionsPerWeek: number;
  /** Cards answered in a sitting. The default daily goal is fifteen. */
  reviewsPerSession: number;
  /** Whether cards read themselves aloud, which is on by default. */
  audio: boolean;
  tutor: TutorMode;
  /**
   * Which model answers, as a key of the app's own price table.
   *
   * A choice rather than a constant because it is the one thing on this page
   * that funding changes directly: the difference between the cheapest model
   * that answers and the best one is a line item, and a reader deciding
   * whether to pay for it should be able to see the size of it.
   */
  tutorModel: string;
  /** How long the deployment has been collecting reviews. Storage never shrinks. */
  years: number;
}

/** What a month at a given size consists of, before anybody is billed for it. */
export interface Volume {
  readonly sessions: number;
  readonly reviews: number;
  readonly pageViews: number;
  readonly clips: number;
  readonly spokenCharacters: number;
  readonly tutorCalls: number;
  readonly graderCalls: number;
  readonly emails: number;
  readonly databaseGb: number;
  readonly peakConcurrent: number;
}

/** A meter, and how much of it the plan gives away before charging. */
export interface Meter {
  readonly label: string;
  readonly used: number;
  readonly included: number;
  /** How to say the number: a plain count, gigabytes, or hours. */
  readonly as: "count" | "gb" | "hours";
}

/**
 * What one service costs this month, in one of three honest shapes.
 *
 * The three exist because "it costs nothing" was doing too much work. It used
 * to cover a free plan we were relying on, a request that rides inside a bill
 * we already pay, and a device belonging to the reader. Those are different
 * facts and a reader deciding whether to fund this needs them apart.
 *
 * There is deliberately no fourth shape for "free". Nothing this app runs on
 * is free: a thing is charged, or it is inside another charge, or somebody
 * other than the operator is paying for it, and in the last case the page says
 * who.
 */
export type ServiceCost =
  | {
      readonly kind: "charged";
      readonly plan: string;
      readonly usd: number;
      /** What moved it, in one line. */
      readonly why: string;
      readonly meters?: readonly Meter[];
      /**
       * Set where the app's own spend cap, rather than the traffic, is what
       * decided this figure.
       *
       * A flag rather than a phrase the total goes looking for: the first
       * version read the reason string for "own daily cap", which makes an
       * edit to a sentence a silent change to the arithmetic.
       */
      readonly cappedByUs?: boolean;
    }
  | {
      readonly kind: "partOf";
      /** The id of the service whose bill already carries this one. */
      readonly line: string;
      readonly why: string;
    }
  | {
      readonly kind: "notOurs";
      /** Who pays for it instead. */
      readonly who: string;
      readonly why: string;
    }
  | {
      /**
       * Public infrastructure that asks for nothing.
       *
       * NOT A BILL LINE, AND THAT IS THE POINT. An earlier version priced these
       * at what the same thing costs commercially and added them to the total,
       * on the reading that "nothing is free" meant everything needed a number.
       * It is the wrong reading of what these are. Ekilex, Wiktionary and
       * TartuNLP are public institutions that have decided this work should be
       * available, they ask for nothing, and putting a shadow price on the gift
       * turns a thing to be grateful for into a line on an invoice nobody sent.
       *
       * So they are credited instead, by name, with what each one provides and
       * the licence it provides it under. `wouldCostUsd` is the size of the
       * gift rather than a charge: it says what buying the same thing would
       * come to, so a reader can see the scale of what is being given, and it
       * is kept out of every total on the page.
       */
      readonly kind: "given";
      /** What this one gives, in the reader's terms. */
      readonly gives: string;
      /** The licence it is given under, where it states one. */
      readonly licence?: string;
      /**
       * What the same thing would come to if it were bought, where there is a
       * commercial equivalent to price against. Absent where there is none,
       * which is itself worth saying: nothing else holds a checked Estonian
       * case table with attested sentences.
       */
      readonly wouldCostUsd?: number;
      readonly why: string;
    };

/** A plan, and what it gives away before it starts charging. */
export interface PlanTier {
  readonly name: string;
  /** What the plan costs a month before any overage. */
  readonly baseUsd: number;
  /** What each meter gives you before it starts charging. */
  readonly included: Readonly<Record<string, number>>;
}

/** Where a published price came from, and when it was read. */
export interface PriceRef {
  readonly source: string;
  readonly checked: string;
}

/**
 * One thing this app runs on.
 *
 * THE WHOLE POINT OF THIS TYPE IS THAT THERE IS ONE LIST. What the app depends
 * on, what a reader is told it depends on, and what appears on the bill used
 * to be three lists: a catalogue in one module, a set of hand-written line
 * functions in another, and whatever the page happened to render. Adding a
 * service meant remembering all three, and the one that would quietly go stale
 * is the bill.
 *
 * So a service is declared once, here, and it carries its own price. Adding a
 * new tool is one entry: the bill, the totals, the chart, the ladder and the
 * page's own list of what it runs on all pick it up, and the invariants fail
 * if any of them stops reading the registry.
 */
export interface Service {
  readonly id: string;
  readonly name: string;
  /** Who operates it. */
  readonly who: string;
  /** What it does for this app, in one line. */
  readonly does: string;
  /** What a learner loses if it stops answering. */
  readonly whenItIsGone: string;
  /** The environment variable that switches it on, where there is one. */
  readonly setBy?: string;
  /** Where its price came from. Every service has one. */
  readonly ref: PriceRef;
  /** What it costs a month at this size. */
  bill(volume: Volume, shape: Shape): ServiceCost;
}

/** A service with its cost worked out, which is what a screen renders. */
export interface Line {
  readonly service: Service;
  readonly cost: ServiceCost;
}

export interface Bill {
  readonly lines: readonly Line[];
  /** What somebody is actually billed, which is every charged line and no more. */
  readonly totalUsd: number;
  /**
   * What the given services would come to if they were bought.
   *
   * Deliberately not part of `totalUsd`. It is here so the page can show the
   * scale of what public institutions are handing this app for nothing, which
   * is credit rather than accounting.
   */
  readonly creditedUsd: number;
  readonly perLearnerUsd: number;
  /** Set when the app's own spend cap is what stopped the model line growing. */
  readonly modelCapBinds: boolean;
  readonly volume: Volume;
}
