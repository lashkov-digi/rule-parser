import { useEffect, useMemo, useRef, useState } from 'react';
import { derive } from './derivation/index.ts';
import scenariosJson from '../../fixtures/scenarios.json';
import { ItemsTable } from './components/ItemsTable';
import { TokenView } from './components/TokenView';
import { parsers } from './parsers/registry.ts';
import type { RuleParser } from './parsers/types.ts';
import type { Scenario } from './timeline';

const scenarios = scenariosJson as unknown as Scenario[];

// The hand-written tokens and parse result in scenarios.json. Picked when no library is chosen.
const FIXTURES = 'fixtures';

// Runs a library on the scenario text. A library that throws shows its error instead of a timeline.
function run(parser: RuleParser | undefined, scenario: Scenario) {
  if (!parser) return { tokens: scenario.tokens, parse: scenario.parse, error: null };
  try {
    return { tokens: parser.tokenize(scenario.text).tokens, parse: parser.parse(scenario.text), error: null };
  } catch (error) {
    return { tokens: [], parse: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// How long the panels take to fade out before the new scenario swaps in. Matches --fade-out in styles.css.
const FADE_OUT_MS = 120;

export function App() {
  // `id` follows the dropdown at once; `shownId` swaps after the fade-out, so both panels cross-fade together.
  const [id, setId] = useState(scenarios[0].id);
  const [shownId, setShownId] = useState(id);
  const swap = useRef<number | undefined>(undefined);
  const scenario = scenarios.find((candidate) => candidate.id === shownId) ?? scenarios[0];
  const [parserId, setParserId] = useState(FIXTURES);
  const parser = parsers.find((candidate) => candidate.id === parserId);
  const result = useMemo(() => run(parser, scenario), [parser, scenario]);
  const timeline = useMemo(() => result.parse && derive(result.parse, scenario.config), [result, scenario]);

  // A new pick during a fade restarts the timer, so the last choice always wins.
  const choose = (next: string) => {
    setId(next);
    window.clearTimeout(swap.current);
    swap.current = window.setTimeout(() => setShownId(next), FADE_OUT_MS);
  };
  useEffect(() => () => window.clearTimeout(swap.current), []);

  return (
    <div className="app">
      <header className="topbar">
        <label className="picker">
          Scenario
          <select value={id} onChange={(event) => choose(event.target.value)}>
            {scenarios.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </label>
        <label className="picker">
          Parser
          <select value={parserId} onChange={(event) => setParserId(event.target.value)}>
            <option value={FIXTURES}>Hand-written fixtures</option>
            {parsers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* Keyed by the shown scenario, so the chips and rows replay their fade-in after each swap. */}
      <div key={scenario.id} className={id === shownId ? 'panels' : 'panels is-switching'}>
        <main className="panel">
          <section>
            <h2>Timeline</h2>
            {timeline ? <ItemsTable timeline={timeline} /> : <p className="parser-error">{result.error}</p>}
          </section>
        </main>

        <aside className="panel panel-dev">
          <TokenView text={scenario.text} tokens={result.tokens} />
          <section>
            <details>
              <summary>Parse JSON</summary>
              <pre className="code">{JSON.stringify(result.parse, null, 2)}</pre>
            </details>
            <details>
              <summary>Timeline JSON</summary>
              <pre className="code">{JSON.stringify(timeline, null, 2)}</pre>
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}
