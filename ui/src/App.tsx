import { useEffect, useMemo, useRef, useState } from 'react';
import { derive } from './derivation/index.ts';
import scenariosJson from '../../fixtures/scenarios.json';
import { ItemsTable } from './components/ItemsTable';
import { TokenView } from './components/TokenView';
import type { Scenario } from './timeline';

const scenarios = scenariosJson as unknown as Scenario[];

// How long the panels take to fade out before the new scenario swaps in. Matches --fade-out in styles.css.
const FADE_OUT_MS = 120;

export function App() {
  // `id` follows the dropdown at once; `shownId` swaps after the fade-out, so both panels cross-fade together.
  const [id, setId] = useState(scenarios[0].id);
  const [shownId, setShownId] = useState(id);
  const swap = useRef<number | undefined>(undefined);
  const scenario = scenarios.find((candidate) => candidate.id === shownId) ?? scenarios[0];
  const timeline = useMemo(() => derive(scenario.parse, scenario.config), [scenario]);

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
      </header>

      {/* Keyed by the shown scenario, so the chips and rows replay their fade-in after each swap. */}
      <div key={scenario.id} className={id === shownId ? 'panels' : 'panels is-switching'}>
        <main className="panel">
          <section>
            <h2>Timeline</h2>
            <ItemsTable timeline={timeline} />
          </section>
        </main>

        <aside className="panel panel-dev">
          <TokenView text={scenario.text} tokens={scenario.tokens} />
          <section>
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
