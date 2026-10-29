import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createReportRequestSchema, REPORT_MAX_CHARS } from "@turnout/contract/app/reports";
import { Linking } from "react-native";
import { groupBeforeRevealFixture, groupFixture, memberFixture } from "@/api/groupFixtures";
import { isPersistedKey, queryKeys } from "@/api/keys";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { report as copy } from "@/copy/report";
import { DETAILS_MAX_CHARS } from "@/model/report";
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

type Json = { props: Record<string, unknown>; children: Json[] | null } | string | null;

/** The props of every rendered node that has `prop` set. */
function withProp(node: Json | Json[], prop: string): Record<string, unknown>[] {
  if (node === null || typeof node === "string") return [];
  if (Array.isArray(node)) return node.flatMap((child) => withProp(child, prop));
  return [...(node.props[prop] === undefined ? [] : [node.props]), ...withProp(node.children ?? [], prop)];
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

  it("checks the report against the contract first, keeps what was written, and says why", async () => {
    const app = await openReport({ memberRef: "m-sana" });
    await screen.findByTestId("report-send");
    // A field's own limit stops typing, but not a paste the keyboard hands over whole.
    const long = "x".repeat(REPORT_MAX_CHARS + 1);
    await fireEvent.changeText(screen.getByTestId("report-details"), long);
    await fireEvent.press(screen.getByTestId("report-send"));
    expect(await screen.findByTestId("report-invalid")).toHaveTextContent(copy.invalid(REPORT_MAX_CHARS));
    expect(posts(app)).toHaveLength(0);
    expect(screen.getByTestId("report-details").props.value).toBe(long);
    expect(screen.getByTestId("report-details").props.maxLength).toBe(DETAILS_MAX_CHARS);
    await fireEvent.changeText(screen.getByTestId("report-details"), "Shorter.");
    expect(screen.queryByTestId("report-invalid")).toBeNull();
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

  it("reads the people from the memory-only query, and keeps their photos out of the disk image cache", async () => {
    const photo = "https://photos.example/sana.jpg?sig=1";
    const group = groupFixture({
      members: [
        memberFixture({ memberRef: "m-sana", firstName: "Sana", photoUrl: photo }),
        memberFixture({ memberRef: "m-you", isYou: true }),
      ],
    });
    const app = await openReport({ memberRef: "m-sana" }, { "GET /groups/g1": json(200, group) });
    const tile = await screen.findByTestId("report-person-m-sana");
    expect(app.queryClient.getQueryData(queryKeys.after("g1"))).toBeDefined();
    expect(app.queryClient.getQueryData(queryKeys.group("g1"))).toBeUndefined();
    expect(isPersistedKey(queryKeys.after("g1"))).toBe(false);
    expect(tile).toBeOnTheScreen();
    const images = withProp(screen.toJSON(), "cachePolicy");
    expect(images).toHaveLength(1);
    expect(images[0]?.cachePolicy).toBe("memory");
    expect(images[0]?.source).toEqual([{ uri: photo, cacheKey: "g1:m-sana" }]);
  });

  it("has no one to report before the group is shown", async () => {
    await openReport({}, { "GET /groups/g1": json(200, groupBeforeRevealFixture()) });
    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    expect(screen.queryByTestId("report-people")).toBeNull();
  });
});
