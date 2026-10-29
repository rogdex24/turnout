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
});
