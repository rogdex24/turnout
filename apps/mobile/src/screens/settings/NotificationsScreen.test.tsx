import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { nativePush } from "@/api/pushNative";
import { clearTestClients } from "@/api/testing";
import { settings } from "@/copy/settings";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { NotificationsScreen } from "./NotificationsScreen";

afterEach(() => clearTestClients());

describe("NotificationsScreen", () => {
  it("says where the phone's permission stands and what we send", async () => {
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true });
    await render(
      <AppProviders deps={app.deps}>
        <NotificationsScreen onBack={() => undefined} />
      </AppProviders>,
    );
    expect(await screen.findByText(settings.notifications.status.undetermined)).toBeOnTheScreen();
    expect(screen.getByText(settings.notifications.hint.undetermined)).toBeOnTheScreen();
  });

  it("opens the phone's settings, and goes back", async () => {
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const onBack = jest.fn();
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true });
    await render(
      <AppProviders deps={app.deps}>
        <NotificationsScreen onBack={onBack} />
      </AppProviders>,
    );
    await fireEvent.press(screen.getByTestId("notifications-open-settings"));
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it("asks the system's question while it was never asked, then shows the answer and drops the button", async () => {
    const request = jest.spyOn(nativePush, "requestPermission").mockResolvedValue({ status: "granted", canAskAgain: true });
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true });
    await render(
      <AppProviders deps={app.deps}>
        <NotificationsScreen onBack={() => undefined} />
      </AppProviders>,
    );
    await fireEvent.press(await screen.findByTestId("notifications-ask"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(settings.notifications.status.granted)).toBeOnTheScreen();
    expect(screen.queryByTestId("notifications-ask")).toBeNull();
    request.mockRestore();
  });

  it("does not offer the question once the phone has answered it", async () => {
    const read = jest.spyOn(nativePush, "permission").mockResolvedValue({ status: "denied", canAskAgain: false });
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true });
    await render(
      <AppProviders deps={app.deps}>
        <NotificationsScreen onBack={() => undefined} />
      </AppProviders>,
    );
    expect(await screen.findByText(settings.notifications.status.denied)).toBeOnTheScreen();
    expect(screen.queryByTestId("notifications-ask")).toBeNull();
    read.mockRestore();
  });
});
