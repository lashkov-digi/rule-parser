// Starting point for a library adapter. Copy this folder to src/parsers/<library>/ and register it in ../registry.ts.
import type { RuleParser } from '../types.ts';

export const templateParser: RuleParser = {
  id: 'template',
  title: 'Template',
  tokenize() {
    throw new Error('tokenize is not implemented');
  },
  parse() {
    throw new Error('parse is not implemented');
  },
};
