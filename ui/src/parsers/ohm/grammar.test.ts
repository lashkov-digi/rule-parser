import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import grammar from './grammar.ohm-bundle.js';

// The adapter runs the generated bundle, not grammar.ohm. Run `npm run generate:ohm` after editing the grammar.
test('grammar.ohm-bundle.js is generated from the current grammar.ohm', () => {
  const source = readFileSync(new URL('grammar.ohm', import.meta.url), 'utf8');
  // Ohm's typings leave out the grammar's source text, which the bundle carries.
  const { contents } = (grammar as typeof grammar & { source: { contents: string } }).source;
  assert.ok(source.includes(contents), 'grammar.ohm changed: run `npm run generate:ohm`');
});
