import type { MeResponse } from "@turnout/contract/app/me";
import { meFixture } from "../providers/testing";
import { HANDLE_POLL_MS, meRefetchInterval } from "./me";

const query = (data: MeResponse | undefined) => ({ state: { data } }) as Parameters<typeof meRefetchInterval>[0];

describe("meRefetchInterval", () => {
  it("polls every minute while the handle check is pending", () => {
    expect(meRefetchInterval(query(meFixture({ handle: { state: "pending" } })))).toBe(HANDLE_POLL_MS);
    expect(HANDLE_POLL_MS).toBe(60_000);
  });

  it("stops once the handle is approved, rejected or missing, or before me has loaded", () => {
    for (const state of ["approved", "rejected", "missing"] as const) {
      expect(meRefetchInterval(query(meFixture({ handle: { state } })))).toBe(false);
    }
    expect(meRefetchInterval(query(undefined))).toBe(false);
  });
});
