import { fireEvent, render, screen } from "@testing-library/react-native";
import { sizes } from "@turnout/design-tokens";
import { CaretLeft, Info } from "phosphor-react-native";
import { StyleSheet, View } from "react-native";
import { TextScaleContext } from "../textScale";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Field } from "./Field";
import { IconButton } from "./IconButton";
import { Note } from "./Note";
import { Row } from "./Row";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { TextButton } from "./TextButton";

const flat = (style: unknown) => StyleSheet.flatten(style as object);

describe("hit areas", () => {
  it("an icon button is 44 by 44 and named", async () => {
    await render(<IconButton icon={CaretLeft} label="Back" onPress={() => undefined} />);
    const button = screen.getByRole("button", { name: "Back" });
    expect(flat(button.props.style)).toMatchObject({ width: sizes.hitMin, height: sizes.hitMin });
  });

  it("a chip is at least 44 tall", async () => {
    await render(<Chip label="Jubilee Hills" onPress={() => undefined} />);
    expect(flat(screen.getByRole("button").props.style)).toMatchObject({ minHeight: sizes.hitMin });
  });

  it("a text button is at least 44 tall and named", async () => {
    await render(<TextButton title="Skip" onPress={() => undefined} />);
    expect(flat(screen.getByRole("button", { name: "Skip" }).props.style)).toMatchObject({ minHeight: sizes.hitMin });
  });

  it("a text button that reads as a link says so", async () => {
    await render(<TextButton link title="Change number" onPress={() => undefined} />);
    expect(screen.getByRole("link", { name: "Change number" })).toBeOnTheScreen();
  });

  it("a row is at least 56 tall", async () => {
    await render(<Row title="Profile" onPress={() => undefined} />);
    expect(flat(screen.getByRole("button").props.style)).toMatchObject({ minHeight: sizes.row });
  });

  it("buttons are 56 and 48", async () => {
    await render(
      <>
        <Button title="Primary" onPress={() => undefined} />
        <Button variant="secondary" title="Secondary" onPress={() => undefined} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Primary" }).props.className).toContain("min-h-14");
    expect(screen.getByRole("button", { name: "Secondary" }).props.className).toContain("min-h-12");
  });
});

describe("Button", () => {
  it("ignores a press while loading and says it is busy", async () => {
    const onPress = jest.fn();
    await render(<Button title="Sending" loading onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Sending" });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("reports its selected state and inverts to ink", async () => {
    await render(<Chip label="All" selected onPress={() => undefined} />);
    const chip = screen.getByRole("button", { name: "All" });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(chip.props.className).toContain("bg-ink");
  });
});

describe("Field", () => {
  it("names the input by its label and shows help", async () => {
    await render(<Field label="First name" help="Your group sees this." />);
    expect(screen.getByLabelText("First name")).toBeTruthy();
    expect(screen.getByText("Your group sees this.")).toBeTruthy();
  });

  it("shows an error in place of the help, not in red", async () => {
    await render(<Field label="First name" help="Your group sees this." error="Use at least 2 letters." />);
    expect(screen.queryByText("Your group sees this.")).toBeNull();
    const error = screen.getByText("Use at least 2 letters.");
    expect(error.props.className).not.toMatch(/red|danger/);
  });

  it("passes typing through", async () => {
    const onChangeText = jest.fn();
    await render(<Field label="First name" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText("First name"), "Asha");
    expect(onChangeText).toHaveBeenCalledWith("Asha");
  });
});

describe("Note", () => {
  it("is a raised neutral surface", async () => {
    await render(<Note icon={Info}>We delete it after the show.</Note>);
    expect(screen.getByText("We delete it after the show.")).toBeTruthy();
    expect(screen.getByRole("summary").props.className).toContain("bg-surface-raised");
  });
});

describe("Sheet", () => {
  it("shows the title, lead and both actions, and the system back closes it", async () => {
    const onClose = jest.fn();
    const onPrimary = jest.fn();
    await render(
      <Sheet
        visible
        title="Leave this plan"
        lead="You can join again."
        onClose={onClose}
        primary={{ title: "Leave", onPress: onPrimary }}
        secondary={{ title: "Stay", onPress: onClose }}
      />,
    );
    expect(screen.getByRole("header", { name: "Leave this plan" })).toBeTruthy();
    expect(screen.getByText("You can join again.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Leave" }));
    expect(onPrimary).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("sheet-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId("sheet-scrim"), "press");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when hidden", async () => {
    await render(<Sheet visible={false} title="Hidden" onClose={() => undefined} />);
    expect(screen.queryByText("Hidden")).toBeNull();
  });
});

describe("Text", () => {
  it("uses tabular figures when asked", async () => {
    await render(<Text tabular>7:00 PM</Text>);
    expect(StyleSheet.flatten(screen.getByText("7:00 PM").props.style)).toMatchObject({ fontVariant: ["tabular-nums"] });
  });

  it("sizes itself from the tokens when a story forces a text scale", async () => {
    await render(
      <TextScaleContext.Provider value={2}>
        <Text variant="body">Hello</Text>
        <Text variant="display-hero">Fixed</Text>
        <Text variant="label">Capped</Text>
      </TextScaleContext.Provider>,
    );
    expect(StyleSheet.flatten(screen.getByText("Hello").props.style)).toMatchObject({ fontSize: 30, lineHeight: 44 });
    expect(StyleSheet.flatten(screen.getByText("Fixed").props.style)).toMatchObject({ fontSize: 116 });
    expect(StyleSheet.flatten(screen.getByText("Capped").props.style)).toMatchObject({ fontSize: 12 * 1.3 });
    expect(screen.getByText("Hello").props.allowFontScaling).toBe(false);
  });

  it("follows the system when nothing is forced", async () => {
    await render(
      <View>
        <Text variant="body">Hello</Text>
      </View>,
    );
    expect(screen.getByText("Hello").props.allowFontScaling).toBe(true);
  });
});
