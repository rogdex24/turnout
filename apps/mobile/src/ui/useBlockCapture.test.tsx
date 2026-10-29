import { renderHook } from "@testing-library/react-native";
import { useIsFocused } from "expo-router";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useBlockCapture } from "./useBlockCapture";

jest.mock("expo-router", () => ({ useIsFocused: jest.fn() }));

const focused = jest.mocked(useIsFocused);

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_ALLOW_CAPTURE;
});

describe("useBlockCapture", () => {
  it("blocks capture while the screen is in front and lets it again on blur", async () => {
    focused.mockReturnValue(true);
    const { rerender } = await renderHook(() => useBlockCapture());
    expect(preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(allowScreenCaptureAsync).not.toHaveBeenCalled();

    focused.mockReturnValue(false);
    await rerender({});
    expect(allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it("does not block capture while the screen is behind another", async () => {
    focused.mockReturnValue(false);
    await renderHook(() => useBlockCapture());
    expect(preventScreenCaptureAsync).not.toHaveBeenCalled();
  });

  it("lets capture again when the screen goes away", async () => {
    focused.mockReturnValue(true);
    const { unmount } = await renderHook(() => useBlockCapture());
    await unmount();
    expect(allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it("leaves capture on in the e2e build, so Maestro can take screenshots", async () => {
    process.env.EXPO_PUBLIC_ALLOW_CAPTURE = "1";
    focused.mockReturnValue(true);
    await renderHook(() => useBlockCapture());
    expect(preventScreenCaptureAsync).not.toHaveBeenCalled();
  });
});
