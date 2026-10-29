import type { ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { AutoFocusContext } from "../autoFocus";
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
 * design-system story and every screen state story uses it, so each one is checked at both extremes. `framed` gives the content a
 * full window height, for screens that fill the phone.
 */
export function Matrix({ children, padded = false, framed = false }: { children: ReactNode; padded?: boolean; framed?: boolean }) {
  const { height } = useWindowDimensions();
  return (
    <AutoFocusContext.Provider value={false}>
      <ScrollView contentContainerClassName="gap-4">
        {CELLS.map((cell) => (
          <ScopedTheme key={cell.name} theme={cell.theme}>
            <TextScaleContext.Provider value={cell.scale === 1 ? null : cell.scale}>
              <View className="bg-bg py-4" testID={`matrix-${cell.theme}-${cell.scale}`}>
                <Text variant="label" className="mb-2 px-4 text-muted">
                  {cell.name}
                </Text>
                <View className={padded ? "px-4" : undefined} style={framed ? { height } : undefined}>
                  {children}
                </View>
              </View>
            </TextScaleContext.Provider>
          </ScopedTheme>
        ))}
      </ScrollView>
    </AutoFocusContext.Provider>
  );
}
