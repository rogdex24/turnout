import { androidIntentFilters, resolveLinkHost } from "./appLinks";
import { VARIANT_CONFIG } from "./variants";

describe("resolveLinkHost", () => {
  it("is null when not set", () => {
    expect(resolveLinkHost({})).toBeNull();
    expect(resolveLinkHost({ APP_LINKS_HOST: "  " })).toBeNull();
  });

  it("reads a go.<domain> host", () => {
    expect(resolveLinkHost({ APP_LINKS_HOST: " Go.Example.com " })).toBe("go.example.com");
  });

  it.each(["example.com", "https://go.example.com", "go.example.com/e/"])("throws for %s", (value) => {
    expect(() => resolveLinkHost({ APP_LINKS_HOST: value })).toThrow(/APP_LINKS_HOST/);
  });
});

describe("androidIntentFilters", () => {
  it("has none without a host", () => {
    expect(androidIntentFilters(null)).toEqual([]);
  });

  it("is one verified https filter for /e/ on the host", () => {
    expect(androidIntentFilters("go.example.com")).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "go.example.com", pathPrefix: "/e/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]);
  });
});

describe("the app config", () => {
  const load = (env: Record<string, string>) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      let config: ReturnType<typeof import("../app.config").default> | undefined;
      jest.isolateModules(() => {
        config = require("../app.config").default({ config: {} });
      });
      return config as NonNullable<typeof config>;
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  };
  const release = {
    APP_VARIANT: "production",
    EXPO_PUBLIC_API_URL: "https://api.example.com",
    GOOGLE_MAPS_ANDROID_API_KEY: "sample-key-not-real",
  };

  it("adds the verified filter and the host to a production build that has APP_LINKS_HOST", () => {
    const config = load({ ...release, APP_LINKS_HOST: "go.example.com" });
    expect(config.android?.intentFilters).toEqual(androidIntentFilters("go.example.com"));
    expect(config.extra?.linkHost).toBe("go.example.com");
  });

  it("has no filter without the host", () => {
    const config = load(release);
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.extra?.linkHost).toBeUndefined();
  });

  it("never adds a filter to the dev, e2e or preview builds, which would take links meant for the real app", () => {
    for (const variant of ["development", "e2e", "preview"]) {
      const config = load({ ...release, APP_VARIANT: variant, APP_LINKS_HOST: "go.example.com" });
      expect(config.android?.intentFilters).toBeUndefined();
    }
  });

  it("has no iOS associated domains", () => {
    const config = load({ ...release, APP_LINKS_HOST: "go.example.com" });
    expect(config.ios?.associatedDomains).toBeUndefined();
  });

  it("keeps the production package the one assetlinks.json names", () => {
    expect(VARIANT_CONFIG.production.bundleId).toBe("com.turnout.app");
  });
});
