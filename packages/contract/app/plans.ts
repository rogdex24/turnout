import { z } from "zod";
import { ticketRejectReasonSchema, ticketStateSchema } from "../ticket.js";
import { matchableItemSchema } from "./me.js";

export const PLAN_STATES = [
  "needs_ticket",
  "checking_ticket",
  "ticket_rejected",
  "finding_group",
  "group_confirmed",
  "meet_card_live",
  "no_group",
  "withdrawn",
  "done",
] as const;
export const planStateSchema = z.enum(PLAN_STATES);
export type PlanState = z.infer<typeof planStateSchema>;

/** A plan in one of these never moves again. */
export const TERMINAL_PLAN_STATES = ["no_group", "withdrawn", "done"] as const;

/** Why a plan is `no_group`. */
export const NO_GROUP_REASONS = [
  "no_ticket",
  "late_review",
  "ticket_rejected",
  "no_match",
  "handle_pending",
  "handle_rejected",
  "group_called_off",
] as const;
/** Why a plan is `withdrawn`. */
export const WITHDRAWN_REASONS = ["cancelled", "suspended", "banned", "stopped", "deleted", "delisted"] as const;
export const PLAN_REASONS = [...NO_GROUP_REASONS, ...WITHDRAWN_REASONS] as const;
export const planReasonSchema = z.enum(PLAN_REASONS);
export type PlanReason = z.infer<typeof planReasonSchema>;

export const GROUP_TYPES = ["open", "women_only"] as const;
export const groupTypeSchema = z.enum(GROUP_TYPES);
export type GroupType = z.infer<typeof groupTypeSchema>;

/** POST /plans. `eventId` is the show's public id. */
export const createPlanRequestSchema = z.object({ eventId: z.string().min(1).max(120), groupType: groupTypeSchema }).strict();
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

/** POST /plans/:planId/withdraw takes no body: a body with any field is refused. */
export const withdrawRequestSchema = z.object({}).strict();

/** What a plan carries of its show: a snapshot taken when the plan was made, so a later change at the source cannot move the plan. */
export const showSnapshotSchema = z.object({
  title: z.string(),
  startsAt: z.string(),
  venueName: z.string(),
});
export type ShowSnapshot = z.infer<typeof showSnapshotSchema>;

/** The group as a plan sees it. Never a co-member before T-3h: only the state, the size and when the reveal comes. */
export const planGroupSchema = z.object({
  id: z.string(),
  state: z.enum(["confirmed", "locked", "live", "done"]),
  size: z.number().int(),
  revealAt: z.string(),
});
export type PlanGroup = z.infer<typeof planGroupSchema>;

export const planSchema = z.object({
  id: z.string(),
  /** The show's public id. */
  eventId: z.string(),
  state: planStateSchema,
  reason: planReasonSchema.nullable(),
  groupType: z.enum(GROUP_TYPES),
  show: showSnapshotSchema,
  /** The newest ticket file's state. Null until one is sent. */
  ticket: z.object({ state: ticketStateSchema, rejectReason: ticketRejectReasonSchema.nullable() }).nullable(),
  /** The last moment a ticket can be sent or changed, and the moment the group is locked: T-24h. */
  joinUntil: z.string(),
  group: planGroupSchema.nullable(),
  createdAt: z.string(),
});
export type Plan = z.infer<typeof planSchema>;

export const planListResponseSchema = z.object({ plans: z.array(planSchema) });
export type PlanListResponse = z.infer<typeof planListResponseSchema>;

/** PUT /plans/:planId/ticket and POST /plans/:planId/withdraw answer with the plan. */
export const planResponseSchema = planSchema;

/** GET /shows/:publicId: the public show as the app needs it, with the caller's own plan. */
export const showResponseSchema = z.object({
  publicId: z.string(),
  title: z.string(),
  startsAt: z.string(),
  joinUntil: z.string(),
  venueName: z.string(),
  area: z.string().nullable(),
  category: z.string(),
  priceMin: z.number().nullable(),
  /** How many people are waiting for a group for this show. */
  lookingCount: z.number().int(),
  /** `screenshot` for BookMyShow, else `screenshot_or_pdf`. */
  proofKind: z.enum(["screenshot", "screenshot_or_pdf"]),
  plan: planSchema.nullable(),
});
export type ShowResponse = z.infer<typeof showResponseSchema>;

/** The 409 body for a member who cannot be matched yet lists what is missing. */
export const notMatchableItemsSchema = z.array(matchableItemSchema);
