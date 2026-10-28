import { CATEGORIES, CATEGORY_ICON } from "@turnout/contract/category";
import * as Phosphor from "phosphor-react-native";
import { CATEGORY_GLYPH } from "./CategoryIcon";

const pascal = (kebab: string) =>
  kebab
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

test("every category has the glyph the contract names", () => {
  const icons = Phosphor as unknown as Record<string, unknown>;
  for (const category of CATEGORIES) {
    expect(icons[pascal(CATEGORY_ICON[category])]).toBeDefined();
    expect(CATEGORY_GLYPH[category]).toBe(icons[pascal(CATEGORY_ICON[category])]);
  }
});
