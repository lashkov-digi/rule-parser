import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { derive, type DayConfig, type ParseResult, type TimelineResult } from './index.ts';

// fixtures/<name>.parse.json stands in for the parser; <name>.items.json is the timeline worked out by hand.
const fixture = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../../../fixtures/${file}`, import.meta.url), 'utf8')) as T;

for (const name of ['product-scenario', 'anchor-scenario', 'fasting-scenario', 'legacy-day']) {
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

test('a dependency on an activity that only runs after something pairs by occurrence', () => {
  // "Pollen": before "12-lead ECG", where the ECG itself only runs after Vital Signs. Pollen inherits the ECG's 3x,
  // and each Pollen runs before the ECG with the same number.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  parse.commands.push({
    id: 'c4',
    type: 'dependency',
    subject: 'Pollen',
    count: null,
    direction: 'before',
    targets: ['12-lead ECG'],
    source: { from: 138, to: 168 },
  });
  const config = fixture<DayConfig>('product-scenario.config.json');
  config.activities.Pollen = { duration: 4 };
  const { items } = derive(parse, config);
  const runs = (name: string) =>
    items
      .filter((item) => item.kind === 'activity' && item.activities[0] === name)
      .map((item) => (item.placement.kind === 'fixed' ? item.placement.start : NaN));
  const pollen = runs('Pollen');
  const ecg = runs('12-lead ECG');
  assert.equal(pollen.length, 3);
  pollen.forEach((start, n) => assert.ok(start + 4 <= ecg[n], `Pollen ${n + 1} at ${start} ends after ECG ${n + 1} at ${ecg[n]}`));
});

test('an activity after one that joined a slot through its dependency follows it there', () => {
  // "X": after "Pollen", where Pollen runs before the ECG and so before each PK sampling. Each X runs right after its
  // Pollen, in the same slot, rather than at the end of the day.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  parse.commands.push(
    { id: 'c4', type: 'dependency', subject: 'Pollen', count: null, direction: 'before', targets: ['12-lead ECG'], source: { from: 138, to: 168 } },
    { id: 'c5', type: 'dependency', subject: 'X', count: null, direction: 'after', targets: ['Pollen'], source: { from: 169, to: 185 } },
  );
  const config = fixture<DayConfig>('product-scenario.config.json');
  config.activities.Pollen = { duration: 4 };
  config.activities.X = { duration: 3 };
  const { items } = derive(parse, config);
  const runs = (name: string) =>
    items
      .filter((item) => item.kind === 'activity' && item.activities[0] === name)
      .map((item) => (item.placement.kind === 'fixed' ? item.placement.start : NaN));
  const pollen = runs('Pollen');
  const pk = runs('PK sampling');
  const x = runs('X');
  assert.equal(x.length, 3);
  x.forEach((start, n) => {
    assert.ok(pollen[n] + 4 <= start, `X ${n + 1} at ${start} starts before Pollen ${n + 1} at ${pollen[n]} ends`);
    assert.ok(start + 3 <= pk[n], `X ${n + 1} at ${start} ends after PK sampling ${n + 1} at ${pk[n]}`);
  });
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
