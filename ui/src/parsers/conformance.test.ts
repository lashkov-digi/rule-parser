import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import type { Diagnostic, ParseResult } from '../derivation/index.ts';
import type { Scenario } from '../timeline.ts';
import { parsers } from './registry.ts';

// The same acceptance tests for every registered library: the Examples table in lexemes.md, the tokens in
// fixtures/scenarios.json and every fixtures/<name>.parse.json.
const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const examples = (JSON.parse(read('lexemes.json')) as { examples: Array<{ rule: string; text: string; tokens: string[] }> })
  .examples;
const scenarios = JSON.parse(read('fixtures/scenarios.json')) as Scenario[];
const fixtures = readdirSync(new URL('fixtures/', root))
  .filter((file) => file.endsWith('.parse.json'))
  .map((file) => file.replace(/\.parse\.json$/, ''));

// Fixtures do not compare `message`, so each library can word it as it likes.
const withoutMessages = (result: ParseResult) => ({
  ...result,
  diagnostics: result.diagnostics.map(({ message: _message, ...rest }: Diagnostic) => rest),
});

if (parsers.length === 0) test.todo('no parser registered in src/parsers/registry.ts');

for (const parser of parsers) {
  describe(parser.title, () => {
    for (const example of examples) {
      test(`tokenize ${example.rule}: ${example.text}`, () => {
        const { tokens, diagnostics } = parser.tokenize(example.text);
        assert.deepEqual(diagnostics, []);
        assert.deepEqual(
          tokens.map((token) => token.type),
          example.tokens,
        );
      });
    }

    for (const scenario of scenarios) {
      test(`tokenize scenario: ${scenario.title}`, () => {
        assert.deepEqual(parser.tokenize(scenario.text).tokens, scenario.tokens);
      });
    }

    for (const name of fixtures) {
      test(`parse fixture: ${name}`, () => {
        const text = read(`fixtures/${name}.txt`).trimEnd();
        const expected = JSON.parse(read(`fixtures/${name}.parse.json`)) as ParseResult;
        assert.deepEqual(withoutMessages(parser.parse(text)), withoutMessages(expected));
      });
    }
  });
}
