// Types from ../contract.md. Derivation reads ParseResult + DayConfig and returns TimelineResult.

export type Minutes = number;
export type Span = { from: number; to: number };

export type Diagnostic = Span & {
  severity: 'error' | 'warning';
  code: 'lex' | 'parse' | 'semantic';
  message: string;
  expected?: string[];
};

// Parser output (commands)

type Base = { id: string; subject: string; source: Span };

export type Anchor = { kind: 'activity'; name: string } | { kind: 'day'; at: 'day-start' | 'day-end' };
export type Window = { kind: 'duration'; value: Minutes } | { kind: 'percent'; value: number };
export type Offset = { kind: 'pre' } | { kind: 'post'; after: Minutes; window: Window | null };

export type RuleCommand =
  | (Base & { type: 'count'; count: number })
  | (Base & { type: 'dependency'; count: number | null; direction: 'before' | 'after'; targets: string[] })
  | (Base & { type: 'fasting-wait'; state: 'fast' | 'wait'; duration: Minutes; position: 'before' | 'after' })
  | (Base & { type: 'spacing'; count: number; qualifier: 'exactly' | 'approximately' | 'atleast'; gap: Minutes })
  | (Base & {
      type: 'composite';
      count: number | null;
      anchor: Anchor;
      edge: 'start' | 'end';
      occurrence: 'each' | 'first' | 'last';
      offsets: Offset[];
    })
  | (Base & {
      type: 'travel';
      duration: Minutes;
      arriveBefore: { kind: 'activity'; name: string } | { kind: 'admission' } | null;
      return: { mode: 'none' | 'same' | 'discharge' } | { mode: 'duration'; duration: Minutes } | null;
    })
  | (Base & { type: 'hospitalization'; duration: Minutes; from: Anchor });

export type SlotCommand = {
  id: string;
  type: 'slot';
  kind: 'activity' | 'wait' | 'fast' | 'travel';
  activity: string | null;
  duration: Minutes;
  source: Span;
};

export type Command = RuleCommand | SlotCommand;

export type ParseResult = {
  version: 1;
  mode: 'rules' | 'sequence';
  commands: Command[];
  diagnostics: Diagnostic[];
};

// Configuration that is not part of the text

export type DayConfig = {
  activities: Record<string, { duration: Minutes }>; // the activity catalog
  cdtOrder: string[]; // tie-break order, earliest first
};

// Derivation output (items)

export type Flag = 'unpaired' | 'derived-wait' | 'overlap';

export type Item = {
  id: string;
  kind: 'activity' | 'fast' | 'wait' | 'travel' | 'hospitalization';
  activities: string[];
  occurrence: { n: number; of: number } | null;
  together: string | null;
  placement: { kind: 'fixed'; start: Minutes } | { kind: 'auto-fit'; from: Minutes; to: Minutes };
  duration: Minutes;
  gap: Minutes | null; // idle time since the previous activity, wait or travel ended; null when there is none
  isAnchor: boolean;
  window: { before: Minutes; after: Minutes } | null;
  commandIds: string[];
  flags: Flag[];
};

export type TimelineResult = {
  version: 1;
  anchorAt: Minutes | null; // T 0; null when the day has no anchor (legacy days, rules without `rel`)
  items: Item[];
  summary: { onSite: Minutes; withTravel: Minutes };
  diagnostics: Diagnostic[];
};
