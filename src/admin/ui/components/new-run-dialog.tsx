import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { request, useApi } from "../api";
import { navigate } from "../router";
import type { SourcesResponse } from "../types";
import { ErrorAlert } from "./page";

/** Starts a run for the chosen sources, then opens it. Opt-in sources are grouped under Agents. */
export function NewRunDialog() {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const { data } = useApi<SourcesResponse>(open ? "/api/sources" : null);

  const standard = data?.sources.filter((source) => !source.optIn) ?? [];
  const agents = data?.sources.filter((source) => source.optIn) ?? [];

  const toggle = (name: string, on: boolean) =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  const start = async () => {
    setStarting(true);
    setError(undefined);
    try {
      const { runId } = await request<{ runId: string }>("/api/runs", { method: "POST", body: { sources: [...chosen] } });
      setOpen(false);
      navigate(`/runs/${runId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setStarting(false);
    }
  };

  const group = (title: string, sources: { name: string }[]) =>
    sources.length > 0 && (
      <fieldset className="space-y-2">
        <legend className="text-muted-foreground mb-1 text-xs font-medium uppercase">{title}</legend>
        {sources.map((source) => (
          <div key={source.name} className="flex items-center gap-2">
            <Checkbox
              id={`run-${source.name}`}
              checked={chosen.has(source.name)}
              onCheckedChange={(on) => toggle(source.name, on === true)}
            />
            <Label htmlFor={`run-${source.name}`}>{source.name}</Label>
          </div>
        ))}
      </fieldset>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New run</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New run</DialogTitle>
          <DialogDescription>Starts a sync for the sources you pick. One sync runs at a time.</DialogDescription>
        </DialogHeader>
        {error && <ErrorAlert error={error} title="Could not start the run" />}
        <div className="space-y-4">
          {group("Sources", standard)}
          {group("Agents", agents)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setChosen(new Set(standard.map((source) => source.name)))}>
            Select standard sources
          </Button>
          <Button disabled={chosen.size === 0 || starting} onClick={start}>
            {starting ? "Starting..." : chosen.size === 0 ? "Start" : `Start ${chosen.size} ${chosen.size === 1 ? "source" : "sources"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
