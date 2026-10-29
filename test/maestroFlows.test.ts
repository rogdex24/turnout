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
  }

  // Maestro runs the longest prefix of flowsOrder that it can and treats every later flow as unordered, which still runs after the
  // sequence aborts. after-show moves the server clock past every show, so running it early breaks the retry in device-run.sh.
  test("every flow in flowsOrder runs, so no later flow splits off from the ordered sequence", async () => {
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
  });
});
