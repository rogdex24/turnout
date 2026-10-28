// Per-test setup. Uniwind 1.12 has no Jest support, so className stays a prop on the host element and tests assert on it.

// Screens read the safe-area insets; the library's own mock gives them zero insets without a provider.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// FlashList measures its views on the device. The library's own setup answers with a fixed phone-sized window so the list renders.
require("@shopify/flash-list/jestSetup");

// The phone's notification service does not exist in Jest; screens that mount the app layout get one that does nothing.
jest.mock("@/api/pushNative", () => ({
  nativePush: {
    platform: "other",
    permission: async () => ({ status: "denied", canAskAgain: false }),
    requestPermission: async () => ({ status: "denied", canAskAgain: false }),
    expoToken: async () => {
      throw new Error("no push service in Jest");
    },
    setUpChannels: async () => undefined,
    onTap: () => () => undefined,
    setForegroundHandler: () => undefined,
  },
}));
