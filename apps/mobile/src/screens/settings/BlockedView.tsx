import { UserMinus } from "phosphor-react-native";
import { ScrollView, View } from "react-native";
import { settings } from "@/copy/settings";
import { BackBar } from "@/ui/BackBar";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorState } from "@/ui/ErrorState";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { SkeletonRow } from "@/ui/SkeletonRow";

const copy = settings.blocked;

export interface BlockedRow {
  firstName: string;
  /** "Comedy Night, Fri 30 Oct": the show they were met at. */
  context: string;
}

export interface BlockedViewProps {
  state: { kind: "loading" } | { kind: "failed"; offline: boolean; onRetry: () => void } | { kind: "ready"; people: readonly BlockedRow[] };
  onBack: () => void;
}

/** Settings, blocked people. View only: there is no way to undo a block here. */
export function BlockedView({ state, onBack }: BlockedViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="settings-blocked">
      <BackBar onBack={onBack} />
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6">
        <View>
          <Text variant="title-large" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="body" className="mt-2 text-muted">
            {copy.lead}
          </Text>
        </View>
        {state.kind === "loading" ? <SkeletonRow /> : null}
        {state.kind === "failed" ? <ErrorState kind={state.offline ? "offline" : "server"} onRetry={state.onRetry} /> : null}
        {state.kind === "ready" && state.people.length === 0 ? (
          <EmptyState icon={UserMinus} title={copy.empty.title} body={copy.empty.body} />
        ) : null}
        {state.kind === "ready" && state.people.length > 0 ? (
          <View testID="blocked-list">
            {state.people.map((person, index) => (
              // The list has no ids by design: a person is a first name and the show it happened at.
              // biome-ignore lint/suspicious/noArrayIndexKey: no stable id exists
              <View key={index} className="py-3" accessible accessibilityLabel={`${person.firstName}, ${person.context}`}>
                <Text variant="control" className="font-semibold">
                  {person.firstName}
                </Text>
                <Text variant="meta" className="text-muted">
                  {person.context}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
