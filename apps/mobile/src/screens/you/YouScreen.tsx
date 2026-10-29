import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { useState } from "react";
import { telemetry } from "@/analytics";
import { analyticsConsent } from "@/api/prefs";
import { runSave, SaveError } from "@/api/saveProfile";
import { you } from "@/copy/you";
import { draftFromMe, saveSteps, womenOnlyAvailable } from "@/model/profileForm";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useMe } from "@/providers/hooks";
import { type YouTarget, YouView } from "./YouView";

const copy = you.womenOnly.errors;

/** What a refused save of the women-only choice says. Only the choice is in play here, so a validation refusal names the rule. */
function womenOnlyError(error: unknown): string {
  if (!(error instanceof SaveError)) return copy.server;
  if (error.reason.kind === "offline") return copy.offline;
  if (error.reason.kind === "validation") return copy.invalid;
  return copy.server;
}

/**
 * The You tab on the real account. The women-only switch saves at once with `PATCH /me/profile` (the profile and the choice go
 * together, so the body is built from the cached `me`), and the cached `me` is updated by the save so the switch follows the server.
 * "Share usage data" is a choice kept on this phone; turning it off stops PostHog and Sentry at once.
 */
export function YouScreen({ onOpen, onSignOut }: { onOpen: (target: YouTarget) => void; onSignOut: () => void }) {
  const api = useApi();
  const { queryClient, prefs } = useDeps();
  const me = useMe().data;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState(() => analyticsConsent(prefs));

  const draft = draftFromMe(me);

  const setWomenOnly = async (next: boolean) => {
    if (saving || draft.gender === null) return;
    setSaving(true);
    setError(null);
    try {
      const steps = saveSteps({ ...draft, groupPref: next ? "women_only" : "open" }, me, false);
      await runSave({ api, queryClient, loadPhoto: () => Promise.reject(new Error("no photo")) }, steps);
    } catch (failure) {
      setError(womenOnlyError(failure));
    } finally {
      setSaving(false);
    }
  };

  const setUsage = (next: boolean) => {
    setUsageData(next);
    telemetry(prefs).setConsent(next);
  };

  return (
    <YouView
      firstName={me?.profile.firstName ?? null}
      handleState={me?.handle.state ?? "missing"}
      womenOnly={{ available: womenOnlyAvailable(draft), value: draft.groupPref === "women_only", saving, error }}
      usageData={usageData}
      noticeVersion={me?.consent.noticeVersion ?? NOTICE_VERSION}
      onOpen={onOpen}
      onWomenOnly={(next) => void setWomenOnly(next)}
      onUsageData={setUsage}
      onSignOut={onSignOut}
    />
  );
}
