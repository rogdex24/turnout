import { render, screen } from "@testing-library/react-native";
import { Conversation } from "@/screens/thread/ThreadView.stories";
import { Button } from "./primitives/Button";
import { LARGEST_TEXT_SCALE, TextScaleContext } from "./textScale";

/**
 * A row with a fixed height cuts its text off at the largest text size. These check the shared pieces that carry text in a row:
 * they set a minimum height, so a label or a second line grows the row instead of being clipped. Phone checks are in A11Y.md.
 */

const fixedHeight = /(^|\s)h-\d/;

describe("rows grow with the largest text size", () => {
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
});
