import type { ApiEvent } from "@turnout/contract/events";
import { Pressable, View } from "react-native";
import { home } from "@/copy/home";
import { areaLabel } from "@/model/showList";
import { formatShowShort, formatShowWhen, priceFrom } from "@/model/showTime";
import { categoryLine, Poster } from "@/ui/Poster";
import { dimOnPress } from "@/ui/primitives/press";
import { Text } from "@/ui/primitives/Text";

export interface ShowCardProps {
  show: ApiEvent;
  onPress: (publicId: string) => void;
}

/** The place line: the venue and the area, or the area alone when the source gave no venue name. */
function placeText(show: ApiEvent): string {
  const area = areaLabel(show.venue.area);
  return show.venue.name ? `${show.venue.name}, ${area}` : area;
}

function priceText(show: ApiEvent): string | null {
  const price = priceFrom(show);
  if (!price) return null;
  return price.isRange ? `${home.from} ${price.amount}` : price.amount;
}

function cardLabel(show: ApiEvent): string {
  return home.cardLabel({
    title: show.title,
    category: categoryLine(show.category),
    when: formatShowWhen(show.starts_at_local),
    place: placeText(show),
    price: priceText(show),
  });
}

/** The soonest show as a ticket: poster, a dashed tear line, then a stub with the time, the place and the price. No count of people. */
export function FeaturedCard({ show, onPress }: ShowCardProps) {
  const price = priceFrom(show);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(show)}
      onPress={() => onPress(show.id)}
      testID={`show-card-${show.id}`}
      className="mx-4 overflow-hidden rounded-featured border border-line bg-surface"
      style={dimOnPress}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Poster variant="featured" title={show.title} category={show.category} imageUrl={show.image_url} className="rounded-b-none" />
      </View>
      <View accessible={false} className="border-t border-dashed border-line" />
      <View accessible={false} className="flex-row items-center justify-between gap-3 px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text variant="control" tabular>
            {formatShowShort(show.starts_at_local)}
          </Text>
          <Text variant="meta" className="text-muted" numberOfLines={2}>
            {placeText(show)}
          </Text>
        </View>
        {price ? (
          <View className="items-end">
            {price.isRange ? (
              <Text variant="label" className="text-muted">
                {home.from}
              </Text>
            ) : null}
            <Text variant="title" tabular>
              {price.amount}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A show as a poster tile with its time, place and price under it. Two sit side by side. */
export function ShowTile({ show, onPress }: ShowCardProps) {
  const price = priceText(show);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(show)}
      onPress={() => onPress(show.id)}
      testID={`show-card-${show.id}`}
      className="flex-1"
      style={dimOnPress}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Poster variant="tile" title={show.title} category={show.category} imageUrl={show.image_url} />
      </View>
      <View accessible={false} className="mt-2">
        <Text variant="control" tabular className="font-semibold">
          {formatShowShort(show.starts_at_local)}
        </Text>
        <Text variant="meta" className="text-muted" numberOfLines={2}>
          {placeText(show)}
        </Text>
        {price ? (
          <Text variant="meta" tabular className="text-muted">
            {price}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
