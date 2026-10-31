import { FlashList } from "@shopify/flash-list";
import { sizes, spacing } from "@turnout/design-tokens";
import { CalendarBlank, MapPin } from "phosphor-react-native";
import { ActivityIndicator, View } from "react-native";
import { home } from "@/copy/home";
import type { ListItem } from "@/model/showList";
import { formatShowDay } from "@/model/showTime";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { OfflineBar } from "@/ui/OfflineBar";
import { ProfileCheckStrip, type ProfileCheckStripProps } from "@/ui/ProfileCheckStrip";
import { Icon } from "@/ui/primitives/Icon";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";
import { SkeletonRow } from "@/ui/SkeletonRow";
import { AreaPills, type AreaPillsProps } from "./AreaPills";
import { PlanBar, type PlanBarProps } from "./PlanBar";
import { FeaturedCard, ShowTile } from "./ShowCard";

export type HomeList =
  | { status: "loading" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  | { status: "ready"; items: ListItem[] };

export interface HomeViewProps {
  list: HomeList;
  areas: AreaPillsProps["areas"];
  selectedArea: string | null;
  onSelectArea: (slug: string | null) => void;
  /** The handle check strip, or null when the handle is approved or not yet added. */
  strip: ProfileCheckStripProps | null;
  /** The active plan, or null for none. */
  plan: PlanBarProps | null;
  /** The phone has no connection: the list shown is the one saved on the phone. */
  offline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  /** The next page: idle, being fetched, or failed. */
  more: "idle" | "loading" | "failed";
  onRetryMore: () => void;
  onRetry: () => void;
  onOpenShow: (publicId: string) => void;
}

function dayTitle(item: Extract<ListItem, { kind: "day" }>): string {
  return item.relative === "today" ? home.days.today : item.relative === "tomorrow" ? home.days.tomorrow : formatShowDay(item.date);
}

function dayMeta(item: Extract<ListItem, { kind: "day" }>): string {
  const count = home.days.shows(item.count);
  return item.relative === null ? count : `${formatShowDay(item.date)}, ${count}`;
}

/** The Shows tab: wordmark, area pills, the handle strip, the list by day, and the active plan docked under it. */
export function HomeView(props: HomeViewProps) {
  const { list, areas, selectedArea, strip, plan } = props;

  const header = (
    <View>
      <View className="flex-row items-center justify-between px-4" style={{ minHeight: sizes.hitMin + spacing[2] }}>
        <Text variant="display" className="font-display font-black uppercase" accessibilityRole="header">
          {home.wordmark}
        </Text>
        <View className="shrink flex-row items-center gap-1.5" accessible accessibilityLabel={home.city}>
          <Icon icon={MapPin} size="sm" tone="muted" weight="fill" />
          <Text variant="control">{home.city}</Text>
        </View>
      </View>
      <Text variant="display" className="px-4 pt-2" accessibilityRole="header">
        {home.title}
      </Text>
      <View className="pt-3">
        <AreaPills areas={areas} selected={selectedArea} onSelect={props.onSelectArea} />
      </View>
      {strip ? (
        <View className="px-4 pt-3">
          <ProfileCheckStrip {...strip} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]} testID="home">
      {props.offline ? <OfflineBar /> : null}
      {list.status === "ready" ? (
        <FlashList<ListItem>
          data={list.items}
          contentInsetAdjustmentBehavior="automatic"
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          ListHeaderComponent={header}
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
          onEndReached={props.onEndReached}
          onEndReachedThreshold={0.6}
          renderItem={({ item }) => {
            if (item.kind === "day") {
              return (
                // At the largest text sizes the title and the date do not fit on one line, so the date wraps under the title.
                <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 px-4 pb-3 pt-5" testID="home-day">
                  <Text variant="title-large" accessibilityRole="header">
                    {dayTitle(item)}
                  </Text>
                  <Text variant="meta" tabular className="text-muted">
                    {dayMeta(item)}
                  </Text>
                </View>
              );
            }
            if (item.kind === "featured") return <FeaturedCard show={item.show} onPress={props.onOpenShow} />;
            const [first, second] = item.shows;
            return (
              <View className="flex-row gap-3 px-4 pb-4">
                <ShowTile show={first} onPress={props.onOpenShow} />
                {second ? <ShowTile show={second} onPress={props.onOpenShow} /> : <View className="flex-1" />}
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={CalendarBlank}
              title={home.empty.title}
              body={selectedArea === null ? home.empty.body : home.empty.areaBody}
              action={selectedArea === null ? undefined : { title: home.empty.allAreas, onPress: () => props.onSelectArea(null) }}
            />
          }
          ListFooterComponent={
            props.more === "loading" ? (
              <View className="items-center py-4" accessible accessibilityLabel={home.more.loading}>
                <ActivityIndicator />
              </View>
            ) : props.more === "failed" ? (
              <View className="items-center pb-4">
                <Text variant="meta" className="text-muted">
                  {home.more.failed}
                </Text>
                <TextButton title={home.more.retry} onPress={props.onRetryMore} />
              </View>
            ) : null
          }
        />
      ) : (
        <View className="flex-1">
          {header}
          {list.status === "loading" ? (
            <View testID="home-loading">
              <SkeletonRow card />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <ErrorState kind={list.kind} onRetry={props.onRetry} />
          )}
        </View>
      )}
      {plan ? <PlanBar {...plan} /> : null}
    </SafeAreaView>
  );
}
