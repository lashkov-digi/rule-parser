import { block, type Draft } from './block.ts';
import type { Command } from './types.ts';

// Sequence mode is literal: each slot starts when the previous one ends. No rules, no placement decisions,
// and no anchor: a legacy day only knows its order and durations.
export function deriveSequence(commands: Command[]): Draft {
  const draft: Draft = { blocks: [], anchorAt: null, diagnostics: [] };
  let at = 0;
  for (const command of commands) {
    if (command.type !== 'slot') {
      draft.diagnostics.push({
        ...command.source,
        severity: 'error',
        code: 'semantic',
        message: `A ${command.type} rule cannot appear in sequence mode`,
      });
      continue;
    }
    draft.blocks.push(
      block({
        kind: command.kind,
        activities: command.activity ? [command.activity] : [],
        start: at,
        duration: command.duration,
        commandIds: [command.id],
      }),
    );
    at += command.duration;
  }
  return draft;
}
