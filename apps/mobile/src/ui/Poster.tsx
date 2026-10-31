import { displayFaces, gutter, spacing } from "@turnout/design-tokens";
import { Image } from "expo-image";
import { useContext, useState } from "react";
import { type LayoutChangeEvent, useWindowDimensions, View } from "react-native";
import { common } from "@/copy/common";
import { CategoryIcon } from "./CategoryIcon";
import { cn } from "./cn";
import { Text } from "./primitives/Text";
import { fitDisplaySize, scaledMetrics, TextScaleContext, useFontScale } from "./textScale";

/** Poster box heights in dp from the design spec section 3. The box never changes with the image or the text, so the list does not shift as images arrive. */
export const POSTER_HEIGHT = { featured: 180, tile: 196, hero: 336, thumb: 40 } as const;
/** The line under the title stops growing here, so the fixed box keeps room for the title at the largest text size. */
const SUB_LINE_MAX_SCALE = 1.3;
/** The most lines the title may take before the type shrinks. */
const TITLE_LINES = { featured: 3, tile: 3, hero: 4 } as const;

export type PosterVariant = keyof typeof POSTER_HEIGHT;

type Tone = "comedy" | "music" | "theatre";

/** The flat placeholder tone per category. Only three exist in the design, so every other category uses the smoke tone. */
export function posterTone(category: string): Tone {
  return category === "comedy" || category === "theatre" ? category : "music";
}

const TONE_CLASS: Record<Tone, string> = {
  comedy: "bg-poster-comedy",
  music: "bg-poster-music",
  theatre: "bg-poster-theatre",
};

export function categoryLine(category: string): string {
  return category === "comedy" || category === "music" || category === "theatre" ? common.categories[category] : common.categories.other;
}

export interface PosterProps {
  variant: PosterVariant;
  title: string;
  category: string;
  /** The line under the title, in Inter. The category's name by default. */
  subLine?: string;
  /** Null today: the flat placeholder is the designed default. The photo, already a one-hue duotone, fills the box when there is one. */
  imageUrl?: string | null;
  className?: string;
}

/** The poster: a fixed box with a photo or a flat category tone, a bottom scrim and the title in the display face. */
export function Poster({ variant, title, category, subLine, imageUrl = null, className }: PosterProps) {
  const window = useWindowDimensions();
  const fontScale = useFontScale();
  const forcedScale = useContext(TextScaleContext);
  const [measured, setMeasured] = useState<number | null>(null);
  const height = POSTER_HEIGHT[variant];
  const tone = posterTone(category);
  const onLayout = (event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width);

  if (variant === "thumb") {
    return (
      <View
        className={cn("items-center justify-center overflow-hidden rounded-field", TONE_CLASS[tone], className)}
        style={{ width: height, height }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} contentFit="cover" style={{ width: height, height }} accessible={false} />
        ) : (
          <CategoryIcon category={category} size="sm" tone="onPhoto" />
        )}
      </View>
    );
  }

  const width = (measured ?? window.width - 2 * gutter.page) - 2 * gutter.page; // the box less the title's own side padding
  // The title sits above the category line, which grows with the text size, inside the scrim's padding (pt-3, mt-1, pb-4).
  const titleHeight =
    height - spacing[3] - spacing[1] - spacing[4] - scaledMetrics("meta", Math.min(fontScale, SUB_LINE_MAX_SCALE)).lineHeight;
  const size = fitDisplaySize(title, width, "display-poster", TITLE_LINES[variant], titleHeight);
  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${subLine ?? categoryLine(category)}`}
      onLayout={onLayout}
      className={cn(
        "justify-end overflow-hidden",
        TONE_CLASS[tone],
        variant === "featured" ? "rounded-featured" : "rounded-card",
        className,
      )}
      style={{ height }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          accessible={false}
        />
      ) : null}
      <View className="bg-scrim px-4 pb-4 pt-3" accessible={false}>
        <Text
          variant="body"
          allowFontScaling={false}
          numberOfLines={TITLE_LINES[variant]}
          className="font-display font-extrabold uppercase text-on-photo"
          style={{ fontSize: size, lineHeight: size * displayFaces["display-poster"].lineHeightRatio }}
        >
          {title}
        </Text>
        {/* A story or test that forces a text size sets it by context, which the prop below does not reach. */}
        <TextScaleContext value={forcedScale === null ? null : Math.min(forcedScale, SUB_LINE_MAX_SCALE)}>
          <Text variant="meta" maxFontSizeMultiplier={SUB_LINE_MAX_SCALE} className="mt-1 font-medium text-on-photo" numberOfLines={1}>
            {subLine ?? categoryLine(category)}
          </Text>
        </TextScaleContext>
      </View>
    </View>
  );
}
