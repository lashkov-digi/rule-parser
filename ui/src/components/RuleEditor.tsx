import { autocompletion, pickedCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { Annotation, Compartment, EditorState, StateEffect, StateField, type ChangeSpec } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  hoverTooltip,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { contextAt } from '../completion.ts';
import type { DayConfig, Diagnostic } from '../derivation/index.ts';
import { closingQuote, lintDiagnostics, openQuote, tokenAt, tokenMarks } from '../editor.ts';
import { dictionary, kindOf } from '../lexemes.ts';
import { ruleLanguage } from '../parsers/lezer/language.ts';
import type { Token } from '../timeline.ts';

// The one change that turns `from` into `to`: everything between their common prefix and common suffix. Reset and
// rename come in as a new value, and replacing only the middle keeps the cursor and the undo history around it.
export function replacement(from: string, to: string): ChangeSpec | null {
  if (from === to) return null;
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++;
  return { from: start, to: from.length - end, insert: to.slice(start, to.length - end) };
}

// Marks a change that came in through `value`, so it is not reported back through `onChange`.
const external = Annotation.define<boolean>();

// The tokens of the current text and their marks. An edit maps the marks along until the new tokens arrive, and
// leaves `tokens` null meanwhile, so hovering never looks up a token in text that has moved.
type Marks = { tokens: Token[] | null; decorations: DecorationSet };
const setMarks = StateEffect.define<Marks>();
const marks = StateField.define<Marks>({
  create: () => ({ tokens: null, decorations: Decoration.none }),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMarks)) return effect.value;
    return tr.docChanged ? { tokens: null, decorations: value.decorations.map(tr.changes) } : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

// The token's type, kind and description, the same text the token chips show. An activity adds its catalog entry:
// duration and description, or a note that the catalog lacks it.
const tokenTooltip = (catalog: () => DayConfig['activities']) =>
  hoverTooltip((view, pos, side) => {
    const tokens = view.state.field(marks).tokens;
    const index = tokens && tokenAt(tokens, side < 0 ? pos - 1 : pos);
    if (!tokens || index === null) return null;
    const token = tokens[index];
    return {
      pos: token.from,
      end: token.to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'token-tooltip';
        const type = dom.appendChild(document.createElement('strong'));
        type.textContent = token.type;
        const kind = dom.appendChild(document.createElement('span'));
        kind.className = 'muted';
        kind.textContent = ` ${kindOf(token.type)} `;
        dom.append(dictionary.get(token.type)?.description ?? '');
        if (token.type === 'ACTIVITY') dom.append(activityInfo(token.text.slice(1, -1), catalog()));
        return { dom };
      },
    };
  });

function activityInfo(name: string, catalog: DayConfig['activities']) {
  const info = document.createElement('div');
  info.className = 'token-tooltip-activity';
  const entry = catalog[name];
  const title = info.appendChild(document.createElement('strong'));
  title.textContent = name;
  const duration = info.appendChild(document.createElement('span'));
  duration.className = 'muted';
  duration.textContent = entry ? ` ${entry.duration} min` : ' not in the activity catalog';
  if (entry?.description) info.appendChild(document.createElement('p')).textContent = entry.description;
  return info;
}

// Suggestions at the cursor. Inside quotes, the catalog activities, filtered by what is typed after the opening quote.
// Picking one replaces the whole name, through its closing quote when the line has one, and adds that quote when it
// does not. Elsewhere, what the syntax tree says fits there: keywords, and activities with their quotes. An activity
// list opens on its own, after `before ` say; keywords wait for a letter or Ctrl+Space. The subject and the targets
// already listed are left out.
const ruleCompletion = (catalog: () => DayConfig['activities']) => (context: CompletionContext) => {
  if (context.state.readOnly) return null;
  const line = context.state.doc.lineAt(context.pos);
  const start = openQuote(line.text, context.pos - line.from);
  const activities = (exclude: string[], apply: (name: string) => Completion['apply']) =>
    Object.entries(catalog())
      .filter(([name]) => !exclude.includes(name))
      .map(([name, entry]): Completion => ({ label: name, detail: `${entry.duration} min`, info: entry.description, apply: apply(name) }));

  if (start !== null) {
    const found = contextAt(context.state, line.from + start - 1)?.activities;
    const options = activities(found?.exclude ?? [], (name) => (view, completion, from, to) => {
      const current = view.state.doc.lineAt(to);
      const end = closingQuote(current.text, to - current.from);
      const insert = `${name}"${found?.header && end === null ? ':' : ''}`;
      view.dispatch({
        changes: { from, to: end === null ? to : current.from + end, insert },
        selection: { anchor: from + insert.length },
        annotations: pickedCompletion.of(completion),
        userEvent: 'input.complete',
      });
    });
    return { from: line.from + start, options, validFor: /^[^"]*$/ };
  }

  const found = contextAt(context.state, context.pos);
  if (!found || (found.from === context.pos && found.activities === null && !context.explicit)) return null;
  const keywords = found.keywords.flatMap((type) => {
    const entry = dictionary.get(type);
    return (entry?.lexemes ?? []).map((lexeme): Completion => ({ label: lexeme.value, info: entry?.description }));
  });
  const header = found.activities?.header ? ':' : '';
  const named = found.activities ? activities(found.activities.exclude, (name) => `"${name}"${header}`) : [];
  return { from: found.from, options: [...keywords, ...named], validFor: /^[\w-]*$/ };
};

// The rule text editor. The view owns the text and reports each edit through `onChange`. A `value` that differs from
// the text, such as after a reset or a rename, goes in as an undoable change. Remount it to start a fresh history.
// `tokens` and `diagnostics` belong to `value` and are drawn over the text. Hovering a token reports it through
// `setActive`, and `linked` lights up the tokens behind the hovered timeline row. Typing inside quotes suggests the
// activities in `catalog`, elsewhere what the rule grammar allows there, and hovering an activity shows its catalog
// entry.
export function RuleEditor({
  value,
  onChange,
  readOnly,
  tokens,
  diagnostics,
  active,
  setActive,
  linked,
  catalog,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  tokens: Token[];
  diagnostics: Diagnostic[];
  active: number | null;
  setActive: (index: number | null) => void;
  linked: Set<number>;
  catalog: DayConfig['activities'];
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // The view is created once, so it calls the latest callbacks through refs.
  const change = useRef(onChange);
  change.current = onChange;
  const hover = useRef(setActive);
  hover.current = setActive;
  const activities = useRef(catalog);
  activities.current = catalog;

  useEffect(() => {
    // The token under the mouse, reported only when it changes.
    let hovered: number | null = null;
    const report = (index: number | null) => {
      if (index !== hovered) hover.current((hovered = index));
    };
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          editable.current.of(editability(readOnly)),
          marks,
          tokenTooltip(() => activities.current),
          lintGutter(),
          ruleLanguage,
          autocompletion({ override: [ruleCompletion(() => activities.current)] }),
          EditorView.contentAttributes.of({ 'aria-label': 'Rule text', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external)))
              change.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            mousemove: (event, view) => {
              const tokens = view.state.field(marks).tokens;
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              report(tokens && pos !== null ? tokenAt(tokens, pos) : null);
            },
            mouseleave: () => report(null),
          }),
        ],
      }),
    });
    return () => view.current?.destroy();
    // The initial value and read-only flag only seed the view. The effects below keep them in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const changes = view.current && replacement(view.current.state.doc.toString(), value);
    if (changes) view.current!.dispatch({ changes, annotations: external.of(true) });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(editability(readOnly)) });
  }, [readOnly]);

  // Tokens and diagnostics are worked out from `value`. While the user types ahead of it, they would point into the
  // old text, so they wait for the render that catches up.
  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() !== value) return;
    const decorations = Decoration.set(
      tokenMarks(tokens, active, linked).map((mark) => Decoration.mark({ class: mark.className }).range(mark.from, mark.to)),
    );
    current.dispatch({ effects: setMarks.of({ tokens, decorations }) });
  }, [value, tokens, active, linked]);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() !== value) return;
    current.dispatch(setDiagnostics(current.state, lintDiagnostics(diagnostics, value.length)));
  }, [value, diagnostics]);

  return <div ref={host} className={readOnly ? 'code input is-readonly' : 'code input'} />;
}

const editability = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
