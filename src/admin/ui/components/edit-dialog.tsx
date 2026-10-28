import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { request } from "../api";
import { ErrorAlert } from "./page";

/** A button that opens a small form and saves it with a PUT. The server's message (a 409 included) shows in the dialog, and the dialog stays open. */
export function EditDialog({
  trigger,
  title,
  description,
  path,
  body,
  disabled,
  saved,
  children,
}: {
  trigger: string;
  title: string;
  description: string;
  path: string;
  /** What to send, or null while the form is not valid. */
  body: () => unknown;
  disabled?: boolean;
  saved: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await request(path, { method: "PUT", body: body() });
      setOpen(false);
      saved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <ErrorAlert error={error} title="Not saved" />}
        <div className="space-y-3">{children}</div>
        <DialogFooter>
          <Button disabled={disabled || saving} onClick={save}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
