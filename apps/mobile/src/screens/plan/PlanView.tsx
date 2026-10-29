import type { Plan } from "@turnout/contract/app/plans";
import { ChatCircle, Info, SignOut, Ticket } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { after as afterCopy } from "@/copy/after";
import { plan as copy } from "@/copy/plan";
import { ticket as ticketCopy } from "@/copy/ticket";
import type { GroupFacts } from "@/model/groupFacts";
import { assertNever, isTerminal } from "@/model/plan";
import { planStatus } from "@/model/planStatus";
import { planSteps } from "@/model/planSteps";
import { isRevealed, istClock, istWhen, revealFor } from "@/model/planTime";
import { BackBar } from "@/ui/BackBar";
import { OfflineBar } from "@/ui/OfflineBar";
import { Poster } from "@/ui/Poster";
import { Button } from "@/ui/primitives/Button";
import { Icon } from "@/ui/primitives/Icon";
import { Note } from "@/ui/primitives/Note";
import { dimOnPress } from "@/ui/primitives/press";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";
import { Text } from "@/ui/primitives/Text";
import { PlanSteps } from "./PlanSteps";
import { RevealCount } from "./RevealCount";

export interface PlanViewProps {
  plan: Plan;
  /** Size, times and whether the group is smaller than usual. Never names: the plan page has no way to be given them. */
  facts: GroupFacts | null;
  /** The clock, in epoch ms. */
  now: number;
  /** How many people with tickets are looking for a group on this show. Null when not known. */
  lookingCount?: number | null;
  offline?: boolean;
  onBack: () => void;
  onAddTicket: () => void;
  onOpenMeetCard: () => void;
  /** Opens the after-the-show screen of the group (A20). */
  onOpenAfter: () => void;
  onLeave: () => void;
  onFindShow: () => void;
  onChangeHandle: () => void;
}

/** The sentence for a plan's reason, or null when the reason is not one of this state's. */
function reasonText(table: Readonly<Record<string, string>>, reason: string | null): string | null {
  return reason !== null && Object.hasOwn(table, reason) ? (table[reason] ?? null) : null;
}

function Title({ children }: { children: string }) {
  return (
    <Text variant="title-large" accessibilityRole="header">
      {children}
    </Text>
  );
}

function Body({ children }: { children: string }) {
  return (
    <Text variant="body" className="text-muted">
      {children}
    </Text>
  );
}

interface Dock {
  primary: { title: string; onPress: () => void; testID: string };
  secondary?: { title: string; onPress: () => void; testID: string };
}

/** What the card says for the plan's state, and the one thing the person can do next. Every state is a case, so a new one fails the build. */
function stateCard(props: PlanViewProps): { card: ReactNode; dock: Dock | null } {
  const { plan, facts, now } = props;
  const state = plan.state;
  switch (state) {
    case "needs_ticket":
      return {
        card: (
          <>
            <Title>{copy.needsTicket.title}</Title>
            <Body>{copy.needsTicket.body}</Body>
          </>
        ),
        dock: { primary: { title: copy.needsTicket.action, onPress: props.onAddTicket, testID: "plan-add-ticket" } },
      };
    case "checking_ticket":
      return {
        card: (
          <>
            <Title>{copy.checking.title}</Title>
            <Body>{copy.checking.body}</Body>
          </>
        ),
        dock: null,
      };
    case "ticket_rejected": {
      const reason = plan.ticket?.rejectReason;
      return {
        card: (
          <>
            <Title>{copy.rejected.title}</Title>
            <Note icon={Info}>{reason ? ticketCopy.rejected.reasons[reason] : copy.rejected.unknown}</Note>
          </>
        ),
        dock: { primary: { title: copy.rejected.action, onPress: props.onAddTicket, testID: "plan-send-another" } },
      };
    }
    case "finding_group":
      return {
        card: (
          <>
            <Title>{copy.finding.title}</Title>
            <Body>{props.lookingCount ? copy.finding.looking(props.lookingCount) : copy.finding.none}</Body>
            <Body>{copy.finding.setBy(istWhen(plan.joinUntil))}</Body>
          </>
        ),
        dock: null,
      };
    case "group_confirmed": {
      const revealAt = facts?.revealAt ?? revealFor(plan.show.startsAt);
      const open = revealAt !== null && isRevealed(new Date(now), revealAt);
      const when = revealAt && !open ? istClock(revealAt, new Date(now)) : null;
      return {
        card: (
          <>
            <Title>{copy.confirmed.title}</Title>
            <Body>{open ? copy.confirmed.bodyAfter : when ? copy.confirmed.body(when) : copy.confirmed.bodyAfter}</Body>
            {facts ? <RevealCount others={facts.others} revealAt={when} /> : null}
            {facts?.belowPlan ? <Note icon={Info}>{copy.confirmed.smaller(facts.size)}</Note> : null}
            {facts?.meetAt ? <Body>{copy.confirmed.meetAround(istClock(facts.meetAt, new Date(now)))}</Body> : null}
          </>
        ),
        dock: null,
      };
    }
    case "meet_card_live":
      return {
        card: (
          <>
            <Title>{copy.live.title}</Title>
            <Body>{copy.live.body}</Body>
            {facts?.belowPlan ? <Note icon={Info}>{copy.confirmed.smaller(facts.size)}</Note> : null}
          </>
        ),
        dock: { primary: { title: copy.live.action, onPress: props.onOpenMeetCard, testID: "plan-open-meet" } },
      };
    case "no_group": {
      const closed = planStatus(plan).key === "closed";
      const body = reasonText(copy.noGroup.reasons, plan.reason) ?? copy.noGroup.unknown;
      const find = { title: copy.noGroup.findAnother, onPress: props.onFindShow, testID: "plan-find-show" };
      return {
        card: (
          <>
            <Text variant="label" className="text-muted">
              {closed ? copy.noGroup.closedPill : copy.noGroup.pill}
            </Text>
            <Title>{copy.noGroup.title}</Title>
            <Note icon={Info}>{body}</Note>
          </>
        ),
        dock:
          plan.reason === "handle_rejected"
            ? {
                primary: { title: copy.noGroup.changeHandle, onPress: props.onChangeHandle, testID: "plan-change-handle" },
                secondary: find,
              }
            : { primary: find },
      };
    }
    case "withdrawn": {
      return {
        card: (
          <>
            <Title>{copy.withdrawn.title}</Title>
            <Body>{reasonText(copy.withdrawn.reasons, plan.reason) ?? copy.withdrawn.reasons.cancelled}</Body>
          </>
        ),
        dock: { primary: { title: copy.withdrawn.findAnother, onPress: props.onFindShow, testID: "plan-find-show" } },
      };
    }
    case "done":
      return {
        card: (
          <>
            <Title>{copy.done.title}</Title>
            <Body>{facts && facts.others > 0 ? copy.done.withGroup(facts.others) : copy.done.alone}</Body>
          </>
        ),
        dock: plan.group ? { primary: { title: afterCopy.open, onPress: props.onOpenAfter, testID: "plan-open-after" } } : null,
      };
    default:
      return assertNever(state);
  }
}

function InfoRow({ icon, title, sub, testID }: { icon: typeof Ticket; title: string; sub?: string; testID: string }) {
  return (
    <View
      accessible
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      className="flex-row items-center gap-3 px-4 py-3"
      testID={testID}
    >
      <Icon icon={icon} tone="muted" />
      <Text variant="control" className="flex-1 font-semibold">
        {title}
      </Text>
      {sub ? (
        <Text variant="meta" className="text-muted">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function ticketSub(plan: Plan): string | undefined {
  switch (plan.ticket?.state) {
    case "pending":
      return copy.rows.ticketChecking;
    case "rejected":
      return copy.rows.ticketRejected;
    case "approved":
      return plan.state === "no_group" || plan.state === "withdrawn" ? copy.rows.ticketStill : copy.rows.ticketAccepted;
    default:
      return undefined;
  }
}

function chatSub(plan: Plan, facts: GroupFacts | null, now: number): string | undefined {
  if (plan.state === "done") return copy.rows.chatClosed;
  if (plan.state === "group_confirmed" && facts) return copy.rows.chatOpens(istClock(facts.revealAt, new Date(now)));
  return undefined;
}

/**
 * One plan: the show, a three step bar, a card for where the plan stands, and a few rows. Before the names open the card shows the
 * size of the group and the reveal time and nothing else; the meet card is where people are shown. Nothing here is red.
 */
export function PlanView(props: PlanViewProps) {
  const { plan, facts, now, offline = false } = props;
  const steps = planSteps(plan);
  const { card, dock } = stateCard(props);
  const hasGroup = plan.group !== null && !isTerminal(plan.state);
  const hasTicket = plan.ticket !== null;
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="plan">
      <BackBar onBack={props.onBack} />
      {offline ? <OfflineBar /> : null}
      <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-6">
        <View className="flex-row items-center gap-3 px-4">
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <Poster variant="thumb" title={plan.show.title} category="other" />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="title-large" accessibilityRole="header" numberOfLines={2}>
              {plan.show.title}
            </Text>
            <Text variant="meta" tabular className="text-muted">
              {istWhen(plan.show.startsAt)}
            </Text>
            <Text variant="meta" className="text-muted">
              {plan.show.venueName}
            </Text>
          </View>
        </View>
        <View className="mx-4 gap-4 rounded-card border border-line bg-surface p-4" testID="plan-status">
          {steps ? <PlanSteps steps={steps} /> : null}
          {card}
        </View>
        <View>
          {hasGroup ? <InfoRow icon={ChatCircle} title={copy.rows.chat} sub={chatSub(plan, facts, now)} testID="plan-row-chat" /> : null}
          {hasTicket ? <InfoRow icon={Ticket} title={copy.rows.ticket} sub={ticketSub(plan)} testID="plan-row-ticket" /> : null}
          {isTerminal(plan.state) ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.rows.leave}
              onPress={props.onLeave}
              testID="plan-leave"
              className="min-h-14 flex-row items-center gap-3 px-4 py-3"
              style={dimOnPress}
            >
              <Icon icon={SignOut} tone="muted" />
              <Text variant="control" className="flex-1 font-semibold">
                {copy.rows.leave}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      {dock ? (
        <View className="gap-3 border-t border-line bg-bg px-4 pb-4 pt-3" testID="plan-dock">
          <Button title={dock.primary.title} onPress={dock.primary.onPress} testID={dock.primary.testID} />
          {dock.secondary ? (
            <Button variant="secondary" title={dock.secondary.title} onPress={dock.secondary.onPress} testID={dock.secondary.testID} />
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
