import type { Occurrence } from "../../catalog/types.js";
import { agentSource } from "../agent/agentSource.js";
import { HARNESSES } from "../agent/harness.js";
import * as allEvents from "./allEvents.js";
import * as bookmyshow from "./bookmyshow.js";
import { type FetchAllOptions, fetchAllEvents as fetchCommunitie, normalizeEvent } from "./communitie.js";
import * as district from "./district.js";
import * as growezy from "./growezy.js";
import * as luma from "./luma.js";
import * as meraEvents from "./meraEvents.js";
import * as townscript from "./townscript.js";
import type { FetchContext, FetchedItem, SourceAdapter } from "./types.js";

/** Wraps a source module's (fetchAllEvents, explode) pair as an adapter. */
function adapter<T extends { id: string }>(
  name: string,
  fetchAll: (options: FetchAllOptions) => Promise<T[]>,
  explode: (raw: T, at: Date) => Occurrence[],
): SourceAdapter {
  return {
    name,
    async fetch({ fetchImpl, sleepMs, now }: FetchContext): Promise<FetchedItem[]> {
      const rawEvents = await fetchAll({ fetchImpl, sleepMs });
      const at = now?.() ?? new Date();
      return rawEvents.map((raw) => ({ id: raw.id, raw, occurrences: explode(raw, at) }));
    },
  };
}

/** Most sources yield at most one occurrence per raw record; BookMyShow explodes into many. */
function one<T>(toOccurrence: (raw: T, at: Date) => Occurrence | null) {
  return (raw: T, at: Date): Occurrence[] => {
    const occurrence = toOccurrence(raw, at);
    return occurrence ? [occurrence] : [];
  };
}

/** Tier A adapters run every sync, in this order. See data-model.md section 6. */
export const SOURCE_ADAPTERS: SourceAdapter[] = [
  adapter("communitie", fetchCommunitie, (raw) => normalizeEvent(raw)),
  adapter(district.SOURCE_NAME, district.fetchAllEvents, one(district.toOccurrence)),
  adapter(allEvents.SOURCE_NAME, allEvents.fetchAllEvents, one(allEvents.toOccurrence)),
  adapter(luma.SOURCE_NAME, luma.fetchAllEvents, one(luma.toOccurrence)),
  adapter(townscript.SOURCE_NAME, townscript.fetchAllEvents, one(townscript.toOccurrence)),
  adapter(meraEvents.SOURCE_NAME, meraEvents.fetchAllEvents, one(meraEvents.toOccurrence)),
  adapter(bookmyshow.SOURCE_NAME, bookmyshow.fetchAllEvents, bookmyshow.toOccurrences),
  adapter(growezy.SOURCE_NAME, growezy.fetchAllEvents, growezy.toOccurrences),
  // Opt-in: run only when named, e.g. --sources agent:grok.
  ...Object.values(HARNESSES).map((harness) => agentSource(harness)),
];
