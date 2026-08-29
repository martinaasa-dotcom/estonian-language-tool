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
   * True when the three that matter are all present. The registry code is not
   * among them: a private person has no registry code and is still a
   * controller.
   */
  identified: boolean;
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
  return {
    name,
    address,
    email,
    registryCode: clean(env.OPERATOR_REGISTRY_CODE),
    identified: Boolean(name && address && email),
  };
}

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
