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
  // Tokens behind each row, by index into result.tokens: every token of the commands that placed it. A derived wait
  // has no command of its own. It is the gap before a row a composite fixed later, and derivation puts it right before
  // that row. Offset i of a composite fixes occurrence i + 1 of its subject, so the wait owns the one offset that fixed
  // that row: `post 1h` for "PK sampling · 2 of 3". Without such an offset it falls back to the row's commands.
  const rowTokens = useMemo(() => {
    const owned = new Map<string, Set<number>>();
    if (!timeline || !result.parse) return owned;
    const commands = result.parse.commands;
    const tokensIn = (sources: Array<{ from: number; to: number }>) =>
      result.tokens.flatMap((token, index) =>
        sources.some((source) => source.from <= token.from && token.to <= source.to) ? [index] : [],
      );
    const commandTokens = (ids: string[]) =>
      tokensIn(commands.filter((command) => ids.includes(command.id)).map((command) => command.source));
    // A composite's offsets as token groups, in written order: `pre` alone, or one `post` duration with its window.
    // Every group keeps its `post` keyword, so the second one reads `post 2h`.
    const offsetGroups = (source: { from: number; to: number }) => {
      const groups: number[][] = [];
      let post: number | null = null;
      let inWindow = false;
      for (const index of tokensIn([source])) {
        const type = result.tokens[index].type;
        if (type === 'PRE') groups.push([index]);
        else if (type === 'POST') post = index;
        else if (type === 'COMMA') post = null;
        else if (type === 'WINDOW') {
          groups.at(-1)?.push(index);
          inWindow = true;
        } else if (type === 'DURATION' || type === 'PERCENT') {
          if (inWindow) groups.at(-1)?.push(index);
          else if (post !== null) groups.push([post, index]);
          inWindow = false;
        }
      }
      return groups;
    };
    const fixingOffset = (row: (typeof timeline.items)[number] | undefined) => {
      if (!row?.occurrence) return [];
      const n = row.occurrence.n;
      return commands
        .filter((command) => row.commandIds.includes(command.id) && command.type === 'composite' && row.activities.includes(command.subject))
        .flatMap((command) => offsetGroups(command.source)[n - 1] ?? []);
    };
    timeline.items.forEach((item, index, items) => {
      if (!item.flags.includes('derived-wait')) return owned.set(item.id, new Set(commandTokens(item.commandIds)));
      const next = items[index + 1];
      const offset = fixingOffset(next);
      owned.set(item.id, new Set(offset.length > 0 ? offset : commandTokens(next?.commandIds ?? [])));
    });
    return owned;
  }, [timeline, result]);
  // The hovered token, by index into result.tokens. An edit can leave it past the end, so every read checks.
  const [activeToken, setActiveToken] = useState<number | null>(null);
  // Timeline rows behind the hovered token. An activity name picks the rows of that activity, wherever it is
  // written: in `after "Vital Signs"` it means Vital Signs, not the subject the rule places. Any other token picks
  // the rows that own it.
  const linked = useMemo(() => {
    const token = activeToken === null ? undefined : result.tokens[activeToken];
    if (activeToken === null || !token || !timeline) return new Set<string>();
    const name = token.type === 'ACTIVITY' ? token.text.slice(1, -1) : null;
    return new Set(
      timeline.items
        .filter((item) => (name === null ? rowTokens.get(item.id)?.has(activeToken) : item.activities.includes(name)))
        .map((item) => item.id),
    );
  }, [activeToken, result, timeline, rowTokens]);
  // The other direction: the hovered timeline row lights up the tokens it owns and the mentions of its activities.
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const linkedTokens = useMemo(() => {
    const item = timeline?.items.find((candidate) => candidate.id === activeItem);
    if (!item) return new Set<number>();
    const named = result.tokens.flatMap((token, index) =>
      token.type === 'ACTIVITY' && item.activities.includes(token.text.slice(1, -1)) ? [index] : [],
    );
    return new Set([...(rowTokens.get(item.id) ?? []), ...named]);
  }, [activeItem, result, timeline, rowTokens]);
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
            {timeline ? <ItemsTable timeline={timeline} linked={linked} setActive={setActiveItem} /> : <p className="parser-error">{result.error}</p>}
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
          <TokenView
            text={shownText}
            tokens={result.tokens}
            active={activeToken}
            setActive={setActiveToken}
            linked={linkedTokens}
          />
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
