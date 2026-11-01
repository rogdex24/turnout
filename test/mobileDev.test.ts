import { describe, expect, test } from "bun:test";
import type os from "node:os";
import { devTarget, pickLanAddress, readLogLine, seedTable } from "../scripts/mobile-dev.js";
import { SEED_MEET_MEMBERS, SEED_MEMBERS } from "../scripts/seed-staging.js";

const ipv4 = (address: string, internal = false): os.NetworkInterfaceInfo => ({
  address,
  netmask: "255.255.255.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal,
  cidr: null,
});

describe("pickLanAddress", () => {
  test("takes the Wi-Fi address and skips loopback and containers", () => {
    expect(
      pickLanAddress({
        lo: [ipv4("127.0.0.1", true)],
        docker0: [ipv4("172.17.0.1")],
        "br-1a2b": [ipv4("172.18.0.1")],
        en0: [ipv4("192.168.1.23")],
      }),
    ).toBe("192.168.1.23");
  });

  test("prefers a private address over a public one", () => {
    expect(pickLanAddress({ eth0: [ipv4("203.0.113.5")], eth1: [ipv4("10.0.0.7")] })).toBe("10.0.0.7");
  });

  test("falls back to a public address, and to null when there is none", () => {
    expect(pickLanAddress({ eth0: [ipv4("203.0.113.5")] })).toBe("203.0.113.5");
    expect(pickLanAddress({ lo: [ipv4("127.0.0.1", true)], docker0: [ipv4("172.17.0.1")] })).toBeNull();
  });
});

describe("devTarget", () => {
  test("lan points the app and the QR code at this machine's address", () => {
    expect(devTarget({ host: "lan", port: 3000, lanAddress: "192.168.1.23" })).toEqual({
      apiUrl: "http://192.168.1.23:3000",
      packagerHost: "192.168.1.23",
    });
  });

  test("local keeps the emulator and simulator defaults", () => {
    expect(devTarget({ host: "local", port: 3000, lanAddress: "192.168.1.23" })).toEqual({ apiUrl: null, packagerHost: null });
  });

  test("an explicit address and --api-url win", () => {
    expect(devTarget({ host: "10.1.2.3", port: 4000, lanAddress: null })).toEqual({
      apiUrl: "http://10.1.2.3:4000",
      packagerHost: "10.1.2.3",
    });
    expect(devTarget({ host: "lan", apiUrl: "https://api.example.test", port: 3000, lanAddress: null })).toEqual({
      apiUrl: "https://api.example.test",
      packagerHost: null,
    });
  });

  test("lan with no network address is an error that names the way out", () => {
    expect(() => devTarget({ host: "lan", port: 3000, lanAddress: null })).toThrow("--host local");
  });
});

test("seedTable lists every test number once, with its state", () => {
  const lines = seedTable().split("\n");
  expect(lines).toHaveLength(SEED_MEMBERS.length + SEED_MEET_MEMBERS.length);
  expect(lines[0]).toContain("+12025550101");
  expect(lines[0]).toContain("starts at onboarding");
  expect(lines.every((line) => /\+1202555\d{4}/.test(line))).toBe(true);
});

describe("readLogLine", () => {
  const line = (entry: object) => JSON.stringify({ at: "2026-11-01T00:00:00.000Z", ms: 1, ...entry });

  test("hides the script's own /__test/ requests", () => {
    expect(readLogLine(line({ method: "POST", route: "/__test/otp", status: 404 }))).toEqual({ hide: true, signIn: false });
  });

  test("a sign-in code the server sent is a sign-in, a refused one is not", () => {
    expect(readLogLine(line({ method: "POST", route: "/auth/otp", status: 200 }))).toEqual({ hide: false, signIn: true });
    expect(readLogLine(line({ method: "POST", route: "/auth/otp", status: 429 }))).toEqual({ hide: false, signIn: false });
    expect(readLogLine(line({ method: "POST", route: "/auth/otp/verify", status: 200 }))).toEqual({ hide: false, signIn: false });
  });

  test("a line that is not a request log is shown as it is", () => {
    expect(readLogLine("Listening on http://localhost:3000")).toEqual({ hide: false, signIn: false });
    expect(readLogLine("null")).toEqual({ hide: false, signIn: false });
  });
});

describe("the development builds", () => {
  const root = `${import.meta.dir}/..`;

  test("both build scripts make the development variant, with no JS bundle and no e2e switches", async () => {
    for (const script of ["build-dev-android.sh", "build-dev-ios.sh"]) {
      const text = await Bun.file(`${root}/apps/mobile/ci/${script}`).text();
      expect(text).toContain("export APP_VARIANT=development");
      expect(text).not.toContain("ci/env.sh");
      expect(text).not.toContain("ALLOW_CAPTURE");
      expect(text).not.toMatch(/Release/);
    }
  });

  test("the workflow needs no secrets and uploads both builds", async () => {
    const workflow = await Bun.file(`${root}/.github/workflows/mobile-dev-build.yml`).text();
    expect(workflow).not.toContain("secrets.");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("apps/mobile/ci/build-dev-android.sh");
    expect(workflow).toContain("apps/mobile/ci/build-dev-ios.sh");
    expect(workflow).toContain("name: turnout-dev-android");
    expect(workflow).toContain("name: turnout-dev-ios-simulator");
  });
});
