import { useState } from "react";
import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { ReviewActions } from "@/components/review-actions";
import { useApi } from "../api";
import { istTime } from "../lib/format";
import { HANDLE_REASONS } from "../lib/reasons";
import type { HandleItem, HandlesResponse } from "../types";

const POLL_MS = 30_000;

export function HandlesPage() {
  const { data, error, loading, reload } = useApi<HandlesResponse>("/api/handles?status=pending", () => POLL_MS);
  const [failure, setFailure] = useState<string>();

  const columns: Column<HandleItem>[] = [
    {
      header: "Photo",
      cell: (h) =>
        h.photoUrl ? (
          <img src={h.photoUrl} alt="" className="size-12 rounded-md object-cover" />
        ) : (
          <span className="text-muted-foreground">none</span>
        ),
    },
    { header: "First name", cell: (h) => <span className="font-medium">{h.firstName ?? "-"}</span> },
    {
      header: "Profile",
      cell: (h) =>
        h.profileUrl ? (
          <a href={h.profileUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            {h.kind}: {h.handle}
          </a>
        ) : (
          `${h.kind}: ${h.handle}`
        ),
      className: "max-w-56 truncate",
    },
    { header: "Submitted (IST)", cell: (h) => istTime(h.submittedAt), className: "whitespace-nowrap" },
    {
      header: "Locks (IST)",
      cell: (h) => (h.lockAt ? istTime(h.lockAt) : <span className="text-muted-foreground">no open plan</span>),
      className: "whitespace-nowrap",
    },
    {
      header: "",
      cell: (h) => (
        <ReviewActions
          path={`/api/handles/${h.memberId}`}
          reasons={HANDLE_REASONS}
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
        title="Handles"
        description="Profiles waiting for a check, the one whose show locks first at the top. Open the profile in a new tab."
      />
      {error && <ErrorAlert error={error} />}
      {failure && <ErrorAlert error={failure} title="Could not answer the handle" />}
      <DataTable columns={columns} rows={data?.handles} loading={loading} rowKey={(h) => h.memberId} empty="No handles are waiting." />
    </>
  );
}
