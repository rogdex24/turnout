import fs from "node:fs";
import path from "node:path";

/**
 * expo-router's NativeTabs draws an `md` icon on Android through expo-symbols and throws at render when the package is missing,
 * which left the whole signed-in app blank on the Android device runs. Jest mocks the tabs, so only this check catches it.
 */
test("the tab layout's Material icons have expo-symbols installed", () => {
  const layout = fs.readFileSync(path.join(__dirname, "../src/app/(app)/(tabs)/_layout.tsx"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")) as { dependencies: Record<string, string> };
  expect(/NativeTabs\.Trigger\.Icon[^>]*\bmd=/.test(layout)).toBe(true);
  expect(pkg.dependencies["expo-symbols"]).toBeDefined();
});
