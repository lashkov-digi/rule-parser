// What the rule editor suggests at the cursor, read from the Lezer syntax tree of the text before it. Pure over the
// editor state, so it is tested without a DOM.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export type Context = {
  from: number; // where the word being typed starts; suggestions replace it
  keywords: string[]; // token types; their spellings come from lexemes.json
  activities: { exclude: string[]; header: boolean } | null; // header: the activity starts a header, `"Name":`
};

type Leaf = { type: string; text: string };

// What a statement starts with, once its header is written.
const STARTERS = ['BEFORE', 'AFTER', 'REL', 'STATE', 'TRAVEL', 'HOSP'];

export function contextAt(state: EditorState, pos: number): Context | null {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const from = pos - /[\w-]*$/.exec(line.text.slice(0, pos - line.from))![0].length;
  const tree = ensureSyntaxTree(state, from) ?? syntaxTree(state);
  const name = (text: string) => text.slice(1, -1);

  // The tokens of the statement line before the word being typed, and the block of the last header so far: its
  // subject, or the anchor its placements are measured from. A separator starts a new line. Error nodes and unknown
  // words are skipped: they are what is being typed.
  let leaves: Leaf[] = [];
  let anyBefore = false;
  let subject: string | null = null;
  let anchor: string | null = null;
  let sequence = false;
  tree.iterate({
    to: from,
    enter: (node) => {
      if (node.from >= from) return false;
      if (node.type.isError || node.name === 'Word') return false;
      if (node.name === 'SequenceText') sequence = true;
      // Error recovery reads a lone `"Name"` as a header without its colon, so a header counts once the colon is written.
      if (node.name === 'Header' && node.node.getChild('COLON')) {
        const activity = node.node.getChild('ACTIVITY');
        const header = activity && name(doc.sliceString(activity.from, activity.to));
        if (node.node.getChild('ANCHOR')) [subject, anchor] = [null, header];
        else if (header) [subject, anchor] = [header, null];
      }
      if (node.node.firstChild !== null) return;
      if (node.to > from) return;
      anyBefore = true;
      if (node.name === 'SEP') leaves = [];
      else leaves.push({ type: node.name, text: doc.sliceString(node.from, node.to) });
    },
  });

  const types = leaves.map((leaf) => leaf.type);
  const result = (keywords: string[], activities: Context['activities'] = null): Context | null =>
    keywords.length === 0 && activities === null ? null : { from, keywords, activities };
  const activities = (exclude: string[] = [], header = false) => ({ exclude, header });

  if (sequence) return types.length === 0 ? result(['STATE', 'TRAVEL'], activities()) : null;

  // A header first: `"Name":` or `anchor "Name":`. What follows on the line is a statement about its activity.
  let statement = leaves;
  if (types[0] === 'ANCHOR') {
    if (types.length === 1) return result([], activities([], true));
    statement = leaves.slice(3);
    if (types[2] !== 'COLON') return null;
    [subject, anchor] = [null, name(leaves[1].text)];
  } else if (types[0] === 'ACTIVITY' && types[1] === 'COLON') {
    [subject, anchor] = [name(leaves[0].text), null];
    statement = leaves.slice(2);
  } else if (types.length === 0 && !/^\s/.test(line.text)) {
    return result(anyBefore ? ['ANCHOR'] : ['ANCHOR', 'SEQUENCE'], activities([], true));
  }

  const own = subject === null ? [] : [subject];
  const kinds = statement.map((leaf) => leaf.type);
  const last = kinds.at(-1);
  const listed = statement.filter((leaf) => leaf.type === 'ACTIVITY').map((leaf) => name(leaf.text));

  // An anchor block holds placements only: `"Name" [COUNT]` and then offsets from the anchor or a direction.
  if (anchor !== null) {
    if (kinds.length === 0) return result([], activities([anchor]));
    if (kinds[0] !== 'ACTIVITY') return null;
    const rest = kinds.slice(kinds[1] === 'COUNT' ? 2 : 1);
    if (rest.length === 0) return result(['EDGE', 'OCCURRENCE', 'PRE', 'POST', 'BEFORE', 'AFTER']);
    if (rest[0] === 'BEFORE' || rest[0] === 'AFTER')
      return last === 'BEFORE' || last === 'AFTER' || last === 'COMMA' ? result([], activities(listed)) : null;
    if (last === 'EDGE') return result(['OCCURRENCE', 'PRE', 'POST']);
    if (last === 'OCCURRENCE' || last === 'COMMA') return result(['PRE', 'POST']);
    return null;
  }
  if (kinds.length === 0) return result(STARTERS);
  if (kinds[0] === 'STATE') return kinds.length === 2 ? result(['BEFORE', 'AFTER']) : null;
  if (kinds[0] === 'HOSP') {
    if (kinds.length === 2) return result(['FROM']);
    return last === 'FROM' ? result(['DAY_ANCHOR'], activities()) : null;
  }
  if (kinds[0] === 'TRAVEL') {
    if (kinds.length === 2) return result(['BEFORE', 'RETURN']);
    if (last === 'BEFORE') return result(['ADMISSION'], activities());
    if (last === 'RETURN') return result(['RETURN_MODE']);
    return last === 'ACTIVITY' || last === 'ADMISSION' ? result(['RETURN']) : null;
  }
  if (kinds.includes('REL')) {
    if (last === 'REL') return result(['DAY_ANCHOR'], activities(own));
    if (kinds.at(-2) === 'REL') return result(['EDGE', 'OCCURRENCE', 'PRE', 'POST']);
    if (last === 'EDGE') return result(['OCCURRENCE', 'PRE', 'POST']);
    if (last === 'OCCURRENCE' || last === 'COMMA') return result(['PRE', 'POST']);
    return null;
  }
  if (kinds.length === 1 && last === 'COUNT') return result(['QUALIFIER', 'BEFORE', 'AFTER', 'REL']);
  if (last === 'BEFORE' || last === 'AFTER' || (last === 'COMMA' && (kinds.includes('BEFORE') || kinds.includes('AFTER'))))
    return result([], activities([...own, ...listed]));
  return null;
}
