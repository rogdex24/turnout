import type { QueryClient } from "@tanstack/react-query";
import { type CreateReportRequest, type CreateReportResponse, createReportResponseSchema } from "@turnout/contract/app/reports";
import type { ApiClient } from "./client";
import { mutationKey, type Replayable, registerReplayable } from "./mutations";
import { retryTransient } from "./retry";

/** What the person writes. The `clientId` is added by the replayable wrapper. */
export type ReportVariables = Omit<CreateReportRequest, "clientId">;

/** POST /reports. The same `clientId` sent twice stores one report and answers with it. */
export function sendReport(api: ApiClient) {
  return ({ clientId, payload }: Replayable<ReportVariables>): Promise<CreateReportResponse> =>
    api.request({ method: "POST", path: "/reports", body: { ...payload, clientId }, schema: createReportResponseSchema });
}

/** Lets a report written without a network be sent after a restart, once the phone is back online. */
export function registerReport(queryClient: QueryClient, api: ApiClient): void {
  registerReplayable<ReportVariables>(queryClient, "report", sendReport(api), retryTransient);
}

export const reportMutationKey = mutationKey("report");
