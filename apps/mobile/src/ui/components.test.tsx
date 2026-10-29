import { fireEvent, render, screen } from "@testing-library/react-native";
import { CalendarCheck } from "phosphor-react-native";
import { StyleSheet } from "react-native";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { OfflineBar } from "./OfflineBar";
import { PersonAvatar } from "./PersonAvatar";
import { POSTER_HEIGHT, Poster, posterTone } from "./Poster";
import { SkeletonRow } from "./SkeletonRow";
import { StatusStep } from "./StatusStep";
import { TimeText } from "./TimeText";

describe("Poster", () => {
  it("keeps one fixed height per variant, with or without an image", async () => {
    for (const variant of ["featured", "tile", "hero"] as const) {
      const { unmount } = await render(<Poster variant={variant} title="Traffic Jam Tales" category="comedy" />);
      expect(StyleSheet.flatten(screen.getByLabelText(/Traffic Jam Tales/).props.style)).toMatchObject({ height: POSTER_HEIGHT[variant] });
      await unmount();
      const withImage = await render(
        <Poster variant={variant} title="Traffic Jam Tales" category="comedy" imageUrl="https://example.com/p.jpg" />,
      );
      expect(StyleSheet.flatten(screen.getByLabelText(/Traffic Jam Tales/).props.style)).toMatchObject({ height: POSTER_HEIGHT[variant] });
      await withImage.unmount();
    }
    expect(POSTER_HEIGHT).toEqual({ featured: 180, tile: 196, hero: 336, thumb: 40 });
  });

  it("has a tone for the three designed categories and the smoke tone for the rest", () => {
    expect(posterTone("comedy")).toBe("comedy");
    expect(posterTone("theatre")).toBe("theatre");
    expect(posterTone("music")).toBe("music");
    expect(posterTone("workshop")).toBe("music");
    expect(posterTone("unheard-of")).toBe("music");
  });

  it("uses the tone class and names the category in text", async () => {
    await render(<Poster variant="tile" title="Swami" category="theatre" />);
    expect(screen.getByLabelText("Swami, Theatre").props.className).toContain("bg-poster-theatre");
    expect(screen.getByText("Theatre")).toBeTruthy();
  });

  it("sets the title in uppercase display type that does not follow the system size", async () => {
    await render(<Poster variant="tile" title="Swami" category="theatre" />);
    const title = screen.getByText("Swami");
    expect(title.props.className).toContain("uppercase");
    expect(title.props.className).toContain("font-display");
    expect(title.props.allowFontScaling).toBe(false);
  });

  it("shrinks a long title but keeps the box", async () => {
    const long = "An Evening of Stand Up Comedy and Improvised Songs With Friends";
    await render(<Poster variant="featured" title={long} category="comedy" />);
    await fireEvent(screen.getByLabelText(new RegExp(long.slice(0, 20))), "layout", {
      nativeEvent: { layout: { width: 320, height: 180 } },
    });
    const size = StyleSheet.flatten(screen.getByText(long).props.style).fontSize as number;
    expect(size).toBeLessThan(70);
    expect(size).toBeGreaterThanOrEqual(30);
  });

  it("has no category pill and no count", async () => {
    await render(<Poster variant="tile" title="Swami" category="theatre" />);
    expect(screen.queryByText(/looking|going|people/i)).toBeNull();
  });
});

describe("PersonAvatar", () => {
  it("shows an initial when there is no photo and the signal ring when asked", async () => {
    await render(<PersonAvatar name="asha" ring />);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByLabelText("asha").props.className).toContain("border-signal");
  });

  it("keeps a photo in the memory cache only, under one key, when asked", async () => {
    await render(<PersonAvatar name="asha" photoUrl="https://photos.example/a.jpg?sig=1" memoryCacheKey="g1:m1" />);
    const tile = screen.toJSON() as { children: { props: Record<string, unknown> }[] };
    const image = tile.children[0]?.props;
    expect(image?.cachePolicy).toBe("memory");
    expect(image?.source).toEqual([{ uri: "https://photos.example/a.jpg?sig=1", cacheKey: "g1:m1" }]);
  });
});

describe("StatusStep", () => {
  it("uses signal only for live states", async () => {
    await render(
      <>
        <StatusStep tone="live">Finding your group</StatusStep>
        <StatusStep tone="done">Ticket added</StatusStep>
        <StatusStep tone="waiting">Waiting</StatusStep>
      </>,
    );
    expect(screen.getByText("Finding your group").props.className).toContain("text-signal");
    expect(screen.getByText("Ticket added").props.className).not.toContain("text-signal");
    expect(screen.getByText("Waiting").props.className).toContain("text-muted");
  });
});

describe("EmptyState and ErrorState", () => {
  it("shows an action only when given one", async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<EmptyState icon={CalendarCheck} title="No plans yet" />);
    expect(screen.queryByRole("button")).toBeNull();
    await rerender(<EmptyState icon={CalendarCheck} title="No plans yet" action={{ title: "Browse shows", onPress }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Browse shows" }));
    expect(onPress).toHaveBeenCalled();
  });

  it("offers a retry and reads as an alert", async () => {
    const onRetry = jest.fn();
    await render(<ErrorState kind="offline" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("is not red", async () => {
    await render(<ErrorState kind="server" onRetry={() => undefined} />);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/danger|red-/);
  });
});

describe("OfflineBar and SkeletonRow", () => {
  it("says offline in words", async () => {
    await render(<OfflineBar />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it("announces loading", async () => {
    await render(<SkeletonRow />);
    expect(screen.getByLabelText("Loading").props.accessibilityState).toMatchObject({ busy: true });
  });
});

describe("TimeText", () => {
  it("shows the show time in tabular figures", async () => {
    await render(<TimeText value="2026-11-07T19:00:00+05:30" />);
    expect(StyleSheet.flatten(screen.getByText("Sat 7 Nov, 7:00 PM").props.style)).toMatchObject({ fontVariant: ["tabular-nums"] });
  });

  it("renders nothing for the clock of a date-only show", async () => {
    await render(<TimeText value="2026-11-07" part="time" />);
    expect(screen.toJSON()).toBeNull();
  });
});
