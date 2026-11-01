const load = (): ReturnType<typeof import("../app.config").default> => {
  let config: ReturnType<typeof import("../app.config").default> | undefined;
  jest.isolateModules(() => {
    config = require("../app.config").default({ config: {} });
  });
  return config as NonNullable<typeof config>;
};

/** SDK 58 has no `jsEngine` option in its config type: Hermes is the only engine, so a build is bytecode unless a config sets another one. */
type Engines = { jsEngine?: string; android?: { jsEngine?: string }; ios?: { jsEngine?: string } };

describe("start-up cost", () => {
  it("sets no engine other than Hermes, so a release build ships bytecode", () => {
    const config = load() as Engines;
    expect(config.jsEngine ?? "hermes").toBe("hermes");
    expect(config.android?.jsEngine ?? "hermes").toBe("hermes");
    expect(config.ios?.jsEngine ?? "hermes").toBe("hermes");
  });
});
