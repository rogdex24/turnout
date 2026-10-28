import { PHOTO_UNREADABLE, type SaveError } from "@/api/saveProfile";
import { profile } from "@/copy/profile";
import type { DraftProblems, ProfileDraft } from "@/model/profileForm";
import type { ProfileErrors } from "./ProfileView";

/** What the form is told is wrong before anything is sent. */
export function problemsToErrors(problems: DraftProblems): ProfileErrors {
  const errors: ProfileErrors = {};
  if (problems.firstName)
    errors.firstName = problems.firstName === "too_long" ? profile.firstName.errors.tooLong : profile.firstName.errors.required;
  if (problems.gender) errors.gender = profile.gender.errors.required;
  if (problems.photo) errors.photo = profile.photo.errors.required;
  if (problems.handle) errors.handle = problems.handle === "invalid" ? profile.handle.errors.invalid : profile.handle.errors.required;
  return errors;
}

/**
 * Where a failed save is said. A step the server refused goes next to its own field; a failure with nothing to say about a field
 * (offline, a server fault, too many tries) goes above the Save button.
 */
export function saveErrorToErrors(error: SaveError, draft: Pick<ProfileDraft, "groupPref">): ProfileErrors {
  const { step, reason } = error;
  if (reason.kind === "offline") return { form: profile.errors.offline };
  if (step === "photo") {
    if (reason.code === PHOTO_UNREADABLE || reason.code === "unsupported_type") return { photo: profile.photo.errors.unreadable };
    if (reason.code === "file_too_large" || reason.status === 413) return { photo: profile.photo.errors.tooLarge };
  }
  if (step === "handle") {
    if (reason.code === "handle_locked") return { handle: profile.handle.errors.locked };
    if (reason.kind === "rate_limited") return { handle: profile.handle.errors.limit };
    if (reason.kind === "validation") return { handle: profile.handle.errors.invalid };
  }
  if (step === "profile" && reason.kind === "validation") {
    return draft.groupPref === "women_only" ? { womenOnly: profile.womenOnly.error } : { firstName: profile.firstName.errors.rejected };
  }
  if (reason.kind === "rate_limited") return { form: profile.errors.rateLimited };
  return { form: profile.errors.server };
}
