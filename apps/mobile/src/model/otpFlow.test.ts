import { ApiError, offlineError } from "./apiError";
import {
  askAgainAt,
  codeFromText,
  deliveryOutcome,
  OTP,
  phoneFieldText,
  pollRemainingMs,
  resendAt,
  sendFailure,
  triesLeft,
  verifyFailure,
} from "./otpFlow";

// Built from parts so this file holds no real-looking number (test/noRealPhones.test.ts).
const FIRST = "98765";
const SECOND = "43210";

describe("phoneFieldText", () => {
  test("groups the digits in fives as they are typed", () => {
    expect(phoneFieldText("9")).toBe("9");
    expect(phoneFieldText(FIRST)).toBe(FIRST);
    expect(phoneFieldText(`${FIRST}4`)).toBe(`${FIRST} 4`);
    expect(phoneFieldText(`${FIRST}${SECOND}`)).toBe(`${FIRST} ${SECOND}`);
  });

  test("drops letters and anything past ten digits", () => {
    expect(phoneFieldText(`${FIRST}ab${SECOND}99`)).toBe(`${FIRST} ${SECOND}`);
  });

  test("drops a pasted +91, 91 or leading 0", () => {
    expect(phoneFieldText(`+91 ${FIRST} ${SECOND}`)).toBe(`${FIRST} ${SECOND}`);
    expect(phoneFieldText(`91${FIRST}${SECOND}`)).toBe(`${FIRST} ${SECOND}`);
    expect(phoneFieldText(`0${FIRST}${SECOND}`)).toBe(`${FIRST} ${SECOND}`);
  });

  test("keeps a number that starts with 91 while it is typed", () => {
    expect(phoneFieldText("91")).toBe("91");
    expect(phoneFieldText("9198765")).toBe("91987 65");
  });

  test("a seed number is kept whole in builds that allow it, and read as digits in the others", () => {
    expect(phoneFieldText("+12025550123", { allowSeedNumbers: true })).toBe("+12025550123");
    expect(phoneFieldText("+12025550123")).toBe("12025 55012");
  });
});

describe("resendAt and askAgainAt", () => {
  test("the wait is 30 seconds, longer when the server says so", () => {
    expect(resendAt(1000)).toBe(1000 + OTP.resendWaitMs);
    expect(resendAt(1000, 120)).toBe(1000 + 120_000);
    expect(resendAt(1000, 5)).toBe(1000 + OTP.resendWaitMs);
  });

  test("Not there yet? shows at 60 seconds, or when the wait is longer", () => {
    expect(askAgainAt(0, resendAt(0))).toBe(OTP.notThereYetMs);
    expect(askAgainAt(0, resendAt(0, 300))).toBe(300_000);
  });
});

describe("pollRemainingMs", () => {
  test("polling runs for two minutes", () => {
    expect(pollRemainingMs(0, 0)).toBe(OTP.pollForMs);
    expect(pollRemainingMs(0, 90_000)).toBe(30_000);
    expect(pollRemainingMs(0, 130_000)).toBe(0);
  });
});

describe("deliveryOutcome", () => {
  test.each([
    ["sent", "waiting"],
    ["delivered", "waiting"],
    ["read", "done"],
    ["failed", "not_delivered"],
    ["undeliverable", "not_on_whatsapp"],
  ] as const)("%s is %s", (status, outcome) => {
    expect(deliveryOutcome(status)).toBe(outcome);
  });
});

describe("sendFailure", () => {
  const api = (kind: ApiError["kind"], status: number, code: string | null, retry: number | null = null) =>
    new ApiError(kind, status, code, retry);

  test("a bad number, a refusal, a pause, a wait, a failed send and no network each have their own answer", () => {
    expect(sendFailure(api("validation", 400, "bad_phone"))).toEqual({ kind: "bad_phone" });
    expect(sendFailure(api("forbidden", 403, "sign_in_unavailable"))).toEqual({ kind: "refused" });
    expect(sendFailure(api("server", 503, "otp_cap_reached", 3600))).toEqual({ kind: "paused" });
    expect(sendFailure(api("rate_limited", 429, "rate_limited", 90))).toEqual({ kind: "wait", seconds: 90 });
    expect(sendFailure(api("server", 503, "otp_send_failed"))).toEqual({ kind: "could_not_send" });
    expect(sendFailure(offlineError())).toEqual({ kind: "offline" });
  });

  test("any 403 is the same refusal, so the screen never says why", () => {
    expect(sendFailure(api("forbidden", 403, "account_suspended"))).toEqual({ kind: "refused" });
    expect(sendFailure(api("forbidden", 403, null))).toEqual({ kind: "refused" });
  });

  test("a 429 with no Retry-After still waits", () => {
    expect(sendFailure(api("rate_limited", 429, null))).toEqual({ kind: "wait", seconds: 60 });
  });

  test("anything else is a server problem", () => {
    expect(sendFailure(api("server", 500, null))).toEqual({ kind: "server" });
    expect(sendFailure(new Error("boom"))).toEqual({ kind: "server" });
  });
});

describe("verifyFailure", () => {
  const wrong = new ApiError("validation", 400, "invalid_code");

  test("a wrong code counts down the tries", () => {
    expect(verifyFailure(wrong, 1)).toEqual({ kind: "wrong_code", triesLeft: 4 });
    expect(verifyFailure(wrong, 4)).toEqual({ kind: "wrong_code", triesLeft: 1 });
  });

  test("the fifth wrong code is too many tries, because the server cancels the code then", () => {
    expect(verifyFailure(wrong, OTP.maxWrongTries)).toEqual({ kind: "too_many_tries" });
    expect(triesLeft(OTP.maxWrongTries)).toBe(0);
  });

  test("a refused or suspended account gets the same refusal", () => {
    expect(verifyFailure(new ApiError("forbidden", 403, "sign_in_unavailable"), 1)).toEqual({ kind: "refused" });
    expect(verifyFailure(new ApiError("forbidden", 403, "account_suspended"), 1)).toEqual({ kind: "refused" });
  });

  test("an old app, no network and a server error", () => {
    expect(verifyFailure(new ApiError("validation", 400, "unknown_notice_version"), 1)).toEqual({ kind: "update_app" });
    expect(verifyFailure(offlineError(), 1)).toEqual({ kind: "offline" });
    expect(verifyFailure(new ApiError("server", 500, null), 1)).toEqual({ kind: "server" });
  });

  test("too many requests waits", () => {
    expect(verifyFailure(new ApiError("rate_limited", 429, "rate_limited", 30), 1)).toEqual({ kind: "wait", seconds: 30 });
  });
});

describe("codeFromText", () => {
  test("takes six digits from what was pasted", () => {
    expect(codeFromText("481 926")).toBe("481926");
    expect(codeFromText("481926")).toBe("481926");
    expect(codeFromText("Your code is 481926. Do not share it.")).toBe("481926");
  });

  test("keeps the first six of a longer run, and nothing from a short one", () => {
    expect(codeFromText("48192699")).toBe("481926");
    expect(codeFromText("4819")).toBe("");
    expect(codeFromText("no digits")).toBe("");
  });
});
