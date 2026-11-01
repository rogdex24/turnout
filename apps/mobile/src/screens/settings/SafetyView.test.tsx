import { fireEvent, render, screen } from "@testing-library/react-native";
import { common } from "@/copy/common";
import { settings } from "@/copy/settings";
import { SafetyView } from "./SafetyView";

describe("SafetyView", () => {
  it("puts Call 112 first and shows every section", async () => {
    await render(<SafetyView onBack={() => undefined} onCall={() => undefined} />);
    expect(screen.getByText(settings.safety.title)).toBeOnTheScreen();
    expect(screen.getByText(common.emergency.text)).toBeOnTheScreen();
    for (const section of settings.safety.sections) expect(screen.getByText(section.heading)).toBeOnTheScreen();
  });

  it("dials from the 112 button", async () => {
    const onCall = jest.fn();
    await render(<SafetyView onBack={() => undefined} onCall={onCall} />);
    await fireEvent.press(screen.getByLabelText(common.emergency.label));
    expect(onCall).toHaveBeenCalledTimes(1);
  });
});
