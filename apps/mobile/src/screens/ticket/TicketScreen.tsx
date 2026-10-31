import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarX } from "phosphor-react-native";
import { useEffect, useState, useSyncExternalStore } from "react";
import { queryKeys } from "@/api/keys";
import { permissionChanged } from "@/api/notifications";
import { deletePickedFile } from "@/api/pickedFiles";
import { memberShowQuery, planDetailQuery, putTicket } from "@/api/plans";
import { markTicketAsked, ticketAsked } from "@/api/prefs";
import { ticket as copy } from "@/copy/ticket";
import { ApiError, isApiError } from "@/model/apiError";
import { uploadProgress } from "@/model/photo";
import { istWhen } from "@/model/planTime";
import { checkPicked, type PickedTicket, problemFromError, type TicketProblem, ticketPhase } from "@/model/ticketFile";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { BackBar } from "@/ui/BackBar";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState } from "@/ui/ErrorState";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { SkeletonRow } from "@/ui/SkeletonRow";
import { askNotifications } from "./askNotifications";
import { TicketView } from "./TicketView";
import { chooseTicket, readTicket } from "./ticketPicker";

const CHECKING_POLL_MS = 60_000;

export interface TicketScreenProps {
  planId: string;
  onBack: () => void;
  /** "I'll do it later": leaves with the plan still waiting for its ticket. */
  onLater: () => void;
  /** The ticket is with the operator and nothing is left to do here. */
  onDone: () => void;
  /** The plan has moved past the ticket (accepted, grouped, ended): its own page is the place to be. */
  onPlan: () => void;
}

/**
 * Add your ticket on the real plan. The screenshot is chosen, checked for type and size with the contract's own rule, then sent as the
 * raw body with progress. A file that is chosen stays through an offline spell and a failed send; only Send waits. The plan's state
 * picks the phase, so a ticket the operator turned down lands on the rejected phase without anything being passed in.
 */
export function TicketScreen({ planId, onBack, onLater, onDone, onPlan }: TicketScreenProps) {
  const api = useApi();
  const { queryClient, prefs, connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  // While the ticket is being checked the page asks again every minute, so an answer shows without leaving it.
  const plan = useQuery({
    ...planDetailQuery(api, planId, queryClient),
    refetchInterval: (query) => (query.state.data?.state === "checking_ticket" ? CHECKING_POLL_MS : false),
  });
  const planData = plan.data;
  const member = useQuery({ ...memberShowQuery(api, planData?.eventId ?? ""), enabled: planData !== undefined });
  const proofKind = member.data?.proofKind ?? "screenshot";

  const [file, setFile] = useState<PickedTicket | null>(null);
  const [problem, setProblem] = useState<TicketProblem | null>(null);
  const [progress, setProgress] = useState(0);
  const [askNotify, setAskNotify] = useState(false);

  const phase = planData ? ticketPhase(planData.state) : null;
  // The plan moved past the ticket phases (the operator accepted it, or it ended): go to the plan page.
  useEffect(() => {
    if (planData && phase === null) onPlan();
  }, [planData, phase, onPlan]);

  const send = useMutation({
    mutationFn: async (chosen: PickedTicket) => {
      const blob = await readTicket(chosen).catch(() => {
        throw new ApiError("validation", null, "bad_ticket");
      });
      setProgress(0);
      return putTicket(api, planId, blob, (sent, total) => setProgress(uploadProgress(sent, total)));
    },
    onSuccess: (updated, sent) => {
      // The ticket is up; the copy the picker made in the cache is the person's own proof, so it does not stay.
      deletePickedFile(sent.uri);
      queryClient.setQueryData(queryKeys.planDetail(planId), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.plansList() });
      setFile(null);
      setProblem(null);
      setAskNotify(!ticketAsked(prefs));
    },
    onError: (failure) => {
      const reason = isApiError(failure) ? problemFromError(failure) : "server";
      setProblem(reason);
      // A plan that has ended or moved on shows its true state, so the page stops offering a send.
      if (reason === "plan_closed") void queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
    },
  });

  if (!planData) {
    const missing = plan.isError && isApiError(plan.error) && plan.error.kind === "not_found";
    const stalledOffline = plan.fetchStatus === "paused";
    return (
      <SafeAreaView className="flex-1 bg-bg" testID="ticket-loading">
        <BackBar onBack={onBack} />
        {missing ? (
          <EmptyState icon={CalendarX} title={copy.load.missing} />
        ) : plan.isError || stalledOffline ? (
          <ErrorState
            kind={stalledOffline || (isApiError(plan.error) && plan.error.kind === "offline") ? "offline" : "other"}
            onRetry={() => void plan.refetch()}
          />
        ) : (
          <SkeletonRow />
        )}
      </SafeAreaView>
    );
  }

  const choose = async () => {
    // A tap before the show's answer is in waits for it, so a seller that takes PDFs is not narrowed to screenshots. If the show
    // cannot be read (offline, or no longer listed) the stricter rule stands.
    const kind = member.data
      ? proofKind
      : await queryClient.fetchQuery(memberShowQuery(api, planData.eventId)).then(
          (show) => show.proofKind,
          () => proofKind,
        );
    let picked: PickedTicket | null;
    try {
      picked = await chooseTicket(kind);
    } catch {
      // The picker failed to open or the file could not be read: nothing was chosen, so there is nothing to say.
      return;
    }
    if (!picked) return;
    setFile(picked);
    setProblem(checkPicked(kind, picked));
  };

  const answerNotify = async (on: boolean) => {
    setAskNotify(false);
    markTicketAsked(prefs);
    if (on) {
      await askNotifications();
      permissionChanged();
    }
  };

  return (
    <TicketView
      phase={phase ?? "checking"}
      show={{ title: planData.show.title, when: istWhen(planData.show.startsAt) }}
      proofKind={proofKind}
      file={file}
      problem={problem}
      rejectReason={planData.ticket?.rejectReason ?? null}
      uploading={send.isPending}
      progress={progress}
      offline={offline}
      askNotify={askNotify}
      onBack={onBack}
      onChoose={() => void choose()}
      onSend={() => {
        if (file && !send.isPending) {
          setProblem(null);
          send.mutate(file);
        }
      }}
      onLater={onLater}
      onDone={onDone}
      onNotify={() => void answerNotify(true)}
      onNotNow={() => void answerNotify(false)}
    />
  );
}
