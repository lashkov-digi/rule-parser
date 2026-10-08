# Rule DSL: parser and UI contract

What the parser hands to the UI. It sits next to `lexemes.md` (the vocabulary) and defines three things:

- **Commands:** the parser output. One command per statement.
- **Items:** the timeline output. One item per block on the day, derived from commands.
- **UI components:** what the UI renders from commands and items, and which fields each component reads.

Expected outputs live in `fixtures/`. They are the acceptance tests for every library we try.

## Pipeline

```
text --lexer--> tokens --parser--> ParseResult (commands) --derivation--> TimelineResult (items) --> UI
  ^                                      |
  +----------------- printer ------------+
```

- **Lexer and parser** are the only library-specific parts. Each library under test implements `tokenize` and `parse` behind the same interface.
- **Derivation** reads commands plus configuration (activity durations, CDT order). It does not depend on the parser library, so it is written once. It lives in `ui/src/derivation/`, kept apart from the components. Run its tests with `npm test` in `ui/`.
- **Printer** turns commands back into canonical text. The PRD UI builds commands from forms and saves text, so the round trip has to hold: `parse(print(commands)).commands` equals `commands`, ignoring `source`.

```ts
tokenize(text: string): { tokens: Token[]; diagnostics: Diagnostic[] }
parse(text: string): ParseResult
print(commands: Command[]): string           // shared, library-independent
derive(result: ParseResult, config: DayConfig): TimelineResult  // shared, library-independent
```

## Shared types

- **Durations are minutes** (`number`). `1.5h` becomes `90`. The UI never parses `30m`.
- **Source spans** are character offsets into the input text, `from` inclusive, `to` exclusive. The UI uses them to underline errors and to highlight the statement behind a command or an item.
- **Activity names** are the text inside the quotes, without the quotes.

```ts
type Minutes = number;
type Span = { from: number; to: number };

type Token = { type: string; text: string } & Span;   // type is a token name from lexemes.md

type Diagnostic = Span & {
  severity: 'error' | 'warning';
  code: 'lex' | 'parse' | 'semantic';
  message: string;          // human text, free per library
  expected?: string[];      // token names valid at this position, for errors and autocomplete
};
```

Fixtures compare `severity`, `code`, `from`, `to` and `expected`. They do not compare `message`, so each library can word it as it likes. Comparing the messages side by side is part of the evaluation.

## Commands

The parser returns one `ParseResult`. A text that fails to parse still returns every command it could read, plus diagnostics.

```ts
type ParseResult = {
  version: 1;
  mode: 'rules' | 'sequence';   // 'sequence' when the text starts with the SEQUENCE token
  commands: Command[];
  diagnostics: Diagnostic[];
};

type Command = RuleCommand | SlotCommand;
```

Every command has `id` (`c1`, `c2`, ... in written order) and `source` (the statement span, without the separator). Headers do not produce commands. A subject header sets `subject` on every command after it. In an anchor block, each placement produces the command its activity would have under its own subject header: `subject` is the placement's activity, and an offset placement becomes a `composite` command whose `anchor` is the block's anchor.

### Rules mode

| `type` | Rule in lexemes.md | Example text |
| --- | --- | --- |
| `count` | count | `3x` |
| `dependency` | dependency | `3x before "PK sampling"` |
| `fasting-wait` | fasting-wait | `fast 10h before` |
| `spacing` | spacing | `3x exactly 6h` |
| `composite` | composite | `4x rel "IP Administration" end first pre, post 1h ±6m 2h` |
| `travel` | travel | `travel 30m before "IP Administration" return same` |
| `hospitalization` | hospitalization | `hosp 6h from "IP Administration"` |

```ts
type Base = { id: string; subject: string; source: Span };

type Anchor =
  | { kind: 'activity'; name: string }
  | { kind: 'day'; at: 'day-start' | 'day-end' };

type Window =
  | { kind: 'duration'; value: Minutes }   // ±6m
  | { kind: 'percent'; value: number };    // ±10%, value is 10

type RuleCommand =
  | (Base & { type: 'count'; count: number })
  | (Base & {
      type: 'dependency';
      count: number | null;                // null when no COUNT is written
      direction: 'before' | 'after';
      targets: string[];                   // activity names, in written order
    })
  | (Base & {
      type: 'fasting-wait';
      state: 'fast' | 'wait';
      duration: Minutes;
      position: 'before' | 'after';        // the slot is before or after the subject
    })
  | (Base & {
      type: 'spacing';
      count: number;
      qualifier: 'exactly' | 'approximately' | 'atleast';  // aliases are normalized: '=' -> 'exactly'
      gap: Minutes;
    })
  | (Base & {
      type: 'composite';
      count: number | null;
      anchor: Anchor;
      edge: 'start' | 'end';               // default 'start'
      occurrence: 'each' | 'first' | 'last';  // default 'each'
      offsets: Array<
        | { kind: 'pre' }
        | { kind: 'post'; after: Minutes; window: Window | null }
      >;
    })
  | (Base & {
      type: 'travel';
      duration: Minutes;
      arriveBefore: { kind: 'activity'; name: string } | { kind: 'admission' } | null;  // null: before the subject
      return:
        | { mode: 'none' | 'same' | 'discharge' }
        | { mode: 'duration'; duration: Minutes }
        | null;                            // null: no RETURN clause written
    })
  | (Base & {
      type: 'hospitalization';
      duration: Minutes;                   // 60 to 1440, checked by the parser
      from: Anchor;                        // default { kind: 'day', at: 'day-start' }
    });
```

Defaults are filled in by the parser, so the UI never guesses. The written text is still available through `source`.

`count` on composite and dependency stays `null` when it is not written. Derivation decides what it means (for composite, the number of offsets).

A statement before the first header has no subject. That is a `parse` error, and the command is dropped. So is a placement outside an anchor block, and a non-placement statement inside one.

### Sequence mode

Each slot becomes one `slot` command. There is no subject.

```ts
type SlotCommand = {
  id: string;
  type: 'slot';
  kind: 'activity' | 'wait' | 'fast' | 'travel';
  activity: string | null;   // set only when kind is 'activity'
  duration: Minutes;
  source: Span;
};
```

## Items

Derivation turns commands into a flat list of items for one day. The UI draws items, not commands, and holds no timing logic: times, waits, gaps and the summary all come from `derive()`.

```ts
type DayConfig = {
  activities: Record<string, { duration: Minutes }>;  // from the activity catalog
  cdtOrder: string[];                                 // activity names, earliest first
};

type TimelineResult = {
  version: 1;
  anchorAt: Minutes | null;    // T 0 from a `rel` anchor; null for legacy days and rules without `rel`
  items: Item[];               // sorted by start, then by CDT order
  summary: { onSite: Minutes; withTravel: Minutes };
  diagnostics: Diagnostic[];   // semantic problems, e.g. a dependency loop; spans point at the command
};

type Item = {
  id: string;                  // i1, i2, ...
  kind: 'activity' | 'wait' | 'fast' | 'travel' | 'hospitalization';
  activities: string[];        // several names when they share a slot; empty for wait, fast, travel and hospitalization
  occurrence: { n: number; of: number } | null;  // "2 of 4"
  together: string | null;     // why activities share one slot, e.g. "same sample type"
  placement:
    | { kind: 'fixed'; start: Minutes }                   // minutes from arrival on site
    | { kind: 'auto-fit'; from: Minutes; to: Minutes };   // no timing rule; fits anywhere in this free window
  duration: Minutes;
  gap: Minutes | null;         // activities only: idle time since the previous activity, wait or travel ended
  isAnchor: boolean;
  window: { before: Minutes; after: Minutes } | null;  // collection window, percent already resolved
  commandIds: string[];        // commands that placed this item
  flags: Array<'unpaired' | 'derived-wait' | 'overlap'>;
};
```

- **Placement in rules mode:** composite offsets fix occurrences around the anchor. Every other occurrence runs as early as possible after the previous fixed occurrence, in dependency order, then CDT order. Before the first fixed occurrence there is nothing to follow, so those occurrences pack right up against it; that is where the day starts.
- **`derived-wait`** marks a wait that no command asked for, such as the idle time between PK draws. Derived waits are output only (see `lexemes.md`, semantics decisions).
- **`unpaired`** marks an occurrence that had no partner in a dependency and fell back to CDT order.
- **`overlap`** marks an item that overlaps another one on the same subject. Derivation reports it and does not fix it.
- **Fasting and waits** become `fast` and `wait` items around every occurrence of their subject. A fast runs alongside other items; an explicit wait blocks its time, so nothing else is placed inside it.
- **Hospitalization** is an item too. It starts at the first occurrence of its activity, or at arrival on site, and counts as on-site time. The UI draws it as a background band, not as a bar.
- **Sequence mode** maps one slot to one item, in order, with `start` as the running sum.

The POC derivation supports count, dependency, composite, fasting-wait and hospitalization in rules mode, plus all of sequence mode. Other rules return a `semantic` warning instead of items.

## UI components

The UI is built by hand and is out of scope for the parser task. This section only fixes which data each component reads, so the parser output covers it.

| Component | Reads | Shows |
| --- | --- | --- |
| `RuleEditor` | input text, `diagnostics` | Text editor. Underlines each diagnostic span. Offers `expected` tokens as completions. |
| `CommandList` | `ParseResult` | Parsed commands grouped by `subject`, in written order. Proves what the parser understood. |
| `CommandCard` | one `Command` | One card per `type`. Reads only the typed fields, never `source` text. Hovering it highlights `source` in the editor. |
| `ItemsTable` | `TimelineResult` | Table: At (relative to `anchorAt`, with the window), Gap, State, Activity, Duration, and a summary row. Built in `ui/`. |
| `HospitalizationBand` | `Item` with kind `hospitalization` | Background band behind all rows. Not built yet. |
| `WindowWhisker` | `Item.window` | Whiskers around the bar for the collection window. Not built yet. |
| `DiagnosticList` | `diagnostics` from both results | Errors and warnings, each linking to its span. |

## Fixtures

| Input | Expected | Covers |
| --- | --- | --- |
| `fixtures/product-scenario.txt` | `product-scenario.parse.json`, `product-scenario.items.json` | Rules mode, headers, newline separators, composite with pre and post, dependency with and without count, derived waits. |
| `fixtures/anchor-scenario.txt` | `anchor-scenario.parse.json`, `anchor-scenario.items.json` | The product scenario written anchor-first. Same commands and items as `product-scenario`; only the spans differ. |
| `fixtures/fasting-scenario.txt` | `fasting-scenario.parse.json`, `fasting-scenario.items.json` | The product scenario plus a fast and an observation wait around IP Administration, a rest before every Vital Signs, and a hospitalization from IP Administration. |
| `fixtures/legacy-day.txt` | `legacy-day.parse.json`, `legacy-day.items.json` | Sequence mode, and the items for a literal day. |
| `fixtures/typo-error.txt` | `typo-error.parse.json` | A lexer error with its span and the expected tokens. |
| `fixtures/scenarios.json` | the same file | The product scenario (subject-first and anchor-first), the full legacy day and the fasting scenario: text, tokens, parse result and config. The UI reads it and runs `derive()`. |

The `Examples` table in `lexemes.md` (and `examples` in `lexemes.json`) is the token-level fixture set for `tokenize`.

`*.items.json` are worked out by hand and are the expected output of `derive(<name>.parse.json, <name>.config.json)`. The derivation tests check them. In the product scenario the 12-lead ECG runs 3 times (a dependency without a count inherits its target's count), and the gaps between PK draws are `derived-wait` rows, so it matches the legacy day row for row.

## Open questions

- **Sequence mode grouping and slot names:** still open in `lexemes.md`. Adding them changes `SlotCommand`.
