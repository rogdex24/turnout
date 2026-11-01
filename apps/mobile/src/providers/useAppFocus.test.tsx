import { focusManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { useAppFocus } from "./useAppFocus";

let listener: ((state: AppStateStatus) => void) | undefined;
const remove = jest.fn();

beforeEach(() => {
  listener = undefined;
  remove.mockReset();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    listener = handler as (state: AppStateStatus) => void;
    return { remove };
  });
});
afterEach(() => jest.restoreAllMocks());

describe("useAppFocus", () => {
  it("stops polling when the app goes to the background and starts again when it returns", async () => {
    await renderHook(() => useAppFocus());
    expect(focusManager.isFocused()).toBe(true);
    await act(async () => listener?.("background"));
    expect(focusManager.isFocused()).toBe(false);
    await act(async () => listener?.("active"));
    expect(focusManager.isFocused()).toBe(true);
  });

  it("stops listening when the providers go", async () => {
    const view = await renderHook(() => useAppFocus());
    await view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
