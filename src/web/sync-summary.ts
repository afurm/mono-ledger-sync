import type { SyncRun } from "./api-types.js";

export interface SyncRunSummaryStats {
  runs: number;
  apiCalls: number;
  windowsFetched: number;
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
  rateLimited: number;
}

export function summarizeSyncRuns(
  runs: readonly SyncRun[],
): SyncRunSummaryStats {
  return runs.reduce<SyncRunSummaryStats>(
    (summary, run) => ({
      runs: summary.runs + 1,
      apiCalls: summary.apiCalls + run.apiCalls,
      windowsFetched: summary.windowsFetched + run.windowsFetched,
      itemsSeen: summary.itemsSeen + run.itemsSeen,
      itemsInserted: summary.itemsInserted + run.itemsInserted,
      itemsUpdated: summary.itemsUpdated + run.itemsUpdated,
      itemsSkipped: summary.itemsSkipped + run.itemsSkipped,
      rateLimited: summary.rateLimited + run.rateLimited,
    }),
    {
      runs: 0,
      apiCalls: 0,
      windowsFetched: 0,
      itemsSeen: 0,
      itemsInserted: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      rateLimited: 0,
    },
  );
}
