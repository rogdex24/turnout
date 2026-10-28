import { describe, expect, test } from "bun:test";
import { isMatchable, type MatchableInput, type MissingItem, missingItems } from "../src/social/model/matchable.js";
import { normalizePhone, phoneLast4 } from "../src/social/model/phone.js";
import { indianMobile } from "./appHelpers.js";

const READY: MatchableInput = {
  phoneVerified: true,
  status: "active",
  firstName: "Asha",
  gender: "woman",
  photoKey: "photos/a/b.jpg",
  handleStatus: "approved",
  banned: false,
};

describe("matchable", () => {
  test("a complete member is matchable", () => {
    expect(missingItems(READY)).toEqual([]);
    expect(isMatchable(READY)).toBe(true);
  });

  const cases: [string, Partial<MatchableInput>, MissingItem[]][] = [
    ["phone not verified", { phoneVerified: false }, ["phone"]],
    ["suspended", { status: "suspended" }, ["account"]],
    ["stopped", { status: "stopped" }, ["account"]],
    ["deleted", { status: "deleted" }, ["account"]],
    ["banned number", { banned: true }, ["account"]],
    ["no name", { firstName: null }, ["name"]],
    ["empty name", { firstName: "" }, ["name"]],
    ["no gender", { gender: null }, ["gender"]],
    ["no photo", { photoKey: null }, ["photo"]],
    ["no handle", { handleStatus: null }, ["handle"]],
    ["handle pending", { handleStatus: "pending" }, ["handle"]],
    ["handle rejected", { handleStatus: "rejected" }, ["handle"]],
    [
      "everything missing, in the order the app asks",
      { phoneVerified: false, status: "suspended", firstName: null, gender: null, photoKey: null, handleStatus: null },
      ["phone", "account", "name", "gender", "photo", "handle"],
    ],
  ];
  for (const [name, change, missing] of cases) {
    test(name, () => {
      const input = { ...READY, ...change };
      expect(missingItems(input)).toEqual(missing);
      expect(isMatchable(input)).toBe(false);
    });
  }
});

describe("phone", () => {
  test("Indian mobiles are accepted in the usual spellings and come out as E.164", () => {
    const ten = indianMobile().slice(3);
    const e164 = `+91${ten}`;
    for (const raw of [
      e164,
      `91${ten}`,
      `0${ten}`,
      ten,
      ` ${ten.slice(0, 5)} ${ten.slice(5)} `,
      `+91 ${ten.slice(0, 5)}-${ten.slice(5)}`,
    ]) {
      expect(normalizePhone(raw)).toBe(e164);
    }
  });

  test("landlines, foreign numbers, short numbers and junk are refused", () => {
    for (const raw of ["+912227000000", "+442071838750", "12345", "", "abcdefghij", "+91"]) expect(normalizePhone(raw)).toBeNull();
  });

  test("a foreign number passes only when written out exactly in the allowlist", () => {
    expect(normalizePhone("+12025550100")).toBeNull();
    expect(normalizePhone("+12025550100", ["+12025550100"])).toBe("+12025550100");
    expect(normalizePhone("+1 202 555 0100", ["+12025550100"])).toBe("+12025550100");
    expect(normalizePhone("+12025550101", ["+12025550100"])).toBeNull();
  });

  test("the last four digits", () => {
    expect(phoneLast4("+12025550123")).toBe("0123");
  });
});
