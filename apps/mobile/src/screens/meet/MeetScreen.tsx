import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckinResponse, GroupResponse } from "@turnout/contract/app/groups";
import { useSyncExternalStore } from "react";
import { Linking } from "react-native";
import { type CheckinVariables, checkinMutationKey, groupQuery, isRevealed, markCheckedIn, meetContextQuery } from "@/api/groups";
import { queryKeys } from "@/api/keys";
import { nativeLocation } from "@/api/locationNative";
import { type Replayable, replayable } from "@/api/mutations";
import { showsRealMap } from "@/api/variant";
import { errorKind, isApiError } from "@/model/apiError";
import { locationLine, mapsUrl } from "@/model/meetCard";
import { meetPhase, watchesLocation } from "@/model/meetWindow";
import { toPoint } from "@/model/walk";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { useMeetLocation } from "@/providers/useMeetLocation";
import { useNow } from "@/providers/useNow";
import { moments } from "@/ui/moments";
import { type HereStatus, MeetView, type MeetViewState } from "./MeetView";

const CLOCK_EVERY_MS = 30_000;
const REFRESH_EVERY_MS = 30_000;
const EMERGENCY_URL = "tel:112";

export interface MeetScreenProps {
  groupId: string;
  /** The card is the screen in front. The location watch stops when it is not. */
  focused: boolean;
  onBack: () => void;
  /** Opens the show page. */
  onOpenShow: (eventId: string) => void;
  /** Opens the way to leave this plan. */
  onLeave: (planId: string) => void;
  /** Opens the group chat. */
  onOpenThread: () => void;
  /** Opens the report form for this group. */
  onReport: () => void;
  /** From the closed card back to the plans. */
  onClosed: () => void;
  /** From the closed card of a group that is done to the after-the-show screen (A20). */
  onOpenAfter: () => void;
}

function open(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * The meet card on live data. It opens from the group kept on disk, so a person with no signal still sees the cafe, the map pins and
 * the group. "I'm here" is sent with no body: where the phone is stays on the phone, and is only used for the walk line.
 */
export function MeetScreen({
  groupId,
  focused,
  onBack,
  onOpenShow,
  onLeave,
  onOpenThread,
  onReport,
  onClosed,
  onOpenAfter,
}: MeetScreenProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const now = useNow(CLOCK_EVERY_MS);
  const group = useQuery({ ...groupQuery(api, groupId), refetchInterval: focused ? REFRESH_EVERY_MS : false });
  const context = useQuery(meetContextQuery(api, groupId));

  const plan = context.data ?? null;
  const revealed = group.data && isRevealed(group.data) ? group.data : null;
  const times = group.data ? { revealAt: group.data.revealAt, startsAt: group.data.showSnapshot.startsAt } : null;
  const phase = times ? meetPhase(times, now) : null;
  const beforeStart = times ? watchesLocation(times, now) : false;

  const location = useMeetLocation(nativeLocation, { focused, watching: beforeStart });
  const cafePoint = revealed ? toPoint(revealed.cafe.lat, revealed.cafe.lng) : null;

  // The send function is registered by key (registerCheckin), so a check-in saved offline can be sent again after a restart.
  const checkin = useMutation<CheckinResponse, Error, Replayable<CheckinVariables>, { before: GroupResponse | undefined }>({
    mutationKey: checkinMutationKey,
    onMutate: async () => {
      const key = queryKeys.group(groupId);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<GroupResponse>(key);
      if (before) queryClient.setQueryData(key, markCheckedIn(before));
      return { before };
    },
    onError: (_error, _variables, saved) => {
      if (saved?.before) queryClient.setQueryData(queryKeys.group(groupId), saved.before);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
  });

  let state: MeetViewState;
  if (group.isError && isApiError(group.error) && group.error.kind === "not_found") {
    state = { status: "closed" };
  } else if (group.data === undefined) {
    const stalledOffline = group.isPending && group.fetchStatus === "paused" && group.failureCount > 0;
    state =
      group.isError || stalledOffline
        ? { status: "error", kind: stalledOffline ? "offline" : errorKind(group.error) }
        : { status: "loading" };
  } else if (phase === "closed") {
    state = { status: "closed" };
  } else if (phase === "waiting" || revealed === null) {
    state = { status: "waiting", revealAt: group.data.revealAt };
  } else {
    const venue = plan?.venue ?? null;
    state = {
      status: "ready",
      card: {
        showTitle: revealed.showSnapshot.title,
        startsAt: revealed.showSnapshot.startsAt,
        meetAt: revealed.meetAt,
        cafe: revealed.cafe,
        venue: {
          name: venue?.name ?? revealed.showSnapshot.venueName,
          lat: venue?.point?.lat ?? null,
          lng: venue?.point?.lng ?? null,
        },
        members: revealed.members,
        belowPlan: revealed.belowPlan,
      },
    };
  }

  let here: HereStatus = "idle";
  if (checkin.isPaused) here = "queued";
  else if (checkin.isPending) here = "sending";
  else if (checkin.isError) here = "failed";

  const line = locationLine({
    beforeStart,
    permission: location.permission,
    canAskAgain: location.canAskAgain,
    point: location.point,
    cafe: cafePoint,
  });

  const onHere = () => {
    moments.imHere();
    checkin.mutate(replayable({ groupId }));
  };

  return (
    <MeetView
      state={state}
      now={now}
      offline={offline}
      here={here}
      line={line}
      realMap={showsRealMap()}
      onBack={onBack}
      onRetry={() => void group.refetch()}
      onOpenShow={plan ? () => onOpenShow(plan.eventId) : null}
      onOpenMaps={() => {
        if (cafePoint && revealed) open(mapsUrl(cafePoint, revealed.cafe.name));
      }}
      onAskLocation={location.request}
      onOpenSettings={() => void Linking.openSettings().catch(() => undefined)}
      onHere={onHere}
      onCall={() => open(EMERGENCY_URL)}
      onOpenThread={onOpenThread}
      onReport={onReport}
      onLeave={plan ? () => onLeave(plan.planId) : null}
      onClosed={onClosed}
      onOpenAfter={group.data?.state === "done" ? onOpenAfter : null}
    />
  );
}
