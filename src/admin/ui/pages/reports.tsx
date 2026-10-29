import { useState } from "react";
import { ErrorAlert, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { request, useApi } from "../api";
import { istTime } from "../lib/format";
import { Link } from "../router";
import type { ReportCard, ReportsResponse } from "../types";

const POLL_MS = 30_000;

function dueText(minutes: number): string {
  const abs = Math.abs(minutes);
  const text = abs >= 120 ? `${Math.floor(abs / 60)} h` : `${abs} min`;
  return minutes < 0 ? `${text} overdue` : `due in ${text}`;
}

function Person({ label, p, phone }: { label: string; p: ReportCard["reporter"]; phone?: string | null }) {
  return (
    <div className="grid gap-0.5 text-sm">
      <div className="text-muted-foreground text-xs">{label}</div>
      <Link to={`/accounts/${p.memberId}`} className="font-medium underline-offset-4 hover:underline">
        {p.firstName ?? "Erased account"} ({p.gender ?? "-"}, {p.status})
      </Link>
      <div className="text-muted-foreground text-xs">
        {p.showsDone} shows done, {p.reportsAbout.open} open, {p.reportsAbout.upheld} upheld and {p.reportsAbout.dismissed} dismissed
        reports about, {p.reportsMade} made, {p.downvotesReceived} downvotes
      </div>
      {phone && <div className="text-xs">{phone}</div>}
    </div>
  );
}

function Report({ report, done, onError }: { report: ReportCard; done: () => void; onError: (message: string) => void }) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"upheld" | "dismissed">();
  const [busy, setBusy] = useState(false);
  const blocked = report.contactRequired && report.contactedReporterAt === null;

  const send = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await request(`/api/reports/${report.reportId}/${path}`, { method: "POST", body });
      done();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setConfirming(undefined);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {report.showTitle ?? "Show"}
          <Badge variant={report.overdue ? "destructive" : "secondary"}>{dueText(report.minutesToDue)}</Badge>
        </CardTitle>
        <CardDescription>
          Report {report.reportId}, made {istTime(report.createdAt)}, due {istTime(report.dueAt)} (IST)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Person label="Reporter" p={report.reporter} phone={report.reporterPhone} />
          <Person label="Reported" p={report.subject} />
        </div>
        <p className="whitespace-pre-wrap rounded-md border p-3 text-sm">{report.body}</p>
        {report.thread.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm">Group thread ({report.thread.length} messages)</summary>
            <ul className="mt-2 grid gap-1 text-sm">
              {report.thread.map((m) => (
                <li key={m.messageId} className={m.reported ? "font-medium" : undefined}>
                  <span className="text-muted-foreground">
                    {istTime(m.createdAt)} {m.from}
                    {m.reported ? " (reported message)" : ""}:
                  </span>{" "}
                  {m.body}
                </li>
              ))}
            </ul>
          </details>
        )}
        {report.reporterDeleted && <div className="text-sm">Reporter deleted their account.</div>}
        {report.contactRequired && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {report.contactedReporterAt === null ? (
              <>
                <span>A woman reported a man: contact her before closing.</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => send("contacted")}>
                  Mark contacted
                </Button>
              </>
            ) : (
              <span>Reporter contacted {istTime(report.contactedReporterAt)}.</span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Note"
            placeholder="Note for the record (kept with the report, not in the action log)"
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            className="min-w-64 flex-1"
          />
          {(["dismissed", "upheld"] as const).map((outcome) => (
            <Button
              key={outcome}
              size="sm"
              variant={confirming === outcome || outcome === "upheld" ? "destructive" : "outline"}
              disabled={busy || blocked || note.trim() === ""}
              onClick={() => (confirming === outcome ? send("close", { outcome, note }) : setConfirming(outcome))}
            >
              {confirming === outcome
                ? `Confirm ${outcome === "upheld" ? "uphold and ban" : "dismiss"}`
                : outcome === "upheld"
                  ? "Uphold and ban"
                  : "Dismiss"}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const { data, error, loading, reload } = useApi<ReportsResponse>("/api/reports", () => POLL_MS);
  const [failure, setFailure] = useState<string>();
  return (
    <>
      <PageHeader
        title="Reports"
        description="Open reports, the one due first at the top. The reported person is suspended until you close it."
      />
      {error && <ErrorAlert error={error} />}
      {failure && <ErrorAlert error={failure} title="Could not update the report" />}
      {data?.reports.map((report) => (
        <Report
          key={report.reportId}
          report={report}
          done={() => {
            setFailure(undefined);
            reload();
          }}
          onError={setFailure}
        />
      ))}
      {!loading && data?.reports.length === 0 && <p className="text-muted-foreground text-sm">No reports are open.</p>}
    </>
  );
}
