import fs from "node:fs";
import path from "node:path";

const mockLoaded: string[] = [];
jest.mock("@sentry/react-native", () => {
  mockLoaded.push("sentry");
  return {};
});
jest.mock("posthog-react-native", () => {
  mockLoaded.push("posthog");
  return {};
});

describe("the telemetry SDKs", () => {
  test("are not loaded by importing the analytics module, so they add nothing to the start", () => {
    jest.isolateModules(() => {
      require("./index");
    });
    expect(mockLoaded).toEqual([]);
  });

  test("are imported as types everywhere, and required only inside their start functions", () => {
    const sdk = /from "(@sentry\/react-native|posthog-react-native)"/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            if (line.startsWith("import ") && sdk.test(line) && !line.startsWith("import type ")) offenders.push(`${file}: ${line}`);
          }
        }
      }
    };
    walk(path.join(__dirname, ".."));
    expect(offenders).toEqual([]);
  });
});
