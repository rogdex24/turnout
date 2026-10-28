import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NOTICE_PARAGRAPHS, NOTICE_VERSION } from "@turnout/contract/app/notice";
import { queryKeys } from "@/api/keys";
import { PREF_KEYS } from "@/api/prefs";
import { clearTestClients, json } from "@/api/testing";
import { common } from "@/copy/common";
import { notice } from "@/copy/notice";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture, type TestAppOptions } from "@/providers/testing";
import { SAMPLE_CONFIG, SAMPLE_GRIEVANCE } from "./fixtures";
import { NoticeScreen } from "./NoticeScreen";

afterEach(() => clearTestClients());

async function open(options: TestAppOptions = {}) {
  const app = await createTestApp({ welcomeSeen: true, ...options });
  // The app tries a failing server twice more before it gives up; a test should not wait for that.
  app.queryClient.setQueryDefaults(queryKeys.config(), { retry: false });
  if (options.me) app.queryClient.setQueryData(queryKeys.me(), options.me);
  await render(
    <AppProviders deps={app.deps}>
      <NoticeScreen />
    </AppProviders>,
  );
  return app;
}

const agree = () => screen.getByTestId("agree");

describe("NoticeScreen, signed out", () => {
  it("shows every paragraph of the notice and the grievance officer from the server", async () => {
    await open({ routes: { "GET /config": json(200, SAMPLE_CONFIG) } });
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    for (const paragraph of NOTICE_PARAGRAPHS) expect(screen.getByText(paragraph)).toBeOnTheScreen();
    for (const line of [SAMPLE_GRIEVANCE.name, SAMPLE_GRIEVANCE.address, SAMPLE_GRIEVANCE.phone])
      expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.getByText(notice.title)).toBeOnTheScreen();
  });

  it("holds Agree until the officer's details are on the screen", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await open({
      routes: {
        "GET /config": async () => {
          await gate;
          return json(200, SAMPLE_CONFIG);
        },
      },
    });
    expect(screen.getByText(notice.grievanceLoading)).toBeOnTheScreen();
    expect(agree().props.accessibilityState).toMatchObject({ disabled: true });
    release();
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    expect(agree().props.accessibilityState).not.toMatchObject({ disabled: true });
  });

  it("says so when the details cannot load, and Try again gets them", async () => {
    await open({ routes: { "GET /config": [json(500, { error: { code: "server_error", message: "x" } }), json(200, SAMPLE_CONFIG)] } });
    await screen.findByText(notice.grievanceFailed);
    expect(agree().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("grievance-retry"));
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    expect(screen.queryByText(common.retry)).not.toBeOnTheScreen();
  });

  it("stores the version on this phone and posts nothing", async () => {
    const app = await open({ routes: { "GET /config": json(200, SAMPLE_CONFIG) } });
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    await fireEvent.press(agree());
    expect(app.prefs.getString(PREF_KEYS.acceptedNotice)).toBe(NOTICE_VERSION);
    expect(app.transport.callsTo("POST /me/consent")).toHaveLength(0);
  });
});

describe("NoticeScreen, signed in after the notice changed", () => {
  const stale = meFixture({ consent: false });

  it("says the notice changed and records the agreement on the account", async () => {
    const app = await open({
      me: stale,
      routes: {
        "GET /config": json(200, SAMPLE_CONFIG),
        "POST /me/consent": json(200, { noticeVersion: NOTICE_VERSION, givenAt: "2026-10-27T10:00:00.000Z" }),
      },
    });
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    expect(screen.getByText(notice.titleChanged)).toBeOnTheScreen();
    await fireEvent.press(agree());
    await waitFor(() => expect(app.transport.callsTo("POST /me/consent")).toHaveLength(1));
    expect(JSON.parse(String(app.transport.callsTo("POST /me/consent")[0]?.body))).toEqual({ noticeVersion: NOTICE_VERSION });
    await waitFor(() =>
      expect((app.queryClient.getQueryData(queryKeys.me()) as { consent: { current: boolean } } | undefined)?.consent.current).toBe(true),
    );
  });

  it("tells the person to update when the server knows a newer notice", async () => {
    await open({
      me: stale,
      routes: {
        "GET /config": json(200, SAMPLE_CONFIG),
        "POST /me/consent": json(400, { error: { code: "unknown_notice_version", message: "reload" } }),
      },
    });
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    await fireEvent.press(agree());
    expect(await screen.findByText(notice.errors.updateApp)).toBeOnTheScreen();
  });

  it("says offline when the agreement could not be sent, and keeps the button for another try", async () => {
    await open({ me: stale, routes: { "GET /config": json(200, SAMPLE_CONFIG), "POST /me/consent": new Error("dead network") } });
    await screen.findByText(SAMPLE_GRIEVANCE.email);
    await fireEvent.press(agree());
    expect(await screen.findByText(notice.errors.offline)).toBeOnTheScreen();
    expect(agree().props.accessibilityState).not.toMatchObject({ disabled: true });
  });
});
