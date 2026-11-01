/**
 * `bun run mobile:dev`: try the app on a phone, a simulator or an emulator with live reload. It starts the seeded staging server
 * (e2e/mobile-server.ts) and Metro for the development build, points the app at the server, lists the test numbers and prints each
 * sign-in code as the server makes it (the fake sender delivers nothing). The development build is installed once
 * (docs/mobile/try-the-app.md); Expo Go cannot run this app, because the app has native modules Expo Go does not ship.
 *
 * Flags:
 *   --host lan|local|<address>  where the phone finds this machine. `lan` (the default) is this machine's Wi-Fi or Ethernet address,
 *                               for a phone on the same network. `local` keeps the variant defaults: 10.0.2.2 on the Android
 *                               emulator and localhost on the iOS simulator.
 *   --api-url <url>             the server address the app uses, for a server behind a tunnel or somewhere else. It wins over --host.
 *   --port <n>                  the server port (3000).
 *   --metro-port <n>            the Metro port (8081).
 */
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { SEED_MEET_MEMBERS, SEED_MEMBERS, type SeedMember, seedPhone } from "./seed-staging.js";

/** Interface names that are never the network a phone is on: containers, VMs and VPN tunnels. */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vmnet|vboxnet|utun|tun|tap|lo|bridge|awdl|llw|zt|tailscale)/;

/**
 * The address a phone on the same network can reach this machine at: the first private IPv4 address on a real interface, else the
 * first IPv4 address that is not internal. Null when there is none (no network, or only containers and tunnels).
 */
export function pickLanAddress(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | null {
  const candidates: string[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    if (VIRTUAL_INTERFACE.test(name)) continue;
    for (const info of infos ?? []) if (info.family === "IPv4" && !info.internal) candidates.push(info.address);
  }
  const isPrivate = (address: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
  return candidates.find(isPrivate) ?? candidates[0] ?? null;
}

export type DevTarget = { apiUrl: string | null; packagerHost: string | null };

/**
 * What the app and Metro are told: `apiUrl` becomes EXPO_PUBLIC_API_URL (null keeps the variant's emulator and simulator defaults),
 * `packagerHost` becomes REACT_NATIVE_PACKAGER_HOSTNAME, so the QR code carries the same address the server is on.
 */
export function devTarget(options: { host: string; apiUrl?: string; port: number; lanAddress: string | null }): DevTarget {
  const { host, apiUrl, port, lanAddress } = options;
  const address = host === "lan" ? lanAddress : host === "local" ? null : host;
  if (host === "lan" && address === null && !apiUrl) {
    throw new Error("No network address found for --host lan. Join a network, or pass --host local or --host <address>.");
  }
  return { apiUrl: apiUrl ?? (address === null ? null : `http://${address}:${port}`), packagerHost: address };
}

const DESCRIBE: Record<string, string> = {
  new: "new member, starts at onboarding",
  handle_pending: "Instagram check pending",
  handle_rejected: "Instagram handle rejected",
  matchable: "ready to join shows (women-only groups)",
  waiting: "has a plan, waiting for a group",
  grouped_before_reveal: "in a group, before the reveal",
  meet_card_live: "group meets today",
  group_of_3: "in a group of three",
  done: "after a show",
  suspended: "suspended",
  stopped: "stopped",
  banned: "banned",
  undeliverable: "WhatsApp cannot reach this number",
};

/** One line per test number: the number to type, the name and what state the member is in. */
export function seedTable(members: readonly SeedMember[] = [...SEED_MEMBERS, ...SEED_MEET_MEMBERS]): string {
  return members
    .map((member) => `  ${seedPhone(member)}  ${(member.firstName ?? "-").padEnd(6)} ${DESCRIBE[member.state] ?? member.state}`)
    .join("\n");
}

/**
 * What happens to one line of the server's request log: `hide` drops the `/__test/` requests this script makes itself, `signIn` is
 * true when the app has just asked for a sign-in code, so the codes are read then and not on a timer.
 */
export function readLogLine(line: string): { hide: boolean; signIn: boolean } {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return { hide: false, signIn: false };
  }
  if (typeof entry !== "object" || entry === null) return { hide: false, signIn: false };
  const { method, route, status } = entry as { method?: unknown; route?: unknown; status?: unknown };
  if (typeof route !== "string") return { hide: false, signIn: false };
  return { hide: route.startsWith("/__test/"), signIn: method === "POST" && route === "/auth/otp" && status === 200 };
}

/** Asks the server for the last sign-in code of each test number and prints the ones that changed. Never throws. */
async function printNewCodes(serverUrl: string, token: string, printed: Map<string, string>): Promise<void> {
  const phones = [...SEED_MEMBERS, ...SEED_MEET_MEMBERS].map(seedPhone);
  await Promise.all(
    phones.map(async (phone) => {
      try {
        const response = await fetch(`${serverUrl}/api/app/v1/__test/otp`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-staging-test-token": token },
          body: JSON.stringify({ phone }),
        });
        if (!response.ok) return;
        const { code } = (await response.json()) as { code: string };
        if (printed.get(phone) === code) return;
        printed.set(phone, code);
        console.log(`\n>>> sign-in code for ${phone}: ${code}\n`);
      } catch {
        // the server is stopping or busy: the next round asks again
      }
    }),
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "lan" },
      "api-url": { type: "string" },
      port: { type: "string", default: "3000" },
      "metro-port": { type: "string", default: "8081" },
    },
  });
  const port = Number(values.port);
  const target = devTarget({ host: values.host, apiUrl: values["api-url"], port, lanAddress: pickLanAddress(os.networkInterfaces()) });

  // Imported here, so the tests of the helpers above do not load the server.
  const { startMobileServer } = await import("../e2e/mobile-server.js");
  const serverUrl = `http://localhost:${port}`;
  // The server is new, so it holds no codes yet: every code it answers with from here on is one the app asked for.
  const printed = new Map<string, string>();
  let token = "";
  const server = await startMobileServer({
    port,
    log: (line) => {
      const { hide, signIn } = readLogLine(line);
      if (!hide) console.log(line);
      if (signIn && token) void printNewCodes(serverUrl, token, printed);
    },
  });
  token = server.testToken;

  console.log(`\nServer: ${target.apiUrl ?? `${serverUrl} (10.0.2.2:${port} on the Android emulator)`}`);
  console.log("Test numbers (type the full number on the sign-in screen):");
  console.log(seedTable());
  console.log("Each sign-in code shows here when the app asks for one.\n");

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    APP_VARIANT: "development",
    EXPO_PUBLIC_GROUPS_ENABLED: "1",
    DEV_API_PORT: String(port),
  };
  if (target.apiUrl) env.EXPO_PUBLIC_API_URL = target.apiUrl;
  if (target.packagerHost) env.REACT_NATIVE_PACKAGER_HOSTNAME = target.packagerHost;
  const metro = Bun.spawn(["bunx", "expo", "start", "--dev-client", "--port", values["metro-port"]], {
    cwd: path.join(import.meta.dir, "..", "apps", "mobile"),
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });

  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    metro.kill();
    await server.stop();
    process.exit(code);
  };
  process.on("SIGINT", () => void stop(0));
  process.on("SIGTERM", () => void stop(0));
  void metro.exited.then((code) => stop(code ?? 0));
}

if (import.meta.main) await main();
