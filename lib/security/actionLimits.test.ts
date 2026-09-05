import { beforeEach, describe, expect, it } from "vitest";
import { ACTION_LIMITS, type ActionLimit, throttleAction } from "./actionLimits";
import { resetRateLimitForTests } from "./rateLimit";

/**
 * The throttle on the actions that do real work per call.
 *
 * Five Route Handlers had one and none of the forty-odd Server Actions did,
 * which is the wrong way round: every mutation a learner makes in this app is
 * a Server Action. What is checked here is not the numbers, which are a
 * judgment, but the two properties the numbers depend on — that a learner is
 * charged to themselves rather than to their network, and that one action
 * running out does not stop the others.
 */

beforeEach(resetRateLimitForTests);

const actions = Object.keys(ACTION_LIMITS) as ActionLimit[];

const exhaust = (owner: string, action: ActionLimit) => {
  const { perMinute } = ACTION_LIMITS[action];
  for (let i = 0; i < perMinute; i += 1) throttleAction(owner, action);
};

describe("throttleAction", () => {
  it("lets an ordinary run through", () => {
    for (const action of actions) {
      expect(throttleAction("learner-a", action)).toBeNull();
    }
  });

  it("refuses once the allowance is spent, and says nothing was changed", () => {
    exhaust("learner-a", "restoreBackup");
    const refusal = throttleAction("learner-a", "restoreBackup");
    expect(refusal?.ok).toBe(false);
    // The sentence matters as much as the refusal: somebody who double-clicked
    // a restore needs to know half of it did not go in.
    expect(refusal?.error).toMatch(/nothing has changed/i);
  });

  it("charges a learner to themselves, not to their classroom", () => {
    /*
      The reason the whole limiter is keyed on the owner. Twenty-five students
      on one school network are one address, and a class doing the same
      exercise together would spend a shared allowance in seconds.
    */
    exhaust("learner-a", "joinClassroom");
    expect(throttleAction("learner-a", "joinClassroom")).not.toBeNull();
    expect(throttleAction("learner-b", "joinClassroom")).toBeNull();
  });

  it("keeps one action's allowance out of another's", () => {
    // Importing a long word list must not stop the same person restoring a
    // backup: these are separate pieces of work that happen to share a limiter.
    exhaust("learner-a", "importWords");
    expect(throttleAction("learner-a", "importWords")).not.toBeNull();
    expect(throttleAction("learner-a", "buildCloze")).toBeNull();
  });

  it("sets every allowance far above what a person could reach", () => {
    /*
      A limit a real learner meets is a bug, not a limit. The floor is four a
      minute — the backup restore, which is the most expensive call in the app
      and which nobody runs twice in a row on purpose.
    */
    for (const action of actions) {
      expect(ACTION_LIMITS[action].perMinute).toBeGreaterThanOrEqual(4);
    }
  });
});
