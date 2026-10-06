// Generates lexemes.json from the Rules, Dictionary and Examples tables in lexemes.md.
// Usage: node rule-parser/generate-lexemes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const markdown = readFileSync(join(here, 'lexemes.md'), 'utf8');

// Splits a table row on unescaped pipes and unescapes `\|` inside cells.
function splitRow(line) {
  const cells = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (line[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += line[i];
    }
  }
  return cells.slice(1); // drop the text before the leading pipe
}

// Returns the first table under `## <heading>` as an array of objects keyed by column name.
function readTable(heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) throw new Error(`Missing section: ## ${heading}`);

  const tableLines = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.trim().startsWith('|')) tableLines.push(line.trim());
    else if (tableLines.length > 0) break;
  }
  const [header, , ...rows] = tableLines;
  const columns = splitRow(header);
  return rows.map((row) => {
    const cells = splitRow(row);
    return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? '']));
  });
}

const unquote = (text) => text.trim().replace(/^`(.*)`$/, '$1');
const list = (cell) => cell.split(',').map(unquote).filter(Boolean);

// Parses "`a` / `b`, `c`" into [{ value: 'a', aliases: ['b'] }, { value: 'c', aliases: [] }].
// Splits only outside backticks, so the `,` lexeme itself survives.
function parseLexemes(cell) {
  const groups = [[]];
  let inCode = false;
  let current = '';
  for (const char of cell) {
    if (char === '`') {
      if (inCode) groups.at(-1).push(current);
      inCode = !inCode;
      current = '';
    } else if (inCode) {
      current += char;
    } else if (char === ',') {
      groups.push([]);
    }
  }
  return groups.filter((group) => group.length > 0).map(([value, ...aliases]) => ({ value, aliases }));
}

const rules = readTable('Rules').map((row) => ({
  name: unquote(row.Rule),
  startsWith: list(row['Starts with']),
  description: row.Description,
}));

const tokens = readTable('Dictionary').map((row) => ({
  name: unquote(row.Token),
  kind: row.Kind,
  lexemes: parseLexemes(row.Lexemes),
  pattern: row.Pattern ? unquote(row.Pattern) : null,
  rules: list(row.Rules),
  description: row.Description,
}));

const examples = readTable('Examples').map((row) => ({
  rule: row.Rule,
  text: unquote(row.Text),
  tokens: unquote(row.Tokens).split(/\s+/),
}));

// Cross-check references so a typo in the markdown fails the build instead of shipping.
const ruleNames = new Set(rules.map((rule) => rule.name));
const tokenNames = new Set(tokens.map((token) => token.name));
const errors = [];
for (const rule of rules) {
  for (const name of rule.startsWith) {
    if (!tokenNames.has(name)) errors.push(`Rule ${rule.name} starts with unknown token ${name}`);
  }
}
for (const token of tokens) {
  if (token.lexemes.length === 0 && !token.pattern) errors.push(`Token ${token.name} has no lexemes and no pattern`);
  for (const name of token.rules) {
    if (!ruleNames.has(name)) errors.push(`Token ${token.name} references unknown rule ${name}`);
  }
}
const seen = new Map();
for (const token of tokens) {
  for (const lexeme of token.lexemes.flatMap(({ value, aliases }) => [value, ...aliases])) {
    if (seen.has(lexeme)) errors.push(`Lexeme ${lexeme} is in both ${seen.get(lexeme)} and ${token.name}`);
    seen.set(lexeme, token.name);
  }
}
for (const example of examples) {
  if (!ruleNames.has(example.rule)) errors.push(`Example "${example.text}" references unknown rule ${example.rule}`);
  for (const name of example.tokens) {
    if (!tokenNames.has(name)) errors.push(`Example "${example.text}" uses unknown token ${name}`);
  }
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const output = join(here, 'lexemes.json');
writeFileSync(output, `${JSON.stringify({ version: 1, rules, tokens, examples }, null, 2)}\n`);
console.log(`Wrote ${output}: ${rules.length} rules, ${tokens.length} tokens, ${examples.length} examples`);
