import { FlashList } from "@shopify/flash-list";
import { MESSAGE_MAX_CHARS } from "@turnout/contract/app/thread";
import { spacing } from "@turnout/design-tokens";
import { CalendarX, CaretLeft, ChatCircle, Flag, Hourglass, Lock, PaperPlaneRight } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { common } from "@/copy/common";
import { thread as copy } from "@/copy/thread";
import type { ThreadItem } from "@/model/thread";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { OfflineBar } from "@/ui/OfflineBar";
import { PersonAvatar } from "@/ui/PersonAvatar";
import { Chip } from "@/ui/primitives/Chip";
import { IconButton } from "@/ui/primitives/IconButton";
import { Note } from "@/ui/primitives/Note";
import { dimOnPress } from "@/ui/primitives/press";
import { Row } from "@/ui/primitives/Row";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Sheet } from "@/ui/primitives/Sheet";
import { Text } from "@/ui/primitives/Text";
import { useColors } from "@/ui/theme";

export interface ThreadReady {
  /** The show's title. */
  title: string;
  /** "Sun 7:00 PM" when the chat is open, null once it is read only. */
  closesAt: string | null;
  /** Oldest first. */
  items: ThreadItem[];
  /** Photos by member ref, from the group. A member with none shows an initial. */
  photos: Record<string, string | null>;
  readOnly: boolean;
}

export type ThreadViewState =
  | { status: "loading" }
  /** Before T-3h: the chat is not open yet. */
  | { status: "waiting"; opensAt: string }
  /** The group is called off, or the chat is past its keeping time. */
  | { status: "closed" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  | ({ status: "ready" } & ThreadReady);

export interface ThreadViewProps {
  state: ThreadViewState;
  offline: boolean;
  onBack: () => void;
  onRetry: () => void;
  /** Sends a message. The text is trimmed by the server, and the view never sends an empty one. Answers with a line to show when the message cannot be sent, null when it went. */
  onSend: (body: string) => string | null;
  /** Sends a message that did not go, again. */
  onResend: (clientId: string) => void;
  /** Opens the report form for someone else's message. */
  onReport: (item: ThreadItem) => void;
  onClosed: () => void;
}

const QUICK = [copy.quick.late, copy.quick.onMyWay, copy.quick.atCafe] as const;

function statusLine(item: ThreadItem): string | null {
  if (item.status === "sending") return copy.status.sending;
  if (item.status === "queued") return copy.status.queued;
  if (item.status === "failed") return copy.status.failed;
  if (item.status === "refused") return copy.status.refused;
  return null;
}

/** Messages are recycled by shape: whose it is, and whether it opens a run (which adds the name line and the gap above). */
function messageType(item: ThreadItem): string {
  return `${item.isYou ? "you" : "other"}-${item.startsRun ? "run" : "next"}`;
}

function Message({
  item,
  photoUrl,
  onResend,
  onHold,
}: {
  item: ThreadItem;
  photoUrl: string | null;
  onResend: () => void;
  onHold: () => void;
}) {
  const name = item.isYou ? copy.you : item.firstName;
  const status = statusLine(item);
  const failed = item.status === "failed";
  // Text is drawn as plain text: no link is made from what someone writes, and no data detector is switched on.
  const bubble = (
    <View
      className={item.isYou ? "rounded-card bg-surface-raised px-3.5 py-2.5" : "rounded-card border border-line bg-surface px-3.5 py-2.5"}
    >
      <Text variant="body" selectable={false}>
        {item.body}
      </Text>
    </View>
  );
  const label = copy.itemLabel(name, item.time, item.body);
  return (
    <View className={item.isYou ? "items-end" : "flex-row items-start gap-2.5"} style={{ marginTop: item.startsRun ? 14 : 4 }}>
      {item.isYou ? null : (
        <View className="w-7" importantForAccessibility="no-hide-descendants">
          {item.startsRun ? <PersonAvatar name={item.firstName} photoUrl={photoUrl} size="xs" /> : null}
        </View>
      )}
      <Pressable
        accessible
        accessibilityRole={failed ? "button" : "text"}
        accessibilityLabel={status ? `${label}. ${status}` : label}
        accessibilityHint={failed ? copy.retryHint : undefined}
        accessibilityActions={item.isYou ? undefined : [{ name: "report", label: copy.report.action }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "report") onHold();
        }}
        onPress={failed ? onResend : undefined}
        onLongPress={item.isYou ? undefined : onHold}
        delayLongPress={400}
        style={dimOnPress}
        className={item.isYou ? "max-w-[82%] items-end" : "max-w-[82%] flex-1 items-start"}
        testID={`thread-item-${item.key}`}
      >
        <View importantForAccessibility="no-hide-descendants" className={item.isYou ? "items-end" : "items-start"}>
          {item.startsRun ? (
            <Text variant="meta" tabular className="text-muted">
              {item.isYou ? null : <Text variant="meta" className="mr-1.5 font-semibold">{`${name}  `}</Text>}
              {item.time}
            </Text>
          ) : null}
          <View className="mt-1">{bubble}</View>
          {status ? (
            <Text variant="meta" className="mt-1 text-muted" testID={`thread-status-${item.key}`}>
              {status}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function Composer({ onSend, onQuick }: { onSend: (body: string) => string | null; onQuick: (text: string) => void }) {
  const colors = useColors();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const ready = draft.trim().length > 0;
  const send = () => {
    if (!ready) return;
    const refused = onSend(draft);
    setProblem(refused);
    if (refused === null) setDraft("");
  };
  return (
    <View className="border-t border-line bg-bg pb-2 pt-2" testID="thread-composer">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-1.5 px-3"
        accessibilityLabel={copy.quick.label}
        className="grow-0"
      >
        {QUICK.map((text) => (
          <Chip key={text} label={text} onPress={() => onQuick(text)} testID={`thread-quick-${text}`} />
        ))}
      </ScrollView>
      <View className="mt-2 flex-row items-center gap-2 pl-4 pr-3">
        <TextInput
          accessibilityLabel={copy.composer.label}
          placeholder={copy.composer.placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.ink}
          cursorColor={colors.ink}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setProblem(null);
          }}
          multiline
          maxLength={MESSAGE_MAX_CHARS}
          allowFontScaling
          dataDetectorTypes="none"
          returnKeyType="default"
          className="min-h-12 max-h-32 flex-1 rounded-field border border-outline bg-surface px-4 py-2.5 font-sans text-body text-ink"
          testID="thread-input"
        />
        <IconButton
          icon={PaperPlaneRight}
          label={copy.composer.send}
          ring
          disabled={!ready}
          onPress={send}
          style={{ opacity: ready ? 1 : 0.4 }}
          testID="thread-send"
        />
      </View>
      {problem ? (
        <Text variant="meta" className="mt-1.5 px-4 text-muted" accessibilityLiveRegion="polite" testID="thread-invalid">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string | null; onBack: () => void }) {
  return (
    <View className="min-h-14 flex-row items-center px-2 py-1">
      <IconButton icon={CaretLeft} label={common.back} onPress={onBack} testID="back" />
      <View className="flex-1 items-center px-2">
        <Text variant="control" className="font-semibold" numberOfLines={1} accessibilityRole="header" testID="thread-title">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" tabular className="text-muted" numberOfLines={1} testID="thread-subtitle">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="w-11" />
    </View>
  );
}

function Loading() {
  return (
    <View className="gap-3 px-4" accessible accessibilityLabel={copy.loading} accessibilityState={{ busy: true }} testID="thread-loading">
      <View className="h-12 w-2/3 rounded-card bg-skeleton" />
      <View className="h-12 w-1/2 self-end rounded-card bg-skeleton" />
      <View className="h-12 w-3/4 rounded-card bg-skeleton" />
    </View>
  );
}

function Messages({
  ready,
  onResend,
  onHold,
}: {
  ready: ThreadReady;
  onResend: (clientId: string) => void;
  onHold: (item: ThreadItem) => void;
}) {
  if (ready.items.length === 0) {
    return (
      <View className="flex-1">
        <EmptyState icon={ChatCircle} title={copy.empty.title} body={copy.empty.body} />
      </View>
    );
  }
  // An inverted list keeps the newest message at the bottom, next to the composer, and stays there when the keyboard opens.
  return (
    <FlashList<ThreadItem>
      inverted
      accessibilityLabel={copy.list}
      data={[...ready.items].reverse()}
      keyExtractor={(item) => item.key}
      getItemType={messageType}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[2] }}
      renderItem={({ item }) => (
        <Message
          item={item}
          photoUrl={ready.photos[item.memberRef ?? ""] ?? null}
          onResend={() => item.clientId && onResend(item.clientId)}
          onHold={() => onHold(item)}
        />
      )}
      testID="thread-list"
    />
  );
}

/** The group chat (B12): the messages, the quick chips and the composer. Read-only and waiting states keep the header and drop the composer. */
export function ThreadView(props: ThreadViewProps) {
  const [held, setHeld] = useState<ThreadItem | null>(null);
  const { state } = props;
  const title = state.status === "ready" ? state.title : copy.fallbackTitle;
  let subtitle: string | null = null;
  if (state.status === "ready")
    subtitle = state.readOnly || state.closesAt === null ? copy.subtitle.readOnly : copy.subtitle.open(state.closesAt);
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]} testID="thread">
      <Header title={title} subtitle={subtitle} onBack={props.onBack} />
      {props.offline ? <OfflineBar /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        {state.status === "loading" ? <Loading /> : null}
        {state.status === "waiting" ? (
          <EmptyState icon={Hourglass} title={copy.waiting.title} body={copy.waiting.body(state.opensAt)} />
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
        {state.status === "ready" ? (
          <>
            <Messages ready={state} onResend={props.onResend} onHold={setHeld} />
            {state.readOnly ? (
              <View className="border-t border-line px-4 py-3">
                <Note icon={Lock}>{copy.readOnly}</Note>
              </View>
            ) : (
              <Composer onSend={props.onSend} onQuick={(text) => void props.onSend(text)} />
            )}
          </>
        ) : null}
      </KeyboardAvoidingView>
      <Sheet
        visible={held !== null}
        title={held ? copy.report.sheetTitle(held.firstName) : ""}
        onClose={() => setHeld(null)}
        secondary={{ title: copy.report.close, onPress: () => setHeld(null) }}
      >
        <View className="overflow-hidden rounded-card border border-line bg-bg">
          <Row
            title={copy.report.action}
            accessibilityLabel={copy.report.actionLabel}
            icon={Flag}
            caret
            onPress={() => {
              const item = held;
              setHeld(null);
              if (item) props.onReport(item);
            }}
            testID="thread-report"
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
