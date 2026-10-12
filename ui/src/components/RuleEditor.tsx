import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { Annotation, Compartment, EditorState, type ChangeSpec } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

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

// The rule text editor. The view owns the text and reports each edit through `onChange`. A `value` that differs from
// the text, such as after a reset or a rename, goes in as an undoable change. Remount it to start a fresh history.
export function RuleEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // The view is created once, so it calls the latest onChange through a ref.
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
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
          EditorView.contentAttributes.of({ 'aria-label': 'Rule text', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external)))
              change.current(update.state.doc.toString());
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

  return <div ref={host} className={readOnly ? 'code input is-readonly' : 'code input'} />;
}

const editability = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
