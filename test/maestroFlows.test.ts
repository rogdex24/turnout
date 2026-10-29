import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

// Maestro applies a flow's own env block after the `-e` values, so a default there replaces what CI passes. A default of "" for
// TEST_TOKEN made every sign-in code lookup answer 404 on the devices.
const root = `${import.meta.dir}/../apps/mobile/.maestro`;
const fromCommandLine = ["SERVER_URL", "TEST_TOKEN"];

describe("Maestro flows", () => {
  const files = [...new Glob("**/*.yaml").scanSync(root)];

  test("there are flows to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${file} leaves SERVER_URL and TEST_TOKEN to -e`, async () => {
      const text = await Bun.file(`${root}/${file}`).text();
      const header = text.split("\n---\n")[0] ?? "";
      for (const name of fromCommandLine) expect(header).not.toMatch(new RegExp(`^\\s+${name}:`, "m"));
    });

    // Maestro's back presses the Android system back and does nothing on iOS, so a flow taps the screen's own back button.
    test(`${file} does not use the Android-only back command`, async () => {
      const text = await Bun.file(`${root}/${file}`).text();
      expect(text).not.toMatch(/^\s*- back\s*$/m);
    });

    // The iOS simulator asks before it opens a custom-scheme link and waits for an answer, so every link goes through the subflow
    // that answers it.
    if (file !== "subflows/open-link.yaml") {
      test(`${file} opens links through subflows/open-link.yaml`, async () => {
        const text = await Bun.file(`${root}/${file}`).text();
        expect(text).not.toMatch(/^\s*- openLink:/m);
      });
    }
  }

  // Flows sign the same seeded members in one after another, faster than the per-number limit allows, and the job runs the flows a
  // second time on the same server when the first run fails.
  test("signing in a seeded member empties the rate limits before it asks for a code", async () => {
    const text = await Bun.file(`${root}/subflows/sign-in-seed.yaml`).text();
    const reset = text.indexOf("scripts/reset-limits.js");
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(text.indexOf("send-code.yaml"));
  });

  // On iOS a system banner can take the tap on Skip and open Settings, so the launch and the Skip run again until the notice shows.
  test("opening sign-in retries the launch and the tap on Skip", async () => {
    const text = await Bun.file(`${root}/subflows/open-sign-in.yaml`).text();
    const retry = text.indexOf("- retry:");
    expect(retry).toBeGreaterThan(-1);
    expect(retry).toBeLessThan(text.indexOf("launchApp"));
    expect(retry).toBeLessThan(text.indexOf("welcome-skip"));
  });

  // On iOS the poster is one accessible element named "<title>, <category>", so a bare title never matches it.
  test("no flow asserts a seeded show title as the whole text", async () => {
    for (const file of files) {
      const text = await Bun.file(`${root}/${file}`).text();
      expect(text).not.toMatch(/^\s*- assertVisible: "Seed [^"]*[^*]"$/m);
    }
  });

  // Maestro runs the longest prefix of flowsOrder that it can and treats every later flow as unordered, which still runs after the
  // sequence aborts. after-show moves the server clock past every show, so running it early breaks the re-run in device-run.sh.
  test("every flow in flowsOrder runs, so after-show stays inside the ordered sequence", async () => {
    const config = await Bun.file(`${root}/config.yaml`).text();
    const excluded = [...config.matchAll(/^excludeTags:\n((?:\s+- .+\n)+)/gm)].flatMap((m) =>
      [...(m[1] ?? "").matchAll(/- (\S+)/g)].map((t) => t[1]),
    );
    const order = [...(config.split("flowsOrder:")[1] ?? "").matchAll(/^\s+- (\S+)/gm)].map((m) => m[1]);
    expect(order.length).toBeGreaterThan(0);
    for (const name of order) {
      const text = await Bun.file(`${root}/flows/${name}.yaml`).text();
      const header = text.split("\n---\n")[0] ?? "";
      const tags = [...(header.split("tags:")[1] ?? "").matchAll(/^\s+- (\S+)/gm)].map((m) => m[1]);
      expect({ name, excludedTags: tags.filter((tag) => excluded.includes(tag)) }).toEqual({ name, excludedTags: [] });
    }
    expect(order.at(-1)).toBe("after-show");
  });
});
