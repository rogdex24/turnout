import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** S6: the chrome layout, the one row anatomy, the open event as a card, black emoji in dark mode, and the Vercel spot checks. */
const SIZES = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;

async function openMap(page: Page, path = "/map") {
  await page.goto(path);
  await expect(page.locator(".mk .tile").first()).toBeVisible();
}

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
const boxes = (page: Page, selector: string): Promise<Box[]> =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .filter((el) => !(el as HTMLElement).hidden)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.className || el.tagName, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
    selector,
  );
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

for (const scheme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test.describe(`${size} ${scheme}`, () => {
      test.use({ viewport, colorScheme: scheme });

      test(`S6.1 the top row, the control column and the filter row do not overlap anything (${size}, ${scheme})`, async ({ page }) => {
        await openMap(page);
        const top = await boxes(page, ".map-top > *");
        expect(top.length).toBe(4); // brand, search, List / Map, theme
        const parts = [
          ...top,
          ...(await boxes(page, ".map-controls")),
          ...(await boxes(page, ".pills")),
          ...(await boxes(page, ".count")),
          ...(await boxes(page, "#panel, [data-slot=drawer-popup]")),
        ];
        for (const [i, a] of parts.entries()) {
          expect(a.x, `${a.name} inside the viewport`).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w, `${a.name} inside the viewport`).toBeLessThanOrEqual(viewport.width);
          for (const b of parts.slice(i + 1)) expect(overlap(a, b), `${a.name} overlaps ${b.name}`).toBe(false);
        }
        // The row is one line, top left, in the order brand, search, List / Map, theme.
        expect(new Set(top.map((b) => Math.round(b.y))).size).toBe(1);
        expect(top.map((b) => b.x)).toEqual([...top.map((b) => b.x)].sort((p, q) => p - q));
        for (const b of top) expect(Math.round(b.h)).toBe(36);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "Map" })).toHaveAttribute(
          "aria-current",
          "page",
        );
        await expect(page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "List" })).toHaveAttribute("href", "/");
      });
    });
  }
}

test.describe("desktop placement", () => {
  test("S6.1 the filter row sits bottom left above the count, the controls beside the card, vertically centred", async ({ page }) => {
    await openMap(page);
    const [pills] = await boxes(page, ".pills");
    const [count] = await boxes(page, ".count");
    const [controls] = await boxes(page, ".map-controls");
    const [panel] = await boxes(page, "#panel");
    expect(pills!.x).toBeLessThan(40);
    expect(pills!.y + pills!.h).toBeLessThanOrEqual(count!.y); // above the count
    expect(count!.y + count!.h).toBeGreaterThan(700); // at the bottom
    expect(controls!.x + controls!.w).toBeLessThanOrEqual(panel!.x - 8 + 1); // 8 px from the card
    expect(Math.abs(controls!.y + controls!.h / 2 - 400)).toBeLessThan(4); // vertically centred in the 800 px frame
    // Zoom, zoom, locate; the compass stays away until the map is rotated.
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom out", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Near me" })).toBeVisible();
    await expect(page.locator("#compass")).toBeHidden();
  });

  test("S6.1 zoom buttons move the map and the compass appears once it is rotated, then returns it to north", async ({ page }) => {
    await openMap(page);
    // Labels show from zoom 14; the map starts at 11.5, so three steps in cross the line and three steps out cross it back.
    await expect(page.locator(".map-canvas.labels")).toHaveCount(0);
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator(".map-canvas.labels")).toHaveCount(1);
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator(".map-canvas.labels")).toHaveCount(0);
    // Rotate with the keyboard (the focused map turns on shift + arrow): the compass shows, and a press resets the bearing.
    await page.locator(".maplibregl-canvas").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.locator("#compass")).toBeVisible();
    await page.locator("#compass").click();
    await expect(page.locator("#compass")).toBeHidden();
  });
});

test.describe("phone", () => {
  test.use({ viewport: SIZES.phone, hasTouch: true });

  test("S6.1 and the peek: the sheet shows the handle, the heading and one whole row, and the count is the heading", async ({ page }) => {
    await openMap(page);
    await expect(page.locator('[data-slot="drawer-popup"]')).toBeVisible();
    await page.waitForTimeout(400);
    const popup = (await page.locator('[data-slot="drawer-popup"]').boundingBox())!;
    const edge = popup.y + 120; // 120 px of the sheet are on screen
    const heading = (await page.locator("#panel .vh").first().boundingBox())!;
    const row = (await page.locator("#panel .row-head").first().boundingBox())!;
    const text = (await page.locator("#panel .row-head .body").first().boundingBox())!;
    expect(await page.locator("#panel .vh").first().innerText()).toMatch(/events? in view$/);
    expect(heading.y + heading.height).toBeLessThanOrEqual(row.y + 1); // the heading, then the row, nothing in between
    expect(text.y + text.height).toBeLessThanOrEqual(edge); // the row's text is whole inside the peek
    await expect(page.locator("#panel .group-by")).toBeHidden(); // the Group by switch and section headers step aside at peek
    await expect(page.locator("#panel .group > h3").first()).toBeHidden();
    await expect(page.locator(".count")).toBeHidden();
    // Expanding brings them back.
    await page.getByRole("button", { name: "Expand" }).click();
    await expect(page.locator("#panel .group-by")).toBeVisible();
  });

  test("S6.1 the filter row stays reachable at every detent", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "Expand" }).click();
    await page.getByRole("button", { name: "Expand" }).click();
    await page.waitForTimeout(400);
    await expect(page.getByRole("link", { name: "Tonight", exact: true })).toBeVisible();
    const pill = (await page.getByRole("link", { name: "Tonight", exact: true }).boundingBox())!;
    expect(pill.y + pill.height).toBeLessThan(120);
  });
});

test("S6 one row anatomy: lines 4 px apart, rows 8 px apart, a 12 px thumbnail corner inside a 16 px row", async ({ page }) => {
  await openMap(page);
  const m = await page.evaluate(() => {
    const px = (v: string) => Math.round(parseFloat(v));
    const row = document.querySelector(".group .row-head")!;
    const body = row.querySelector(".body")!;
    const [title, meta, venue] = [...body.children].map((el) => el.getBoundingClientRect());
    const rows = [...document.querySelectorAll(".group .rows")[0]!.children].map((li) => li.getBoundingClientRect());
    const cs = getComputedStyle(row);
    return {
      titleToMeta: Math.round(meta!.top - title!.bottom),
      metaToVenue: Math.round(venue!.top - meta!.bottom),
      between: Math.round(rows[1]!.top - rows[0]!.bottom),
      rowRadius: px(cs.borderTopLeftRadius),
      thumbRadius: px(getComputedStyle(row.querySelector(".thumb")!).borderTopLeftRadius),
      padY: px(cs.paddingTop),
      padX: px(cs.paddingLeft),
      gap: px(cs.columnGap),
      minH: px(cs.minHeight),
      thumbToHeading: Math.round(
        row.querySelector(".thumb")!.getBoundingClientRect().left -
          (document.querySelector(".vh")!.getBoundingClientRect().left + px(getComputedStyle(document.querySelector(".vh")!).paddingLeft)),
      ),
    };
  });
  expect(m).toMatchObject({
    titleToMeta: 4,
    metaToVenue: 4,
    between: 8,
    rowRadius: 16,
    thumbRadius: 12,
    padY: 4,
    padX: 12,
    gap: 12,
    minH: 64,
  });
  expect(Math.abs(m.thumbToHeading)).toBeLessThanOrEqual(1 + 0); // the thumbnail lines up with the heading text
});

test("S6 the open event is a card: cover, title, meta, organiser, actions, one close control, no second image", async ({ page }) => {
  await openMap(page, "/map?event=e1");
  const open = page.locator("li.row.open");
  await expect(open).toBeVisible();
  await expect(open.locator(".thumb")).toHaveCount(0); // no thumbnail above the cover
  await expect(open.locator(".cover")).toHaveCount(1);
  await expect(open.getByText("Hide details")).toHaveCount(0);
  await expect(open.locator("h3.et")).toHaveText("Jazz night");
  await expect(open.locator(".organiser")).toBeVisible();
  await expect(open.getByRole("link", { name: "Add to calendar" })).toBeVisible();
  const close = open.locator(".close");
  await expect(close).toHaveAttribute("aria-label", "Close Jazz night");
  await expect(close).toHaveAttribute("aria-expanded", "true");
  const [c, cover] = [(await close.boundingBox())!, (await open.locator(".cover").boundingBox())!];
  expect(c.x + c.width).toBeLessThanOrEqual(cover.x + cover.width - 11); // 12 px in from the cover's right edge
  expect(c.y).toBeGreaterThanOrEqual(cover.y + 11);
  const radii = await open.evaluate((li) => ({
    card: getComputedStyle(li).borderTopLeftRadius,
    cover: getComputedStyle(li.querySelector(".cover")!).borderTopLeftRadius,
    inset: li.querySelector(".cover")!.getBoundingClientRect().left - li.getBoundingClientRect().left,
  }));
  expect(radii).toEqual({ card: "16px", cover: "12px", inset: 4 });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("li.row.open")).toHaveCount(0);
  await expect(page.locator(`[data-event="e1"]`)).toBeFocused();
});

test.describe("category icons", () => {
  test("the sprite loads once as an immutable file and every icon is a <use> of it", async ({ page }) => {
    const sprites: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/assets/icons/categories.")) sprites.push(`${res.status()} ${res.headers()["cache-control"]}`);
    });
    await openMap(page);
    const used = await page.evaluate(() => [...document.querySelectorAll("svg.cat-icon use")].map((u) => u.getAttribute("href")));
    expect(used.length).toBeGreaterThan(3);
    expect(new Set(used.map((h) => h!.split("#")[0])).size).toBe(1);
    expect(sprites).toEqual(["200 public, max-age=31536000, immutable"]);
    // The glyph really painted: the duotone body has a non-empty box.
    const box = await page.locator(".tile svg.cat-icon").first().boundingBox();
    expect(box?.width).toBe(22);
  });
  test("a music icon is not drawn black or invisible in dark mode, in headings and placeholders alike", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openMap(page);
    const colours = await page.evaluate(() => {
      // A color-mix computes as color(srgb ...) with channels 0 to 1; a plain colour as rgb() with 0 to 255.
      const rgb = (el: Element | null) => {
        const css = getComputedStyle(el!).color;
        return css
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map((n) => Number(n) * (css.startsWith("color(") ? 255 : 1));
      };
      return { heading: rgb(document.querySelector(".gh svg.cat-icon")), tile: rgb(document.querySelector(".tile svg.cat-icon")) };
    });
    for (const c of Object.values(colours)) expect(Math.max(...c)).toBeGreaterThan(0.45 * 255); // bright enough on the dark surface
  });
});

test("S6.4 every control has a visible focus ring", async ({ page }) => {
  await openMap(page);
  const seen = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (
        !el?.matches(
          ".pill, .button, .link, .row-head, .close, .view-switch a, .brand-link, .trigger, .seg, .tile, .cluster, .search input",
        )
      )
        return null;
      const target = el.matches(".search input") ? (el.closest(".pill") as HTMLElement) : el;
      const cs = getComputedStyle(target);
      return {
        name: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? el.tagName,
        style: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        offset: cs.outlineOffset,
      };
    });
    if (!r) continue;
    seen.add(r.name);
    expect(r, `focus ring on ${r.name}`).toMatchObject({ style: "solid", width: 2, offset: "2px" });
  }
  expect(seen.size).toBeGreaterThan(10);
});

test("S6.4 numbers are tabular and controls opt out of the double-tap delay", async ({ page }) => {
  await openMap(page);
  const css = await page.evaluate(() => {
    const tab = (sel: string) => getComputedStyle(document.querySelector(sel)!).fontVariantNumeric;
    const touch = (sel: string) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).touchAction);
    return {
      time: tab(".m-time"),
      price: tab(".m-price"),
      count: tab(".count"),
      badge: tab(".badge"),
      touch: [...touch(".pill"), ...touch(".button"), ...touch(".row-head"), ...touch(".view-switch a"), ...touch(".trigger")],
    };
  });
  expect(css.time).toContain("tabular-nums");
  expect(css.price).toContain("tabular-nums");
  expect(css.count).toContain("tabular-nums");
  expect(css.badge).toContain("tabular-nums");
  expect(new Set(css.touch)).toEqual(new Set(["manipulation"]));
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("S6.4 transitions are off for pills, rows and buttons", async ({ page }) => {
    await openMap(page);
    const durations = await page.evaluate(() =>
      [".pill", ".row-head", ".view-switch a", ".seg"].map((s) => getComputedStyle(document.querySelector(s)!).transitionDuration),
    );
    for (const d of durations) expect(d).toBe("0s");
  });
});

test("S6 surfaces take their shadow level from the table", async ({ page }) => {
  await openMap(page, "/map?event=e1");
  const shadow = (selector: string) => page.evaluate((s) => getComputedStyle(document.querySelector(s)!).boxShadow, selector);
  const level = async (selector: string) => {
    // The same token resolved on a probe element, so the comparison is against what DESIGN.md defines and not a copy of it.
    return page.evaluate(
      ([s]) => {
        const probe = document.createElement("div");
        document.body.append(probe);
        const out: Record<string, string> = {};
        for (const name of ["--e1", "--e2", "--e3"]) {
          probe.style.boxShadow = `var(${name})`;
          out[name] = getComputedStyle(probe).boxShadow;
        }
        probe.remove();
        const actual = getComputedStyle(document.querySelector(s!)!).boxShadow;
        return Object.entries(out).find(([, v]) => actual.includes(v))?.[0] ?? `none (${actual})`;
      },
      [selector],
    );
  };
  expect(await level(".pill:not(.on)")).toBe("--e1");
  expect(await level(".view-switch")).toBe("--e1");
  expect(await level(".count")).toBe("--e1");
  expect(await level(".mk .tile")).toBe("--e2");
  expect(await level("#panel")).toBe("--e3");
  expect(await level("li.row.open")).toBe("--e1");
  expect(await shadow(".button.primary")).toBe("none");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  expect(await level('[data-slot="popover-content"]')).toBe("--e3");
});

test.describe("attribution", () => {
  test.use({ colorScheme: "dark" });
  test("the attribution is legible in dark mode: glass surface, muted text, 4.5:1 or better", async ({ page }) => {
    await openMap(page);
    const m = await page.evaluate(() => {
      const el = document.querySelector(".maplibregl-ctrl-attrib")!;
      const cs = getComputedStyle(el);
      const rgb = (c: string) => {
        const v = c.match(/[\d.]+/g)!.map(Number);
        return c.startsWith("color(") ? v.slice(0, 3).map((x) => x * 255) : v.slice(0, 3);
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (x: number) => {
          x /= 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const bg = rgb(cs.backgroundColor),
        fg = rgb(getComputedStyle(el.querySelector("a")!).color);
      const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
      return { bg: cs.backgroundColor, ratio: (hi! + 0.05) / (lo! + 0.05), bgLum: lum(bg) };
    });
    expect(m.bgLum).toBeLessThan(0.1); // the dark glass surface, not MapLibre's translucent white
    expect(m.ratio).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("attribution on a phone", () => {
  test.use({ viewport: SIZES.phone, hasTouch: true });
  test("it starts as the info button, and opens when tapped", async ({ page }) => {
    await openMap(page);
    await page.waitForTimeout(500);
    const attrib = page.locator(".maplibregl-ctrl-attrib");
    await expect(attrib).toHaveClass(/maplibregl-compact/);
    await expect(attrib).not.toHaveClass(/maplibregl-compact-show/);
    await attrib.locator(".maplibregl-ctrl-attrib-button").click();
    await expect(attrib).toHaveClass(/maplibregl-compact-show/);
  });

  test("the unplaced count shows in the sheet heading on a phone and not on a wide screen", async ({ page }) => {
    await openMap(page);
    const shown = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "unplaced";
      document.body.append(probe);
      const d = getComputedStyle(probe).display;
      probe.remove();
      return d;
    });
    expect(shown).toBe("inline");
  });
});

test("the unplaced count is hidden on a wide screen, where the floating count carries it", async ({ page }) => {
  await openMap(page);
  expect(
    await page.evaluate(() => {
      const p = document.createElement("span");
      p.className = "unplaced";
      document.body.append(p);
      const d = getComputedStyle(p).display;
      p.remove();
      return d;
    }),
  ).toBe("none");
});

test.describe("combobox", () => {
  test("the Type options show the icon and the word", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("combobox", { name: "Type" }).fill("m");
    const music = page.getByRole("option", { name: "Music" });
    await expect(music).toBeVisible();
    await expect(music.locator("svg.cat-icon use")).toHaveAttribute("href", /#music$/);
    await expect(music).toHaveText("Music");
  });
});
