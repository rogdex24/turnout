import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiError } from "../api";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ErrorAlert({ error, title = "Something went wrong" }: { error: ApiError | string; title?: string }) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{typeof error === "string" ? error : error.message}</AlertDescription>
    </Alert>
  );
}
