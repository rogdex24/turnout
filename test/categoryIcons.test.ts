import { expect, test } from "bun:test";
import fs from "node:fs";
import { buildSprite, spriteUrlModule } from "../scripts/build-category-sprite.js";
import { CATEGORIES, CATEGORY_ICON, iconCategory } from "../src/catalog/category.js";
import { CATEGORY_SPRITE_URL } from "../src/web/icons/spriteUrl.js";
import { iconSpriteResponse } from "../src/web/icons.js";

test("every category has a glyph and a symbol in the sprite", () => {
  const svg = fs.readFileSync("src/web/icons/categories.svg", "utf8");
  for (const category of CATEGORIES) {
    expect(CATEGORY_ICON[category]).toBeTruthy();
    expect(svg).toContain(`<symbol id="${category}" `);
  }
  expect(svg.match(/<symbol /g)?.length).toBe(CATEGORIES.length);
  expect(iconCategory("not-a-category")).toBe("other");
});

test("the committed sprite and its URL are what `bun run icons` writes from the Phosphor package", () => {
  const { svg, url } = buildSprite();
  expect(fs.readFileSync("src/web/icons/categories.svg", "utf8")).toBe(svg);
  expect(fs.readFileSync("src/web/icons/spriteUrl.ts", "utf8")).toBe(spriteUrlModule(url));
  expect(svg).toContain("MIT License");
});

test("the sprite is served from its hashed URL, immutable, and nowhere else", async () => {
  const res = iconSpriteResponse(CATEGORY_SPRITE_URL)!;
  expect(res.headers.get("content-type")).toBe("image/svg+xml");
  expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(iconSpriteResponse("/assets/icons/categories.0000000000.svg")).toBeNull();
});
