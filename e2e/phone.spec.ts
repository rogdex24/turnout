import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// A phone: the card becomes a Drawer with three detents (DESIGN.md, Sheet): peek 120 px, half 50dvh, full 100dvh - 104 px.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const H = 844;
const popup = (page: Page) => page.locator('[data-slot="drawer-popup"]');
const snap = (page: Page) => page.locator("#app").getAttribute("data-snap");
/** How much of the sheet is on screen. */
const visible = async (page: Page) => H - (await popup(page).boundingBox())!.y;
/**
 * A real touch drag, through the browser's input pipeline (the Drawer swipes on touch pointers). It moves steadily and rests
 * before letting go, so it is a drag to a place and not a fling, which the Drawer reads by speed.
 */
async function swipe(page: Page, x: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", from);
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) {
    await touch("touchMove", from + ((to - from) * i) / steps);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(150);
  await touch("touchEnd", to);
  await cdp.detach();
}
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3);

async function openPhone(page: Page) {
  await page.goto("/map");
  await expect(popup(page)).toBeVisible();
  await expect(page.locator(".mk .tile").first()).toBeVisible();
  await page.waitForTimeout(400); // the sheet settles at its first detent
}

test("on a phone the list is a non-modal Drawer that starts at peek", async ({ page }) => {
  await openPhone(page);
  expect(await snap(page)).toBe("peek");
  near(await visible(page), 120);
  // It does not trap focus, dim the page or hide the map from assistive tech.
  await expect(page.locator('[data-slot="drawer-overlay"], [data-slot="drawer-backdrop"]')).toHaveCount(0);
  expect(await page.locator("#map").getAttribute("aria-hidden")).toBeNull();
  await expect(popup(page).locator(".sheet-controls")).toBeVisible();
});

test("Expand and Collapse move between the three detents and stop at the ends", async ({ page }) => {
  await openPhone(page);
  const expand = page.getByRole("button", { name: "Expand" });
  const collapse = page.getByRole("button", { name: "Collapse" });
  await expect(collapse).toBeDisabled();

  await expand.click();
  await expect.poll(() => snap(page)).toBe("half");
  await page.waitForTimeout(400);
  near(await visible(page), H / 2);

  await expand.click();
  await expect.poll(() => snap(page)).toBe("full");
  await page.waitForTimeout(400);
  near(await visible(page), H - 104);
  await expect(expand).toBeDisabled();

  await collapse.click();
  await expect.poll(() => snap(page)).toBe("half");
  await collapse.click();
  await expect.poll(() => snap(page)).toBe("peek");
  await page.waitForTimeout(400);
  near(await visible(page), 120);
});

test("dragging the sheet moves it between detents, and a tap on the handle cycles them", async ({ page }) => {
  await openPhone(page);
  const handle = page.locator("[data-handle]");
  const at = (await handle.boundingBox())!;
  const x = at.x + at.width / 2;
  const y = at.y + at.height / 2;

  await swipe(page, x, y, y - 300); // up from peek: lands on half
  await expect.poll(() => snap(page)).toBe("half");
  await page.waitForTimeout(500);
  near(await visible(page), H / 2);

  await swipe(page, x, y - 300, y - 300 + (H / 2 - 120)); // and back down to peek
  await expect.poll(() => snap(page)).toBe("peek");
  await page.waitForTimeout(500);
  near(await visible(page), 120);

  await handle.click(); // a tap goes up one detent
  await expect.poll(() => snap(page)).toBe("half");
});

test("the map stays pannable while the sheet is open", async ({ page }) => {
  await openPhone(page);
  await page.getByRole("button", { name: "Expand" }).click();
  await expect.poll(() => snap(page)).toBe("half");
  await page.waitForTimeout(500);
  const pin = page.locator(".mk .tile").first();
  const before = (await pin.boundingBox())!;
  // Drag the map in the part the sheet leaves free (above 422 px).
  await page.mouse.move(200, 250);
  await page.mouse.down();
  await page.mouse.move(120, 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await pin.boundingBox())!.x - before.x)).toBeGreaterThan(30);
  await expect(popup(page)).toBeVisible();
  expect(await snap(page)).toBe("half"); // panning the map did not close or move the sheet

  // The camera pads for the sheet: opening a venue centres it in what the sheet leaves free.
  await pin.click();
  await expect(page).toHaveURL(/venue=/);
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
  await page.waitForTimeout(700);
  const sel = (await page.locator(".mk .tile.sel").boundingBox())!;
  expect(sel.y + sel.height / 2).toBeLessThan(H / 2);
});

/** S8 fix 4 (and R4): at full the filter row is above the sheet and reachable, and the list keeps the results it had at half. */
for (const scheme of ["light", "dark"] as const) {
  test.describe(`full detent, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("every filter control is above the sheet and receives its own press, and expanding does not empty the list (S8 item 4)", async ({
      page,
    }) => {
      await openPhone(page);
      await page.getByRole("button", { name: "Near me" }).click(); // the slider joins the row
      await expect(page.locator('[data-slot="slider-thumb"]')).toBeVisible();
      await page.getByRole("button", { name: "Expand", exact: true }).click();
      await page.waitForTimeout(500);
      const half = await page.locator("#panel .vh").first().innerText();
      await page.getByRole("button", { name: "Expand", exact: true }).click();
      await expect.poll(() => snap(page)).toBe("full");
      await page.waitForTimeout(600);
      // The list is what it was at half, not "No events in this area".
      expect(await page.locator("#panel .vh").first().innerText()).toBe(half);
      await expect(page.locator("#panel .group").first()).toBeVisible();

      const sheetTop = (await popup(page).boundingBox())!.y;
      for (const target of [
        page.getByRole("link", { name: "Tonight", exact: true }),
        page.getByRole("button", { name: /^Filters/ }),
        page.locator('[data-slot="slider-thumb"]'),
      ]) {
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        expect(box.y + box.height, "the visual box ends above the sheet").toBeLessThanOrEqual(sheetTop);
        // Its hit area (44 px, centred) is above the sheet too, and the points of the control reach the control itself.
        expect(box.y + box.height / 2 + 22).toBeLessThanOrEqual(sheetTop);
        for (const fy of [0.5, 0.85]) {
          const hit = await page.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x!, y!)!;
              return (
                el.closest("a, button, [data-slot='slider-thumb']")?.getAttribute("aria-label") ??
                el.closest("a, button, [data-slot='slider-thumb']")?.textContent?.trim() ??
                el.className
              );
            },
            [box.x + box.width / 2, box.y + box.height * fy],
          );
          expect(hit, `the press at ${fy} of the control reaches it`).not.toMatch(/Collapse|Expand|Resize/);
        }
      }
    });
  });
}

/** S8 fix 5: location is denied while the Filters pill is scrolled out of the row; the popover still opens inside the screen. */
test("a real location denial opens the filters inside the viewport, focused on Area, and Escape returns focus to the pill (S8 item 5)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => {
      setTimeout(() => fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }), 50);
    };
  });
  await openPhone(page);
  expect(await page.locator(".pills").evaluate((el) => el.scrollLeft)).toBe(0); // the pill row has not been scrolled to Filters
  await page.getByRole("button", { name: "Near me" }).click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  // Type, Area and Apply are all inside it and on screen.
  for (const control of [
    dialog.getByRole("combobox", { name: "Type" }),
    dialog.locator("select[name=area]"),
    dialog.getByRole("button", { name: "Apply" }),
  ]) {
    const b = (await control.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  }
  await expect(dialog.locator("select[name=area]")).toBeFocused(); // "Pick an area instead"
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filters/ })).toBeFocused();
});

/** S8 fix 6: keyboard focus rings and target sizes for the controls the earlier checks left out. */
test("sheet controls, Group by and the Filters popover fields have a 2px primary focus ring and 44px targets, with 36px fields (S8 item 6)", async ({
  page,
}) => {
  await openPhone(page);
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab"); // keyboard modality, so focus() below counts as keyboard focus (:focus-visible)

  const probe = (el: Element) => {
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, "::before");
    const rect = el.getBoundingClientRect();
    const beforeH = before.content !== "none" && before.height.endsWith("px") ? parseFloat(before.height) : 0;
    return {
      focusVisible: el.matches(":focus-visible"),
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth),
      offset: cs.outlineOffset,
      color: cs.outlineColor,
      height: Math.round(rect.height),
      hit: Math.round(Math.max(rect.height, beforeH)),
    };
  };
  const check = async (name: string, locator: import("@playwright/test").Locator, minHit: number, visual?: number) => {
    await page.keyboard.press("Tab"); // keyboard modality (a click in between switches it to pointer)
    await locator.focus();
    const r = await locator.evaluate(probe);
    expect(r.focusVisible, `${name} is keyboard-focused`).toBe(true);
    expect(r, `${name} focus ring`).toMatchObject({ style: "solid", width: 2, offset: "2px" });
    expect(r.hit, `${name} target`).toBeGreaterThanOrEqual(minHit);
    if (visual) expect(r.height, `${name} visual height`).toBe(visual);
    return r;
  };
  const ring = await check("Expand", page.getByRole("button", { name: "Expand", exact: true }), 44);
  await check("Collapse", page.getByRole("button", { name: "Collapse", exact: true }), 44);
  await check("handle", page.getByRole("button", { name: "Resize the list" }), 44);
  for (const name of ["Type", "Day", "Venue"]) await check(`Group by ${name}`, page.getByRole("link", { name, exact: true }), 44);
  // The ring is the primary color, like every other control's.
  const primary = await page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--primary)";
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  expect(ring.color).toBe(primary);

  // The popover: Type input and its trigger, Area, Apply, Clear all.
  await page.getByRole("button", { name: /^Filters/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  await check("Type input", dialog.getByRole("combobox", { name: "Type" }), 36, 36);
  await check("Type trigger", dialog.getByRole("button", { name: "Show types" }), 44);
  await check("Area", dialog.locator("select[name=area]"), 36, 36);
  await check("Apply", dialog.getByRole("button", { name: "Apply" }), 44);
  await check("Clear all", dialog.getByRole("link", { name: "Clear all" }), 44);
  // A field's label is a target too: its box, caption and control, is at least 44 px tall.
  for (const label of await dialog.locator("label").all()) expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // The chevron is part of the field, not a browser button: no default grey fill and no border of its own.
  const trigger = await dialog.getByRole("button", { name: "Show types" }).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopWidth };
  });
  expect(trigger).toEqual({ bg: "rgba(0, 0, 0, 0)", border: "0px" });
});

/** S8 fix 10: the original accessibility contracts. */
test("keyboard focus on a row below the peek reveals the sheet, and the detent is communicated (S8 item 10)", async ({ page }) => {
  await openPhone(page);
  expect(await snap(page)).toBe("peek");
  const handle = page.getByRole("button", { name: "Resize the list" });
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await expect(handle).toHaveAccessibleDescription(/peek/i);
  // A row that the peek hides: focusing it (as Tab does) must not leave focus off screen.
  const id = (await page.locator("#panel .row-head").nth(3).getAttribute("data-event"))!;
  const hidden = page.locator(`#panel [data-event="${id}"]`); // by id: the list is drawn again when the sheet moves
  await page.keyboard.press("Tab");
  await hidden.focus();
  await expect.poll(() => snap(page)).toBe("half");
  // The sheet moves, then the row is scrolled up into the part that shows: poll, since the slide is slow under software rendering.
  await expect
    .poll(
      async () => {
        const b = await hidden.boundingBox();
        return b ? b.y + b.height : 9999;
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(844);
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect(handle).toHaveAccessibleDescription(/half/i);
  // At half the last row can be scrolled up into the part of the sheet that shows (the scroll area is as tall as the full sheet).
  await page.locator("#panel .row-head").last().scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const s = document.querySelector(".panel-scroll")!;
    s.scrollTop = s.scrollHeight;
  });
  await expect
    .poll(
      async () => {
        const b = await page.locator("#panel .row-head").last().boundingBox();
        return b ? b.y + b.height : 9999;
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(844);
  // A row that the peek shows does not expand it.
  await page.getByRole("button", { name: "Collapse", exact: true }).click();
  await expect.poll(() => snap(page)).toBe("peek");
  await page.waitForTimeout(400);
  await page.locator("#panel .row-head").first().focus();
  await page.waitForTimeout(300);
  expect(await snap(page)).toBe("peek");
});
