import { fireEvent, render, screen } from "@testing-library/react-native";
import { showFixture } from "@/api/showFixtures";
import { FeaturedCard, ShowTile } from "./ShowCard";

describe.each([
  ["FeaturedCard", FeaturedCard],
  ["ShowTile", ShowTile],
])("%s", (_name, Card) => {
  it("opens the show by its public id", async () => {
    const onPress = jest.fn();
    await render(<Card show={showFixture()} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId("show-card-monsoon-theory"));
    expect(onPress).toHaveBeenCalledWith("monsoon-theory");
  });

  it("reads as one button: title, category, time, place and price, with no count of people", async () => {
    await render(<Card show={showFixture()} onPress={jest.fn()} />);
    const label: string = screen.getByTestId("show-card-monsoon-theory").props.accessibilityLabel;
    expect(label).toContain("The Monsoon Theory");
    expect(label).toContain("Phoenix Arena, Hitec City");
    expect(label).toContain("1,499");
    expect(label).not.toMatch(/looking|going|interested/i);
  });

  it("drops the venue name when the source gave none, and the price when there is none", async () => {
    const show = showFixture({ price_min: null, price_max: null, venue: { name: null, area: "jubilee-hills", lat: null, lng: null } });
    await render(<Card show={show} onPress={jest.fn()} />);
    const label: string = screen.getByTestId("show-card-monsoon-theory").props.accessibilityLabel;
    expect(label).toContain("Jubilee Hills");
    expect(label).not.toContain("null");
    expect(label).not.toContain("₹");
  });
});
