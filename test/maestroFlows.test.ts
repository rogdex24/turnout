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

    // Airplane mode does not cut the emulator off from the host at 10.0.2.2, and Maestro cannot turn it on in the iOS simulator, so a
    // flow cuts the connection at the server with scripts/network.js.
    test(`${file} does not use airplane mode`, async () => {
      const text = await Bun.file(`${root}/${file}`).text();
      expect(text).not.toMatch(/setAirplaneMode|toggleAirplaneMode/);
    });

    // On iOS a system gesture took the tap on Back more than once and the screen stayed open, so every Back goes through the subflow
    // that taps again when the screen before it does not come.
    if (file !== "subflows/back-to.yaml") {
      test(`${file} taps Back through subflows/back-to.yaml`, async () => {
        const text = await Bun.file(`${root}/${file}`).text();
        expect(text).not.toMatch(/^\s*id: back\s*$/m);
      });
    }

    // The iOS simulator asks before it opens a custom-scheme link and waits for an answer, so every link goes through the subflow
    // that answers it. The visual capture answers it inside its own retry, without the subflow's 10 s wait, since it runs 200 times.
    if (file === "visual/capture-story.yaml") {
      test(`${file} answers the Open prompt inside the retry that waits for the story`, async () => {
        const text = await Bun.file(`${root}/${file}`).text();
        const retry = text.indexOf("- retry:");
        expect(retry).toBeGreaterThan(text.indexOf("- openLink:"));
        expect(text.indexOf('visible: "Open in .Turnout.*"', retry)).toBeGreaterThan(retry);
        expect(text.indexOf("${READY_TEXT}", retry)).toBeGreaterThan(retry);
      });
    } else if (file !== "subflows/open-link.yaml") {
      test(`${file} opens links through subflows/open-link.yaml`, async () => {
        const text = await Bun.file(`${root}/${file}`).text();
        expect(text).not.toMatch(/^\s*- openLink:/m);
      });
    }
  }

  // Flows sign the same seeded members in one after another, faster than the per-number limit allows.
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

  // Once on iOS the tap on "Go with a group" came while the link was still opening the show, and the sheet never came.
  test("starting a plan retries the tap on Go with a group", async () => {
    const text = await Bun.file(`${root}/subflows/start-plan.yaml`).text();
    const retry = text.indexOf("- retry:");
    expect(retry).toBeGreaterThan(-1);
    expect(retry).toBeLessThan(text.indexOf("id: show-go"));
  });

  // Once on iOS the simulator closed its "Open in" prompt and the app never got the link. A link that should open a screen of its
  // own goes through open-link-to.yaml, which opens it again when the screen does not come.
  test("a link and a wait for its own screen go through open-link-to.yaml", async () => {
    const subflow = await Bun.file(`${root}/subflows/open-link-to.yaml`).text();
    expect(subflow.indexOf("- retry:")).toBeGreaterThan(-1);
    expect(subflow.indexOf("- retry:")).toBeLessThan(subflow.indexOf("open-link.yaml"));
    for (const file of files) {
      const text = await Bun.file(`${root}/${file}`).text();
      expect(text).not.toMatch(/open-link\.yaml\n\s+env:\n\s+LINK: .*\n- extendedWaitUntil:\n\s+visible:\n\s+id: (?!home\b)/);
    }
  });

  // The meet card has an "Open in Maps" button, so a prompt match that does not name the app took it for the link prompt.
  test("the link prompt is matched by the app's name", async () => {
    const text = await Bun.file(`${root}/subflows/open-link.yaml`).text();
    expect(text).not.toMatch(/visible: "Open in \.\*"/);
    expect(text).toMatch(/visible: "Open in \.Turnout\.\*"/);
  });

  // On iOS the poster is one accessible element named "<title>, <category>", so a bare title never matches it.
  test("no flow asserts a seeded show title as the whole text", async () => {
    for (const file of files) {
      const text = await Bun.file(`${root}/${file}`).text();
      expect(text).not.toMatch(/^\s*- assertVisible: "Seed [^"]*[^*]"$/m);
    }
  });

  // On iOS the tab bar floats over the bottom of the You list and Maestro calls a row under it visible, so a tap there hits the bar.
  test("every call to the operator passes TEXT, and the subflow sets no default that would replace it", async () => {
    const subflow = await Bun.file(`${root}/subflows/operator.yaml`).text();
    expect(subflow.split("\n---\n")[0]).not.toMatch(/^env:/m);
    for (const file of files) {
      const text = await Bun.file(`${root}/${file}`).text();
      for (const block of text.match(/file: (?:\.\.\/subflows\/)?operator\.yaml\n(?: {4}.*\n)+/g) ?? []) {
        expect(block).toMatch(/^\s+TEXT:/m);
      }
    }
  });

  test("every scroll to a You row centers it", async () => {
    for (const file of files) {
      const text = await Bun.file(`${root}/${file}`).text();
      for (const block of text.match(/- scrollUntilVisible:\n(?: {4}.*\n)+/g) ?? []) {
        if (/id: you-/.test(block)) expect(block).toContain("centerElement: true");
      }
    }
  });

  // Flows change the seeded plans and groups, so a second pass on the same server checks different data. After a device drop on
  // Android the run goes on from the flow that dropped, with a config that lists only that flow and the ones after it. In run
  // 41202152196 the emulator dropped twice, so the run goes on after up to three drops.
  test("the device job runs the flows once, going on after a device drop", async () => {
    const text = await Bun.file(`${root}/ci/device-run.sh`).text();
    const flows = text.slice(text.indexOf('echo "::group::flows"'), text.indexOf('echo "::group::visual capture"'));
    const runs = [...flows.matchAll(/maestro test (.*)$/gm)].map((m) => m[1] ?? "");
    expect(runs).toHaveLength(1);
    // The first pass has no config; each resume sets it to the resume list.
    expect(flows).toContain("config=()");
    expect(flows).toContain('config=(--config "$resume_config")');
    expect(flows).toContain("max_drops=3");
    expect(flows).toMatch(
      /\[ "\$platform" != android \] \|\| \[ -z "\$failed" \] \|\| ! dropped "\$out" "\$failed" \|\| \[ "\$drops" -ge "\$max_drops" \]; then/,
    );
    // The resume list starts at the failed flow, so the flows before it never run twice.
    expect(flows).toContain('sed -n "/^$failed\\$/,\\$p"');
    expect(text).not.toMatch(/^(\w+) \|\| \1$/m);
  });

  // A device that drops during takeScreenshot leaves a cut-off PNG. In run 41193468137 one counted as a shot, so the story was not
  // captured again and odiff could not read it. find_shot skips a file without the PNG end chunk.
  test("the visual capture counts only a whole PNG as a shot", async () => {
    const text = await Bun.file(`${root}/ci/device-run.sh`).text();
    const findShot = text.match(/^find_shot\(\) \{\n[\s\S]*?^\}$/m)?.[0];
    expect(findShot).toBeDefined();
    const dir = (await Bun.$`mktemp -d`.text()).trim();
    // A 1x1 PNG: signature, IHDR, IDAT and IEND.
    const whole = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5b3b1a10000000049454e44ae426082",
      "hex",
    );
    await Bun.write(`${dir}/cut/home.png`, whole.subarray(0, 40));
    await Bun.write(`${dir}/whole/home.png`, whole);
    const run = (folders: string) => Bun.$`bash -c ${`${findShot}\nfind_shot home ${folders}`}`.quiet().nothrow().text();
    expect((await run(`${dir}/cut ${dir}/whole`)).trim()).toBe(`${dir}/whole/home.png`);
    expect((await run(`${dir}/cut`)).trim()).toBe("");
    await Bun.$`rm -rf ${dir}`;
  });

  // The capture writes one flow per story from capture-story.yaml. It may run the batch once more after a device drop and a
  // story again on its own; it never runs a flow from flows/.
  test("the visual capture runs only the story flows it writes, again only one story at a time", async () => {
    const text = await Bun.file(`${root}/ci/device-run.sh`).text();
    const capture = text.slice(text.indexOf('echo "::group::visual capture"'));
    const runs = [...capture.matchAll(/^\s*maestro test (.*)$/gm)].map((m) => m[1] ?? "");
    expect(runs).toHaveLength(3);
    expect(runs.filter((run) => run.includes('"$batch" < /dev/null'))).toHaveLength(2);
    expect(runs.filter((run) => run.includes('"$batch/$folder.yaml"'))).toHaveLength(1);
    const story = await Bun.file(`${root}/visual/capture-story.yaml`).text();
    expect(story).toMatch(/^appId: \S+$/m);
    expect(story.match(/^- takeScreenshot: capture$/gm)).toHaveLength(1);
    // A shot counts as a passed story, so nothing may run after the screenshot.
    expect(story.trimEnd().split("\n").at(-1)).toBe("- takeScreenshot: capture");
    // The folder goes unquoted into sed, grep and a file name.
    const stories: { folder: string }[] = await Bun.file(`${root}/visual/stories.json`).json();
    for (const { folder } of stories) expect(folder).toMatch(/^[a-z0-9-]+$/);
  });

  // Maestro runs the longest prefix of flowsOrder that it can and treats every later flow as unordered, which still runs after the
  // sequence aborts. after-show moves the server clock past every show, so running it early leaves the later flows no shows.
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
