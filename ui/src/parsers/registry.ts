// Every library under test. The conformance test and the UI parser picker both read this list.
// To add one: copy _template/ to src/parsers/<library>/, implement it, and import it here.
import { ohmParser } from './ohm/index.ts';
import type { RuleParser } from './types.ts';

export const parsers: RuleParser[] = [ohmParser];
