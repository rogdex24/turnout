/**
 * The operator's side of the Maestro flows, as a small test backend next to the seeded mobile server. A flow cannot open the admin
 * app, so these routes do what the operator and the other members would do, with the same functions the server uses: answer a
 * handle or a ticket, send a ticket for a member who cannot pick a file on a device, fill a show with members who have approved
 * tickets, and make a member leave. Every route needs the run's test token in `x-staging-test-token`, the way `/__test/*` does.
 *
 *   POST /operator/handle    { phone, decision: "approve" | "reject", reason? }
 *   POST /operator/ticket    { phone, eventId, decision: "approve" | "reject", reason? }   the member's ticket that waits for an answer
 *   POST /operator/send      { phone, eventId }                                            a plan with a ticket waiting for an answer
 *   POST /operator/crowd     { eventId, phones }                                           each phone gets an approved ticket, then one grouping pass
 *   POST /operator/withdraw  { phone, eventId }                                            the member's live plan ends as cancelled
 *   POST /operator/say       { phone, eventId, text }                                      the member posts to their group's thread
 *   POST /operator/after     { eventId }                                                   the clock moves to an hour past the morning after the show, then one ticker pass
 *
 * The time they act at is the server's own clock (`POST /__test/clock` moves it), so a leaver after the lock is a leaver after the lock.
 */
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import path from "node:path";
import { handleRejectReasonSchema } from "@turnout/contract/profile";
import { ticketRejectReasonSchema } from "@turnout/contract/ticket";
import { z } from "zod";
import { runGroupingPass, withdrawPlan } from "../src/social/groups.js";
import { getMemberByPhone } from "../src/social/members.js";
import { milestones } from "../src/social/model/schedule.js";
import { approveHandle, approveTicket, rejectHandle, rejectTicket } from "../src/social/operator.js";
import { createPlan, type PlanRow } from "../src/social/plans.js";
import { postMessage } from "../src/social/thread.js";
import { addTicket } from "../src/social/tickets.js";
import { diskStore } from "../src/utils/objectStore.js";
import { openDb } from "../src/utils/openDb.js";

const TOKEN_HEADER = "x-staging-test-token";
const phone = z.string().min(5).max(20);
const decision = z.enum(["approve", "reject"]);

const bodies = {
  handle: z.strictObject({ phone, decision, reason: handleRejectReasonSchema.optional() }),
  ticket: z.strictObject({ phone, eventId: z.string(), decision, reason: ticketRejectReasonSchema.optional() }),
  send: z.strictObject({ phone, eventId: z.string() }),
  crowd: z.strictObject({ eventId: z.string(), phones: z.array(phone).min(1).max(12) }),
  withdraw: z.strictObject({ phone, eventId: z.string() }),
  say: z.strictObject({ phone, eventId: z.string(), text: z.string().trim().min(1).max(500) }),
  after: z.strictObject({ eventId: z.string() }),
};

/** Every route's body, with the fields a route does not take left out of its own check. */
type Body = {
  phone: string;
  phones: string[];
  eventId: string;
  decision: z.infer<typeof decision>;
  reason?: string;
  text: string;
};

export type Operator = { url: string; port: number; stop: () => void };

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const refuse = (status: number, message: string): never => {
  throw new Refusal(status, message);
};

function memberId(db: Database, number: string): string {
  return getMemberByPhone(db, number)?.id ?? refuse(404, `no member for ${number}`);
}

/** The member's plan on this show that has not ended. */
function livePlan(db: Database, id: string, eventId: string, states: readonly string[]): PlanRow {
  const marks = states.map(() => "?").join(", ");
  const row = db
    .query(`SELECT * FROM plan WHERE member_id = ? AND event_id = ? AND state IN (${marks}) ORDER BY created_at DESC LIMIT 1`)
    .get(id, eventId, ...states) as PlanRow | null;
  return row ?? refuse(409, `no plan for this member on ${eventId} in ${states.join(" or ")}`);
}

/** A ticket proof the operator's queue would hold: a stored file and its row, moving the plan to `checking_ticket`. */
async function sendTicket(db: Database, store: ReturnType<typeof diskStore>, plan: PlanRow, now: Date): Promise<string> {
  const bytes = new TextEncoder().encode(`seed ticket ${plan.id}`);
  const key = `tickets/seed-${plan.id.toLowerCase()}.pdf`;
  await store.put(key, bytes, "application/pdf");
  const added = addTicket(db, {
    plan,
    objectKey: key,
    mime: "application/pdf",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    now,
  });
  return added.ok ? added.ticket.id : refuse(409, `the ticket was refused: ${added.error}`);
}

async function perform(
  db: Database,
  store: ReturnType<typeof diskStore>,
  name: keyof typeof bodies,
  raw: unknown,
  now: Date,
  setClock: (to: Date) => Promise<void>,
): Promise<unknown> {
  const parsed = bodies[name].safeParse(raw);
  if (!parsed.success) return refuse(400, parsed.error.message);
  const body = parsed.data as Body;
  if (name === "handle") {
    const id = memberId(db, body.phone);
    const result =
      body.decision === "approve"
        ? approveHandle(db, id, now)
        : rejectHandle(db, id, handleRejectReasonSchema.parse(body.reason ?? "not_found"), now);
    return result.ok ? { ok: true } : refuse(409, result.error);
  }
  if (name === "send") {
    const id = memberId(db, body.phone);
    const plan = livePlan(db, id, body.eventId, ["needs_ticket", "ticket_rejected"]);
    await sendTicket(db, store, plan, now);
    return { ok: true };
  }
  if (name === "ticket") {
    const id = memberId(db, body.phone);
    const plan = livePlan(db, id, body.eventId, ["checking_ticket"]);
    const ticket = db
      .query("SELECT id FROM ticket_proof WHERE plan_id = ? AND status = 'pending' ORDER BY uploaded_at DESC LIMIT 1")
      .get(plan.id) as { id: string } | null;
    if (ticket === null) return refuse(409, "no ticket is waiting for an answer");
    const result =
      body.decision === "approve"
        ? approveTicket(db, ticket.id, now)
        : rejectTicket(db, ticket.id, ticketRejectReasonSchema.parse(body.reason ?? "unreadable"), now);
    if (!result.ok) return refuse(409, result.error);
    // The ticker would do this within a minute; the flows run with it off.
    if (body.decision === "approve") runGroupingPass(db, body.eventId, now);
    return { ok: true, planState: result.plan.state };
  }
  if (name === "say") {
    const id = memberId(db, body.phone);
    const plan = livePlan(db, id, body.eventId, ["group_confirmed", "meet_card_live"]);
    if (plan.group_id === null) return refuse(409, "the plan has no group yet");
    // A fresh client id each time: the flow means every call to be a new message.
    const posted = postMessage(db, plan.group_id, id, { body: body.text, clientId: crypto.randomUUID() }, now);
    return posted.ok ? { ok: true, messageId: posted.message.id } : refuse(409, `the thread refused the message: ${posted.error}`);
  }
  if (name === "crowd") {
    for (const number of body.phones as string[]) {
      const id = memberId(db, number);
      const made = createPlan(db, { memberId: id, eventId: body.eventId, groupType: "open", now });
      const plan = made.ok
        ? made.plan
        : made.error === "plan_exists"
          ? livePlan(db, id, body.eventId, ["needs_ticket", "checking_ticket", "finding_group"])
          : refuse(409, made.error);
      if (plan.state === "needs_ticket") await sendTicket(db, store, plan, now);
      const waiting = livePlan(db, id, body.eventId, ["checking_ticket", "finding_group"]);
      if (waiting.state === "checking_ticket") {
        const ticket = db.query("SELECT id FROM ticket_proof WHERE plan_id = ? AND status = 'pending' LIMIT 1").get(waiting.id) as {
          id: string;
        };
        approveTicket(db, ticket.id, now);
      }
    }
    return { ok: true, grouping: runGroupingPass(db, body.eventId, now) };
  }
  if (name === "after") {
    const show = db.query("SELECT starts_at FROM event WHERE id = ?").get(body.eventId) as { starts_at: string } | null;
    if (show === null) return refuse(404, `no show ${body.eventId}`);
    // One hour past 10:00 IST the next morning: the ticker moves the group and the plans to done and sends the morning-after notice.
    const at = new Date(Date.parse(milestones(show.starts_at).morningAfterAt) + 60 * 60_000);
    // The clock only moves forward, so a flow that ran earlier and is already past this time keeps it.
    const to = at.getTime() > now.getTime() ? at : now;
    await setClock(to);
    return { ok: true, at: to.toISOString() };
  }
  const id = memberId(db, body.phone);
  const plan = livePlan(db, id, body.eventId, [
    "needs_ticket",
    "checking_ticket",
    "ticket_rejected",
    "finding_group",
    "group_confirmed",
    "meet_card_live",
  ]);
  const result = withdrawPlan(db, plan.id, "cancelled", now);
  return result.ok ? { ok: true } : refuse(409, result.error);
}

/**
 * Serves the routes above on `port`, writing to the same SQLite file as `serve` and the same files directory. `serverNow` reads the
 * server's clock, so what these routes do is dated by it.
 */
export function startOperator(options: {
  dbPath: string;
  filesDir: string;
  token: string;
  port: number;
  serverNow: () => Promise<Date>;
  /** Sets the server's clock to this time and runs one ticker pass. */
  setClock: (to: Date) => Promise<void>;
}): Operator {
  const db = openDb(options.dbPath);
  const store = diskStore({ dir: path.resolve(options.filesDir), link: () => "" });
  const server = Bun.serve({
    port: options.port,
    async fetch(request) {
      const url = new URL(request.url);
      const name = url.pathname.replace(/^\/operator\//, "") as keyof typeof bodies;
      if (request.method !== "POST" || request.headers.get(TOKEN_HEADER) !== options.token || !(name in bodies))
        return new Response("not found", { status: 404 });
      try {
        const answer = await perform(db, store, name, await request.json().catch(() => ({})), await options.serverNow(), options.setClock);
        return Response.json(answer);
      } catch (error) {
        if (error instanceof Refusal) return Response.json({ error: error.message }, { status: error.status });
        throw error;
      }
    },
  });
  return {
    url: `http://localhost:${server.port}`,
    port: server.port as number,
    stop: () => {
      server.stop(true);
      db.close();
    },
  };
}
