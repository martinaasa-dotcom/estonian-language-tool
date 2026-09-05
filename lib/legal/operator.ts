/**
 * Who is legally answerable for a Kodukeel deployment, and where a reader
 * complains if they are not satisfied.
 *
 * This app is a piece of software somebody installs, not a service with one
 * address. `/privacy` has always said so: "if you are using someone else's
 * installation of it, they hold the database." That sentence is honest and it
 * is not sufficient. GDPR Article 13(1)(a) wants the controller's identity and
 * contact details given at the moment data is collected, and the Information
 * Society Services Act asks a provider for a name, an address and an
 * electronic contact that can be reached directly. A page that says "ask
 * whoever runs this" satisfies neither, because there is no way to find out
 * who that is.
 *
 * So the identity is configuration, exactly like the database URL, and the
 * policy pages render it. Nothing is invented when it is missing: an unset
 * deployment says out loud that it has not been filled in, which is a state
 * the person deploying can see and fix, rather than a plausible-looking blank
 * that reads as though the question was answered.
 *
 * Pure: no React, no Next, no Prisma. It reads the environment and returns a
 * shape, so the policy pages, the invariants and a test can all agree on it.
 */

export interface Operator {
  /** Legal name of the person or company running this deployment. */
  name: string | null;
  /** An address a letter reaches. */
  address: string | null;
  /** An email a data subject request reaches. Article 13(1)(a) again. */
  email: string | null;
  /**
   * Estonian business registry code, for a deployment run by a company.
   * Eight digits. Individuals running this for a family or a class have none,
   * which is why it is optional rather than missing.
   */
  registryCode: string | null;
  /**
   * VAT identification number, where the operator is registered for it.
   * The Information Society Services Act asks for it from a provider who has
   * one, and a funder reading the cost page wants to know whether the figures
   * beside it are net of tax. A company below the threshold has none and is
   * not misconfigured for that, so it sits beside the registry code rather
   * than among the three that decide `identified`.
   */
  vatId: string | null;
  /**
   * True when the three that matter are all present. The registry code is not
   * among them: a private person has no registry code and is still a
   * controller.
   */
  identified: boolean;
  /**
   * Where the answer came from. `env` is a deployment that configured itself,
   * `deployment` is one of the canonical installations named below, and
   * `none` is the unset state that says so on the page.
   *
   * Rendered nowhere. It exists so the deploy check can tell "this host is
   * covered because somebody set the variables" from "covered because it is
   * the canonical deployment", which are different states to be in when
   * somebody forks this.
   */
  source: "env" | "deployment" | "none";
}

/**
 * WHO RUNS THE INSTALLATIONS THIS PROJECT ITSELF PUBLISHES.
 *
 * The rule one paragraph up is that nothing is invented when the identity is
 * missing, and this does not bend it. What it fixes is a different failure:
 * the canonical deployment at kodukeel.ee had the mechanism, had the
 * documentation, had a test, and had nobody named on it, because setting four
 * variables in a dashboard is a step outside the repository and so a step that
 * does not happen. A controller notice that is correct in the abstract and
 * blank in production is the shape of compliance that fails an audit, and it
 * failed one here: the page said the operator had not been named for as long
 * as anybody had been able to read it.
 *
 * So the deployments this project runs identify themselves in the repository,
 * where a review sees them and a check can fail on them. This is **not** a
 * default and **not** a placeholder. It is keyed on the canonical origin, so
 * it answers only for the host it names: somebody forking this and serving it
 * from their own domain gets exactly the unset state they had before, which is
 * the honest answer for them, and could not accidentally publish a Tallinn
 * company as the controller of their school's data.
 *
 * Environment variables still win, so an operator who sets them is never
 * overruled by a table in someone else's source tree.
 */
const KNOWN_DEPLOYMENTS: Readonly<Record<string, Omit<Operator, "identified" | "source">>> = {
  "kodukeel.ee": {
    name: "Upthink Solutions OÜ",
    address: "Aiandi tn 8/2-28, Mustamäe linnaosa, 12915 Tallinn, Harju maakond, Estonia",
    email: "privacy@upthink.ee",
    registryCode: "16683946",
    vatId: "EE102590654",
  },
};

/**
 * The host a deployment says it serves, lower-cased and without a port.
 *
 * `NEXT_PUBLIC_SITE_URL` first, which is the variable `lib/auth/canonical.ts`
 * already treats as the one true origin, so a deployment cannot be canonical
 * for sign-in and anonymous for its policy pages at the same time.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` behind it, and it is there for the same
 * reason the table above exists at all. The whole fault being fixed is that a
 * variable somebody has to remember is a variable that does not get set, and
 * making the fix depend on a second such variable would leave the same hole one
 * step further back. The platform sets this one itself, on every deployment,
 * naming the project's production domain, so a preview names the same operator
 * as production, which is true: it is the same operator.
 *
 * NEITHER IS A REQUEST HEADER, AND THAT IS THE POINT. The `Host` a caller sends
 * would be the obvious third source and it must never be one: it is chosen by
 * whoever made the request, so reading it would let a stranger decide which
 * company is published as the controller of the data on the page. Both of these
 * are set by the deployment or by the platform and neither is reachable from
 * outside. Anything unparseable is null, and null matches no deployment.
 */
function canonicalHost(env: Record<string, string | undefined>): string | null {
  for (const raw of [env.NEXT_PUBLIC_SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      // The platform's variable is a bare host with no scheme, so it needs one
      // before URL will read it. Adding it unconditionally would break the
      // first variable, which is documented as an absolute address.
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      const host = url.hostname.toLowerCase();
      if (host) return host;
    } catch {
      continue;
    }
  }
  return null;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Takes the environment rather than reading it, so a test can state one. The
 * parameter is a plain record and not `NodeJS.ProcessEnv`: that type carries a
 * required `NODE_ENV`, which has nothing to do with who runs a deployment and
 * would make every caller state it.
 */
export function resolveOperator(
  env: Record<string, string | undefined> = process.env,
): Operator {
  const name = clean(env.OPERATOR_NAME);
  const address = clean(env.OPERATOR_ADDRESS);
  const email = clean(env.OPERATOR_EMAIL);

  if (name && address && email) {
    return {
      name,
      address,
      email,
      registryCode: clean(env.OPERATOR_REGISTRY_CODE),
      vatId: clean(env.OPERATOR_VAT_ID),
      identified: true,
      source: "env",
    };
  }

  /*
    ALL THREE OR NONE OF THEM, WHICH IS WHY THIS IS NOT A FIELD-BY-FIELD MERGE.

    Filling the gaps in a half-set environment from the table would let a fork
    that set its own name and forgot its address publish somebody else's
    address under its own name, and the resulting notice would name a
    controller that does not exist. A deployment either configured itself or
    it did not.
  */
  const known = KNOWN_DEPLOYMENTS[canonicalHost(env) ?? ""];
  if (known) return { ...known, identified: true, source: "deployment" };

  return {
    name,
    address,
    email,
    registryCode: clean(env.OPERATOR_REGISTRY_CODE),
    vatId: clean(env.OPERATOR_VAT_ID),
    identified: false,
    source: "none",
  };
}

/**
 * The hosts this project publishes an installation on, for the deploy check.
 *
 * Exported so `scripts/check-deployment.mjs` can say which host a build
 * believes it is and whether that host is one of these, rather than repeating
 * the list and drifting from it.
 */
export const IDENTIFIED_DEPLOYMENTS: readonly string[] = Object.keys(KNOWN_DEPLOYMENTS);

/**
 * The supervisory authority a learner in Estonia complains to, named because
 * Article 13(2)(d) requires that they be told they can.
 *
 * Hard-coded rather than configurable, and that is deliberate: this is an app
 * for learning Estonian, its learners are overwhelmingly in Estonia, and a
 * deployment operator naming a different authority would be answering a
 * question they were not asked. Somebody established elsewhere in the Union
 * may complain to their own authority instead, which the page says.
 *
 * The Estonian name is given alongside the English one because it is the name
 * that finds the authority: searching the English translation does not reach
 * it, and the person who needs this is the person least able to guess. It is a
 * proper noun of an institution rather than Estonian this app is teaching, so
 * ADR-005 does not reach it, and it is quoted from the authority rather than
 * written here.
 */
export const SUPERVISORY_AUTHORITY = {
  name: "Estonian Data Protection Inspectorate",
  localName: "Andmekaitse Inspektsioon",
  address: "Tatari 39, 10134 Tallinn, Estonia",
  email: "info@aki.ee",
  phone: "+372 627 4135",
  web: "https://www.aki.ee/en",
} as const;
