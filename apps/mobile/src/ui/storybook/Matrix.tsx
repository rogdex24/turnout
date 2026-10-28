import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { Text } from "../primitives/Text";
import { LARGEST_TEXT_SCALE, TextScaleContext } from "../textScale";

const CELLS = [
  { theme: "light", scale: 1, name: "Light, default text" },
  { theme: "light", scale: LARGEST_TEXT_SCALE, name: "Light, largest text" },
  { theme: "dark", scale: 1, name: "Dark, default text" },
  { theme: "dark", scale: LARGEST_TEXT_SCALE, name: "Dark, largest text" },
] as const;

/**
 * Story helper: shows the same content in light and dark, at the default and the largest text size, one under the other. Every
 * design-system story and every screen state story uses it, so each one is checked at both extremes.
 */
export function Matrix({ children, padded = false }: { children: ReactNode; padded?: boolean }) {
  return (
    <ScrollView contentContainerClassName="gap-4">
      {CELLS.map((cell) => (
        <ScopedTheme key={cell.name} theme={cell.theme}>
          <TextScaleContext.Provider value={cell.scale === 1 ? null : cell.scale}>
            <View className="bg-bg py-4" testID={`matrix-${cell.theme}-${cell.scale}`}>
              <Text variant="label" className="mb-2 px-4 text-muted">
                {cell.name}
              </Text>
              <View className={padded ? "px-4" : undefined}>{children}</View>
            </View>
          </TextScaleContext.Provider>
        </ScopedTheme>
      ))}
    </ScrollView>
  );
}
