import { describe, test } from 'vitest';
import scenariosJson from '../../../fixtures/scenarios.json';
import type { Scenario } from '../timeline.ts';
import { parsers } from './registry.ts';

// Speed of every registered library on the same inputs. Run with `npm run bench`.
// Compare libraries within one run only: laptop timings drift between runs.
const scenarios = scenariosJson as unknown as Scenario[];
const LINES = 200;
// Time budget per library and step, in ms. Enough for a stable mean on a millisecond-scale parse.
const RUN = { time: 500, warmupTime: 100 };

// Repeats the source lines until the text has `LINES` lines. Each copy gets numbered activity names,
// so a 200-line rules text has 200 lines of distinct activities instead of one block parsed over and over.
function grow(head: string[], body: string[]): string {
  const lines = [...head];
  for (let copy = 1; lines.length < LINES; copy++) {
    for (const line of body) lines.push(line.replace(/"([^"]+)"/g, `"$1 ${copy}"`));
  }
  return lines.slice(0, LINES).join('\n');
}

const textOf = (id: string) => scenarios.find((scenario) => scenario.id === id)?.text.split('\n') ?? [];
const [, ...legacyBody] = textOf('s3'); // drop the leading `sequence`, it may appear only once

const inputs = [
  ...scenarios.map((scenario) => ({ title: scenario.title, text: scenario.text })),
  { title: `rules, ${LINES} lines`, text: grow([], [...textOf('s1'), ...textOf('s2')]) },
  { title: `sequence, ${LINES} lines`, text: grow(['sequence'], legacyBody) },
];

if (parsers.length === 0) test.todo('no parser registered in src/parsers/registry.ts');

// One comparison table per input and step. Tokenize and parse are timed apart, since a library can be fast at one
// and slow at the other. `bench.compare` needs two libraries, so a lone one runs on its own.
for (const input of parsers.length > 0 ? inputs : []) {
  describe(input.title, () => {
    for (const step of ['tokenize', 'parse'] as const) {
      test(step, async ({ bench }) => {
        const runs = parsers.map((parser) => bench(parser.title, () => void parser[step](input.text)));
        await (runs.length === 1 ? runs[0].run(RUN) : bench.compare(...runs, RUN));
      });
    }
  });
}
