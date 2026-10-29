import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { clearTestClients, json } from "@/api/testing";
import { common } from "@/copy/common";
import { plans } from "@/copy/plans";
import { PLANS, planFixture } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { PlansScreen } from "./PlansScreen";

afterEach(() => clearTestClients());

async function open(body: unknown, status = 200) {
  const handlers = { onOpenPlan: jest.fn(), onFindShow: jest.fn() };
  const app = await createTestApp({ me: meFixture(), welcomeSeen: true, routes: { "GET /plans": json(status, body) } });
  await render(
    <AppProviders deps={app.deps}>
      <PlansScreen {...handlers} />
    </AppProviders>,
  );
  return { ...app, ...handlers };
}

describe("PlansScreen", () => {
  it("lists upcoming plans with their status and the ones that ended under Past", async () => {
    await open({ plans: [PLANS.no_group, PLANS.needs_ticket, PLANS.finding_group] });
    expect(await screen.findByTestId("plan-row-plan-1")).toBeOnTheScreen();
    expect(screen.getByText(plans.upcoming)).toBeOnTheScreen();
    expect(screen.getByText(plans.past)).toBeOnTheScreen();
    expect(screen.getByText(plans.count(2))).toBeOnTheScreen();
    expect(screen.getByText(plans.status.finding_group)).toBeOnTheScreen();
    expect(screen.getByText(plans.status.needs_ticket)).toBeOnTheScreen();
    expect(screen.getByText(plans.status.called_off)).toBeOnTheScreen();
  });

  it("reads the show time in IST", async () => {
    await open({ plans: [PLANS.needs_ticket] });
    expect(await screen.findByText("Fri 30 Oct, 8:00 PM")).toBeOnTheScreen();
  });

  it("opens a plan on tap", async () => {
    const app = await open({ plans: [planFixture({ id: "plan-x" })] });
    await fireEvent.press(await screen.findByTestId("plan-row-plan-x"));
    expect(app.onOpenPlan).toHaveBeenCalledWith("plan-x");
  });

  it("says so when there are no plans, with a way to the shows", async () => {
    const app = await open({ plans: [] });
    expect(await screen.findByText(plans.empty.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(plans.empty.action));
    expect(app.onFindShow).toHaveBeenCalled();
  });

  it("shows a plain error with a retry when the list cannot load", async () => {
    const app = await open({ code: "bad_request" }, 400);
    expect(await screen.findByText(common.errorTitle)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText(common.retry)));
    expect(app.transport.callsTo("GET /plans").length).toBeGreaterThan(1);
  });
});
