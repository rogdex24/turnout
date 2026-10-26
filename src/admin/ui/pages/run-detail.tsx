import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "../api";
import { duration, istTime } from "../lib/format";
import { Link } from "../router";
import type { AgentReport, RunDetail } from "../types";

const POLL_MS = 2000;
/** The child writes its sync_run row a moment after the 202; a 404 this soon is normal. */
const REGISTER_ATTEMPTS = 15;

type SourceRow = RunDetail["sources"][number];

const columns: Column<SourceRow>[] = [
  { header: "Source", cell: (row) => <span className="font-medium">{row.source}</span> },
  { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { header: "Items", cell: (row) => row.itemsFetched, className: "text-right" },
  { header: "Occurrences", cell: (row) => row.occurrences, className: "text-right" },
  { header: "Missing venue", cell: (row) => row.missingVenue, className: "text-right" },
  { header: "Health reason or error", cell: (row) => row.error ?? "-", className: "max-w-96 whitespace-normal break-words" },
];

export function RunDetailPage({ id }: { id: string }) {
  const { data: run, error } = useApi<RunDetail>(`/api/runs/${id}`, (result) => {
    if (result.error) return result.error.status === 404 && result.failures < REGISTER_ATTEMPTS ? 1000 : null;
    return result.data?.status === "running" ? POLL_MS : null;
  });

  if (!run) {
    return (
      <>
        <PageHeader title="Run" description={id} />
        {error && error.status !== 404 && <ErrorAlert error={error} />}
        {error?.status === 404 ? (
          <p className="text-muted-foreground text-sm">
            Waiting for the sync process to register this run. If it never appears, check the newest file in data/admin-runs/.
          </p>
        ) : (
          !error && <p className="text-muted-foreground text-sm">Loading...</p>
        )}
      </>
    );
  }

  const agentSources = Object.keys(run.agentReports);
  return (
    <>
      <PageHeader
        title={`Run ${istTime(run.startedAt)}`}
        description={`${id}  |  ${duration(run.startedAt, run.finishedAt)}  |  fetched ${run.eventsFetched}, created ${run.eventsCreated}, updated ${run.eventsUpdated}, delisted ${run.eventsDelisted}`}
        actions={<StatusBadge status={run.status} />}
      />
      <p className="mb-4 text-sm">
        <Link to="/runs" className="text-muted-foreground underline-offset-4 hover:underline">
          All runs
        </Link>
      </p>
      {run.error && run.sources.length === 0 && <ErrorAlert error={run.error} title="Run error" />}
      <DataTable
        columns={columns}
        rows={run.sources}
        rowKey={(row) => row.source}
        empty="No source rows yet. They appear once the sources have been fetched."
      />
      {agentSources.map((source) => (
        <AgentReportTabs key={source} source={source} report={run.agentReports[source] as AgentReport | null} />
      ))}
    </>
  );
}

const count = (value: number | unknown[] | undefined): number => (Array.isArray(value) ? value.length : (value ?? 0));

function AgentReportTabs({ source, report }: { source: string; report: AgentReport | null }) {
  const quarantined = report?.quarantined ?? [];
  const rejected = report?.rejected ?? [];
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-base font-semibold">{source}</h2>
      {!report ? (
        <p className="text-muted-foreground text-sm">No report.json for this run yet.</p>
      ) : (
        <Tabs defaultValue="accepted">
          <TabsList>
            <TabsTrigger value="accepted">
              Accepted <Badge variant="secondary">{count(report.accepted)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="quarantined">
              Quarantined <Badge variant="secondary">{quarantined.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected <Badge variant="secondary">{rejected.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="accepted" className="text-muted-foreground text-sm">
            {count(report.accepted)} of {count(report.emitted)} emitted records passed verification and were stored. Exit code{" "}
            {report.exitCode ?? "unknown"}.
          </TabsContent>
          <TabsContent value="quarantined">
            <ReasonTable rows={quarantined.map((item) => ({ what: item.record, reason: item.reason }))} empty="Nothing was quarantined." />
          </TabsContent>
          <TabsContent value="rejected">
            <ReasonTable rows={rejected.map((item) => ({ what: item.line, reason: item.reason }))} empty="Nothing was rejected." />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}

function ReasonTable({ rows, empty }: { rows: { what: unknown; reason?: string }[]; empty: string }) {
  const columns: Column<{ what: unknown; reason?: string }>[] = [
    { header: "Reason", cell: (row) => row.reason ?? "-", className: "w-1/3 whitespace-normal align-top" },
    {
      header: "Record",
      cell: (row) => (
        <pre className="max-h-40 overflow-auto text-xs whitespace-pre-wrap">
          {typeof row.what === "string" ? row.what : JSON.stringify(row.what, null, 2)}
        </pre>
      ),
      className: "whitespace-normal",
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => JSON.stringify(row)} empty={empty} />;
}
