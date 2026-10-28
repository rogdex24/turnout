import type { ConfigResponse } from "@turnout/contract/app/config";
import { NOTICE_PARAGRAPHS } from "@turnout/contract/app/notice";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { common } from "@/copy/common";
import { notice } from "@/copy/notice";
import { Button } from "@/ui/primitives/Button";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";
import { useColors } from "@/ui/theme";

export type GrievanceState = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; officer: ConfigResponse["grievance"] };

export interface NoticeViewProps {
  grievance: GrievanceState;
  onRetryGrievance: () => void;
  onAgree: () => void;
  agreeing?: boolean;
  /** Signed in, and the notice moved since this person agreed. */
  changed?: boolean;
  /** One sentence above the button, from the agree call. */
  error?: string | null;
}

/** The privacy notice, read before the phone screen. The grievance officer's block comes from the server, and agreeing waits for it, so nobody agrees to a notice with its contact missing. */
export function NoticeView({ grievance, onRetryGrievance, onAgree, agreeing = false, changed = false, error = null }: NoticeViewProps) {
  const colors = useColors();
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]} testID="notice">
      <ScrollView className="flex-1" contentContainerClassName="px-5 pt-8 pb-6">
        <Text variant="display" accessibilityRole="header">
          {changed ? notice.titleChanged : notice.title}
        </Text>
        <Text variant="body" className="mt-2 text-muted">
          {changed ? notice.leadChanged : notice.lead}
        </Text>
        <View className="mt-6 gap-4">
          {NOTICE_PARAGRAPHS.map((paragraph) => (
            <Text key={paragraph} variant="body">
              {paragraph}
            </Text>
          ))}
        </View>
        <View className="mt-8 rounded-field bg-surface px-4 py-4" testID="grievance">
          <Text variant="title" accessibilityRole="header">
            {notice.grievanceTitle}
          </Text>
          {grievance.kind === "ready" ? (
            <>
              <Text variant="body" className="mt-2 text-muted">
                {notice.grievanceIntro}
              </Text>
              <OfficerLine label={notice.grievanceLabels.name} value={grievance.officer.name} />
              <OfficerLine label={notice.grievanceLabels.address} value={grievance.officer.address} />
              <OfficerLine label={notice.grievanceLabels.email} value={grievance.officer.email} />
              <OfficerLine label={notice.grievanceLabels.phone} value={grievance.officer.phone} />
            </>
          ) : null}
          {grievance.kind === "loading" ? (
            <View className="mt-3 flex-row items-center gap-3" accessible accessibilityLabel={notice.grievanceLoading}>
              <ActivityIndicator color={colors.muted} />
              <Text variant="body" className="flex-1 text-muted">
                {notice.grievanceLoading}
              </Text>
            </View>
          ) : null}
          {grievance.kind === "failed" ? (
            <View className="mt-2" accessibilityRole="alert">
              <Text variant="body" className="text-muted">
                {notice.grievanceFailed}
              </Text>
              <TextButton title={common.retry} onPress={onRetryGrievance} className="mt-1 self-start" testID="grievance-retry" />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View className="px-4 pb-3">
        {error ? (
          <Text variant="meta" className="mb-3 text-center" accessibilityLiveRegion="polite" testID="notice-error">
            {error}
          </Text>
        ) : null}
        <Button
          title={notice.agree}
          accessibilityHint={notice.agreeHint}
          onPress={onAgree}
          loading={agreeing}
          disabled={grievance.kind !== "ready"}
          testID="agree"
        />
      </View>
    </SafeAreaView>
  );
}

function OfficerLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-3" accessible accessibilityLabel={`${label}, ${value}`}>
      <Text variant="label" className="text-muted">
        {label}
      </Text>
      <Text variant="body" selectable>
        {value}
      </Text>
    </View>
  );
}
