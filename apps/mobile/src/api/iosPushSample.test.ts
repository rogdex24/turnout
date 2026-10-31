import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VARIANT_CONFIG } from "../../config/variants";
import { createApiClient } from "./client";
import { createConnectivity } from "./connectivity";
import { resolveTapRoute } from "./notifications";
import { routedTransport } from "./testing";

// The sample payload that ci/ios-push-check.sh sends with `xcrun simctl push`, and the flows that wrap it. Nothing here runs a
// simulator: it checks that the payload is in the shape the Expo push service sends, that expo-notifications hands the app the data
// of it, and that the app's tap routing sends that data where tap.yaml expects to land.
const maestro = join(__dirname, "../../.maestro");
const read = (file: string) => readFileSync(join(maestro, file), "utf8");
const sample = JSON.parse(read("push/handle-rejected.json")) as {
  aps: { alert: { title: string } };
  body: unknown;
  [key: string]: unknown;
};

describe("the iOS push sample", () => {
  it("opens the social handle screen through the app's tap routing", async () => {
    const net = routedTransport({});
    const api = createApiClient({
      origin: "http://test.local",
      session: { accessToken: async () => "tok", refreshAfterUnauthorised: async () => null, signOut: async () => undefined },
      connectivity: createConnectivity(),
      transport: net.transport,
    });
    // expo-notifications gives a remote push's handler the `body` entry of the payload as its data (NotificationRecords.swift).
    expect(await resolveTapRoute(api, sample.body)).toBe("/settings/social");
    expect(net.calls).toHaveLength(0);
  });

  it("is a visible alert, so the simulator shows a banner to tap", () => {
    expect(sample.aps.alert.title).not.toBe("");
    expect(sample.aps).not.toHaveProperty("content-available");
  });

  it("is sent to the e2e app that both flows drive", () => {
    for (const file of ["push/arm.yaml", "push/tap.yaml"]) {
      expect(read(file)).toContain(`appId: ${VARIANT_CONFIG.e2e.bundleId}\n`);
    }
  });

  it("is tapped by the title the payload carries, and the flow ends on the screen the route names", () => {
    const tap = read("push/tap.yaml");
    expect(tap).toContain(`tapOn: "${sample.aps.alert.title}"`);
    expect(tap).toContain("id: settings-social");
  });
});
