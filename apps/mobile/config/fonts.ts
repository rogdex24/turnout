/**
 * The fonts embedded at build time (plan section 2): Inter 400, 500, 600 for text and Big Shoulders Display 700, 800, 900 for the
 * display faces. The expo-font config plugin links them natively, so `fontFamily: "Inter"` with `fontWeight: "600"` (the pairs in
 * @turnout/design-tokens) resolves on both platforms and nothing loads at runtime.
 */
export interface FontFace {
  weight: number;
  /** Path inside the package that ships the files. */
  file: string;
}

export interface FontFamily {
  fontFamily: string;
  pkg: string;
  faces: readonly FontFace[];
}

export const FONT_FAMILIES: readonly FontFamily[] = [
  {
    fontFamily: "Inter",
    pkg: "@expo-google-fonts/inter",
    faces: [
      { weight: 400, file: "400Regular/Inter_400Regular.ttf" },
      { weight: 500, file: "500Medium/Inter_500Medium.ttf" },
      { weight: 600, file: "600SemiBold/Inter_600SemiBold.ttf" },
    ],
  },
  {
    fontFamily: "Big Shoulders Display",
    pkg: "@expo-google-fonts/big-shoulders",
    faces: [
      { weight: 700, file: "700Bold/BigShoulders_700Bold.ttf" },
      { weight: 800, file: "800ExtraBold/BigShoulders_800ExtraBold.ttf" },
      { weight: 900, file: "900Black/BigShoulders_900Black.ttf" },
    ],
  },
];
