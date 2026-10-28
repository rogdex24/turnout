import type { MeResponse } from "@turnout/contract/app/me";
import { type GateFlags, handleNeedsAttention, onboardingStep, profileComplete } from "./gates";

const flagSets: GateFlags[] = [];
for (const signedIn of [false, true])
  for (const welcomeSeen of [false, true])
    for (const noticeAccepted of [false, true])
      for (const profileDone of [false, true]) flagSets.push({ signedIn, welcomeSeen, noticeAccepted, profileComplete: profileDone });

const expected = (f: GateFlags) => {
  if (!f.signedIn) return !f.welcomeSeen ? "welcome" : !f.noticeAccepted ? "notice" : "sign_in";
  if (!f.noticeAccepted) return "notice";
  return f.profileComplete ? "done" : "profile";
};

describe("onboardingStep", () => {
  test.each(flagSets)("%j", (flags) => {
    expect(onboardingStep(flags)).toBe(expected(flags));
  });

  test("the notice comes before the phone screen", () => {
    const signedOut = { signedIn: false, welcomeSeen: true, profileComplete: false };
    expect(onboardingStep({ ...signedOut, noticeAccepted: false })).toBe("notice");
    expect(onboardingStep({ ...signedOut, noticeAccepted: true })).toBe("sign_in");
  });

  test("a signed in member only needs the notice again when the version moved", () => {
    const base = { signedIn: true, welcomeSeen: false, profileComplete: true };
    expect(onboardingStep({ ...base, noticeAccepted: true })).toBe("done");
    expect(onboardingStep({ ...base, noticeAccepted: false })).toBe("notice");
  });
});

const me = (over: Partial<MeResponse["profile"]> = {}, handle: Partial<MeResponse["handle"]> = {}): MeResponse => ({
  status: "active",
  phoneLast4: "0123",
  profile: {
    firstName: "Ananya",
    gender: "woman",
    groupPref: "open",
    photo: { url: "/files/x", expiresAt: "2026-10-26T10:00:00Z" },
    ...over,
  },
  handle: { state: "pending", kind: "instagram", handle: "ananya.k", rejectReason: null, ...handle },
  matchable: { ok: true, missing: [] },
  consent: { noticeVersion: "2026-10-26", current: true },
});

describe("profileComplete", () => {
  test("a name, a gender, a photo and a submitted handle", () => {
    expect(profileComplete(me())).toBe(true);
    expect(profileComplete(me({}, { state: "approved" }))).toBe(true);
  });

  test.each([
    ["no name", me({ firstName: null })],
    ["a blank name", me({ firstName: "  " })],
    ["no gender", me({ gender: null })],
    ["no photo", me({ photo: null })],
    ["no handle", me({}, { state: "missing", kind: null, handle: null })],
  ])("is false with %s", (_name, value) => {
    expect(profileComplete(value)).toBe(false);
  });

  test("a rejected handle does not hold the member in onboarding", () => {
    expect(profileComplete(me({}, { state: "rejected", rejectReason: "not_found" }))).toBe(true);
  });
});

describe("handleNeedsAttention", () => {
  test("is true for a rejected handle only", () => {
    expect(handleNeedsAttention(me({}, { state: "rejected", rejectReason: "not_found" }))).toBe(true);
    expect(handleNeedsAttention(me())).toBe(false);
    expect(handleNeedsAttention(me({}, { state: "approved" }))).toBe(false);
  });
});
