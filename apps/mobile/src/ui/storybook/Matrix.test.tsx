import { render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { CodeView } from "@/screens/signin/CodeView";
import { SAMPLE_LABEL } from "@/screens/signin/fixtures";
import { PhoneView } from "@/screens/signin/PhoneView";
import { Text } from "../primitives/Text";
import { FollowDeviceContext, Matrix } from "./Matrix";

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

  test("shows the four cells, each with its theme and text size named", async () => {
    await render(
      <Matrix>
        <Text>Body</Text>
      </Matrix>,
    );
    expect(screen.getAllByText("Body")).toHaveLength(4);
    for (const name of ["Light, default text", "Light, largest text", "Dark, default text", "Dark, largest text"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  // The device job sets the theme and the text size on the device and photographs the top of the screen, so a story it opens shows
  // one copy that follows the device. Four forced cells would put "Light, default text" in every shot.
  test("following the device, it shows the content once, with no forced theme or text size", async () => {
    await render(
      <FollowDeviceContext.Provider value={true}>
        <Matrix framed>
          <Text>Body</Text>
        </Matrix>
      </FollowDeviceContext.Provider>,
    );
    expect(screen.getAllByText("Body")).toHaveLength(1);
    const cell = screen.getByTestId("matrix-device");
    // Framed: the content is one window high and starts at the top of the shot, with no padding above it.
    expect(cell.props.className).not.toContain("py-4");
    expect(cell.children[0]).toHaveStyle({ height: Dimensions.get("window").height });
    expect(screen.queryByText(/default text|largest text/)).toBeNull();
  });
});
