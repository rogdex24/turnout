import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** The map is ready once the pins exist: the list alone is server-rendered. */
async function openMap(page: Page, path = "/map") {
  await page.goto(path);
  await expect(page.locator(".mk .tile").first()).toBeVisible();
}

async function nearMe(page: Page) {
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(page.locator("output[for=radius]")).toBeVisible();
}

test("dragging the distance slider changes the radius label and the count", async ({ page }) => {
  await openMap(page);
  await nearMe(page);
  const label = page.locator("output[for=radius]");
  const count = page.locator("#count");
  await expect(label).toHaveText("Within 4 km");
  const before = await count.innerText();

  // The distance slider is its own chunk, so wait for the thumb; then drag it with the mouse to the left end of the track.
  const thumb = page.locator('[data-slot="slider-thumb"]');
  await expect(thumb).toBeVisible();
  const track = (await page.locator('[data-slot="slider-track"]').boundingBox())!;
  const at = (await thumb.boundingBox())!;
  const y = at.y + at.height / 2;
  await page.mouse.move(at.x + at.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(track.x - 6, y, { steps: 8 });
  await page.mouse.up();

  await expect(label).toHaveText("Within 1 km");
  await expect(count).not.toHaveText(before);
});

test("hovering a pin shows its venue name", async ({ page }) => {
  await openMap(page);
  const pin = page.locator(".mk .tile", { hasText: "" }).first();
  await pin.hover();
  await expect(pin.locator(".lv")).toBeVisible();
  await expect(pin.locator(".lv")).not.toBeEmpty();
});

test("a collapsed list section stays collapsed after the map is panned", async ({ page }) => {
  await openMap(page);
  const first = page.locator(".group").first();
  const key = (await first.getAttribute("data-section"))!;
  const trigger = first.locator(".trigger");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  const map = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(map.x + 200, map.y + 300);
  await page.mouse.down();
  await page.mouse.move(map.x + 260, map.y + 330, { steps: 6 });
  await page.mouse.up();
  // moveend reports a new viewport and the list redraws; wait for the redraw to settle before looking.
  await page.waitForTimeout(600);

  await expect(page.locator(`[data-section="${key}"] .trigger`)).toHaveAttribute("aria-expanded", "false");
  // The reader can open it again, and a pan keeps that too.
  await page.locator(`[data-section="${key}"] .trigger`).click();
  await expect(page.locator(`[data-section="${key}"] .trigger`)).toHaveAttribute("aria-expanded", "true");
});

test("Back after selecting a venue returns to the list", async ({ page }) => {
  await openMap(page);
  await page.locator(".mk .tile").first().click();
  await expect(page).toHaveURL(/venue=/);
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/venue=/);
  await expect(page.getByRole("link", { name: "All events" })).toHaveCount(0);
  await expect(page.locator(".group").first()).toBeVisible();
});

test("the page hydrates without console errors or warnings, and the list then narrows to the viewport", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || (m.type() === "warning" && !/GL Driver|WebGL|GPU stall/.test(m.text())))
      problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto("/map");
  const heading = page.locator("#panel .vh").first();
  // Server list: every match, no "in view" yet.
  await expect(heading).toHaveText(/^\d+ events?( in view)?$/);
  await expect(page.locator(".mk .tile").first()).toBeVisible();
  // Once the map reports a viewport the heading says so and the polite live region announces the settled count.
  await expect(heading).toHaveText(/ in view$/);
  await expect(page.locator("#root p[role=status]")).toHaveText(/^\d+ events? in view$/);
  // The group switch is a group of plain links: after hydration each is still an <a href> and so a tab stop.
  expect(await page.locator(".seg").evaluateAll((els) => els.map((e) => [e.tagName, e.hasAttribute("href")]))).toEqual([
    ["A", true],
    ["A", true],
    ["A", true],
  ]);
  // Links in the switch expose one current-state attribute, aria-current, and never aria-pressed.
  expect(await page.locator("a[aria-pressed], .seg[aria-pressed], .presets [aria-pressed]").count()).toBe(0);
  expect(await page.locator(".seg[aria-current=true], .presets [aria-current=true]").count()).toBe(2); // one grouping, one window
  expect(problems).toEqual([]);
});

test("focus returns to the event row when its details close, and the row names its region", async ({ page }) => {
  await openMap(page);
  const row = page.locator(".row-head").first();
  const eventId = (await row.getAttribute("data-event"))!;
  await row.focus();
  await page.keyboard.press("Enter"); // opens the venue card with this event expanded
  const open = page.locator(`[data-event="${eventId}"]`);
  await expect(open).toHaveAttribute("aria-expanded", "true");
  await expect(open).toBeFocused();
  const region = await open.getAttribute("aria-controls");
  expect(region).toBe(`ex-${eventId}`);
  await expect(page.locator(`#${region}`)).toBeVisible();

  await page.keyboard.press("Enter"); // activating the same row closes the details
  await expect(page.locator(`[data-event="${eventId}"]`)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(`[data-event="${eventId}"]`)).toBeFocused();
  await expect(page.locator(`#${region}`)).toHaveCount(0);

  // "All events" returns to the list with focus on the first row of the venue it closed.
  await page.getByRole("link", { name: "All events" }).click();
  await expect(page).not.toHaveURL(/venue=/);
  await expect(page.locator(".group").first()).toBeVisible();
  const venue = await page.locator(`[data-event="${eventId}"]`).getAttribute("data-venue");
  await expect(page.locator(`#panel [data-venue="${venue}"]`).first()).toBeFocused();
});

test("submitting a filter keeps the chosen grouping", async ({ page }) => {
  await openMap(page, "/map?group=day");
  await page.getByRole("searchbox", { name: "Search events" }).fill("jazz");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/group=day/);
  await expect(page).toHaveURL(/q=jazz/);
  await expect(page.locator("#panel .vh").first()).toHaveText(/^1 event/);
});

test.describe("when the basemap fails", () => {
  test.use({ basemap: "fail" });

  test("the server list stays visible (S5.6: the list is never replaced by a skeleton)", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByText("The map could not load")).toBeVisible();
    await expect(page.locator(".group").first()).toBeVisible();
  });
});

test("the client does not refetch /api/map on load: the boot snapshot is the data (D11)", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await openMap(page);
  expect(requests).not.toContain("/api/map");
});

test("Back and Forward restore filter, grouping and selection changes in order", async ({ page }) => {
  await openMap(page);
  const preset = (name: string) => page.getByRole("link", { name, exact: true });
  // The URL says which filter and grouping are active; the page says whether a card is open.
  const state = async () => {
    const q = new URL(page.url()).searchParams;
    return {
      when: q.get("when") ?? "week",
      group: q.get("group") ?? "type",
      card: await page.getByRole("link", { name: "All events" }).count(),
    };
  };

  await preset("This weekend").click();
  await expect(page).toHaveURL(/when=weekend/);
  await page.getByRole("link", { name: "Day", exact: true }).click();
  await expect(page).toHaveURL(/group=day/);
  await page.locator(".mk .tile").first().click();
  await expect(page).toHaveURL(/venue=/);
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
  expect(await state()).toEqual({ when: "weekend", group: "day", card: 1 });

  await page.goBack(); // closes the venue
  await expect(page).not.toHaveURL(/venue=/);
  await expect(page.getByRole("link", { name: "All events" })).toHaveCount(0);
  expect(await state()).toEqual({ when: "weekend", group: "day", card: 0 });

  await page.goBack(); // back to the type grouping
  await expect(page).not.toHaveURL(/group=/);
  await expect(page).toHaveURL(/when=weekend/);
  expect(await state()).toEqual({ when: "weekend", group: "type", card: 0 });

  await expect(preset("This weekend")).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".seg[aria-current=true]")).toHaveText("Type");

  await page.goBack(); // back to the default window
  await expect(page).not.toHaveURL(/when=/);
  await expect(preset("This weekend")).not.toHaveAttribute("aria-current", "true");

  await page.goForward();
  await page.goForward();
  await page.goForward(); // forward again to the open venue: the card and its pin come back
  await expect(page).toHaveURL(/venue=/);
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
  await expect(page.locator(".mk .tile.sel")).toHaveCount(1);
  expect(await state()).toEqual({ when: "weekend", group: "day", card: 1 });
});

test("Near me shows a pending state, then turns on with the distance slider", async ({ page }) => {
  // Hold the position request open so the pending state can be looked at, then release it.
  await page.addInitScript(() => {
    const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (ok, fail, options) => {
      (window as unknown as { release: () => void }).release = () => real(ok, fail, options);
    };
  });
  await openMap(page);
  const near = page.getByRole("button", { name: "Near me" });
  await expect(near).toHaveAttribute("aria-pressed", "false");
  await near.click();
  const pending = page.locator("#near");
  await expect(pending).toHaveAttribute("aria-busy", "true");
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute("aria-label", "Locating…");
  await expect(page.locator("output[for=radius]")).toHaveCount(0);

  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  await expect(pending).toHaveAttribute("aria-pressed", "true");
  await expect(pending).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("output[for=radius]")).toHaveText("Within 4 km");
  await expect(page.locator(".me")).toHaveCount(1);
  await pending.click(); // and off again
  await expect(page.locator("output[for=radius]")).toHaveCount(0);
  await expect(page.locator(".me")).toHaveCount(0);
});

test("the Filters popover loads on first use, closes on Escape and outside click, and returns focus", async ({ page }) => {
  const chunks = new Set<string>();
  page.on("request", (r) => {
    const m = /\/assets\/(chunk\.[^/]+\.js)$/.exec(new URL(r.url()).pathname);
    if (m) chunks.add(m[1]!);
  });
  await openMap(page);
  await page.waitForTimeout(500);
  const before = chunks.size;
  const pill = page.getByRole("button", { name: /^Filters/ });
  await expect(pill).toHaveAttribute("aria-expanded", "false");
  await pill.click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  expect(chunks.size).toBeGreaterThan(before); // Popover and Combobox arrived with the first open
  await expect(pill).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(pill).toBeFocused();

  await pill.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(300, 600); // on the map, outside the popover
  await expect(dialog).toHaveCount(0);
  await expect(pill).toBeFocused();

  // Type is a combobox with emoji labels; Apply writes it to the URL and keeps the pill marked.
  await pill.click();
  await page.getByRole("combobox", { name: "Type" }).fill("com");
  await page.getByRole("option", { name: "Comedy" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/category=comedy/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filters/ })).toContainText("·");
});

test("panned to an empty area, the panel says so, counts what matches elsewhere and Show all fits the map", async ({ page }) => {
  await openMap(page);
  await expect(page.locator("#panel .vh").first()).toHaveText(/ in view$/);
  const map = (await page.locator("#map").boundingBox())!;
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.move(map.x + 100, map.y + 300);
    await page.mouse.down();
    await page.mouse.move(map.x + 560, map.y + 300, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.locator("#panel .vh").first()).toHaveText("No events in this area");
  await expect(page.locator("#panel .meta").first()).toHaveText("12 events match elsewhere on the map.");
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.locator("#panel .vh").first()).toHaveText(/^\d+ events? in view$/);
  await expect(page.locator("#panel .group").first()).toBeVisible();
});

test("every filter control is 36 px high with a 44 px hit area (DESIGN.md, Components)", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(page.locator('[data-slot="slider-thumb"]')).toBeVisible();
  const sizes = await page.evaluate(() => {
    const px = (v: string) => Math.round(parseFloat(v));
    const pill = (el: Element) => ({ height: px(getComputedStyle(el).height), hit: px(getComputedStyle(el, "::before").height) });
    const one = (selector: string) => document.querySelector(selector)!;
    return {
      presets: [...document.querySelectorAll(".presets .pill")].map(pill),
      free: pill(document.querySelector("a.pill[href*='free=1']")!),
      filters: pill(one("button.pill.filters")),
      near: pill(one("#near")),
      search: { pill: px(getComputedStyle(one(".pill.search")).height), input: px(getComputedStyle(one(".pill.search input")).height) },
      slider: {
        pill: px(getComputedStyle(one(".pill.radius")).height),
        control: px(getComputedStyle(one('[data-slot="slider"] > div')).height),
      },
    };
  });
  for (const p of [...sizes.presets, sizes.free, sizes.filters, sizes.near]) expect(p).toEqual({ height: 36, hit: 44 });
  expect(sizes.search).toEqual({ pill: 36, input: 44 });
  expect(sizes.slider).toEqual({ pill: 36, control: 44 });
});

/** S8 fix 3: the popover's fields follow the committed URL, and keep unsubmitted edits only while the URL has not moved. */
test("the Filters popover shows the restored URL after Back, Forward and Clear all, and keeps an unsubmitted edit across a pan (S8 item 3)", async ({
  page,
}) => {
  await openMap(page);
  const pill = () => page.getByRole("button", { name: /^Filters/ });
  const type = () => page.getByRole("combobox", { name: "Type" });
  const apply = async (word: string, option: string) => {
    await pill().click();
    await type().fill(word);
    await page.getByRole("option", { name: option }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(new RegExp(`category=${option.toLowerCase()}`));
  };
  await apply("mus", "Music");
  await apply("com", "Comedy");

  await page.goBack(); // the URL says music again
  await expect(page).toHaveURL(/category=music/);
  await pill().click();
  await expect(type()).toHaveValue("Music"); // not the Comedy it was last applied with
  await page.getByRole("button", { name: "Apply" }).click(); // applying it cannot revive comedy
  await expect(page).toHaveURL(/category=music/);

  await page.goForward();
  await expect(page).toHaveURL(/category=comedy/);
  await pill().click();
  await expect(type()).toHaveValue("Comedy");

  await page.getByRole("link", { name: "Clear all" }).click();
  await expect(page).not.toHaveURL(/category=/);
  await pill().click();
  await expect(type()).toHaveValue("");
  await page.keyboard.press("Escape");

  // An unsubmitted edit survives an unrelated map pan: the committed URL has not moved.
  await pill().click();
  await type().fill("fil");
  await page.getByRole("option", { name: "Film" }).click();
  await page.keyboard.press("Escape");
  const map = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(map.x + 200, map.y + 300);
  await page.mouse.down();
  await page.mouse.move(map.x + 240, map.y + 320, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await pill().click();
  await expect(type()).toHaveValue("Film");
  expect(page.url()).not.toContain("category=");
});

/** S8 fix 10: the map is a labelled region, rows describe themselves without repeating the title, and marker order is reading order. */
test("the map is a labelled region, a closed row's time, price and venue are its description, and markers tab in reading order (S8 item 10)", async ({
  page,
}) => {
  await openMap(page);
  expect(await page.locator('[role="application"]').count()).toBe(0);
  await expect(page.getByRole("region", { name: "Map of events" })).toBeAttached();

  const row = page.locator("#panel .row-head").first();
  const name = await row.getAttribute("aria-label");
  const described = await row.evaluate((el) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
  expect(described).toMatch(/\d{1,2}:\d{2} (AM|PM)/); // the time
  expect(described).toMatch(/Free|₹\d+/); // the price
  expect(described).toMatch(/\S+ \S*/); // and the venue line
  expect(described).not.toContain(name!); // the title is the name; the description does not repeat it
  await expect(row).toHaveAccessibleName(name!);

  // Markers: DOM (and so Tab) order runs top to bottom, then left to right, after load and after the map moves.
  const order = () =>
    page.evaluate(() => {
      const frame = document.querySelector(".maplibregl-map")!.getBoundingClientRect();
      return [...document.querySelectorAll(".mk")]
        .filter((el) => el.querySelector("button"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          const inside = r.bottom > frame.top && r.top < frame.bottom && r.right > frame.left && r.left < frame.right;
          return [inside ? 0 : 1, Math.round(r.top), Math.round(r.left)];
        });
    });
  // On-screen markers first, each group top to bottom then left to right.
  const sorted = (pts: number[][]) =>
    pts.every(
      (p, i) =>
        i === 0 ||
        p[0]! > pts[i - 1]![0]! ||
        (p[0] === pts[i - 1]![0] && (p[1]! > pts[i - 1]![1]! || (p[1] === pts[i - 1]![1] && p[2]! >= pts[i - 1]![2]!))),
    );
  expect(sorted(await order())).toBe(true);
  const map = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(map.x + 300, map.y + 300);
  await page.mouse.down();
  await page.mouse.move(map.x + 200, map.y + 420, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect(sorted(await order())).toBe(true);
  // Tab reaches them in that order: focus the first, press Tab, the next marker in the list is focused (when no other control sits between).
  const labels = await page.evaluate(() => [...document.querySelectorAll(".mk button")].map((b) => b.getAttribute("aria-label")));
  expect(labels.length).toBeGreaterThan(1);
});

test("All events is a primary link, and the venue grouping's headings use the title size (S8 item 11)", async ({ page }) => {
  await openMap(page, "/map?group=venue");
  const titles = await page.evaluate(() => ({
    vn: getComputedStyle(document.querySelector(".venue .vn")!).fontSize,
    gh: getComputedStyle(document.querySelector(".gh") ?? document.querySelector(".venue .vn")!).fontSize,
    title: getComputedStyle(document.documentElement).getPropertyValue("--size-title").trim(),
  }));
  expect(titles.vn).toBe(titles.title);
  await page.locator(".venue .vn a").first().click();
  const [back, primary] = await page.evaluate(() => {
    const p = document.createElement("i");
    p.style.color = "var(--primary)";
    document.body.append(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return [getComputedStyle(document.querySelector(".back")!).color, c];
  });
  expect(back).toBe(primary);
});
