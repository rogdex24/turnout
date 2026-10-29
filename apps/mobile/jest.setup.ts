// Per-test setup. Uniwind 1.12 has no Jest support, so className stays a prop on the host element and tests assert on it.

// Screens read the safe-area insets; the library's own mock gives them zero insets without a provider.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// FlashList measures its views on the device. The library's own setup answers with a fixed phone-sized window so the list renders.
require("@shopify/flash-list/jestSetup");

// The phone's notification service does not exist in Jest; screens that mount the app layout get one that does nothing.
jest.mock("@/api/pushNative", () => ({
  nativePush: {
    platform: "other",
    permission: async () => ({ status: "undetermined", canAskAgain: true }),
    requestPermission: async () => ({ status: "denied", canAskAgain: false }),
    expoToken: async () => {
      throw new Error("no push service in Jest");
    },
    setUpChannels: async () => undefined,
    onTap: () => () => undefined,
    setForegroundHandler: () => undefined,
  },
}));

// Nor does the phone's location service; the meet card tests pass their own fake.
jest.mock("@/api/locationNative", () => ({
  nativeLocation: {
    permission: async () => ({ status: "undetermined", canAskAgain: true }),
    requestPermission: async () => ({ status: "denied", canAskAgain: false }),
    watch: async () => () => undefined,
  },
}));

// The map is a native view with no Jest build. This stand-in draws the map as a view and each pin as a view named by its title.
jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MapView = ({ children, ...props }: { children?: unknown }) => React.createElement(View, { ...props, testID: "map-view" }, children);
  const Marker = ({ title }: { title?: string }) => React.createElement(View, { testID: "map-pin", accessibilityLabel: title });
  return { __esModule: true, default: MapView, Marker };
});

// Nor can Jest block a screenshot; the after-the-show tests read these calls to see when the screen is protected.
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));
