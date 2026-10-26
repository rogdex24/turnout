import type { Occurrence } from "../../catalog/types.js";
import type { FetchLike } from "../../utils/http.js";

/** One raw record from a source, exploded into zero or more occurrences. */
export interface FetchedItem {
  /** The source's own id for this record; used as raw_payload's dedupe key. */
  id: string;
  raw: unknown;
  occurrences: Occurrence[];
}

export interface FetchContext {
  fetchImpl?: FetchLike;
  sleepMs?: number;
  now?: () => Date;
  /** The sync run this fetch belongs to. Agent sources name their run directory after it. */
  runId?: string;
  /** The directory holding the database file. Agent sources keep their run directories under it. */
  dataDir?: string;
}

export interface SourceAdapter {
  name: string;
  /** Runs only when named in --sources, never in a default sync. For slow or costly sources such as agent harnesses. */
  optIn?: boolean;
  /** Rows are never delisted for being absent from a run; they expire by date only. For sources whose output varies run to run. */
  noDelist?: boolean;
  fetch(context: FetchContext): Promise<FetchedItem[]>;
}
