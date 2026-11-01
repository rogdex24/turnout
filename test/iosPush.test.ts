import { describe, expect, test } from "bun:test";

// F26 and A14: the iOS device job sends a sample push with `xcrun simctl push` and Maestro taps it. The routing of the sample is
// tested in apps/mobile/src/api/iosPushSample.test.ts; this keeps the script and the CI step wired to the same files.
const mobile = `${import.meta.dir}/../apps/mobile`;

describe("the iOS push check", () => {
  test("the script sends the sample to the booted simulator between the two flows", async () => {
    const script = await Bun.file(`${mobile}/.maestro/ci/ios-push-check.sh`).text();
    const arm = script.indexOf("run_flow arm");
    const push = script.indexOf('xcrun simctl push booted "$app_id" "$payload"');
    const tap = script.indexOf("run_flow tap");
    expect(arm).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(arm);
    expect(tap).toBeGreaterThan(push);
    expect(script).toContain('payload="$here/push/handle-rejected.json"');
    expect(await Bun.file(`${mobile}/.maestro/push/handle-rejected.json`).exists()).toBe(true);
  });

  test("the flows are not in the workspace, which would run them without a push", async () => {
    const config = await Bun.file(`${mobile}/.maestro/config.yaml`).text();
    expect(config).toContain('"flows/*.yaml"');
    expect(config).not.toContain("push/");
  });

  test("ios-device runs the script after the flows, on one target", async () => {
    const ci = await Bun.file(`${import.meta.dir}/../.github/workflows/ci.yml`).text();
    const job = ci.slice(ci.indexOf("\n  ios-device:"), ci.indexOf("\n  ci-gate:"));
    const flows = job.indexOf("apps/mobile/.maestro/ci/device-run.sh");
    const push = job.indexOf("apps/mobile/.maestro/ci/ios-push-check.sh");
    expect(flows).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(flows);
    expect(job.slice(job.lastIndexOf("- name:", push), push)).toContain("if: matrix.target == 'ios-small'");
  });
});
