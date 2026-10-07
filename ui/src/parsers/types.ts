// The interface every candidate lexer/parser library implements. Signatures come from ../../../contract.md.
import type { Diagnostic, ParseResult } from '../derivation/index.ts';
import type { Token } from '../timeline.ts';

export type TokenizeResult = { tokens: Token[]; diagnostics: Diagnostic[] };

export type RuleParser = {
  id: string; // folder name under src/parsers/
  title: string; // shown in the UI parser picker
  tokenize(text: string): TokenizeResult;
  parse(text: string): ParseResult;
};
