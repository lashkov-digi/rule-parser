// The rule grammar as a CodeMirror language, so the editor keeps a syntax tree of the text as it is typed.
import { LRLanguage } from '@codemirror/language';
import { parser } from './rules.grammar';

export const ruleLanguage = LRLanguage.define({ name: 'rules', parser });
