import { render, screen } from "@testing-library/react-native";
import { clearTestClients, json } from "@/api/testing";
import { settings } from "@/copy/settings";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { BlockedScreen } from "./BlockedScreen";

afterEach(() => clearTestClients());

async function open(reply: ReturnType<typeof json> | Error) {
  const app = await createTestApp({ me: meFixture(), welcomeSeen: true, routes: { "GET /me/blocked": reply } });
  app.queryClient.setQueryDefaults(["blocked"], { retry: false });
  await render(
    <AppProviders deps={app.deps}>
      <BlockedScreen onBack={() => undefined} />
    </AppProviders>,
  );
  return app;
}

describe("BlockedScreen", () => {
  it("lists the people by first name with the show they met at, and nothing to undo", async () => {
    await open(json(200, { blocked: [{ firstName: "Rohan", showTitle: "Comedy Night", date: "2026-10-30T14:30:00.000Z" }] }));
    expect(await screen.findByText("Rohan")).toBeOnTheScreen();
    expect(screen.getByTestId("blocked-list")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /unblock/i })).toBeNull();
  });

  it("says plainly when nobody is blocked", async () => {
    await open(json(200, { blocked: [] }));
    expect(await screen.findByText(settings.blocked.empty.title)).toBeOnTheScreen();
  });

  it("offers to try again when the list did not load", async () => {
    await open(json(500, { error: { code: "server_error", message: "No." } }));
    expect(await screen.findByText("Try again")).toBeOnTheScreen();
  });
});
