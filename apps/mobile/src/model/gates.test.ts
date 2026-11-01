import type { MeResponse } from "@turnout/contract/app/me";
import {
  type Gate,
  type GateFlags,
  type GateInput,
  handleNeedsAttention,
  onboardingStep,
  profileComplete,
  resolveGate,
  type SessionPhase,
} from "./gates";

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

const NOTICE = "2026-10-26";
const meOf = (over: { consent?: boolean; complete?: boolean } = {}) => {
  const value = me(over.complete === false ? { photo: null } : {});
  return { ...value, consent: { noticeVersion: NOTICE, current: over.consent ?? true } };
};

const gateInput = (over: Partial<GateInput> & { session: SessionPhase }): GateInput => ({
  welcomeSeen: false,
  acceptedNotice: null,
  noticeVersion: NOTICE,
  me: { data: undefined, failed: false },
  ...over,
});

describe("resolveGate", () => {
  test("waits while the session is read from the keychain, whatever else is known", () => {
    expect(resolveGate(gateInput({ session: "loading", welcomeSeen: true, acceptedNotice: NOTICE }))).toEqual({ kind: "loading" });
  });

  test("waits while the phone is wiped at sign-out, so the member's failed reload does not show an error", () => {
    const input = gateInput({ session: "signing_out", welcomeSeen: false, acceptedNotice: null, me: { data: undefined, failed: true } });
    expect(resolveGate(input)).toEqual({ kind: "loading" });
  });

  describe("signed out", () => {
    const cases: [boolean, string | null, Gate][] = [
      [false, null, { kind: "ready", step: "welcome" }],
      [false, NOTICE, { kind: "ready", step: "welcome" }],
      [true, null, { kind: "ready", step: "notice" }],
      [true, "2025-01-01", { kind: "ready", step: "notice" }],
      [true, NOTICE, { kind: "ready", step: "sign_in" }],
    ];
    test.each(cases)("welcome seen %s, accepted %s", (welcomeSeen, acceptedNotice, gate) => {
      expect(resolveGate(gateInput({ session: "signed_out", welcomeSeen, acceptedNotice }))).toEqual(gate);
    });

    test("does not look at the member", () => {
      const input = gateInput({ session: "signed_out", welcomeSeen: true, acceptedNotice: NOTICE, me: { data: meOf(), failed: true } });
      expect(resolveGate(input)).toEqual({ kind: "ready", step: "sign_in" });
    });
  });

  describe("signed in", () => {
    test("waits for the first answer from the cache or the network", () => {
      expect(resolveGate(gateInput({ session: "signed_in" }))).toEqual({ kind: "loading" });
    });

    test("asks for a retry when the first load failed and nothing is cached", () => {
      expect(resolveGate(gateInput({ session: "signed_in", me: { data: undefined, failed: true } }))).toEqual({ kind: "error" });
    });

    test("a cached member passes even when a refresh failed", () => {
      expect(resolveGate(gateInput({ session: "signed_in", me: { data: meOf(), failed: true } }))).toEqual({ kind: "ready", step: "done" });
    });

    const cases: [boolean, boolean, boolean, Gate][] = [];
    for (const welcomeSeen of [false, true])
      for (const consent of [false, true])
        for (const complete of [false, true])
          cases.push([welcomeSeen, consent, complete, { kind: "ready", step: !consent ? "notice" : complete ? "done" : "profile" }]);
    test.each(cases)("welcome seen %s, consent current %s, profile complete %s", (welcomeSeen, consent, complete, gate) => {
      expect(
        resolveGate(gateInput({ session: "signed_in", welcomeSeen, me: { data: meOf({ consent, complete }), failed: false } })),
      ).toEqual(gate);
    });

    test("a returning member on a new phone goes straight in", () => {
      const input = gateInput({ session: "signed_in", welcomeSeen: false, acceptedNotice: null, me: { data: meOf(), failed: false } });
      expect(resolveGate(input)).toEqual({ kind: "ready", step: "done" });
    });
  });
});
