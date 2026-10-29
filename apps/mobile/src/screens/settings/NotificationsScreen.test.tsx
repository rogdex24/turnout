import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
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
});
