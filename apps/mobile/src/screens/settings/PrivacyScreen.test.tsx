import { render, screen } from "@testing-library/react-native";
import { NOTICE_PARAGRAPHS, NOTICE_VERSION } from "@turnout/contract/app/notice";
import { clearTestClients } from "@/api/testing";
import { settings } from "@/copy/settings";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { PrivacyScreen } from "./PrivacyScreen";

afterEach(() => clearTestClients());

describe("PrivacyScreen", () => {
  it("shows the consented text with its version, including the WhatsApp (Meta) and banned-only phone hash lines", async () => {
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true });
    app.queryClient.setQueryData(["me"], meFixture());
    await render(
      <AppProviders deps={app.deps}>
        <PrivacyScreen onBack={() => undefined} />
      </AppProviders>,
    );
    expect(screen.getByTestId("privacy-version")).toHaveTextContent(settings.privacy.version(NOTICE_VERSION));
    for (const paragraph of NOTICE_PARAGRAPHS) expect(screen.getByText(paragraph)).toBeOnTheScreen();
    expect(screen.getByText(/WhatsApp, a service of Meta/)).toBeOnTheScreen();
    expect(screen.getByText(/If you are banned, we keep a one-way scrambled form/)).toBeOnTheScreen();
  });
});
