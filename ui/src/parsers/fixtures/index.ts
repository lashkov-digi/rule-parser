// The hand-written stand-in, wrapped as an adapter so the UI treats it like any library.
// It ignores the text it gets and always returns the scenario's tokens and parse result from scenarios.json.
// It is not in ../registry.ts, because it would fail the conformance test on any other input.
import type { Scenario } from '../../timeline.ts';
import type { RuleParser } from '../types.ts';

export const FIXTURES = 'fixtures';

export function createFixtureParser(scenario: Scenario): RuleParser {
  return {
    id: FIXTURES,
    title: 'Hand-written fixtures',
    tokenize: () => ({ tokens: scenario.tokens, diagnostics: [] }),
    parse: () => scenario.parse,
  };
}
