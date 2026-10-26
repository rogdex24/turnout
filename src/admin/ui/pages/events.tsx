import { useEffect, useState } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApi } from "../api";
import { istTime, price } from "../lib/format";
import { navigate, useLocation } from "../router";
import type { EventDetail, EventRow, EventsResponse, SourcesResponse } from "../types";

const PAGE_SIZE = 50;
const ALL = "all";

/** The URL query is the filter state, so a view can be shared. Empty values drop out of it. */
function withParams(current: URLSearchParams, changes: Record<string, string | undefined>, keepPage = false): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (!keepPage) next.delete("page");
  const query = next.toString();
  return `/events${query ? `?${query}` : ""}`;
}

const ListedBadge = ({ listed }: { listed: boolean }) =>
  listed ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Listed</Badge>
  ) : (
    <Badge variant="outline">Hidden</Badge>
  );

export function EventsPage() {
  const { search } = useLocation();
  const apiQuery = new URLSearchParams(search);
  apiQuery.delete("event");
  apiQuery.set("pageSize", String(PAGE_SIZE));
  const { data, error, loading } = useApi<EventsResponse>(`/api/events?${apiQuery}`);
  const { data: sources } = useApi<SourcesResponse>("/api/sources");

  const set = (changes: Record<string, string | undefined>) => navigate(withParams(search, changes), { replace: true });

  const columns: Column<EventRow>[] = [
    { header: "Title", cell: (event) => <span className="font-medium">{event.title}</span>, className: "max-w-72 truncate" },
    { header: "Start (IST)", cell: (event) => istTime(event.startsAt), className: "whitespace-nowrap" },
    {
      header: "Venue",
      cell: (event) => event.venueName ?? <span className="text-muted-foreground">none</span>,
      className: "max-w-48 truncate",
    },
    { header: "Area", cell: (event) => event.area },
    { header: "Category", cell: (event) => event.category },
    { header: "Source", cell: (event) => event.source },
    { header: "Price", cell: (event) => price(event) },
    { header: "", cell: (event) => <ListedBadge listed={event.listed} /> },
  ];

  const page = data?.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selected = search.get("event");

  return (
    <>
      <PageHeader title="Events" description="Every event in the database, with the reason it is or is not public." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SearchBox value={search.get("q") ?? ""} onCommit={(q) => set({ q })} />
        <Filter
          label="Source"
          value={search.get("source")}
          onChange={(source) => set({ source })}
          options={sources?.sources.map((s) => s.name) ?? []}
        />
        <Filter label="Status" value={search.get("status")} onChange={(status) => set({ status })} options={["active", "delisted"]} />
        <Filter
          label="Visibility"
          value={search.get("visibility")}
          onChange={(visibility) => set({ visibility })}
          options={["listed", "hidden"]}
        />
        <TextFilter label="Category" value={search.get("category") ?? ""} onCommit={(category) => set({ category })} />
        <TextFilter label="Area" value={search.get("area") ?? ""} onCommit={(area) => set({ area })} />
        <label className="grid gap-1 text-xs">
          From
          <Input type="date" className="w-36" value={search.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs">
          To
          <Input type="date" className="w-36" value={search.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} />
        </label>
        {search.toString() && (
          <Button variant="ghost" onClick={() => navigate("/events", { replace: true })}>
            Clear
          </Button>
        )}
      </div>

      {error && <ErrorAlert error={error} />}
      <DataTable
        columns={columns}
        rows={data?.events}
        loading={loading}
        rowKey={(event) => event.id}
        onRowClick={(event) => navigate(withParams(search, { event: event.id }, true))}
        empty={
          search.toString()
            ? "No events match these filters. Clear them to see everything."
            : "No events yet. Run a sync from Runs and they will appear here."
        }
      />
      {data && data.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data.total} events, page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => navigate(withParams(search, { page: String(page - 1) }, true))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => navigate(withParams(search, { page: String(page + 1) }, true))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <EventSheet
        id={selected}
        onClose={() => navigate(withParams(search, { event: undefined }, true))}
        onOpen={(id) => navigate(withParams(search, { event: id }, true))}
      />
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | undefined) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/** A text box that writes to the URL on Enter or blur, so typing does not refetch on every key. */
function TextFilter({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft.trim());
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <Input
        className="w-32"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

const SearchBox = ({ value, onCommit }: { value: string; onCommit: (value: string) => void }) => (
  <div className="grid gap-1 text-xs">
    <TextFilter label="Title or venue" value={value} onCommit={onCommit} />
  </div>
);

function EventSheet({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, error } = useApi<EventDetail>(id ? `/api/events/${encodeURIComponent(id)}` : null);
  const event = data?.event as Record<string, unknown> | undefined;
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{event ? String(event.title) : "Event"}</SheetTitle>
          <SheetDescription>
            {event ? `${istTime(String(event.starts_at))} at ${event.venue_name ?? "no venue"}` : "Loading..."}
          </SheetDescription>
        </SheetHeader>
        {error && <ErrorAlert error={error} />}
        {data && event && (
          <div className="space-y-5 px-4 pb-6 text-sm">
            <section>
              <h3 className="mb-1 font-semibold">Visibility</h3>
              {data.listed ? (
                <ListedBadge listed />
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {data.hiddenReasons.map((reason) => (
                    <li key={reason}>
                      {reason.startsWith("duplicate of ") ? (
                        <>
                          duplicate of{" "}
                          <button
                            type="button"
                            className="underline underline-offset-4"
                            onClick={() => onOpen(reason.slice("duplicate of ".length))}
                          >
                            {reason.slice("duplicate of ".length)}
                          </button>
                        </>
                      ) : (
                        reason
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Dedupe group</h3>
              {data.dedupeGroup.length === 0 ? (
                <p className="text-muted-foreground">No other event in this group.</p>
              ) : (
                <ul className="space-y-1">
                  {data.dedupeGroup.map((member) => (
                    <li key={member.id}>
                      <button type="button" className="text-left underline underline-offset-4" onClick={() => onOpen(member.id)}>
                        {member.title}
                      </button>
                      <span className="text-muted-foreground">
                        {" "}
                        {member.source}
                        {member.isCanonical === 1 ? ", canonical" : ""}
                        {member.status !== "active" ? `, ${member.status}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Source</h3>
              <a className="break-all underline underline-offset-4" href={String(event.source_url)} target="_blank" rel="noreferrer">
                {String(event.source_url)}
              </a>
              <p className="text-muted-foreground">
                {String(event.source)} / {String(event.source_event_id)}
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Raw payload{data.rawPayload ? ` (fetched ${istTime(data.rawPayload.fetchedAt)})` : ""}</h3>
              {data.rawPayload ? (
                <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs">
                  {typeof data.rawPayload.body === "string" ? data.rawPayload.body : JSON.stringify(data.rawPayload.body, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No raw payload is stored for this event.</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
