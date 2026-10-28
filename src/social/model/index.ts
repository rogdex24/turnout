/**
 * Pure product rules: what a person, a show and a group have to look like. No database, no I/O, no clock
 * reads (time comes in as an argument). The DB layer in `src/social` and the HTTP layer in `src/app-api` call these;
 * `src/web` may import `eligibility.ts` and `tunables.ts` only.
 */

export * from "./eligibility.js";
export * from "./feedback.js";
export * from "./grouping.js";
export * from "./groupLoss.js";
export * from "./matchable.js";
export * from "./phone.js";
export * from "./planState.js";
export * from "./schedule.js";
export * from "./threadWindow.js";
export * from "./tunables.js";
