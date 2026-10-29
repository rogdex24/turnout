import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { doneGroupFixture, FEEDBACK_OPEN_UNTIL, groupFixture } from "@/api/groupFixtures";
import { isPersistedKey } from "@/api/keys";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { after as copy } from "@/copy/after";
import { common } from "@/copy/common";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { AfterScreen } from "./AfterScreen";

// The morning after the show, 11:00 IST.
const MORNING_AFTER = Date.parse("2026-11-08T05:30:00.000Z");

let clock: jest.SpyInstance;

beforeEach(() => {
  clock = jest.spyOn(Date, "now").mockReturnValue(MORNING_AFTER);
});

afterEach(() => {
  clearTestClients();
  clock.mockRestore();
});

const routes = (over: Record<string, RouteReply | RouteReply[]> = {}): Record<string, RouteReply | RouteReply[]> => ({
  "GET /groups/g1": json(200, doneGroupFixture()),
  "POST /groups/g1/downvotes": { status: 204, text: "", retryAfter: null },
  ...over,
});

async function open(over: Record<string, RouteReply | RouteReply[]> = {}) {
  const props = { onBack: jest.fn(), onReport: jest.fn(), onClosed: jest.fn() };
  const app = await createTestApp({ me: meFixture({ handle: { state: "approved" } }), welcomeSeen: true, routes: routes(over) });
  await render(
    <AppProviders deps={app.deps}>
      <AfterScreen groupId="g1" focused {...props} />
    </AppProviders>,
  );
  return { ...app, ...props };
}

describe("AfterScreen", () => {
  it("shows the faces by first name with the do-nothing line, and not the person's own tile", async () => {
    await open();
    expect(await screen.findByText("Priya")).toBeOnTheScreen();
    expect(screen.getByText("Sana")).toBeOnTheScreen();
    expect(screen.getByText("Meera")).toBeOnTheScreen();
    expect(screen.queryByText("Ananya")).toBeNull();
    expect(screen.getByText(copy.doNothing.title)).toBeOnTheScreen();
  });

  it("does not keep the faces on disk", async () => {
    const app = await open();
    await screen.findByText("Priya");
    expect(app.deps.queryClient.getQueryCache().find({ queryKey: ["after", "g1"] })).toBeDefined();
    expect(isPersistedKey(["after", "g1"])).toBe(false);
  });

  it("marks a person after a confirm, with the member ref and nothing else", async () => {
    const marked = doneGroupFixture({ downvotedRefs: ["m-sana"] });
    const app = await open({ "GET /groups/g1": [json(200, doneGroupFixture()), json(200, marked)] });
    await fireEvent.press(await screen.findByTestId("after-mark-m-sana"));
    expect(app.transport.callsTo("POST /groups/g1/downvotes")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("after-confirm"));
    await waitFor(() => expect(app.transport.callsTo("POST /groups/g1/downvotes")).toHaveLength(1));
    const [call] = app.transport.callsTo("POST /groups/g1/downvotes") as unknown as { body: string }[];
    expect(JSON.parse(call?.body ?? "")).toEqual({ memberRef: "m-sana" });
    expect(await screen.findByTestId("after-marked-m-sana")).toBeOnTheScreen();
    expect(screen.queryByTestId("after-mark-m-sana")).toBeNull();
  });

  it("shows a person already marked as done", async () => {
    await open({ "GET /groups/g1": json(200, doneGroupFixture({ downvotedRefs: ["m-meera"] })) });
    expect(await screen.findByTestId("after-marked-m-meera")).toBeOnTheScreen();
    expect(screen.getByTestId("after-mark-m-priya")).toBeOnTheScreen();
  });

  it("saves the mark with no signal and sends it when the phone is back online", async () => {
    const app = await open();
    await screen.findByTestId("after-mark-m-sana");
    await act(async () => app.deps.connectivity.report(false));
    await fireEvent.press(screen.getByTestId("after-mark-m-sana"));
    await fireEvent.press(screen.getByTestId("after-confirm"));
    expect(await screen.findByText(copy.notComfortable.queued)).toBeOnTheScreen();
    expect(app.transport.callsTo("POST /groups/g1/downvotes")).toHaveLength(0);
    await act(async () => app.deps.connectivity.report(true));
    await waitFor(() => expect(app.transport.callsTo("POST /groups/g1/downvotes")).toHaveLength(1));
  });

  it("goes back to the button, with a line, when the server turns the mark down", async () => {
    await open({ "POST /groups/g1/downvotes": json(404, { error: "not_found" }) });
    await fireEvent.press(await screen.findByTestId("after-mark-m-sana"));
    await fireEvent.press(screen.getByTestId("after-confirm"));
    expect(await screen.findByText(copy.notComfortable.failed)).toBeOnTheScreen();
    expect(screen.getByTestId("after-mark-m-sana")).toBeOnTheScreen();
  });

  it("opens the report for a person", async () => {
    const { onReport } = await open();
    await fireEvent.press(await screen.findByTestId("after-report-m-meera"));
    expect(onReport).toHaveBeenCalledWith("g1", "m-meera");
  });

  it("is not open until the group is done, whatever the phone's clock says", async () => {
    clock.mockReturnValue(Date.parse(FEEDBACK_OPEN_UNTIL) - 3_600_000);
    await open({ "GET /groups/g1": json(200, groupFixture()) });
    expect(await screen.findByText(copy.notYet.title)).toBeOnTheScreen();
    expect(screen.queryByText("Priya")).toBeNull();
  });

  it("says it has closed when the group is gone (404), and goes back to the plans", async () => {
    const { onClosed } = await open({ "GET /groups/g1": json(404, { error: "not_found" }) });
    expect(await screen.findByText(copy.closed.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(copy.closed.action));
    expect(onClosed).toHaveBeenCalled();
  });

  it("says it has closed once the 72 hours are over", async () => {
    clock.mockReturnValue(Date.parse(FEEDBACK_OPEN_UNTIL) + 60_000);
    await open();
    expect(await screen.findByText(copy.closed.title)).toBeOnTheScreen();
    expect(screen.queryByText("Priya")).toBeNull();
  });

  it("offers a retry when the group cannot be read", async () => {
    const app = await open({ "GET /groups/g1": [json(400, { error: "validation" }), json(200, doneGroupFixture())] });
    expect(await screen.findByText(common.errorGeneric)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(common.retry));
    expect(await screen.findByText("Priya")).toBeOnTheScreen();
    expect(app.transport.callsTo("GET /groups/g1")).toHaveLength(2);
  });
});
