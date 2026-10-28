import { type Plan, planSchema } from "@turnout/contract/app/plans";
import { PHONES, type TestApp } from "../appHelpers.js";
import { type SeedMember, seedMember } from "./socialFixture.js";

export interface Session {
  memberId: string;
  token: string;
  phone: string;
}

/** A member who is ready to be matched (profile, photo, approved handle), signed in through the real sign-in route. */
export async function memberSession(t: TestApp, phoneIndex: number, options: SeedMember = {}): Promise<Session> {
  const memberId = seedMember(t.db, t.clock(), { ...options, phoneIndex });
  const phone = PHONES[phoneIndex] as string;
  const tokens = await t.signIn(phone);
  return { memberId, token: tokens.accessToken, phone };
}

/** Makes a plan through the route. */
export async function makePlan(t: TestApp, who: Session, eventId: string, groupType: "open" | "women_only" = "open"): Promise<Plan> {
  const response = await t.call("POST", "/plans", { token: who.token, body: { eventId, groupType } });
  if (response.status !== 201) throw new Error(`plan not made: ${response.status} ${await response.text()}`);
  return planSchema.parse(await response.json());
}
