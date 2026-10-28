import type { MeResponse } from "@turnout/contract/app/me";
import { canChooseWomenOnly, FIRST_NAME_MAX, type Gender, type GroupPref, type HandleKind } from "@turnout/contract/profile";
import { type ParsedHandle, parseHandleInput } from "./handle";

/** What the profile form holds while a person types. The photo is kept apart: it is a file, not a field. */
export interface ProfileDraft {
  firstName: string;
  gender: Gender | null;
  groupPref: GroupPref;
  /** The handle as pasted: `@name`, a profile link or a bare name. */
  handleInput: string;
}

export const EMPTY_DRAFT: ProfileDraft = { firstName: "", gender: null, groupPref: "open", handleInput: "" };

/** How a stored handle reads in the field: `@name` for Instagram, the profile path for LinkedIn. */
export function handleToInput(kind: HandleKind | null, handle: string | null): string {
  if (kind === null || handle === null) return "";
  return kind === "instagram" ? `@${handle}` : `linkedin.com/in/${handle}`;
}

/** The form as the account has it now, or empty for a new member. */
export function draftFromMe(me: Pick<MeResponse, "profile" | "handle"> | undefined): ProfileDraft {
  if (me === undefined) return EMPTY_DRAFT;
  return {
    firstName: me.profile.firstName ?? "",
    gender: me.profile.gender,
    groupPref: me.profile.groupPref,
    handleInput: handleToInput(me.handle.kind, me.handle.handle),
  };
}

/** Picking a gender. The women-only choice goes away when the new gender cannot hold it, so a stale switch is never sent. */
export function withGender(draft: ProfileDraft, gender: Gender): ProfileDraft {
  return { ...draft, gender, groupPref: canChooseWomenOnly(gender) ? draft.groupPref : "open" };
}

/** The women-only switch is offered to women and non-binary people only. */
export function womenOnlyAvailable(draft: Pick<ProfileDraft, "gender">): boolean {
  return draft.gender !== null && canChooseWomenOnly(draft.gender);
}

export type FieldProblem = "required" | "too_long" | "invalid";

export interface DraftProblems {
  firstName?: FieldProblem;
  gender?: "required";
  photo?: "required";
  handle?: FieldProblem;
}

export interface ValidationContext {
  /** The account already has a photo, or one is picked and waiting to upload. */
  hasPhoto: boolean;
}

/** What is wrong with the form before anything is sent. An empty object means it can be saved. */
export function validateDraft(draft: ProfileDraft, { hasPhoto }: ValidationContext): DraftProblems {
  const problems: DraftProblems = {};
  const name = draft.firstName.trim();
  if (name === "") problems.firstName = "required";
  else if (name.length > FIRST_NAME_MAX) problems.firstName = "too_long";
  if (draft.gender === null) problems.gender = "required";
  if (!hasPhoto) problems.photo = "required";
  if (draft.handleInput.trim() === "") problems.handle = "required";
  else if (parseHandleInput(draft.handleInput) === null) problems.handle = "invalid";
  return problems;
}

export function hasProblems(problems: DraftProblems): boolean {
  return Object.keys(problems).length > 0;
}

/** One call to the server. `photo` carries nothing: the file is read where it lives, at upload time. */
export type SaveStep =
  | { call: "profile"; body: { firstName: string; gender: Gender; groupPref: GroupPref } }
  | { call: "photo" }
  | { call: "handle"; body: ParsedHandle };

/**
 * The calls a save needs, in order: the profile fields, the photo, then the handle (a new photo sends an approved handle back to
 * review, so the handle goes last). Anything the account already holds is left out, because sending the same handle again would
 * put an approved one back in the queue. Call it on the draft that passed `validateDraft`.
 */
export function saveSteps(draft: ProfileDraft, me: Pick<MeResponse, "profile" | "handle"> | undefined, hasNewPhoto: boolean): SaveStep[] {
  const steps: SaveStep[] = [];
  const firstName = draft.firstName.trim();
  const gender = draft.gender;
  if (gender !== null) {
    const groupPref: GroupPref = canChooseWomenOnly(gender) ? draft.groupPref : "open";
    const held = me?.profile;
    if (held?.firstName !== firstName || held.gender !== gender || held.groupPref !== groupPref) {
      steps.push({ call: "profile", body: { firstName, gender, groupPref } });
    }
  }
  if (hasNewPhoto) steps.push({ call: "photo" });
  const handle = parseHandleInput(draft.handleInput);
  if (handle !== null && (me?.handle.kind !== handle.kind || me.handle.handle !== handle.handle))
    steps.push({ call: "handle", body: handle });
  return steps;
}
