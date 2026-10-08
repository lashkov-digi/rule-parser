# Rule DSL: library comparison

One column per library, scored on the criteria in `task.md`. Each cell says who does the work:

- **library:** the library does it out of the box;
- **adapter:** our code in `ui/src/parsers/<library>/` does it around the library;
- **both:** the library provides a piece, and our code builds on it.

Adapter work is code we maintain, and it can make a library look better than it is. Read each row together with its marker.

Bench numbers come from one `npm run bench` run on one laptop. Compare libraries within the same run only.

| Criterion | Ohm 17.5 |
| --- | --- |
| **Conformance** | All 28 checks pass: Examples, scenario tokens and every `fixtures/*.parse.json`. |
| **Exact spans** | **library.** Every CST node carries its source interval. The adapter only adds the line offset, because each line is matched as its own string. |
| **Expected tokens** | **both.** Ohm reports the rightmost failures. Each token rule has its token name as its description (`before (BEFORE) = ...`), so the failures read as token names. The adapter keeps only token names, maps "end of input" to `SEP`, and reverses the list, since Ohm returns failures last-tried first. The method it reads, `getRightmostFailures`, exists at runtime but is not in Ohm's public types. |
| **Error recovery** | **adapter.** Ohm stops at the first failure and returns no partial CST. The adapter splits the text at `SEP` tokens and matches each line on its own, so a bad line is dropped and the lines after it still parse. A second grammar rule (`LineHeader`) recovers the header of a line whose statement failed. |
| **Lex errors** | **both.** The grammar has an `unknown` rule that catches any word no token matches, so tokenizing never fails. The adapter turns those words into `lex` diagnostics, and attaches the expected tokens when the parse fails at the same spot. |
| **Two modes** | **adapter.** The adapter checks whether the first token is `SEQUENCE` and picks the start rule for every line (`SequenceStart`, then `Slot`, or `Line`). The grammar could decide this itself, but per-line matching for recovery rules that out. |
| **Header blocks** | **adapter.** The grammar parses a header and a statement on one line. Which subject or anchor block a line belongs to is tracked by the adapter, because lines are matched apart. The same goes for the placement and anchor-block checks. |
| **Adapter share** | Grammar 98 lines. Semantics, which build the commands, 200 lines. Driver, which handles lexing, line splitting, recovery, mode, blocks and checks, 115 lines. The tokenizer runs once more inside `parse`, to split the lines. |
| **Adding a rule** | Counted in the code, not tried: 6 places in 2 files. In `grammar.ts`: the keyword rule, the `token` list and the statement rule plus its `Rule` alternative. In `index.ts`: one semantic action and `TOKEN_NAMES`. On top of that, the shared `Command` type. |
| **Types** | **adapter.** Command types are written by hand. Semantic actions are typed loosely (`Node`, with `any` for operation results). `@ohm-js/cli` can generate action-dictionary types from the grammar; not tried. |
| **Runtime: bundle** | about 96 KB minified, about 25 KB gzip (`ohm.min.js`). The grammar is compiled from source at startup. |
| **Runtime: 200 lines** | Rules text: tokenize 10.9 ms, parse 19.4 ms. Sequence text: tokenize 6.5 ms, parse 11.0 ms. |
| **Maintenance** | 17.5.0 is the latest stable version (March 2026). 18.0 is in beta (beta.10, March 2026). |
| **Editor support** | **both.** The same grammar gives token types for highlighting, and expected tokens at the cursor for completion. Ohm also supports incremental re-matching after an edit (`Matcher.replaceInputRange`); not tried. |
