import { Image } from "expo-image";
import { View } from "react-native";
import { cn } from "./cn";
import { Text } from "./primitives/Text";

/** The face tile 62 by 76, the profile photo 96, the small tile 40, and the round 28 used in a pile. Sizes are from the design spec. */
const BOX = {
  face: { width: 62, height: 76 },
  lg: { width: 96, height: 96 },
  sm: { width: 40, height: 40 },
  xs: { width: 28, height: 28 },
} as const;
const SHAPE = { face: "rounded-face", lg: "rounded-face", sm: "rounded-field", xs: "rounded-pill" } as const;

export interface PersonAvatarProps {
  /** First name only: group surfaces never show a surname or a handle. */
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof BOX;
  /** The signal ring: this person just checked in. */
  ring?: boolean;
  /**
   * Keep the photo in the image memory cache only, never on disk, under this key. The key stays the same when the signed link
   * changes, so the photo is not fetched again each time the link is renewed.
   */
  memoryCacheKey?: string;
}

/** A person's photo tile, or their initial on a raised surface when there is no photo. */
export function PersonAvatar({ name, photoUrl = null, size = "face", ring = false, memoryCacheKey }: PersonAvatarProps) {
  return (
    <View
      accessible
      accessibilityLabel={name}
      className={cn(
        "items-center justify-center overflow-hidden border bg-surface-raised",
        SHAPE[size],
        ring ? "border-signal" : "border-line",
      )}
      style={BOX[size]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl, cacheKey: memoryCacheKey }}
          cachePolicy={memoryCacheKey ? "memory" : undefined}
          contentFit="cover"
          style={BOX[size]}
          accessible={false}
        />
      ) : (
        <Text variant="title" className="text-muted" allowFontScaling={false}>
          {name.trim().charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
