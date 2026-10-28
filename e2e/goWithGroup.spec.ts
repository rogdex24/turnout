import { expect, test } from "./fixtures";

/** A16: "Go with a group" on eligible event pages only, and the page it opens on a phone without the app. */
const BLURB = "Meet 3 to 5 others with tickets at a cafe nearby, an hour before.";

test("an eligible event page has the secondary link to the go host, with its one-line promise", async ({ page }) => {
  await page.goto("/e/e1");
  const link = page.getByRole("link", { name: "Go with a group" });
  await expect(link).toHaveAttribute("href", "https://go.example.test/e/e1/go?src=web");
  await expect(page.getByText(BLURB)).toBeVisible();
  // Secondary: View source is still the one primary action.
  await expect(link).toHaveClass(/secondary/);
  await expect(page.locator("a.button.primary")).toHaveCount(1);
});

test("an event that cannot have a group has no link", async ({ page }) => {
  for (const id of ["e2", "e3", "e7"]) {
    await page.goto(`/e/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go with a group" })).toHaveCount(0);
    await expect(page.getByText(BLURB)).toHaveCount(0);
  }
});

test("the fallback page has the title, a sentence, the testing line with a contact link, and a link back, and no store badge", async ({
  page,
}) => {
  await page.goto("/e/e1/go");
  await expect(page.getByRole("heading", { level: 1, name: "Jazz night" })).toBeVisible();
  await expect(page.getByText("Go with a group is in the Turnout app.")).toBeVisible();
  await expect(page.getByText("The app is in testing on Android.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "mailto:support@example.test");
  await expect(page.getByText(/App Store|Google Play/)).toHaveCount(0);
  await page.getByRole("link", { name: "Back to the event" }).click();
  await expect(page).toHaveURL(/\/e\/e1$/);
});
