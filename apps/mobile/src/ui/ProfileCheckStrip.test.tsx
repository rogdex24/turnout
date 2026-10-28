import { fireEvent, render, screen } from "@testing-library/react-native";
import { HANDLE_REJECT_REASONS } from "@turnout/contract/profile";
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
});
