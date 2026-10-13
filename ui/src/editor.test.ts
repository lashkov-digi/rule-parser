import { describe, expect, it } from 'vitest';
import { lintDiagnostics, tokenAt, tokenMarks } from './editor.ts';
import type { Token } from './timeline.ts';

// "Vital Signs":⏎  after "PK sampling"
const tokens: Token[] = [
  { type: 'ACTIVITY', text: '"Vital Signs"', from: 0, to: 13 },
  { type: 'COLON', text: ':', from: 13, to: 14 },
  { type: 'SEP', text: '\n', from: 14, to: 15 },
  { type: 'AFTER', text: 'after', from: 17, to: 22 },
  { type: 'ACTIVITY', text: '"PK sampling"', from: 23, to: 36 },
];

describe('tokenMarks', () => {
  it('colors each token by its kind and skips line breaks', () => {
    expect(tokenMarks(tokens, null, new Set())).toEqual([
      { from: 0, to: 13, className: 'lexeme kind-string' },
      { from: 13, to: 14, className: 'lexeme kind-separator' },
      { from: 17, to: 22, className: 'lexeme kind-keyword' },
      { from: 23, to: 36, className: 'lexeme kind-string' },
    ]);
  });

  it('lights up the hovered token and the linked ones', () => {
    const classes = tokenMarks(tokens, 3, new Set([0, 3])).map((mark) => mark.className);
    expect(classes).toEqual(['lexeme kind-string linked', 'lexeme kind-separator', 'lexeme kind-keyword active', 'lexeme kind-string']);
  });
});

describe('tokenAt', () => {
  it('finds the token under a position, and nothing between tokens', () => {
    expect(tokenAt(tokens, 0)).toBe(0);
    expect(tokenAt(tokens, 12)).toBe(0);
    expect(tokenAt(tokens, 13)).toBe(1);
    expect(tokenAt(tokens, 16)).toBeNull();
    expect(tokenAt(tokens, 36)).toBeNull();
  });
});

describe('lintDiagnostics', () => {
  it('adds the expected tokens to the message', () => {
    const [diagnostic] = lintDiagnostics(
      [{ from: 17, to: 22, severity: 'error', code: 'parse', message: 'Unexpected word.', expected: ['BEFORE', 'AFTER'] }],
      36,
    );
    expect(diagnostic).toEqual({ from: 17, to: 22, severity: 'error', source: 'parse', message: 'Unexpected word. Expected: BEFORE, AFTER.' });
  });

  it('cuts a span past the end of the text back to it', () => {
    const [diagnostic] = lintDiagnostics([{ from: 30, to: 40, severity: 'warning', code: 'semantic', message: 'Unknown.' }], 36);
    expect(diagnostic).toMatchObject({ from: 30, to: 36 });
  });
});
