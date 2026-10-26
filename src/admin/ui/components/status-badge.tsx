import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300 animate-pulse",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  unhealthy: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  abandoned: "bg-muted text-muted-foreground",
};

/** Run and per-source statuses share one colour per meaning. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", STYLES[status])}>
      {status}
    </Badge>
  );
}
