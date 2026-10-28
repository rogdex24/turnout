import type { MeResponse } from "@turnout/contract/app/me";

/** The screens a person passes through before the app proper. The notice comes before the phone screen, as the plan asks. */
export type OnboardingStep = "welcome" | "notice" | "sign_in" | "profile" | "done";

export interface GateFlags {
  signedIn: boolean;
  /** The welcome cards were swiped through or skipped on this phone. */
  welcomeSeen: boolean;
  /** Signed out: this phone stored the current notice version. Signed in: `me.consent.current`. */
  noticeAccepted: boolean;
  /** Signed in only: name, gender, photo and a handle are on the account. */
  profileComplete: boolean;
}

/**
 * Where the router sends a person. Signed out: welcome, then the notice, then the phone screen. Signed in: the notice again when
 * its version moved, then the profile, then the app. A returning member signs in on a new phone straight to `done`.
 */
export function onboardingStep(flags: GateFlags): OnboardingStep {
  if (!flags.signedIn) {
    if (!flags.welcomeSeen) return "welcome";
    return flags.noticeAccepted ? "sign_in" : "notice";
  }
  if (!flags.noticeAccepted) return "notice";
  return flags.profileComplete ? "done" : "profile";
}

/** Enough on the account to leave onboarding. A rejected handle does not hold anyone here: Home shows a note that links to the profile. */
export function profileComplete(me: Pick<MeResponse, "profile" | "handle">): boolean {
  const { firstName, gender, photo } = me.profile;
  return !!firstName?.trim() && gender !== null && photo !== null && me.handle.state !== "missing";
}

export function handleNeedsAttention(me: Pick<MeResponse, "handle">): boolean {
  return me.handle.state === "rejected";
}
