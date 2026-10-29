import type { ProofKind, TicketRejectReason } from "@turnout/contract/ticket";
import { Image } from "expo-image";
import { BellRinging, CheckCircle, FilePdf, ImageSquare, Info, WarningCircle } from "phosphor-react-native";
import { ScrollView, View } from "react-native";
import { ticket as copy } from "@/copy/ticket";
import { canSend, isPdf, type PickedTicket, type TicketPhase, type TicketProblem } from "@/model/ticketFile";
import { BackBar } from "@/ui/BackBar";
import { OfflineBar } from "@/ui/OfflineBar";
import { Button } from "@/ui/primitives/Button";
import { Icon } from "@/ui/primitives/Icon";
import { Note } from "@/ui/primitives/Note";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";

export interface TicketViewProps {
  phase: TicketPhase;
  show: { title: string; when: string };
  proofKind: ProofKind;
  /** The file chosen and not yet sent. It stays while the phone is offline. */
  file: PickedTicket | null;
  problem?: TicketProblem | null;
  /** Why the operator turned the last ticket down, in the rejected phase. */
  rejectReason?: TicketRejectReason | null;
  uploading?: boolean;
  /** 0 to 1 while the file goes up. */
  progress?: number;
  offline?: boolean;
  /** Ask about notifications, once, after the first ticket is sent. */
  askNotify?: boolean;
  onBack: () => void;
  onChoose: () => void;
  onSend: () => void;
  onLater: () => void;
  onDone: () => void;
  onNotify: () => void;
  onNotNow: () => void;
}

/** The chosen file as a tile: a small preview for a picture, a PDF mark for a PDF, and the name. */
function FileTile({ file }: { file: PickedTicket }) {
  const name = file.name ?? (isPdf(file) ? copy.add.chosenPdf : copy.add.chosenPhoto);
  return (
    <View
      accessible
      accessibilityLabel={copy.add.chosenLabel(name)}
      className="flex-row items-center gap-4 rounded-field border border-line bg-surface p-3"
      testID="ticket-file"
    >
      <View className="size-20 items-center justify-center overflow-hidden rounded-field bg-surface-raised" accessible={false}>
        {isPdf(file) ? (
          <Icon icon={FilePdf} />
        ) : (
          <Image source={{ uri: file.uri }} contentFit="cover" style={{ width: "100%", height: "100%" }} accessible={false} />
        )}
      </View>
      <Text variant="control" className="flex-1" numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

function EmptyTile() {
  return (
    <View
      accessible
      accessibilityLabel={`${copy.add.emptyTitle}, ${copy.add.emptyBody}`}
      className="items-center gap-2 rounded-field border border-dashed border-outline bg-surface px-4 py-8"
      testID="ticket-empty"
    >
      <Icon icon={ImageSquare} tone="muted" />
      <Text variant="control" className="font-semibold">
        {copy.add.emptyTitle}
      </Text>
      <Text variant="meta" className="text-muted">
        {copy.add.emptyBody}
      </Text>
    </View>
  );
}

/**
 * Add your ticket, in three phases. Add: pick a screenshot and send it. Checking: it is with the operator, nothing to do. Rejected:
 * the reason in plain words, and another file to send. Nothing here is red, and no copy blames the person.
 */
export function TicketView({
  phase,
  show,
  proofKind,
  file,
  problem = null,
  rejectReason = null,
  uploading = false,
  progress = 0,
  offline = false,
  askNotify = false,
  onBack,
  onChoose,
  onSend,
  onLater,
  onDone,
  onNotify,
  onNotNow,
}: TicketViewProps) {
  const percent = Math.round(progress * 100);
  const fileIssue = problem !== null && problem !== "offline" && problem !== "server" && problem !== "plan_closed" ? problem : null;
  const sendable = canSend({ file, issue: fileIssue, uploading, offline });
  const chooseTitle = phase === "rejected" ? copy.rejected.choose : proofKind === "screenshot" ? copy.add.choose : copy.add.choosePdf;

  return (
    <SafeAreaView className="flex-1 bg-bg" testID="ticket">
      <BackBar onBack={onBack} />
      {offline ? <OfflineBar /> : null}
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6">
        <View>
          <Text variant="title-large" accessibilityRole="header">
            {phase === "add" ? copy.add.title[proofKind] : phase === "checking" ? copy.checking.title : copy.rejected.title}
          </Text>
          <Text variant="body" className="mt-2 text-muted">
            {show.title}, {show.when}
          </Text>
          {phase === "add" ? (
            <Text variant="body" className="mt-2 text-muted">
              {copy.add.lead[proofKind]}
            </Text>
          ) : null}
        </View>

        {phase === "checking" ? (
          <View className="gap-4">
            <View
              accessible
              accessibilityLabel={`${copy.checking.tileLabel}, ${copy.checking.tileSent}`}
              className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4"
              testID="ticket-sent"
            >
              <Icon icon={CheckCircle} weight="fill" />
              <View className="flex-1">
                <Text variant="control" className="font-semibold">
                  {copy.checking.tileLabel}
                </Text>
                <Text variant="meta" className="text-muted">
                  {copy.checking.tileSent}
                </Text>
              </View>
            </View>
            <Text variant="body" className="text-muted">
              {copy.checking.body}
            </Text>
            {askNotify ? (
              <View className="gap-3 rounded-field bg-surface-raised p-4" testID="ticket-notify">
                <View className="flex-row items-center gap-3">
                  <Icon icon={BellRinging} tone="muted" />
                  <Text variant="control" className="flex-1 font-semibold">
                    {copy.notify.title}
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <Button title={copy.notify.on} onPress={onNotify} className="flex-1" testID="ticket-notify-on" />
                  <Button
                    variant="secondary"
                    title={copy.notify.notNow}
                    onPress={onNotNow}
                    className="flex-1"
                    testID="ticket-notify-not-now"
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View className="gap-4">
            {phase === "rejected" ? (
              <Note icon={Info}>{rejectReason ? copy.rejected.reasons[rejectReason] : copy.rejected.unknown}</Note>
            ) : null}
            {file ? <FileTile file={file} /> : <EmptyTile />}
            {file ? (
              <TextButton
                title={copy.add.another}
                link
                onPress={onChoose}
                disabled={uploading}
                className="self-start"
                testID="ticket-another"
              />
            ) : null}
            {uploading ? (
              <View
                className="h-1 overflow-hidden rounded-pill bg-line"
                accessibilityRole="progressbar"
                accessibilityLabel={copy.add.sending(percent)}
                accessibilityValue={{ min: 0, max: 100, now: percent }}
                testID="ticket-progress"
              >
                <View className="h-1 bg-ink" style={{ width: `${percent}%` }} />
              </View>
            ) : null}
            {problem ? (
              <View accessibilityLiveRegion="polite" testID="ticket-problem">
                <Note icon={WarningCircle}>{copy.problems[problem]}</Note>
              </View>
            ) : null}
            {phase === "add" ? (
              <View accessible accessibilityLabel={`${copy.add.shouldShow}: ${copy.add.shows.join(", ")}`} className="gap-1">
                <Text variant="label" className="text-muted">
                  {copy.add.shouldShow}
                </Text>
                {copy.add.shows.map((line) => (
                  <Text key={line} variant="body">
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        )}
        <Text variant="meta" className="text-muted" testID="ticket-deleted">
          {copy.deleted}
        </Text>
      </ScrollView>
      <View className="gap-3 border-t border-line bg-bg px-4 pb-3 pt-3">
        {phase === "checking" ? (
          <Button title={copy.checking.done} onPress={onDone} testID="ticket-done" />
        ) : (
          <>
            {file ? (
              <Button
                title={uploading ? copy.add.sending(percent) : copy.add.send}
                onPress={onSend}
                loading={uploading}
                disabled={!sendable && !uploading}
                testID="ticket-send"
              />
            ) : (
              <Button title={chooseTitle} onPress={onChoose} testID="ticket-choose" />
            )}
            <Button variant="secondary" title={copy.add.later} onPress={onLater} disabled={uploading} testID="ticket-later" />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
