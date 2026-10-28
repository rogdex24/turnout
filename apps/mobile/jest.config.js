/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src", "<rootDir>/config"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/jest/styleMock.js",
    // The contract package is TypeScript that imports its own files as `./x.js` (NodeNext style); Jest finds `./x.ts` without the suffix.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  // jest-expo's pattern, plus uniwind, which ships TypeScript source for React Native.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|uniwind|standard-navigation|@turnout/.*))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
