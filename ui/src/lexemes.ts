// The token vocabulary from ../../lexemes.json, looked up by token type.
import lexemes from '../../lexemes.json';

export type Kind = 'literal' | 'string' | 'keyword' | 'operator' | 'separator';

export const dictionary = new Map(lexemes.tokens.map((token) => [token.name, token as { kind: Kind; lexemes: Array<{ value: string }>; description: string }]));

// A type lexemes.json does not list, such as an unknown word, reads as a literal.
export const kindOf = (type: string): Kind => dictionary.get(type)?.kind ?? 'literal';
