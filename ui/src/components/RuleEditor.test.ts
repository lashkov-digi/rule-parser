import { ChangeSet, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { replacement } from './RuleEditor';

// Applies the change to `from` and returns the text with the replaced range.
const apply = (from: string, to: string) => {
  const spec = replacement(from, to) as { from: number; to: number; insert: string };
  const text = ChangeSet.of(spec, from.length).apply(Text.of(from.split('\n'))).toString();
  return { ...spec, text };
};

describe('replacement', () => {
  it('returns nothing when the text is the same', () => {
    expect(replacement('"PK sampling":', '"PK sampling":')).toBeNull();
  });

  it('turns the old text into the new one', () => {
    const cases: Array<[string, string]> = [
      ['"PK sampling":\n  before "Vital Signs"', '"PK sampling":\n  before "Vitals"'],
      ['"A":\n  after "B"\n"C":\n  after "B"', '"A":\n  after "Bee"\n"C":\n  after "Bee"'],
      ['aa', 'aaa'],
      ['aaa', 'aa'],
      ['', 'sequence'],
      ['sequence', ''],
    ];
    for (const [from, to] of cases) expect(apply(from, to).text).toBe(to);
  });

  it('leaves the lines around a rename alone', () => {
    const header = '"PK sampling":\n';
    const footer = '\n"12-lead ECG":\n  after "PK sampling"';
    const from = `${header}  before "Vital Signs"${footer}`;
    const change = apply(from, `${header}  before "Vitals"${footer}`);
    expect(change.from).toBeGreaterThanOrEqual(header.length);
    expect(change.to).toBeLessThanOrEqual(from.length - footer.length);
  });
});
