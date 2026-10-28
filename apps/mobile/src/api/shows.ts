import { infiniteQueryOptions } from "@tanstack/react-query";
import { type ApiEventDetail, type EventListResponse, eventDetailSchema, eventListResponseSchema } from "@turnout/contract/events";
import { z } from "zod";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

/** GET /tools/list_areas. The catalogue's own answer, not part of the app API, so its schema lives here and not in the contract. */
export const areaListSchema = z.object({
  areas: z.array(z.object({ slug: z.string(), label: z.string(), event_count: z.number().int().nonnegative() })),
});
export type AreaList = z.infer<typeof areaListSchema>;
export type Area = AreaList["areas"][number];

export function fetchAreas(api: ApiClient): Promise<AreaList> {
  return api.request({ root: "origin", path: "/tools/list_areas", schema: areaListSchema, auth: false });
}

/** The areas that have shows, for the pills on Home. Barely changes, so it is kept a day and on disk. */
export const areasQuery = (api: ApiClient) => ({ queryKey: queryKeys.areas(), queryFn: () => fetchAreas(api) });

/** One page of shows a group can be made for, in the order the server gives them. `area` null is every area. */
export function fetchShowsPage(api: ApiClient, area: string | null, cursor: string | null): Promise<EventListResponse> {
  return api.request({
    root: "origin",
    path: "/api/events",
    query: { group_eligible: 1, area: area ?? undefined, cursor: cursor ?? undefined },
    schema: eventListResponseSchema,
    auth: false,
  });
}

export const showsListQuery = (api: ApiClient, area: string | null) =>
  infiniteQueryOptions({
    queryKey: queryKeys.showsList(area),
    queryFn: ({ pageParam }) => fetchShowsPage(api, area, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

export function fetchShow(api: ApiClient, publicId: string): Promise<ApiEventDetail> {
  return api.request({ root: "origin", path: `/api/events/${encodeURIComponent(publicId)}`, schema: eventDetailSchema, auth: false });
}

/** One show. The server answers 404 for a show that is gone, which the screen reads as "not found". */
export const showDetailQuery = (api: ApiClient, publicId: string) => ({
  queryKey: queryKeys.showDetail(publicId),
  queryFn: () => fetchShow(api, publicId),
});
