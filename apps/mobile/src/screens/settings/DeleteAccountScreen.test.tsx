import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { PREF_KEYS } from "@/api/prefs";
import { SECRET_KEYS } from "@/api/secureStorage";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { deleteAccount as copy } from "@/copy/deleteAccount";
import { planFixture } from "@/model/planFixtures";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { DeleteAccountScreen } from "./DeleteAccountScreen";

afterEach(() => clearTestClients());

const CHALLENGE = { challengeId: "challenge-1", expiresAt: "2099-01-01T00:00:00.000Z" };

async function open(routes: Record<string, RouteReply | RouteReply[]> = {}) {
  const onBack = jest.fn();
  const clearImages = jest.fn(async () => {});
  const app = await createTestApp({
    me: meFixture(),
    welcomeSeen: true,
    acceptedNotice: "2026-10-26",
    routes: { "GET /plans": json(200, { plans: [] }), "POST /me/delete-code": json(200, CHALLENGE), ...routes },
    clearImages,
  });
  app.queryClient.setQueryData(["me"], meFixture());
  await render(
    <AppProviders deps={app.deps}>
      <DeleteAccountScreen onBack={onBack} />
    </AppProviders>,
  );
  return { ...app, onBack, clearImages };
}

async function toCode() {
  await fireEvent.press(await screen.findByTestId("delete-continue"));
  await fireEvent.press(screen.getByTestId("delete-send"));
  await screen.findByTestId("delete-code");
}

describe("DeleteAccountScreen", () => {
  it("explains what goes and what stays, and lists the phone hash only as kept if banned", async () => {
    await open();
    expect(await screen.findByText(copy.title)).toBeOnTheScreen();
    for (const line of copy.erased) expect(screen.getByText(`•  ${line}`)).toBeOnTheScreen();
    for (const line of copy.kept) expect(screen.getByText(`•  ${line}`)).toBeOnTheScreen();
    expect(copy.kept.filter((line) => /phone number/i.test(line))).toHaveLength(1);
    expect(screen.queryByText(copy.groupTold)).toBeNull();
  });

  it("changes nothing until the code is sent, and the code goes to the number ending in the last four digits", async () => {
    const app = await open();
    await fireEvent.press(await screen.findByTestId("delete-continue"));
    expect(screen.getByText(copy.confirm.body("0123"))).toBeOnTheScreen();
    expect(app.transport.callsTo("POST /me/delete-code")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("delete-send"));
    await screen.findByTestId("delete-code");
    expect(app.transport.callsTo("POST /me/delete-code")).toHaveLength(1);
    expect(app.transport.callsTo("DELETE /me")).toHaveLength(0);
  });

  it("keeping the account leaves with nothing sent", async () => {
    const app = await open();
    await fireEvent.press(await screen.findByTestId("delete-continue"));
    await fireEvent.press(screen.getByTestId("delete-keep"));
    expect(app.onBack).toHaveBeenCalled();
    expect(app.transport.callsTo("POST /me/delete-code")).toHaveLength(0);
  });

  it("deletes with the right code, then this phone forgets everything and starts at Welcome", async () => {
    const app = await open({ "DELETE /me": { status: 204, text: "", retryAfter: null } });
    await toCode();
    await fireEvent.changeText(screen.getByTestId("delete-code-field"), "123456");
    await act(async () => undefined);
    const [call] = app.transport.callsTo("DELETE /me");
    expect(JSON.parse(String(call?.body))).toEqual({ challengeId: CHALLENGE.challengeId, code: "123456" });
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.prefs.getString(PREF_KEYS.userId)).toBeUndefined();
    expect(app.prefs.getString(PREF_KEYS.welcomeSeen)).toBeUndefined();
    expect(app.prefs.getString(PREF_KEYS.acceptedNotice)).toBeUndefined();
    expect(app.deps.localFlags.getSnapshot()).toEqual({ welcomeSeen: false, acceptedNotice: null });
    expect(app.queryClient.getQueryData(["me"])).toBeUndefined();
    expect(app.clearImages).toHaveBeenCalledTimes(1);
  });

  it("a wrong code leaves the account as it was and says how many tries are left", async () => {
    const app = await open({
      "DELETE /me": json(400, { error: { code: "invalid_code", message: "No." } }),
    });
    await toCode();
    await fireEvent.changeText(screen.getByTestId("delete-code-field"), "000000");
    await act(async () => undefined);
    expect(await screen.findByText(copy.errors.wrong(4))).toBeOnTheScreen();
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).not.toBeNull();
    expect(app.prefs.getString(PREF_KEYS.welcomeSeen)).toBe("1");
    expect(app.clearImages).not.toHaveBeenCalled();
  });

  it("says plainly when the code could not be sent, and stays on the question", async () => {
    await open({ "POST /me/delete-code": json(500, { error: { code: "server_error", message: "No." } }) });
    await fireEvent.press(await screen.findByTestId("delete-continue"));
    await fireEvent.press(screen.getByTestId("delete-send"));
    expect(await screen.findByText(copy.errors.server)).toBeOnTheScreen();
    expect(screen.getByTestId("delete-confirm")).toBeOnTheScreen();
  });

  it("tells a person with a group close to the show that the group will be told someone left", async () => {
    const now = Date.now();
    const soon = planFixture({
      id: "plan-soon",
      state: "group_confirmed",
      show: { title: "Comedy Night", startsAt: new Date(now + 2 * 3_600_000).toISOString(), venueName: "Phoenix Arena" },
      ticket: { state: "approved", rejectReason: null },
      group: { id: "group-1", state: "confirmed", size: 5, revealAt: new Date(now - 3_600_000).toISOString() },
    });
    await open({ "GET /plans": json(200, { plans: [soon] }) });
    expect(await screen.findByText(copy.groupTold)).toBeOnTheScreen();
  });
});
