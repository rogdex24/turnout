import type { Gender } from "@turnout/contract/profile";
import { tick } from "../../src/social/tick.js";
import { type TestApp, testApp } from "../appHelpers.js";
import { memberSession, type Session } from "./appFixture.js";
import { SHOW_START, seedShow, waitingPlan } from "./socialFixture.js";

/**
 * The people matrix: one show, two groups, and callers who are in, out, waiting, on another show, suspended or removed. The
 * authorization matrix and the S19 audit share it.
 */
export const HOUR = 3_600_000;
export const MINUTE = 60_000;
export const START = Date.parse(SHOW_START);
const GENDERS_A: Gender[] = ["woman", "man", "woman", "man", "non_binary", "woman"];
const GENDERS_B: Gender[] = ["woman", "man", "woman", "man"];

export interface World {
  t: TestApp;
  groupA: string;
  groupB: string;
  groupY: string;
  a: Session[];
  b: Session[];
  /** Waiting for a group on show X: the handle is still pending, so the pool skips them. */
  waiting: Session;
  /** In a group on a different show. */
  y: Session[];
  /** Has a plan on X and a pending handle. */
  planOf: Map<string, string>;
  refOf(groupId: string, who: Session): string;
  /** Moves the clock to `ms` from the show start, runs what is due and signs the given people in again (access tokens are short). */
  at(ms: number, ...who: Session[]): Promise<void>;
}

export async function world(): Promise<World> {
  const t = await testApp();
  seedShow(t.db, { id: "show-x" });
  seedShow(t.db, { id: "show-y", startsAt: "2026-11-12T14:00:00.000Z" });
  const form = async (show: string, from: number, genders: Gender[]) => {
    const people: Session[] = [];
    for (let i = 0; i < genders.length; i++) {
      const who = await memberSession(t, from + i, { name: `Person${from + i}`, gender: genders[i] });
      waitingPlan(t.db, who.memberId, show, t.clock());
      people.push(who);
    }
    tick(t.db, t.clock());
    return people;
  };
  const groupOf = (who: Session) =>
    (t.db.query("SELECT group_id FROM group_member WHERE member_id = ?").get(who.memberId) as { group_id: string }).group_id;
  const a = await form("show-x", 0, GENDERS_A);
  const b = await form("show-x", 6, GENDERS_B);
  const y = await form("show-y", 11, GENDERS_B);
  const waiting = await memberSession(t, 15, { name: "Waiting", handle: "pending" });
  waitingPlan(t.db, waiting.memberId, "show-x", t.clock());
  // The real keys are random, never derived from the member id, so a photo link cannot give an id away.
  t.db.query("UPDATE profile SET photo_key = 'photos/' || lower(hex(randomblob(12))) || '.jpg'").run();
  const planOf = new Map<string, string>();
  for (const who of [...a, ...b, ...y, waiting]) {
    planOf.set(who.memberId, (t.db.query("SELECT id FROM plan WHERE member_id = ?").get(who.memberId) as { id: string }).id);
  }
  const everyone = [...a, ...b, ...y, waiting];
  return {
    t,
    groupA: groupOf(a[0] as Session),
    groupB: groupOf(b[0] as Session),
    groupY: groupOf(y[0] as Session),
    a,
    b,
    waiting,
    y,
    planOf,
    refOf: (groupId, who) =>
      (
        t.db.query("SELECT member_ref FROM group_member WHERE group_id = ? AND member_id = ?").get(groupId, who.memberId) as {
          member_ref: string;
        }
      ).member_ref,
    at: async (ms, ...who) => {
      t.clock.set(new Date(START + ms));
      tick(t.db, t.clock());
      for (const person of who.length > 0 ? who : everyone) person.token = (await t.signIn(person.phone)).accessToken;
    },
  };
}
