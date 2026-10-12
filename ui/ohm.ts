import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { generateTypes } from '@ohm-js/cli/src/helpers/generateTypes.js';
import * as ohm from 'ohm-js';
import type { Plugin } from 'vite';

// The Ohm counterpart of lezer(): compiles *.ohm imports into grammars at build time, so the grammar text is not
// parsed at startup. tsc runs outside Vite, so the action-dictionary types go to a file next to the grammar
// (grammar.ohm -> grammar.d.ohm.ts, found through allowArbitraryExtensions). Commit that file.
export function ohmGrammars(): Plugin {
  return {
    name: 'ohm',
    transform(source, id) {
      if (!id.endsWith('.ohm')) return null;
      // toRecipe exists at runtime but is not in Ohm's public types.
      const grammar = ohm.grammar(source) as ohm.Grammar & { toRecipe(): string };
      writeTypes(id, source);
      return { code: `import { makeRecipe } from 'ohm-js';\nexport default makeRecipe(${grammar.toRecipe()});\n`, map: null };
    },
  };
}

// Writes only on change, so a dev server does not reload on its own output.
function writeTypes(path: string, source: string) {
  const out = path.replace(/\.ohm$/, '.d.ohm.ts');
  const types = `// Generated from ${path.split('/').at(-1)} by ui/ohm.ts. Do not edit.\n\n${generateTypes(ohm.grammars(source))}`;
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {}
  if (current !== types) writeFileSync(out, types);
}

// `node ohm.ts` writes the types without Vite. typecheck runs it first, so tsc never reads stale types.
if (import.meta.main) for (const path of globSync('src/**/*.ohm')) writeTypes(path, readFileSync(path, 'utf8'));
