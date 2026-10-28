import { memoryKv, PREF_KEYS } from "../api/prefs";
import { createLocalFlags } from "./localFlags";

describe("local flags", () => {
  test("start from what is stored", () => {
    const prefs = memoryKv();
    prefs.set(PREF_KEYS.welcomeSeen, "1");
    prefs.set(PREF_KEYS.acceptedNotice, "2026-10-26");
    expect(createLocalFlags(prefs).getSnapshot()).toEqual({ welcomeSeen: true, acceptedNotice: "2026-10-26" });
    expect(createLocalFlags(memoryKv()).getSnapshot()).toEqual({ welcomeSeen: false, acceptedNotice: null });
  });

  test("write through to the store and tell listeners with a new snapshot", () => {
    const prefs = memoryKv();
    const flags = createLocalFlags(prefs);
    const listener = jest.fn();
    flags.subscribe(listener);
    const before = flags.getSnapshot();

    flags.markWelcomeSeen();
    expect(prefs.getString(PREF_KEYS.welcomeSeen)).toBe("1");
    expect(flags.getSnapshot()).not.toBe(before);
    expect(flags.getSnapshot().welcomeSeen).toBe(true);

    flags.acceptNotice("2026-10-26");
    expect(flags.getSnapshot().acceptedNotice).toBe("2026-10-26");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("forgetting the notice keeps the welcome cards seen", () => {
    const flags = createLocalFlags(memoryKv());
    flags.markWelcomeSeen();
    flags.acceptNotice("2026-10-26");
    flags.forgetNotice();
    expect(flags.getSnapshot()).toEqual({ welcomeSeen: true, acceptedNotice: null });
  });

  test("an unsubscribed listener hears nothing", () => {
    const flags = createLocalFlags(memoryKv());
    const listener = jest.fn();
    flags.subscribe(listener)();
    flags.markWelcomeSeen();
    expect(listener).not.toHaveBeenCalled();
  });

  test("the snapshot is stable between changes", () => {
    const flags = createLocalFlags(memoryKv());
    expect(flags.getSnapshot()).toBe(flags.getSnapshot());
  });
});
