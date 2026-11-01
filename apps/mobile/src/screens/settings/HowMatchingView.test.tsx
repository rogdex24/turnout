import { render, screen } from "@testing-library/react-native";
import { HOW_MATCHING_SECTIONS, HOW_MATCHING_TITLE } from "@/content/howMatchingWorks";
import { HowMatchingView } from "./HowMatchingView";

describe("HowMatchingView", () => {
  it("shows every section of the page", async () => {
    await render(<HowMatchingView onBack={() => undefined} />);
    expect(screen.getByText(HOW_MATCHING_TITLE)).toBeOnTheScreen();
    for (const section of HOW_MATCHING_SECTIONS) expect(screen.getByText(section.heading)).toBeOnTheScreen();
  });
});
