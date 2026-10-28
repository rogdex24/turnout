import { renderRouter, screen } from "expo-router/testing-library";
import { home } from "@/copy/home";

test("the root route shows the placeholder home", async () => {
  await renderRouter("./src/app");
  expect(screen).toHavePathname("/");
  expect(screen.getByText(home.wordmark)).toBeOnTheScreen();
  expect(screen.getByText(home.placeholder)).toBeOnTheScreen();
});

test("the storybook route sends you home when Storybook is not bundled", async () => {
  await renderRouter("./src/app", { initialUrl: "/storybook?story=primitives-button--primary" });
  expect(screen).toHavePathname("/");
  expect(screen.getByTestId("home")).toBeOnTheScreen();
});
