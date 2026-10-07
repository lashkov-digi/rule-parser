// The timeline types come from the derivation library; the UI only adds the scenario wrapper.
import type { DayConfig, ParseResult } from './derivation/index.ts';

export type { Item, Minutes, TimelineResult } from './derivation/index.ts';

// One lexed token, as defined in ../../contract.md. Offsets point into the scenario text.
export type Token = { type: string; text: string; from: number; to: number };

export type Scenario = {
  id: string;
  title: string;
  text: string;
  tokens: Token[];
  parse: ParseResult; // handwritten stand-in for the parser
  config: DayConfig;
};
