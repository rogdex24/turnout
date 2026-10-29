import type { HandleState } from "@turnout/contract/profile";
import {
  Bell,
  ChartBar,
  FileText,
  GenderFemale,
  Headset,
  InstagramLogo,
  Question,
  SignOut,
  Trash,
  UserCircle,
  UserMinus,
} from "phosphor-react-native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { you } from "@/copy/you";
import { Row } from "@/ui/primitives/Row";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { ToggleRow } from "@/ui/ToggleRow";

export type YouTarget = "profile" | "social" | "notifications" | "blocked" | "howMatching" | "privacy" | "grievance" | "deleteAccount";

export interface YouViewProps {
  /** The first name, or null before the profile is filled in. */
  firstName: string | null;
  /** Where the handle check stands. `missing` is an account with no handle. */
  handleState: HandleState | "missing";
  /** The women-only switch is offered to women and non-binary people only. */
  womenOnly: { available: boolean; value: boolean; saving?: boolean; error?: string | null };
  /** "Share usage data" is on. */
  usageData: boolean;
  /** The notice version this account agreed to. */
  noticeVersion: string;
  onOpen: (target: YouTarget) => void;
  onWomenOnly: (next: boolean) => void;
  onUsageData: (next: boolean) => void;
  onSignOut: () => void;
}

/** The You tab: the profile, the safety choices, what we hold and where to write, and the way out. Every row is one tap. */
export function YouView({
  firstName,
  handleState,
  womenOnly,
  usageData,
  noticeVersion,
  onOpen,
  onWomenOnly,
  onUsageData,
  onSignOut,
}: YouViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]} testID="you">
      <ScrollView className="flex-1" contentContainerClassName="pb-8">
        <Text variant="title-large" className="px-4 pt-4" accessibilityRole="header">
          {you.title}
        </Text>

        <Section title={you.sections.account}>
          <Row
            icon={UserCircle}
            title={you.profile}
            sub={firstName ?? undefined}
            caret
            onPress={() => onOpen("profile")}
            testID="you-profile"
          />
          <Row
            icon={InstagramLogo}
            title={you.social.title}
            sub={you.social.state[handleState]}
            caret
            onPress={() => onOpen("social")}
            testID="you-social"
          />
          <Row icon={Bell} title={you.notifications} caret onPress={() => onOpen("notifications")} testID="you-notifications" />
        </Section>

        <Section title={you.sections.safety}>
          {womenOnly.available ? (
            <ToggleRow
              icon={GenderFemale}
              title={you.womenOnly.title}
              sub={you.womenOnly.sub}
              value={womenOnly.value}
              disabled={womenOnly.saving}
              error={womenOnly.error}
              onValueChange={onWomenOnly}
              testID="you-women-only"
            />
          ) : null}
          <Row
            icon={UserMinus}
            title={you.blocked.title}
            sub={you.blocked.sub}
            caret
            onPress={() => onOpen("blocked")}
            testID="you-blocked"
          />
          <Row icon={Question} title={you.howMatching} caret onPress={() => onOpen("howMatching")} testID="you-how-matching" />
        </Section>

        <Section title={you.sections.about}>
          <Row
            icon={FileText}
            title={you.privacy.title}
            sub={you.privacy.sub(noticeVersion)}
            caret
            onPress={() => onOpen("privacy")}
            testID="you-privacy"
          />
          <Row icon={Headset} title={you.grievance} caret onPress={() => onOpen("grievance")} testID="you-grievance" />
          <ToggleRow
            icon={ChartBar}
            title={you.usage.title}
            sub={you.usage.sub}
            value={usageData}
            onValueChange={onUsageData}
            testID="you-usage"
          />
        </Section>

        <Section title={you.sections.leave}>
          <Row icon={SignOut} title={you.signOut} onPress={onSignOut} testID="you-sign-out" />
          <Row icon={Trash} title={you.deleteAccount} onPress={() => onOpen("deleteAccount")} testID="you-delete-account" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-5" accessibilityRole="none">
      <Text variant="label" className="px-4 pb-1 text-muted" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}
