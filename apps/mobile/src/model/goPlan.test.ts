import { ApiError } from "./apiError";
import { defaultGroupType, existingPlanId, finishTarget, goIssue, joinItems, womenOnlyOffered } from "./goPlan";

const profile = (gender: "woman" | "man" | "non_binary" | null, groupPref: "open" | "women_only") => ({
  profile: { firstName: "Ananya", gender, groupPref, photo: null },
});

describe("defaultGroupType", () => {
  test("starts on the saved choice for someone who can make it", () => {
    expect(defaultGroupType(profile("woman", "women_only"))).toBe("women_only");
    expect(defaultGroupType(profile("non_binary", "open"))).toBe("open");
  });

  test("is any group for everyone else, and before the profile has loaded", () => {
    expect(defaultGroupType(profile("man", "women_only"))).toBe("open");
    expect(defaultGroupType(profile(null, "women_only"))).toBe("open");
    expect(defaultGroupType(undefined)).toBe("open");
  });
});

describe("womenOnlyOffered", () => {
  test("is for women and non-binary people", () => {
    expect(womenOnlyOffered(profile("woman", "open"))).toBe(true);
    expect(womenOnlyOffered(profile("non_binary", "open"))).toBe(true);
    expect(womenOnlyOffered(profile("man", "open"))).toBe(false);
    expect(womenOnlyOffered(undefined)).toBe(false);
  });
});

describe("goIssue", () => {
  test("lists what is missing, in the server's order", () => {
    const error = new ApiError("validation", 409, "not_matchable", null, { planId: null, missing: ["photo", "handle"] });
    expect(goIssue(error)).toEqual({ kind: "not_matchable", missing: ["photo", "handle"] });
  });

  test("reads the other refusals", () => {
    expect(goIssue(new ApiError("validation", 400, "women_only"))).toEqual({ kind: "women_only" });
    expect(goIssue(new ApiError("not_found", 404, "not_found"))).toEqual({ kind: "closed" });
    expect(goIssue(new ApiError("offline", null, null))).toEqual({ kind: "offline" });
    expect(goIssue(new ApiError("rate_limited", 429, "rate_limited", 5))).toEqual({ kind: "rate_limited" });
    expect(goIssue(new ApiError("server", 500, "server_error"))).toEqual({ kind: "server" });
    expect(goIssue(new Error("boom"))).toEqual({ kind: "server" });
  });
});

describe("existingPlanId", () => {
  test("is the plan a 409 plan_exists names, and nothing else", () => {
    expect(existingPlanId(new ApiError("validation", 409, "plan_exists", null, { planId: "plan-7", missing: null }))).toBe("plan-7");
    expect(existingPlanId(new ApiError("validation", 409, "plan_closed"))).toBeNull();
    expect(existingPlanId(new Error("x"))).toBeNull();
  });
});

describe("finishTarget", () => {
  test("a missing handle alone goes to its own page, anything else to the profile", () => {
    expect(finishTarget(["handle"])).toBe("/settings/social");
    expect(finishTarget(["photo", "handle"])).toBe("/settings/profile");
    expect(finishTarget([])).toBe("/settings/profile");
  });
});

describe("joinItems", () => {
  test("reads as a sentence", () => {
    expect(joinItems([], "and")).toBe("");
    expect(joinItems(["your photo"], "and")).toBe("your photo");
    expect(joinItems(["your photo", "your gender"], "and")).toBe("your photo and your gender");
    expect(joinItems(["your photo", "your first name", "your gender"], "and")).toBe("your photo, your first name and your gender");
  });
});
