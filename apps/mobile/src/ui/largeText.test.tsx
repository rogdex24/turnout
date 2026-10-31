import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { displayFaces, spacing } from "@turnout/design-tokens";
import { PixelRatio, StyleSheet } from "react-native";
import { Loaded } from "@/screens/home/HomeView.stories";
import { Early } from "@/screens/meet/MeetView.stories";
import { GroupConfirmed } from "@/screens/plan/PlanView.stories";
import { Conversation } from "@/screens/thread/ThreadView.stories";
import { BackBar } from "./BackBar";
import { POSTER_HEIGHT, Poster } from "./Poster";
import { Button } from "./primitives/Button";
import { TextButton } from "./primitives/TextButton";
import { fitDisplaySize, LARGEST_TEXT_SCALE, scaledMetrics, TextScaleContext } from "./textScale";

/**
 * A row with a fixed height cuts its text off at the largest text size. These check the shared pieces that carry text in a row:
 * they set a minimum height, so a label or a second line grows the row instead of being clipped. Phone checks are in A11Y.md.
 */

const fixedHeight = /(^|\s)h-\d/;

describe("rows grow with the largest text size", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(["primary", "secondary"] as const)("the %s button has a minimum height and no fixed one", async (variant) => {
    await render(
      <TextScaleContext value={LARGEST_TEXT_SCALE}>
        <Button title="Go to the group's plan" variant={variant} onPress={jest.fn()} />
      </TextScaleContext>,
    );
    const className = screen.getByRole("button").props.className as string;
    expect(className).toMatch(/(^|\s)min-h-1[24](\s|$)/);
    expect(className).not.toMatch(fixedHeight);
  });

  it("the thread header, which stacks a title over a subtitle, has a minimum height and no fixed one", async () => {
    const Story = Conversation.render as () => React.ReactElement;
    await render(
      <TextScaleContext value={LARGEST_TEXT_SCALE}>
        <Story />
      </TextScaleContext>,
    );
    const titles = screen.getAllByTestId("thread-title");
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      const className = title.parent?.parent?.props.className as string;
      expect(className).toContain("min-h-14");
      expect(className).not.toMatch(fixedHeight);
    }
  });

  it("a centred bar title keeps clear of the wider side and ends in an ellipsis", async () => {
    await render(
      <TextScaleContext value={1}>
        <BackBar onBack={jest.fn()} title="Meeting up" trailing={<TextButton title="Safety" onPress={jest.fn()} testID="action" />} />
      </TextScaleContext>,
    );
    const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } } });
    // At the largest text size the action is far wider than the back button, and the title must clear the action on both sides.
    const side = (testID: string) => {
      let node = screen.getByTestId(testID);
      while (!node.props.onLayout && node.parent) node = node.parent;
      return node;
    };
    await fireEvent(side("back"), "layout", layout(44));
    await fireEvent(side("action"), "layout", layout(150));
    const box = screen.getByTestId("back-bar-title");
    expect(box.props.style).toEqual(expect.objectContaining({ paddingHorizontal: spacing[2] + 150 + spacing[2] }));
    expect(screen.getByRole("header", { name: "Meeting up" }).props.numberOfLines).toBe(1);
  });

  it("a bar title goes on its own row and wraps at a large text size instead of vanishing", async () => {
    await render(
      <TextScaleContext value={LARGEST_TEXT_SCALE}>
        <BackBar onBack={jest.fn()} title="Meet card" trailing={<TextButton title="Safety" onPress={jest.fn()} testID="action" />} />
      </TextScaleContext>,
    );
    const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } } });
    const side = (testID: string) => {
      let node = screen.getByTestId(testID);
      while (!node.props.onLayout && node.parent) node = node.parent;
      return node;
    };
    const leading = side("back");
    // An iPhone SE at the largest text size: the Safety action takes most of the 375 dp bar, as in the visual capture.
    await fireEvent(leading.parent as typeof leading, "layout", layout(375));
    await fireEvent(leading, "layout", layout(44));
    await fireEvent(side("action"), "layout", layout(220));
    const box = screen.getByTestId("back-bar-title");
    expect(box.props.style?.paddingHorizontal).toBeUndefined();
    expect(box.props.className).not.toContain("absolute");
    expect(screen.getByRole("header", { name: "Meet card" }).props.numberOfLines).toBeUndefined();
    expect((leading.parent as typeof leading).props.className).toContain("min-h-14");
  });

  it("the thread composer input grows with the text size and scrolls past four lines, so the send button stays on screen", async () => {
    const Story = Conversation.render as () => React.ReactElement;
    await render(
      <TextScaleContext value={LARGEST_TEXT_SCALE}>
        <Story />
      </TextScaleContext>,
    );
    const inputs = screen.getAllByTestId("thread-input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const style = StyleSheet.flatten(input.props.style) as { maxHeight: number };
      expect(style.maxHeight).toBe(scaledMetrics("body", LARGEST_TEXT_SCALE).lineHeight * 4 + 2 * spacing[3]);
      expect(input.props.className).not.toMatch(/(^|\s)max-h-/);
    }
  });

  it("a Home day heading wraps its date under the title instead of running off the screen", async () => {
    const Story = Loaded.render as () => React.ReactElement;
    await render(
      <TextScaleContext value={LARGEST_TEXT_SCALE}>
        <Story />
      </TextScaleContext>,
    );
    const days = screen.getAllByTestId("home-day");
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) expect(day.props.className).toMatch(/(^|\s)flex-wrap(\s|$)/);
  });

  it("a poster title leaves room for the category line, which grows to 1.3 and no further, so its top is not cut off", async () => {
    await render(
      <TextScaleContext value={LARGEST_TEXT_SCALE}>
        <Poster variant="featured" title="The Monsoon Theory" category="music" />
      </TextScaleContext>,
    );
    await fireEvent(screen.getByLabelText("The Monsoon Theory, Live music"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 328, height: POSTER_HEIGHT.featured } },
    });
    const { fontSize } = StyleSheet.flatten(screen.getByText("The Monsoon Theory").props.style) as { fontSize: number };
    // The scrim pads by 12 over the title, 4 between and 16 under the category line, which stops growing at 1.3.
    const titleRoom = POSTER_HEIGHT.featured - spacing[3] - spacing[1] - spacing[4] - scaledMetrics("meta", 1.3).lineHeight;
    expect(fontSize).toBe(fitDisplaySize("The Monsoon Theory", 328 - 2 * spacing[4], "display-poster", 3, titleRoom));
    expect(fontSize).toBeLessThan(displayFaces["display-poster"].maxFontSize);
  });
  it("the meet countdown goes under the time instead of beside it, so the time keeps its width", async () => {
    // The Matrix's default cell follows the system size, which the React Native mock puts at 2.
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
    const Story = Early.render as () => React.ReactElement;
    await render(<Story />);
    const hidden = { includeHiddenElements: true };
    // At the default size the countdown sits in the column beside the digits, under PM.
    const usual = within(screen.getByTestId("matrix-light-1"));
    expect(within(usual.getByTestId("meet-time-side", hidden)).getByTestId("meet-countdown", hidden)).toBeOnTheScreen();
    // At the largest size that column took most of an iPhone SE and the digits shrank to a third.
    const large = within(screen.getByTestId(`matrix-light-${LARGEST_TEXT_SCALE}`));
    expect(within(large.getByTestId("meet-time-side", hidden)).queryByTestId("meet-countdown", hidden)).toBeNull();
    expect(within(large.getByTestId("meet-time")).getByTestId("meet-countdown", hidden)).toBeOnTheScreen();
  });

  it("the plan steps stack in a column, so no step label breaks inside a word", async () => {
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
    const Story = GroupConfirmed.render as () => React.ReactElement;
    await render(<Story />);
    const row = within(screen.getByTestId("matrix-light-1")).getByTestId("plan-steps");
    expect(row.props.className).toMatch(/(^|\s)flex-row(\s|$)/);
    const column = within(screen.getByTestId(`matrix-light-${LARGEST_TEXT_SCALE}`)).getByTestId("plan-steps");
    expect(column.props.className).not.toMatch(/(^|\s)flex-row(\s|$)/);
    // Each step is a bar beside its label, and the label has the rest of the width.
    for (const step of within(column).getAllByTestId("plan-step")) expect(step.props.className).toMatch(/(^|\s)flex-row(\s|$)/);
  });
});
