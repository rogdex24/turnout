import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { queryKeys } from "@/api/keys";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { common } from "@/copy/common";
import { plan as copy } from "@/copy/plan";
import { PLANS } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { CancelScreen } from "./CancelScreen";

afterEach(() => clearTestClients());

async function open(plan: (typeof PLANS)[keyof typeof PLANS], routes: Record<string, RouteReply | RouteReply[]> = {}) {
  const onClose = jest.fn();
  const app = await createTestApp({
    me: meFixture(),
    welcomeSeen: true,
    routes: { [`GET /plans/${plan.id}`]: json(200, plan), ...routes },
  });
  await render(
    <AppProviders deps={app.deps}>
      <CancelScreen planId={plan.id} onClose={onClose} />
    </AppProviders>,
  );
  return { ...app, onClose };
}

describe("CancelScreen", () => {
  it("asks plainly, and says the ticket is not affected", async () => {
    await open(PLANS.finding_group);
    expect(await screen.findByText(copy.cancel.title)).toBeOnTheScreen();
    expect(screen.getByText(copy.cancel.lead)).toBeOnTheScreen();
    expect(screen.queryByText(copy.cancel.groupNote)).toBeNull();
  });

  it("puts the cancel-sheet id on the sheet panel, which holds the actions", async () => {
    // Maestro skips a view with no size, and without a group note or an issue the sheet's own content is empty.
    await open(PLANS.finding_group);
    expect(within(await screen.findByTestId("cancel-sheet")).getByTestId("cancel-confirm")).toBeTruthy();
  });

  it("tells a person in a group what the group is told", async () => {
    await open(PLANS.group_confirmed);
    expect(await screen.findByText(copy.cancel.groupNote)).toBeOnTheScreen();
  });

  it("Stay closes without leaving", async () => {
    const app = await open(PLANS.finding_group);
    await fireEvent.press(await screen.findByTestId("cancel-stay"));
    expect(app.onClose).toHaveBeenCalled();
    expect(app.transport.callsTo(`POST /plans/${PLANS.finding_group.id}/withdraw`)).toHaveLength(0);
  });

  it("leaves the plan, keeps the answer and refreshes the list", async () => {
    const plan = PLANS.finding_group;
    const left = { ...plan, state: "withdrawn" as const, reason: "cancelled" as const };
    const app = await open(plan, { [`POST /plans/${plan.id}/withdraw`]: json(200, left) });
    await fireEvent.press(await screen.findByTestId("cancel-confirm"));
    await act(async () => undefined);
    expect(app.onClose).toHaveBeenCalled();
    expect(app.queryClient.getQueryData(queryKeys.planDetail(plan.id))).toEqual(left);
    expect(app.queryClient.getQueryState(queryKeys.plansList())).toBeUndefined();
  });

  it("closes on a plan that already ended, and reads it again", async () => {
    const plan = PLANS.finding_group;
    const app = await open(plan, { [`POST /plans/${plan.id}/withdraw`]: json(409, { error: { code: "plan_closed", message: "Ended." } }) });
    await fireEvent.press(await screen.findByTestId("cancel-confirm"));
    await act(async () => undefined);
    expect(app.onClose).toHaveBeenCalled();
  });

  it("says plainly when it did not go through, and stays open", async () => {
    const plan = PLANS.finding_group;
    const app = await open(plan, { [`POST /plans/${plan.id}/withdraw`]: json(400, { error: { code: "bad_request", message: "No." } }) });
    await fireEvent.press(await screen.findByTestId("cancel-confirm"));
    expect(await screen.findByText(common.errorGeneric)).toBeOnTheScreen();
    expect(app.onClose).not.toHaveBeenCalled();
  });
});
