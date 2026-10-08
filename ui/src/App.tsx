import { useEffect, useMemo, useRef, useState } from 'react';
import { derive, type DayConfig } from './derivation/index.ts';
import scenariosJson from '../../fixtures/scenarios.json';
import { CatalogEditor } from './components/CatalogEditor';
import { DiagnosticList } from './components/DiagnosticList';
import { ItemsTable } from './components/ItemsTable';
import { TokenView } from './components/TokenView';
import { createFixtureParser, FIXTURES } from './parsers/fixtures/index.ts';
import { parsers } from './parsers/registry.ts';
import type { RuleParser } from './parsers/types.ts';
import type { Scenario } from './timeline';

const scenarios = scenariosJson as unknown as Scenario[];

// Runs a parser on the text. A parser that throws shows its error instead of a timeline.
function run(parser: RuleParser, text: string) {
  try {
    return { tokens: parser.tokenize(text).tokens, parse: parser.parse(text), error: null };
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

  // Edited text per scenario. A scenario with no entry shows its original text.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const text = edits[scenario.id] ?? scenario.text;
  const edit = (next: string) => setEdits((current) => ({ ...current, [scenario.id]: next }));
  const reset = () => setEdits(({ [scenario.id]: _dropped, ...rest }) => rest);

  // Edited day config (the activity catalog and CDT order) per scenario, kept apart from the text.
  const [configs, setConfigs] = useState<Record<string, DayConfig>>({});
  const config = configs[scenario.id] ?? scenario.config;
  const editConfig = (next: DayConfig) => setConfigs((current) => ({ ...current, [scenario.id]: next }));
  const resetConfig = () => setConfigs(({ [scenario.id]: _dropped, ...rest }) => rest);

  const [parserId, setParserId] = useState(FIXTURES);
  const parser = useMemo(
    () => parsers.find((candidate) => candidate.id === parserId) ?? createFixtureParser(scenario),
    [parserId, scenario],
  );
  // The fixtures ignore the text, so editing is off there and the original text is shown.
  const editable = parser.id !== FIXTURES;
  const shownText = editable ? text : scenario.text;
  const result = useMemo(() => run(parser, shownText), [parser, shownText]);
  const timeline = useMemo(() => result.parse && derive(result.parse, config), [result, config]);

  // A removed activity leaves the CDT order too, so a later one with the same name starts at the end.
  const editCatalog = (activities: DayConfig['activities']) =>
    editConfig({ activities, cdtOrder: config.cdtOrder.filter((name) => name in activities) });
  // The text refers to an activity by its quoted name, so a rename rewrites the text as well, when it is editable.
  const rename = (from: string, to: string) => {
    editConfig({
      activities: Object.fromEntries(Object.entries(config.activities).map(([name, entry]) => [name === from ? to : name, entry])),
      cdtOrder: config.cdtOrder.map((name) => (name === from ? to : name)),
    });
    if (editable) edit(text.replaceAll(`"${from}"`, `"${to}"`));
  };
  // Activity names in the text, in written order. Sequence mode writes durations in the text and has no catalog.
  const mentioned = [...new Set(result.tokens.filter((token) => token.type === 'ACTIVITY').map((token) => token.text.slice(1, -1)))];
  const diagnostics = [...(result.parse?.diagnostics ?? []), ...(timeline?.diagnostics ?? [])];

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
          <section>
            <div className="input-head">
              <h2>Input</h2>
              <button type="button" className="reset" onClick={reset} disabled={!editable || text === scenario.text}>
                Reset
              </button>
            </div>
            <textarea
              className="code input"
              value={shownText}
              onChange={(event) => edit(event.target.value)}
              disabled={!editable}
              rows={shownText.split('\n').length + 1}
              spellCheck={false}
              aria-label="Rule text"
            />
            <DiagnosticList diagnostics={diagnostics} />
          </section>
          <TokenView text={shownText} tokens={result.tokens} />
          {result.parse?.mode === 'rules' && (
            <CatalogEditor
              catalog={config.activities}
              mentioned={mentioned}
              changed={scenario.id in configs}
              onChange={editCatalog}
              onRename={rename}
              onReset={resetConfig}
            />
          )}
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
