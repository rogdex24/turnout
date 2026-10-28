import { fireEvent, render, screen } from "@testing-library/react-native";
import { home } from "@/copy/home";
import { PlanBar } from "./PlanBar";

const props = { title: "The Monsoon Theory", category: "music", when: "Fri 8:00 PM", status: "Finding your group" };

describe("PlanBar", () => {
  it("reads as one button with the plan, the time and the status", async () => {
    await render(<PlanBar {...props} onPress={jest.fn()} />);
    const bar = screen.getByTestId("plan-bar");
    expect(bar.props.accessibilityRole).toBe("button");
    expect(bar.props.accessibilityLabel).toBe(home.planBar.label(props.title, props.when, props.status));
  });

  it("opens the plan on one tap", async () => {
    const onPress = jest.fn();
    await render(<PlanBar {...props} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId("plan-bar"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("reads a live status in the signal color and a settled one muted", async () => {
    await render(<PlanBar {...props} live onPress={jest.fn()} />);
    expect(screen.getByText(props.status).props.className).toContain("text-signal");
    await screen.unmount();
    await render(<PlanBar {...props} onPress={jest.fn()} />);
    expect(screen.getByText(props.status).props.className).toContain("text-muted");
  });
});
