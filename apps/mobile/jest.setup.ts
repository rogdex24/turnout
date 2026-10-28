// Per-test setup. Uniwind 1.12 has no Jest support, so className stays a prop on the host element and tests assert on it.

// Screens read the safe-area insets; the library's own mock gives them zero insets without a provider.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);
