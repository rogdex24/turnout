import type { MeResponse } from "@turnout/contract/app/me";
import {
  draftFromMe,
  EMPTY_DRAFT,
  handleToInput,
  hasProblems,
  type ProfileDraft,
  saveSteps,
  validateDraft,
  withGender,
  womenOnlyAvailable,
} from "./profileForm";

const held: Pick<MeResponse, "profile" | "handle"> = {
  profile: { firstName: "Ananya", gender: "woman", groupPref: "open", photo: { url: "/p", expiresAt: "2026-10-26T10:00:00.000Z" } },
  handle: { state: "pending", kind: "instagram", handle: "ananya.k", rejectReason: null },
};

const complete: ProfileDraft = { firstName: "Ananya", gender: "woman", groupPref: "open", handleInput: "@ananya.k" };

describe("the women-only rule", () => {
  it("is offered to women and non-binary people, not to men or to nobody yet", () => {
    expect(womenOnlyAvailable({ gender: "woman" })).toBe(true);
    expect(womenOnlyAvailable({ gender: "non_binary" })).toBe(true);
    expect(womenOnlyAvailable({ gender: "man" })).toBe(false);
    expect(womenOnlyAvailable({ gender: null })).toBe(false);
  });

  it("is cleared when the gender becomes man, and kept for the others", () => {
    const chosen: ProfileDraft = { ...complete, groupPref: "women_only" };
    expect(withGender(chosen, "man").groupPref).toBe("open");
    expect(withGender(chosen, "non_binary").groupPref).toBe("women_only");
    expect(withGender(chosen, "woman").groupPref).toBe("women_only");
  });

  it("never reaches the server for a man, even when the draft says so", () => {
    const stale: ProfileDraft = { ...complete, gender: "man", groupPref: "women_only" };
    const [step] = saveSteps(stale, undefined, false);
    expect(step).toEqual({ call: "profile", body: { firstName: "Ananya", gender: "man", groupPref: "open" } });
  });
});

describe("validateDraft", () => {
  it("passes a complete form", () => {
    expect(validateDraft(complete, { hasPhoto: true })).toEqual({});
  });

  it("asks for each missing piece", () => {
    const problems = validateDraft(EMPTY_DRAFT, { hasPhoto: false });
    expect(problems).toEqual({ firstName: "required", gender: "required", photo: "required", handle: "required" });
    expect(hasProblems(problems)).toBe(true);
  });

  it("treats a name of spaces as missing and a long name as too long", () => {
    expect(validateDraft({ ...complete, firstName: "   " }, { hasPhoto: true }).firstName).toBe("required");
    expect(validateDraft({ ...complete, firstName: "a".repeat(41) }, { hasPhoto: true }).firstName).toBe("too_long");
    expect(validateDraft({ ...complete, firstName: "a".repeat(40) }, { hasPhoto: true }).firstName).toBeUndefined();
  });

  it("rejects a handle the server would reject, and takes every form a person pastes", () => {
    for (const bad of ["two words", "https://example.com/ana", "ana@example.com", "instagram.com/p/abc", "a".repeat(31)]) {
      expect(validateDraft({ ...complete, handleInput: bad }, { hasPhoto: true }).handle).toBe("invalid");
    }
    for (const good of ["@ananya.k", "ananya.k", "https://www.instagram.com/ananya.k/?hl=en", "linkedin.com/in/ananya-kapoor"]) {
      expect(validateDraft({ ...complete, handleInput: good }, { hasPhoto: true }).handle).toBeUndefined();
    }
  });
});

describe("the form as the account has it", () => {
  it("writes a stored handle the way a person would type it", () => {
    expect(handleToInput("instagram", "ananya.k")).toBe("@ananya.k");
    expect(handleToInput("linkedin", "ananya-kapoor")).toBe("linkedin.com/in/ananya-kapoor");
    expect(handleToInput(null, null)).toBe("");
  });

  it("round trips: a stored account loads into a form that has nothing to save", () => {
    expect(draftFromMe(held)).toEqual(complete);
    expect(draftFromMe(undefined)).toEqual(EMPTY_DRAFT);
    expect(saveSteps(draftFromMe(held), held, false)).toEqual([]);
    const linkedin = { ...held, handle: { ...held.handle, kind: "linkedin" as const, handle: "ananya-kapoor" } };
    expect(saveSteps(draftFromMe(linkedin), linkedin, false)).toEqual([]);
  });
});

describe("saveSteps", () => {
  it("a new member sends the profile, the photo and the handle, in that order", () => {
    expect(saveSteps(complete, undefined, true)).toEqual([
      { call: "profile", body: { firstName: "Ananya", gender: "woman", groupPref: "open" } },
      { call: "photo" },
      { call: "handle", body: { kind: "instagram", handle: "ananya.k" } },
    ]);
  });

  it("sends the handle in its normalized form", () => {
    const other = { ...held, handle: { ...held.handle, handle: "other" } };
    const steps = saveSteps({ ...complete, handleInput: "https://www.instagram.com/Ananya.K/?hl=en" }, other, false);
    expect(steps).toEqual([{ call: "handle", body: { kind: "instagram", handle: "ananya.k" } }]);
  });

  it("leaves out what the account already holds, so an approved handle is not sent back to review", () => {
    const approved = { ...held, handle: { ...held.handle, state: "approved" as const } };
    expect(saveSteps({ ...complete, firstName: "Ananya K" }, approved, false)).toEqual([
      { call: "profile", body: { firstName: "Ananya K", gender: "woman", groupPref: "open" } },
    ]);
  });

  it("sends only the photo when only the photo changed", () => {
    expect(saveSteps(complete, held, true)).toEqual([{ call: "photo" }]);
  });

  it("changing to non-binary and choosing women-only sends one profile call", () => {
    const steps = saveSteps({ ...withGender(complete, "non_binary"), groupPref: "women_only" }, held, false);
    expect(steps).toEqual([{ call: "profile", body: { firstName: "Ananya", gender: "non_binary", groupPref: "women_only" } }]);
  });
});
