import { describe, expect, it } from "vitest";
import {
  IDENTIFIED_DEPLOYMENTS, resolveOperator, SUPERVISORY_AUTHORITY,
} from "@/lib/legal/operator";

describe("who is answerable for a deployment", () => {
  it("is nobody until somebody says so, and says that rather than guessing", () => {
    const operator = resolveOperator({});
    expect(operator.identified).toBe(false);
    expect(operator.name).toBeNull();
    expect(operator.email).toBeNull();
    expect(operator.address).toBeNull();
  });

  it("reads the three that Article 13 asks for", () => {
    const operator = resolveOperator({
      OPERATOR_NAME: "Kool OU",
      OPERATOR_ADDRESS: "Pikk 1, 10123 Tallinn, Estonia",
      OPERATOR_EMAIL: "privacy@example.ee",
      OPERATOR_REGISTRY_CODE: "12345678",
    });
    expect(operator.identified).toBe(true);
    expect(operator.name).toBe("Kool OU");
    expect(operator.registryCode).toBe("12345678");
  });

  it("does not count a private person as unidentified for having no registry code", () => {
    /*
      A parent running this for one family is a controller with the same
      obligations and no business registry entry at all. Requiring the code
      would make the honest configuration the one that reports itself broken.
    */
    const operator = resolveOperator({
      OPERATOR_NAME: "A Person",
      OPERATOR_ADDRESS: "An address",
      OPERATOR_EMAIL: "a@example.ee",
    });
    expect(operator.identified).toBe(true);
    expect(operator.registryCode).toBeNull();
  });

  it("treats whitespace as absence, because a variable set to a space is unset", () => {
    const operator = resolveOperator({
      OPERATOR_NAME: "  ",
      OPERATOR_ADDRESS: "\t",
      OPERATOR_EMAIL: "",
    });
    expect(operator.identified).toBe(false);
    expect(operator.name).toBeNull();
  });

  it("trims a value somebody pasted with a trailing newline", () => {
    expect(resolveOperator({ OPERATOR_NAME: "Kool OU\n" }).name).toBe("Kool OU");
  });

  it("names the operator of a deployment this project publishes", () => {
    /*
      The fault this exists for: the mechanism above was right, documented and
      tested, and the live site said nobody had been named, because setting
      four variables in a dashboard is a step outside the repository.
    */
    const operator = resolveOperator({ NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee" });
    expect(operator.identified).toBe(true);
    expect(operator.source).toBe("deployment");
    expect(operator.name).toBe("Upthink Solutions OÜ");
    expect(operator.registryCode).toBe("16683946");
    expect(operator.email).toMatch(/@/);
    expect(operator.address).toMatch(/Tallinn/);
  });

  it("answers for that host only, so a fork publishes nobody else's address", () => {
    for (const site of ["https://kool.ee", "https://kodukeel.ee.evil.example", ""]) {
      const operator = resolveOperator({ NEXT_PUBLIC_SITE_URL: site });
      expect(operator.identified).toBe(false);
      expect(operator.source).toBe("none");
      expect(operator.name).toBeNull();
    }
  });

  it("reads the host rather than the string, so a path or a port still matches", () => {
    expect(resolveOperator({ NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee/welcome" }).identified)
      .toBe(true);
    expect(resolveOperator({ NEXT_PUBLIC_SITE_URL: "https://KODUKEEL.EE" }).identified)
      .toBe(true);
    expect(resolveOperator({ NEXT_PUBLIC_SITE_URL: "not a url" }).identified).toBe(false);
  });

  it("lets a deployment that configured itself win over the table", () => {
    const operator = resolveOperator({
      NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee",
      OPERATOR_NAME: "Someone Else OU",
      OPERATOR_ADDRESS: "Pikk 1, Tallinn",
      OPERATOR_EMAIL: "them@example.ee",
    });
    expect(operator.source).toBe("env");
    expect(operator.name).toBe("Someone Else OU");
    expect(operator.vatId).toBeNull();
  });

  it("takes all three from one place, never a field from each", () => {
    /*
      A fork that set its own name and forgot its address would otherwise
      publish its name over somebody else's street, which names a controller
      that does not exist.
    */
    const operator = resolveOperator({
      NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee",
      OPERATOR_NAME: "Half Configured OU",
    });
    expect(operator.source).toBe("deployment");
    expect(operator.name).toBe("Upthink Solutions OÜ");
  });

  it("carries a VAT number where there is one, and none where there is not", () => {
    expect(resolveOperator({ NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee" }).vatId)
      .toMatch(/^EE\d+$/);
    expect(resolveOperator({}).vatId).toBeNull();
  });

  it("falls back to the host the platform names, since a variable can go unset", () => {
    /*
      The fault being fixed is that a variable somebody has to remember does not
      get set. Depending on a second such variable would leave the same hole one
      step back, so the platform's own is read behind it. It is a bare host with
      no scheme.
    */
    const operator = resolveOperator({ VERCEL_PROJECT_PRODUCTION_URL: "kodukeel.ee" });
    expect(operator.identified).toBe(true);
    expect(operator.source).toBe("deployment");
  });

  it("prefers the deployment's own answer to the platform's", () => {
    expect(resolveOperator({
      NEXT_PUBLIC_SITE_URL: "https://kool.ee",
      VERCEL_PROJECT_PRODUCTION_URL: "kodukeel.ee",
    }).identified).toBe(false);
  });

  it("reads no request header, so a caller cannot choose the controller", () => {
    /*
      The Host a caller sends is the obvious third source and must never be one.
      This is the closest a unit test gets to asserting it: the function takes
      an environment and nothing else, so a header cannot reach it.
    */
    const spoofed = { host: "kodukeel.ee", Host: "kodukeel.ee", "x-forwarded-host": "kodukeel.ee" };
    expect(resolveOperator(spoofed).identified).toBe(false);
  });

  it("names every deployment it claims to answer for", () => {
    expect(IDENTIFIED_DEPLOYMENTS.length).toBeGreaterThan(0);
    for (const host of IDENTIFIED_DEPLOYMENTS) {
      const operator = resolveOperator({ NEXT_PUBLIC_SITE_URL: `https://${host}` });
      expect(operator.identified, `${host} is listed and unidentified`).toBe(true);
      expect(operator.address).toBeTruthy();
      expect(operator.email).toBeTruthy();
    }
  });

  it("names an authority a person can actually reach", () => {
    // Article 13(2)(d) is a right to be told, so the telling has to carry
    // enough to act on: not just that a complaint is possible.
    expect(SUPERVISORY_AUTHORITY.email).toMatch(/@/);
    expect(SUPERVISORY_AUTHORITY.web).toMatch(/^https:\/\//);
    expect(SUPERVISORY_AUTHORITY.address).toMatch(/Tallinn/);
  });
});

describe("both addresses a Vercel project answers on", () => {
  it("names the operator on the vercel.app address too", () => {
    /*
      The repository's own homepage field said kodukeel.vercel.app while the
      README said kodukeel.ee, and the platform's variable names whichever the
      project has as its production domain. A table holding one of the two
      leaves the fix resting on a DNS setting.
    */
    for (const host of ["kodukeel.ee", "kodukeel.vercel.app"]) {
      const operator = resolveOperator({ NEXT_PUBLIC_SITE_URL: `https://${host}` });
      expect(operator.identified, host).toBe(true);
      expect(operator.name).toBe("Upthink Solutions OÜ");
    }
  });

  it("is not a wildcard over vercel.app", () => {
    // Otherwise every preview anybody deploys publishes this company's
    // registered address as the controller of their learners' data.
    for (const host of ["someone-else.vercel.app", "kodukeel-fork.vercel.app", "vercel.app"]) {
      expect(resolveOperator({ NEXT_PUBLIC_SITE_URL: `https://${host}` }).identified, host)
        .toBe(false);
    }
  });
});
