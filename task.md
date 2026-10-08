# Task: compare lexer/parser libraries for the rule DSL

## Goal

Find out which open-source lexer/parser library fits the rule DSL best. For each candidate, build a lexer and a parser that turn DSL text into the commands defined in `contract.md`. The timeline derivation and the UI are built separately. They only read your output.

## Inputs

- `lexemes.md`: tokens, rules, examples, lexer notes and semantics decisions. `lexemes.json` is generated from it with `node rule-parser/generate-lexemes.mjs`. Read the markdown and treat the JSON as a convenience.
- `contract.md`: the `Token`, `Diagnostic`, `ParseResult` and `Command` types, and the `tokenize` and `parse` signatures.
- `fixtures/`: input texts and their expected parse output.

## Deliverables per library

1. `tokenize(text)`, returning the token sequences in the `lexemes.md` Examples table.
2. `parse(text)`, returning `ParseResult` that matches every `fixtures/*.parse.json` (`message` excluded), for both modes.
3. The adapter registered in `ui/src/parsers/registry.ts`, so the shared conformance test runs the Examples table and the fixtures against it.
4. A column in `comparison.md`, scored on the criteria below. For each criterion, say whether the library does the work or the adapter does it around the library.

The printer and the derivation are not part of this task. Derivation already exists in `ui/src/derivation/` and reads your `ParseResult`, so you can check a parser end to end by passing its output to `derive()`.

## Adding a library

Each library lives in its own folder under `ui/src/parsers/` and implements `RuleParser` from `ui/src/parsers/types.ts`.

1. Copy `ui/src/parsers/_template/` to `ui/src/parsers/<library>/` and set `id` (the folder name) and `title`.
2. Install the library in `ui/` (`npm install <library>`).
3. Implement `tokenize` and `parse`.
4. Import the adapter in `ui/src/parsers/registry.ts` and add it to `parsers`.
5. Run `npm run test:parsers` in `ui/`. `ui/src/parsers/conformance.test.ts` runs the same checks for every registered library: token types for each Examples row, exact tokens for each scenario in `fixtures/scenarios.json`, and every `fixtures/*.parse.json` with `message` left out.
6. Run `npm run bench` in `ui/`. `ui/src/parsers/parsers.bench.ts` times `tokenize` and `parse` separately for every registered library, on each scenario and on generated 200-line rules and sequence texts, and prints one comparison table per input and step. Compare libraries within one run only; timings drift between runs.
7. Run `npm run dev` in `ui/` and pick the library in the Parser picker. The input becomes editable, and the timeline and diagnostics follow the library's output. "Hand-written fixtures" shows the stand-in data for comparison, with the input disabled.
8. Add a column for the library to `comparison.md`. Mark each row as done by the library, by the adapter, or by both.

Library-specific tests or benchmarks go in the library's own folder.

## Evaluation criteria

- **Error quality:** are spans exact? Does the library report which tokens it expected at an error (`Diagnostic.expected`)? Does it recover and keep parsing after the first error, or does the adapter recover by feeding it one line at a time?
- **Adding a rule:** how many places change to add a new statement type? Try one: a made-up `repeat 2x` statement, then remove it.
- **Two modes:** how cleanly does it switch between the rules grammar and the sequence grammar after the first token? Does the grammar decide, or does the adapter pick a start rule?
- **Adapter share:** what our code does that the library does not, such as splitting lines, tracking header blocks, recovering from errors and switching modes. It is code we maintain, and it hides how the library itself behaves.
- **Types:** does it produce TypeScript types, or do we write them by hand?
- **Runtime:** bundle size in the browser, parse time for a 200-line text (`npm run bench`), and maintenance activity of the project.
- **Editor support:** can the same grammar drive completion and highlighting in the `RuleEditor`?

## Out of scope

The printer, timeline derivation, UI, and choosing the final library. `comparison.md` feeds that decision.
