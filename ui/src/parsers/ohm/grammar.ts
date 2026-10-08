import * as ohm from 'ohm-js';

// The rule DSL as one Ohm grammar. Vocabulary and semantics come from ../../../../lexemes.md.
//
// - Lexical rules (lowercase) are the tokens. Each one carries its token name as its description, so a failed
//   match reports "expected BEFORE" rather than the characters inside the rule.
// - Syntactic rules (capitalized) read one statement line at a time: the adapter splits the text at SEP tokens,
//   so one bad line does not stop the lines after it.
// - `space` is only spaces and tabs. Newlines are SEP tokens, never whitespace.
export const grammar = ohm.grammar(String.raw`
RuleDsl {
  // Entry points for one line in rules mode. LineHeader recovers the header of a line whose statement failed.
  Line = Header Statement?  -- header
       | Statement          -- statement
  LineHeader = Header rest

  // Entry points for one line in sequence mode.
  SequenceStart = sequence
  Slot = activity duration  -- activity
       | state duration     -- state
       | travel duration    -- travel

  Header = anchor activity colon  -- anchor
         | activity colon         -- subject

  Statement = Placement | Rule

  Placement = activity count? PlacementBody
  PlacementBody = edge? occurrence? Offsets  -- offsets
                | Direction Targets          -- dependency

  // Four rules start with COUNT; the token after it decides. The order sets the order of expected tokens.
  Rule = Spacing | Composite | Dependency | Count | FastingWait | Travel | Hospitalization
  Spacing = count qualifier duration
  Composite = count? rel AnchorRef edge? occurrence? Offsets
  Dependency = count? Direction Targets
  Count = count
  FastingWait = state duration Direction
  Travel = travel duration TravelArrive? TravelReturn?
  TravelArrive = before (activity | admission)
  TravelReturn = return (return_mode | duration)
  Hospitalization = hosp duration HospitalizationFrom?
  HospitalizationFrom = from AnchorRef

  AnchorRef = activity | day_anchor
  Direction = before | after
  Targets = NonemptyListOf<activity, comma>
  Offsets = NonemptyListOf<Offset, comma>
  Offset = pre               -- pre
         | post PostOffset+  -- post
  PostOffset = duration Window?
  Window = window (duration | percent)

  // Entry point for tokenize: every character lands in a token, a blank or an unknown word.
  tokens = item*
  item = sep | blank | token | unknown
  blank = " " | "\t"
  token = count | percent | duration | activity | colon | comma | window | day_anchor | before | after
        | state | qualifier | rel | edge | occurrence | pre | post | travel | sequence | admission
        | return_mode | return | hosp | anchor | from
  unknown = "\"" (~"\"" ~newline any)*  -- quote
          | (~stop any)+                -- word
  stop = blank | sep | "\"" | ":" | "," | "±"

  count (COUNT) = digit+ "x" ~idchar
  duration (DURATION) = number ("min" | "m" | "h") ~idchar
  percent (PERCENT) = number "%"
  activity (ACTIVITY) = "\"" (~"\"" ~newline any)+ "\""
  colon (COLON) = ":"
  sep (SEP) = ";" | newline
  comma (COMMA) = ","
  window (WINDOW) = "±" | "+-"
  day_anchor (DAY_ANCHOR) = ("day-start" | "day-end") ~idchar
  before (BEFORE) = "before" ~idchar
  after (AFTER) = "after" ~idchar
  state (STATE) = ("fast" | "wait") ~idchar
  qualifier (QUALIFIER) = ("exactly" | "approximately" | "approx" | "atleast") ~idchar | ">=" | "=" | "~"
  rel (REL) = "rel" ~idchar
  edge (EDGE) = ("start" | "end") ~idchar
  occurrence (OCCURRENCE) = ("each" | "first" | "last") ~idchar
  pre (PRE) = "pre" ~idchar
  post (POST) = "post" ~idchar
  travel (TRAVEL) = "travel" ~idchar
  sequence (SEQUENCE) = "sequence" ~idchar
  admission (ADMISSION) = "admission" ~idchar
  return (RETURN) = "return" ~idchar
  return_mode (RETURN_MODE) = ("none" | "same" | "discharge") ~idchar
  hosp (HOSP) = "hosp" ~idchar
  anchor (ANCHOR) = "anchor" ~idchar
  from (FROM) = "from" ~idchar

  number = digit+ ("." digit+)?
  newline = "\r\n" | "\n"
  idchar = alnum | "-" | "_"
  rest = any*
  space := " " | "\t"
}
`);
