import { describe, expect, test } from "bun:test";
import {
  canChooseWomenOnly,
  checkTicketFile,
  eventListQuerySchema,
  handleInputSchema,
  MAX_TICKET_BYTES,
  normalizeHandle,
  profilePatchSchema,
  proofKindForSource,
} from "@turnout/contract";
import {
  otpChallengeResponseSchema,
  otpRequestSchema,
  otpStatusResponseSchema,
  otpVerifyRequestSchema,
  refreshRequestSchema,
  tokenPairSchema,
} from "@turnout/contract/app/auth";
import { compareVersions } from "@turnout/contract/app/config";
import { ERROR_CODES, errorBodySchema, errorCodeSchema } from "@turnout/contract/app/errors";
import { consentRequestSchema, handleResponseSchema, MAX_PHOTO_BYTES, meResponseSchema } from "@turnout/contract/app/me";
import { NOTICE_PARAGRAPHS, NOTICE_TEXT, NOTICE_VERSION } from "@turnout/contract/app/notice";

describe("women-only rule", () => {
  test("women-only is open to women and non-binary people, not men", () => {
    expect(canChooseWomenOnly("woman")).toBe(true);
    expect(canChooseWomenOnly("non_binary")).toBe(true);
    expect(canChooseWomenOnly("man")).toBe(false);
  });

  test("the profile patch refuses women_only for a man and accepts the rest", () => {
    const patch = (gender: string, groupPref: string) => profilePatchSchema.safeParse({ firstName: "Asha", gender, groupPref });
    expect(patch("man", "women_only").success).toBe(false);
    expect(patch("man", "open").success).toBe(true);
    expect(patch("woman", "women_only").success).toBe(true);
    expect(patch("non_binary", "women_only").success).toBe(true);
    expect(patch("woman", "open").success).toBe(true);
  });

  test("the refusal is reported on groupPref with the women_only code", () => {
    const result = profilePatchSchema.safeParse({ firstName: "Ravi", gender: "man", groupPref: "women_only" });
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(["groupPref"]);
    expect(issue?.message).toBe("women_only");
  });

  test("the profile patch trims the name and rejects unknown keys", () => {
    expect(profilePatchSchema.parse({ firstName: "  Asha ", gender: "woman", groupPref: "open" }).firstName).toBe("Asha");
    expect(profilePatchSchema.safeParse({ firstName: "", gender: "woman", groupPref: "open" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ firstName: "Asha", gender: "woman", groupPref: "open", lat: 17.4 }).success).toBe(false);
  });
});

describe("normalizeHandle", () => {
  test("instagram: names, @names and profile links all become the bare lower-case name", () => {
    expect(normalizeHandle("instagram", "some.name")).toBe("some.name");
    expect(normalizeHandle("instagram", "  @Some.Name ")).toBe("some.name");
    expect(normalizeHandle("instagram", "instagram.com/some.name/?hl=en")).toBe("some.name");
    expect(normalizeHandle("instagram", "https://www.instagram.com/Some_Name/")).toBe("some_name");
    expect(normalizeHandle("instagram", "https://instagram.com/some.name#top")).toBe("some.name");
  });

  test("instagram: refuses bad shapes", () => {
    expect(normalizeHandle("instagram", "")).toBeNull();
    expect(normalizeHandle("instagram", "a..b")).toBeNull();
    expect(normalizeHandle("instagram", ".ab")).toBeNull();
    expect(normalizeHandle("instagram", "ab.")).toBeNull();
    expect(normalizeHandle("instagram", "has space")).toBeNull();
    expect(normalizeHandle("instagram", "a".repeat(31))).toBeNull();
    expect(normalizeHandle("instagram", "a".repeat(30))).toBe("a".repeat(30));
    expect(normalizeHandle("instagram", "https://www.instagram.com/p/Cxyz123/")).toBeNull();
    expect(normalizeHandle("instagram", "https://www.linkedin.com/in/some-name")).toBeNull();
  });

  test("linkedin: takes the /in/ part from a link or a bare slug", () => {
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/in/Asha-Rao-123/")).toBe("asha-rao-123");
    expect(normalizeHandle("linkedin", "linkedin.com/in/asha-rao?trk=public")).toBe("asha-rao");
    expect(normalizeHandle("linkedin", "https://in.linkedin.com/in/asha-rao/")).toBe("asha-rao");
    expect(normalizeHandle("linkedin", "asha-rao")).toBe("asha-rao");
    expect(normalizeHandle("linkedin", "in/asha-rao")).toBe("asha-rao");
  });

  test("linkedin: 3 to 100 letters, digits and hyphens", () => {
    expect(normalizeHandle("linkedin", "ab")).toBeNull();
    expect(normalizeHandle("linkedin", "abc")).toBe("abc");
    expect(normalizeHandle("linkedin", "a".repeat(101))).toBeNull();
    expect(normalizeHandle("linkedin", "asha_rao")).toBeNull();
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/company/acme")).toBeNull();
  });

  test("the handle schema returns the normalized value and is strict", () => {
    expect(handleInputSchema.parse({ kind: "instagram", handle: "https://instagram.com/Some.Name/" })).toEqual({
      kind: "instagram",
      handle: "some.name",
    });
    expect(handleInputSchema.safeParse({ kind: "instagram", handle: "a..b" }).success).toBe(false);
    expect(handleInputSchema.safeParse({ kind: "twitter", handle: "abc" }).success).toBe(false);
    expect(handleInputSchema.safeParse({ kind: "instagram", handle: "abc", extra: 1 }).success).toBe(false);
  });
});

describe("ticket proof", () => {
  test("BookMyShow takes a screenshot only, other sellers a screenshot or a PDF", () => {
    expect(proofKindForSource("bookmyshow")).toBe("screenshot");
    expect(proofKindForSource("district")).toBe("screenshot_or_pdf");
  });

  test("a PDF for BookMyShow is screenshot_required; for another seller it passes", () => {
    expect(checkTicketFile("screenshot", { mime: "application/pdf", bytes: 1000 })).toEqual({ ok: false, reason: "screenshot_required" });
    expect(checkTicketFile("screenshot_or_pdf", { mime: "application/pdf", bytes: 1000 })).toEqual({ ok: true });
  });

  test("JPEG, PNG and HEIC pass, other types and sizes do not", () => {
    for (const mime of ["image/jpeg", "image/png", "image/heic"]) {
      expect(checkTicketFile("screenshot", { mime, bytes: 1000 })).toEqual({ ok: true });
    }
    expect(checkTicketFile("screenshot", { mime: "image/gif", bytes: 1000 })).toEqual({ ok: false, reason: "unsupported_type" });
    expect(checkTicketFile("screenshot", { mime: "image/png", bytes: MAX_TICKET_BYTES })).toEqual({ ok: true });
    expect(checkTicketFile("screenshot", { mime: "image/png", bytes: MAX_TICKET_BYTES + 1 })).toEqual({ ok: false, reason: "too_large" });
    expect(checkTicketFile("screenshot", { mime: "image/png", bytes: 0 })).toEqual({ ok: false, reason: "empty" });
  });
});

describe("events query", () => {
  test("is strict, so lat and lng are refused", () => {
    expect(eventListQuerySchema.safeParse({ group_eligible: "1", area: "madhapur" }).success).toBe(true);
    expect(eventListQuerySchema.safeParse({ lat: "17.4", lng: "78.4" }).success).toBe(false);
  });
});

describe("app contract: sign-in and sessions", () => {
  test("requests are strict and check their fields", () => {
    expect(otpRequestSchema.safeParse({ phone: "+12025550100", purpose: "sign_in" }).success).toBe(true);
    expect(otpRequestSchema.safeParse({ phone: "+12025550100", purpose: "sign_in", role: "admin" }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ phone: "1", purpose: "sign_in" }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ phone: "+12025550100", purpose: "delete_account" }).success).toBe(false);
    const verify = { challengeId: "abc", phone: "+12025550100", code: "123456", noticeVersion: NOTICE_VERSION };
    expect(otpVerifyRequestSchema.safeParse(verify).success).toBe(true);
    for (const code of ["12345", "1234567", "12345a", " 123456"])
      expect(otpVerifyRequestSchema.safeParse({ ...verify, code }).success).toBe(false);
    expect(otpVerifyRequestSchema.safeParse({ ...verify, extra: 1 }).success).toBe(false);
    expect(refreshRequestSchema.safeParse({ refreshToken: "a".repeat(43) }).success).toBe(true);
    expect(refreshRequestSchema.safeParse({ refreshToken: "short" }).success).toBe(false);
  });

  test("responses parse", () => {
    expect(otpChallengeResponseSchema.safeParse({ challengeId: "x", expiresAt: "2026-10-27T06:10:00.000Z" }).success).toBe(true);
    expect(otpStatusResponseSchema.safeParse({ deliveryStatus: "undeliverable" }).success).toBe(true);
    expect(otpStatusResponseSchema.safeParse({ deliveryStatus: "pending" }).success).toBe(false);
    expect(tokenPairSchema.safeParse({ accessToken: "a", accessExpiresAt: "b", refreshToken: "c", refreshExpiresAt: "d" }).success).toBe(
      true,
    );
    expect(tokenPairSchema.safeParse({ accessToken: "a" }).success).toBe(false);
  });
});

describe("app contract: errors, config and the notice", () => {
  test("every error code is listed once and the body parses", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of [
      "invalid_request",
      "unauthorized",
      "rate_limited",
      "sign_in_unavailable",
      "otp_cap_reached",
      "women_only",
      "bad_handle",
      "handle_locked",
    ]) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(errorBodySchema.safeParse({ error: { code: "Not A Code", message: "x" } }).success).toBe(false);
    expect(errorBodySchema.safeParse({ error: { code: "not_found", message: "nope" } }).success).toBe(true);
  });

  test("the notice has a date version, readable text, and none of the banned wording", () => {
    expect(NOTICE_VERSION).toBe("2026-10-26");
    expect(NOTICE_TEXT).toBe(NOTICE_PARAGRAPHS.join("\n\n"));
    for (const word of [/\bverified\b/i, /ID.?check/i, /\bKYC\b/i, /—/]) expect(NOTICE_TEXT).not.toMatch(word);
  });

  test("version comparison goes by number", () => {
    expect(compareVersions("1.2.3", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("junk", "0.0.0")).toBe(0);
  });

  test("the /me shape needs every field", () => {
    const me = {
      status: "active",
      phoneLast4: "0100",
      profile: { firstName: null, gender: null, groupPref: "open", photo: null },
      handle: { state: "missing", kind: null, handle: null, rejectReason: null },
      matchable: { ok: false, missing: ["name"] },
      consent: { noticeVersion: null, current: false },
    };
    expect(meResponseSchema.safeParse(me).success).toBe(true);
    expect(meResponseSchema.safeParse({ ...me, status: "banned" }).success).toBe(false);
    expect(meResponseSchema.safeParse({ ...me, matchable: { ok: false, missing: ["selfie"] } }).success).toBe(false);
    expect(consentRequestSchema.safeParse({ noticeVersion: NOTICE_VERSION, extra: 1 }).success).toBe(false);
    expect(handleResponseSchema.safeParse({ state: "approved" }).success).toBe(false);
    expect(MAX_PHOTO_BYTES).toBe(10 * 1024 * 1024);
  });
});
