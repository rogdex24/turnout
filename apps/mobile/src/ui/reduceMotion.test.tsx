import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, ScrollView } from "react-native";
import { welcome } from "@/copy/welcome";
import { WelcomeView } from "@/screens/welcome/WelcomeView";
import { Sheet } from "./primitives/Sheet";

function reduceMotionIs(on: boolean) {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(on);
}

const sheetAnimation = () => screen.container.queryAll((node) => node.props.animationType !== undefined)[0]?.props.animationType;

afterEach(() => jest.restoreAllMocks());

describe("Sheet under Reduce Motion", () => {
  it("slides up when Reduce Motion is off", async () => {
    reduceMotionIs(false);
    await render(<Sheet visible title="Title" onClose={jest.fn()} />);
    expect(sheetAnimation()).toBe("slide");
  });

  it("crossfades once Reduce Motion is on", async () => {
    reduceMotionIs(true);
    await render(<Sheet visible title="Title" onClose={jest.fn()} />);
    expect(sheetAnimation()).toBe("fade");
  });

  it("changes to a crossfade when the setting is turned on while it is open", async () => {
    reduceMotionIs(false);
    let listener: (value: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, handler) => {
      listener = handler as (value: boolean) => void;
      return { remove: jest.fn() };
    });
    await render(<Sheet visible title="Title" onClose={jest.fn()} />);
    expect(sheetAnimation()).toBe("slide");
    await act(async () => listener(true));
    expect(sheetAnimation()).toBe("fade");
  });
});

describe("WelcomeView under Reduce Motion", () => {
  const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, "scrollTo");

  async function pressNext() {
    await render(<WelcomeView onDone={jest.fn()} />);
    await fireEvent(screen.getByTestId("welcome"), "layout", { nativeEvent: { layout: { width: 400, height: 800 } } });
    await fireEvent.press(screen.getByText(welcome.next));
  }

  it("scrolls to the next card with the slide when Reduce Motion is off", async () => {
    reduceMotionIs(false);
    await pressNext();
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 400, animated: true });
  });

  it("jumps to the next card when Reduce Motion is on", async () => {
    reduceMotionIs(true);
    await pressNext();
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 400, animated: false });
  });
});
