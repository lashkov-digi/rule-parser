import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { contextAt } from './completion.ts';
import { ruleLanguage } from './parsers/lezer/language.ts';

// The context at the | in `text`.
const at = (text: string) => {
  const pos = text.indexOf('|');
  const state = EditorState.create({ doc: text.slice(0, pos) + text.slice(pos + 1), extensions: [ruleLanguage] });
  return contextAt(state, pos);
};
const STARTERS = ['BEFORE', 'AFTER', 'REL', 'STATE', 'TRAVEL', 'HOSP'];

describe('contextAt', () => {
  it('offers the activities after a direction, without the subject', () => {
    expect(at('"Vital Signs":\n  before |')).toEqual({ from: 24, keywords: [], activities: { exclude: ['Vital Signs'], header: false } });
  });

  it('leaves out the targets already listed', () => {
    expect(at('"Vital Signs":\n  before "PK sampling", |')?.activities?.exclude).toEqual(['Vital Signs', 'PK sampling']);
  });

  it('takes the subject from a header on the same line', () => {
    expect(at('"Vital Signs": after |')?.activities?.exclude).toEqual(['Vital Signs']);
  });

  it('starts a statement on an indented line, from the word being typed', () => {
    expect(at('"A":\n  bef|')).toEqual({ from: 7, keywords: STARTERS, activities: null });
    expect(at('"A": |')?.keywords).toEqual(STARTERS);
  });

  it('follows a count with a qualifier, a direction or rel', () => {
    expect(at('"A":\n  3x |')?.keywords).toEqual(['QUALIFIER', 'BEFORE', 'AFTER', 'REL']);
  });

  it('walks a composite: anchor, then edge, occurrence and offsets', () => {
    expect(at('"A":\n  rel |')).toMatchObject({ keywords: ['DAY_ANCHOR'], activities: { exclude: ['A'], header: false } });
    expect(at('"A":\n  rel "IP" |')?.keywords).toEqual(['EDGE', 'OCCURRENCE', 'PRE', 'POST']);
    expect(at('"A":\n  rel "IP" start |')?.keywords).toEqual(['OCCURRENCE', 'PRE', 'POST']);
    expect(at('"A":\n  rel "IP" each |')?.keywords).toEqual(['PRE', 'POST']);
    expect(at('"A":\n  rel "IP" pre, |')?.keywords).toEqual(['PRE', 'POST']);
    expect(at('"A":\n  rel "IP" post |')).toBeNull();
  });

  it('follows a wait, a hospitalization and a travel with their own keywords', () => {
    expect(at('"A":\n  wait 10m |')?.keywords).toEqual(['BEFORE', 'AFTER']);
    expect(at('"A":\n  wait 10m before |')).toBeNull();
    expect(at('"A":\n  hosp 8h |')?.keywords).toEqual(['FROM']);
    expect(at('"A":\n  hosp 8h from |')).toMatchObject({ keywords: ['DAY_ANCHOR'], activities: { exclude: [] } });
    expect(at('"A":\n  travel 1h |')?.keywords).toEqual(['BEFORE', 'RETURN']);
    expect(at('"A":\n  travel 1h before |')).toMatchObject({ keywords: ['ADMISSION'], activities: { exclude: [] } });
    expect(at('"A":\n  travel 1h return |')?.keywords).toEqual(['RETURN_MODE']);
  });

  it('starts a header on an unindented line', () => {
    expect(at('|')).toEqual({ from: 0, keywords: ['ANCHOR', 'SEQUENCE'], activities: { exclude: [], header: true } });
    expect(at('"A":\n  before "B"\n|')).toMatchObject({ keywords: ['ANCHOR'], activities: { header: true } });
    expect(at('anchor |')).toEqual({ from: 7, keywords: [], activities: { exclude: [], header: true } });
  });

  it('offers slots in sequence mode', () => {
    expect(at('sequence\n|')).toEqual({ from: 9, keywords: ['STATE', 'TRAVEL'], activities: { exclude: [], header: false } });
    expect(at('sequence\n"A" |')).toBeNull();
  });

  it('reads the context of a quote from the tokens before it', () => {
    expect(at('"Vital Signs":\n  before "PK sampling", |"Vi')?.activities?.exclude).toEqual(['Vital Signs', 'PK sampling']);
  });

  it('offers nothing where only a value or punctuation fits', () => {
    expect(at('"A":\n  before "B"|')).toBeNull();
    expect(at('"A":\n  3x exactly |')).toBeNull();
  });
});
