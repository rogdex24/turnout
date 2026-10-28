import { useMutation } from "@tanstack/react-query";
import type { Plan } from "@turnout/contract/app/plans";
import { useState } from "react";
import { queryKeys } from "@/api/keys";
import { createPlan } from "@/api/plans";
import { goExplained, markGoExplained } from "@/api/prefs";
import { defaultGroupType, existingPlanId, finishTarget, type GoIssue, goIssue, womenOnlyOffered } from "@/model/goPlan";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useMe } from "@/providers/hooks";
import { GoView } from "./GoView";

export interface GoScreenProps {
  publicId: string;
  onClose: () => void;
  /** The plan is made (or was already): on to its ticket. */
  onPlan: (planId: string) => void;
  /** Something is missing from the profile; the route picks the page that adds it. */
  onFinish: (to: ReturnType<typeof finishTarget>) => void;
}

/**
 * Go with a group, on the real account. The group type starts on the person's saved choice. POST /plans makes the plan, and a repeat
 * tap (409 `plan_exists`) carries on with the one already made, so Go is safe to press twice.
 */
export function GoScreen({ publicId, onClose, onPlan, onFinish }: GoScreenProps) {
  const api = useApi();
  const { queryClient, prefs } = useDeps();
  const me = useMe().data;
  const [chosen, setChosen] = useState<"open" | "women_only" | null>(null);
  const [issue, setIssue] = useState<GoIssue | null>(null);
  // Read once: the sentence stays up while the sheet is open, even after it has been marked.
  const [explain] = useState(() => !goExplained(prefs));

  const groupType = chosen ?? defaultGroupType(me);

  const carryOn = (plan: Plan) => {
    queryClient.setQueryData(queryKeys.planDetail(plan.id), plan);
    void queryClient.invalidateQueries({ queryKey: queryKeys.plansList() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.showMember(publicId) });
    markGoExplained(prefs);
    onPlan(plan.id);
  };

  const make = useMutation({
    mutationFn: () => createPlan(api, { eventId: publicId, groupType }),
    onSuccess: carryOn,
    onError: (failure) => {
      const existing = existingPlanId(failure);
      if (existing) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.plansList() });
        markGoExplained(prefs);
        onPlan(existing);
        return;
      }
      setIssue(goIssue(failure));
    },
  });

  return (
    <GoView
      groupType={groupType}
      womenOnlyOffered={womenOnlyOffered(me)}
      explain={explain}
      busy={make.isPending}
      issue={issue}
      onGroupType={(type) => {
        setChosen(type);
        setIssue(null);
      }}
      onNext={() => {
        if (make.isPending) return;
        setIssue(null);
        make.mutate();
      }}
      onClose={onClose}
      onFinish={() => onFinish(issue?.kind === "not_matchable" ? finishTarget(issue.missing) : "/settings/profile")}
    />
  );
}
