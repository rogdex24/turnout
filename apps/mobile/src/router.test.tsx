import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import type { RawResponse } from "@/api/client";
import { areasBody, eventPage, SHOWS, showDetailFixture } from "@/api/showFixtures";
import { json } from "@/api/testing";
import { common } from "@/copy/common";
import { you } from "@/copy/you";
import { PLANS } from "@/model/planFixtures";
import { releaseSplash } from "@/providers/splash";
import { createTestApp, meFixture, type TestApp, type TestAppOptions } from "@/providers/testing";
import { SAMPLE_CONFIG } from "@/screens/notice/fixtures";

// Skip the native splash and the real stores: MMKV does not load in Jest, so boot hands back in-memory parts.
jest.mock("@/providers/splash", () => ({ holdSplash: jest.fn(), releaseSplash: jest.fn() }));
// The first launch loads every route module cold, which takes most of the default 5 seconds on a busy machine.
jest.setTimeout(20_000);
let mockApp: TestApp;
jest.mock("@/providers/boot", () => ({ bootApp: () => Promise.resolve(mockApp.deps) }));
// Each render of the start error is counted, so a test can show it never flashed, not only that it is gone at the end.
let mockStartFailedRenders = 0;
jest.mock("@/screens/boot/StartFailed", () => {
  const actual = jest.requireActual<typeof import("@/screens/boot/StartFailed")>("@/screens/boot/StartFailed");
  return {
    StartFailed: (props: Parameters<typeof actual.StartFailed>[0]) => {
      mockStartFailedRenders += 1;
      return actual.StartFailed(props);
    },
  };
});

async function launch(options: TestAppOptions, initialUrl = "/") {
  // The tab bar, Home and push set-up read the config and the plans; an unscripted route reads as a dead network.
  const routes = { "GET /config": json(200, SAMPLE_CONFIG), "GET /plans": json(200, { plans: [] }), ...options.routes };
  mockApp = await createTestApp({ ...options, routes });
  await renderRouter("./src/app", { initialUrl });
}

const on = (testID: string) => waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen());
const SCREENS = ["welcome", "notice", "sign-in", "profile", "home", "show", "plans", "plan", "you", "start-failed"];
/** Only this screen is on show: no other step's screen sits under it or flashed before it. */
const onlyOpen = (open?: string) => {
  for (const id of SCREENS) if (id !== open) expect(screen.queryByTestId(id)).not.toBeOnTheScreen();
};

describe("signed out", () => {
  // The first render loads every route's screen, so it is the one test that pays for a cold transform of the app.
  test("a new phone starts at welcome", async () => {
    await launch({});
    await on("welcome");
    expect(screen).toHavePathname("/welcome");
  }, 30_000);

  test("Skip on welcome is remembered and opens the notice", async () => {
    await launch({});
    await on("welcome");
    await fireEvent.press(screen.getByTestId("welcome-skip"));
    await on("notice");
    expect(mockApp.deps.localFlags.getSnapshot().welcomeSeen).toBe(true);
  });

  test("after welcome comes the notice, before any phone screen", async () => {
    await launch({ welcomeSeen: true });
    await on("notice");
    expect(screen).toHavePathname("/notice");
  });

  test("after the notice comes the phone screen", async () => {
    await launch({ welcomeSeen: true, acceptedNotice: NOTICE_VERSION });
    await on("sign-in");
  });

  test("the code screen opens over the phone screen and system back returns to it", async () => {
    await launch({
      welcomeSeen: true,
      acceptedNotice: NOTICE_VERSION,
      routes: {
        "POST /auth/otp": json(200, { challengeId: "c-1", expiresAt: "2026-10-28T10:10:00.000Z" }),
        "GET /auth/otp/c-1": json(200, { deliveryStatus: "sent" }),
      },
    });
    await on("sign-in");
    await fireEvent.changeText(screen.getByTestId("phone-input"), ["98", "765", "43210"].join(""));
    await fireEvent.press(screen.getByTestId("send-code"));
    await on("code");
    expect(screen).toHavePathname("/code");
    await act(() => router.back());
    await on("sign-in");
    expect(screen).toHavePathname("/sign-in");
  });

  test("a cold start on the code screen goes to the phone screen", async () => {
    await launch({ welcomeSeen: true, acceptedNotice: NOTICE_VERSION }, "/code");
    await on("sign-in");
  });

  test("a notice version this phone has not stored asks again", async () => {
    await launch({ welcomeSeen: true, acceptedNotice: "2000-01-01" });
    await on("notice");
  });

  test("a link into the app lands on the first open screen", async () => {
    await launch({}, "/plans");
    await on("welcome");
    onlyOpen("welcome");
  });
});

describe("signed in", () => {
  test("a current consent is missing: the notice", async () => {
    await launch({ me: meFixture({ consent: false }) });
    await on("notice");
  });

  test("a profile that is not complete: the profile screen", async () => {
    await launch({ me: meFixture({ profile: { photo: null } }) });
    await on("profile");
  });

  test("a ready account lands on Home at the root", async () => {
    await launch({ me: meFixture() });
    await on("home");
    expect(screen).toHavePathname("/");
  });

  test("a Home card opens the show and system back returns to Home", async () => {
    await launch({
      me: meFixture(),
      routes: {
        "GET /api/events": json(200, eventPage(SHOWS)),
        "GET /tools/list_areas": json(200, areasBody()),
        "GET /api/events/monsoon-theory": json(200, showDetailFixture()),
      },
    });
    await on("home");
    await fireEvent.press(await screen.findByTestId("show-card-monsoon-theory"));
    await on("show");
    expect(screen).toHavePathname("/show/monsoon-theory");
    expect(await screen.findByTestId("show-ticket")).toBeOnTheScreen();
    await act(() => router.back());
    await on("home");
    expect(screen).toHavePathname("/");
    expect(screen.queryByTestId("show")).not.toBeOnTheScreen();
  });

  test("a show link that is opened cold shows the show, and back goes Home", async () => {
    await launch({ me: meFixture(), routes: { "GET /api/events/monsoon-theory": json(200, showDetailFixture()) } }, "/show/monsoon-theory");
    await on("show");
    expect(await screen.findByTestId("show-ticket")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("back"));
    await on("home");
    expect(screen).toHavePathname("/");
  });

  test("the three tabs open", async () => {
    await launch({ me: meFixture() });
    await on("home");
    await act(() => router.navigate("/plans"));
    await on("plans");
    await act(() => router.navigate("/you"));
    await on("you");
  });

  test("a plan opens from the Plans tab, and system back returns to the tab", async () => {
    const plan = PLANS.finding_group;
    await launch({ me: meFixture(), routes: { "GET /plans": json(200, { plans: [plan] }), [`GET /plans/${plan.id}`]: json(200, plan) } });
    await on("home");
    await act(() => router.navigate("/plans"));
    await fireEvent.press(await screen.findByTestId(`plan-row-${plan.id}`));
    await on("plan");
    expect(screen).toHavePathname(`/plans/${plan.id}`);
    onlyOpen("plan");
    await act(() => router.back());
    await on("plans");
  });

  test("the leave sheet opens over the plan and Stay returns to it", async () => {
    const plan = PLANS.finding_group;
    await launch({ me: meFixture(), routes: { [`GET /plans/${plan.id}`]: json(200, plan) } });
    await on("home");
    await act(() => router.push(`/plans/${plan.id}`));
    await fireEvent.press(await screen.findByTestId("plan-leave"));
    await fireEvent.press(await screen.findByTestId("cancel-stay"));
    await on("plan");
    expect(screen).toHavePathname(`/plans/${plan.id}`);
  });

  test("an onboarding screen is not reachable once the account is ready", async () => {
    await launch({ me: meFixture() }, "/notice");
    await waitFor(() => expect(screen.queryByTestId("notice")).not.toBeOnTheScreen());
    expect(screen.queryByTestId("profile")).not.toBeOnTheScreen();
  });

  test("signing out returns to the first signed-out screen", async () => {
    await launch({ me: meFixture(), welcomeSeen: true });
    await act(() => router.navigate("/you"));
    await on("you");
    await fireEvent.press(screen.getByText(you.signOut));
    await on("notice");
  });

  test("the You rows open the settings pages, and back returns to You", async () => {
    await launch({ me: meFixture(), welcomeSeen: true });
    await act(() => router.navigate("/you"));
    await on("you");
    for (const [row, page, path] of [
      ["you-notifications", "settings-notifications", "/settings/notifications"],
      ["you-blocked", "settings-blocked", "/settings/blocked"],
      ["you-how-matching", "settings-how-matching", "/settings/how-matching-works"],
      ["you-privacy", "settings-privacy", "/settings/privacy"],
      ["you-grievance", "settings-grievance", "/settings/grievance"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(row));
      await on(page);
      expect(screen).toHavePathname(path);
      await fireEvent.press(screen.getByTestId("back"));
      await on("you");
    }
  });

  test("deleting the account returns to welcome with everything on the phone forgotten", async () => {
    // On a phone each part of the wipe takes real time, and the screens must wait it out without an error.
    const realTimeout = jest.requireActual<typeof import("timers")>("timers").setTimeout;
    const slowPart = () => new Promise<void>((resolve) => realTimeout(resolve, 30));
    await launch({
      me: meFixture(),
      welcomeSeen: true,
      acceptedNotice: NOTICE_VERSION,
      clearImages: slowPart,
      clearPickedFiles: slowPart,
      clearNotifications: slowPart,
      routes: {
        "POST /me/delete-code": json(200, { challengeId: "challenge-1", expiresAt: "2099-01-01T00:00:00.000Z" }),
        "DELETE /me": { status: 204, text: "", retryAfter: null },
      },
    });
    await act(() => router.navigate("/you"));
    await on("you");
    await fireEvent.press(screen.getByTestId("you-delete-account"));
    await on("settings-delete-account");
    await fireEvent.press(screen.getByTestId("delete-continue"));
    await fireEvent.press(screen.getByTestId("delete-send"));
    await on("delete-code");
    mockStartFailedRenders = 0;
    await fireEvent.changeText(screen.getByTestId("delete-code-field"), "123456");
    // Both clocks move while the wipe runs: its parts take real time, and the app's retries and refetches run on the fake one.
    for (let i = 0; i < 40 && !screen.queryByTestId("welcome"); i++) {
      await act(async () => {
        jest.advanceTimersByTime(50);
        await new Promise<void>((resolve) => realTimeout(resolve, 5));
      });
    }
    await on("welcome");
    expect(mockApp.deps.localFlags.getSnapshot()).toEqual({ welcomeSeen: false, acceptedNotice: null });
    expect(mockStartFailedRenders).toBe(0);
  });

  test("the storybook route goes home when Storybook is not bundled", async () => {
    await launch({ me: meFixture() }, "/storybook?story=primitives-button--primary");
    await on("home");
    expect(screen).toHavePathname("/");
  });
});

describe("start", () => {
  test("nothing shows and the splash stays up until the gate has an answer", async () => {
    let answer: (value: RawResponse) => void = () => {};
    const pending = new Promise<RawResponse>((resolve) => {
      answer = resolve;
    });
    mockApp = await createTestApp({ me: meFixture(), routes: { "GET /me": () => pending } });
    (releaseSplash as jest.Mock).mockClear();
    await renderRouter("./src/app");
    onlyOpen();
    expect(releaseSplash).not.toHaveBeenCalled();
    await act(async () => {
      answer(json(200, meFixture()));
    });
    await on("home");
    expect(releaseSplash).toHaveBeenCalled();
  });

  test("a signed-in member with no connection and nothing saved sees a retry, not a wrong screen", async () => {
    await launch({ me: meFixture(), routes: { "GET /me": new Error("no network") } });
    // The query retries once after a second before it pauses for the network.
    await waitFor(() => expect(screen.getByTestId("start-failed")).toBeOnTheScreen(), { timeout: 4000 });
    onlyOpen("start-failed");
    expect(screen.getByText(common.errorOffline)).toBeOnTheScreen();
    mockApp.transport.set("GET /me", json(200, meFixture()));
    await fireEvent.press(screen.getByText(common.retry));
    await on("home");
  });
});
