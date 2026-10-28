import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import type { RawResponse } from "@/api/client";
import { json } from "@/api/testing";
import { common } from "@/copy/common";
import { you } from "@/copy/you";
import { releaseSplash } from "@/providers/splash";
import { createTestApp, meFixture, type TestApp, type TestAppOptions } from "@/providers/testing";

// Skip the native splash and the real stores: MMKV does not load in Jest, so boot hands back in-memory parts.
jest.mock("@/providers/splash", () => ({ holdSplash: jest.fn(), releaseSplash: jest.fn() }));
let mockApp: TestApp;
jest.mock("@/providers/boot", () => ({ bootApp: () => Promise.resolve(mockApp.deps) }));

async function launch(options: TestAppOptions, initialUrl = "/") {
  mockApp = await createTestApp(options);
  await renderRouter("./src/app", { initialUrl });
}

const on = (testID: string) => waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen());
const SCREENS = ["welcome", "notice", "sign-in", "profile", "home", "plans", "you", "start-failed"];
/** Only this screen is on show: no other step's screen sits under it or flashed before it. */
const onlyOpen = (open?: string) => {
  for (const id of SCREENS) if (id !== open) expect(screen.queryByTestId(id)).not.toBeOnTheScreen();
};

describe("signed out", () => {
  test("a new phone starts at welcome", async () => {
    await launch({});
    await on("welcome");
    expect(screen).toHavePathname("/welcome");
  });

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

  test("the three tabs open", async () => {
    await launch({ me: meFixture() });
    await on("home");
    await act(() => router.navigate("/plans"));
    await on("plans");
    await act(() => router.navigate("/you"));
    await on("you");
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
