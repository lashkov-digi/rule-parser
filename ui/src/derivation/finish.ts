import { block, type Block, type Draft } from './block.ts';
import type { DayConfig, Item, TimelineResult } from './types.ts';

const onSite = (b: Block) => b.kind === 'activity' || b.kind === 'wait' || b.kind === 'hospitalization';

/*
 * Shared last step for both modes:
 * - idle time between on-site blocks becomes a wait flagged derived-wait
 * - the day is shifted so the first on-site block starts at 0 (arrival on site)
 * - occurrences, gaps and the summary are computed here, so the UI only draws
 */
export function finish(draft: Draft, config: DayConfig): TimelineResult {
  const cdt = (b: Block) => {
    const index = b.activities[0] === undefined ? -1 : config.cdtOrder.indexOf(b.activities[0]);
    return index === -1 ? config.cdtOrder.length : index;
  };
  const sorted = [...draft.blocks].sort((a, b) => a.start - b.start || cdt(a) - cdt(b));

  const filled: Block[] = [];
  let busyUntil: number | null = null;
  for (const current of sorted) {
    if (current.kind === 'activity' || current.kind === 'wait') {
      if (busyUntil !== null && current.start > busyUntil) {
        filled.push(block({ kind: 'wait', start: busyUntil, duration: current.start - busyUntil, flags: ['derived-wait'] }));
      }
      busyUntil = Math.max(busyUntil ?? -Infinity, current.start + current.duration);
    }
    filled.push(current);
  }

  const present = filled.filter(onSite);
  const dayStart = present.length > 0 ? Math.min(...present.map((b) => b.start)) : 0;
  const dayEnd = present.length > 0 ? Math.max(...present.map((b) => b.start + b.duration)) : 0;
  const travel = filled.filter((b) => b.kind === 'travel').reduce((sum, b) => sum + b.duration, 0);

  const totals = new Map<string, number>();
  for (const b of filled) if (b.activities.length === 1) totals.set(b.activities[0], (totals.get(b.activities[0]) ?? 0) + 1);
  const seen = new Map<string, number>();

  const items: Item[] = filled.map((b, i) => {
    const name = b.activities.length === 1 ? b.activities[0] : null;
    const n = name === null ? 0 : (seen.get(name) ?? 0) + 1;
    if (name !== null) seen.set(name, n);
    const previous = filled.slice(0, i).filter((other) => other.kind === 'activity' || other.kind === 'wait' || other.kind === 'travel');
    const gap =
      b.kind === 'activity' && previous.length > 0 ? b.start - Math.max(...previous.map((other) => other.start + other.duration)) : null;
    return {
      id: `i${i + 1}`,
      kind: b.kind,
      activities: b.activities,
      occurrence: name !== null && (totals.get(name) ?? 0) > 1 ? { n, of: totals.get(name)! } : null,
      together: null,
      placement: { kind: 'fixed', start: b.start - dayStart },
      duration: b.duration,
      gap,
      isAnchor: b.isAnchor,
      window: b.window,
      commandIds: b.commandIds,
      flags: b.flags,
    };
  });

  return {
    version: 1,
    anchorAt: draft.anchorAt === null ? null : draft.anchorAt - dayStart,
    items,
    summary: { onSite: dayEnd - dayStart, withTravel: dayEnd - dayStart + travel },
    diagnostics: draft.diagnostics,
  };
}
