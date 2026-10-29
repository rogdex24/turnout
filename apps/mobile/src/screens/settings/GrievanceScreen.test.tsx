import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { queryKeys } from "@/api/keys";
import { clearTestClients, json } from "@/api/testing";
import { settings } from "@/copy/settings";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { SAMPLE_CONFIG } from "../notice/fixtures";
import { GrievanceScreen } from "./GrievanceScreen";

afterEach(() => clearTestClients());

const REAL = { name: "A. Rao", address: "12 MG Road, Bengaluru 560001", email: "grievance@desk.example.com", phone: "+44 20 7946 0123" };

async function open(config: ReturnType<typeof json>) {
  const app = await createTestApp({ me: meFixture(), welcomeSeen: true, routes: { "GET /config": config } });
  app.queryClient.setQueryDefaults(queryKeys.config(), { retry: false });
  await render(
    <AppProviders deps={app.deps}>
      <GrievanceScreen onBack={() => undefined} />
    </AppProviders>,
  );
}

describe("GrievanceScreen", () => {
  it("shows the officer from the server, with the email and phone one tap each", async () => {
    const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await open(json(200, { ...SAMPLE_CONFIG, grievance: REAL }));
    expect(await screen.findByText(REAL.name)).toBeOnTheScreen();
    expect(screen.getByText(REAL.address)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("grievance-email"));
    expect(openUrl).toHaveBeenCalledWith("mailto:grievance@desk.example.com");
    await fireEvent.press(screen.getByTestId("grievance-phone"));
    expect(openUrl).toHaveBeenCalledWith("tel:+442079460123");
    openUrl.mockRestore();
  });

  it("says details not set on a dev or staging server, and offers nothing to tap", async () => {
    await open(json(200, SAMPLE_CONFIG));
    expect(await screen.findByText(settings.grievance.notSet.title)).toBeOnTheScreen();
    expect(screen.queryByTestId("grievance-email")).toBeNull();
    expect(screen.queryByTestId("grievance-phone")).toBeNull();
  });

  it("says when the details did not load, and tries again on a tap", async () => {
    await open(json(500, { error: { code: "server_error", message: "No." } }));
    expect(await screen.findByText(settings.grievance.failed)).toBeOnTheScreen();
    expect(screen.getByTestId("grievance-retry")).toBeOnTheScreen();
  });
});
