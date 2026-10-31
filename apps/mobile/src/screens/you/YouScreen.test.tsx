import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { MeResponse } from "@turnout/contract/app/me";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { PREF_KEYS } from "@/api/prefs";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { common } from "@/copy/common";
import { you } from "@/copy/you";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { YouScreen } from "./YouScreen";

const mockSetConsent = jest.fn();
jest.mock("@/analytics", () => ({ telemetry: () => ({ start: () => undefined, setConsent: mockSetConsent }) }));

afterEach(() => {
  clearTestClients();
  mockSetConsent.mockClear();
});

async function open(me: MeResponse, routes: Record<string, RouteReply | RouteReply[]> = {}) {
  const onOpen = jest.fn();
  const onSignOut = jest.fn();
  const app = await createTestApp({ me, welcomeSeen: true, routes });
  app.queryClient.setQueryData(["me"], me);
  await render(
    <AppProviders deps={app.deps}>
      <YouScreen onOpen={onOpen} onSignOut={onSignOut} />
    </AppProviders>,
  );
  return { ...app, onOpen, onSignOut };
}

describe("YouScreen", () => {
  it("shows the handle check state, the notice version and a row for each page", async () => {
    const app = await open(meFixture());
    expect(screen.getByText(you.social.state.pending)).toBeOnTheScreen();
    expect(screen.getByText(you.privacy.sub(NOTICE_VERSION))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("you-blocked"));
    expect(app.onOpen).toHaveBeenCalledWith("blocked");
    await fireEvent.press(screen.getByTestId("you-grievance"));
    expect(app.onOpen).toHaveBeenCalledWith("grievance");
    await fireEvent.press(screen.getByTestId("you-delete-account"));
    expect(app.onOpen).toHaveBeenCalledWith("deleteAccount");
    await fireEvent.press(screen.getByTestId("you-sign-out"));
    expect(app.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("says when the handle was approved", async () => {
    await open(meFixture({ handle: { state: "approved" } }));
    expect(screen.getByText(you.social.state.approved)).toBeOnTheScreen();
  });

  it("offers women-only to a woman, and saves it at once with the whole profile", async () => {
    const saved = meFixture({ profile: { groupPref: "women_only" } });
    const app = await open(meFixture(), { "PATCH /me/profile": json(200, saved) });
    expect(screen.getByText(you.womenOnly.sub)).toBeOnTheScreen();
    await fireEvent(screen.getByTestId("you-women-only"), "valueChange", true);
    await waitFor(() => expect(app.transport.callsTo("PATCH /me/profile")).toHaveLength(1));
    expect(JSON.parse(String(app.transport.callsTo("PATCH /me/profile")[0]?.body))).toEqual({
      firstName: "Ananya",
      gender: "woman",
      groupPref: "women_only",
    });
    await waitFor(() => expect(app.queryClient.getQueryData<MeResponse>(["me"])?.profile.groupPref).toBe("women_only"));
  });

  it("does not offer women-only to a man", async () => {
    await open(meFixture({ profile: { gender: "man" } }));
    expect(screen.queryByTestId("you-women-only")).toBeNull();
  });

  it("says so when the choice did not save, and keeps it off", async () => {
    const app = await open(meFixture(), { "PATCH /me/profile": json(500, { error: { code: "server_error", message: "No." } }) });
    await fireEvent(screen.getByTestId("you-women-only"), "valueChange", true);
    expect(await screen.findByText(you.womenOnly.errors.server)).toBeOnTheScreen();
    expect(app.queryClient.getQueryData<MeResponse>(["me"])?.profile.groupPref).toBe("open");
  });

  it("turns usage data off for PostHog, and on again", async () => {
    const app = await open(meFixture());
    app.prefs.set(PREF_KEYS.analyticsConsent, "1");
    await fireEvent(screen.getByTestId("you-usage"), "valueChange", false);
    expect(mockSetConsent).toHaveBeenLastCalledWith(false);
    await fireEvent(screen.getByTestId("you-usage"), "valueChange", true);
    expect(mockSetConsent).toHaveBeenLastCalledWith(true);
  });

  it("tells a stopped member that grouping has stopped, and keeps every row working", async () => {
    const app = await open(meFixture({ status: "stopped" }));
    expect(screen.getByText(common.groupingStopped)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("you-profile"));
    expect(app.onOpen).toHaveBeenCalledWith("profile");
    await fireEvent.press(screen.getByTestId("you-delete-account"));
    expect(app.onOpen).toHaveBeenCalledWith("deleteAccount");
    await fireEvent.press(screen.getByTestId("you-sign-out"));
    expect(app.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("does not show the stopped line to an active member", async () => {
    await open(meFixture());
    expect(screen.queryByText(common.groupingStopped)).toBeNull();
  });
});
