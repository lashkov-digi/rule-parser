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
import type { Diagnostic } from '../derivation/index.ts';
import { lintDiagnostics, tokenAt, tokenMarks } from '../editor.ts';
import { dictionary, kindOf } from '../lexemes.ts';
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

// The token's type, kind and description, the same text the token chips show.
const tokenTooltip = hoverTooltip((view, pos, side) => {
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
      return { dom };
    },
  };
});

// The rule text editor. The view owns the text and reports each edit through `onChange`. A `value` that differs from
// the text, such as after a reset or a rename, goes in as an undoable change. Remount it to start a fresh history.
// `tokens` and `diagnostics` belong to `value` and are drawn over the text. Hovering a token reports it through
// `setActive`, and `linked` lights up the tokens behind the hovered timeline row.
export function RuleEditor({
  value,
  onChange,
  readOnly,
  tokens,
  diagnostics,
  active,
  setActive,
  linked,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  tokens: Token[];
  diagnostics: Diagnostic[];
  active: number | null;
  setActive: (index: number | null) => void;
  linked: Set<number>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // The view is created once, so it calls the latest callbacks through refs.
  const change = useRef(onChange);
  change.current = onChange;
  const hover = useRef(setActive);
  hover.current = setActive;

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
          tokenTooltip,
          lintGutter(),
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
