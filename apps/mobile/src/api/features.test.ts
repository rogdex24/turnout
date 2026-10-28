import { groupsEnabled, parseFlag } from "./features";

describe("parseFlag", () => {
  it.each([
    ["1", true],
    ["true", true],
    [" TRUE ", true],
    ["0", false],
    ["false", false],
    ["yes", false],
    ["", false],
    [undefined, false],
  ])("%p is %p", (value, expected) => {
    expect(parseFlag(value)).toBe(expected);
  });
});

describe("groupsEnabled", () => {
  const saved = process.env.EXPO_PUBLIC_GROUPS_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_GROUPS_ENABLED;
    else process.env.EXPO_PUBLIC_GROUPS_ENABLED = saved;
  });

  it("is off when the variable is not set", () => {
    delete process.env.EXPO_PUBLIC_GROUPS_ENABLED;
    expect(groupsEnabled()).toBe(false);
  });

  it("is on when the variable is 1", () => {
    process.env.EXPO_PUBLIC_GROUPS_ENABLED = "1";
    expect(groupsEnabled()).toBe(true);
  });
});
