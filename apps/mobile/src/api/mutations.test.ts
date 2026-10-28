import { dehydrate, hydrate, MutationObserver, onlineManager } from "@tanstack/react-query";
import { type Replayable, registerReplayable, replayable } from "./mutations";
import { dehydrateOptions } from "./persister";
import { clearTestClients, testQueryClient } from "./testing";

afterEach(() => clearTestClients());

describe("replayable", () => {
  it("makes the client id once and keeps it", () => {
    const first = replayable({ a: 1 });
    expect(first.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(replayable({ a: 1 }).clientId).not.toBe(first.clientId);
    expect(replayable({ a: 1 }, "fixed").clientId).toBe("fixed");
  });
});

describe("queued mutations resume after a restart", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("sends the saved variables, with the same client id, once the network is back", async () => {
    onlineManager.setOnline(false);
    const before = testQueryClient();
    registerReplayable<{ showId: string }>(before, "checkin", async () => ({}));
    const observer = new MutationObserver<unknown, Error, Replayable<{ showId: string }>>(before, { mutationKey: ["checkin"] });
    void observer.mutate(replayable({ showId: "s1" }, "client-1")).catch(() => {});
    const saved = JSON.parse(JSON.stringify(dehydrate(before, dehydrateOptions)));
    expect(saved.mutations).toHaveLength(1);

    const sent: Replayable<{ showId: string }>[] = [];
    const after = testQueryClient();
    registerReplayable<{ showId: string }>(after, "checkin", async (variables) => {
      sent.push(variables);
      return {};
    });
    hydrate(after, saved);
    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    expect(sent).toEqual([{ clientId: "client-1", payload: { showId: "s1" } }]);
  });
});
