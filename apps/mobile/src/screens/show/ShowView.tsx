import type { ApiEvent } from "@turnout/contract/events";
import { ArrowSquareOut, CaretLeft, Compass, UsersThree } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { common } from "@/copy/common";
import { show as copy } from "@/copy/show";
import { safeWebUrl } from "@/model/externalLink";
import { areaLabel } from "@/model/showList";
import { formatShowWhen, priceFrom } from "@/model/showTime";
import { BackBar } from "@/ui/BackBar";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { Poster } from "@/ui/Poster";
import { Button } from "@/ui/primitives/Button";
import { IconButton } from "@/ui/primitives/IconButton";
import { dimOnPress } from "@/ui/primitives/press";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Sheet } from "@/ui/primitives/Sheet";
import { Text } from "@/ui/primitives/Text";
import { displayFaceStyle } from "@/ui/textScale";
import { lookingLine } from "./lookingLine";

export type ShowDetailState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  | { status: "ready"; show: ApiEvent };

export interface ShowViewProps {
  detail: ShowDetailState;
  /** People looking for a group, from the plans server (M3). Null while that is not there, and the line is left out. */
  lookingCount: number | null;
  /** Groups are open in this build. Off in M2: the Go button then opens "Coming soon in this build". */
  groupsEnabled: boolean;
  onBack: () => void;
  onRetry: () => void;
  onSeeShows: () => void;
  /** Opens a web address in the browser: the ticket page or the listing. */
  onOpenLink: (url: string) => void;
  /** Starts a group for this show. Only called when groups are enabled. */
  onGo: (publicId: string) => void;
}

const BULBS = Array.from({ length: 28 }, (_, index) => `bulb-${index}`);

/** The date band. A loud moment (one of two), dark in both themes. The bulbs are for looks only and hidden from screen readers. */
function Marquee({ when }: { when: string }) {
  const row = (
    <View className="h-1 flex-row justify-between px-2.5" accessible={false}>
      {BULBS.map((id) => (
        <View key={id} className="size-1 rounded-pill bg-on-photo opacity-80" />
      ))}
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel={when}
      className="h-14 justify-between border-b border-line bg-marquee py-1.5"
      testID="show-marquee"
      importantForAccessibility="yes"
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {row}
      </View>
      <Text variant="display-band" className="text-center uppercase text-on-photo" tabular importantForAccessibility="no">
        {when}
      </Text>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {row}
      </View>
    </View>
  );
}

function Facts({ show }: { show: ApiEvent }) {
  const price = priceFrom(show);
  const area = areaLabel(show.venue.area);
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-3.5 pt-3">
      <View className="min-w-0 flex-1">
        <Text variant="control" className="font-semibold" numberOfLines={2}>
          {show.venue.name ?? area}
        </Text>
        {show.venue.name ? (
          <Text variant="meta" className="text-muted">
            {area}
          </Text>
        ) : null}
      </View>
      {price ? (
        <View className="items-end" accessible accessibilityLabel={price.isRange ? `${copy.from} ${price.amount}` : price.amount}>
          {price.isRange ? (
            <Text variant="label" className="text-muted">
              {copy.from}
            </Text>
          ) : null}
          <Text
            variant="body"
            tabular
            allowFontScaling={false}
            className="font-display font-extrabold"
            style={displayFaceStyle("display-numeral", 28)}
          >
            {price.amount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The ticket stub: venue and price over a dashed tear line, then the buy link, which opens in the browser. */
function TicketStub({ show, onOpenLink }: { show: ApiEvent; onOpenLink: (url: string) => void }) {
  const ticketUrl = safeWebUrl(show.ticket_url);
  const source = show.source.name;
  return (
    <View
      accessible={false}
      accessibilityLabel={copy.ticketLabel}
      className="overflow-hidden rounded-card border border-line bg-surface"
      testID="show-ticket"
    >
      <Facts show={show} />
      {ticketUrl ? (
        <>
          <View accessible={false} className="mx-3.5 border-t border-dashed border-line" />
          <View className="px-3.5 pb-3.5 pt-3">
            <Button
              variant="secondary"
              title={source ? copy.buy(source) : copy.buyFallback}
              accessibilityLabel={source ? copy.buyLabel(source) : copy.buyLabelFallback}
              icon={ArrowSquareOut}
              onPress={() => onOpenLink(ticketUrl)}
              testID="show-buy"
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

function Looking({ count }: { count: number | null }) {
  const line = lookingLine(count);
  if (!line) return null;
  return (
    <View
      accessible
      accessibilityLabel={line.numeral ? `${line.numeral} ${line.text}` : line.text}
      className="mt-3.5 flex-row items-baseline gap-2"
      testID="show-looking"
    >
      {line.numeral ? (
        <Text
          variant="body"
          tabular
          allowFontScaling={false}
          className="font-display font-extrabold"
          style={displayFaceStyle("display-numeral", 32)}
        >
          {line.numeral}
        </Text>
      ) : null}
      <Text variant="control" className="flex-1">
        {line.text}
      </Text>
    </View>
  );
}

function Credit({ show, onOpenLink }: { show: ApiEvent; onOpenLink: (url: string) => void }) {
  const sourceUrl = safeWebUrl(show.source.url);
  if (!show.source.name) return null;
  if (!sourceUrl) {
    return (
      <Text variant="meta" className="mt-1 text-muted" testID="show-credit">
        {copy.credit(show.source.name)}
      </Text>
    );
  }
  return (
    <View className="mt-0.5 flex-row items-center gap-1" testID="show-credit">
      <Text variant="meta" className="text-muted">
        {copy.creditPrefix}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={copy.creditLabel(show.source.name)}
        onPress={() => onOpenLink(sourceUrl)}
        className="min-h-11 justify-center"
        style={dimOnPress}
        testID="show-source"
      >
        <Text variant="meta" className="underline">
          {show.source.name}
        </Text>
      </Pressable>
    </View>
  );
}

function ReadyShow({ show, ...props }: ShowViewProps & { show: ApiEvent }) {
  const insets = useSafeAreaInsets();
  const [comingSoon, setComingSoon] = useState(false);
  const eligible = show.group_eligible;
  const onGo = () => (props.groupsEnabled ? props.onGo(show.id) : setComingSoon(true));
  return (
    <View className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="pb-6">
        <View>
          <Poster variant="hero" title={show.title} category={show.category} imageUrl={show.image_url} className="rounded-none" />
          <View className="absolute left-2" style={{ top: insets.top + 4 }}>
            <IconButton icon={CaretLeft} label={common.back} onPress={props.onBack} onPhoto testID="back" />
          </View>
        </View>
        <Marquee when={formatShowWhen(show.starts_at_local).toUpperCase()} />
        <View className="px-4 pt-3.5">
          <TicketStub show={show} onOpenLink={props.onOpenLink} />
          <Looking count={props.lookingCount} />
          <View className="mt-3.5">
            <Text variant="title" accessibilityRole="header">
              {copy.how.title}
            </Text>
            <Text variant="body" className="mt-1">
              {copy.how.body}
            </Text>
          </View>
          <Credit show={show} onOpenLink={props.onOpenLink} />
        </View>
      </ScrollView>
      <SafeAreaView edges={["bottom"]} className="border-t border-line bg-bg px-4 pt-3">
        <Button
          title={copy.go}
          icon={UsersThree}
          disabled={!eligible}
          onPress={onGo}
          accessibilityHint={eligible ? undefined : copy.goOff.notEligible}
          testID="show-go"
        />
        {eligible ? null : (
          <Text variant="meta" className="mt-2 text-center text-muted" testID="show-go-reason">
            {copy.goOff.notEligible}
          </Text>
        )}
        <View className="h-3" />
      </SafeAreaView>
      <Sheet
        visible={comingSoon}
        title={copy.comingSoon.title}
        lead={copy.comingSoon.lead}
        onClose={() => setComingSoon(false)}
        primary={{ title: copy.comingSoon.close, onPress: () => setComingSoon(false) }}
      />
    </View>
  );
}

/** The show page: poster, date band, ticket stub with the buy link, how it works, the listing credit and the Go button docked below. */
export function ShowView(props: ShowViewProps) {
  const { detail } = props;
  if (detail.status === "ready") {
    return (
      <View className="flex-1 bg-bg" testID="show">
        <ReadyShow {...props} show={detail.show} />
      </View>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="show">
      <BackBar onBack={props.onBack} />
      {detail.status === "loading" ? (
        <View className="gap-3 px-4" accessible accessibilityLabel={copy.loading} accessibilityState={{ busy: true }} testID="show-loading">
          <View className="h-72 rounded-card bg-skeleton" />
          <View className="h-4 w-3/4 rounded-pill bg-skeleton" />
          <View className="h-3 w-1/2 rounded-pill bg-skeleton" />
        </View>
      ) : detail.status === "not_found" ? (
        <EmptyState
          icon={Compass}
          title={copy.notFound.title}
          body={copy.notFound.body}
          action={{ title: copy.notFound.action, onPress: props.onSeeShows }}
        />
      ) : (
        <ErrorState kind={detail.kind} onRetry={props.onRetry} />
      )}
    </SafeAreaView>
  );
}
