import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { MeResponse } from "@turnout/contract/app/me";
import { AccessibilityInfo } from "react-native";
import { queryKeys } from "@/api/keys";
import { clearTestClients, json } from "@/api/testing";
import { profileCheck } from "@/copy/profileCheck";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture, type TestAppOptions } from "@/providers/testing";
import { SocialScreen } from "./SocialScreen";

const copy = profileCheck.social;
afterEach(() => {
  clearTestClients();
  jest.restoreAllMocks();
});

async function open(me: MeResponse, routes: TestAppOptions["routes"] = {}) {
  const app = await createTestApp({ me, welcomeSeen: true, routes });
  app.queryClient.setQueryData(queryKeys.me(), me);
  await render(
    <AppProviders deps={app.deps}>
      <SocialScreen onBack={jest.fn()} />
    </AppProviders>,
  );
  return app;
}

const rejected = meFixture({ handle: { state: "rejected", rejectReason: "not_found" } });

describe("SocialScreen", () => {
  it("shows the checking strip while the handle is being checked", async () => {
    await open(meFixture());
    expect(screen.getByText(profileCheck.pending)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${copy.current}, ${copy.kind.instagram}, ananya.k`)).toBeOnTheScreen();
  });

  it("shows the reason for a turned-down handle and no strip once it is approved", async () => {
    const app = await open(rejected);
    expect(screen.getByText(profileCheck.rejected.not_found)).toBeOnTheScreen();
    expect(screen.getByText(profileCheck.change)).toBeOnTheScreen();
    await app.queryClient.setQueryData(queryKeys.me(), meFixture({ handle: { state: "approved" } }));
    await waitFor(() => expect(screen.queryByTestId("profile-check-strip")).toBeNull());
  });

  it("sends a new handle, cleaned, and goes back to checking in place", async () => {
    const app = await open(rejected, { "PUT /me/handle": json(200, { state: "pending" }) });
    await fireEvent.changeText(screen.getByTestId("social-handle"), "https://www.instagram.com/Ananya.K/");
    await fireEvent.press(screen.getByTestId("social-save"));
    await waitFor(() => expect(screen.getByText(profileCheck.pending)).toBeOnTheScreen());
    const call = app.transport.calls.find((c) => c.method === "PUT");
    expect(JSON.parse(String(call?.body))).toEqual({ kind: "instagram", handle: "ananya.k" });
    expect(screen.queryByText(profileCheck.rejected.not_found)).toBeNull();
    expect(screen.getByTestId("social-saved")).toBeOnTheScreen();
  });

  it("says the new strip aloud once", async () => {
    const say = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    await open(rejected, { "PUT /me/handle": json(200, { state: "pending" }) });
    // A strip that was already there is not read out again when the page opens.
    say.mockClear();
    await fireEvent.changeText(screen.getByTestId("social-handle"), "@ananya.k");
    await fireEvent.press(screen.getByTestId("social-save"));
    await waitFor(() => expect(say).toHaveBeenCalledWith(profileCheck.pending));
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("keeps Save above the keyboard, so the handle can be saved with the keyboard up", async () => {
    await open(meFixture());
    const avoiding = screen.getByTestId("settings-social-body");
    expect(within(avoiding).getByTestId("social-save")).toBeOnTheScreen();
  });

  it("sends nothing for a value that is not a handle", async () => {
    const app = await open(rejected);
    await fireEvent.changeText(screen.getByTestId("social-handle"), "https://example.com/someone");
    await fireEvent.press(screen.getByTestId("social-save"));
    expect(screen.getByText(copy.errors.invalid)).toBeOnTheScreen();
    expect(app.transport.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it.each([
    ["handle_locked", 409, copy.errors.locked],
    ["rate_limited", 429, copy.errors.limit],
  ])("says what a %s refusal means next to the field", async (code, status, message) => {
    await open(meFixture(), { "PUT /me/handle": json(status, { error: { code, message: "x" } }, status === 429 ? "30" : null) });
    await fireEvent.changeText(screen.getByTestId("social-handle"), "@ananya.k");
    await fireEvent.press(screen.getByTestId("social-save"));
    await waitFor(() => expect(screen.getByText(message)).toBeOnTheScreen());
  });
});
