import type { Diagnostic, Flag, Item, Minutes } from './types.ts';

// What the mode-specific steps produce: placed blocks on a relative clock. finish() turns them into items.
export type Block = {
  kind: Item['kind'];
  activities: string[];
  start: Minutes; // relative; finish() shifts the day so the first on-site block starts at 0
  duration: Minutes;
  isAnchor: boolean;
  window: Item['window'];
  commandIds: string[];
  flags: Flag[];
};

export type Draft = {
  blocks: Block[];
  anchorAt: Minutes | null; // relative, same clock as the blocks; null when the day has no anchor
  diagnostics: Diagnostic[];
};

export const block = (fields: Pick<Block, 'kind' | 'start' | 'duration'> & Partial<Block>): Block => ({
  activities: [],
  isAnchor: false,
  window: null,
  commandIds: [],
  flags: [],
  ...fields,
});
