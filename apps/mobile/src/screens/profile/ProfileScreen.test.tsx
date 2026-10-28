import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { MeResponse } from "@turnout/contract/app/me";
import { queryKeys } from "@/api/keys";
import { PHOTO_UNREADABLE } from "@/api/saveProfile";
import { clearTestClients, json } from "@/api/testing";
import { profile } from "@/copy/profile";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture, type TestAppOptions } from "@/providers/testing";
import { newMember, SAMPLE_PICKED } from "./fixtures";
import { ProfileScreen } from "./ProfileScreen";
import { choosePhoto, readPhoto } from "./photoFile";

jest.mock("./photoFile", () => ({ choosePhoto: jest.fn(), readPhoto: jest.fn() }));
const choose = jest.mocked(choosePhoto);
const read = jest.mocked(readPhoto);

const PHOTO = { photo: { url: "/files/new", expiresAt: "2026-10-26T10:00:00.000Z" } };

beforeEach(() => {
  choose.mockReset().mockResolvedValue(SAMPLE_PICKED);
  read.mockReset().mockResolvedValue(new Blob(["jpeg"]));
});
afterEach(() => clearTestClients());

async function open(me: MeResponse, routes: TestAppOptions["routes"] = {}, onBack?: () => void) {
  const app = await createTestApp({ me, welcomeSeen: true, routes });
  app.queryClient.setQueryData(queryKeys.me(), me);
  await render(
    <AppProviders deps={app.deps}>
      <ProfileScreen onBack={onBack} />
    </AppProviders>,
  );
  return app;
}

async function fillNew() {
  await fireEvent.changeText(screen.getByTestId("first-name"), "Ananya");
  await fireEvent.press(screen.getByTestId("gender-woman"));
  await fireEvent.changeText(screen.getByTestId("handle"), "https://www.instagram.com/Ananya.K/");
}

const bodyOf = (call: { body?: unknown } | undefined) => JSON.parse(String(call?.body));

describe("ProfileScreen, checks before sending", () => {
  it("asks for each missing piece next to its field and sends nothing", async () => {
    const app = await open(newMember());
    await fireEvent.press(screen.getByTestId("save"));
    expect(screen.getByText(profile.firstName.errors.required)).toBeOnTheScreen();
    expect(screen.getByText(profile.gender.errors.required)).toBeOnTheScreen();
    expect(screen.getByText(profile.photo.errors.required)).toBeOnTheScreen();
    expect(screen.getByText(profile.handle.errors.required)).toBeOnTheScreen();
    expect(app.transport.calls.filter((c) => c.method !== "GET" && !c.url.includes("/auth/"))).toHaveLength(0);
  });

  it("says a pasted link that is not Instagram or LinkedIn is not a handle", async () => {
    await open(newMember());
    await fillNew();
    await fireEvent.changeText(screen.getByTestId("handle"), "https://example.com/someone");
    await fireEvent.press(screen.getByTestId("save"));
    expect(screen.getByText(profile.handle.errors.invalid)).toBeOnTheScreen();
  });

  it("shows why the handle is asked for, in the approved words", async () => {
    await open(newMember());
    expect(screen.getByText(profile.handle.why)).toBeOnTheScreen();
  });

  it("clears an error as soon as the person edits that field", async () => {
    await open(newMember());
    await fireEvent.press(screen.getByTestId("save"));
    await fireEvent.changeText(screen.getByTestId("first-name"), "A");
    expect(screen.queryByText(profile.firstName.errors.required)).not.toBeOnTheScreen();
    expect(screen.getByText(profile.gender.errors.required)).toBeOnTheScreen();
  });
});

describe("ProfileScreen, women-only", () => {
  it("is offered to women and non-binary people, not to men or before a choice", async () => {
    await open(newMember());
    expect(screen.queryByTestId("women-only")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("gender-woman"));
    expect(screen.getByTestId("women-only")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("gender-non_binary"));
    expect(screen.getByTestId("women-only")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("gender-man"));
    expect(screen.queryByTestId("women-only")).not.toBeOnTheScreen();
  });

  it("is cleared when the gender becomes man, so it is never sent", async () => {
    const me = meFixture({ profile: { gender: "woman", groupPref: "women_only" } });
    const app = await open(me, { "PATCH /me/profile": json(200, me) });
    expect(screen.getByTestId("women-only").props.value).toBe(true);
    await fireEvent.press(screen.getByTestId("gender-man"));
    await fireEvent.press(screen.getByTestId("save"));
    await waitFor(() => expect(app.transport.callsTo("PATCH /me/profile")).toHaveLength(1));
    expect(bodyOf(app.transport.callsTo("PATCH /me/profile")[0])).toEqual({ firstName: "Ananya", gender: "man", groupPref: "open" });
  });

  it("is sent when the switch is on", async () => {
    const me = meFixture({ profile: { gender: "non_binary", groupPref: "open" } });
    const app = await open(me, { "PATCH /me/profile": json(200, me) });
    await fireEvent(screen.getByTestId("women-only"), "valueChange", true);
    await fireEvent.press(screen.getByTestId("save"));
    await waitFor(() => expect(app.transport.callsTo("PATCH /me/profile")).toHaveLength(1));
    expect(bodyOf(app.transport.callsTo("PATCH /me/profile")[0])).toMatchObject({ gender: "non_binary", groupPref: "women_only" });
  });
});

describe("ProfileScreen, saving a new member", () => {
  const routes = (me: MeResponse) => ({
    "PATCH /me/profile": json(200, { ...me, profile: { ...me.profile, firstName: "Ananya", gender: "woman" } }),
    "PUT /me/photo": json(200, PHOTO),
    "PUT /me/handle": json(200, { state: "pending" }),
  });

  it("sends the profile, then the photo, then the handle, and the cached me completes", async () => {
    const me = newMember();
    const app = await open(me, routes(me));
    await fillNew();
    await fireEvent.press(screen.getByTestId("photo-button"));
    expect(await screen.findByText(profile.photo.ready)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("save"));
    await waitFor(() => expect(app.transport.callsTo("PUT /me/handle")).toHaveLength(1));
    const order = app.transport.calls
      .filter((c) => c.method !== "GET")
      .map((c) => new URL(c.url).pathname.replace(/^\/api\/app\/v1/, ""))
      .filter((path) => path !== "/auth/refresh");
    expect(order).toEqual(["/me/profile", "/me/photo", "/me/handle"]);
    expect(bodyOf(app.transport.callsTo("PUT /me/handle")[0])).toEqual({ kind: "instagram", handle: "ananya.k" });
    expect(bodyOf(app.transport.callsTo("PATCH /me/profile")[0])).toEqual({ firstName: "Ananya", gender: "woman", groupPref: "open" });
    const cached = app.queryClient.getQueryData<MeResponse>(queryKeys.me());
    expect(cached?.profile.photo?.url).toBe("/files/new");
    expect(cached?.handle).toMatchObject({ state: "pending", kind: "instagram", handle: "ananya.k" });
  });

  it("shows the upload progress while the picture goes up", async () => {
    const me = newMember();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const app = await open(me, {
      ...routes(me),
      "PUT /me/photo": async (request) => {
        request.onProgress?.(25, 100);
        await held;
        return json(200, PHOTO);
      },
    });
    await fillNew();
    await fireEvent.press(screen.getByTestId("photo-button"));
    await screen.findByText(profile.photo.ready);
    await fireEvent.press(screen.getByTestId("save"));
    expect(await screen.findByText(profile.photo.uploading(25))).toBeOnTheScreen();
    expect(screen.getByTestId("photo-progress").props.accessibilityValue).toMatchObject({ now: 25 });
    finish();
    await waitFor(() => expect(app.transport.callsTo("PUT /me/handle")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("photo-progress")).not.toBeOnTheScreen());
  });

  it("does nothing when the picker is closed", async () => {
    choose.mockResolvedValue(null);
    await open(newMember());
    await fireEvent.press(screen.getByTestId("photo-button"));
    expect(screen.queryByText(profile.photo.ready)).not.toBeOnTheScreen();
  });
});

describe("ProfileScreen, the server says no", () => {
  async function fillAndPick(me: MeResponse, routes: TestAppOptions["routes"]) {
    const app = await open(me, routes);
    await fillNew();
    await fireEvent.press(screen.getByTestId("photo-button"));
    await screen.findByText(profile.photo.ready);
    await fireEvent.press(screen.getByTestId("save"));
    return app;
  }
  const profileOk = (me: MeResponse) => json(200, { ...me, profile: { ...me.profile, firstName: "Ananya", gender: "woman" } });

  it("puts a refused picture under the photo", async () => {
    const me = newMember();
    await fillAndPick(me, {
      "PATCH /me/profile": profileOk(me),
      "PUT /me/photo": json(400, { error: { code: "unsupported_type", message: "x" } }),
    });
    expect(await screen.findByText(profile.photo.errors.unreadable)).toBeOnTheScreen();
    expect(screen.getByTestId("photo-error")).toBeOnTheScreen();
  });

  it("says too large for a picture the server will not take", async () => {
    const me = newMember();
    await fillAndPick(me, {
      "PATCH /me/profile": profileOk(me),
      "PUT /me/photo": json(413, { error: { code: "file_too_large", message: "x" } }),
    });
    expect(await screen.findByText(profile.photo.errors.tooLarge)).toBeOnTheScreen();
  });

  it("puts a locked handle under the handle", async () => {
    const me = newMember();
    await fillAndPick(me, {
      "PATCH /me/profile": profileOk(me),
      "PUT /me/photo": json(200, PHOTO),
      "PUT /me/handle": json(409, { error: { code: "handle_locked", message: "x" } }),
    });
    expect(await screen.findByText(profile.handle.errors.locked)).toBeOnTheScreen();
  });

  it("puts the daily limit under the handle", async () => {
    const me = newMember();
    await fillAndPick(me, {
      "PATCH /me/profile": profileOk(me),
      "PUT /me/photo": json(200, PHOTO),
      "PUT /me/handle": json(429, { error: { code: "rate_limited", message: "x" } }),
    });
    expect(await screen.findByText(profile.handle.errors.limit)).toBeOnTheScreen();
  });

  it("says offline above Save when nothing could be sent", async () => {
    const me = newMember();
    await fillAndPick(me, { "PATCH /me/profile": new Error("dead network") });
    expect(await screen.findByText(profile.errors.offline)).toBeOnTheScreen();
  });

  it("says so when the picture file cannot be read back", async () => {
    read.mockRejectedValue(new Error("gone"));
    const me = newMember();
    await fillAndPick(me, { "PATCH /me/profile": profileOk(me) });
    expect(await screen.findByText(profile.photo.errors.unreadable)).toBeOnTheScreen();
    expect(PHOTO_UNREADABLE).toBe("photo_unreadable");
  });

  it("sends only what is left when the person saves again", async () => {
    const me = newMember();
    const app = await fillAndPick(me, {
      "PATCH /me/profile": profileOk(me),
      "PUT /me/photo": json(200, PHOTO),
      "PUT /me/handle": [json(500, { error: { code: "server_error", message: "x" } }), json(200, { state: "pending" })],
    });
    expect(await screen.findByText(profile.errors.server)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("save"));
    await waitFor(() => expect(app.transport.callsTo("PUT /me/handle")).toHaveLength(2));
    expect(app.transport.callsTo("PATCH /me/profile")).toHaveLength(1);
    expect(app.transport.callsTo("PUT /me/photo")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("form-error")).not.toBeOnTheScreen());
  });
});

describe("ProfileScreen in Settings", () => {
  it("shows the stored values and says Saved without calling the server when nothing changed", async () => {
    const app = await open(meFixture());
    expect(screen.getByTestId("first-name").props.value).toBe("Ananya");
    expect(screen.getByTestId("handle").props.value).toBe("@ananya.k");
    await fireEvent.press(screen.getByTestId("save"));
    expect(screen.getByTestId("saved")).toBeOnTheScreen();
    expect(app.transport.calls.filter((c) => c.method !== "GET" && !c.url.includes("/auth/"))).toHaveLength(0);
  });

  it("sends only the handle when only the handle changed", async () => {
    const app = await open(meFixture({ handle: { state: "approved" } }), { "PUT /me/handle": json(200, { state: "pending" }) });
    await fireEvent.changeText(screen.getByTestId("handle"), "@ananya.new");
    await fireEvent.press(screen.getByTestId("save"));
    await waitFor(() => expect(app.transport.callsTo("PUT /me/handle")).toHaveLength(1));
    expect(app.transport.callsTo("PATCH /me/profile")).toHaveLength(0);
    expect(app.transport.callsTo("PUT /me/photo")).toHaveLength(0);
    expect(await screen.findByTestId("saved")).toBeOnTheScreen();
  });

  it("has a back button only when given a way back", async () => {
    const onBack = jest.fn();
    await open(meFixture(), {}, onBack);
    await fireEvent.press(screen.getByTestId("back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("has no back button in onboarding", async () => {
    await open(newMember());
    expect(screen.queryByTestId("back")).not.toBeOnTheScreen();
  });
});
