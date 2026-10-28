import { fontScaling, typography } from "@turnout/design-tokens";
import { fontVariantFor, scalingFor, textClass } from "./typography";

const WEIGHT: Record<string, string> = {
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
};

describe("textClass", () => {
  test("has one entry per type token, with the token's family, weight and size utility", () => {
    for (const [token, style] of Object.entries(typography)) {
      const classes = (textClass as Record<string, string>)[token];
      expect(classes).toBeDefined();
      expect(classes).toContain(style.fontFamily === "Inter" ? "font-sans" : "font-display");
      expect(classes).toContain(WEIGHT[style.fontWeight]);
      expect(classes?.split(" ")).toContain(`text-${token}`);
    }
    expect(Object.keys(textClass).sort()).toEqual(Object.keys(typography).sort());
  });
});

test("font scaling and tabular figures come from the tokens", () => {
  expect(scalingFor("display")).toEqual(fontScaling.display);
  expect(scalingFor("display-hero")).toEqual({ allowFontScaling: false });
  expect(fontVariantFor("badge")).toEqual(["tabular-nums"]);
  expect(fontVariantFor("body")).toBeUndefined();
});
