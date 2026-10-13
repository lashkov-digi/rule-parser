// What the rule editor draws over the text, worked out from the parser output. Pure, so it is tested without a DOM.
import type { Diagnostic as LintDiagnostic } from '@codemirror/lint';
import type { Diagnostic } from './derivation/index.ts';
import { kindOf } from './lexemes.ts';
import type { Token } from './timeline.ts';

export type Mark = { from: number; to: number; className: string };

// One mark per token, colored by its kind. The hovered token and the tokens behind the hovered timeline row are
// lit up as well. Line breaks and empty tokens get no mark.
export function tokenMarks(tokens: Token[], active: number | null, linked: Set<number>): Mark[] {
  return tokens.flatMap((token, index) => {
    if (token.from === token.to || token.text.trim() === '') return [];
    const state = index === active ? ' active' : linked.has(index) ? ' linked' : '';
    return [{ from: token.from, to: token.to, className: `lexeme kind-${kindOf(token.type)}${state}` }];
  });
}

// The index of the token under `pos`, or null between tokens.
export function tokenAt(tokens: Token[], pos: number): number | null {
  const index = tokens.findIndex((token) => token.from <= pos && pos < token.to);
  return index === -1 ? null : index;
}

// Parser and derivation diagnostics as lint diagnostics, with the expected tokens in the message. A span past the end
// of the text is cut back to it.
export function lintDiagnostics(diagnostics: Diagnostic[], length: number): LintDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const expected = diagnostic.expected?.length ? ` Expected: ${diagnostic.expected.join(', ')}.` : '';
    return {
      from: Math.min(diagnostic.from, length),
      to: Math.min(Math.max(diagnostic.to, diagnostic.from), length),
      severity: diagnostic.severity,
      source: diagnostic.code,
      message: `${diagnostic.message}${expected}`,
    };
  });
}
