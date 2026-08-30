import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail, reviewersNamed } from "./admin";

/*
  Who may rewrite the shared dictionary from the review queue. Both functions
  here are pure and both are load-bearing: the first decides whether this
  deployment has an answer at all, and the second is the answer.
*/
describe("adminEmails", () => {
  it("is empty when nobody has been named", () => {
    expect(adminEmails({})).toEqual([]);
  });

  it("reads a comma-separated list, ignoring case and spacing", () => {
    expect(adminEmails({ ADMIN_EMAILS: " Ann@Example.com , bob@example.com " }))
      .toEqual(["ann@example.com", "bob@example.com"]);
  });
});

describe("isAdminEmail", () => {
  const admins = ["ann@example.com"];

  it("matches an exact address regardless of case", () => {
    expect(isAdminEmail("Ann@Example.COM", admins)).toBe(true);
    expect(isAdminEmail("bob@example.com", admins)).toBe(false);
  });

  /*
    THE ONE THAT MATTERS. Sign-up is open by default, so "nobody is named"
    must mean nobody, and never "whoever asked". A reviewer list that falls
    open when it is empty is a dictionary anybody can rewrite.
  */
  it("lets nobody in when the list is empty", () => {
    expect(isAdminEmail("ann@example.com", [])).toBe(false);
    expect(isAdminEmail(null, [])).toBe(false);
  });

  it("refuses a missing or malformed address", () => {
    expect(isAdminEmail(null, admins)).toBe(false);
    expect(isAdminEmail("   ", admins)).toBe(false);
  });

  /*
    Exact addresses only. A domain rule is right for "this school may sign in"
    and wrong for "this person may change what every learner reads".
  */
  it("never admits somebody for sharing a domain", () => {
    expect(isAdminEmail("mallory@example.com", admins)).toBe(false);
  });
});

describe("reviewersNamed", () => {
  /*
    Asked of the environment it is given rather than of the machine running
    the suite. A test whose answer depends on which keys happen to be exported
    is not a test, which this project learned expensively over the provider
    chain.
  */
  it("is false when nobody is named", () => {
    expect(reviewersNamed({})).toBe(false);
    expect(reviewersNamed({ ADMIN_EMAILS: "  ,  " })).toBe(false);
  });

  it("is true as soon as one address is", () => {
    expect(reviewersNamed({ ADMIN_EMAILS: "ann@example.com" })).toBe(true);
  });
});
