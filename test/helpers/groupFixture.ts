import type { Gender } from "@turnout/contract/profile";
import { tick } from "../../src/social/tick.js";
import { type TestApp, testApp } from "../appHelpers.js";
import { memberSession, type Session } from "./appFixture.js";
import { SHOW_START, seedShow, waitingPlan } from "./socialFixture.js";

const START = Date.parse(SHOW_START);
const GENDERS: Gender[] = ["woman", "man", "woman", "man", "non_binary", "woman"];

export interface Setup {
  t: TestApp;
  members: Session[];
  groupId: string;
  /** Moves the clock to `ms` from the show start, runs the passes that are due and signs everyone in again (access tokens are short). */
  at(ms: number): Promise<void>;
}

export async function setup(people = 4): Promise<Setup> {
  const t = await testApp();
  seedShow(t.db, { id: "show-a" });
  const members: Session[] = [];
  for (let i = 0; i < people; i++) {
    const who = await memberSession(t, i, { name: `Person${i}`, gender: GENDERS[i % GENDERS.length] });
    waitingPlan(t.db, who.memberId, "show-a", t.clock());
    members.push(who);
  }
  tick(t.db, t.clock());
  const plans = (await (await t.call("GET", "/plans", { token: (members[0] as Session).token })).json()) as {
    plans: { group: { id: string } }[];
  };
  const groupId = plans.plans[0]?.group.id as string;
  const at = async (ms: number) => {
    t.clock.set(new Date(START + ms));
    tick(t.db, t.clock());
    for (const who of members) who.token = (await t.signIn(who.phone)).accessToken;
  };
  return { t, members, groupId, at };
}
