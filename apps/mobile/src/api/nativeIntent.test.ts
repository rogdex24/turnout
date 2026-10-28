import { redirectSystemPath } from "./nativeIntent";

// The build's config, as `expo-constants` would read it from the manifest.
const mockConfig: { expoConfig: unknown } = { expoConfig: null };
jest.mock("expo-constants", () => ({
  __esModule: true,
  get default() {
    return mockConfig;
  },
}));

const flag = process.env.EXPO_PUBLIC_GROUPS_ENABLED;

function build(extra: Record<string, unknown>, scheme = "turnout") {
  mockConfig.expoConfig = { scheme, extra };
}

afterEach(() => {
  mockConfig.expoConfig = null;
  if (flag === undefined) delete process.env.EXPO_PUBLIC_GROUPS_ENABLED;
  else process.env.EXPO_PUBLIC_GROUPS_ENABLED = flag;
});

describe("redirectSystemPath", () => {
  it("opens a show from the link host, using the build's host and scheme", () => {
    build({ linkHost: "go.example.com" });
    expect(redirectSystemPath({ path: "https://go.example.com/e/abc123", initial: true })).toBe("/show/abc123");
    expect(redirectSystemPath({ path: "turnout://show/abc123", initial: false })).toBe("/show/abc123");
  });

  it("sends a link to another host, another scheme or another path Home", () => {
    build({ linkHost: "go.example.com" });
    expect(redirectSystemPath({ path: "https://evil.example.com/e/abc123", initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "turnout-dev://show/abc123", initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "https://go.example.com/settings", initial: false })).toBe("/");
  });

  it("accepts no https link in a build with no link host", () => {
    build({});
    expect(redirectSystemPath({ path: "https://go.example.com/e/abc123", initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "turnout://show/abc123", initial: true })).toBe("/show/abc123");
  });

  it("opens the show for a go link until the group flow is on", () => {
    build({ linkHost: "go.example.com" });
    expect(redirectSystemPath({ path: "https://go.example.com/e/abc123/go", initial: true })).toBe("/show/abc123");
    process.env.EXPO_PUBLIC_GROUPS_ENABLED = "1";
    expect(redirectSystemPath({ path: "https://go.example.com/e/abc123/go", initial: true })).toBe("/show/abc123/go");
  });
});
