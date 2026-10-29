import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { MESSAGE_MAX_CHARS, type Message } from "@turnout/contract/app/thread";
import { groupBeforeRevealFixture, groupFixture, SHOW_STARTS_AT } from "@/api/groupFixtures";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { thread as copy } from "@/copy/thread";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { POLL_EVERY_MS, ThreadScreen } from "./ThreadScreen";

const mockRelease = jest.fn();
const mockHold = jest.fn((_groupId: string) => mockRelease);
jest.mock("@/api/notifications", () => ({
  ...jest.requireActual("@/api/notifications"),
  holdThreadPushes: (groupId: string) => mockHold(groupId),
}));

const HOUR = 60 * 60_000;
const START = Date.parse(SHOW_STARTS_AT);
/** An hour before the show: the chat is open. */
const OPEN = START - HOUR;

let clock: jest.SpyInstance;

// Each message is one accessible item whose parts are hidden from the accessibility tree, so text inside it is found with hidden elements included.
beforeAll(() => configure({ defaultIncludeHiddenElements: true }));
afterAll(() => configure({ defaultIncludeHiddenElements: false }));

beforeEach(() => {
  clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
  mockHold.mockClear();
  mockRelease.mockClear();
});

afterEach(() => {
  clearTestClients();
  clock.mockRestore();
});

const message = (n: number, who: "priya" | "you", body: string): Message => ({
  id: `01J0000000000000000000A00${n}`,
  memberRef: who === "you" ? "m-you" : `m-${who}`,
  firstName: who === "you" ? "Ananya" : "Priya",
  body,
  createdAt: `2026-11-07T10:3${n}:00.000Z`,
  isYou: who === "you",
});

const HELLO = message(1, "priya", "Hello everyone");
const MINE = message(2, "you", "By the fountain");

const open_ = (messages: Message[], thread: "open" | "read_only" = "open") => json(200, { messages, thread });

const routes = (over: Record<string, RouteReply | RouteReply[]> = {}): Record<string, RouteReply | RouteReply[]> => ({
  "GET /groups/g1": json(200, groupFixture()),
  "GET /groups/g1/messages": open_([HELLO, MINE]),
  ...over,
});

async function openThread(over: Record<string, RouteReply | RouteReply[]> = {}, focused = true) {
  const props = { onBack: jest.fn(), onReport: jest.fn(), onClosed: jest.fn() };
  const app = await createTestApp({ me: meFixture({ handle: { state: "approved" } }), welcomeSeen: true, routes: routes(over) });
  const ui = (isFocused: boolean) => (
    <AppProviders deps={app.deps}>
      <ThreadScreen groupId="g1" focused={isFocused} {...props} />
    </AppProviders>
  );
  const view = await render(ui(focused));
  return { ...app, ...props, rerender: (isFocused: boolean) => view.rerender(ui(isFocused)) };
}

const posts = (app: Awaited<ReturnType<typeof openThread>>) => app.transport.callsTo("POST /groups/g1/messages");
const bodyOf = (call: unknown) => JSON.parse((call as { body: string }).body) as { body: string; clientId: string };

describe("ThreadScreen", () => {
  it("reads sender, time and text as one item", async () => {
    await openThread();
    const item = await screen.findByLabelText("Priya, 4:01 PM: Hello everyone");
    expect(item).toBeOnTheScreen();
    expect(item.props.accessible).toBe(true);
    expect(screen.getByLabelText("You, 4:02 PM: By the fountain")).toBeOnTheScreen();
    expect(screen.getByTestId("thread-subtitle")).toHaveTextContent(/open until Sun 7:00 PM/);
  });

  it("shows only the opening time before 3 hours ahead, and reads no messages", async () => {
    clock.mockReturnValue(START - 4 * HOUR);
    const app = await openThread({ "GET /groups/g1": json(200, groupBeforeRevealFixture()) });
    expect(await screen.findByText(copy.waiting.title)).toBeOnTheScreen();
    expect(screen.getByText(copy.waiting.body("Sat 4:00 PM"))).toBeOnTheScreen();
    expect(screen.queryByTestId("thread-composer")).toBeNull();
    expect(app.transport.callsTo("GET /groups/g1/messages")).toHaveLength(0);
  });

  it("is read only after 24 hours, with no composer", async () => {
    clock.mockReturnValue(START + 25 * HOUR);
    await openThread({ "GET /groups/g1/messages": open_([HELLO], "read_only") });
    expect(await screen.findByText("Hello everyone")).toBeOnTheScreen();
    expect(screen.getByText(copy.readOnly)).toBeOnTheScreen();
    expect(screen.queryByTestId("thread-composer")).toBeNull();
    expect(screen.getByTestId("thread-subtitle")).toHaveTextContent(copy.subtitle.readOnly);
  });

  it("is closed once the server has no chat for the group", async () => {
    const app = await openThread({ "GET /groups/g1/messages": json(404, { error: "not_found" }) });
    expect(await screen.findByText(copy.closed.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(copy.closed.action));
    expect(app.onClosed).toHaveBeenCalledTimes(1);
  });

  it("stays readable, under a plain title, when the server has no group but still has the messages", async () => {
    const app = await openThread({ "GET /groups/g1": json(404, { error: "not_found" }) });
    expect(await screen.findByText("Hello everyone")).toBeOnTheScreen();
    expect(screen.queryByText(copy.closed.title)).toBeNull();
    expect(screen.getByTestId("thread-title")).toHaveTextContent(copy.fallbackTitle);
    expect(screen.getByTestId("thread-composer")).toBeOnTheScreen();
    expect(app.transport.callsTo("GET /groups/g1/messages")).toHaveLength(1);
  });

  it("does not turn a link into a link", async () => {
    await openThread({ "GET /groups/g1/messages": open_([message(1, "priya", "See https://example.com now")]) });
    const text = await screen.findByText("See https://example.com now");
    expect(text.props.onPress).toBeUndefined();
    expect(text.props.dataDetectorType).toBeUndefined();
    expect(screen.getByTestId("thread-input").props.dataDetectorTypes).toBe("none");
  });

  describe("sending", () => {
    it("sends what is typed with a client id, and shows it from the server after", async () => {
      const sent = message(3, "you", "Table by the window");
      const app = await openThread({
        "GET /groups/g1/messages": [open_([HELLO, MINE]), open_([HELLO, MINE, sent])],
        "POST /groups/g1/messages": json(201, sent),
      });
      await screen.findByText("Hello everyone");
      await fireEvent.changeText(screen.getByTestId("thread-input"), "  Table by the window ");
      await fireEvent.press(screen.getByTestId("thread-send"));
      await waitFor(() => expect(posts(app)).toHaveLength(1));
      const body = bodyOf(posts(app)[0]);
      expect(body.body).toBe("Table by the window");
      expect(body.clientId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(await screen.findByLabelText("You, 4:03 PM: Table by the window")).toBeOnTheScreen();
      expect(screen.getAllByText("Table by the window")).toHaveLength(1);
      expect(screen.getByTestId("thread-input").props.value).toBe("");
    });

    it("sends the quick chips as ordinary text", async () => {
      const app = await openThread({ "POST /groups/g1/messages": json(201, message(3, "you", copy.quick.late)) });
      await fireEvent.press(await screen.findByTestId(`thread-quick-${copy.quick.late}`));
      await waitFor(() => expect(posts(app)).toHaveLength(1));
      expect(bodyOf(posts(app)[0]).body).toBe("Running 10 min late");
    });

    it("does not send an empty message", async () => {
      const app = await openThread();
      await screen.findByText("Hello everyone");
      await fireEvent.changeText(screen.getByTestId("thread-input"), "   ");
      await fireEvent.press(screen.getByTestId("thread-send"));
      expect(posts(app)).toHaveLength(0);
    });

    it("saves a message with no signal, says so, and sends it when the phone is back online", async () => {
      const sent = message(3, "you", "Almost there");
      const app = await openThread({ "POST /groups/g1/messages": json(201, sent) });
      await screen.findByText("Hello everyone");
      await act(async () => app.deps.connectivity.report(false));
      await fireEvent.changeText(screen.getByTestId("thread-input"), "Almost there");
      await fireEvent.press(screen.getByTestId("thread-send"));
      expect(await screen.findByText(copy.status.queued)).toBeOnTheScreen();
      expect(screen.getByLabelText(new RegExp(`Almost there\\. ${copy.status.queued}`))).toBeOnTheScreen();
      expect(posts(app)).toHaveLength(0);
      await act(async () => app.deps.connectivity.report(true));
      await waitFor(() => expect(posts(app)).toHaveLength(1));
    });

    it("says a message the server refused for good did not go, with nothing to tap", async () => {
      const app = await openThread({ "POST /groups/g1/messages": json(403, { error: "forbidden" }) });
      await screen.findByText("Hello everyone");
      await fireEvent.changeText(screen.getByTestId("thread-input"), "Anyone near the door?");
      await fireEvent.press(screen.getByTestId("thread-send"));
      expect(await screen.findByText(copy.status.refused)).toBeOnTheScreen();
      const item = screen.getByLabelText(new RegExp(copy.status.refused));
      expect(item.props.accessibilityRole).toBe("text");
      expect(item.props.onPress).toBeUndefined();
      expect(screen.queryByText(copy.status.failed)).toBeNull();
      expect(posts(app)).toHaveLength(1);
    });

    it("says a message that did not go through did not go, and sends it again with the same client id", async () => {
      clock.mockRestore();
      jest.useFakeTimers({ now: OPEN });
      try {
        const sent = message(3, "you", "Anyone near the door?");
        const app = await openThread({ "POST /groups/g1/messages": json(500, { error: "server" }) });
        await screen.findByText("Hello everyone");
        await fireEvent.changeText(screen.getByTestId("thread-input"), "Anyone near the door?");
        await fireEvent.press(screen.getByTestId("thread-send"));
        // A busy server is tried three more times, with a wait between, before the message counts as not sent.
        await act(async () => jest.advanceTimersByTimeAsync(30_000));
        expect(await screen.findByText(copy.status.failed)).toBeOnTheScreen();
        const tries = posts(app).length;
        expect(tries).toBe(4);
        app.transport.set("POST /groups/g1/messages", json(201, sent));
        const failed = screen.getByLabelText(new RegExp(copy.status.failed));
        expect(failed.props.accessibilityRole).toBe("button");
        await fireEvent.press(failed);
        await waitFor(() => expect(posts(app)).toHaveLength(tries + 1));
        expect(bodyOf(posts(app)[tries]).clientId).toBe(bodyOf(posts(app)[0]).clientId);
        await waitFor(() => expect(screen.queryByText(copy.status.failed)).toBeNull());
      } finally {
        jest.useRealTimers();
        clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
      }
    });

    it("checks the message against the contract first, keeps the words, and says why", async () => {
      const app = await openThread();
      await screen.findByText("Hello everyone");
      await fireEvent.changeText(screen.getByTestId("thread-input"), "<b>hi</b>");
      await fireEvent.press(screen.getByTestId("thread-send"));
      expect(await screen.findByTestId("thread-invalid")).toHaveTextContent(copy.composer.invalid(MESSAGE_MAX_CHARS));
      expect(posts(app)).toHaveLength(0);
      expect(screen.getByTestId("thread-input").props.value).toBe("<b>hi</b>");
      expect(screen.getByTestId("thread-input").props.maxLength).toBe(MESSAGE_MAX_CHARS);
      await fireEvent.changeText(screen.getByTestId("thread-input"), "hi");
      expect(screen.queryByTestId("thread-invalid")).toBeNull();
    });

    it("hides the person's own entry once the list holds their message with the same text", async () => {
      clock.mockRestore();
      jest.useFakeTimers({ now: OPEN });
      try {
        const sent = { ...message(3, "you", "Table by the window"), createdAt: new Date(OPEN + 1000).toISOString() };
        await openThread({
          "GET /groups/g1/messages": [open_([HELLO, MINE]), open_([HELLO, MINE, sent])],
          // The answer to the send never arrives, so only the list can take the entry's place.
          "POST /groups/g1/messages": () => new Promise<never>(() => undefined),
        });
        await screen.findByText("Hello everyone");
        await fireEvent.changeText(screen.getByTestId("thread-input"), "Table by the window");
        await fireEvent.press(screen.getByTestId("thread-send"));
        expect(await screen.findByText(copy.status.sending)).toBeOnTheScreen();
        await act(async () => jest.advanceTimersByTimeAsync(POLL_EVERY_MS + 100));
        await waitFor(() => expect(screen.queryByText(copy.status.sending)).toBeNull());
        expect(screen.getAllByText("Table by the window")).toHaveLength(1);
      } finally {
        jest.useRealTimers();
        clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
      }
    });
  });

  describe("reporting", () => {
    it("offers Report on a long press of someone else's message", async () => {
      const app = await openThread();
      await fireEvent(await screen.findByTestId(`thread-item-${HELLO.id}`), "longPress");
      await fireEvent.press(await screen.findByTestId("thread-report"));
      expect(app.onReport).toHaveBeenCalledWith({ memberRef: "m-priya", messageId: HELLO.id });
    });

    it("offers nothing on a long press of the person's own message", async () => {
      await openThread();
      const mine = await screen.findByTestId(`thread-item-${MINE.id}`);
      expect(mine.props.onLongPress).toBeUndefined();
      expect(screen.getByTestId(`thread-item-${HELLO.id}`).props.accessibilityActions).toEqual([
        { name: "report", label: copy.report.action },
      ]);
    });
  });

  describe("while in front", () => {
    it("holds this group's push notices, and lets them go when it is not in front", async () => {
      const app = await openThread();
      await screen.findByText("Hello everyone");
      expect(mockHold).toHaveBeenCalledWith("g1");
      await app.rerender(false);
      expect(mockRelease).toHaveBeenCalled();
    });

    it("reads the chat again every 5 seconds, and only from the last message it has", async () => {
      clock.mockRestore();
      jest.useFakeTimers({ now: OPEN });
      try {
        const app = await openThread({ "GET /groups/g1/messages": [open_([HELLO]), open_([HELLO, MINE])] });
        await screen.findByText("Hello everyone");
        expect(app.transport.callsTo("GET /groups/g1/messages")).toHaveLength(1);
        await act(async () => jest.advanceTimersByTimeAsync(POLL_EVERY_MS + 100));
        expect(await screen.findByText("By the fountain")).toBeOnTheScreen();
        const polls = app.transport.callsTo("GET /groups/g1/messages") as unknown as { url: string }[];
        expect(polls).toHaveLength(2);
        expect(polls[1]?.url).toContain(`after=${HELLO.id}`);
      } finally {
        jest.useRealTimers();
        clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
      }
    });

    it("keeps what it has, read only, when the server stops having the chat", async () => {
      clock.mockRestore();
      jest.useFakeTimers({ now: OPEN });
      try {
        const app = await openThread({ "GET /groups/g1/messages": [open_([HELLO]), json(404, { error: "not_found" })] });
        await screen.findByText("Hello everyone");
        await act(async () => jest.advanceTimersByTimeAsync(POLL_EVERY_MS + 100));
        await waitFor(() => expect(screen.queryByTestId("thread-composer")).toBeNull());
        expect(screen.getByText("Hello everyone")).toBeOnTheScreen();
        expect(screen.getByText(copy.readOnly)).toBeOnTheScreen();
        await act(async () => jest.advanceTimersByTimeAsync(POLL_EVERY_MS * 3));
        expect(app.transport.callsTo("GET /groups/g1/messages")).toHaveLength(2);
      } finally {
        jest.useRealTimers();
        clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
      }
    });

    it("keeps the messages it holds, read only, when the server has neither the group nor the chat any more", async () => {
      clock.mockRestore();
      jest.useFakeTimers({ now: OPEN });
      try {
        await openThread({
          "GET /groups/g1": json(404, { error: "not_found" }),
          "GET /groups/g1/messages": [open_([HELLO]), json(404, { error: "not_found" })],
        });
        await screen.findByText("Hello everyone");
        await act(async () => jest.advanceTimersByTimeAsync(POLL_EVERY_MS + 100));
        await waitFor(() => expect(screen.queryByTestId("thread-composer")).toBeNull());
        expect(screen.getByText("Hello everyone")).toBeOnTheScreen();
        expect(screen.getByText(copy.readOnly)).toBeOnTheScreen();
        expect(screen.queryByText(copy.closed.title)).toBeNull();
      } finally {
        jest.useRealTimers();
        clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
      }
    });

    it("stops reading while it is not in front", async () => {
      clock.mockRestore();
      jest.useFakeTimers({ now: OPEN });
      try {
        const app = await openThread({}, false);
        await screen.findByText("Hello everyone");
        await act(async () => jest.advanceTimersByTimeAsync(POLL_EVERY_MS * 3));
        expect(app.transport.callsTo("GET /groups/g1/messages")).toHaveLength(1);
        expect(mockHold).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
      }
    });
  });
});
