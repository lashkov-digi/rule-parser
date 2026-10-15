# Rule parser

A proof of concept for the SoA rule DSL: a small text language that describes when activities happen on a study day. The UI from the PRD ([FSD: Replace Intraday with SoA Rules](https://farohealth.atlassian.net/wiki/spaces/PROD/pages/4323541016/PRD+FSD+Replace+Intraday+with+SoA+Rules)) builds this text from forms, a parser turns it back into commands, and a derivation step lays the commands out as a timeline.

The main goal is to pick a lexer/parser library. Every candidate implements the same interface and runs against the same fixtures, so the libraries can be compared fairly.

```
"PK sampling":
  3x rel "IP Administration" pre, post 1h 2h
"Vital Signs":
  3x before "PK sampling"
"12-lead ECG":
  after "Vital Signs"
```

## Pipeline

```mermaid
flowchart LR
    text[DSL text] -->|tokenize| tokens[Tokens]
    tokens -->|parse| result[ParseResult<br/>commands + diagnostics]
    result -->|derive + DayConfig| timeline[TimelineResult<br/>items + summary]
    timeline --> ui[UI]
    result -.->|print| text

    subgraph lib [Per library]
        tokens
        result
    end
```

Only `tokenize` and `parse` depend on the library. The printer, the derivation and the UI are written once and read the shared `ParseResult`.

The text has two modes, picked by the first token:

- **Rules mode:** activity headers (`"Name":`) or anchor headers (`anchor "Name":`), each followed by rules such as count, dependency, fasting-wait, spacing, composite, travel and hospitalization.
- **Sequence mode:** text that starts with `sequence` is a literal day, one slot per line (`"Vital Signs" 15m`, `wait 40m`).

## Layout

| Path | What it is |
| --- | --- |
| [`lexemes.md`](lexemes.md) | Source of truth for the vocabulary: tokens, rules, examples and semantics decisions |
| `lexemes.json` | Generated from `lexemes.md`. Do not edit by hand |
| [`contract.md`](contract.md) | Types the parser hands to the UI: `Token`, `Diagnostic`, `Command`, `Item` and which UI component reads what |
| [`task.md`](task.md) | The library comparison task, how to add a library, and the evaluation criteria |
| [`comparison.md`](comparison.md) | Results, one column per library |
| `fixtures/` | Input texts with their expected parse output (`*.parse.json`), day config and timeline items (`*.items.json`) |
| `ui/` | React + Vite app: parser picker, CodeMirror rule editor, diagnostics and the items table |
| `ui/src/completion.ts` | What the rule editor suggests at the cursor, read from the Lezer syntax tree |
| `ui/src/parsers/` | One folder per library behind the `RuleParser` interface, plus the shared conformance test and benchmarks |
| `ui/src/derivation/` | Library-independent `derive()` that turns commands into timeline items |

## Getting started

```bash
cd ui
npm install
npm run dev            # open the UI and pick a parser
npm test               # derivation and parser tests
npm run test:parsers   # conformance test for every registered library
npm run bench          # tokenize and parse timings per library
npm run typecheck
```

After editing `lexemes.md`, regenerate the JSON files:

```bash
node generate-lexemes.mjs     # lexemes.json
node generate-scenarios.mjs   # fixtures/scenarios.json, needs lexemes.json first
```

## Rule editor

`RuleEditor` is a CodeMirror 6 editor. It colours the tokens of the picked parser, underlines its diagnostics and those of the derivation, and shows a token's description on hover. Hovering an activity also shows its catalog entry: duration and description.

Completion suggests what fits at the cursor: keywords such as `before` or `pre` after `rel "IP"`, and catalog activities with their quotes. Inside quotes it lists the activities that match what is typed. The subject and the targets already listed are left out. Activity lists open on their own; keywords wait for a letter or Ctrl+Space.

Completion always runs on the Lezer grammar, whichever parser the picker shows. The editor loads it as a CodeMirror language and reads the live syntax tree, which knows the subject, the statement kind and the targets so far. A new parser adapter changes the tokens and diagnostics, not the suggestions.

Known limits:

- Whether the cursor sits inside an activity name is read from the line text (an odd number of quotes before it). It copies the grammar's name rule, so a grammar change to quoted strings needs it too.
- The context rules in `completion.ts` are written by hand from the grammar and have to follow its changes.
- A multi-word name typed without its opening quote is completed over its last word only.

## Adding a library

Copy `ui/src/parsers/_template/` to `ui/src/parsers/<library>/`, implement `tokenize` and `parse`, and register it in `ui/src/parsers/registry.ts`. Then add a column to `comparison.md`. [`task.md`](task.md) has the full steps and the criteria.

## Status

| Library | Conformance |
| --- | --- |
| [Ohm](https://ohmjs.org/) 17.5 | All 30 checks pass. See [`comparison.md`](comparison.md) |
| [Lezer](https://lezer.codemirror.net/) 1.4 | All 30 checks pass. See [`comparison.md`](comparison.md) |
