import type { Cafe, GroupMember } from "@turnout/contract/app/groups";
import {
  ArrowSquareOut,
  CalendarX,
  CaretLeft,
  Check,
  HandWaving,
  Hourglass,
  NavigationArrow,
  Shield,
  UsersThree,
} from "phosphor-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { common } from "@/copy/common";
import { meet as copy } from "@/copy/meet";
import { countdownText, hereButton, hereCount, istClock, type LocationLine, venueWalkMinutes } from "@/model/meetCard";
import { checkInOpen } from "@/model/meetWindow";
import { toPoint } from "@/model/walk";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { OfflineBar } from "@/ui/OfflineBar";
import { PersonAvatar } from "@/ui/PersonAvatar";
import { Button } from "@/ui/primitives/Button";
import { Icon } from "@/ui/primitives/Icon";
import { IconButton } from "@/ui/primitives/IconButton";
import { Note } from "@/ui/primitives/Note";
import { dimOnPress } from "@/ui/primitives/press";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";
import { MeetMap } from "./MeetMap";
import { SafetySheet } from "./SafetySheet";
import { StaticMap } from "./StaticMap";

export interface MeetCardData {
  showTitle: string;
  startsAt: string;
  meetAt: string;
  cafe: Cafe;
  /** The venue's name and pin, from the show. Null parts when the show has none. */
  venue: { name: string | null; lat: number | null; lng: number | null };
  members: GroupMember[];
  belowPlan: boolean;
}

export type MeetViewState =
  | { status: "loading" }
  /** Before T-3h: the card is not open yet. */
  | { status: "waiting"; revealAt: string }
  /** More than a day after the show, or the group is gone. */
  | { status: "closed" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  | { status: "ready"; card: MeetCardData };

/** Where the person's own check-in stands: not made, being sent, saved for when the phone is back online, or refused. */
export type HereStatus = "idle" | "sending" | "queued" | "failed";

export interface MeetViewProps {
  state: MeetViewState;
  now: number;
  offline: boolean;
  here: HereStatus;
  /** The line under "Open in Maps", worked out on the phone from a position that never leaves it. */
  line: LocationLine;
  /** The build has a map to draw. Without one the card shows the static map. */
  realMap: boolean;
  onBack: () => void;
  onRetry: () => void;
  /** Opens the show page. Null while the show is not known. */
  onOpenShow: (() => void) | null;
  onOpenMaps: () => void;
  onAskLocation: () => void;
  onOpenSettings: () => void;
  onHere: () => void;
  onCall: () => void;
  /** Opens the way to leave the plan. Null while the plan is not known. */
  onLeave: (() => void) | null;
  /** From the closed card back to the plans. */
  onClosed: () => void;
}

function BigTime({ meetAt, now }: { meetAt: string; now: number }) {
  const clock = istClock(meetAt);
  if (!clock) return null;
  const countdown = countdownText(meetAt, now);
  return (
    <View
      accessible
      accessibilityLabel={copy.timeLabel(clock.text, countdown)}
      className="mt-2.5 flex-row items-end gap-3"
      testID="meet-time"
    >
      <Text variant="display-hero" tabular importantForAccessibility="no">
        {clock.digits}
      </Text>
      <View className="items-start gap-2 pb-1" importantForAccessibility="no-hide-descendants">
        <Text variant="display-band" className="uppercase">
          {clock.period}
        </Text>
        {countdown ? (
          <View className="min-h-7 flex-row items-center gap-1.5 rounded-pill bg-signal-soft px-2.5">
            <View className="size-2 rounded-pill bg-signal" />
            <Text variant="meta" tabular className="font-semibold text-signal">
              {countdown}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LocationRow({
  line,
  cafeName,
  onAsk,
  onSettings,
}: {
  line: LocationLine;
  cafeName: string;
  onAsk: () => void;
  onSettings: () => void;
}) {
  if (line.kind === "hidden") return null;
  let text: string;
  let action: { title: string; label: string; onPress: () => void } | null = null;
  if (line.kind === "ask" && line.canAsk) {
    text = copy.location.ask;
    action = { title: copy.location.turnOn, label: copy.location.turnOnLabel, onPress: onAsk };
  } else if (line.kind === "ask") {
    text = copy.location.settingsLead;
    action = { title: copy.location.settings, label: copy.location.settingsLabel, onPress: onSettings };
  } else if (line.kind === "finding") {
    text = copy.location.finding;
  } else if (line.kind === "at_cafe") {
    text = copy.location.atCafe;
  } else {
    text = copy.location.walk(line.minutes, cafeName);
  }
  return (
    <View className="mt-3 flex-row items-center gap-3" testID="meet-location">
      <Icon icon={NavigationArrow} tone="muted" />
      <Text variant="control" tabular className="flex-1 font-normal">
        {text}
      </Text>
      {action ? (
        <TextButton link title={action.title} accessibilityLabel={action.label} onPress={action.onPress} testID="meet-location-action" />
      ) : null}
    </View>
  );
}

function Member({ member }: { member: GroupMember }) {
  const name = member.isYou ? copy.group.you : member.firstName;
  return (
    <View
      accessible
      accessibilityLabel={member.checkedIn ? copy.group.hereLabel(name) : name}
      className="w-[62px] items-center"
      testID={`meet-member-${member.memberRef}`}
    >
      <View importantForAccessibility="no-hide-descendants">
        <PersonAvatar name={member.firstName} photoUrl={member.photoUrl} ring={member.checkedIn} />
      </View>
      <Text variant="meta" className="mt-1.5 font-semibold" numberOfLines={1} importantForAccessibility="no">
        {name}
      </Text>
    </View>
  );
}

function Group({ members, belowPlan }: { members: GroupMember[]; belowPlan: boolean }) {
  const count = hereCount(members);
  return (
    <View className="mt-5" testID="meet-group">
      <View className="flex-row items-center justify-between">
        <Text variant="title-large" accessibilityRole="header">
          {copy.group.title}
        </Text>
        {count ? (
          <Text variant="meta" tabular className="text-signal" testID="meet-here-count">
            {copy.group.here(count.here, count.of)}
          </Text>
        ) : null}
      </View>
      <View className="mt-3 flex-row flex-wrap gap-x-3 gap-y-4">
        {members.map((member) => (
          <Member key={member.memberRef} member={member} />
        ))}
      </View>
      {belowPlan ? (
        <Note icon={UsersThree} className="mt-4">
          {copy.group.smaller}
        </Note>
      ) : null}
    </View>
  );
}

function hereHint(here: HereStatus, button: ReturnType<typeof hereButton>, done: boolean): string | null {
  if (here === "queued") return copy.here.queued;
  if (here === "failed") return copy.here.failed;
  if (done) return null;
  if (button.state === "early") return copy.here.early(button.opensAt);
  if (button.state === "closed") return copy.here.closed;
  return null;
}

function Ready({ card, ...props }: MeetViewProps & { card: MeetCardData }) {
  const { cafe, venue } = card;
  const cafePoint = toPoint(cafe.lat, cafe.lng);
  const venuePoint = toPoint(venue.lat, venue.lng);
  const walk = venueWalkMinutes(cafePoint, venuePoint);
  const showRow = copy.showRow(card.showTitle, istClock(card.startsAt)?.text ?? null);
  const mapLabel = copy.map.label(cafe.name, venuePoint ? venue.name : null);
  const done = card.members.some((member) => member.isYou && member.checkedIn);
  const button = hereButton(card.startsAt, props.now, checkInOpen(card.startsAt, props.now));
  const hint = hereHint(props.here, button, done);
  return (
    <>
      <ScrollView contentContainerClassName="px-4 pb-6 pt-1" testID="meet-scroll">
        {props.onOpenShow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showRow}
            onPress={props.onOpenShow}
            className="min-h-11 justify-center"
            style={dimOnPress}
            testID="meet-show"
          >
            <Text variant="meta" tabular className="text-muted" numberOfLines={1} importantForAccessibility="no">
              {showRow}
            </Text>
          </Pressable>
        ) : (
          <View className="min-h-11 justify-center" testID="meet-show">
            <Text variant="meta" tabular className="text-muted" numberOfLines={1}>
              {showRow}
            </Text>
          </View>
        )}
        <BigTime meetAt={card.meetAt} now={props.now} />
        <View className="mt-5" testID="meet-place">
          <Text variant="title-large" accessibilityRole="header">
            {cafe.name}
          </Text>
          {cafe.address ? <Text variant="body">{cafe.address}</Text> : null}
          {walk !== null && venue.name ? (
            <Text variant="meta" tabular className="mt-0.5 text-muted">
              {copy.cafe.walkToVenue(walk, venue.name)}
            </Text>
          ) : null}
          {cafe.isFallback ? (
            <Text variant="meta" className="mt-0.5 text-muted">
              {copy.cafe.fallbackNote}
            </Text>
          ) : null}
          {cafePoint ? (
            <>
              <View className="mt-3 overflow-hidden rounded-card border border-line">
                {props.realMap ? (
                  <MeetMap
                    cafe={{ name: cafe.name, point: cafePoint }}
                    venue={venuePoint ? { name: venue.name, point: venuePoint } : null}
                    label={mapLabel}
                  />
                ) : (
                  <StaticMap cafeName={cafe.name} venueName={venue.name} hasVenuePin={venuePoint !== null} label={mapLabel} />
                )}
              </View>
              <Button
                variant="secondary"
                className="mt-3"
                title={copy.map.open}
                accessibilityLabel={copy.map.openLabel}
                icon={ArrowSquareOut}
                onPress={props.onOpenMaps}
                testID="meet-open-maps"
              />
              <LocationRow line={props.line} cafeName={cafe.name} onAsk={props.onAskLocation} onSettings={props.onOpenSettings} />
            </>
          ) : null}
        </View>
        <Group members={card.members} belowPlan={card.belowPlan} />
      </ScrollView>
      <SafeAreaView edges={["bottom"]} className="border-t border-line bg-bg px-4 pt-3">
        {hint ? (
          <Text variant="meta" tabular className="mb-2.5 text-center text-muted" testID="meet-here-hint">
            {hint}
          </Text>
        ) : null}
        <Button
          title={done ? copy.here.done : copy.here.button}
          icon={done ? Check : HandWaving}
          disabled={done || button.state !== "open"}
          loading={props.here === "sending"}
          accessibilityHint={hint ?? undefined}
          onPress={props.onHere}
          testID="meet-here"
        />
        <View className="h-3" />
      </SafeAreaView>
    </>
  );
}

function Header({ onBack, onSafety }: { onBack: () => void; onSafety: (() => void) | null }) {
  return (
    <View className="h-14 flex-row items-center justify-between px-2">
      <IconButton icon={CaretLeft} label={common.back} onPress={onBack} testID="back" />
      <View className="absolute inset-x-0 items-center" pointerEvents="none">
        <Text variant="control" className="font-semibold" accessibilityRole="header">
          {copy.title}
        </Text>
      </View>
      {onSafety ? <TextButton title={copy.safety} icon={Shield} onPress={onSafety} testID="meet-safety" /> : null}
    </View>
  );
}

function Loading() {
  return (
    <View className="gap-3 px-4" accessible accessibilityLabel={copy.loading} accessibilityState={{ busy: true }} testID="meet-loading">
      <View className="h-6 w-1/2 rounded-pill bg-skeleton" />
      <View className="h-28 w-2/3 rounded-card bg-skeleton" />
      <View className="h-6 w-3/4 rounded-pill bg-skeleton" />
      <View className="h-24 rounded-card bg-skeleton" />
    </View>
  );
}

/** The meet card (B11.1): the meet time in the big face, the cafe and its map, who is in the group, and the docked "I'm here". */
export function MeetView(props: MeetViewProps) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const { state } = props;
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="meet">
      <Header onBack={props.onBack} onSafety={state.status === "ready" ? () => setSafetyOpen(true) : null} />
      {props.offline ? <OfflineBar /> : null}
      {state.status === "loading" ? <Loading /> : null}
      {state.status === "waiting" ? (
        <EmptyState icon={Hourglass} title={copy.waiting.title} body={copy.waiting.body(istClock(state.revealAt)?.text ?? "")} />
      ) : null}
      {state.status === "closed" ? (
        <EmptyState
          icon={CalendarX}
          title={copy.closed.title}
          body={copy.closed.body}
          action={{ title: copy.closed.action, onPress: props.onClosed }}
        />
      ) : null}
      {state.status === "error" ? <ErrorState kind={state.kind} onRetry={props.onRetry} /> : null}
      {state.status === "ready" ? <Ready {...props} card={state.card} /> : null}
      <SafetySheet
        visible={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        onCall={props.onCall}
        onLeave={
          props.onLeave
            ? () => {
                setSafetyOpen(false);
                props.onLeave?.();
              }
            : null
        }
      />
    </SafeAreaView>
  );
}
