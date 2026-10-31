import { act, render, screen } from "@testing-library/react-native";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { Switch } from "./Switch";

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

const ui = <Switch value onValueChange={jest.fn()} accessibilityLabel="Women and non-binary groups only" testID="switch" />;

describe("Switch", () => {
  it("is built again when the app comes back to the front on iOS, so iOS 26 cannot leave the thumb white", async () => {
    expect(Platform.OS).toBe("ios");
    await render(ui);
    const before = screen.getByTestId("switch");
    await act(async () => listener?.("inactive"));
    expect(screen.getByTestId("switch")).toBe(before);
    await act(async () => listener?.("active"));
    expect(screen.getByTestId("switch")).not.toBe(before);
  });

  it("keeps the same switch when nothing left the front", async () => {
    const view = await render(ui);
    const before = screen.getByTestId("switch");
    await view.rerender(ui);
    expect(screen.getByTestId("switch")).toBe(before);
  });

  it("stops listening when it goes", async () => {
    const view = await render(ui);
    await view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
