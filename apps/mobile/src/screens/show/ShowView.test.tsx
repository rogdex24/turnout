import { fireEvent, render, screen } from "@testing-library/react-native";
import { showFixture } from "@/api/showFixtures";
import { show as copy } from "@/copy/show";
import { ShowView, type ShowViewProps } from "./ShowView";

const base = (over: Partial<ShowViewProps> = {}): ShowViewProps => ({
  detail: { status: "ready", show: showFixture() },
  lookingCount: null,
  groupsEnabled: false,
  onBack: jest.fn(),
  onRetry: jest.fn(),
  onSeeShows: jest.fn(),
  onOpenLink: jest.fn(),
  onGo: jest.fn(),
  ...over,
});

const draw = async (over: Partial<ShowViewProps> = {}) => {
  const props = base(over);
  await render(<ShowView {...props} />);
  return props;
};

describe("ShowView, a ready show", () => {
  it("shows the title, the date band, the venue and the price", async () => {
    await draw();
    expect(screen.getByTestId("show")).toBeOnTheScreen();
    expect(screen.getByLabelText(/^The Monsoon Theory, /)).toBeOnTheScreen();
    expect(screen.getByLabelText("FRI 30 OCT, 8:00 PM")).toBeOnTheScreen();
    expect(screen.getByText("Phoenix Arena")).toBeOnTheScreen();
    expect(screen.getByText("Hitec City")).toBeOnTheScreen();
    expect(screen.getByText("₹1,499")).toBeOnTheScreen();
    expect(screen.getByText(copy.from)).toBeOnTheScreen();
  });

  it("uses the area alone when the source gave no venue name, and says Free for a free show", async () => {
    await draw({
      detail: {
        status: "ready",
        show: showFixture({
          is_free: true,
          price_min: null,
          price_max: null,
          venue: { name: null, area: "jubilee-hills", lat: null, lng: null },
        }),
      },
    });
    expect(screen.getByText("Jubilee Hills")).toBeOnTheScreen();
    expect(screen.getByText("Free")).toBeOnTheScreen();
    expect(screen.queryByText(copy.from)).toBeNull();
  });

  it("leaves the price out when the source gave none", async () => {
    await draw({ detail: { status: "ready", show: showFixture({ price_min: null, price_max: null }) } });
    expect(screen.queryByText(copy.from)).toBeNull();
  });

  it("opens the ticket page in the browser from the buy button", async () => {
    const props = await draw();
    const buy = screen.getByTestId("show-buy");
    expect(buy.props.accessibilityLabel).toBe(copy.buyLabel("BookMyShow"));
    await fireEvent.press(buy);
    expect(props.onOpenLink).toHaveBeenCalledWith("https://example.com/tickets/monsoon-theory");
  });

  it("has no buy button for a ticket address that is not a web page", async () => {
    await draw({ detail: { status: "ready", show: showFixture({ ticket_url: "javascript:alert(1)" }) } });
    expect(screen.queryByTestId("show-buy")).toBeNull();
  });

  it("has no buy button when the show has no ticket address", async () => {
    await draw({ detail: { status: "ready", show: showFixture({ ticket_url: "" }) } });
    expect(screen.queryByTestId("show-buy")).toBeNull();
  });

  it("credits the source and opens its listing in the browser", async () => {
    const props = await draw();
    expect(screen.getByText(copy.creditPrefix)).toBeOnTheScreen();
    const link = screen.getByTestId("show-source");
    expect(link.props.accessibilityLabel).toBe(copy.creditLabel("BookMyShow"));
    await fireEvent.press(link);
    expect(props.onOpenLink).toHaveBeenCalledWith("https://example.com/source/monsoon-theory");
  });

  it("shows the credit as plain text when its address is not a web page", async () => {
    await draw({ detail: { status: "ready", show: showFixture({ source: { name: "BookMyShow", url: "intent://x" } }) } });
    expect(screen.getByText(copy.credit("BookMyShow"))).toBeOnTheScreen();
    expect(screen.queryByTestId("show-source")).toBeNull();
  });

  it("goes back from the back button", async () => {
    const props = await draw();
    await fireEvent.press(screen.getByTestId("back"));
    expect(props.onBack).toHaveBeenCalled();
  });
});

describe("ShowView, the looking count", () => {
  it("is left out when the count is not known", async () => {
    await draw({ lookingCount: null });
    expect(screen.queryByTestId("show-looking")).toBeNull();
  });

  it("reads for 0, 1 and many", async () => {
    const { rerender } = await render(<ShowView {...base({ lookingCount: 0 })} />);
    expect(screen.getByLabelText(copy.looking.none)).toBeOnTheScreen();
    await rerender(<ShowView {...base({ lookingCount: 1 })} />);
    expect(screen.getByLabelText(`1 ${copy.looking.one}`)).toBeOnTheScreen();
    await rerender(<ShowView {...base({ lookingCount: 12 })} />);
    expect(screen.getByLabelText(`12 ${copy.looking.many}`)).toBeOnTheScreen();
  });
});

describe("ShowView, Go with a group", () => {
  it("opens Coming soon in this build while groups are off", async () => {
    const props = await draw({ groupsEnabled: false });
    expect(screen.queryByText(copy.comingSoon.title)).toBeNull();
    await fireEvent.press(screen.getByTestId("show-go"));
    expect(screen.getByText(copy.comingSoon.title)).toBeOnTheScreen();
    expect(props.onGo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(copy.comingSoon.close));
    expect(screen.queryByText(copy.comingSoon.title)).toBeNull();
  });

  it("starts a group for the show when groups are on", async () => {
    const props = await draw({ groupsEnabled: true });
    await fireEvent.press(screen.getByTestId("show-go"));
    expect(props.onGo).toHaveBeenCalledWith("monsoon-theory");
    expect(screen.queryByText(copy.comingSoon.title)).toBeNull();
  });

  it("is disabled with the reason written under it when the show is not eligible", async () => {
    const props = await draw({ groupsEnabled: true, detail: { status: "ready", show: showFixture({ group_eligible: false }) } });
    const go = screen.getByTestId("show-go");
    expect(go.props.accessibilityState.disabled).toBe(true);
    expect(go.props.accessibilityHint).toBe(copy.goOff.notEligible);
    expect(screen.getByText(copy.goOff.notEligible)).toBeOnTheScreen();
    await fireEvent.press(go);
    expect(props.onGo).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.comingSoon.title)).toBeNull();
  });

  it("is enabled and has no reason for an eligible show", async () => {
    await draw();
    expect(screen.getByTestId("show-go").props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId("show-go-reason")).toBeNull();
  });
});

describe("ShowView, the other states", () => {
  it("shows a loading placeholder with a back button", async () => {
    await draw({ detail: { status: "loading" } });
    expect(screen.getByTestId("show-loading")).toBeOnTheScreen();
    expect(screen.getByTestId("back")).toBeOnTheScreen();
  });

  it("says the show is gone and offers the shows", async () => {
    const props = await draw({ detail: { status: "not_found" } });
    expect(screen.getByText(copy.notFound.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(copy.notFound.action));
    expect(props.onSeeShows).toHaveBeenCalled();
  });

  it("shows a plain error and retries", async () => {
    const props = await draw({ detail: { status: "error", kind: "server" } });
    await fireEvent.press(screen.getByText("Try again"));
    expect(props.onRetry).toHaveBeenCalled();
  });
});
