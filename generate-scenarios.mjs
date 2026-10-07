// Generates fixtures/scenarios.json: the product scenario (subject-first and anchor-first) and the full legacy day, with the DSL text, its tokens,
// the parse result and the day config. The UI runs derivation on them; no timeline is written here.
// Usage: node rule-parser/generate-scenarios.mjs (run generate-lexemes.mjs first)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { tokens: dictionary } = JSON.parse(readFileSync(join(here, 'lexemes.json'), 'utf8'));

// Reference lexer built from lexemes.json, only to fill in the expected tokens. Longest match wins.
const matchers = dictionary.flatMap((token) => [
  ...token.lexemes.flatMap(({ value, aliases }) => [value, ...aliases]).map((lexeme) => ({ token: token.name, lexeme })),
  ...(token.pattern ? [{ token: token.name, regex: new RegExp(`^(?:${token.pattern})`) }] : []),
]);
// Returns Token objects as defined in contract.md: { type, text, from, to }.
function tokenize(text) {
  const result = [];
  let rest = text;
  while (rest.length > 0) {
    const space = rest.match(/^[ \t]+/);
    if (space) {
      rest = rest.slice(space[0].length);
      continue;
    }
    const from = text.length - rest.length;
    let best = null;
    for (const matcher of matchers) {
      const length = matcher.regex
        ? (rest.match(matcher.regex)?.[0].length ?? 0)
        : rest.startsWith(matcher.lexeme)
          ? matcher.lexeme.length
          : 0;
      if (length > (best?.length ?? 0)) best = { token: matcher.token, length };
    }
    if (!best) throw new Error(`Cannot lex "${rest.slice(0, 20)}" in:\n${text}`);
    result.push({ type: best.token, text: rest.slice(0, best.length), from, to: from + best.length });
    rest = rest.slice(best.length);
  }
  return result;
}

const read = (file) => readFileSync(join(here, 'fixtures', file), 'utf8').trimEnd();
const json = (file) => JSON.parse(read(file));

// The parse results are handwritten stand-ins for the parser until a library is chosen.
const scenarios = [
  { name: 'product-scenario', title: 'Product scenario' },
  { name: 'anchor-scenario', title: 'Product scenario, anchor-first' },
  { name: 'legacy-day', title: 'Legacy day, full' },
].map(({ name, title }, i) => {
  const text = read(`${name}.txt`);
  return {
    id: `s${i + 1}`,
    title,
    text,
    tokens: tokenize(text),
    parse: json(`${name}.parse.json`),
    config: json(`${name}.config.json`),
  };
});

writeFileSync(join(here, 'fixtures/scenarios.json'), `${JSON.stringify(scenarios, null, 2)}\n`);
console.log(`Wrote fixtures/scenarios.json: ${scenarios.length} scenarios`);
