import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** S8 round 2: real edge-point hits and clicks at 390x844, computed touch-action, and the denied preview. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const popup = (page: Page) => page.locator('[data-slot="drawer-popup"]');
const snap = (page: Page) => page.locator("#app").getAttribute("data-snap");

async function openPhone(page: Page, path = "/map") {
  await page.goto(path);
  await expect(popup(page)).toBeVisible();
  await expect(page.locator(".mk .tile").first()).toBeVisible();
  await page.waitForTimeout(500);
}

/** The control a point belongs to, named by what a press there would act on. */
const hitAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px!, py!);
      const owner = el?.closest("a, button, [data-slot='slider-thumb'], [data-slot='slider-control'], summary");
      return owner ? (owner.getAttribute("aria-label") ?? owner.textContent?.trim() ?? owner.tagName) : `(${el?.tagName}.${el?.className})`;
    },
    [x, y],
  );

/** The 44 px target of a 36 px control: its box grown to 44 tall, centred. Points just inside its top and bottom edges. */
async function edges(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const b = (await control.boundingBox())!;
  const cy = b.y + b.height / 2;
  return { x: b.x + b.width / 2, top: cy - 22 + 1.5, bottom: cy + 22 - 1.5, left: b.x + 3, right: b.x + b.width - 3, cy };
}

for (const scheme of ["light", "dark"] as const) {
  for (const detent of ["peek", "half", "full"] as const) {
    test.describe(`phone ${detent}, ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      test("every filter pill and the slider receive presses along their whole 44 px target (round 2 item 1)", async ({ page }) => {
        await openPhone(page);
        await page.getByRole("button", { name: "Near me" }).click(); // the slider joins the row
        await expect(page.locator('[data-slot="slider-thumb"]')).toBeVisible();
        for (const step of detent === "peek" ? [] : detent === "half" ? ["Expand"] : ["Expand", "Expand"])
          await page.getByRole("button", { name: step, exact: true }).click();
        await expect.poll(() => snap(page)).toBe(detent);
        await page.waitForTimeout(700);

        const pills: Array<[string, Locator]> = [
          ["Tonight", page.getByRole("link", { name: "Tonight", exact: true })],
          ["This weekend", page.getByRole("link", { name: "This weekend", exact: true })],
          ["Next 7 days", page.getByRole("link", { name: "Next 7 days", exact: true })],
          ["Free", page.getByRole("link", { name: "Free", exact: true })],
          ["Filters", page.getByRole("button", { name: /^Filters/ })],
        ];
        for (const [name, control] of pills) {
          const e = await edges(control);
          const sheetTop = (await popup(page).boundingBox())!.y;
          expect(e.bottom, `${name}'s target is above the sheet`).toBeLessThan(sheetTop);
          for (const [label, x, y] of [
            ["top edge", e.x, e.top],
            ["bottom edge", e.x, e.bottom],
            ["top-left", e.left, e.top],
            ["bottom-right", e.right, e.bottom],
          ] as const) {
            const hit = await hitAt(page, x, y);
            expect(hit, `${name} at its ${label} (${Math.round(x)}, ${Math.round(y)})`).toMatch(
              name === "Filters" ? /Filters/ : new RegExp(`^${name}$`),
            );
          }
        }

        // The slider: the whole 44 px control is the slider's, and a real press at its bottom edge moves the value and leaves the detent alone.
        const control = page.locator('.pill.radius [data-slot="slider"] > div');
        const e = await edges(control);
        for (const y of [e.top, e.bottom])
          expect(await hitAt(page, e.x, y), `slider at y=${Math.round(y)}`).not.toMatch(/Resize|Expand|Collapse/);
        const thumb = page.locator('[data-slot="slider-thumb"] input');
        const before = await thumb.getAttribute("aria-valuenow");
        const track = (await page.locator('[data-slot="slider-track"]').boundingBox())!;
        await page.mouse.click(track.x + track.width * 0.8, e.bottom);
        await expect(thumb).not.toHaveAttribute("aria-valuenow", before!);
        expect(await snap(page)).toBe(detent);

        // Real clicks at the bottom edge of two pills act on those pills.
        const free = await edges(page.getByRole("link", { name: "Free", exact: true }));
        await page.mouse.click(free.x, free.bottom);
        await expect(page).toHaveURL(/free=1/);
        const filters = await edges(page.getByRole("button", { name: /^Filters/ }));
        await page.mouse.click(filters.x, filters.top);
        await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
      });
    });
  }
}

test("Expand, Collapse and the popover fields opt out of the double-tap delay, and the named links are 44 px targets (round 2 item 2)", async ({
  page,
}) => {
  await openPhone(page);
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.waitForTimeout(500);
  const touch = (l: Locator) => l.evaluate((el) => getComputedStyle(el).touchAction);
  const tall = (l: Locator) =>
    l.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const b = getComputedStyle(el, "::before");
      return Math.round(Math.max(r.height, b.content !== "none" && b.height.endsWith("px") ? parseFloat(b.height) : 0));
    });
  expect(await touch(page.getByRole("button", { name: "Expand", exact: true }))).toBe("manipulation");
  expect(await touch(page.getByRole("button", { name: "Collapse", exact: true }))).toBe("manipulation");
  await page.getByRole("button", { name: /^Filters/ }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /^Filters/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  for (const l of [
    dialog.getByRole("combobox", { name: "Type" }),
    dialog.getByRole("button", { name: "Show types" }),
    dialog.locator("select[name=area]"),
  ])
    expect(await touch(l)).toBe("manipulation");
  await page.keyboard.press("Escape");

  // Group by venue: the disclosure under each venue name, then a venue's "All events" link.
  await page.goto("/map?group=venue");
  await expect(popup(page)).toBeVisible();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.waitForTimeout(500);
  expect(await tall(page.locator(".venue .trigger").first())).toBeGreaterThanOrEqual(44);
  await page.locator(".venue .vn a").first().click();
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
  expect(await tall(page.getByRole("link", { name: "All events" }))).toBeGreaterThanOrEqual(44);
  // An open event's Details link (a .link) too.
  await page.locator("#panel a.row-head").first().click();
  await expect(page.getByRole("link", { name: "Details" })).toBeVisible();
  expect(await tall(page.getByRole("link", { name: "Details" }))).toBeGreaterThanOrEqual(44);

  // The plain event page.
  await page.goto("/e/e1");
  expect(await tall(page.getByRole("link", { name: "Back to listing" }))).toBeGreaterThanOrEqual(44);
  for (const sel of ["a.link", "a.button"]) for (const l of await page.locator(sel).all()) expect(await touch(l)).toBe("manipulation");
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`denied preview, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test("?state=denied opens the whole popup inside the viewport, on Area, without scrolling the pills first (round 2 item 3)", async ({
      page,
    }) => {
      await page.goto("/map?state=denied");
      await expect(popup(page)).toBeVisible();
      expect(await page.locator(".pills").evaluate((el) => el.scrollLeft)).toBeGreaterThanOrEqual(0);
      const dialog = page.getByRole("dialog", { name: "Filters" });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(500);
      const b = (await dialog.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(844);
      for (const c of [
        dialog.getByRole("combobox", { name: "Type" }),
        dialog.locator("select[name=area]"),
        dialog.getByRole("button", { name: "Apply" }),
      ]) {
        const r = (await c.boundingBox())!;
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(390);
      }
      await expect(dialog.locator("select[name=area]")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Filters/ })).toBeFocused();
    });
  });
}
