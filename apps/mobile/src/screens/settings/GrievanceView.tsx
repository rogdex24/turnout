import type { ConfigResponse } from "@turnout/contract/app/config";
import { Envelope, Info, Phone } from "phosphor-react-native";
import { View } from "react-native";
import { common } from "@/copy/common";
import { settings } from "@/copy/settings";
import { Note } from "@/ui/primitives/Note";
import { Row } from "@/ui/primitives/Row";
import { Text } from "@/ui/primitives/Text";
import { TextButton } from "@/ui/primitives/TextButton";
import { SkeletonRow } from "@/ui/SkeletonRow";
import { SettingsPage } from "./SettingsPage";

const copy = settings.grievance;

export type GrievanceViewState =
  | { kind: "loading" }
  | { kind: "failed"; onRetry: () => void }
  | { kind: "not_set" }
  | { kind: "ready"; officer: ConfigResponse["grievance"] };

export interface GrievanceViewProps {
  state: GrievanceViewState;
  onBack: () => void;
  onEmail: () => void;
  onCall: () => void;
}

/** Settings, grievance officer: the name and address as published, with the email and phone as one tap each. */
export function GrievanceView({ state, onBack, onEmail, onCall }: GrievanceViewProps) {
  return (
    <SettingsPage title={copy.title} lead={copy.lead} onBack={onBack} testID="settings-grievance">
      {state.kind === "loading" ? <SkeletonRow /> : null}
      {state.kind === "failed" ? (
        <View accessibilityRole="alert">
          <Text variant="body" className="text-muted">
            {copy.failed}
          </Text>
          <TextButton title={common.retry} onPress={state.onRetry} className="mt-1 self-start" testID="grievance-retry" />
        </View>
      ) : null}
      {state.kind === "not_set" ? (
        <View testID="grievance-not-set">
          <Text variant="title" accessibilityRole="header">
            {copy.notSet.title}
          </Text>
          <Note icon={Info} className="mt-3">
            {copy.notSet.body}
          </Note>
        </View>
      ) : null}
      {state.kind === "ready" ? (
        <View testID="grievance-details">
          <Line label={copy.labels.name} value={state.officer.name} />
          <Line label={copy.labels.address} value={state.officer.address} />
          <Row
            icon={Envelope}
            title={copy.emailAction}
            sub={state.officer.email}
            onPress={onEmail}
            className="-mx-4"
            testID="grievance-email"
          />
          <Row
            icon={Phone}
            title={copy.phoneAction}
            sub={state.officer.phone}
            onPress={onCall}
            className="-mx-4"
            testID="grievance-phone"
          />
        </View>
      ) : null}
    </SettingsPage>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-4" accessible accessibilityLabel={`${label}, ${value}`}>
      <Text variant="label" className="text-muted">
        {label}
      </Text>
      <Text variant="body" selectable>
        {value}
      </Text>
    </View>
  );
}
