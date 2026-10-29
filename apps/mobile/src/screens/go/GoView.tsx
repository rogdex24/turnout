import type { MatchableItem } from "@turnout/contract/app/me";
import type { GroupType } from "@turnout/contract/app/plans";
import { WarningCircle } from "phosphor-react-native";
import { View } from "react-native";
import { go } from "@/copy/go";
import type { GoIssue } from "@/model/goPlan";
import { joinItems } from "@/model/goPlan";
import { Chip } from "@/ui/primitives/Chip";
import { Note } from "@/ui/primitives/Note";
import { Sheet } from "@/ui/primitives/Sheet";
import { Text } from "@/ui/primitives/Text";

export interface GoViewProps {
  groupType: GroupType;
  /** The women-only chip is for women and non-binary people. */
  womenOnlyOffered: boolean;
  /** The one sentence about groups: first time only. */
  explain: boolean;
  /** The plan is being made. */
  busy?: boolean;
  /** Why the last try did not go through. */
  issue?: GoIssue | null;
  onGroupType: (type: GroupType) => void;
  onNext: () => void;
  onClose: () => void;
  /** Takes a person with something missing to the place that adds it. */
  onFinish: () => void;
}

function issueText(issue: GoIssue): string {
  switch (issue.kind) {
    case "not_matchable":
      return go.missing.lead(
        joinItems(
          issue.missing.map((item: MatchableItem) => go.missing.items[item]),
          go.missing.and,
        ),
      );
    case "women_only":
      return go.issues.womenOnly;
    case "closed":
      return go.issues.closed;
    case "offline":
      return go.issues.offline;
    case "rate_limited":
      return go.issues.rateLimited;
    case "server":
      return go.issues.server;
  }
}

/**
 * Go with a group, the sheet over the Show page. One choice (any group, or women and non-binary only), then on to the ticket. The
 * sentence about how groups work is there the first time only. A person with something missing is told what, with a way to add it.
 */
export function GoView({
  groupType,
  womenOnlyOffered,
  explain,
  busy = false,
  issue = null,
  onGroupType,
  onNext,
  onClose,
  onFinish,
}: GoViewProps) {
  const needsProfile = issue?.kind === "not_matchable";
  return (
    <Sheet
      visible
      title={go.title}
      lead={explain ? go.explain : undefined}
      onClose={onClose}
      primary={
        needsProfile
          ? { title: go.finish, onPress: onFinish, testID: "go-finish" }
          : { title: go.next, onPress: onNext, loading: busy, testID: "go-next" }
      }
      secondary={{ title: go.notNow, onPress: onClose, testID: "go-not-now" }}
      testID="go-sheet"
    >
      <View className="gap-3">
        {womenOnlyOffered ? (
          <View accessibilityRole="radiogroup" className="gap-2">
            <Text variant="label" className="text-muted">
              {go.groupType.label}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Chip label={go.groupType.open} selected={groupType === "open"} onPress={() => onGroupType("open")} testID="go-open" />
              <Chip
                label={go.groupType.women_only}
                selected={groupType === "women_only"}
                onPress={() => onGroupType("women_only")}
                testID="go-women-only"
              />
            </View>
            {groupType === "women_only" ? (
              <Text variant="meta" className="text-muted">
                {go.groupType.womenOnlyHint}
              </Text>
            ) : null}
          </View>
        ) : null}
        {issue ? (
          <View accessibilityLiveRegion="polite" testID="go-issue">
            <Note icon={WarningCircle}>{issueText(issue)}</Note>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
