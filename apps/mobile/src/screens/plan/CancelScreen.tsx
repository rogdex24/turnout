import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "@/api/keys";
import { planDetailQuery, withdrawPlan } from "@/api/plans";
import { common } from "@/copy/common";
import { isApiError } from "@/model/apiError";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { CancelView } from "./CancelView";

export interface CancelScreenProps {
  planId: string;
  /** Stay: back to the plan as it was. */
  onClose: () => void;
}

function issueFor(failure: unknown): string {
  if (!isApiError(failure)) return common.errorGeneric;
  if (failure.kind === "offline") return common.errorOffline;
  if (failure.kind === "rate_limited") return common.errorRateLimited;
  return failure.kind === "server" ? common.errorServer : common.errorGeneric;
}

/**
 * Leave a plan: POST /plans/:id/withdraw, then back to the plan, which now reads as left. A plan that already ended (409
 * `plan_closed`) is read again and shown as it is, so the sheet does not argue with the server.
 */
export function CancelScreen({ planId, onClose }: CancelScreenProps) {
  const api = useApi();
  const { queryClient } = useDeps();
  const plan = useQuery(planDetailQuery(api, planId));
  const [issue, setIssue] = useState<string | null>(null);

  const leave = useMutation({
    mutationFn: () => withdrawPlan(api, planId),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.planDetail(planId), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.plansList() });
      onClose();
    },
    onError: (failure) => {
      if (isApiError(failure) && failure.code === "plan_closed") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.plansList() });
        onClose();
        return;
      }
      setIssue(issueFor(failure));
    },
  });

  return (
    <CancelView
      hasGroup={plan.data?.group != null}
      busy={leave.isPending}
      issue={issue}
      onLeave={() => {
        if (leave.isPending) return;
        setIssue(null);
        leave.mutate();
      }}
      onStay={onClose}
    />
  );
}
