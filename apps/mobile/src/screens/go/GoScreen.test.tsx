import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { MeResponse } from "@turnout/contract/app/me";
import { queryKeys } from "@/api/keys";
import { goExplained } from "@/api/prefs";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { go } from "@/copy/go";
import { planFixture } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { GoScreen } from "./GoScreen";

afterEach(() => clearTestClients());

const body = (call: unknown) => JSON.parse(String((call as { body: unknown }).body));

async function open(me: MeResponse, routes: Record<string, RouteReply | RouteReply[]> = {}) {
  const onClose = jest.fn();
  const onPlan = jest.fn();
  const onFinish = jest.fn();
  const app = await createTestApp({ me, welcomeSeen: true, routes });
  app.queryClient.setQueryData(queryKeys.me(), me);
  await render(
    <AppProviders deps={app.deps}>
      <GoScreen publicId="monsoon-theory" onClose={onClose} onPlan={onPlan} onFinish={onFinish} />
    </AppProviders>,
  );
  return { ...app, onClose, onPlan, onFinish };
}

describe("GoScreen", () => {
  it("makes the plan and goes on to the ticket", async () => {
    const plan = planFixture();
    const app = await open(meFixture(), { "POST /plans": json(201, plan) });
    await fireEvent.press(screen.getByTestId("go-next"));
    await waitFor(() => expect(app.onPlan).toHaveBeenCalledWith("plan-1"));
    expect(body(app.transport.callsTo("POST /plans")[0])).toEqual({ eventId: "monsoon-theory", groupType: "open" });
    expect(app.queryClient.getQueryData(queryKeys.planDetail("plan-1"))).toEqual(plan);
  });

  it("sends women-only when a woman chooses it, and starts on her saved choice", async () => {
    const app = await open(meFixture({ profile: { groupPref: "women_only" } }), {
      "POST /plans": json(201, planFixture({ groupType: "women_only" })),
    });
    expect(screen.getByTestId("go-women-only").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId("go-open"));
    await fireEvent.press(screen.getByTestId("go-women-only"));
    await fireEvent.press(screen.getByTestId("go-next"));
    await waitFor(() => expect(app.onPlan).toHaveBeenCalled());
    expect(body(app.transport.callsTo("POST /plans")[0]).groupType).toBe("women_only");
  });

  it("leaves the women-only choice out for a man", async () => {
    await open(meFixture({ profile: { gender: "man" } }));
    expect(screen.queryByTestId("go-women-only")).toBeNull();
    expect(screen.queryByText(go.groupType.women_only)).toBeNull();
  });

  it("explains how groups work the first time only", async () => {
    const first = await open(meFixture(), { "POST /plans": json(201, planFixture()) });
    expect(screen.getByText(go.explain)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("go-next"));
    await waitFor(() => expect(first.onPlan).toHaveBeenCalled());
    expect(goExplained(first.prefs)).toBe(true);
  });

  it("leaves the sentence out once it has been read", async () => {
    const onPlan = jest.fn();
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true });
    app.prefs.set("goExplained", "1");
    await render(
      <AppProviders deps={app.deps}>
        <GoScreen publicId="monsoon-theory" onClose={jest.fn()} onPlan={onPlan} onFinish={jest.fn()} />
      </AppProviders>,
    );
    expect(screen.queryByText(go.explain)).toBeNull();
  });

  it("carries on with the plan already made when Go is pressed again", async () => {
    const app = await open(meFixture(), {
      "POST /plans": json(409, { error: { code: "plan_exists", message: "You already have a plan for this show.", planId: "plan-9" } }),
    });
    await fireEvent.press(screen.getByTestId("go-next"));
    await waitFor(() => expect(app.onPlan).toHaveBeenCalledWith("plan-9"));
    expect(screen.queryByTestId("go-issue")).toBeNull();
  });

  it("says what is missing and offers the page that adds it", async () => {
    const app = await open(meFixture(), {
      "POST /plans": json(409, { error: { code: "not_matchable", message: "Not ready.", missing: ["photo", "gender"] } }),
    });
    await fireEvent.press(screen.getByTestId("go-next"));
    expect(await screen.findByText(go.missing.lead("your photo and your gender"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("go-finish"));
    expect(app.onFinish).toHaveBeenCalledWith("/settings/profile");
    expect(app.onPlan).not.toHaveBeenCalled();
  });

  it("sends a person with only the handle missing to the handle page", async () => {
    const app = await open(meFixture(), {
      "POST /plans": json(409, { error: { code: "not_matchable", message: "Not ready.", missing: ["handle"] } }),
    });
    await fireEvent.press(screen.getByTestId("go-next"));
    await fireEvent.press(await screen.findByTestId("go-finish"));
    expect(app.onFinish).toHaveBeenCalledWith("/settings/social");
  });

  it("says plainly when the show is closed to groups, and when the phone is offline", async () => {
    await open(meFixture(), { "POST /plans": json(404, { error: { code: "not_found", message: "No such show." } }) });
    await fireEvent.press(screen.getByTestId("go-next"));
    expect(await screen.findByText(go.issues.closed)).toBeOnTheScreen();
  });

  it("closes from Not now without making a plan", async () => {
    const app = await open(meFixture());
    await fireEvent.press(screen.getByTestId("go-not-now"));
    expect(app.onClose).toHaveBeenCalled();
    expect(app.transport.callsTo("POST /plans")).toHaveLength(0);
  });
});
