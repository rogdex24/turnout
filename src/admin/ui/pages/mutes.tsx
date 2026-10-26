import { useState } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { request, useApi } from "../api";
import { istTime } from "../lib/format";
import type { Mute, MutesResponse } from "../types";

const FIELDS = ["category", "source", "venue", "area", "title"];

export function MutesPage() {
  const { data, error, loading, reload } = useApi<MutesResponse>("/api/mutes");
  const [field, setField] = useState("category");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string>();
  const [failure, setFailure] = useState<string>();

  const act = async (work: () => Promise<unknown>) => {
    setFailure(undefined);
    try {
      await work();
      reload();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const add = () =>
    act(async () => {
      await request("/api/mutes", { method: "POST", body: { field, value, note: note || undefined } });
      setValue("");
      setNote("");
    });

  const columns: Column<Mute>[] = [
    { header: "Field", cell: (mute) => mute.field },
    { header: "Value", cell: (mute) => <span className="font-medium">{mute.value}</span> },
    { header: "Hides", cell: (mute) => `${mute.hides} active`, className: "text-right" },
    { header: "Note", cell: (mute) => mute.note ?? "-", className: "max-w-64 truncate" },
    { header: "Added (IST)", cell: (mute) => istTime(mute.createdAt), className: "whitespace-nowrap" },
    {
      header: "",
      className: "text-right whitespace-nowrap",
      cell: (mute) =>
        confirming === mute.id ? (
          <span className="inline-flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                act(async () => {
                  await request(`/api/mutes/${mute.id}`, { method: "DELETE" });
                  setConfirming(undefined);
                })
              }
            >
              Confirm delete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(undefined)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(mute.id)}>
            Delete
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Mutes"
        description="Rules that hide events from everything the public sees. Sync still ingests them, and deleting a rule brings them back."
      />
      {(error || failure) && <ErrorAlert error={failure ?? error!} />}
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="grid gap-1 text-xs">
          Field
          <Select value={field} onValueChange={setField}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELDS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs">
          Value
          <Input className="w-48" value={value} onChange={(e) => setValue(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-xs">
          Note
          <Input className="w-64" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button type="submit" disabled={!value.trim()}>
          Add rule
        </Button>
      </form>
      <DataTable
        columns={columns}
        rows={data?.mutes}
        loading={loading}
        rowKey={(mute) => mute.id}
        empty="No mute rules. Everything ingested is public. Add a rule above to hide a category, source, venue, area or title."
      />
    </>
  );
}
