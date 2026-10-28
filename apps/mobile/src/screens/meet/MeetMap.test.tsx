import { render } from "@testing-library/react-native";
import { MeetMap } from "./MeetMap";

const cafe = { name: "Cafe Niloufer", point: { lat: 17.4435, lng: 78.3772 } };
const venue = { name: "Shilpa Kala Vedika", point: { lat: 17.4525, lng: 78.3811 } };

describe("MeetMap", () => {
  it("puts one pin on the cafe and one on the venue", async () => {
    const screen = await render(<MeetMap cafe={cafe} venue={venue} label="Map with both" />);
    expect(screen.getAllByTestId("map-pin").map((pin) => pin.props.accessibilityLabel)).toEqual(["Cafe Niloufer", "Shilpa Kala Vedika"]);
    expect(screen.getByLabelText("Map with both")).toBeTruthy();
  });

  it("is a still picture that does not draw the person's own position", async () => {
    const screen = await render(<MeetMap cafe={cafe} venue={null} label="Map" />);
    expect(screen.getAllByTestId("map-pin")).toHaveLength(1);
    const map = screen.getByTestId("map-view");
    expect(map.props.showsUserLocation).toBe(false);
    expect(map.props.scrollEnabled).toBe(false);
  });
});
