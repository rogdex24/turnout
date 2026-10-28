// ESLint here does two jobs Biome cannot: the React Compiler rules (through eslint-plugin-react-hooks) and Expo's env var rules.
// Everything else (format, style, correctness) stays in Biome at the repo root.
import tsParser from "@typescript-eslint/parser";
import expo from "eslint-plugin-expo";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["node_modules/**", "ios/**", "android/**", ".expo/**", "dist/**", ".rnstorybook/storybook.requires.ts", "uniwind-types.d.ts"],
  },
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { expo },
    rules: {
      "expo/no-dynamic-env-var": "error",
      "expo/no-env-var-destructuring": "error",
    },
  },
];
