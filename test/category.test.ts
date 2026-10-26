import { expect, test } from "bun:test";
import { CATEGORIES, classify, isCategory } from "../src/catalog/category.js";

test("source labels decide when they say something useful", () => {
  expect(classify(["Comedy Shows"], "All Star Lineup")).toBe("comedy");
  expect(classify(["Music Shows"], "Friday Night")).toBe("music");
  expect(classify(["Kids"], "Ministry of Kids")).toBe("kids");
  expect(classify(["Classic,Drama,Theatre", "Drama", "Theatre"], "Hamlet Ya Nahi")).toBe("theatre");
});

test("the title decides for the sources that publish no labels at all", () => {
  expect(classify([], "Telugu Standup @Hyderabad")).toBe("comedy");
  expect(classify([], "Dudhsagar Trek from Hyderabad")).toBe("sports");
  expect(classify([], "BOARDGAMING NIGHT")).toBe("community");
  expect(classify([], "Japanese Kintsugi Plate")).toBe("workshop");
  expect(classify([], "Make Your Own Sushi")).toBe("food");
});

test("label noise that names a city or says nothing is ignored", () => {
  // MeraEvents puts the city in the same field as the category.
  expect(classify(["Hyderabad"], "Dhanunjay seepana")).toBe("other");
  expect(classify(["Other", "Hyderabad"], "Marathon 2026")).toBe("sports");
  // Luma sends the calendar an event was posted to, which is not a category.
  expect(classify(["GPU Calendar"], "AI Co-Thinkers")).toBe("other");
});

test("order encodes precedence where two rules both match", () => {
  expect(classify([], "Kids Theatre Workshop")).toBe("kids");
  expect(classify([], "Stand-up comedy theatre show")).toBe("comedy");
  expect(classify([], "Wine Glass Painting")).toBe("workshop");
  expect(classify([], "Wine tasting evening")).toBe("food");
  expect(classify([], "Startup Club Networking")).toBe("community");
});

test("styled unicode and HTML entities in titles are folded before matching", () => {
  expect(classify([], "\u{1D416}\u{1D40E}\u{1D411}\u{1D40A}\u{1D412}\u{1D407}\u{1D40E}\u{1D40F}")).toBe("workshop");
  expect(classify([], "Read, Reflect &amp; Connect Meet-Up")).toBe("community");
});

test("an event that matches nothing lands in other rather than being guessed at", () => {
  expect(classify([], "Non Chalant")).toBe("other");
  expect(classify([], "")).toBe("other");
});

test("every classification is a member of the enum", () => {
  const titles = ["Standup", "Marathon", "Pottery class", "Non Chalant", "DJ Night", "Film Screening"];
  for (const title of titles) expect(CATEGORIES).toContain(classify([], title));
});

test("isCategory rejects a value the filter would not understand", () => {
  expect(isCategory("comedy")).toBe(true);
  expect(isCategory("Comedy Shows")).toBe(false);
});
