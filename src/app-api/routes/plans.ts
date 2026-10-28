import { createHash } from "node:crypto";
import { createPlanRequestSchema, type PlanListResponse, withdrawRequestSchema } from "@turnout/contract/app/plans";
import { checkTicketFile, MAX_TICKET_BYTES, PDF_MIME_TYPE, proofKindForSource } from "@turnout/contract/ticket";
import { withdrawPlan } from "../../social/groups.js";
import { createPlan, getPlan, getPlanForMember, listPlans } from "../../social/plans.js";
import { addTicket, latestTicket } from "../../social/tickets.js";
import { ulid } from "../../utils/ulid.js";
import { authed } from "../auth.js";
import type { Route } from "../context.js";
import { AppError, invalidRequest, notFound } from "../errors.js";
import { json, ok, parseBody, parseEmptyBody, readBytes } from "../http.js";
import { planView } from "../presenters.js";
import { enforce } from "../rateLimit.js";
import { checkPdf, sniffTicketFile, type TicketFileKind } from "../ticketFile.js";
import { reencodeTicketImage } from "../upload.js";

const MIME: Record<TicketFileKind, string> = { jpeg: "image/jpeg", png: "image/png", heic: "image/heic", pdf: PDF_MIME_TYPE };

export const planRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/plans",
    auth: "member",
    handler: ({ app, member }) => {
      const plans = listPlans(app.db, authed(member).member.id).map((plan) => planView(app, plan));
      return ok({ plans } satisfies PlanListResponse);
    },
  },
  {
    method: "POST",
    pattern: "/plans",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row } = authed(member);
      const input = await parseBody(request, createPlanRequestSchema);
      enforce(app.db, app.config.otpPepper, "plan:create", row.id, app.config.tunables.rate.planCreatePerDay, now);
      const made = createPlan(app.db, { memberId: row.id, eventId: input.eventId, groupType: input.groupType, now }, app.config.tunables);
      if (made.ok) return json(201, planView(app, made.plan));
      switch (made.error) {
        case "show_not_found":
          throw notFound();
        case "not_matchable":
          throw new AppError(409, "not_matchable", "finish your profile before you make a plan", {}, { missing: made.missing });
        case "women_only":
          throw new AppError(400, "women_only", "women-only groups are for women and non-binary people");
        case "plan_exists":
          throw new AppError(409, "plan_exists", "you already have a plan for this show", {}, { planId: made.planId });
      }
    },
  },
  {
    method: "GET",
    pattern: "/plans/:planId",
    auth: "member",
    handler: ({ app, params, member }) => {
      const plan = getPlanForMember(app.db, params.planId as string, authed(member).member.id);
      if (plan === null) throw notFound();
      return ok(planView(app, plan));
    },
  },
  {
    method: "POST",
    pattern: "/plans/:planId/withdraw",
    auth: "member",
    handler: async ({ app, request, params, member, now }) => {
      const { member: row } = authed(member);
      await parseEmptyBody(request, withdrawRequestSchema);
      const plan = getPlanForMember(app.db, params.planId as string, row.id);
      if (plan === null) throw notFound();
      const result = withdrawPlan(app.db, plan.id, "cancelled", now, app.config.tunables);
      if (!result.ok) {
        if (result.error === "not_found") throw notFound();
        throw new AppError(409, "plan_closed", "this plan is already over");
      }
      return ok(planView(app, result.plan));
    },
  },
  {
    method: "PUT",
    pattern: "/plans/:planId/ticket",
    auth: "member",
    handler: async ({ app, request, params, member, now }) => {
      const { member: row } = authed(member);
      const t = app.config.tunables;
      const plan = getPlanForMember(app.db, params.planId as string, row.id);
      if (plan === null) throw notFound();
      // The show's seller decides what proof is accepted. A plan whose show is no longer open still knows its own seller.
      const source = (app.db.query("SELECT source FROM event WHERE id = ?").get(plan.event_id) as { source: string } | null)?.source ?? "";
      const proofKind = proofKindForSource(source);
      if (now.getTime() >= Date.parse(planView(app, plan).joinUntil))
        throw new AppError(409, "too_late", "tickets can no longer be sent for this show");
      const bytes = await readBytes(request, MAX_TICKET_BYTES, "file_too_large");
      if (bytes.length === 0) throw invalidRequest("the file is empty");
      // What the file is comes from its bytes. The name and the content type the caller sent are never trusted.
      const kind = sniffTicketFile(bytes);
      if (kind === null) throw new AppError(400, "unsupported_type", "send a JPEG, PNG or HEIC picture, or a PDF");
      const checked = checkTicketFile(proofKind, { mime: MIME[kind], bytes: bytes.length });
      if (!checked.ok) {
        if (checked.reason === "screenshot_required")
          throw new AppError(400, "screenshot_required", "send a screenshot of the ticket, not a PDF");
        if (checked.reason === "too_large") throw new AppError(413, "file_too_large", "that file is too large");
        throw new AppError(400, "unsupported_type", "send a JPEG, PNG or HEIC picture, or a PDF");
      }
      if (kind === "pdf" && !checkPdf(bytes).ok)
        throw new AppError(400, "bad_ticket", "that PDF could not be accepted, send a screenshot instead");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      // The same file sent again while it is being checked is a retry (the first answer was lost), not a second upload.
      const latest = latestTicket(app.db, plan.id);
      if (latest !== null && latest.sha256 === sha256 && plan.state !== "needs_ticket" && plan.state !== "ticket_rejected")
        return ok(planView(app, plan));
      enforce(app.db, app.config.otpPepper, "ticket:plan", plan.id, t.rate.ticketUploadPerPlanHour, now);
      enforce(app.db, app.config.otpPepper, "ticket:member", row.id, t.rate.ticketUploadPerMemberDay, now);
      // A screenshot is made again from its pixels, so its metadata (including a position) is gone. A PDF is kept as sent.
      const stored = kind === "pdf" ? bytes : await reencodeTicketImage(bytes, t.photoMaxPixels);
      const key = `tickets/${ulid(now).toLowerCase()}.${kind === "pdf" ? "pdf" : "jpg"}`;
      const mime = kind === "pdf" ? PDF_MIME_TYPE : "image/jpeg";
      await app.store.put(key, stored, mime);
      let added: ReturnType<typeof addTicket>;
      try {
        added = addTicket(app.db, { plan, objectKey: key, mime, bytes: stored.length, sha256, now }, t);
      } catch (error) {
        await app.store.delete(key).catch(() => {});
        throw error;
      }
      if (!added.ok) {
        // The plan moved while the file was being stored: the file is not wanted.
        await app.store.delete(key).catch(() => {});
        if (added.error === "too_late") throw new AppError(409, "too_late", "tickets can no longer be sent for this show");
        throw new AppError(409, "plan_closed", "a ticket cannot be sent for this plan now");
      }
      return ok(planView(app, getPlan(app.db, plan.id) ?? plan));
    },
  },
];
