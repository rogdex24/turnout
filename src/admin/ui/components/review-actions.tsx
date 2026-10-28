import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { request } from "../api";

/**
 * Approve or reject one row. Each answer asks for a second click, since a member sees the result at once, and the row reloads the list
 * when the server has answered. A 409 from the server shows as the message and leaves the row in place.
 */
export function ReviewActions({
  path,
  reasons,
  done,
  onError,
}: {
  /** The row's route, without the verb: `/api/tickets/<id>`. */
  path: string;
  reasons: Record<string, string>;
  done: () => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState<string>();
  const [confirming, setConfirming] = useState<"approve" | "reject">();
  const [busy, setBusy] = useState(false);

  const send = async (verb: "approve" | "reject") => {
    setBusy(true);
    try {
      await request(`${path}/${verb}`, { method: "POST", body: verb === "reject" ? { reason } : undefined });
      done();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setConfirming(undefined);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select value={reason} onValueChange={setReason}>
        <SelectTrigger size="sm" aria-label="Reject reason" className="w-44">
          <SelectValue placeholder="Reject reason" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(reasons).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant={confirming === "reject" ? "destructive" : "outline"}
        disabled={busy || reason === undefined}
        onClick={() => (confirming === "reject" ? send("reject") : setConfirming("reject"))}
      >
        {confirming === "reject" ? "Confirm reject" : "Reject"}
      </Button>
      <Button size="sm" disabled={busy} onClick={() => (confirming === "approve" ? send("approve") : setConfirming("approve"))}>
        {confirming === "approve" ? "Confirm approve" : "Approve"}
      </Button>
    </div>
  );
}
