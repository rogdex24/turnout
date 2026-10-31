import { fireEvent, render, screen } from "@testing-library/react-native";
import { groupFixture, MEET_AT, MEMBERS, SHOW_STARTS_AT } from "@/api/groupFixtures";
import { meet as copy } from "@/copy/meet";
import { type MeetCardData, MeetView, type MeetViewProps } from "./MeetView";

const noop = () => undefined;
const group = groupFixture();
const card: MeetCardData = {
  showTitle: "Traffic Jam Tales",
  startsAt: SHOW_STARTS_AT,
  meetAt: MEET_AT,
  cafe: group.cafe,
  venue: { name: "Shilpa Kala Vedika", lat: 17.4525, lng: 78.3811 },
  members: MEMBERS,
  belowPlan: false,
};

function view(over: Partial<MeetViewProps> = {}, cardOver: Partial<MeetCardData> = {}) {
  return render(
    <MeetView
      state={{ status: "ready", card: { ...card, ...cardOver } }}
      now={Date.parse(MEET_AT) - 48 * 60_000}
      offline={false}
      here="idle"
      line={{ kind: "hidden" }}
      realMap={false}
      onBack={noop}
      onRetry={noop}
      onOpenShow={noop}
      onOpenMaps={noop}
      onAskLocation={noop}
      onOpenSettings={noop}
      onHere={noop}
      onCall={noop}
      onOpenThread={noop}
      onReport={noop}
      onLeave={noop}
      onClosed={noop}
      onOpenAfter={null}
      {...over}
    />,
  );
}

describe("MeetView", () => {
  it("shows the static map card when there is no real map", async () => {
    await view({ realMap: false });
    expect(screen.getByTestId("meet-map-static")).toBeOnTheScreen();
    expect(screen.queryByTestId("meet-map")).toBeNull();
  });

  it("names the venue pin in the map label when the venue has no name", async () => {
    await view({ realMap: false }, { venue: { name: null, lat: 17.4525, lng: 78.3811 } });
    expect(screen.getByTestId("meet-map-static").props.accessibilityLabel).toBe(copy.map.label(card.cafe.name, copy.map.venue));
  });

  it("shows the real map when the build has one", async () => {
    await view({ realMap: true });
    expect(screen.getByTestId("meet-map")).toBeOnTheScreen();
  });

  it("counts down to the meet time", async () => {
    await view();
    expect(screen.getByLabelText("Meet at 6:00 PM, in 48 min")).toBeOnTheScreen();
  });

  it("keeps a four-digit meet time on one line, shrinking it on a narrow phone", async () => {
    // At 116 dp, 11:53 and the AM column are wider than an iPhone SE, and the time wrapped to a second line.
    await view();
    const digits = screen.getByTestId("meet-time-digits");
    expect(digits.props.numberOfLines).toBe(1);
    expect(digits.props.adjustsFontSizeToFit).toBe(true);
  });

  it("shows the smaller-group note", async () => {
    await view({}, { belowPlan: true, members: MEMBERS.slice(0, 3) });
    expect(screen.getByText(copy.group.smaller)).toBeOnTheScreen();
  });

  it("leaves the note out of a full group", async () => {
    await view();
    expect(screen.queryByText(copy.group.smaller)).toBeNull();
  });

  it("counts who is here once someone is", async () => {
    await view({}, { members: MEMBERS.map((member, index) => (index === 0 ? { ...member, checkedIn: true } : member)) });
    expect(screen.getByTestId("meet-here-count")).toHaveTextContent("1 of 4 here");
  });

  it("shows the walk line", async () => {
    await view({ line: { kind: "walk", minutes: 6 } });
    expect(screen.getByText("6 min walk to Cafe Niloufer")).toBeOnTheScreen();
  });

  it("points to Settings when the system will not ask again", async () => {
    await view({ line: { kind: "ask", canAsk: false } });
    expect(screen.getByLabelText(copy.location.settingsLabel)).toBeOnTheScreen();
  });

  it("shows the offline bar", async () => {
    await view({ offline: true });
    expect(screen.getByRole("alert")).toBeOnTheScreen();
  });

  it("opens the group chat from the card", async () => {
    const onOpenThread = jest.fn();
    await view({ onOpenThread });
    await fireEvent.press(screen.getByTestId("meet-thread"));
    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  it("opens the report form from the Safety sheet and closes the sheet", async () => {
    const onReport = jest.fn();
    await view({ onReport });
    await fireEvent.press(screen.getByTestId("meet-safety"));
    await fireEvent.press(screen.getByTestId("safety-report"));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("hides Leave in the Safety sheet while the plan is not known", async () => {
    await view({ onLeave: null });
    expect(screen.queryByTestId("safety-leave")).toBeNull();
  });
});
