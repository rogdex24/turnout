import { useMutation, useQuery } from "@tanstack/react-query";
import type { CreateReportResponse } from "@turnout/contract/app/reports";
import { useSyncExternalStore } from "react";
import { Linking } from "react-native";
import { groupQuery, isRevealed } from "@/api/groups";
import { type Replayable, replayable } from "@/api/mutations";
import { type ReportVariables, reportMutationKey } from "@/api/reports";
import { isApiError } from "@/model/apiError";
import { reportBody } from "@/model/report";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { type ReportPerson, ReportView, type ReportViewState } from "./ReportView";

const EMERGENCY_URL = "tel:112";

export interface ReportScreenProps {
  groupId: string;
  /** Who the report starts on: the person whose card or message the person came from. */
  memberRef?: string;
  /** Set when the report is about one message. */
  messageId?: string;
  onBack: () => void;
  onDone: () => void;
}

function errorKind(error: unknown): "offline" | "server" | "rate_limited" | "other" {
  if (!isApiError(error)) return "other";
  if (error.kind === "offline" || error.kind === "server" || error.kind === "rate_limited") return error.kind;
  return "other";
}

/**
 * The report form on live data. The people come from the group kept on disk, so a report can be written with no signal: it is saved
 * and sent when the phone is back online. What becomes of the person reported is never read or shown here.
 */
export function ReportScreen({ groupId, memberRef, messageId, onBack, onDone }: ReportScreenProps) {
  const api = useApi();
  const { connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const group = useQuery(groupQuery(api, groupId));

  // The send function is registered by key (registerReport), so a report saved offline is sent after a restart.
  const report = useMutation<CreateReportResponse, Error, Replayable<ReportVariables>>({ mutationKey: reportMutationKey });

  let state: ReportViewState;
  if (report.isSuccess) {
    state = { status: "sent" };
  } else if (report.isPaused) {
    state = { status: "queued" };
  } else if (group.data === undefined) {
    const stalledOffline = group.isPending && group.fetchStatus === "paused" && group.failureCount > 0;
    state =
      group.isError || stalledOffline
        ? { status: "error", kind: stalledOffline ? "offline" : errorKind(group.error) }
        : { status: "loading" };
  } else if (!isRevealed(group.data)) {
    state = { status: "error", kind: "other" };
  } else {
    const people: ReportPerson[] = group.data.members
      .filter((member) => !member.isYou)
      .map(({ memberRef: ref, firstName, photoUrl }) => ({ memberRef: ref, firstName, photoUrl }));
    const known = people.some((person) => person.memberRef === memberRef);
    state = {
      status: "form",
      people,
      initialMemberRef: known ? (memberRef ?? null) : null,
      aboutMessage: messageId !== undefined && known,
    };
  }

  return (
    <ReportView
      state={state}
      offline={offline}
      sending={report.isPending && !report.isPaused}
      failed={report.isError}
      onBack={onBack}
      onRetry={() => void group.refetch()}
      onCall={() => void Linking.openURL(EMERGENCY_URL).catch(() => undefined)}
      onSubmit={({ memberRef: about, reasonLabel, details }) =>
        report.mutate(
          replayable({
            groupId,
            memberRef: about,
            ...(messageId !== undefined && about === memberRef ? { messageId } : {}),
            body: reportBody(reasonLabel, details),
          }),
        )
      }
      onDone={onDone}
    />
  );
}
