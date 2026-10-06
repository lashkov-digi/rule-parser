# Rule DSL: lexeme dictionary

Source of truth for the rule DSL vocabulary. `lexemes.json` is generated from this file:

```sh
node rule-parser/generate-lexemes.mjs
```

The generator reads the **Rules**, **Dictionary** and **Examples** tables. Keep their columns as they are. Everything else in this file is for people.

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
| `count` | `COUNT` | The activity runs N times a day, with no timing. Derivation places the occurrences. |
| `dependency` | `AFTER`, `BEFORE`, `COUNT` | The activity runs after or before all listed activities, on every day they occur together. No time gap implied. An optional leading `COUNT` sets how many times it runs. |
| `fasting-wait` | `STATE` | A fast or a wait of a set duration, before or after the activity. |
| `spacing` | `COUNT` | The activity runs N times a day with a fixed gap between occurrences. |
| `composite` | `COUNT`, `REL` | The activity runs at offsets (pre, post N) from an anchor, each offset with an optional collection window. |
| `travel` | `TRAVEL` | Travel of a set duration that arrives before an anchor, with an optional return. |
| `hospitalization` | `HOSP` | The subject is hospitalized for N hours a day, starting at day start or at an activity. |

Four rules can start with `COUNT`. The token after it decides: `QUALIFIER` means spacing, `REL` means composite, `BEFORE` or `AFTER` means dependency, and `SEP` or end of input means count.

`ACTIVITY` starts a statement only as a header, so it is always followed by `COLON`.

## Dictionary

| Token | Kind | Lexemes | Pattern | Rules | Description |
| --- | --- | --- | --- | --- | --- |
| `COUNT` | literal | | `\d+x` | count, dependency, spacing, composite | Occurrences per day, e.g. `3x`. Optional in dependency and composite; in composite the offsets define the count. |
| `DURATION` | literal | | `\d+(\.\d+)?(min\|m\|h)` | fasting-wait, spacing, composite, travel, hospitalization | Time amount, e.g. `30m`, `90min`, `1.5h`. In hospitalization it is hours per day, from 1h to 24h; the parser checks the range, not the lexer. |
| `PERCENT` | literal | | `\d+(\.\d+)?%` | composite | Window as a percentage of the offset, e.g. `10%`. |
| `ACTIVITY` | string | | `"[^"]+"` | subject, dependency, composite, travel, hospitalization | Activity name in double quotes, e.g. `"Chest X-ray"`. No escapes in the POC. |
| `COLON` | separator | `:` | | subject | Ends an activity header. |
| `SEP` | separator | `;` | `\r?\n` | subject, count, dependency, fasting-wait, spacing, composite, travel, hospitalization | Ends a statement. Humans write newlines, machines write `;`. Repeated, leading and trailing separators are ignored, so blank lines are fine. |
| `COMMA` | separator | `,` | | dependency, composite | List separator. |
| `WINDOW` | operator | `±` / `+-` | | composite | Collection window for the offset right before it. Followed by `DURATION` or `PERCENT`. `+-` is the ASCII alias. |
| `DAY_ANCHOR` | keyword | `day-start`, `day-end` | | composite, travel, hospitalization | Start of the day (arrival on site) or end of the day. `day-end` is valid only in composite. |
| `BEFORE` | keyword | `before` | | dependency, fasting-wait, travel | Dependency: runs before. Fasting/wait: the slot comes before the activity. Travel: arrives before the anchor. |
| `AFTER` | keyword | `after` | | dependency, fasting-wait | Dependency: runs after. Fasting/wait: the slot comes after the activity. |
| `STATE` | keyword | `fast`, `wait` | | fasting-wait | Slot type. Starts a fasting or wait statement. |
| `QUALIFIER` | keyword | `exactly` / `=`, `approximately` / `approx` / `~`, `atleast` / `>=` | | spacing | How strict the gap between occurrences is. Required. |
| `REL` | keyword | `rel` | | composite | "Relative to". Starts the anchor clause. |
| `EDGE` | keyword | `start`, `end` | | composite | Which end of the anchor activity the offsets are measured from. Optional, default `start`. |
| `OCCURRENCE` | keyword | `each`, `first`, `last` | | composite | Which occurrence of the anchor activity to use when it happens more than once that day. Optional, default `each`. |
| `PRE` | keyword | `pre` | | composite | An occurrence right before the anchor. |
| `POST` | keyword | `post` | | composite | Occurrences after the anchor. Followed by one or more `DURATION`, each with an optional `WINDOW`. |
| `TRAVEL` | keyword | `travel` | | travel | Starts a travel statement. |
| `ADMISSION` | keyword | `admission` | | travel | Hospital admission as the arrival anchor. Valid only on a day with hospitalization. |
| `RETURN` | keyword | `return` | | travel | Starts the optional return clause. |
| `RETURN_MODE` | keyword | `none`, `same`, `discharge` | | travel | `none`: no return travel. `same`: the same duration, after day end. `discharge`: after discharge. A `DURATION` in its place means a different return duration. |
| `HOSP` | keyword | `hosp` | | hospitalization | Starts a hospitalization statement. |
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

## Semantics decisions

Not lexer concerns. They are recorded here so the parser and the timeline derivation follow the same rules.

- **Bare count:** `3x` with no timing is valid. Derivation places the occurrences (CDT order, auto-fit into gaps).
- **Dependencies between repeated activities pair by occurrence:** with `3x before "PK sampling"` and 3 PK draws, the 1st Vital Signs goes before the 1st PK draw, the 2nd before the 2nd, and so on.
- **Unequal counts pair up to the smaller count:** a single ECG `after "Vital Signs"` (3x) follows the 1st Vital Signs. The unpaired occurrences fall back to CDT order, and the derived trace marks them as unpaired.
- **Derived waits are output, not input:** "an hour between each occurrence" and "1h - (ECG + Vital Signs)" come from derivation. They have no DSL form.
- **Product scenario, expected timeline:** Vital Signs and 12-lead ECG run inside the 1h waits between PK draws, so each idle wait is 1h - (Vital Signs + ECG). The product text says "Vital signs and PK Sampling" here; that is a typo for ECG.

## Lexer notes

- **Spaces and tabs** separate tokens and are skipped. **Newlines are not whitespace:** they lex as `SEP`. Spaces are not required around `,`, `:`, `;` and `±` (`pre,post` and `±6m` both lex).
- **Longest match wins.** `day-start` beats `start`, `>=` beats `=`, `90min` is one `DURATION`.
- **No bare identifiers.** Activities are always quoted, so any unknown bare word is a lexer error.
- **Keywords are lowercase** and case-sensitive.
- **One lexeme, one token.** `before` and `after` are single tokens shared by several rules. The parser gives them a role from the statement they appear in.
- **Hours are not a token.** Hospitalization hours lex as `DURATION`; the 1h to 24h range is a parser check.
