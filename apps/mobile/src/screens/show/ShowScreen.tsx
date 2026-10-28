import { useQuery } from "@tanstack/react-query";
import { Linking } from "react-native";
import { groupsEnabled } from "@/api/features";
import { showDetailQuery } from "@/api/shows";
import { isApiError } from "@/model/apiError";
import { safeWebUrl } from "@/model/externalLink";
import { useApi } from "@/providers/hooks";
import { type ShowDetailState, ShowView } from "./ShowView";

export interface ShowScreenProps {
  publicId: string;
  onBack: () => void;
  onSeeShows: () => void;
  /** Starts a group for the show. Only reachable when groups are enabled for this build. */
  onGo: (publicId: string) => void;
}

/** Hands a web address to the browser. A link that is not http or https never leaves the app. */
function openInBrowser(url: string) {
  const safe = safeWebUrl(url);
  if (safe) void Linking.openURL(safe).catch(() => undefined);
}

/**
 * One show on live data. The count of people looking for a group comes from the plans server (M3) and is not there yet, so it is
 * null and the line is left out. "Go with a group" opens "Coming soon in this build" until `EXPO_PUBLIC_GROUPS_ENABLED` is set.
 */
export function ShowScreen({ publicId, onBack, onSeeShows, onGo }: ShowScreenProps) {
  const api = useApi();
  const query = useQuery(showDetailQuery(api, publicId));

  let detail: ShowDetailState;
  if (query.data) detail = { status: "ready", show: query.data };
  else if (query.isError)
    detail =
      isApiError(query.error) && query.error.kind === "not_found"
        ? { status: "not_found" }
        : { status: "error", kind: errorKind(query.error) };
  else if (query.isPending && query.fetchStatus === "paused" && query.failureCount > 0) detail = { status: "error", kind: "offline" };
  else detail = { status: "loading" };

  return (
    <ShowView
      detail={detail}
      lookingCount={null}
      groupsEnabled={groupsEnabled()}
      onBack={onBack}
      onRetry={() => void query.refetch()}
      onSeeShows={onSeeShows}
      onOpenLink={openInBrowser}
      onGo={onGo}
    />
  );
}

function errorKind(error: unknown): "offline" | "server" | "rate_limited" | "other" {
  if (!isApiError(error)) return "other";
  if (error.kind === "offline" || error.kind === "server" || error.kind === "rate_limited") return error.kind;
  return "other";
}
