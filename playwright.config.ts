import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT;
const adminPort = process.env.E2E_ADMIN_PORT;
if (!port || !adminPort) throw new Error("Run the browser tests with `bun run e2e`, which picks the fixture server's port.");

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  workers: 2,
  forbidOnly: true,
  // Software WebGL makes the first map frame slow; assertions wait for it.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  metadata: { adminUrl: `http://127.0.0.1:${adminPort}` },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        geolocation: { latitude: 17.4126, longitude: 78.4482 },
        permissions: ["geolocation"],
        // MapLibre needs WebGL; the headless shell has no GPU, so use the software rasteriser.
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
      },
    },
  ],
  webServer: {
    command: "bun e2e/server.ts",
    url: `http://localhost:${port}/map`,
    env: { E2E_PORT: port, E2E_ADMIN_PORT: adminPort },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
