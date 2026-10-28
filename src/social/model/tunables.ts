import type { NoticeKind } from "@turnout/contract/app/notices";

/**
 * Every number the product rules and the rate limits turn on, in one place. Defaults match the plan (section 2);
 * a test or an operator can pass `tunables({ ... })` overrides. Pure data: no I/O.
 */

/** How long a rate rule counts for. `ist_day` is the Asia/Kolkata calendar day. */
export type RateWindow = { seconds: number } | "ist_day";

export interface RateRule {
  limit: number;
  window: RateWindow;
}

export interface Tunables {
  /** Cheapest ticket (INR) a show can have to be eligible for a group. */
  minPriceInr: number;
  /** A show is joinable until this many hours before it starts. */
  joinCutoffHours: number;
  /** Categories a group can be made for. */
  eligibleCategories: readonly string[];
  groupSize: { min: number; max: number /** After a locked group loses people. */; lockedMin: number };
  /** Cap per gender category in an open group, by group size. */
  genderCaps: Readonly<Record<number, number>>;
  /** The morning-after notice goes out at this hour (IST) the day after the show. */
  morningAfterHourIst: number;
  feedbackWindowHours: number;
  otp: {
    /** Digits in the code. */
    digits: number;
    expiresMinutes: number;
    maxAttempts: number;
    /** Wrong codes the store-review number may send in an IST day. Past this, its verifies are refused until the day ends, right code or not. */
    reviewerFailCapPerDay: number;
    /** After "I didn't request a code", this number gets no code for this many hours. */
    notRequestedBlockHours: number;
    /** Sends per IST day across everyone. The `OTP_DAILY_CAP` env var overrides it. */
    dailyCap: number;
    /** What one WhatsApp authentication message costs (INR, with GST), for the spend alerts. */
    priceInr: number;
    /** Monthly spend (INR) at which the operator is alerted. */
    spendAlertsInr: readonly number[];
  };
  session: {
    accessMinutes: number;
    refreshDays: number;
    /** Rotated and revoked rows stay this long so a reused token can be recognised. */
    revokedRetentionDays: number;
    /** A refresh token traded in this recently, whose replacement is still unused, is a retry and not a replay. */
    refreshGraceSeconds: number;
  };
  /** Minutes around a show's start, and hours around the lock, for each milestone. All counted from the show's start unless said. */
  plan: {
    /** The meet card goes live and co-members are revealed this many hours before the start (T-3h). */
    revealHoursBefore: number;
    /** The group and its co-members stop being served this many hours after the start (24 now; the feedback work may move it to 72). */
    revealCloseHours: number;
    /** The group meets this many minutes before the start. */
    meetMinutesBefore: number;
    /** The thread turns read-only this many hours after the start. */
    threadCloseHoursAfterStart: number;
    /** The "head over" notice goes out this many minutes before the start, and check-in opens then. */
    headOverMinutes: number;
    /** Check-in stays open this many minutes after the start. */
    checkInCloseMinutes: number;
    /** An unanswered rejected ticket file is deleted this many hours after the rejection. */
    rejectedTicketDeleteHours: number;
    /** Ticket files are deleted this many hours after the show starts, at the latest. */
    ticketDeleteHoursAfterStart: number;
    /** The operator is alerted when a pending handle belongs to a plan whose lock is this close. */
    handleAlertHours: number;
    /** Alert the operator about a missing cafe this many hours before the start (the second one, after the lock). */
    cafeAlertHoursBefore: number;
  };
  ticker: {
    intervalSeconds: number;
    leaseSeconds: number;
    /** Expo push receipts are read this many minutes after the send. */
    receiptDelayMinutes: number;
  };
  /** A notice older than this many minutes is listed but no longer pushed. */
  noticeStaleMinutes: Readonly<Record<NoticeKind, number>>;
  /** `notice` and `push_delivery` rows are deleted after this many days. */
  noticeRetentionDays: number;
  fileLinkMinutes: number;
  /** A profile photo with more pixels than this is refused before it is decoded. */
  photoMaxPixels: number;
  rate: {
    otpPerPhoneShort: RateRule;
    otpPerPhoneDay: RateRule;
    otpPerIpMinute: RateRule;
    otpPerIpDay: RateRule;
    /** Every ticket upload counts, good or bad, taken before the body is read, so a flood of bad files costs almost nothing. */
    ticketAttemptPerMemberHour: RateRule;
    /** A device registers once when the app opens, so this only stops a loop. */
    deviceRegisterPerMemberHour: RateRule;
    ticketUploadPerPlanHour: RateRule;
    ticketUploadPerMemberDay: RateRule;
    reportPerDay: RateRule;
    messagesPerMinute: RateRule;
    planCreatePerDay: RateRule;
    handleSubmitPerDay: RateRule;
    photoUploadPerMemberDay: RateRule;
  };
}

export const DEFAULT_TUNABLES: Tunables = {
  minPriceInr: 499,
  joinCutoffHours: 24,
  eligibleCategories: ["comedy", "music", "theatre"],
  groupSize: { min: 4, max: 6, lockedMin: 3 },
  genderCaps: { 4: 3, 5: 3, 6: 4 },
  morningAfterHourIst: 10,
  feedbackWindowHours: 72,
  otp: {
    digits: 6,
    expiresMinutes: 10,
    maxAttempts: 5,
    reviewerFailCapPerDay: 20,
    notRequestedBlockHours: 24,
    dailyCap: 200,
    priceInr: 0.136,
    spendAlertsInr: [500, 1000, 1500],
  },
  session: { accessMinutes: 15, refreshDays: 30, revokedRetentionDays: 7, refreshGraceSeconds: 30 },
  plan: {
    revealHoursBefore: 3,
    revealCloseHours: 24,
    meetMinutesBefore: 60,
    threadCloseHoursAfterStart: 24,
    headOverMinutes: 90,
    checkInCloseMinutes: 60,
    rejectedTicketDeleteHours: 24,
    ticketDeleteHoursAfterStart: 24,
    handleAlertHours: 12,
    cafeAlertHoursBefore: 6,
  },
  ticker: { intervalSeconds: 30, leaseSeconds: 60, receiptDelayMinutes: 15 },
  noticeStaleMinutes: {
    ticket_approved: 6 * 60,
    ticket_rejected: 6 * 60,
    handle_rejected: 24 * 60,
    group_confirmed: 2 * 60,
    group_changed: 2 * 60,
    group_smaller: 2 * 60,
    group_called_off: 2 * 60,
    no_group: 6 * 60,
    meet_card_live: 60,
    head_over: 20,
    thread_message: 30,
    morning_after: 12 * 60,
  },
  noticeRetentionDays: 30,
  fileLinkMinutes: 5,
  photoMaxPixels: 40_000_000,
  rate: {
    otpPerPhoneShort: { limit: 3, window: { seconds: 15 * 60 } },
    otpPerPhoneDay: { limit: 10, window: "ist_day" },
    otpPerIpMinute: { limit: 5, window: { seconds: 60 } },
    otpPerIpDay: { limit: 30, window: "ist_day" },
    ticketAttemptPerMemberHour: { limit: 60, window: { seconds: 60 * 60 } },
    deviceRegisterPerMemberHour: { limit: 20, window: { seconds: 60 * 60 } },
    ticketUploadPerPlanHour: { limit: 5, window: { seconds: 60 * 60 } },
    ticketUploadPerMemberDay: { limit: 20, window: "ist_day" },
    reportPerDay: { limit: 5, window: "ist_day" },
    messagesPerMinute: { limit: 30, window: { seconds: 60 } },
    planCreatePerDay: { limit: 10, window: "ist_day" },
    handleSubmitPerDay: { limit: 3, window: "ist_day" },
    photoUploadPerMemberDay: { limit: 10, window: "ist_day" },
  },
};

/** The defaults with some values replaced. Nested groups merge one level deep. */
export function tunables(overrides: DeepPartial<Tunables> = {}): Tunables {
  const base = DEFAULT_TUNABLES;
  return {
    ...base,
    ...(overrides as Partial<Tunables>),
    groupSize: { ...base.groupSize, ...overrides.groupSize },
    otp: { ...base.otp, ...(overrides.otp as Partial<Tunables["otp"]>) },
    session: { ...base.session, ...overrides.session },
    plan: { ...base.plan, ...overrides.plan },
    ticker: { ...base.ticker, ...overrides.ticker },
    noticeStaleMinutes: { ...base.noticeStaleMinutes, ...(overrides.noticeStaleMinutes as Partial<Tunables["noticeStaleMinutes"]>) },
    rate: { ...base.rate, ...(overrides.rate as Partial<Tunables["rate"]>) },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends readonly unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
