/** Response shapes come straight from the API functions, so the two cannot drift. */
import type {
  createMute,
  getAccount,
  getEvent,
  getRun,
  listEvents,
  listFailedNotices,
  listHandles,
  listMutes,
  listReports,
  listRuns,
  listSources,
  listTickets,
  listUpcomingShows,
} from "../api";

export type SourcesResponse = { sources: ReturnType<typeof listSources> };
export type RunsResponse = ReturnType<typeof listRuns>;
export type Run = RunsResponse["runs"][number];
export type RunDetail = ReturnType<typeof getRun>;
export type EventsResponse = ReturnType<typeof listEvents>;
export type EventRow = EventsResponse["events"][number];
export type EventDetail = ReturnType<typeof getEvent>;
export type MutesResponse = ReturnType<typeof listMutes>;
export type Mute = ReturnType<typeof createMute>;

/** The harness writes this per agent source (docs/agent-harness.md). Every field is optional because the file is read, not trusted. */
export interface AgentReport {
  harness?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  emitted?: number | unknown[];
  accepted?: number | unknown[];
  quarantined?: { record?: unknown; reason?: string }[];
  rejected?: { line?: unknown; reason?: string }[];
}

export type TicketsResponse = ReturnType<typeof listTickets>;
export type TicketItem = TicketsResponse["tickets"][number];
export type ShowsResponse = ReturnType<typeof listUpcomingShows>;
export type ShowItem = ShowsResponse["shows"][number];
export type HandlesResponse = ReturnType<typeof listHandles>;
export type HandleItem = HandlesResponse["handles"][number];

export type ReportsResponse = ReturnType<typeof listReports>;
export type ReportCard = ReportsResponse["reports"][number];
export type AccountResponse = ReturnType<typeof getAccount>;
export type NoticesResponse = ReturnType<typeof listFailedNotices>;
