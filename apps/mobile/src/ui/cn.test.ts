import { type TypographyToken, typography } from "@turnout/design-tokens";
import { cn } from "./cn";

const tokens = Object.keys(typography) as TypographyToken[];

describe("cn", () => {
  // Text joins its size class with a color (text-ink, then the caller's text-muted). Stock tailwind-merge does not know the type
  // tokens, takes text-body for a color and drops it, so every Text fell back to the platform's default size.
  test.each(tokens)("keeps the type size text-%s next to a text color", (token) => {
    expect(cn(`text-${token}`, "text-ink", "text-muted").split(" ")).toEqual([`text-${token}`, "text-muted"]);
  });

  test("lets a later type size replace an earlier one", () => {
    expect(cn("text-body", "text-ink", "text-meta")).toBe("text-ink text-meta");
  });
});
