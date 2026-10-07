# Rule DSL: lexeme dictionary

Source of truth for the rule DSL vocabulary. `lexemes.json` is generated from this file:

```sh
node rule-parser/generate-lexemes.mjs
```

The generator reads the **Rules**, **Dictionary** and **Examples** tables. Keep their columns as they are. Everything else in this file is for people.

What the parser outputs (commands, timeline items, UI components) is defined in `contract.md`. The library comparison task is in `task.md`.

## Intent

- **Outcome:** a library-neutral dictionary of lexemes for the rule DSL: token name, kind, lexemes or pattern, the rules that use it, and its meaning.
- **User:** the tech team first. It is the shared spec for the parser, the timeline derivation and the UI. Product sees it later through the demo.
- **Why now:** the DSL is an intermediate language. The UI described in the PRD generates text, a parser turns it back into rules, and a timeline is derived from them. The vocabulary has to be fixed before anything is built on it.
- **Success:** every in-scope PRD rule can be written with these lexemes only. Each lexeme is one whitespace-free word, symbol or literal, or a quoted activity name. A new rule only adds entries and never changes existing ones.
- **Constraint:** POC simplicity. No day references, row overrides, `on`, `except` or `@`. CDT order and Concurrent sampling are configuration, not language.
- **Out of scope:** lexer/parser library choice, the grammar, timeline derivation, the UI, the product demo.

Source PRD: [FSD: Replace Intraday with SoA Rules](https://farohealth.atlassian.net/wiki/spaces/PROD/pages/4323541016/PRD+FSD+Replace+Intraday+with+SoA+Rules)

## Rules

| Rule | Starts with | Description |
| --- | --- | --- |
| `subject` | `ACTIVITY` | Activity header `"Name":`. Every statement after it belongs to that activity, until the next header. |
| `anchor` | `ANCHOR` | Anchor header `anchor "Name":`. Every statement after it is a placement, until the next header. |
| `placement` | `ACTIVITY` | Inside an anchor block only. Places the quoted activity: offsets from the block's anchor (`[COUNT] [EDGE] [OCCURRENCE] PRE/POST ...`, as in composite without `REL ACTIVITY`), or a dependency with explicit targets. |
| `count` | `COUNT` | The activity runs N times a day, with no timing. Derivation places the occurrences. |
| `dependency` | `AFTER`, `BEFORE`, `COUNT` | The activity runs after or before all listed activities, on every day they occur together. No time gap implied. An optional leading `COUNT` sets how many times it runs. |
| `fasting-wait` | `STATE` | A fast or a wait of a set duration, before or after the activity. |
| `spacing` | `COUNT` | The activity runs N times a day with a fixed gap between occurrences. |
| `composite` | `COUNT`, `REL` | The activity runs at offsets (pre, post N) from an anchor, each offset with an optional collection window. |
| `travel` | `TRAVEL` | Travel of a set duration that arrives before an anchor, with an optional return. |
| `hospitalization` | `HOSP` | The subject is hospitalized for N hours a day, starting at day start or at an activity. |
| `sequence` | `SEQUENCE` | Legacy mode: a hand-built day written literally, one slot per statement in time order. Slots are `ACTIVITY DURATION`, `STATE DURATION` or `TRAVEL DURATION`. No rules, no derivation. |

Four rules can start with `COUNT`. The token after it decides: `QUALIFIER` means spacing, `REL` means composite, `BEFORE` or `AFTER` means dependency, and `SEP` or end of input means count.

`ACTIVITY` at the start of a statement is a subject header when `COLON` follows it. Otherwise it is a placement, which is valid only inside an anchor block. Inside a placement, after the optional `COUNT`: `EDGE`, `OCCURRENCE`, `PRE` or `POST` means offsets from the anchor, and `BEFORE` or `AFTER` means a dependency.

**Two kinds of header, one role each.** A subject header (`"Name":`) names the subject of the statements after it. An anchor header (`anchor "Name":`) names the anchor of the placements after it. A block lasts until the next header of either kind.

**Two modes, one lexer.** If the text starts with `SEQUENCE`, the parser reads the whole text with the sequence grammar. Otherwise it uses the rules grammar. A text is one mode from start to end; there is no switching in the middle. Both modes share the same tokens.

## Dictionary

| Token | Kind | Lexemes | Pattern | Rules | Description |
| --- | --- | --- | --- | --- | --- |
| `COUNT` | literal | | `\d+x` | count, dependency, spacing, composite, placement | Occurrences per day, e.g. `3x`. Optional in dependency and composite; in composite the offsets define the count. |
| `DURATION` | literal | | `\d+(\.\d+)?(min\|m\|h)` | fasting-wait, spacing, composite, travel, hospitalization, sequence, placement | Time amount, e.g. `30m`, `90min`, `1.5h`. In hospitalization it is hours per day, from 1h to 24h; the parser checks the range, not the lexer. |
| `PERCENT` | literal | | `\d+(\.\d+)?%` | composite, placement | Window as a percentage of the offset, e.g. `10%`. |
| `ACTIVITY` | string | | `"[^"]+"` | subject, dependency, composite, travel, hospitalization, sequence, anchor, placement | Activity name in double quotes, e.g. `"Chest X-ray"`. No escapes in the POC. |
| `COLON` | separator | `:` | | subject, anchor | Ends a subject or anchor header. |
| `SEP` | separator | `;` | `\r?\n` | subject, count, dependency, fasting-wait, spacing, composite, travel, hospitalization, sequence, anchor, placement | Ends a statement. Humans write newlines, machines write `;`. Repeated, leading and trailing separators are ignored, so blank lines are fine. |
| `COMMA` | separator | `,` | | dependency, composite, placement | List separator. |
| `WINDOW` | operator | `±` / `+-` | | composite, placement | Collection window for the offset right before it. Followed by `DURATION` or `PERCENT`. `+-` is the ASCII alias. |
| `DAY_ANCHOR` | keyword | `day-start`, `day-end` | | composite, travel, hospitalization | Start of the day (arrival on site) or end of the day. `day-end` is valid only in composite. |
| `BEFORE` | keyword | `before` | | dependency, fasting-wait, travel, placement | Dependency: runs before. Fasting/wait: the slot comes before the activity. Travel: arrives before the anchor. |
| `AFTER` | keyword | `after` | | dependency, fasting-wait, placement | Dependency: runs after. Fasting/wait: the slot comes after the activity. |
| `STATE` | keyword | `fast`, `wait` | | fasting-wait, sequence | Slot type. Starts a fasting or wait statement. In sequence mode, `STATE DURATION` is a fasting or wait slot. |
| `QUALIFIER` | keyword | `exactly` / `=`, `approximately` / `approx` / `~`, `atleast` / `>=` | | spacing | How strict the gap between occurrences is. Required. |
| `REL` | keyword | `rel` | | composite | "Relative to". Starts the anchor clause. |
| `EDGE` | keyword | `start`, `end` | | composite, placement | Which end of the anchor activity the offsets are measured from. Optional, default `start`. |
| `OCCURRENCE` | keyword | `each`, `first`, `last` | | composite, placement | Which occurrence of the anchor activity to use when it happens more than once that day. Optional, default `each`. |
| `PRE` | keyword | `pre` | | composite, placement | An occurrence right before the anchor. |
| `POST` | keyword | `post` | | composite, placement | Occurrences after the anchor. Followed by one or more `DURATION`, each with an optional `WINDOW`. |
| `TRAVEL` | keyword | `travel` | | travel, sequence | Starts a travel statement. In sequence mode, `TRAVEL DURATION` is a travel slot. |
| `SEQUENCE` | keyword | `sequence` | | sequence | First token of a legacy text. Switches the parser to the sequence grammar for the whole text. |
| `ADMISSION` | keyword | `admission` | | travel | Hospital admission as the arrival anchor. Valid only on a day with hospitalization. |
| `RETURN` | keyword | `return` | | travel | Starts the optional return clause. |
| `RETURN_MODE` | keyword | `none`, `same`, `discharge` | | travel | `none`: no return travel. `same`: the same duration, after day end. `discharge`: after discharge. A `DURATION` in its place means a different return duration. |
| `HOSP` | keyword | `hosp` | | hospitalization | Starts a hospitalization statement. |
| `ANCHOR` | keyword | `anchor` | | anchor | Starts an anchor header. Followed by `ACTIVITY` and `COLON`. |
| `FROM` | keyword | `from` | | hospitalization | Start point of the hospitalization. Optional, default `day-start`. |

## Examples

| Rule | Text | Tokens |
| --- | --- | --- |
| dependency | `after "Vital Signs", "Chest X-ray"` | `AFTER ACTIVITY COMMA ACTIVITY` |
| dependency | `before "PK sampling"` | `BEFORE ACTIVITY` |
| dependency | `3x before "PK sampling"` | `COUNT BEFORE ACTIVITY` |
| count | `3x` | `COUNT` |
| subject | `"PK sampling": 3x rel "IP Administration" pre, post 1h 2h; "Vital Signs": 3x before "PK sampling"; "12-lead ECG": after "Vital Signs"` | `ACTIVITY COLON COUNT REL ACTIVITY PRE COMMA POST DURATION DURATION SEP ACTIVITY COLON COUNT BEFORE ACTIVITY SEP ACTIVITY COLON AFTER ACTIVITY` |
| subject | `"PK sampling": fast 8h before; after "Vital Signs"; rel "IP Administration" pre, post 1h 2h 4h` | `ACTIVITY COLON STATE DURATION BEFORE SEP AFTER ACTIVITY SEP REL ACTIVITY PRE COMMA POST DURATION DURATION DURATION` |
| anchor | `anchor "IP Administration": "PK sampling" 3x pre, post 1h 2h; "Vital Signs" 3x before "PK sampling"; "12-lead ECG" after "Vital Signs"` | `ANCHOR ACTIVITY COLON ACTIVITY COUNT PRE COMMA POST DURATION DURATION SEP ACTIVITY COUNT BEFORE ACTIVITY SEP ACTIVITY AFTER ACTIVITY` |
| placement | `"PK sampling" 4x end first pre, post 1h ±6m` | `ACTIVITY COUNT EDGE OCCURRENCE PRE COMMA POST DURATION WINDOW DURATION` |
| sequence | `sequence; "Vital Signs" 15m; "12 Lead ECG" 8m; "PK Sampling (Serum)" 5m; "IP Administration - Oral" 1m; wait 40m; "PK Sampling (Serum)" 5m` | `SEQUENCE SEP ACTIVITY DURATION SEP ACTIVITY DURATION SEP ACTIVITY DURATION SEP ACTIVITY DURATION SEP STATE DURATION SEP ACTIVITY DURATION` |
| sequence | `sequence; fast 8h; travel 30m; "Vital Signs" 15m` | `SEQUENCE SEP STATE DURATION SEP TRAVEL DURATION SEP ACTIVITY DURATION` |
| fasting-wait | `fast 10h before` | `STATE DURATION BEFORE` |
| fasting-wait | `wait 4h after` | `STATE DURATION AFTER` |
| spacing | `3x exactly 6h` | `COUNT QUALIFIER DURATION` |
| spacing | `2x >= 90min` | `COUNT QUALIFIER DURATION` |
| composite | `4x rel "IP Administration" end first pre, post 1h ±6m 2h ±12m 4h ±24m` | `COUNT REL ACTIVITY EDGE OCCURRENCE PRE COMMA POST DURATION WINDOW DURATION DURATION WINDOW DURATION DURATION WINDOW DURATION` |
| composite | `rel day-start post 2h +-10%` | `REL DAY_ANCHOR POST DURATION WINDOW PERCENT` |
| travel | `travel 30m before "IP Administration" return same` | `TRAVEL DURATION BEFORE ACTIVITY RETURN RETURN_MODE` |
| travel | `travel 45m before admission return discharge` | `TRAVEL DURATION BEFORE ADMISSION RETURN RETURN_MODE` |
| travel | `travel 30m return 1h` | `TRAVEL DURATION RETURN DURATION` |
| hospitalization | `hosp 24h from day-start` | `HOSP DURATION FROM DAY_ANCHOR` |
| hospitalization | `hosp 6h from "IP Administration"` | `HOSP DURATION FROM ACTIVITY` |

The first `subject` example is the product scenario (IP Administration with no rules, PK sampling, Vital Signs, 12-lead ECG). Written by a human, it reads:

```
"PK sampling":
  3x rel "IP Administration" pre, post 1h 2h
"Vital Signs":
  3x before "PK sampling"
"12-lead ECG":
  after "Vital Signs"
```

The same scenario written anchor-first. It produces the same commands:

```
anchor "IP Administration":
  "PK sampling" 3x pre, post 1h 2h
  "Vital Signs" 3x before "PK sampling"
  "12-lead ECG" after "Vital Signs"
```

A hand-built day (legacy intraday) in sequence mode, as a human writes it:

```
sequence
"Vital Signs" 15m
"12 Lead ECG" 8m
"PK Sampling (Serum)" 5m
"IP Administration - Oral" 1m
"Vital Signs" 15m
"12 Lead ECG" 8m
wait 40m
"PK Sampling (Serum)" 5m
"Vital Signs" 15m
"12 Lead ECG" 8m
wait 40m
"PK Sampling (Serum)" 5m
```

## Semantics decisions

Not lexer concerns. They are recorded here so the parser and the timeline derivation follow the same rules.

- **Anchor-first and subject-first are the same rules:** a placement is the statement its activity would have under its own subject header. `"PK sampling" 3x pre, post 1h 2h` under `anchor "IP Administration":` is `"PK sampling": 3x rel "IP Administration" pre, post 1h 2h`. A dependency placement is copied as written: its targets are always explicit and never default to the anchor. The parser emits the same commands for both forms, and the two forms can be mixed in one text.
- **Placements carry offsets and dependencies only.** Other rules for an activity (count, spacing, fasting-wait, travel, hospitalization) go under its subject header. Rules for the anchor itself go under a subject header for the anchor.
- **Bare count:** `3x` with no timing is valid. Derivation places the occurrences (CDT order, auto-fit into gaps).
- **Dependencies between repeated activities pair by occurrence:** with `3x before "PK sampling"` and 3 PK draws, the 1st Vital Signs goes before the 1st PK draw, the 2nd before the 2nd, and so on.
- **A dependency without a count inherits the count of its target:** `"12-lead ECG": after "Vital Signs"` with Vital Signs at 3x runs the ECG 3 times, one after each Vital Signs. A written count always wins.
- **Unequal written counts pair up to the smaller count:** with `1x after "Vital Signs"` (3x), the ECG follows the 1st Vital Signs. The unpaired occurrences fall back to CDT order, and the derived trace marks them as unpaired.
- **Placement:** an activity with no fixed time runs as early as possible after the previous fixed occurrence. Before the first fixed occurrence it packs right up against it, which is where the day starts. The full rule is in `contract.md`, Items.
- **Post offsets count only the time in between:** the anchor's own duration and the subject's earlier post occurrences do not use up the offset. With IP Administration (1 min) and PK sampling (5 min), `post 1h 2h` puts the draws at IP end + 1h and at the 1st post draw's end + 1h, so the wait in each hour is exactly 1h - (Vital Signs + ECG).
- **Derived waits are output, not input:** "an hour between each occurrence" and "1h - (ECG + Vital Signs)" come from derivation. They have no DSL form.
- **Product scenario, expected timeline:** Vital Signs and 12-lead ECG run inside the 1h waits between PK draws, so each idle wait is 1h - (Vital Signs + ECG). The product text says "Vital signs and PK Sampling" here; that is a typo for ECG. Derivation shows the idle time as wait rows flagged `derived-wait`, so the result has the same shape as the legacy day.

- **Sequence mode is literal:** slots run in written order from day start, each for its stated duration. The timeline is the running sum, with no derivation. Legacy days stay in sequence mode until a person or an AI converts them to rules with a separate tool; the parser never converts.
- **Open (sequence mode):** several activities in one legacy slot, and legacy slot names. Today neither can be written; decide whether to drop them or add grouping (`"A", "B" 23m`) and names.

## Lexer notes

- **Spaces and tabs** separate tokens and are skipped. **Newlines are not whitespace:** they lex as `SEP`. Spaces are not required around `,`, `:`, `;` and `±` (`pre,post` and `±6m` both lex).
- **Longest match wins.** `day-start` beats `start`, `>=` beats `=`, `90min` is one `DURATION`.
- **No bare identifiers.** Activities are always quoted, so any unknown bare word is a lexer error.
- **Keywords are lowercase** and case-sensitive.
- **One lexeme, one token.** `before` and `after` are single tokens shared by several rules. The parser gives them a role from the statement they appear in.
- **Hours are not a token.** Hospitalization hours lex as `DURATION`; the 1h to 24h range is a parser check.
