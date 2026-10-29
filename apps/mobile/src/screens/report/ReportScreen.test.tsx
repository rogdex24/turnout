import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createReportRequestSchema } from "@turnout/contract/app/reports";
import { Linking } from "react-native";
import { groupBeforeRevealFixture, groupFixture } from "@/api/groupFixtures";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { report as copy } from "@/copy/report";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { ReportScreen } from "./ReportScreen";

let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  clearTestClients();
  openURL.mockRestore();
});

const routes = (over: Record<string, RouteReply | RouteReply[]> = {}): Record<string, RouteReply | RouteReply[]> => ({
  "GET /groups/g1": json(200, groupFixture()),
  "POST /reports": json(201, { reportId: "r1" }),
  ...over,
});

async function openReport(params: { memberRef?: string; messageId?: string } = {}, over: Record<string, RouteReply | RouteReply[]> = {}) {
  const props = { onBack: jest.fn(), onDone: jest.fn() };
  const app = await createTestApp({ me: meFixture({ handle: { state: "approved" } }), welcomeSeen: true, routes: routes(over) });
  await render(
    <AppProviders deps={app.deps}>
      <ReportScreen groupId="g1" {...params} {...props} />
    </AppProviders>,
  );
  return { ...app, ...props };
}

const posts = (app: Awaited<ReturnType<typeof openReport>>) => app.transport.callsTo("POST /reports");
const bodyOf = (call: unknown) => JSON.parse((call as { body: string }).body) as Record<string, string>;

describe("ReportScreen", () => {
  it("shows Call 112 while loading, and dials it", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openReport(
      {},
      {
        "GET /groups/g1": async () => {
          await held;
          return json(200, groupFixture());
        },
      },
    );
    expect(screen.getByTestId("report-loading")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("report-call-112"));
    expect(openURL).toHaveBeenCalledWith("tel:112");
    await act(async () => release());
    await screen.findByTestId("report-people");
    expect(screen.getByTestId("report-call-112")).toBeOnTheScreen();
  });

  it("lists the others in the group, never the person themself", async () => {
    await openReport();
    expect(await screen.findByTestId("report-person-m-priya")).toBeOnTheScreen();
    expect(screen.getByTestId("report-person-m-sana")).toBeOnTheScreen();
    expect(screen.queryByTestId("report-person-m-you")).toBeNull();
  });

  it("starts on the person it was opened from", async () => {
    await openReport({ memberRef: "m-sana", messageId: "01J0000000000000000000A001" });
    const sana = await screen.findByTestId("report-person-m-sana");
    expect(sana.props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId("report-person-m-priya").props.accessibilityState.checked).toBe(false);
    expect(screen.getByText(copy.message)).toBeOnTheScreen();
  });

  it("cannot be sent until someone is picked", async () => {
    const app = await openReport();
    const send = await screen.findByTestId("report-send");
    expect(send.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(send);
    expect(posts(app)).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("report-person-m-priya"));
    expect(screen.getByTestId("report-send").props.accessibilityState.disabled).toBe(false);
  });

  it("sends the group, the person, the message, the reason with the details, and a client id", async () => {
    const app = await openReport({ memberRef: "m-sana", messageId: "01J0000000000000000000A001" });
    await fireEvent.press(await screen.findByTestId("report-reason-harassment"));
    await fireEvent.changeText(screen.getByTestId("report-details"), "  Kept messaging me after I said no.  ");
    await fireEvent.press(screen.getByTestId("report-send"));
    await waitFor(() => expect(posts(app)).toHaveLength(1));
    const body = bodyOf(posts(app)[0]);
    expect(body).toMatchObject({
      groupId: "g1",
      memberRef: "m-sana",
      messageId: "01J0000000000000000000A001",
      body: "Harassment or unwanted contact\n\nKept messaging me after I said no.",
    });
    expect(createReportRequestSchema.safeParse(body).success).toBe(true);
  });

  it("sends the reason alone when there are no details", async () => {
    const app = await openReport({ memberRef: "m-priya" });
    await fireEvent.press(await screen.findByTestId("report-send"));
    await waitFor(() => expect(posts(app)).toHaveLength(1));
    const body = bodyOf(posts(app)[0]);
    expect(body.body).toBe(copy.reasons[0].label);
    expect(body).not.toHaveProperty("messageId");
  });

  it("leaves the message out when the report is about someone else", async () => {
    const app = await openReport({ memberRef: "m-sana", messageId: "01J0000000000000000000A001" });
    await fireEvent.press(await screen.findByTestId("report-person-m-priya"));
    await fireEvent.press(screen.getByTestId("report-send"));
    await waitFor(() => expect(posts(app)).toHaveLength(1));
    expect(bodyOf(posts(app)[0])).toMatchObject({ memberRef: "m-priya" });
    expect(bodyOf(posts(app)[0])).not.toHaveProperty("messageId");
  });

  it("confirms, keeps Call 112, and says nothing about what became of the person", async () => {
    const app = await openReport({ memberRef: "m-sana" });
    await fireEvent.press(await screen.findByTestId("report-send"));
    expect(await screen.findByText(copy.sent.title)).toBeOnTheScreen();
    expect(screen.getByTestId("report-call-112")).toBeOnTheScreen();
    expect(screen.queryByText("Sana")).toBeNull();
    expect(screen.queryByTestId("report-people")).toBeNull();
    await fireEvent.press(screen.getByText(copy.sent.action));
    expect(app.onDone).toHaveBeenCalledTimes(1);
  });

  it("saves the report with no signal, says so, and sends it when the phone is back online", async () => {
    const app = await openReport({ memberRef: "m-sana" });
    await screen.findByTestId("report-send");
    await act(async () => app.deps.connectivity.report(false));
    await fireEvent.press(screen.getByTestId("report-send"));
    expect(await screen.findByText(copy.queued.title)).toBeOnTheScreen();
    expect(screen.getByText(copy.queued.body)).toBeOnTheScreen();
    expect(screen.getByTestId("report-call-112")).toBeOnTheScreen();
    expect(posts(app)).toHaveLength(0);
    await act(async () => app.deps.connectivity.report(true));
    await waitFor(() => expect(posts(app)).toHaveLength(1));
    expect(await screen.findByText(copy.sent.title)).toBeOnTheScreen();
  });

  it("says a refused report did not go, keeps what was written, and can be sent again", async () => {
    const app = await openReport({ memberRef: "m-sana" }, { "POST /reports": json(422, { error: "validation" }) });
    await fireEvent.changeText(await screen.findByTestId("report-details"), "Details here");
    await fireEvent.press(screen.getByTestId("report-send"));
    expect(await screen.findByText(copy.failed)).toBeOnTheScreen();
    expect(screen.getByTestId("report-details").props.value).toBe("Details here");
    app.transport.set("POST /reports", json(201, { reportId: "r1" }));
    await fireEvent.press(screen.getByTestId("report-send"));
    expect(await screen.findByText(copy.sent.title)).toBeOnTheScreen();
    expect(posts(app)).toHaveLength(2);
  });

  it("shows a retry, and Call 112, when the group cannot be read", async () => {
    await openReport({}, { "GET /groups/g1": json(403, { error: "forbidden" }) });
    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    expect(screen.getByTestId("report-call-112")).toBeOnTheScreen();
  });

  it("has no one to report before the group is shown", async () => {
    await openReport({}, { "GET /groups/g1": json(200, groupBeforeRevealFixture()) });
    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    expect(screen.queryByTestId("report-people")).toBeNull();
  });
});
