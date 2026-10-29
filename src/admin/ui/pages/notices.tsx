import { type Column, DataTable } from "@/components/data-table";
import { ErrorAlert, PageHeader } from "@/components/page";
import { useApi } from "../api";
import { istTime } from "../lib/format";
import { Link } from "../router";
import type { NoticesResponse } from "../types";

const POLL_MS = 60_000;

type Row = NoticesResponse["notices"][number];

const STATES: Record<string, string> = {
  stale: "Went stale before it was sent",
  no_device: "No device",
  not_sent: "Devices on a platform that is not sending",
  sent: "Sent, but a delivery was refused",
};

export function NoticesPage() {
  const { data, error, loading } = useApi<NoticesResponse>("/api/notices?status=failed", () => POLL_MS);
  const columns: Column<Row>[] = [
    { header: "Created (IST)", cell: (n) => istTime(n.createdAt), className: "whitespace-nowrap" },
    { header: "Kind", cell: (n) => n.kind },
    { header: "What happened", cell: (n) => STATES[n.pushState] ?? n.pushState },
    { header: "Refused", cell: (n) => (n.failedDeliveries > 0 ? `${n.failedDeliveries}: ${n.errorCodes.join(", ") || "no code"}` : "-") },
    {
      header: "Member",
      cell: (n) => (
        <Link to={`/accounts/${n.memberId}`} className="underline-offset-4 hover:underline">
          {n.memberId}
        </Link>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Failed notices" description="Notices that did not reach a phone. The member still sees each one in the app." />
      {error && <ErrorAlert error={error} />}
      <DataTable columns={columns} rows={data?.notices} loading={loading} rowKey={(n) => n.noticeId} empty="No notice has failed." />
    </>
  );
}
