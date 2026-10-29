import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Linking } from "react-native";
import { telemetry } from "@/analytics";
import { groupsEnabled } from "@/api/features";
import { memberShowQuery } from "@/api/plans";
import { showDetailQuery } from "@/api/shows";
import { errorKind, isApiError } from "@/model/apiError";
import { safeWebUrl } from "@/model/externalLink";
import { useDeps } from "@/providers/AppProviders";
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
 * One show on live data. The count of people looking for a group comes from the plans server (GET /shows/:publicId) and is asked for
 * only when groups are on in this build; until it answers, or if it fails, it is null and the line is left out. "Go with a group"
 * opens "Coming soon in this build" until `EXPO_PUBLIC_GROUPS_ENABLED` is set, then the go sheet.
 */
export function ShowScreen({ publicId, onBack, onSeeShows, onGo }: ShowScreenProps) {
  const api = useApi();
  const query = useQuery(showDetailQuery(api, publicId));
  const groups = groupsEnabled();
  const member = useQuery({ ...memberShowQuery(api, publicId), enabled: groups });
  const { prefs } = useDeps();
  const shown = query.data !== undefined;

  // The top of the funnel: counted once per show page, when the show is on screen.
  useEffect(() => {
    if (shown) telemetry(prefs).track("show_viewed", { show_id: publicId });
  }, [shown, prefs, publicId]);

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
      lookingCount={member.data?.lookingCount ?? null}
      groupsEnabled={groups}
      onBack={onBack}
      onRetry={() => void query.refetch()}
      onSeeShows={onSeeShows}
      onOpenLink={openInBrowser}
      onBuy={(url) => {
        telemetry(prefs).track("buy_tapped", { show_id: publicId });
        openInBrowser(url);
      }}
      onGo={onGo}
      onGoTapped={() => telemetry(prefs).track("go_tapped", { show_id: publicId, groups_enabled: groups })}
    />
  );
}
