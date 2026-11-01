import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./Button";

test("the primary button is a pill with a role and a label", async () => {
  const onPress = jest.fn();
  await render(<Button title="Continue" onPress={onPress} />);
  const button = screen.getByRole("button", { name: "Continue" });
  expect(button.props.className).toContain("min-h-14");
  expect(button.props.className).toContain("rounded-pill");
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
