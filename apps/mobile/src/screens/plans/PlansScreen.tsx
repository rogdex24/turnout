import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { plansListQuery } from "@/api/plans";
import { pendingRead } from "@/model/apiError";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { type PlansState, PlansView } from "./PlansView";

export interface PlansScreenProps {
  onOpenPlan: (planId: string) => void;
  onFindShow: () => void;
}

/** The Plans tab on live data: GET /plans, refreshed by pulling down. The list is kept on the phone, so it opens with what was last seen. */
export function PlansScreen({ onOpenPlan, onFindShow }: PlansScreenProps) {
  const api = useApi();
  const { connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const list = useQuery(plansListQuery(api));

  const state: PlansState = list.data ? { status: "ready", plans: list.data.plans } : pendingRead(list);

  return (
    <PlansView
      state={state}
      offline={offline}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      onRetry={() => void list.refetch()}
      onOpenPlan={onOpenPlan}
      onFindShow={onFindShow}
    />
  );
}
