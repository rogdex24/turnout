import { act, render, waitFor } from "@testing-library/react-native";
import { type PushNative, permissionChanged } from "@/api/notifications";
import { PREF_KEYS } from "@/api/prefs";
import { clearTestClients, json } from "@/api/testing";
import { SAMPLE_CONFIG } from "@/screens/notice/fixtures";
import { AppProviders } from "./AppProviders";
import { createTestApp, meFixture } from "./testing";
import { useNotificationRouting } from "./useNotificationRouting";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));

afterEach(() => {
  clearTestClients();
  mockNavigate.mockReset();
});

function fakeNative(over: Partial<PushNative> = {}) {
  let tap: (data: unknown) => void = () => undefined;
  const native: PushNative = {
    platform: "android",
    permission: async () => ({ status: "granted", canAskAgain: true }),
    requestPermission: async () => ({ status: "granted", canAskAgain: true }),
    expoToken: async () => "ExponentPushToken[abcdefghijklmnop]",
    setUpChannels: jest.fn(async () => undefined),
    onTap: (handler) => {
      tap = handler;
      return () => undefined;
    },
    setForegroundHandler: jest.fn(),
    ...over,
  };
  return { native, tap: (data: unknown) => tap(data) };
}

function Probe({ native }: { native: PushNative }) {
  useNotificationRouting(native);
  return null;
}

async function open(native: PushNative) {
  const app = await createTestApp({
    me: meFixture(),
    routes: {
      "GET /config": json(200, { ...SAMPLE_CONFIG, push: { android: true, ios: false } }),
      "GET /plans": json(200, { plans: [] }),
      "GET /notices": json(200, {
        notices: [{ id: "n1", kind: "meet_card_live", planId: "p1", groupId: "g1", createdAt: "2026-11-07T10:00:00.000Z", readAt: null }],
      }),
      "POST /devices": json(200, { deviceId: "d1" }),
    },
  });
  // The session has to be loaded as signed in before the hook reads it.
  await render(
    <AppProviders deps={app.deps}>
      <Probe native={native} />
    </AppProviders>,
  );
  return app;
}

describe("useNotificationRouting", () => {
  it("sets up the channels and the foreground handler once the app is open", async () => {
    const { native } = fakeNative();
    await open(native);
    expect(native.setUpChannels).toHaveBeenCalled();
    expect(native.setForegroundHandler).toHaveBeenCalled();
  });

  it("opens the meet card for a tapped meet card push, reading the group from the notice", async () => {
    const { native, tap } = fakeNative();
    await open(native);
    await act(async () => tap({ kind: "meet_card_live", noticeId: "n1", planId: "p1" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/groups/g1/meet"));
  });

  it("opens the plan for a tapped ticket push, and Home for data that is not ours", async () => {
    const { native, tap } = fakeNative();
    await open(native);
    await act(async () => tap({ kind: "ticket_rejected", noticeId: "n2", planId: "p1" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith("/plans/p1/ticket"));
    await act(async () => tap({ hello: "world" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith("/"));
  });

  it("never asks the system itself, and registers once the ticket page's question was answered yes", async () => {
    let granted = false;
    const requestPermission = jest.fn(async () => ({ status: "granted" as const, canAskAgain: true }));
    const { native } = fakeNative({
      permission: async () => (granted ? { status: "granted", canAskAgain: true } : { status: "undetermined", canAskAgain: true }),
      requestPermission,
    });
    const app = await open(native);
    await waitFor(() => expect(native.setUpChannels).toHaveBeenCalled());
    expect(requestPermission).not.toHaveBeenCalled();
    expect(app.transport.callsTo("POST /devices")).toHaveLength(0);
    granted = true;
    await act(() => permissionChanged());
    await waitFor(() => expect(app.transport.callsTo("POST /devices")).toHaveLength(1));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("gives the server the token for a person on Android", async () => {
    const { native } = fakeNative();
    const app = await open(native);
    await waitFor(() => expect(app.transport.callsTo("POST /devices")).toHaveLength(1));
  });

  it("forgets the stored device when the session ends, so the next person registers afresh", async () => {
    const { native } = fakeNative();
    const app = await open(native);
    await waitFor(() => expect(app.prefs.getString(PREF_KEYS.pushDevice)).toBeDefined());
    await act(() => app.deps.session.signOut());
    expect(app.prefs.getString(PREF_KEYS.pushDevice)).toBeUndefined();
  });
});
