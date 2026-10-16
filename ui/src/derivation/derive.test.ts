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

test('an activity after two others waits for the later of their slots', () => {
  // The ECG runs after Vital Signs and after PK sampling. Vital Signs fill the slot before each PK sampling, so each
  // ECG waits for its PK sampling, and the first one also for the anchor, since nothing fits between the pre-dose PK
  // sampling and the IP.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  parse.commands.push({
    id: 'c4',
    type: 'dependency',
    subject: '12-lead ECG',
    count: null,
    direction: 'after',
    targets: ['PK sampling'],
    source: { from: 138, to: 168 },
  });
  const { items, diagnostics } = derive(parse, fixture<DayConfig>('product-scenario.config.json'));
  const runs = (name: string) =>
    items
      .filter((item) => item.kind === 'activity' && item.activities[0] === name)
      .map((item) => (item.placement.kind === 'fixed' ? item.placement.start : NaN));
  const [ip] = runs('IP Administration');
  const pk = runs('PK sampling');
  const ecg = runs('12-lead ECG');
  assert.deepEqual(diagnostics, []);
  assert.equal(ecg.length, 3);
  ecg.forEach((start, n) => assert.ok(pk[n] + 5 <= start, `ECG ${n + 1} at ${start} starts before PK sampling ${n + 1} at ${pk[n]} ends`));
  assert.ok(ip + 1 <= ecg[0], `ECG 1 at ${ecg[0]} starts before IP Administration at ${ip} ends`);
});

test('a post offset counts from the anchor edge, not from earlier draws', () => {
  // `4x rel "IP Administration" pre, post 1h 2h`: IP runs at T 0 for 1 min and each PK draw takes 5 min. The draws sit
  // 1h and 2h after the IP starts, or after it ends with `end`, however long the draws before them take.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  const config = fixture<DayConfig>('product-scenario.config.json');
  const draws = () => {
    const { items } = derive(parse, config);
    const start = (name: string) =>
      items
        .filter((item) => item.kind === 'activity' && item.activities[0] === name)
        .map((item) => (item.placement.kind === 'fixed' ? item.placement.start : NaN));
    const [ip] = start('IP Administration');
    return start('PK sampling').map((at) => at - ip);
  };
  assert.deepEqual(draws(), [-5, 60, 120]);
  const composite = parse.commands.find((command) => command.type === 'composite');
  assert.ok(composite?.type === 'composite');
  composite.edge = 'end';
  assert.deepEqual(draws(), [-5, 61, 121]);
});

test('a second composite on the same subject is reported and skipped, not written over the first', () => {
  // `rel "IP Administration" post 3h` under "PK sampling" again: the first composite keeps its draws.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  const composite = parse.commands.find((command) => command.type === 'composite');
  assert.ok(composite?.type === 'composite');
  parse.commands.push({ ...composite, id: 'c4', count: null, offsets: [{ kind: 'post', after: 180, window: null }], source: { from: 138, to: 168 } });
  const { items, diagnostics } = derive(parse, fixture<DayConfig>('product-scenario.config.json'));
  const start = (name: string) =>
    items
      .filter((item) => item.kind === 'activity' && item.activities[0] === name)
      .map((item) => (item.placement.kind === 'fixed' ? item.placement.start : NaN));
  const [ip] = start('IP Administration');
  assert.deepEqual(start('PK sampling').map((at) => at - ip), [-5, 60, 120]);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message === '"PK sampling" already has offsets; this rule is skipped'));
});

test('a count below the offsets of a composite is reported, not thrown', () => {
  // `2x` before `3x rel "IP Administration" pre, post 1h 2h`: the written count wins, so the third offset has no draw.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  parse.commands.unshift({ id: 'c0', type: 'count', subject: 'PK sampling', count: 2, source: { from: 15, to: 17 } });
  const { items, diagnostics } = derive(parse, fixture<DayConfig>('product-scenario.config.json'));
  assert.equal(items.filter((item) => item.activities[0] === 'PK sampling').length, 2);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message === '"PK sampling" already runs 2 times'));
});

test('an anchor that runs 0 times is reported, not thrown', () => {
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  parse.commands.push({ id: 'c4', type: 'count', subject: 'IP Administration', count: 0, source: { from: 138, to: 140 } });
  const { items, diagnostics } = derive(parse, fixture<DayConfig>('product-scenario.config.json'));
  assert.equal(items.filter((item) => item.activities[0] === 'IP Administration').length, 0);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message === '"IP Administration" never runs, so it cannot anchor the day'));
});

test('a hospitalization from an activity that runs 0 times is reported, not thrown', () => {
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  parse.commands.push(
    { id: 'c4', type: 'count', subject: 'Pollen', count: 0, source: { from: 138, to: 140 } },
    { id: 'c5', type: 'hospitalization', subject: 'Pollen', duration: 360, from: { kind: 'activity', name: 'Pollen' }, source: { from: 141, to: 165 } },
  );
  const config = fixture<DayConfig>('product-scenario.config.json');
  config.activities.Pollen = { duration: 4 };
  const { items, diagnostics } = derive(parse, config);
  assert.equal(items.filter((item) => item.kind === 'hospitalization').length, 0);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message === '"Pollen" never runs, so the hospitalization has no start'));
});

test('travel between on-site slots counts once in the day with travel', () => {
  // `sequence; "A" 15m; travel 30m; "B" 10m`: the travel sits inside the on-site span, so it adds nothing on top.
  const slot = (id: string, kind: 'activity' | 'travel', duration: number, activity: string | null) =>
    ({ id, type: 'slot', kind, activity, duration, source: { from: 0, to: 0 } }) as const;
  const parse: ParseResult = {
    version: 1,
    mode: 'sequence',
    commands: [slot('c1', 'activity', 15, 'A'), slot('c2', 'travel', 30, null), slot('c3', 'activity', 10, 'B')],
    diagnostics: [],
  };
  const { summary } = derive(parse, { activities: {}, cdtOrder: [] });
  assert.deepEqual(summary, { onSite: 55, withTravel: 55 });
});

test('an activity that is only a target is reported at the rule that names it', () => {
  // `"Pollen": after "Zap"`, with Zap missing from the catalog: the error points at that rule, not at the first one.
  const parse = fixture<ParseResult>('product-scenario.parse.json');
  const source = { from: 138, to: 160 };
  parse.commands.push({ id: 'c4', type: 'dependency', subject: 'Pollen', count: null, direction: 'after', targets: ['Zap'], source });
  const config = fixture<DayConfig>('product-scenario.config.json');
  config.activities.Pollen = { duration: 4 };
  const { diagnostics } = derive(parse, config);
  const missing = diagnostics.find((diagnostic) => diagnostic.message === '"Zap" is not in the activity catalog');
  assert.deepEqual(missing && { from: missing.from, to: missing.to }, source);
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
