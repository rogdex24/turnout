import { type Column, DataTable } from "@/components/data-table";
import { NewRunDialog } from "@/components/new-run-dialog";
import { ErrorAlert, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { useApi } from "../api";
import { duration, istTime } from "../lib/format";
import { Link } from "../router";
import type { Run, RunsResponse } from "../types";

const POLL_MS = 2000;

const columns: Column<Run>[] = [
  {
    header: "Started (IST)",
    cell: (run) => (
      <Link to={`/runs/${run.id}`} className="font-medium underline-offset-4 hover:underline">
        {istTime(run.startedAt)}
      </Link>
    ),
  },
  { header: "Status", cell: (run) => <StatusBadge status={run.status} /> },
  { header: "Duration", cell: (run) => duration(run.startedAt, run.finishedAt) },
  { header: "Sources", cell: (run) => run.sources.map((source) => source.source).join(", ") || "-", className: "max-w-64 truncate" },
  { header: "Fetched", cell: (run) => run.eventsFetched, className: "text-right" },
  { header: "Created", cell: (run) => run.eventsCreated, className: "text-right" },
  { header: "Updated", cell: (run) => run.eventsUpdated, className: "text-right" },
  { header: "Delisted", cell: (run) => run.eventsDelisted, className: "text-right" },
];

export function RunsPage() {
  // Poll while any row is still running; a finished list stays still.
  const { data, error, loading } = useApi<RunsResponse>("/api/runs?limit=50", ({ data }) =>
    data?.runs.some((run) => run.status === "running") ? POLL_MS : null,
  );

  return (
    <>
      <PageHeader title="Runs" description="Recent syncs, newest first." actions={<NewRunDialog />} />
      {error && <ErrorAlert error={error} />}
      <DataTable
        columns={columns}
        rows={data?.runs}
        loading={loading}
        rowKey={(run) => run.id}
        empty="No runs yet. Start one with New run."
      />
    </>
  );
}
