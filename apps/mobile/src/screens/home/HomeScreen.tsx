import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { areasQuery, showsListQuery } from "@/api/shows";
import { isApiError } from "@/model/apiError";
import { dayGroups, listItems, mergePages } from "@/model/showList";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useMe } from "@/providers/hooks";
import { useNow } from "@/providers/useNow";
import type { ProfileCheckStripProps } from "@/ui/ProfileCheckStrip";
import { type HomeList, HomeView } from "./HomeView";

const CLOCK_EVERY_MS = 60_000;

export interface HomeScreenProps {
  onOpenShow: (publicId: string) => void;
  /** Opens the profile form so a handle that was turned down can be changed. */
  onChangeHandle: () => void;
}

/**
 * The Shows tab on live data: the group-eligible shows by day, the area pills from the catalogue, and the handle check strip from
 * `me`. The active plan bar has nothing to show yet: the plans list arrives with the plans in M3, so it is not drawn until then.
 */
export function HomeScreen({ onOpenShow, onChangeHandle }: HomeScreenProps) {
  const api = useApi();
  const { connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const now = useNow(CLOCK_EVERY_MS);
  const [area, setArea] = useState<string | null>(null);
  const me = useMe().data;
  const areas = useQuery(areasQuery(api));
  const shows = useInfiniteQuery(showsListQuery(api, area));

  const stalledOffline = shows.isPending && shows.fetchStatus === "paused" && shows.failureCount > 0;
  let list: HomeList;
  if (shows.data) {
    list = { status: "ready", items: listItems(dayGroups(mergePages(shows.data.pages), now)) };
  } else if (shows.isError || stalledOffline) {
    list = { status: "error", kind: stalledOffline ? "offline" : errorKind(shows.error) };
  } else {
    list = { status: "loading" };
  }

  let strip: ProfileCheckStripProps | null = null;
  if (me?.handle.state === "pending") strip = { state: "pending" };
  if (me?.handle.state === "rejected") strip = { state: "rejected", reason: me.handle.rejectReason, onChange: onChangeHandle };

  return (
    <HomeView
      list={list}
      areas={(areas.data?.areas ?? []).filter((entry) => entry.event_count > 0)}
      selectedArea={area}
      onSelectArea={setArea}
      strip={strip}
      plan={null}
      offline={offline}
      refreshing={shows.isRefetching && !shows.isFetchingNextPage}
      onRefresh={() => void shows.refetch()}
      onEndReached={() => {
        if (shows.hasNextPage && !shows.isFetchingNextPage && !shows.isFetchNextPageError) void shows.fetchNextPage();
      }}
      more={shows.isFetchingNextPage ? "loading" : shows.isFetchNextPageError ? "failed" : "idle"}
      onRetryMore={() => void shows.fetchNextPage()}
      onRetry={() => void shows.refetch()}
      onOpenShow={onOpenShow}
    />
  );
}

function errorKind(error: unknown): "offline" | "server" | "rate_limited" | "other" {
  if (!isApiError(error)) return "other";
  if (error.kind === "offline" || error.kind === "server" || error.kind === "rate_limited") return error.kind;
  return "other";
}
