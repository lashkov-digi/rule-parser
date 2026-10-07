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
3. A test file that runs the Examples table and the fixtures against that library.
4. A short write-up scored on the criteria below.

The printer and the derivation are not part of this task. Derivation already exists in `ui/src/derivation/` and reads your `ParseResult`, so you can check a parser end to end by passing its output to `derive()`.

## Evaluation criteria

- **Error quality:** are spans exact? Does the library report which tokens it expected at an error (`Diagnostic.expected`)? Does it recover and keep parsing after the first error?
- **Adding a rule:** how many places change to add a new statement type? Try one: a made-up `repeat 2x` statement, then remove it.
- **Two modes:** how cleanly does it switch between the rules grammar and the sequence grammar after the first token?
- **Types:** does it produce TypeScript types, or do we write them by hand?
- **Runtime:** bundle size in the browser, parse time for a 200-line text, and maintenance activity of the project.
- **Editor support:** can the same grammar drive completion and highlighting in the `RuleEditor`?

## Out of scope

The printer, timeline derivation, UI, and choosing the final library. The write-ups feed that decision.
