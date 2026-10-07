// Derivation: parsed commands + day configuration -> timeline items.
// It does not depend on any lexer/parser library; every candidate parser feeds the same derive().
import { finish } from './finish.ts';
import { deriveRules } from './rules.ts';
import { deriveSequence } from './sequence.ts';
import type { DayConfig, ParseResult, TimelineResult } from './types.ts';

export type * from './types.ts';

export function derive(parse: ParseResult, config: DayConfig): TimelineResult {
  const draft = parse.mode === 'sequence' ? deriveSequence(parse.commands) : deriveRules(parse.commands, config);
  return finish(draft, config);
}
