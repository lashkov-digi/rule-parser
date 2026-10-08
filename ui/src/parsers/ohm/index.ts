// Ohm adapter: the grammar is in ./grammar.ts, this file turns its matches into tokens, commands and diagnostics.
import type { MatchResult, Node } from 'ohm-js';
import type { Anchor, Command, Diagnostic, Minutes, RuleCommand, SlotCommand, Span } from '../../derivation/index.ts';
import type { Token } from '../../timeline.ts';
import type { RuleParser } from '../types.ts';
import { grammar } from './grammar.ts';

type Body<C> = C extends unknown ? Omit<C, 'id' | 'subject' | 'source'> : never;
type RuleBody = Body<RuleCommand>;
type SlotBody = Body<SlotCommand>;

type Header = { kind: 'subject' | 'anchor'; name: string };
// A placement needs the anchor of its block, which only the adapter knows.
type Statement =
  | { kind: 'rule'; span: Span; body: RuleBody }
  | { kind: 'placement'; span: Span; subject: string; body: (anchor: string) => RuleBody };
type Line = { header: Header | null; statement: Statement | null };

// --- semantics -----------------------------------------------------------------------------------------------

const name = (node: Node) => node.sourceString.slice(1, -1);
const integer = (node: Node) => parseInt(node.sourceString, 10);
const minutes = (node: Node): Minutes => {
  const [, value, unit] = /^([\d.]+)(min|m|h)$/.exec(node.sourceString)!;
  return Number(value) * (unit === 'h' ? 60 : 1);
};
const optional = (node: Node): Node | undefined => node.children[0];
const QUALIFIER = { '=': 'exactly', '~': 'approximately', approx: 'approximately', '>=': 'atleast' } as const;

// Offsets into the matched line, shifted by the adapter to offsets into the whole text.
const span = (node: Node): Span => ({ from: node.source.startIdx, to: node.source.endIdx });

const anchorRef = (node: Node): Anchor => {
  const ref = node.children[0];
  return ref.ctorName === 'activity'
    ? { kind: 'activity', name: name(ref) }
    : { kind: 'day', at: ref.sourceString as 'day-start' | 'day-end' };
};

const semantics = grammar.createSemantics();

semantics.addOperation<Line>('line', {
  Line_header(header, statement) {
    const node = optional(statement);
    return { header: header.header(), statement: node ? node.statement() : null };
  },
  Line_statement(statement) {
    return { header: null, statement: statement.statement() };
  },
  LineHeader(header, _rest) {
    return { header: header.header(), statement: null };
  },
});

semantics.addOperation<Header>('header', {
  Header_anchor(_anchor, activity, _colon) {
    return { kind: 'anchor', name: name(activity) };
  },
  Header_subject(activity, _colon) {
    return { kind: 'subject', name: name(activity) };
  },
});

semantics.addOperation<Statement>('statement', {
  Statement(node) {
    if (node.ctorName === 'Placement') {
      const [activity, count, body] = node.children;
      const written = optional(count);
      return {
        kind: 'placement',
        span: span(this),
        subject: name(activity),
        body: (anchor) => ({ ...body.placement(anchor), count: written ? integer(written) : null }),
      };
    }
    return { kind: 'rule', span: span(this), body: node.rule() };
  },
});

semantics.addOperation<RuleBody>('placement(anchor)', {
  PlacementBody_offsets(edge, occurrence, offsets) {
    return {
      type: 'composite',
      count: null,
      anchor: { kind: 'activity', name: this.args.anchor },
      edge: (optional(edge)?.sourceString ?? 'start') as 'start' | 'end',
      occurrence: (optional(occurrence)?.sourceString ?? 'each') as 'each' | 'first' | 'last',
      offsets: offsets.offsets(),
    };
  },
  PlacementBody_dependency(direction, targets) {
    return { type: 'dependency', count: null, direction: direction.sourceString as 'before' | 'after', targets: targets.targets() };
  },
});

semantics.addOperation<RuleBody>('rule', {
  Spacing(count, qualifier, gap) {
    const written = qualifier.sourceString;
    return {
      type: 'spacing',
      count: integer(count),
      qualifier: written in QUALIFIER ? QUALIFIER[written as keyof typeof QUALIFIER] : (written as 'exactly' | 'approximately' | 'atleast'),
      gap: minutes(gap),
    };
  },
  Composite(count, _rel, anchor, edge, occurrence, offsets) {
    const written = optional(count);
    return {
      type: 'composite',
      count: written ? integer(written) : null,
      anchor: anchorRef(anchor),
      edge: (optional(edge)?.sourceString ?? 'start') as 'start' | 'end',
      occurrence: (optional(occurrence)?.sourceString ?? 'each') as 'each' | 'first' | 'last',
      offsets: offsets.offsets(),
    };
  },
  Dependency(count, direction, targets) {
    const written = optional(count);
    return {
      type: 'dependency',
      count: written ? integer(written) : null,
      direction: direction.sourceString as 'before' | 'after',
      targets: targets.targets(),
    };
  },
  Count(count) {
    return { type: 'count', count: integer(count) };
  },
  FastingWait(state, duration, direction) {
    return {
      type: 'fasting-wait',
      state: state.sourceString as 'fast' | 'wait',
      duration: minutes(duration),
      position: direction.sourceString as 'before' | 'after',
    };
  },
  Travel(_travel, duration, arrive, back) {
    const target = optional(arrive)?.children[1];
    const mode = optional(back)?.children[1];
    return {
      type: 'travel',
      duration: minutes(duration),
      arriveBefore: target === undefined ? null : target.ctorName === 'activity' ? { kind: 'activity', name: name(target) } : { kind: 'admission' },
      return:
        mode === undefined
          ? null
          : mode.ctorName === 'duration'
            ? { mode: 'duration', duration: minutes(mode) }
            : { mode: mode.sourceString as 'none' | 'same' | 'discharge' },
    };
  },
  Hospitalization(_hosp, duration, from) {
    const start = optional(from)?.children[1];
    return {
      type: 'hospitalization',
      duration: minutes(duration),
      from: start ? anchorRef(start) : { kind: 'day', at: 'day-start' },
    };
  },
});

semantics.addOperation<string[]>('targets', {
  Targets(list) {
    return list.asIteration().children.map(name);
  },
});

semantics.addOperation<Extract<RuleBody, { type: 'composite' }>['offsets']>('offsets', {
  Offsets(list) {
    return list.asIteration().children.flatMap((offset) => offset.offsets());
  },
  Offset_pre(_pre) {
    return [{ kind: 'pre' }];
  },
  Offset_post(_post, offsets) {
    return offsets.children.map((offset) => {
      const [after, window] = offset.children;
      const written = optional(window)?.children[1];
      return {
        kind: 'post',
        after: minutes(after),
        window: written === undefined ? null : written.ctorName === 'duration' ? { kind: 'duration', value: minutes(written) } : { kind: 'percent', value: parseFloat(written.sourceString) },
      };
    });
  },
});

semantics.addOperation<SlotBody>('slot', {
  Slot_activity(activity, duration) {
    return { type: 'slot', kind: 'activity', activity: name(activity), duration: minutes(duration) };
  },
  Slot_state(state, duration) {
    return { type: 'slot', kind: state.sourceString as 'fast' | 'wait', activity: null, duration: minutes(duration) };
  },
  Slot_travel(_travel, duration) {
    return { type: 'slot', kind: 'travel', activity: null, duration: minutes(duration) };
  },
});

// Tokens and unknown words, in text order. Blanks produce nothing.
type Piece = Token | { type: null; text: string; from: number; to: number };
const TOKEN_NAMES = new Set(
  ['COUNT', 'DURATION', 'PERCENT', 'ACTIVITY', 'COLON', 'SEP', 'COMMA', 'WINDOW', 'DAY_ANCHOR', 'BEFORE', 'AFTER', 'STATE', 'QUALIFIER', 'REL', 'EDGE', 'OCCURRENCE', 'PRE', 'POST', 'TRAVEL', 'SEQUENCE', 'ADMISSION', 'RETURN', 'RETURN_MODE', 'HOSP', 'ANCHOR', 'FROM'],
);

semantics.addOperation<Piece[]>('pieces', {
  _nonterminal(...children) {
    const type = this.ctorName.toUpperCase();
    if (TOKEN_NAMES.has(type)) return [{ type, text: this.sourceString, ...span(this) }];
    if (this.ctorName.startsWith('unknown')) return [{ type: null, text: this.sourceString, ...span(this) }];
    return children.flatMap((child) => child.pieces());
  },
  _iter(...children) {
    return children.flatMap((child) => child.pieces());
  },
  _terminal() {
    return [];
  },
});

// --- adapter -------------------------------------------------------------------------------------------------

function lex(text: string) {
  const pieces: Piece[] = semantics(grammar.match(text, 'tokens')).pieces();
  const tokens = pieces.filter((piece): piece is Token => piece.type !== null);
  const diagnostics: Diagnostic[] = pieces
    .filter((piece) => piece.type === null)
    .map((piece) => ({
      severity: 'error',
      code: 'lex',
      message: piece.text.startsWith('"') ? 'Unterminated activity name' : `Unknown word "${piece.text}"`,
      from: piece.from,
      to: piece.to,
    }));
  return { pieces, tokens, diagnostics };
}

// Token names Ohm would accept at the failure, in grammar order. Ohm lists the failures last-tried first, so they
// are reversed. The end of a line is where SEP goes.
type Failure = { getText(): string; isDescription(): boolean };
function expectedAt(match: MatchResult): string[] {
  const failures = (match as MatchResult & { getRightmostFailures(): Failure[] }).getRightmostFailures();
  const names = [...failures]
    .reverse()
    .filter((failure) => failure.isDescription())
    .map((failure) => (failure.getText() === 'end of input' ? 'SEP' : failure.getText()))
    .filter((text) => TOKEN_NAMES.has(text));
  return [...new Set(names)];
}

// Splits the text at SEP tokens. Each line keeps its unknown words, so a lex error stays with its line.
function lines(pieces: Piece[]) {
  const result: Piece[][] = [[]];
  for (const piece of pieces) {
    if (piece.type === 'SEP') result.push([]);
    else result.at(-1)!.push(piece);
  }
  return result.filter((line) => line.length > 0);
}

const shift = (value: Span, by: number): Span => ({ from: value.from + by, to: value.to + by });

function parse(text: string) {
  const { pieces, diagnostics: lexErrors } = lex(text);
  const diagnostics: Diagnostic[] = [];
  const bodies: Array<{ subject: string | null; body: RuleBody | SlotBody; source: Span }> = [];
  const all = lines(pieces);
  const mode = all[0]?.[0]?.type === 'SEQUENCE' ? 'sequence' : 'rules';
  let block: Header | null = null;

  const error = (code: Diagnostic['code'], message: string, where: Span, expected?: string[]) =>
    diagnostics.push({ severity: 'error', code, message, ...where, ...(expected && expected.length > 0 ? { expected } : {}) });

  all.forEach((line, index) => {
    const from = line[0].from;
    const source = text.slice(from, line.at(-1)!.to);
    const start = mode === 'rules' ? 'Line' : index === 0 ? 'SequenceStart' : 'Slot';
    const match = grammar.match(source, start);

    if (match.failed()) {
      const at = from + match.getRightmostFailurePosition();
      const expected = expectedAt(match);
      const unknown = lexErrors.filter((diagnostic) => diagnostic.from >= from && diagnostic.to <= from + source.length);
      if (unknown.length > 0) unknown.forEach((diagnostic) => diagnostics.push(diagnostic.from === at && expected.length > 0 ? { ...diagnostic, expected } : diagnostic));
      else {
        const found = line.find((piece) => piece.from === at);
        error('parse', found ? `Unexpected "${found.text}"` : 'Unexpected end of statement', found ?? { from: at, to: at }, expected);
      }
      // Keep the header of a line whose statement failed, so the lines after it still have their block.
      const header = mode === 'rules' ? grammar.match(source, 'LineHeader') : null;
      if (header?.succeeded()) block = semantics(header).line().header;
      return;
    }

    if (mode === 'sequence') {
      if (index > 0) bodies.push({ subject: null, body: semantics(match).slot(), source: { from, to: from + source.length } });
      return;
    }

    const { header, statement }: Line = semantics(match).line();
    if (header) block = header;
    if (!statement) return;
    const where = shift(statement.span, from);

    if (statement.kind === 'placement') {
      if (block?.kind === 'anchor') bodies.push({ subject: statement.subject, body: statement.body(block.name), source: where });
      else error('parse', 'A placement is only valid inside an anchor block', where);
      return;
    }
    if (block === null) return error('parse', 'A statement needs a subject header before it', where);
    if (block.kind === 'anchor') return error('parse', 'Only placements are valid inside an anchor block', where);

    const body = statement.body;
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

export const ohmParser: RuleParser = {
  id: 'ohm',
  title: 'Ohm',
  tokenize(text) {
    const { tokens, diagnostics } = lex(text);
    return { tokens, diagnostics };
  },
  parse,
};
