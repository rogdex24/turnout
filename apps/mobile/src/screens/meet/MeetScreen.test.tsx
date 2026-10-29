import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import {
  doneGroupFixture,
  groupBeforeRevealFixture,
  groupFixture,
  MEET_AT,
  MEET_CONTEXT,
  MEMBERS,
  planFixture,
  SHOW_STARTS_AT,
} from "@/api/groupFixtures";
import { nativeLocation } from "@/api/locationNative";
import { showDetailFixture } from "@/api/showFixtures";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { after } from "@/copy/after";
import { meet as copy } from "@/copy/meet";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { moments } from "@/ui/moments";
import { MeetScreen } from "./MeetScreen";

const OPEN = Date.parse(SHOW_STARTS_AT) - 80 * 60_000;
const EARLY = Date.parse(MEET_AT) - 48 * 60_000;

let openURL: jest.SpyInstance;
let clock: jest.SpyInstance;
let imHere: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  clock = jest.spyOn(Date, "now").mockReturnValue(OPEN);
  imHere = jest.spyOn(moments, "imHere").mockImplementation(() => undefined);
});

afterEach(() => {
  clearTestClients();
  openURL.mockRestore();
  clock.mockRestore();
  imHere.mockRestore();
});

const venueShow = showDetailFixture({
  venue: {
    name: "Shilpa Kala Vedika",
    area: "madhapur",
    lat: MEET_CONTEXT.venue.point?.lat ?? null,
    lng: MEET_CONTEXT.venue.point?.lng ?? null,
  },
});

const routes = (over: Record<string, RouteReply | RouteReply[]> = {}): Record<string, RouteReply | RouteReply[]> => ({
  "GET /groups/g1": json(200, groupFixture()),
  "GET /plans": json(200, { plans: [planFixture()] }),
  "GET /api/events/traffic-jam-tales": json(200, venueShow),
  "POST /groups/g1/checkin": json(200, { checkedIn: true }),
  ...over,
});

async function open(over: Record<string, RouteReply | RouteReply[]> = {}) {
  const props = {
    onBack: jest.fn(),
    onOpenShow: jest.fn(),
    onLeave: jest.fn(),
    onOpenThread: jest.fn(),
    onReport: jest.fn(),
    onClosed: jest.fn(),
    onOpenAfter: jest.fn(),
  };
  const app = await createTestApp({ me: meFixture({ handle: { state: "approved" } }), welcomeSeen: true, routes: routes(over) });
  await render(
    <AppProviders deps={app.deps}>
      <MeetScreen groupId="g1" focused {...props} />
    </AppProviders>,
  );
  return { ...app, ...props };
}

describe("MeetScreen", () => {
  it("shows the meet time, the cafe, the pins and the group", async () => {
    await open();
    expect(await screen.findByText("Cafe Niloufer")).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Meet at 6:00 PM/)).toBeOnTheScreen();
    expect(screen.getByTestId("meet-map")).toBeOnTheScreen();
    expect(screen.getByText("Priya")).toBeOnTheScreen();
    expect(screen.getByText(copy.group.you)).toBeOnTheScreen();
  });

  it("names members by first name only", async () => {
    await open({ "GET /groups/g1": json(200, groupFixture({ members: MEMBERS })) });
    await screen.findByText("Cafe Niloufer");
    for (const member of MEMBERS.filter((entry) => !entry.isYou)) {
      expect(screen.getByText(member.firstName)).toBeOnTheScreen();
    }
    expect(screen.queryByText(/@|handle/i)).toBeNull();
  });

  it("waits for the reveal and shows when the card opens", async () => {
    await open({ "GET /groups/g1": json(200, groupBeforeRevealFixture()) });
    expect(await screen.findByText(copy.waiting.title)).toBeOnTheScreen();
    expect(screen.queryByTestId("meet-here")).toBeNull();
  });

  it("says the card has closed when the group is gone (404)", async () => {
    const { onClosed } = await open({ "GET /groups/g1": json(404, { error: "not_found" }) });
    expect(await screen.findByText(copy.closed.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(copy.closed.action));
    expect(onClosed).toHaveBeenCalled();
  });

  it("closes the card a day after the show", async () => {
    clock.mockReturnValue(Date.parse(SHOW_STARTS_AT) + 25 * 3_600_000);
    await open();
    expect(await screen.findByText(copy.closed.title)).toBeOnTheScreen();
  });

  it("leads the closed card to the after-the-show screen once the group is done", async () => {
    clock.mockReturnValue(Date.parse(SHOW_STARTS_AT) + 25 * 3_600_000);
    const { onOpenAfter } = await open({ "GET /groups/g1": json(200, doneGroupFixture()) });
    await fireEvent.press(await screen.findByText(after.open));
    expect(onOpenAfter).toHaveBeenCalled();
  });

  describe("I'm here", () => {
    it("is off before check-in opens and says when it will", async () => {
      clock.mockReturnValue(EARLY);
      await open();
      await screen.findByText("Cafe Niloufer");
      expect(screen.getByTestId("meet-here").props.accessibilityState.disabled).toBe(true);
      expect(screen.getByTestId("meet-here-hint")).toHaveTextContent(/5:30 PM/);
    });

    it("checks in with an empty body, plays the moment and marks the person here", async () => {
      const checkedIn = groupFixture({ members: MEMBERS.map((member) => (member.isYou ? { ...member, checkedIn: true } : member)) });
      const app = await open({ "GET /groups/g1": [json(200, groupFixture()), json(200, checkedIn)] });
      await fireEvent.press(await screen.findByTestId("meet-here"));
      expect(imHere).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(app.transport.callsTo("POST /groups/g1/checkin")).toHaveLength(1));
      const [call] = app.transport.callsTo("POST /groups/g1/checkin") as unknown as { body: string }[];
      expect(JSON.parse(call?.body ?? "")).toEqual({});
      expect(await screen.findByText(copy.here.done)).toBeOnTheScreen();
    });

    it("saves the check-in with no signal and sends it when the phone is back online", async () => {
      const app = await open();
      await screen.findByTestId("meet-here");
      await act(async () => app.deps.connectivity.report(false));
      await fireEvent.press(screen.getByTestId("meet-here"));
      expect(imHere).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(copy.here.queued)).toBeOnTheScreen();
      expect(app.transport.callsTo("POST /groups/g1/checkin")).toHaveLength(0);
      await act(async () => app.deps.connectivity.report(true));
      await waitFor(() => expect(app.transport.callsTo("POST /groups/g1/checkin")).toHaveLength(1));
    });

    it("goes back to not checked in, with a way to try again, when the server turns it down", async () => {
      await open({ "POST /groups/g1/checkin": json(409, { error: "conflict" }) });
      await fireEvent.press(await screen.findByTestId("meet-here"));
      expect(await screen.findByText(copy.here.failed)).toBeOnTheScreen();
      expect(screen.getByTestId("meet-here").props.accessibilityState.disabled).not.toBe(true);
    });
  });

  describe("location", () => {
    it("does not ask on its own and offers the line to turn it on", async () => {
      const request = jest.spyOn(nativeLocation, "requestPermission");
      await open();
      expect(await screen.findByText(copy.location.ask)).toBeOnTheScreen();
      expect(request).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByTestId("meet-location-action"));
      expect(request).toHaveBeenCalledTimes(1);
      request.mockRestore();
    });

    it("points to Settings when the system will not ask again", async () => {
      const permission = jest.spyOn(nativeLocation, "permission").mockResolvedValue({ status: "denied", canAskAgain: false });
      await open();
      expect(await screen.findByText(copy.location.settingsLead)).toBeOnTheScreen();
      permission.mockRestore();
    });

    it("shows the walk to the cafe from a position that stays on the phone", async () => {
      const permission = jest.spyOn(nativeLocation, "permission").mockResolvedValue({ status: "granted", canAskAgain: true });
      const watch = jest.spyOn(nativeLocation, "watch").mockImplementation(async (onPoint) => {
        onPoint({ lat: 17.4435, lng: 78.3772 });
        return () => undefined;
      });
      await open();
      expect(await screen.findByText(copy.location.atCafe)).toBeOnTheScreen();
      permission.mockRestore();
      watch.mockRestore();
    });

    it("is not sent anywhere: no request carries a coordinate", async () => {
      const app = await open();
      await fireEvent.press(await screen.findByTestId("meet-here"));
      await waitFor(() => expect(app.transport.callsTo("POST /groups/g1/checkin")).toHaveLength(1));
      const bodies = app.transport.calls.map((call) => String((call as { body?: unknown }).body ?? ""));
      expect(bodies.join(" ")).not.toMatch(/lat|lng|latitude|longitude/);
    });

    it("has no location line once the show has started", async () => {
      clock.mockReturnValue(Date.parse(SHOW_STARTS_AT) + 10 * 60_000);
      await open();
      await screen.findByText("Cafe Niloufer");
      expect(screen.queryByTestId("meet-location")).toBeNull();
    });
  });

  it("opens the cafe in the maps app", async () => {
    await open();
    await fireEvent.press(await screen.findByTestId("meet-open-maps"));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/^geo:17\.4435,78\.3772\?q=/));
  });

  it("opens the show from the show row", async () => {
    const { onOpenShow } = await open();
    await waitFor(() => expect(screen.getByTestId("meet-show").props.accessibilityRole).toBe("button"));
    await fireEvent.press(screen.getByTestId("meet-show"));
    expect(onOpenShow).toHaveBeenCalledWith("traffic-jam-tales");
  });

  it("opens the group chat", async () => {
    const { onOpenThread } = await open();
    await fireEvent.press(await screen.findByTestId("meet-thread"));
    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  describe("Safety", () => {
    it("calls 112 first", async () => {
      await open();
      await fireEvent.press(await screen.findByTestId("meet-safety"));
      await fireEvent.press(screen.getByTestId("safety-call"));
      expect(openURL).toHaveBeenCalledWith("tel:112");
    });

    it("reports through the report form", async () => {
      const { onReport } = await open();
      await fireEvent.press(await screen.findByTestId("meet-safety"));
      await fireEvent.press(screen.getByTestId("safety-report"));
      expect(onReport).toHaveBeenCalledTimes(1);
    });

    it("leaves the plan through the plan's own screen", async () => {
      const { onLeave } = await open();
      await screen.findByText("Cafe Niloufer");
      await waitFor(() => expect(screen.getByTestId("meet-show").props.accessibilityRole).toBe("button"));
      await fireEvent.press(screen.getByTestId("meet-safety"));
      await fireEvent.press(screen.getByTestId("safety-leave"));
      expect(onLeave).toHaveBeenCalledWith("plan-1");
    });
  });
});
