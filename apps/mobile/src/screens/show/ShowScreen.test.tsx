import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { queryKeys } from "@/api/keys";
import { showDetailFixture } from "@/api/showFixtures";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { common } from "@/copy/common";
import { show as copy } from "@/copy/show";
import { memberShowFixture } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { ShowScreen } from "./ShowScreen";

const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({ telemetry: () => ({ start: () => undefined, setConsent: () => undefined, track: mockTrack }) }));

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  clearTestClients();
  openURL.mockRestore();
  mockTrack.mockClear();
  delete process.env.EXPO_PUBLIC_GROUPS_ENABLED;
});

async function open(routes: Record<string, RouteReply | RouteReply[]> = {}, publicId = "monsoon-theory") {
  const onBack = jest.fn();
  const onSeeShows = jest.fn();
  const onGo = jest.fn();
  const app = await createTestApp({
    me: meFixture({ handle: { state: "approved" } }),
    welcomeSeen: true,
    routes: { [`GET /api/events/${publicId}`]: json(200, showDetailFixture()), ...routes },
  });
  await render(
    <AppProviders deps={app.deps}>
      <ShowScreen publicId={publicId} onBack={onBack} onSeeShows={onSeeShows} onGo={onGo} />
    </AppProviders>,
  );
  return { ...app, onBack, onSeeShows, onGo, publicId };
}

describe("ShowScreen", () => {
  it("loads the show by its public id with no token, and shows it", async () => {
    const app = await open();
    expect(await screen.findByTestId("show-ticket")).toBeOnTheScreen();
    expect(screen.getByText("Phoenix Arena")).toBeOnTheScreen();
    const [call] = app.transport.callsTo("GET /api/events/monsoon-theory") as unknown as { headers: Record<string, string> }[];
    expect(call?.headers.authorization).toBeUndefined();
  });

  it("shows a placeholder first", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await open({
      "GET /api/events/monsoon-theory": async () => {
        await held;
        return json(200, showDetailFixture());
      },
    });
    expect(screen.getByTestId("show-loading")).toBeOnTheScreen();
    await act(async () => release());
    expect(await screen.findByTestId("show-ticket")).toBeOnTheScreen();
  });

  it("hands the ticket and the listing to the browser", async () => {
    await open();
    await fireEvent.press(await screen.findByTestId("show-buy"));
    expect(openURL).toHaveBeenLastCalledWith("https://example.com/tickets/monsoon-theory");
    await fireEvent.press(screen.getByTestId("show-source"));
    expect(openURL).toHaveBeenLastCalledWith("https://example.com/source/monsoon-theory");
  });

  it("does not hand anything but a web address to the browser", async () => {
    await open({
      "GET /api/events/monsoon-theory": json(200, showDetailFixture({ source: { name: "BookMyShow", url: "tel:+910000000100" } })),
    });
    await screen.findByTestId("show-ticket");
    expect(screen.queryByTestId("show-source")).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("does not crash when the browser cannot open the link", async () => {
    openURL.mockRejectedValue(new Error("no browser"));
    await open();
    await fireEvent.press(await screen.findByTestId("show-buy"));
    expect(screen.getByTestId("show")).toBeOnTheScreen();
  });

  it("leaves out the looking count when groups are off, and does not ask the plans server", async () => {
    const app = await open();
    await screen.findByTestId("show-ticket");
    expect(screen.queryByTestId("show-looking")).toBeNull();
    expect(app.transport.callsTo("GET /shows/monsoon-theory")).toHaveLength(0);
  });

  it("shows how many people are looking for a group when groups are on", async () => {
    process.env.EXPO_PUBLIC_GROUPS_ENABLED = "1";
    await open({ "GET /shows/monsoon-theory": json(200, memberShowFixture({ lookingCount: 7 })) });
    expect(await screen.findByTestId("show-looking")).toBeOnTheScreen();
    expect(screen.getByText("7")).toBeOnTheScreen();
  });

  it("leaves the line out when the plans server cannot answer", async () => {
    process.env.EXPO_PUBLIC_GROUPS_ENABLED = "1";
    await open({ "GET /shows/monsoon-theory": json(500, { error: { code: "server_error", message: "Down." } }) });
    await screen.findByTestId("show-ticket");
    expect(screen.queryByTestId("show-looking")).toBeNull();
  });

  it("opens Coming soon from Go with a group when groups are not switched on", async () => {
    const { onGo } = await open();
    await fireEvent.press(await screen.findByTestId("show-go"));
    expect(screen.getByText(copy.comingSoon.title)).toBeOnTheScreen();
    expect(onGo).not.toHaveBeenCalled();
  });

  it("goes to the group flow when the flag is on", async () => {
    process.env.EXPO_PUBLIC_GROUPS_ENABLED = "1";
    const { onGo } = await open();
    await fireEvent.press(await screen.findByTestId("show-go"));
    expect(onGo).toHaveBeenCalledWith("monsoon-theory");
  });

  it("counts the funnel: the show once it is on screen, Buy, and Go with the flag", async () => {
    await open();
    await screen.findByTestId("show-ticket");
    expect(mockTrack).toHaveBeenCalledWith("show_viewed", { show_id: "monsoon-theory" });
    await fireEvent.press(screen.getByTestId("show-buy"));
    expect(mockTrack).toHaveBeenCalledWith("buy_tapped", { show_id: "monsoon-theory" });
    await fireEvent.press(screen.getByTestId("show-go"));
    expect(mockTrack).toHaveBeenCalledWith("go_tapped", { show_id: "monsoon-theory", groups_enabled: false });
    expect(mockTrack.mock.calls.filter(([name]) => name === "show_viewed")).toHaveLength(1);
  });

  it("does not count a view for a show that did not load", async () => {
    await open({ "GET /api/events/monsoon-theory": json(404, { error: "not_found" }) });
    expect(await screen.findByText(copy.notFound.title)).toBeOnTheScreen();
    expect(mockTrack).not.toHaveBeenCalledWith("show_viewed", expect.anything());
  });

  it("disables Go with a group for a show that is not eligible", async () => {
    await open({ "GET /api/events/monsoon-theory": json(200, showDetailFixture({ group_eligible: false })) });
    await screen.findByTestId("show-ticket");
    expect(screen.getByTestId("show-go").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(copy.goOff.notEligible)).toBeOnTheScreen();
  });

  it("says so when the show is gone (404) and sends the person to the shows", async () => {
    const { onSeeShows } = await open({ "GET /api/events/monsoon-theory": json(404, { error: "not_found" }) });
    expect(await screen.findByText(copy.notFound.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(copy.notFound.action));
    expect(onSeeShows).toHaveBeenCalled();
  });

  it("shows a plain error with Try again for another failure, and the retry loads the show", async () => {
    const app = await open({ "GET /api/events/monsoon-theory": json(400, { error: "bad" }) });
    app.queryClient.setQueryDefaults(queryKeys.showDetail(app.publicId), { retry: false });
    await act(() => app.queryClient.invalidateQueries({ queryKey: queryKeys.showDetail(app.publicId) }));
    expect(await screen.findByText(common.errorGeneric)).toBeOnTheScreen();
    app.transport.set("GET /api/events/monsoon-theory", json(200, showDetailFixture()));
    await fireEvent.press(screen.getByText(common.retry));
    expect(await screen.findByTestId("show-ticket")).toBeOnTheScreen();
  });

  it("goes back from the back button", async () => {
    const { onBack } = await open();
    await fireEvent.press(await screen.findByTestId("back"));
    expect(onBack).toHaveBeenCalled();
  });
});
