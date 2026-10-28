import { useState } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { EditDialog } from "@/components/edit-dialog";
import { ErrorAlert, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { istLocalToIso } from "../../../utils/time";
import { useApi } from "../api";
import { istTime } from "../lib/format";
import type { ShowItem, ShowsResponse } from "../types";

function StartTimeEditor({ show, saved }: { show: ShowItem; saved: () => void }) {
  const [local, setLocal] = useState("");
  const startsAt = istLocalToIso(local);
  return (
    <EditDialog
      trigger={show.timeKind === "date-only" ? "Set time" : "Change"}
      title="Start time"
      description={`${show.title}. Read as Hyderabad time. Groups that have not locked take the new time with it.`}
      path={`/api/events/${show.id}/start-time`}
      body={() => ({ startsAt })}
      disabled={startsAt === null}
      saved={saved}
    >
      <Label htmlFor={`start-${show.id}`}>Starts (IST)</Label>
      <Input id={`start-${show.id}`} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
    </EditDialog>
  );
}

function CafeEditor({ groupId, saved }: { groupId: string; saved: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const coordinates = lat === "" && lng === "" ? null : { lat: Number(lat), lng: Number(lng) };
  const valid =
    name.trim() !== "" &&
    (coordinates === null || (lat !== "" && lng !== "" && !Number.isNaN(coordinates.lat) && !Number.isNaN(coordinates.lng)));
  return (
    <EditDialog
      trigger="Cafe"
      title="Where the group meets"
      description="Shown on the meet card at T-3h. Coordinates are optional, and both are needed when given."
      path={`/api/groups/${groupId}/cafe`}
      body={() => ({ name, address: address || null, ...coordinates })}
      disabled={!valid}
      saved={saved}
    >
      <Label htmlFor={`cafe-name-${groupId}`}>Name</Label>
      <Input id={`cafe-name-${groupId}`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor={`cafe-address-${groupId}`}>Address</Label>
      <Input id={`cafe-address-${groupId}`} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`cafe-lat-${groupId}`}>Latitude</Label>
          <Input id={`cafe-lat-${groupId}`} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`cafe-lng-${groupId}`}>Longitude</Label>
          <Input id={`cafe-lng-${groupId}`} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
      </div>
    </EditDialog>
  );
}

export function ShowsPage() {
  const { data, error, loading, reload } = useApi<ShowsResponse>("/api/shows");

  const columns: Column<ShowItem>[] = [
    { header: "Show", cell: (s) => <span className="font-medium">{s.title}</span>, className: "max-w-64 truncate" },
    {
      header: "Starts (IST)",
      cell: (s) => (
        <span className="inline-flex items-center gap-2">
          {s.timeKind === "date-only" ? <Badge variant="outline">date only</Badge> : istTime(s.startsAt)}
          {s.hasOverride && <Badge variant="outline">set by you</Badge>}
          <StartTimeEditor show={s} saved={reload} />
        </span>
      ),
      className: "whitespace-nowrap",
    },
    { header: "Locks (IST)", cell: (s) => istTime(s.joinUntil), className: "whitespace-nowrap" },
    { header: "Waiting", cell: (s) => s.waiting, className: "text-right" },
    {
      header: "Plans",
      cell: (s) =>
        Object.entries(s.plans)
          .map(([state, n]) => `${state.replaceAll("_", " ")} ${n}`)
          .join(", ") || "-",
      className: "max-w-64 truncate",
    },
    {
      header: "Groups",
      cell: (s) =>
        s.groups.length === 0 ? (
          <span className="text-muted-foreground">none yet</span>
        ) : (
          <ul className="space-y-1">
            {s.groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span>
                  {g.state}, {g.size} {g.size === 1 ? "person" : "people"}, {g.cafeName ?? "no cafe"}
                </span>
                {g.state !== "done" && <CafeEditor groupId={g.id} saved={reload} />}
              </li>
            ))}
          </ul>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Shows" description="Shows people can plan for, with who is waiting and the groups formed." />
      {error && <ErrorAlert error={error} />}
      <DataTable columns={columns} rows={data?.shows} loading={loading} rowKey={(s) => s.id} empty="No shows are open for plans." />
    </>
  );
}
