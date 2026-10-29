import type { GroupMember } from "@turnout/contract/app/groups";
import { CalendarX, CaretLeft, Check, Flag, Hourglass, LockSimple } from "phosphor-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { after as copy } from "@/copy/after";
import { common } from "@/copy/common";
import { istWhen } from "@/model/planTime";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { OfflineBar } from "@/ui/OfflineBar";
import { PersonAvatar } from "@/ui/PersonAvatar";
import { Button } from "@/ui/primitives/Button";
import { Icon } from "@/ui/primitives/Icon";
import { IconButton } from "@/ui/primitives/IconButton";
import { Note } from "@/ui/primitives/Note";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Sheet } from "@/ui/primitives/Sheet";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";

export interface AfterData {
  groupId: string;
  showTitle: string;
  /** When the 72 hour window ends. Null when the server did not say. */
  feedbackOpenUntil: string | null;
  /** The other people in the group. The person is not in this list: nobody marks or reports themselves. */
  members: GroupMember[];
  /** The refs the person has already marked. */
  marked: string[];
}

export type AfterViewState =
  | { status: "loading" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  /** The group is not done yet, so there is nothing to look back on. */
  | { status: "notYet" }
  /** More than 72 hours after, or the group is gone. */
  | { status: "closed" }
  | { status: "ready"; data: AfterData };

/** Where the mark being made stands: being sent, saved for when the phone is back online, or refused. */
export type MarkStatus = { memberRef: string; status: "sending" | "queued" | "failed" } | null;

export interface AfterViewProps {
  state: AfterViewState;
  offline: boolean;
  mark: MarkStatus;
  onBack: () => void;
  onRetry: () => void;
  onMark: (memberRef: string) => void;
  onReport: (memberRef: string) => void;
  onClosed: () => void;
}

function markHint(mark: MarkStatus, memberRef: string): string | null {
  if (mark === null || mark.memberRef !== memberRef) return null;
  if (mark.status === "queued") return copy.notComfortable.queued;
  if (mark.status === "failed") return copy.notComfortable.failed;
  return null;
}

function Member({
  groupId,
  member,
  marked,
  mark,
  onAsk,
  onReport,
}: {
  groupId: string;
  member: GroupMember;
  marked: boolean;
  mark: MarkStatus;
  onAsk: () => void;
  onReport: () => void;
}) {
  const hint = markHint(mark, member.memberRef);
  const sending = mark?.memberRef === member.memberRef && mark.status === "sending";
  return (
    <View className="flex-row gap-4 rounded-card border border-line bg-surface p-3" testID={`after-member-${member.memberRef}`}>
      <PersonAvatar name={member.firstName} photoUrl={member.photoUrl} memoryCacheKey={`${groupId}:${member.memberRef}`} />
      <View className="flex-1 justify-center">
        <Text variant="title-large" numberOfLines={1}>
          {member.firstName}
        </Text>
        <View className="mt-2 items-start gap-1">
          {marked ? (
            <View
              accessible
              accessibilityLabel={copy.notComfortable.doneLabel(member.firstName)}
              className="min-h-11 flex-row items-center gap-1.5 px-3"
              testID={`after-marked-${member.memberRef}`}
            >
              <Icon icon={Check} size="sm" tone="muted" />
              <Text variant="control" className="text-muted" importantForAccessibility="no">
                {copy.notComfortable.done}
              </Text>
            </View>
          ) : (
            <Button
              variant="secondary"
              className="self-stretch px-4"
              title={sending ? copy.notComfortable.sending : copy.notComfortable.action}
              accessibilityLabel={copy.notComfortable.actionLabel(member.firstName)}
              loading={sending}
              onPress={onAsk}
              testID={`after-mark-${member.memberRef}`}
            />
          )}
          <TextButton
            title={copy.report.action}
            accessibilityLabel={copy.report.actionLabel(member.firstName)}
            icon={Flag}
            onPress={onReport}
            testID={`after-report-${member.memberRef}`}
          />
        </View>
        {hint ? (
          <Text variant="meta" className="mt-1 text-muted" accessibilityLiveRegion="polite" testID="after-mark-hint">
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Ready({ data, ...props }: AfterViewProps & { data: AfterData }) {
  // The confirm is for one person at a time. It is kept here, so a re-render from the next fetch does not close it.
  const [asking, setAsking] = useState<GroupMember | null>(null);
  const until = data.feedbackOpenUntil ? istWhen(data.feedbackOpenUntil) : null;
  return (
    <>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-1" testID="after-scroll">
        <Text variant="meta" className="min-h-11 text-muted" numberOfLines={1} testID="after-show">
          {copy.lead(data.showTitle)}
        </Text>
        <View testID="after-default">
          <Text variant="display-band" accessibilityRole="header">
            {copy.doNothing.title}
          </Text>
          <Text variant="body" className="mt-2 text-muted">
            {copy.doNothing.body}
          </Text>
        </View>
        <Note icon={LockSimple}>{copy.private}</Note>
        {until ? (
          <Text variant="meta" tabular className="text-muted" testID="after-window">
            {copy.window(until)}
          </Text>
        ) : null}
        <View className="gap-3" testID="after-members">
          {data.members.map((member) => (
            <Member
              key={member.memberRef}
              groupId={data.groupId}
              member={member}
              marked={data.marked.includes(member.memberRef)}
              mark={props.mark}
              onAsk={() => setAsking(member)}
              onReport={() => props.onReport(member.memberRef)}
            />
          ))}
        </View>
      </ScrollView>
      <Sheet
        visible={asking !== null}
        title={asking ? copy.confirm.title(asking.firstName) : ""}
        lead={copy.confirm.lead}
        onClose={() => setAsking(null)}
        primary={{
          title: copy.confirm.confirm,
          onPress: () => {
            if (asking) props.onMark(asking.memberRef);
            setAsking(null);
          },
          testID: "after-confirm",
        }}
        secondary={{ title: copy.confirm.cancel, onPress: () => setAsking(null), testID: "after-cancel" }}
      />
    </>
  );
}

function Loading() {
  return (
    <View className="gap-3 px-4" accessible accessibilityLabel={copy.loading} accessibilityState={{ busy: true }} testID="after-loading">
      <View className="h-6 w-2/3 rounded-pill bg-skeleton" />
      <View className="h-24 rounded-card bg-skeleton" />
      <View className="h-24 rounded-card bg-skeleton" />
    </View>
  );
}

/**
 * After the show (B13.1): the faces of the people the person went with, a plain line that doing nothing is the default, and for each
 * person a private "I didn't feel comfortable" (with a confirm) and a Report. The faces have no share, save or long-press.
 */
export function AfterView(props: AfterViewProps) {
  const { state } = props;
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="after">
      <View className="h-14 flex-row items-center px-2">
        <IconButton icon={CaretLeft} label={common.back} onPress={props.onBack} testID="back" />
        <View className="absolute inset-x-0 items-center" pointerEvents="none">
          <Text variant="control" className="font-semibold" accessibilityRole="header">
            {copy.title}
          </Text>
        </View>
      </View>
      {props.offline ? <OfflineBar /> : null}
      {state.status === "loading" ? <Loading /> : null}
      {state.status === "notYet" ? <EmptyState icon={Hourglass} title={copy.notYet.title} body={copy.notYet.body} /> : null}
      {state.status === "closed" ? (
        <EmptyState
          icon={CalendarX}
          title={copy.closed.title}
          body={copy.closed.body}
          action={{ title: copy.closed.action, onPress: props.onClosed }}
        />
      ) : null}
      {state.status === "error" ? <ErrorState kind={state.kind} onRetry={props.onRetry} /> : null}
      {state.status === "ready" ? <Ready {...props} data={state.data} /> : null}
    </SafeAreaView>
  );
}
