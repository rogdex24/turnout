import { ShieldCheck } from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { common } from "@/copy/common";
import { welcome } from "@/copy/welcome";
import { cn } from "@/ui/cn";
import { Button } from "@/ui/primitives/Button";
import { Icon } from "@/ui/primitives/Icon";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";
import { useReduceMotion } from "@/ui/reduceMotion";

const TONES = ["bg-poster-music", "bg-poster-comedy", "bg-poster-theatre"] as const;
const COUNT = welcome.cards.length;

export interface WelcomeViewProps {
  /** Skip, or Get started on the last card. */
  onDone: () => void;
  /** Start on another card (stories and tests). */
  initialIndex?: number;
}

/**
 * Three cards on one layout: a flat photo placeholder with the wordmark, the headline, one line on how it works and the trust line.
 * Swipe or press Next. Each card reads as one element ending in "1 of 3"; Skip, the dots and the button stay put.
 */
export function WelcomeView({ onDone, initialIndex = 0 }: WelcomeViewProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const scroller = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(initialIndex);
  const jumped = useRef(false);
  const last = index === COUNT - 1;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };
  /** Once the cards have a size, open on the one asked for. Only stories and tests start anywhere but the first. */
  const jumpToStart = () => {
    if (jumped.current || initialIndex === 0 || width === 0) return;
    jumped.current = true;
    scroller.current?.scrollTo({ x: initialIndex * width, animated: false });
  };
  const goNext = () => {
    if (last) return onDone();
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: !reduceMotion });
    setIndex(index + 1);
  };

  return (
    <View className="flex-1 bg-bg" testID="welcome" onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        testID="welcome-pager"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSettle}
        onContentSizeChange={jumpToStart}
        className="flex-1"
      >
        {welcome.cards.map((card, i) => (
          <View
            key={card.headline}
            accessible
            accessibilityLabel={`${card.headline.replace("\n", " ")} ${card.body} ${welcome.trust} ${common.stepOf(i + 1, COUNT)}`}
            style={{ width }}
            testID={`welcome-card-${i + 1}`}
          >
            <View className={cn("min-h-28 flex-1 justify-end px-5 pb-5", TONES[i])}>
              {/* The word is fixed at 116 dp, so when the text below takes the card the box keeps a floor and the word shrinks into it. */}
              <Text
                variant="display-hero"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                className="uppercase text-on-photo"
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {welcome.wordmark}
              </Text>
            </View>
            <ScrollView className="grow-0" contentContainerClassName="px-5 pt-6">
              <Text variant="display" accessibilityRole="header">
                {card.headline}
              </Text>
              <Text variant="body" className="mt-3 text-muted">
                {card.body}
              </Text>
              <View className="mt-5 flex-row items-start gap-2.5">
                <Icon icon={ShieldCheck} tone="muted" />
                <Text variant="meta" className="flex-1 text-muted">
                  {welcome.trust}
                </Text>
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
      {last ? null : (
        <View className="absolute right-2" style={{ top: insets.top }}>
          <TextButton onPhoto title={welcome.skip} onPress={onDone} testID="welcome-skip" />
        </View>
      )}
      <SafeAreaView edges={["bottom"]} className="px-4 pt-3">
        <View
          className="mb-3 h-6 flex-row items-center justify-center gap-2"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="welcome-dots"
        >
          {welcome.cards.map((card, i) => (
            <View key={card.headline} className={cn("h-1.5 rounded-pill", i === index ? "w-5 bg-ink" : "w-1.5 bg-outline")} />
          ))}
        </View>
        <Button title={last ? welcome.start : welcome.next} onPress={goNext} testID="welcome-next" />
      </SafeAreaView>
    </View>
  );
}
