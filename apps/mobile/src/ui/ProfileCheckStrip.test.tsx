import { fireEvent, render, screen } from "@testing-library/react-native";
import { HANDLE_REJECT_REASONS } from "@turnout/contract/profile";
import { AccessibilityInfo } from "react-native";
import { profileCheck } from "@/copy/profileCheck";
import { ProfileCheckStrip } from "./ProfileCheckStrip";

describe("ProfileCheckStrip", () => {
  it("says the profile is being checked, with no action", async () => {
    await render(<ProfileCheckStrip state="pending" />);
    expect(screen.getByText(profileCheck.pending)).toBeOnTheScreen();
    expect(screen.queryByText(profileCheck.change)).toBeNull();
    expect(screen.getByTestId("profile-check-strip").props.accessibilityLiveRegion).toBe("polite");
  });

  it.each(HANDLE_REJECT_REASONS)("gives its own sentence for %s and one way to change the handle", async (reason) => {
    const onChange = jest.fn();
    await render(<ProfileCheckStrip state="rejected" reason={reason} onChange={onChange} />);
    expect(screen.getByText(profileCheck.rejected[reason])).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(profileCheck.change));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain sentence when the server gave no reason", async () => {
    await render(<ProfileCheckStrip state="rejected" reason={null} onChange={jest.fn()} />);
    expect(screen.getByText(profileCheck.rejected.unknown)).toBeOnTheScreen();
  });

  it("never reads as a mark against the person", () => {
    const text = [profileCheck.pending, profileCheck.change, ...Object.values(profileCheck.rejected)].join(" ");
    expect(text).not.toMatch(/fake|suspicious|failed|rejected|banned|violat/i);
  });

  describe("announcing", () => {
    const say = () => jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    afterEach(() => jest.restoreAllMocks());

    it("is quiet when it first shows, so opening a screen does not read it out", async () => {
      const spy = say();
      await render(<ProfileCheckStrip state="pending" />);
      expect(spy).not.toHaveBeenCalled();
    });

    it("says a change of state once, and not a repeat of the same one", async () => {
      const spy = say();
      const view = await render(<ProfileCheckStrip state="rejected" reason="not_found" onChange={jest.fn()} />);
      await view.rerender(<ProfileCheckStrip state="pending" />);
      await view.rerender(<ProfileCheckStrip state="pending" />);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(profileCheck.pending);
    });

    it("says a strip that appears because of a change just made", async () => {
      const spy = say();
      await render(<ProfileCheckStrip state="pending" announceOnMount />);
      expect(spy).toHaveBeenCalledWith(profileCheck.pending);
    });
  });
});
