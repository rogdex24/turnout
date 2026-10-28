import { useState } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { ReviewActions } from "@/components/review-actions";
import { Badge } from "@/components/ui/badge";
import { useApi } from "../api";
import { istTime } from "../lib/format";
import { TICKET_REASONS, timeLeft } from "../lib/reasons";
import type { TicketItem, TicketsResponse } from "../types";

const POLL_MS = 30_000;

export function TicketsPage() {
  const { data, error, loading, reload } = useApi<TicketsResponse>("/api/tickets", () => POLL_MS);
  const [failure, setFailure] = useState<string>();

  const columns: Column<TicketItem>[] = [
    { header: "Show", cell: (t) => <span className="font-medium">{t.showTitle}</span>, className: "max-w-64 truncate" },
    { header: "Show starts (IST)", cell: (t) => istTime(t.showStartsAt), className: "whitespace-nowrap" },
    { header: "Time left", cell: (t) => timeLeft(t.minutesLeft), className: "whitespace-nowrap" },
    {
      header: "Same file",
      cell: (t) =>
        t.duplicates > 0 ? <Badge variant="destructive">{t.duplicates} other</Badge> : <span className="text-muted-foreground">none</span>,
    },
    { header: "Uploaded (IST)", cell: (t) => istTime(t.uploadedAt), className: "whitespace-nowrap" },
    {
      header: "File",
      cell: (t) =>
        t.fileUrl ? (
          <a href={t.fileUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            Open {t.mime === "application/pdf" ? "PDF" : "image"}
          </a>
        ) : (
          <span className="text-muted-foreground">no link</span>
        ),
    },
    {
      header: "",
      cell: (t) => (
        <ReviewActions
          path={`/api/tickets/${t.ticketId}`}
          reasons={TICKET_REASONS}
          done={() => {
            setFailure(undefined);
            reload();
          }}
          onError={setFailure}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Tickets waiting for an answer, the ones that run out of time first. Each lock is T-24h before the show."
      />
      {error && <ErrorAlert error={error} />}
      {failure && <ErrorAlert error={failure} title="Could not answer the ticket" />}
      <DataTable columns={columns} rows={data?.tickets} loading={loading} rowKey={(t) => t.ticketId} empty="No tickets are waiting." />
    </>
  );
}
