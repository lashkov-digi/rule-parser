import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { derive, type DayConfig, type ParseResult, type TimelineResult } from './index.ts';

// fixtures/<name>.parse.json stands in for the parser; <name>.items.json is the timeline worked out by hand.
const fixture = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../../../fixtures/${file}`, import.meta.url), 'utf8')) as T;

for (const name of ['product-scenario', 'anchor-scenario', 'legacy-day']) {
  test(`${name}: derived timeline matches the expected items`, () => {
    const parse = fixture<ParseResult>(`${name}.parse.json`);
    const config = fixture<DayConfig>(`${name}.config.json`);
    assert.deepEqual(derive(parse, config), fixture<TimelineResult>(`${name}.items.json`));
  });
}

test('a dependency with a written count does not inherit', () => {
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  const ecg = parse.commands.find((command) => command.id === 'c3');
  assert.ok(ecg?.type === 'dependency');
  ecg.count = 1;
  const result = derive(parse, fixture<DayConfig>('product-scenario.config.json'));
  assert.equal(result.items.filter((item) => item.activities[0] === '12-lead ECG').length, 1);
});

test('an activity missing from the catalog is reported, not thrown', () => {
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  const config = fixture<DayConfig>('product-scenario.config.json');
  delete config.activities['12-lead ECG'];
  const { diagnostics } = derive(parse, config);
  assert.deepEqual(
    diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.message]),
    [['error', '"12-lead ECG" is not in the activity catalog']],
  );
});
