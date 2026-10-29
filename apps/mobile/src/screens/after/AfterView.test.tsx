import { fireEvent, render, screen } from "@testing-library/react-native";
import { MEMBERS } from "@/api/groupFixtures";
import { after as copy } from "@/copy/after";
import { type AfterData, AfterView, type AfterViewProps } from "./AfterView";

const noop = () => undefined;
const data: AfterData = {
  groupId: "g1",
  showTitle: "Traffic Jam Tales",
  feedbackOpenUntil: "2026-11-11T04:30:00.000Z",
  members: MEMBERS.filter((member) => !member.isYou),
  marked: [],
};

function view(over: Partial<AfterViewProps> = {}) {
  return render(
    <AfterView
      state={{ status: "ready", data }}
      offline={false}
      mark={null}
      onBack={noop}
      onRetry={noop}
      onMark={noop}
      onReport={noop}
      onClosed={noop}
      {...over}
    />,
  );
}

describe("AfterView", () => {
  it("says that doing nothing is the default and that a mark is private", async () => {
    await view();
    expect(screen.getByText(copy.doNothing.title)).toBeOnTheScreen();
    expect(screen.getByText(copy.private)).toBeOnTheScreen();
  });

  it("shows each person by first name, never the person's own tile", async () => {
    await view();
    for (const member of MEMBERS.filter((entry) => !entry.isYou)) expect(screen.getByText(member.firstName)).toBeOnTheScreen();
    expect(screen.queryByText("Ananya")).toBeNull();
  });

  it("gives the faces no press, so there is nothing to share, save or long-press", async () => {
    await view();
    const tile = screen.getByLabelText("Priya");
    expect(tile.props.onLongPress).toBeUndefined();
    expect(tile.props.onPress).toBeUndefined();
  });

  it("asks before it marks someone, and sends nothing if the person says not now", async () => {
    const onMark = jest.fn();
    await view({ onMark });
    await fireEvent.press(screen.getByTestId("after-mark-m-sana"));
    expect(screen.getByText(copy.confirm.title("Sana"))).toBeOnTheScreen();
    expect(onMark).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("after-cancel"));
    expect(onMark).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.confirm.title("Sana"))).toBeNull();
  });

  it("marks the person that was confirmed", async () => {
    const onMark = jest.fn();
    await view({ onMark });
    await fireEvent.press(screen.getByTestId("after-mark-m-sana"));
    await fireEvent.press(screen.getByTestId("after-confirm"));
    expect(onMark).toHaveBeenCalledWith("m-sana");
  });

  it("shows a marked person as done, with no second button", async () => {
    await view({ state: { status: "ready", data: { ...data, marked: ["m-sana"] } } });
    expect(screen.getByTestId("after-marked-m-sana")).toBeOnTheScreen();
    expect(screen.queryByTestId("after-mark-m-sana")).toBeNull();
    expect(screen.getByTestId("after-mark-m-priya")).toBeOnTheScreen();
  });

  it("opens the report for the person", async () => {
    const onReport = jest.fn();
    await view({ onReport });
    await fireEvent.press(screen.getByTestId("after-report-m-meera"));
    expect(onReport).toHaveBeenCalledWith("m-meera");
  });

  it("says when a mark is waiting for the network and when it did not go through", async () => {
    await view({ mark: { memberRef: "m-sana", status: "queued" } });
    expect(screen.getByText(copy.notComfortable.queued)).toBeOnTheScreen();
    await screen.rerender(
      <AfterView
        state={{ status: "ready", data }}
        offline={false}
        mark={{ memberRef: "m-sana", status: "failed" }}
        onBack={noop}
        onRetry={noop}
        onMark={noop}
        onReport={noop}
        onClosed={noop}
      />,
    );
    expect(screen.getByText(copy.notComfortable.failed)).toBeOnTheScreen();
  });

  it("shows the closed state with a way back", async () => {
    const onClosed = jest.fn();
    await view({ state: { status: "closed" }, onClosed });
    expect(screen.getByText(copy.closed.title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(copy.closed.action));
    expect(onClosed).toHaveBeenCalled();
  });

  it("shows the not-yet state with no faces", async () => {
    await view({ state: { status: "notYet" } });
    expect(screen.getByText(copy.notYet.title)).toBeOnTheScreen();
    expect(screen.queryByText("Priya")).toBeNull();
  });
});
