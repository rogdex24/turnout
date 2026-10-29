import { CheckCircle, Phone, Tray } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { report as copy } from "@/copy/report";
import { DETAILS_MAX_CHARS } from "@/model/report";
import { BackBar } from "@/ui/BackBar";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { OfflineBar } from "@/ui/OfflineBar";
import { PersonAvatar } from "@/ui/PersonAvatar";
import { Button } from "@/ui/primitives/Button";
import { Field } from "@/ui/primitives/Field";
import { Icon } from "@/ui/primitives/Icon";
import { dimOnPress } from "@/ui/primitives/press";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";

export interface ReportPerson {
  memberRef: string;
  firstName: string;
  photoUrl: string | null;
}

export type ReportViewState =
  | { status: "loading" }
  | { status: "error"; kind: NonNullable<ErrorStateProps["kind"]> }
  /** Someone else's people in the group, and who the report starts on (the person whose message was held, or none). */
  | { status: "form"; people: ReportPerson[]; initialMemberRef: string | null; aboutMessage: boolean }
  /** The report is on the server. */
  | { status: "sent" }
  /** There was no network, so it is saved and goes when the phone is back online. */
  | { status: "queued" };

export interface ReportSubmission {
  memberRef: string;
  /** The reason's id and its label, the way the person read it. */
  reasonLabel: string;
  details: string;
}

export interface ReportViewProps {
  state: ReportViewState;
  offline: boolean;
  /** The send is under way. */
  sending: boolean;
  /** The last send was refused. */
  failed: boolean;
  onBack: () => void;
  onRetry: () => void;
  onCall: () => void;
  onSubmit: (submission: ReportSubmission) => void;
  onDone: () => void;
}

function Emergency({ onCall }: { onCall: () => void }) {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={copy.sos.text}
      className="mx-4 flex-row items-center gap-3 rounded-field bg-surface-raised px-4 py-3"
      testID="report-sos"
    >
      <Icon icon={Phone} size="sm" />
      <Text variant="control" className="flex-1 font-semibold">
        {copy.sos.text}
      </Text>
      <Button
        variant="secondary"
        title={copy.sos.button}
        accessibilityLabel={copy.sos.label}
        className="h-11 px-4"
        onPress={onCall}
        testID="report-call-112"
      />
    </View>
  );
}

function Form({
  people,
  initialMemberRef,
  aboutMessage,
  sending,
  failed,
  onSubmit,
}: {
  people: ReportPerson[];
  initialMemberRef: string | null;
  aboutMessage: boolean;
  sending: boolean;
  failed: boolean;
  onSubmit: (submission: ReportSubmission) => void;
}) {
  const [memberRef, setMemberRef] = useState<string | null>(initialMemberRef);
  const [reasonId, setReasonId] = useState<string>(copy.reasons[0].id);
  const [details, setDetails] = useState("");
  const reason = copy.reasons.find((entry) => entry.id === reasonId) ?? copy.reasons[0];
  return (
    <>
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-4" keyboardShouldPersistTaps="handled" testID="report-scroll">
        <Text variant="title-large" accessibilityRole="header">
          {copy.who}
        </Text>
        {aboutMessage ? (
          <Text variant="meta" className="mt-1 text-muted">
            {copy.message}
          </Text>
        ) : null}
        <View accessibilityRole="radiogroup" className="mt-3 flex-row flex-wrap gap-x-3 gap-y-4" testID="report-people">
          {people.map((person) => {
            const picked = person.memberRef === memberRef;
            return (
              <Pressable
                key={person.memberRef}
                accessibilityRole="radio"
                accessibilityLabel={copy.whoLabel(person.firstName)}
                accessibilityState={{ checked: picked }}
                onPress={() => setMemberRef(person.memberRef)}
                className="min-h-11 w-[62px] items-center"
                style={dimOnPress}
                testID={`report-person-${person.memberRef}`}
              >
                <View
                  importantForAccessibility="no-hide-descendants"
                  className={picked ? "rounded-field border-2 border-ink p-0.5" : "rounded-field border-2 border-transparent p-0.5"}
                >
                  <PersonAvatar name={person.firstName} photoUrl={person.photoUrl} size="sm" />
                </View>
                <Text
                  variant="meta"
                  className={picked ? "mt-1.5 font-semibold" : "mt-1.5 text-muted"}
                  numberOfLines={1}
                  importantForAccessibility="no"
                >
                  {person.firstName}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="title-large" accessibilityRole="header" className="mt-5">
          {copy.why}
        </Text>
        <View accessibilityRole="radiogroup" className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
          {copy.reasons.map((entry, index) => {
            const picked = entry.id === reasonId;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="radio"
                accessibilityLabel={entry.label}
                accessibilityState={{ checked: picked }}
                onPress={() => setReasonId(entry.id)}
                className={
                  index === 0
                    ? "min-h-[52px] flex-row items-center gap-3 px-4"
                    : "min-h-[52px] flex-row items-center gap-3 border-t border-line px-4"
                }
                style={dimOnPress}
                testID={`report-reason-${entry.id}`}
              >
                <View
                  className={
                    picked
                      ? "size-[22px] items-center justify-center rounded-pill border-2 border-ink"
                      : "size-[22px] rounded-pill border-2 border-outline"
                  }
                  importantForAccessibility="no-hide-descendants"
                >
                  {picked ? <View className="size-2.5 rounded-pill bg-ink" /> : null}
                </View>
                <Text variant="control" className={picked ? "flex-1 font-semibold" : "flex-1"} importantForAccessibility="no">
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Field
          className="mt-5"
          label={copy.details.label}
          placeholder={copy.details.placeholder}
          value={details}
          onChangeText={setDetails}
          multiline
          numberOfLines={4}
          maxLength={DETAILS_MAX_CHARS}
          textAlignVertical="top"
          testID="report-details"
        />
        <Text variant="meta" className="mt-3 text-muted">
          {copy.fine}
        </Text>
      </ScrollView>
      <SafeAreaView edges={["bottom"]} className="border-t border-line bg-bg px-4 pt-3">
        {failed ? (
          <Text variant="meta" className="mb-2.5 text-center text-muted" accessibilityLiveRegion="polite" testID="report-failed">
            {copy.failed}
          </Text>
        ) : null}
        <Button
          title={copy.send}
          disabled={memberRef === null}
          loading={sending}
          onPress={() => memberRef !== null && onSubmit({ memberRef, reasonLabel: reason.label, details })}
          testID="report-send"
        />
        <View className="h-3" />
      </SafeAreaView>
    </>
  );
}

/**
 * The report form (B13): who, what happened, details, and Send. Call 112 stays at the top in every state, so a person in danger never
 * has to find it. Nothing here shows what became of the person reported, before or after the report goes.
 */
export function ReportView(props: ReportViewProps) {
  const { state } = props;
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]} testID="report">
      <BackBar onBack={props.onBack} />
      <Text variant="display" accessibilityRole="header" className="px-4">
        {copy.title}
      </Text>
      <View className="mt-3">
        <Emergency onCall={props.onCall} />
      </View>
      {props.offline ? <OfflineBar /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        {state.status === "loading" ? (
          <View
            className="gap-3 px-4 pt-6"
            accessible
            accessibilityLabel={copy.loading}
            accessibilityState={{ busy: true }}
            testID="report-loading"
          >
            <View className="h-6 w-1/2 rounded-pill bg-skeleton" />
            <View className="h-16 w-2/3 rounded-card bg-skeleton" />
          </View>
        ) : null}
        {state.status === "error" ? <ErrorState kind={state.kind} onRetry={props.onRetry} /> : null}
        {state.status === "form" ? (
          <Form
            people={state.people}
            initialMemberRef={state.initialMemberRef}
            aboutMessage={state.aboutMessage}
            sending={props.sending}
            failed={props.failed}
            onSubmit={props.onSubmit}
          />
        ) : null}
        {state.status === "sent" ? (
          <EmptyState
            icon={CheckCircle}
            title={copy.sent.title}
            body={copy.sent.body}
            action={{ title: copy.sent.action, onPress: props.onDone }}
          />
        ) : null}
        {state.status === "queued" ? (
          <EmptyState
            icon={Tray}
            title={copy.queued.title}
            body={copy.queued.body}
            action={{ title: copy.queued.action, onPress: props.onDone }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
