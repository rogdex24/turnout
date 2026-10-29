import { useState } from "react";
import { ErrorAlert, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { request, useApi } from "../api";
import { istTime } from "../lib/format";
import { navigate } from "../router";
import type { AccountResponse } from "../types";

type Verb = "suspend" | "reinstate" | "ban";

const CONFIRM: Record<Verb, string> = {
  suspend: "Confirm suspend",
  reinstate: "Confirm reinstate",
  ban: "Confirm ban: erases the account",
};

export function AccountsPage() {
  const [id, setId] = useState("");
  return (
    <>
      <PageHeader title="Accounts" description="Look an account up by its member id, from a report or a notice." />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (id.trim()) navigate(`/accounts/${encodeURIComponent(id.trim())}`);
        }}
      >
        <Input
          aria-label="Member id"
          placeholder="Member id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          className="max-w-md"
        />
        <Button type="submit">Open</Button>
      </form>
    </>
  );
}

export function AccountPage({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<AccountResponse>(`/api/accounts/${encodeURIComponent(id)}`);
  const [confirming, setConfirming] = useState<Verb>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);

  const send = async (verb: Verb) => {
    setBusy(true);
    setFailure(undefined);
    try {
      await request(`/api/accounts/${encodeURIComponent(id)}/${verb}`, { method: "POST" });
      reload();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setConfirming(undefined);
    }
  };

  return (
    <>
      <PageHeader title="Account" description={id} />
      {error && <ErrorAlert error={error} />}
      {failure && <ErrorAlert error={failure} title="Could not change the account" />}
      {loading && !data && <p className="text-muted-foreground text-sm">Loading.</p>}
      {data && (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {data.firstName ?? "Erased account"}
                <Badge variant={data.status === "active" ? "secondary" : "destructive"}>
                  {data.status}
                  {data.statusReason ? ` (${data.statusReason})` : ""}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div>
                {data.gender ?? "-"}, member since {istTime(data.memberSince)}, {data.showsDone} shows done
              </div>
              <div>
                {data.phone ?? "No number"}, handle {data.handle ? `${data.handle.kind} ${data.handle.status}` : "none"},{" "}
                {data.activeSessions} signed-in sessions, {data.devices} devices
              </div>
              <div>
                Reports about: {data.reportsAbout.open} open, {data.reportsAbout.upheld} upheld, {data.reportsAbout.dismissed} dismissed.
                Reports made: {data.reportsMade}. Downvotes: {data.downvotesReceived}.
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["suspend", "reinstate", "ban"] as const).map((verb) => (
                  <Button
                    key={verb}
                    size="sm"
                    variant={verb === "ban" || confirming === verb ? "destructive" : "outline"}
                    disabled={busy || data.status === "deleted"}
                    onClick={() => (confirming === verb ? send(verb) : setConfirming(verb))}
                  >
                    {confirming === verb ? CONFIRM[verb] : verb[0]?.toUpperCase() + verb.slice(1)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Plans</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {data.plans.length === 0 && <span className="text-muted-foreground">None.</span>}
              {data.plans.map((p) => (
                <div key={p.planId}>
                  {p.showTitle}, {istTime(p.showStartsAt)}: {p.state}
                  {p.reason ? ` (${p.reason})` : ""}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reports and operator actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {data.reports.map((r) => (
                <div key={r.reportId}>
                  {istTime(r.createdAt)}: {r.role} in report {r.reportId}, {r.status}
                  {r.outcome ? ` (${r.outcome})` : ""}
                </div>
              ))}
              {data.actions.map((a) => (
                <div key={a.createdAt + a.action}>
                  {istTime(a.createdAt)}: {a.action}
                </div>
              ))}
              {data.reports.length + data.actions.length === 0 && <span className="text-muted-foreground">None.</span>}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
