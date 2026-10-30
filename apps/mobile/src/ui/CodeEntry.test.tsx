import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { processColor, StyleSheet } from "react-native";
import { CodeEntry } from "./CodeEntry";

function Harness({ initial = "", onChange }: { initial?: string; onChange?: (text: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <CodeEntry
      testID="code"
      value={value}
      onChangeText={(text) => {
        setValue(text);
        onChange?.(text);
      }}
      label="6 digit code"
      progress={`${value.length} of 6 entered`}
    />
  );
}

describe("CodeEntry", () => {
  test("one field, named with its progress", async () => {
    await render(<Harness initial="48" />);
    expect(screen.getByLabelText("6 digit code, 2 of 6 entered")).toBeOnTheScreen();
  });

  test("shows each typed digit in its own box", async () => {
    await render(<Harness initial="481" />);
    for (const digit of ["4", "8", "1"]) expect(screen.getByText(digit, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  test("typing keeps digits only and stops at six", async () => {
    const seen: string[] = [];
    await render(<Harness onChange={(text) => seen.push(text)} />);
    await fireEvent.changeText(screen.getByTestId("code-input"), "4a8 1");
    await fireEvent.changeText(screen.getByTestId("code-input"), "48192699");
    expect(seen).toEqual(["481", "481926"]);
  });

  test("a paste with words around the code keeps the digits", async () => {
    const seen: string[] = [];
    await render(<Harness onChange={(text) => seen.push(text)} />);
    await fireEvent.changeText(screen.getByTestId("code-input"), "Your code is 481926");
    expect(seen).toEqual(["481926"]);
  });

  test("the hidden field asks for a one-time code, so the keyboard offers it", async () => {
    await render(<Harness />);
    const input = screen.getByTestId("code-input");
    expect(input.props.textContentType).toBe("oneTimeCode");
    expect(input.props.keyboardType).toBe("number-pad");
  });

  test("the ring sits on the next empty box once the field has focus", async () => {
    await render(<Harness initial="48" />);
    await fireEvent(screen.getByTestId("code-input"), "focus");
    const ringed = [0, 1, 2, 3, 4, 5].map((i) =>
      (screen.getByTestId(`code-box-${i}`, { includeHiddenElements: true }).props.className as string).includes("border-ink"),
    );
    expect(ringed).toEqual([false, false, true, false, false, false]);
  });

  test("the field is see-through, not at zero opacity, so screen readers and the device tests can find it", async () => {
    await render(<Harness />);
    const className = screen.getByTestId("code-input").props.className as string;
    expect(className.split(" ")).not.toContain("opacity-0");
    expect(className.split(" ")).toEqual(expect.arrayContaining(["text-transparent", "bg-transparent"]));
  });

  test("the typed text is see-through on Android too, where color 0 drew the digits in the default black", async () => {
    await render(<Harness initial="482" />);
    const color = processColor(StyleSheet.flatten(screen.getByTestId("code-input").props.style)?.color);
    expect(typeof color).toBe("number");
    expect(color).not.toBe(0);
    expect((color as number) >>> 24).toBe(0);
  });
});
