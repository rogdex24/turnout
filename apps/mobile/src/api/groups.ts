import type { QueryClient } from "@tanstack/react-query";
import {
  type CheckinResponse,
  checkinResponseSchema,
  type GroupResponse,
  type GroupRevealed,
  groupResponseSchema,
} from "@turnout/contract/app/groups";
import { type Plan, type PlanListResponse, planListResponseSchema } from "@turnout/contract/app/plans";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";
import { mutationKey, type Replayable, registerReplayable } from "./mutations";

export function fetchPlans(api: ApiClient): Promise<PlanListResponse> {
  return api.request({ path: "/plans", schema: planListResponseSchema });
}

/** The person's plans. The meet card reads it to find the show its group is for, and the push setup reads it to know the person has a plan. */
export const plansListQuery = (api: ApiClient) => ({ queryKey: queryKeys.plansList(), queryFn: () => fetchPlans(api) });

/** The plan that holds this group, or null when the list does not have it (not loaded yet, or the plan is gone). */
export function planOfGroup(plans: readonly Plan[], groupId: string): Plan | null {
  return plans.find((plan) => plan.group?.id === groupId) ?? null;
}

export function fetchGroup(api: ApiClient, groupId: string): Promise<GroupResponse> {
  return api.request({ path: `/groups/${encodeURIComponent(groupId)}`, schema: groupResponseSchema });
}

/** One group. Fresh for 30 s, and kept on disk so the card opens with the last cafe and members when the phone has no signal. */
export const groupQuery = (api: ApiClient, groupId: string) => ({
  queryKey: queryKeys.group(groupId),
  queryFn: () => fetchGroup(api, groupId),
});

/** From T-3h the answer carries the cafe and the members; before that it carries neither. */
export function isRevealed(group: GroupResponse): group is GroupRevealed {
  return "cafe" in group && "members" in group;
}

export interface CheckinVariables {
  groupId: string;
}

/** POST /groups/:groupId/checkin: no body and no coordinates. Sending it twice has the same effect as once. */
export function sendCheckin(api: ApiClient) {
  return ({ payload }: Replayable<CheckinVariables>): Promise<CheckinResponse> =>
    api.request({
      method: "POST",
      path: `/groups/${encodeURIComponent(payload.groupId)}/checkin`,
      body: {},
      schema: checkinResponseSchema,
    });
}

/** Lets a check-in made without a network be sent after a restart, once the phone is back online. */
export function registerCheckin(queryClient: QueryClient, api: ApiClient): void {
  registerReplayable<CheckinVariables>(queryClient, "checkin", sendCheckin(api));
}

export const checkinMutationKey = mutationKey("checkin");

/** The group in the cache with this member marked as checked in, so the card shows it before the next fetch. */
export function markCheckedIn(group: GroupResponse): GroupResponse {
  if (!isRevealed(group)) return group;
  return { ...group, members: group.members.map((member) => (member.isYou ? { ...member, checkedIn: true } : member)) };
}
