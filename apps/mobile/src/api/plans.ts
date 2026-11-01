import type { QueryClient } from "@tanstack/react-query";
import {
  type CreatePlanRequest,
  type Plan,
  type PlanListResponse,
  planListResponseSchema,
  planResponseSchema,
  type ShowResponse,
  showResponseSchema,
} from "@turnout/contract/app/plans";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

/** GET /plans: every plan the person has, newest show first as the server orders them. */
export function fetchPlans(api: ApiClient): Promise<PlanListResponse> {
  return api.request({ path: "/plans", schema: planListResponseSchema });
}

export const plansListQuery = (api: ApiClient) => ({ queryKey: queryKeys.plansList(), queryFn: () => fetchPlans(api) });

export function fetchPlan(api: ApiClient, planId: string): Promise<Plan> {
  return api.request({ path: `/plans/${encodeURIComponent(planId)}`, schema: planResponseSchema });
}

/**
 * One plan. Until its own answer is in, the copy in the plan list stands in for it: the list is kept on the phone, so a plan seen in
 * the list opens offline even if its page was never opened. Each answer also replaces that plan in the cached list, so going back
 * to the Plans tab never shows an older state than the page did.
 */
export const planDetailQuery = (api: ApiClient, planId: string, queryClient?: QueryClient) => ({
  queryKey: queryKeys.planDetail(planId),
  queryFn: async () => {
    const plan = await fetchPlan(api, planId);
    queryClient?.setQueryData<PlanListResponse>(queryKeys.plansList(), (list) =>
      list ? { ...list, plans: list.plans.map((p) => (p.id === plan.id ? plan : p)) } : list,
    );
    return plan;
  },
  placeholderData: () => queryClient?.getQueryData<PlanListResponse>(queryKeys.plansList())?.plans.find((p) => p.id === planId),
});

/** POST /plans. A 409 `plan_exists` carries the plan already made for this show; the caller carries on with it. */
export function createPlan(api: ApiClient, body: CreatePlanRequest): Promise<Plan> {
  return api.request({ method: "POST", path: "/plans", body, schema: planResponseSchema });
}

/** POST /plans/:id/withdraw takes an empty body. A 409 `plan_closed` means the plan already ended. */
export function withdrawPlan(api: ApiClient, planId: string): Promise<Plan> {
  return api.request({ method: "POST", path: `/plans/${encodeURIComponent(planId)}/withdraw`, body: {}, schema: planResponseSchema });
}

/** The ticket file goes up as the raw body. The server reads the bytes to know the type, and sending the same file again gives the plan back. */
export function putTicket(api: ApiClient, planId: string, file: Blob, onProgress?: (sent: number, total: number) => void): Promise<Plan> {
  return api.request({
    method: "PUT",
    path: `/plans/${encodeURIComponent(planId)}/ticket`,
    body: file,
    schema: planResponseSchema,
    onProgress,
  });
}

/** GET /shows/:publicId: what the app needs of a show beyond the public listing, with the caller's own plan. */
export function fetchMemberShow(api: ApiClient, publicId: string): Promise<ShowResponse> {
  return api.request({ path: `/shows/${encodeURIComponent(publicId)}`, schema: showResponseSchema });
}

export const memberShowQuery = (api: ApiClient, publicId: string) => ({
  queryKey: queryKeys.showMember(publicId),
  queryFn: () => fetchMemberShow(api, publicId),
});
