import { render, screen } from "@testing-library/react-native";
import { CodeView } from "@/screens/signin/CodeView";
import { SAMPLE_LABEL } from "@/screens/signin/fixtures";
import { PhoneView } from "@/screens/signin/PhoneView";
import { Matrix } from "./Matrix";

const noop = () => undefined;

describe("Matrix", () => {
  // Four copies of a screen would each take focus, and the keyboard then scrolls the matrix to the last copy.
  test("no input in a story takes focus on its own", async () => {
    await render(
      <Matrix framed>
        <PhoneView value="" onChangeText={noop} onSend={noop} />
        <CodeView
          phoneLabel={SAMPLE_LABEL}
          value=""
          onChangeText={noop}
          onSendAgain={noop}
          onPaste={noop}
          onChangeNumber={noop}
          onBack={noop}
        />
      </Matrix>,
    );
    const inputs = [...screen.getAllByTestId("phone-input"), ...screen.getAllByTestId("code-field-input")];
    expect(inputs).toHaveLength(8);
    for (const input of inputs) expect(input.props.autoFocus).toBe(false);
  });
});
