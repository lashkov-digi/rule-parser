// Lezer adapter: the grammar is in ./rules.grammar, this file turns its tree into tokens, commands and diagnostics.
import type { SyntaxNode } from '@lezer/common';
import type { Anchor, Command, Diagnostic, Minutes, Offset, RuleCommand, SlotCommand, Span } from '../../derivation/index.ts';
import type { Token } from '../../timeline.ts';
import type { RuleParser } from '../types.ts';
import { parser } from './rules.grammar';

type Body<C> = C extends unknown ? Omit<C, 'id' | 'subject' | 'source'> : never;
type RuleBody = Body<RuleCommand>;
type SlotBody = Body<SlotCommand>;
type Header = { kind: 'subject' | 'anchor'; name: string };

// Token names in the order `expected` lists them. Lezer has no list of expected tokens, so the adapter probes for
// them (see expectedAt) and keeps this order by hand: roughly the order a statement is written in, SEP last.
const TOKEN_NAMES = [
  'ACTIVITY', 'ANCHOR', 'COUNT', 'QUALIFIER', 'DURATION', 'PERCENT', 'REL', 'DAY_ANCHOR', 'EDGE', 'OCCURRENCE', 'PRE',
  'POST', 'WINDOW', 'BEFORE', 'AFTER', 'STATE', 'TRAVEL', 'ADMISSION', 'RETURN', 'RETURN_MODE', 'HOSP', 'FROM', 'COLON',
  'COMMA', 'SEQUENCE', 'SEP',
] as const;
const IS_TOKEN = new Set<string>(TOKEN_NAMES);

// One lexeme per token, appended to a statement prefix to see whether the parser takes it.
const SAMPLE: Record<(typeof TOKEN_NAMES)[number], string> = {
  ACTIVITY: '"A"', ANCHOR: 'anchor', COUNT: '2x', QUALIFIER: 'exactly', DURATION: '1h', PERCENT: '5%', REL: 'rel',
  DAY_ANCHOR: 'day-start', EDGE: 'start', OCCURRENCE: 'each', PRE: 'pre', POST: 'post', WINDOW: '±', BEFORE: 'before',
  AFTER: 'after', STATE: 'wait', TRAVEL: 'travel', ADMISSION: 'admission', RETURN: 'return', RETURN_MODE: 'same',
  HOSP: 'hosp', FROM: 'from', COLON: ':', COMMA: ',', SEQUENCE: 'sequence', SEP: '\n',
};

const strict = parser.configure({ strict: true });
const lexer = parser.configure({ top: 'Tokens' });

// --- semantics -----------------------------------------------------------------------------------------------

const QUALIFIER = { '=': 'exactly', '~': 'approximately', approx: 'approximately', '>=': 'atleast' } as const;

// Reads values out of the tree. Lezer nodes carry offsets only, so every read needs the text.
function reader(text: string) {
  const source = (node: SyntaxNode) => text.slice(node.from, node.to);
  const name = (node: SyntaxNode) => source(node).slice(1, -1);
  const integer = (node: SyntaxNode) => parseInt(source(node), 10);
  const minutes = (node: SyntaxNode): Minutes => {
    const [, value, unit] = /^([\d.]+)(min|m|h)$/.exec(source(node))!;
    return Number(value) * (unit === 'h' ? 60 : 1);
  };
  const count = (node: SyntaxNode) => {
    const written = node.getChild('COUNT');
    return written ? integer(written) : null;
  };
  const anchorRef = (node: SyntaxNode): Anchor => {
    const ref = node.firstChild!;
    return ref.name === 'ACTIVITY' ? { kind: 'activity', name: name(ref) } : { kind: 'day', at: source(ref) as 'day-start' | 'day-end' };
  };
  const targets = (node: SyntaxNode) => node.getChild('Targets')!.getChildren('ACTIVITY').map(name);
  const direction = (node: SyntaxNode) => source(node.getChild('Direction')!) as 'before' | 'after';
  const offsets = (node: SyntaxNode) =>
    node
      .getChild('Offsets')!
      .getChildren('Offset')
      .flatMap((offset): Offset[] =>
        offset.getChild('PRE')
          ? [{ kind: 'pre' as const }]
          : offset.getChildren('PostOffset').map((post) => {
              const window = post.getChild('Window')?.lastChild;
              return {
                kind: 'post' as const,
                after: minutes(post.getChild('DURATION')!),
                window: !window ? null : window.name === 'DURATION' ? { kind: 'duration' as const, value: minutes(window) } : { kind: 'percent' as const, value: parseFloat(source(window)) },
              };
            }),
      );
  const anchored = (node: SyntaxNode, anchor: Anchor): RuleBody => ({
    type: 'composite',
    count: count(node),
    anchor,
    edge: (node.getChild('EDGE') ? source(node.getChild('EDGE')!) : 'start') as 'start' | 'end',
    occurrence: (node.getChild('OCCURRENCE') ? source(node.getChild('OCCURRENCE')!) : 'each') as 'each' | 'first' | 'last',
    offsets: offsets(node),
  });

  const header = (node: SyntaxNode): Header => ({
    kind: node.getChild('ANCHOR') ? 'anchor' : 'subject',
    name: name(node.getChild('ACTIVITY')!),
  });

  // A placement needs the anchor of its block, which only the adapter knows.
  const placement = (node: SyntaxNode, anchor: string): RuleBody =>
    node.getChild('Offsets')
      ? anchored(node, { kind: 'activity', name: anchor })
      : { type: 'dependency', count: count(node), direction: direction(node), targets: targets(node) };

  const rule = (node: SyntaxNode): RuleBody => {
    switch (node.name) {
      case 'Spacing': {
        const written = source(node.getChild('QUALIFIER')!);
        return {
          type: 'spacing',
          count: count(node)!,
          qualifier: written in QUALIFIER ? QUALIFIER[written as keyof typeof QUALIFIER] : (written as 'exactly' | 'approximately' | 'atleast'),
          gap: minutes(node.getChild('DURATION')!),
        };
      }
      case 'Composite':
        return anchored(node, anchorRef(node.getChild('AnchorRef')!));
      case 'Dependency':
        return { type: 'dependency', count: count(node), direction: direction(node), targets: targets(node) };
      case 'Count':
        return { type: 'count', count: count(node)! };
      case 'FastingWait':
        return {
          type: 'fasting-wait',
          state: source(node.getChild('STATE')!) as 'fast' | 'wait',
          duration: minutes(node.getChild('DURATION')!),
          position: direction(node),
        };
      case 'Travel': {
        const [duration, back] = node.getChildren('DURATION');
        const target = node.getChild('ACTIVITY');
        const mode = node.getChild('RETURN_MODE');
        return {
          type: 'travel',
          duration: minutes(duration),
          arriveBefore: target ? { kind: 'activity', name: name(target) } : node.getChild('ADMISSION') ? { kind: 'admission' } : null,
          return: mode ? { mode: source(mode) as 'none' | 'same' | 'discharge' } : back ? { mode: 'duration', duration: minutes(back) } : null,
        };
      }
      case 'Hospitalization': {
        const from = node.getChild('AnchorRef');
        return { type: 'hospitalization', duration: minutes(node.getChild('DURATION')!), from: from ? anchorRef(from) : { kind: 'day', at: 'day-start' } };
      }
      default:
        throw new Error(`No rule for ${node.name}`);
    }
  };

  const slot = (node: SyntaxNode): SlotBody => {
    const duration = minutes(node.getChild('DURATION')!);
    const activity = node.getChild('ACTIVITY');
    if (activity) return { type: 'slot', kind: 'activity', activity: name(activity), duration };
    const state = node.getChild('STATE');
    return { type: 'slot', kind: state ? (source(state) as 'fast' | 'wait') : 'travel', activity: null, duration };
  };

  return { source, header, placement, rule, slot };
}

// --- adapter -------------------------------------------------------------------------------------------------

function lex(text: string) {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  for (let node = lexer.parse(text).topNode.firstChild; node; node = node.nextSibling) {
    const piece = text.slice(node.from, node.to);
    if (IS_TOKEN.has(node.name)) tokens.push({ type: node.name, text: piece, from: node.from, to: node.to });
    else diagnostics.push(unknown(piece, node));
  }
  return { tokens, diagnostics };
}

// A Word, or a character no token matches (an error node).
const unknown = (piece: string, where: Span): Diagnostic => ({
  severity: 'error',
  code: 'lex',
  message: piece.startsWith('"') ? 'Unterminated activity name' : `Unknown word "${piece}"`,
  from: where.from,
  to: where.to,
});

// Token names the parser would take at the end of `prefix`. Lezer recovers from errors silently and exposes the
// parse state only to external tokenizers, so each token's sample is appended and parsed in strict mode: the
// token is expected when the parse fails past it, or not at all.
function expectedAt(prefix: string): string[] {
  const at = prefix.length + 1;
  return TOKEN_NAMES.filter((type) => {
    try {
      strict.parse(`${prefix} ${SAMPLE[type]}`);
      return true;
    } catch (error) {
      const failed = /No parse at (\d+)/.exec(String(error));
      return failed !== null && Number(failed[1]) > at;
    }
  });
}

// Whether the text lexes as exactly one token.
const isToken = (piece: string) => {
  const first = lexer.parse(piece).topNode.firstChild;
  return first !== null && IS_TOKEN.has(first.name) && first.from === 0 && first.to === piece.length;
};

type Line = Span & { nodes: SyntaxNode[]; errors: SyntaxNode[]; words: SyntaxNode[]; leaves: SyntaxNode[] };

// Splits the tree into statement lines at SEP tokens, wherever recovery left them, and files every node under its line.
function lines(top: SyntaxNode, text: string): Line[] {
  const result: Line[] = [{ from: 0, to: text.length, nodes: [], errors: [], words: [], leaves: [] }];
  // The cursor walks in text order, so a node always belongs to the last line so far.
  const cursor = top.cursor();
  do {
    const node = cursor.node;
    if (node.name === 'SEP') {
      result.at(-1)!.to = node.from;
      result.push({ from: node.to, to: text.length, nodes: [], errors: [], words: [], leaves: [] });
      continue;
    }
    const line = result.at(-1)!;
    // An error node over text with no node inside is a token the parser skipped, such as a keyword out of place, or a
    // character no token matches. Lexing its text tells them apart: the first is an unexpected token, the second an
    // unknown word, like a Word.
    if (node.type.isError && (node.firstChild !== null || node.from === node.to)) line.errors.push(node);
    else if (node.type.isError && isToken(text.slice(node.from, node.to))) {
      line.errors.push(node);
      line.leaves.push(node);
    }
    else if (node.type.isError || node.name === 'Word') line.words.push(node);
    else if (IS_TOKEN.has(node.name)) line.leaves.push(node);
    else if (node.name === 'Line' || node.name === 'Slot') line.nodes.push(node);
  } while (cursor.next());
  return result.filter((line) => line.leaves.length + line.words.length + line.errors.length > 0);
}

function parse(text: string) {
  const top = parser.parse(text).topNode.firstChild;
  const mode = top?.name === 'SequenceText' ? 'sequence' : 'rules';
  const read = reader(text);
  const diagnostics: Diagnostic[] = [];
  const bodies: Array<{ subject: string | null; body: RuleBody | SlotBody; source: Span }> = [];
  let block: Header | null = null;

  const error = (code: Diagnostic['code'], message: string, where: Span, expected?: string[]) =>
    diagnostics.push({ severity: 'error', code, message, from: where.from, to: where.to, ...(expected && expected.length > 0 ? { expected } : {}) });

  (top ? lines(top, text) : []).forEach((line, index) => {
    const [node] = line.nodes;

    if (line.errors.length > 0 || line.words.length > 0) {
      // The first error is where the line stops making sense. Recovery may have kept going, but a statement with an
      // error produces no command.
      const at = Math.min(...[...line.errors, ...line.words].map((n) => n.from));
      const start = line.leaves[0]?.from ?? line.from;
      // Probe the line as the parser saw it: after the SEQUENCE line in sequence mode, after a SEP in rules mode.
      const context = index === 0 ? '' : mode === 'sequence' ? 'sequence\n' : '\n';
      const expected = expectedAt(context + text.slice(start, at).trimEnd());
      if (line.words.length > 0)
        line.words.forEach((word) => diagnostics.push({ ...unknown(read.source(word), word), ...(word.from === at && expected.length > 0 ? { expected } : {}) }));
      else {
        const found = line.leaves.find((leaf) => leaf.from === at);
        error('parse', found ? `Unexpected "${read.source(found)}"` : 'Unexpected end of statement', found ?? { from: at, to: at }, expected);
      }
      // Keep the header of a line whose statement failed, so the lines after it still have their block.
      const header = node?.getChild('Header');
      if (header && !line.errors.some((e) => e.from < header.to)) block = read.header(header);
      return;
    }

    if (mode === 'sequence') {
      if (node?.name === 'Slot') bodies.push({ subject: null, body: read.slot(node), source: { from: node.from, to: node.to } });
      return;
    }

    const header = node.getChild('Header');
    if (header) block = read.header(header);
    const statement = node.getChild('Statement')?.firstChild;
    if (!statement) return;
    const where = { from: statement.from, to: statement.to };

    if (statement.name === 'Placement') {
      if (block?.kind === 'anchor')
        bodies.push({ subject: read.source(statement.getChild('ACTIVITY')!).slice(1, -1), body: read.placement(statement, block.name), source: where });
      else error('parse', 'A placement is only valid inside an anchor block', where);
      return;
    }
    if (block === null) return error('parse', 'A statement needs a subject header before it', where);
    if (block.kind === 'anchor') return error('parse', 'Only placements are valid inside an anchor block', where);

    const body = read.rule(statement);
    if (body.type === 'hospitalization' && (body.duration < 60 || body.duration > 1440))
      return error('parse', 'Hospitalization lasts from 1h to 24h', where);
    if (body.type === 'hospitalization' && body.from.kind === 'day' && body.from.at === 'day-end')
      return error('parse', 'Hospitalization can start at day-start or an activity, not day-end', where);
    bodies.push({ subject: block.name, body, source: where });
  });

  const commands = bodies.map(({ subject, body, source }, i) =>
    (subject === null ? { id: `c${i + 1}`, ...body, source } : { id: `c${i + 1}`, subject, ...body, source }) as Command,
  );
  return { version: 1 as const, mode, commands, diagnostics: [...diagnostics].sort((a, b) => a.from - b.from) } as const;
}

export const lezerParser: RuleParser = {
  id: 'lezer',
  title: 'Lezer',
  tokenize: lex,
  parse,
};
