import { useState } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { request, useApi } from "../api";
import { percent } from "../lib/format";
import { navigate } from "../router";
import type { SourcesResponse } from "../types";

type SourceRow = SourcesResponse["sources"][number];

/** Occurrences over the last runs, oldest on the left, scaled to the tallest bar. */
function Bars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg
      width={values.length * 8}
      height="24"
      role="img"
      aria-label={`Occurrences over the last ${values.length} runs: ${values.join(", ")}`}
    >
      {values.map((value, index) => {
        const height = Math.max(1, Math.round((value / max) * 24));
        const x = index * 8;
        return <rect key={x} x={x} y={24 - height} width="6" height={height} className="fill-primary/70" />;
      })}
    </svg>
  );
}

export function SourcesPage() {
  const { data, error, loading } = useApi<SourcesResponse>("/api/sources");
  const [message, setMessage] = useState<string>();

  const runNow = async (name: string) => {
    setMessage(undefined);
    try {
      const { runId } = await request<{ runId: string }>("/api/runs", { method: "POST", body: { sources: [name] } });
      navigate(`/runs/${runId}`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const columns: Column<SourceRow>[] = [
    {
      header: "Source",
      cell: (source) => (
        <span className="flex items-center gap-2 font-medium">
          {source.name}
          {source.optIn && <Badge variant="secondary">agent</Badge>}
        </span>
      ),
    },
    {
      header: "Last status",
      cell: (source) =>
        source.recentRuns[0] ? (
          <StatusBadge status={source.recentRuns[0].status} />
        ) : (
          <span className="text-muted-foreground">never run</span>
        ),
    },
    {
      header: "Occurrences, last 7 runs",
      cell: (source) => (source.recentRuns.length ? <Bars values={[...source.recentRuns].reverse().map((run) => run.occurrences)} /> : "-"),
    },
    {
      header: "Missing venue",
      cell: (source) => (source.recentRuns[0] ? percent(source.recentRuns[0].missingVenue, source.recentRuns[0].occurrences) : "-"),
      className: "text-right",
    },
    {
      header: "",
      cell: (source) => (
        <Button size="sm" variant="outline" onClick={() => runNow(source.name)}>
          Run now
        </Button>
      ),
      className: "text-right",
    },
  ];

  return (
    <>
      <PageHeader title="Sources" description="Every registered source and how its last runs went." />
      {error && <ErrorAlert error={error} />}
      {message && <ErrorAlert error={message} title="Could not start the run" />}
      <DataTable
        columns={columns}
        rows={data?.sources}
        loading={loading}
        rowKey={(source) => source.name}
        empty="No sources are registered."
      />
    </>
  );
}
