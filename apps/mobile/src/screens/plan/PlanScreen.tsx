import { useQuery } from "@tanstack/react-query";
import { CalendarX } from "phosphor-react-native";
import { useEffect, useSyncExternalStore } from "react";
import { groupQuery } from "@/api/groups";
import { memberShowQuery, planDetailQuery } from "@/api/plans";
import { confirmedPlayed, markConfirmedPlayed } from "@/api/prefs";
import { plan as copy } from "@/copy/plan";
import { isApiError } from "@/model/apiError";
import { groupFacts } from "@/model/groupFacts";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { useNow } from "@/providers/useNow";
import { BackBar } from "@/ui/BackBar";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState } from "@/ui/ErrorState";
import { moments } from "@/ui/moments";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { SkeletonRow } from "@/ui/SkeletonRow";
import { PlanView } from "./PlanView";

const POLL_MS = 60_000;

export interface PlanScreenProps {
  planId: string;
  onBack: () => void;
  onAddTicket: () => void;
  /** Opens the meet card of this group (A15's page). */
  onOpenMeetCard: (groupId: string) => void;
  /** Opens the after-the-show screen of this group (A20). */
  onOpenAfter: (groupId: string) => void;
  onLeave: () => void;
  onFindShow: () => void;
  onChangeHandle: () => void;
  /** The plan is not there: back to the list. */
  onPlans: () => void;
}

/**
 * One plan on live data. The plan is read again every minute, so a ticket the operator has looked at or a group that has formed shows
 * up without a pull. The group is asked for only while it is confirmed or live, and only its size and times are kept (`groupFacts`).
 */
export function PlanScreen({
  planId,
  onBack,
  onAddTicket,
  onOpenMeetCard,
  onOpenAfter,
  onLeave,
  onFindShow,
  onChangeHandle,
  onPlans,
}: PlanScreenProps) {
  const api = useApi();
  const { prefs, connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const now = useNow(POLL_MS);
  const plan = useQuery({ ...planDetailQuery(api, planId), refetchInterval: POLL_MS });
  const data = plan.data;
  const wantsGroup = data?.group != null && (data.state === "group_confirmed" || data.state === "meet_card_live");
  const group = useQuery({ ...groupQuery(api, data?.group?.id ?? ""), enabled: wantsGroup });
  const looking = useQuery({ ...memberShowQuery(api, data?.eventId ?? ""), enabled: data?.state === "finding_group" });

  const confirmed = data?.state === "group_confirmed";
  useEffect(() => {
    if (!confirmed || confirmedPlayed(prefs, planId)) return;
    markConfirmedPlayed(prefs, planId);
    moments.groupConfirmed();
  }, [confirmed, prefs, planId]);

  if (!data) {
    const missing = plan.isError && isApiError(plan.error) && plan.error.kind === "not_found";
    return (
      <SafeAreaView className="flex-1 bg-bg" testID="plan-loading">
        <BackBar onBack={onBack} />
        {missing ? (
          <EmptyState
            icon={CalendarX}
            title={copy.missing.title}
            body={copy.missing.body}
            action={{ title: copy.missing.action, onPress: onPlans }}
          />
        ) : plan.isError ? (
          <ErrorState
            kind={isApiError(plan.error) && plan.error.kind === "offline" ? "offline" : "other"}
            onRetry={() => void plan.refetch()}
          />
        ) : (
          <SkeletonRow />
        )}
      </SafeAreaView>
    );
  }

  return (
    <PlanView
      plan={data}
      facts={groupFacts(data, group.data)}
      now={now}
      lookingCount={looking.data?.lookingCount ?? null}
      offline={offline}
      onBack={onBack}
      onAddTicket={onAddTicket}
      onOpenMeetCard={() => data.group && onOpenMeetCard(data.group.id)}
      onOpenAfter={() => data.group && onOpenAfter(data.group.id)}
      onLeave={onLeave}
      onFindShow={onFindShow}
      onChangeHandle={onChangeHandle}
    />
  );
}
