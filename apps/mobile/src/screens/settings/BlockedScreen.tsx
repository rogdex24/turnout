import { useQuery } from "@tanstack/react-query";
import { blockedQuery } from "@/api/blocked";
import { settings } from "@/copy/settings";
import { isApiError } from "@/model/apiError";
import { formatShowDay } from "@/model/showTime";
import { useApi } from "@/providers/hooks";
import { BlockedView, type BlockedViewProps } from "./BlockedView";

/** The people this member downvoted or reported, from `GET /me/blocked`. Read only; the answer is not kept on disk. */
export function BlockedScreen({ onBack }: { onBack: () => void }) {
  const api = useApi();
  const query = useQuery(blockedQuery(api));

  let state: BlockedViewProps["state"] = { kind: "loading" };
  if (query.data) {
    state = {
      kind: "ready",
      people: query.data.blocked.map((person) => ({
        firstName: person.firstName,
        context: settings.blocked.row(person.showTitle, formatShowDay(person.date)),
      })),
    };
  } else if (query.isError) {
    state = { kind: "failed", offline: isApiError(query.error) && query.error.kind === "offline", onRetry: () => void query.refetch() };
  }
  return <BlockedView state={state} onBack={onBack} />;
}
