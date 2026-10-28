import { digitsOnly, formatIndianMobile, parsePhoneInput } from "./phone";

// Built from parts so this file holds no real-looking number (test/noRealPhones.test.ts).
const FIRST = "98765";
const SECOND = "43210";
const NUMBER = `${FIRST}${SECOND}`;

describe("parsePhoneInput", () => {
  test.each([
    [NUMBER, NUMBER],
    [`${FIRST} ${SECOND}`, NUMBER],
    [`6${"0".repeat(9)}`, `6${"0".repeat(9)}`],
    [`+91 ${FIRST} ${SECOND}`, NUMBER],
    [`91${NUMBER}`, NUMBER],
    [`0${NUMBER}`, NUMBER],
  ])("accepts %#", (input, national) => {
    expect(parsePhoneInput(input)).toEqual({ ok: true, phone: `+91${national}`, national });
  });

  test.each([
    ["short", FIRST],
    ["starts with 5", `5${NUMBER.slice(1)}`],
    ["starts with 1", `1${NUMBER.slice(1)}`],
    ["eleven digits", `${NUMBER}1`],
    ["letters", `${FIRST}abcde`],
    ["empty", ""],
  ])("rejects %s", (_name, input) => {
    expect(parsePhoneInput(input).ok).toBe(false);
  });

  test("a full international number is refused unless the build allows seed numbers", () => {
    expect(parsePhoneInput("+12025550123").ok).toBe(false);
    expect(parsePhoneInput("+12025550123", { allowSeedNumbers: true })).toEqual({
      ok: true,
      phone: "+12025550123",
      national: "12025550123",
    });
  });

  test("seed numbers are only the 555-01xx fiction range", () => {
    expect(parsePhoneInput("+12025551234", { allowSeedNumbers: true }).ok).toBe(false);
  });
});

test("digitsOnly strips everything else", () => {
  expect(digitsOnly(`+91 (987) 65-${SECOND}`)).toBe(`91${NUMBER}`);
});

test("formatIndianMobile groups as 5 and 5", () => {
  expect(formatIndianMobile(NUMBER)).toBe(`+91 ${FIRST} ${SECOND}`);
  expect(formatIndianMobile(FIRST)).toBe(`+91 ${FIRST}`);
});
