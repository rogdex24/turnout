import { z } from "zod";

export const GENDERS = ["woman", "man", "non_binary"] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

export const GROUP_PREFS = ["open", "women_only"] as const;
export const groupPrefSchema = z.enum(GROUP_PREFS);
export type GroupPref = z.infer<typeof groupPrefSchema>;

/** The error code for a man asking for a women-only group (400 `women_only`). */
export const WOMEN_ONLY_ERROR = "women_only";

/** Women-only groups are open to women and non-binary people. */
export function canChooseWomenOnly(gender: Gender): boolean {
  return gender === "woman" || gender === "non_binary";
}

/** The group type a person may have: `open` is always allowed, `women_only` only where the rule says so. */
export function isGroupPrefAllowed(gender: Gender, groupPref: GroupPref): boolean {
  return groupPref === "open" || canChooseWomenOnly(gender);
}

export const FIRST_NAME_MAX = 40;

export const firstNameSchema = z.string().trim().min(1).max(FIRST_NAME_MAX);

/** PATCH /me/profile. */
export const profilePatchSchema = z
  .object({
    firstName: firstNameSchema,
    gender: genderSchema,
    groupPref: groupPrefSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isGroupPrefAllowed(value.gender, value.groupPref)) {
      ctx.addIssue({ code: "custom", path: ["groupPref"], message: WOMEN_ONLY_ERROR });
    }
  });

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const HANDLE_KINDS = ["instagram", "linkedin"] as const;
export const handleKindSchema = z.enum(HANDLE_KINDS);
export type HandleKind = z.infer<typeof handleKindSchema>;

export const HANDLE_STATES = ["missing", "pending", "approved", "rejected"] as const;
export const handleStateSchema = z.enum(HANDLE_STATES);
export type HandleState = z.infer<typeof handleStateSchema>;

/** Why the operator turned a handle down. The app shows kind copy for each. */
export const HANDLE_REJECT_REASONS = ["not_found", "private_or_empty", "not_matching_photo", "not_a_person"] as const;
export const handleRejectReasonSchema = z.enum(HANDLE_REJECT_REASONS);
export type HandleRejectReason = z.infer<typeof handleRejectReasonSchema>;

// Instagram: 1 to 30 of letters, digits, periods and underscores; no leading, trailing or double period.
const INSTAGRAM_HANDLE = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;
const INSTAGRAM_MAX = 30;
// A path under instagram.com that is a page, not a person.
const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);
const INSTAGRAM_URL = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)/i;

// LinkedIn: the part after /in/, 3 to 100 of letters, digits and hyphens.
const LINKEDIN_HANDLE = /^[a-z0-9-]{3,100}$/;
const LINKEDIN_URL = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i;

/**
 * Turns what a person pasted (a bare name, `@name`, or a profile link with a trailing slash or
 * tracking query) into the stored handle: lower case, no `@`, no URL. Returns `null` when the
 * result is not a valid handle for that kind. The server and the app both call this, so what the
 * form accepts is what the server stores.
 */
export function normalizeHandle(kind: HandleKind, input: string): string | null {
  const text = input.trim();
  if (kind === "instagram") {
    const fromUrl = INSTAGRAM_URL.exec(text)?.[1];
    const candidate = (fromUrl ?? text.replace(/^@/, "")).toLowerCase();
    if (fromUrl !== undefined && INSTAGRAM_RESERVED.has(candidate)) return null;
    if (candidate.length > INSTAGRAM_MAX || !INSTAGRAM_HANDLE.test(candidate)) return null;
    return candidate;
  }
  const fromUrl = LINKEDIN_URL.exec(text)?.[1];
  const candidate = (fromUrl ?? text.replace(/^\/?in\//i, "")).toLowerCase();
  return LINKEDIN_HANDLE.test(candidate) ? candidate : null;
}

/** PUT /me/handle. The parsed value carries the normalized handle. */
export const handleInputSchema = z
  .object({
    kind: handleKindSchema,
    handle: z.string().min(1).max(300),
  })
  .strict()
  .transform((value, ctx) => {
    const handle = normalizeHandle(value.kind, value.handle);
    if (handle === null) {
      ctx.issues.push({ code: "custom", input: value.handle, path: ["handle"], message: "bad_handle" });
      return z.NEVER;
    }
    return { kind: value.kind, handle };
  });

export type HandleInput = z.input<typeof handleInputSchema>;
export type NormalizedHandleInput = z.output<typeof handleInputSchema>;
