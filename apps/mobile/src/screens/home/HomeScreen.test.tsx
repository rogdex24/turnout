import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { MeResponse } from "@turnout/contract/app/me";
import { queryKeys } from "@/api/keys";
import { areasBody, eventPage, SHOWS } from "@/api/showFixtures";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { common } from "@/copy/common";
import { home } from "@/copy/home";
import { plans } from "@/copy/plans";
import { profileCheck } from "@/copy/profileCheck";
import { PLANS } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { HomeScreen } from "./HomeScreen";

// FlashList marks itself loaded from a timer after the first layout. Let that timer run inside act so the update is not stray.
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

afterEach(async () => {
  await settle();
  clearTestClients();
});

async function open(routes: Record<string, RouteReply | RouteReply[]> = {}, me: MeResponse = meFixture({ handle: { state: "approved" } })) {
  const onOpenShow = jest.fn();
  const onChangeHandle = jest.fn();
  const onOpenPlan = jest.fn();
  const app = await createTestApp({
    me,
    welcomeSeen: true,
    routes: {
      "GET /api/events": json(200, eventPage(SHOWS)),
      "GET /tools/list_areas": json(200, areasBody()),
      "GET /plans": json(200, { plans: [] }),
      ...routes,
    },
  });
  app.queryClient.setQueryData(queryKeys.me(), me);
  await render(
    <AppProviders deps={app.deps}>
      <HomeScreen onOpenShow={onOpenShow} onOpenPlan={onOpenPlan} onChangeHandle={onChangeHandle} />
    </AppProviders>,
  );
  await settle();
  return { ...app, onOpenShow, onOpenPlan, onChangeHandle };
}

const eventCalls = (app: { transport: { callsTo: (key: string) => { url: string }[] } }) =>
  app.transport.callsTo("GET /api/events").map((call) => new URL(call.url).searchParams);

describe("HomeScreen", () => {
  it("shows the skeleton while the list loads, then the shows by day", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await open({
      "GET /api/events": async () => {
        await held;
        return json(200, eventPage(SHOWS));
      },
    });
    expect(screen.getByTestId("home-loading")).toBeOnTheScreen();
    await act(async () => release());
    expect(await screen.findByTestId("show-card-monsoon-theory")).toBeOnTheScreen();
    expect(screen.queryByTestId("home-loading")).toBeNull();
    expect(screen.getByText(home.title)).toBeOnTheScreen();
    expect(screen.getByTestId("show-card-biryani-wars")).toBeOnTheScreen();
  });

  it("asks the catalogue for group-eligible shows and sends no token", async () => {
    const app = await open();
    await screen.findByTestId("show-card-monsoon-theory");
    const [params] = eventCalls(app);
    expect(params?.get("group_eligible")).toBe("1");
    const call = app.transport.callsTo("GET /api/events")[0] as unknown as { headers: Record<string, string> };
    expect(call.headers.authorization).toBeUndefined();
  });

  it("never puts a count of people on a card", async () => {
    await open();
    const card = await screen.findByTestId("show-card-monsoon-theory");
    expect(card.props.accessibilityLabel).not.toMatch(/looking|going|interested|people/i);
  });

  it("lists the areas that have shows and hides the empty ones", async () => {
    await open();
    expect(await screen.findByTestId("area-all")).toBeOnTheScreen();
    expect(screen.getByTestId("area-hitec-city")).toBeOnTheScreen();
    expect(screen.getByTestId("area-banjara-hills")).toBeOnTheScreen();
    expect(screen.queryByTestId("area-gachibowli")).toBeNull();
  });

  it("picking an area asks for that area, and All areas goes back", async () => {
    const app = await open();
    await screen.findByTestId("show-card-monsoon-theory");
    await fireEvent.press(screen.getByTestId("area-banjara-hills"));
    await waitFor(() => expect(eventCalls(app).some((p) => p.get("area") === "banjara-hills")).toBe(true));
    await fireEvent.press(screen.getByTestId("area-all"));
    await waitFor(() => expect(eventCalls(app).filter((p) => !p.has("area")).length).toBeGreaterThan(0));
  });

  it("opens a show with its public id", async () => {
    const { onOpenShow } = await open();
    await fireEvent.press(await screen.findByTestId("show-card-telugu-standup"));
    expect(onOpenShow).toHaveBeenCalledWith("telugu-standup");
  });

  it("says so when there are no shows, with a way back to every area when one is chosen", async () => {
    await open({ "GET /api/events": json(200, eventPage([])) });
    expect(await screen.findByText(home.empty.title)).toBeOnTheScreen();
    expect(screen.getByText(home.empty.body)).toBeOnTheScreen();
    expect(screen.queryByText(home.empty.allAreas)).toBeNull();
  });

  it("offers Show all areas when an area has nothing", async () => {
    await open({ "GET /api/events": [json(200, eventPage(SHOWS)), json(200, eventPage([]))] });
    await screen.findByTestId("show-card-monsoon-theory");
    await fireEvent.press(screen.getByTestId("area-hitec-city"));
    expect(await screen.findByText(home.empty.areaBody)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(home.empty.allAreas));
    expect(await screen.findByTestId("show-card-monsoon-theory")).toBeOnTheScreen();
  });

  it("shows a plain error with Try again, and the retry loads the list", async () => {
    const app = await open({ "GET /api/events": json(400, { error: "bad" }) });
    app.queryClient.setQueryDefaults(queryKeys.showsList(null), { retry: false });
    await act(() => app.queryClient.invalidateQueries({ queryKey: queryKeys.showsList(null) }));
    expect(await screen.findByText(common.errorGeneric)).toBeOnTheScreen();
    app.transport.set("GET /api/events", json(200, eventPage(SHOWS)));
    await fireEvent.press(screen.getByText(common.retry));
    expect(await screen.findByTestId("show-card-monsoon-theory")).toBeOnTheScreen();
  });

  it("follows the cursor when the list reaches its end", async () => {
    const app = await open({
      "GET /api/events": [json(200, eventPage(SHOWS.slice(0, 2), "c2")), json(200, eventPage(SHOWS.slice(2), null))],
    });
    await screen.findByTestId("show-card-monsoon-theory");
    await waitFor(() => expect(eventCalls(app).some((p) => p.get("cursor") === "c2")).toBe(true));
  });

  it("reads the offline bar from the connection", async () => {
    const app = await open();
    await screen.findByTestId("show-card-monsoon-theory");
    expect(screen.queryByText(common.offlineBar)).toBeNull();
    await act(async () => app.deps.connectivity.report(false));
    expect(screen.getByText(common.offlineBar)).toBeOnTheScreen();
  });

  describe("the handle check strip", () => {
    it("shows nothing for an approved handle", async () => {
      await open();
      await screen.findByTestId("show-card-monsoon-theory");
      expect(screen.queryByTestId("profile-check-strip")).toBeNull();
    });

    it("says the handle is being checked while it is pending", async () => {
      await open({}, meFixture({ handle: { state: "pending" } }));
      expect(await screen.findByText(profileCheck.pending)).toBeOnTheScreen();
    });

    it("gives the reason a handle was turned down and opens the profile to change it", async () => {
      const { onChangeHandle } = await open({}, meFixture({ handle: { state: "rejected", rejectReason: "not_a_person" } }));
      expect(await screen.findByText(profileCheck.rejected.not_a_person)).toBeOnTheScreen();
      await fireEvent.press(screen.getByText(profileCheck.change));
      expect(onChangeHandle).toHaveBeenCalledTimes(1);
    });

    it("does not block the list", async () => {
      await open({}, meFixture({ handle: { state: "rejected", rejectReason: null } }));
      expect(await screen.findByTestId("show-card-monsoon-theory")).toBeOnTheScreen();
      expect(screen.getByText(profileCheck.rejected.unknown)).toBeOnTheScreen();
    });
  });

  describe("plan bar", () => {
    // The bar reads the plans, which are asked for only in a build with groups on.
    beforeEach(() => {
      process.env.EXPO_PUBLIC_GROUPS_ENABLED = "1";
    });
    afterEach(() => {
      delete process.env.EXPO_PUBLIC_GROUPS_ENABLED;
    });

    it("has no bar when there is no plan that can move", async () => {
      await open({ "GET /plans": json(200, { plans: [PLANS.withdrawn, PLANS.done] }) });
      await screen.findByTestId("show-card-monsoon-theory");
      expect(screen.queryByTestId("plan-bar")).toBeNull();
    });

    it("docks the active plan and opens it on tap", async () => {
      const app = await open({ "GET /plans": json(200, { plans: [PLANS.finding_group] }) });
      const bar = await screen.findByTestId("plan-bar");
      expect(bar).toHaveAccessibleName(home.planBar.label("The Monsoon Theory", "Fri 8:00 PM", plans.status.finding_group));
      await fireEvent.press(bar);
      expect(app.onOpenPlan).toHaveBeenCalledWith(PLANS.finding_group.id);
    });

    it("puts a plan that needs the person ahead of one that is only waiting", async () => {
      await open({ "GET /plans": json(200, { plans: [PLANS.finding_group, PLANS.needs_ticket] }) });
      expect(await screen.findByText(plans.status.needs_ticket)).toBeOnTheScreen();
    });
  });
});
