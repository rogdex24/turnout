import { fireEvent, render, screen } from "@testing-library/react-native";
import { welcome } from "@/copy/welcome";
import { WelcomeView } from "./WelcomeView";

const WIDTH = 400;

async function open(onDone = jest.fn()) {
  await render(<WelcomeView onDone={onDone} />);
  await fireEvent(screen.getByTestId("welcome"), "layout", { nativeEvent: { layout: { width: WIDTH, height: 800 } } });
  return onDone;
}

const swipeTo = (card: number) =>
  fireEvent(screen.getByTestId("welcome-pager"), "momentumScrollEnd", {
    nativeEvent: { contentOffset: { x: (card - 1) * WIDTH, y: 0 } },
  });

describe("WelcomeView", () => {
  it("has three cards, each one element that ends in its place", async () => {
    await open();
    for (const n of [1, 2, 3]) {
      const label = screen.getByTestId(`welcome-card-${n}`).props.accessibilityLabel as string;
      expect(label.endsWith(`${n} of 3`)).toBe(true);
    }
  });

  it("says on every card what is checked, in the plan's words", async () => {
    await open();
    expect(welcome.trust).toBe("Everyone signs in with a phone number, a real photo and a social profile we check.");
    for (const n of [1, 2, 3]) {
      expect(screen.getByTestId(`welcome-card-${n}`).props.accessibilityLabel).toContain(welcome.trust);
    }
  });

  it("Next moves along and the last card says Get started", async () => {
    const onDone = await open();
    await fireEvent.press(screen.getByText(welcome.next));
    await fireEvent.press(screen.getByText(welcome.next));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(welcome.start)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(welcome.start));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a swipe moves the button along too", async () => {
    await open();
    await swipeTo(3);
    expect(screen.getByText(welcome.start)).toBeOnTheScreen();
    await swipeTo(1);
    expect(screen.getByText(welcome.next)).toBeOnTheScreen();
  });

  it("Skip ends the cards from the first or the second card and is gone on the last", async () => {
    const onDone = await open();
    await fireEvent.press(screen.getByRole("button", { name: welcome.skip }));
    expect(onDone).toHaveBeenCalledTimes(1);
    await swipeTo(3);
    expect(screen.queryByRole("button", { name: welcome.skip })).not.toBeOnTheScreen();
  });

  it("the dots are not read out, since each card already says its place", async () => {
    await open();
    expect(screen.getByTestId("welcome-dots", { includeHiddenElements: true }).props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
