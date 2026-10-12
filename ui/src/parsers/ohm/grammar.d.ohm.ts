// Generated from grammar.ohm by ui/ohm.ts. Do not edit.

import {
  BaseActionDict,
  Grammar,
  IterationNode,
  Node,
  NonterminalNode,
  Semantics,
  TerminalNode
} from 'ohm-js';

export interface RuleDslActionDict<T> extends BaseActionDict<T> {
  Line_header?: (this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode) => T;
  Line_statement?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Line?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  LineHeader?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  SequenceStart?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Slot_activity?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  Slot_state?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  Slot_travel?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  Slot?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Header_anchor?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  Header_subject?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  Header?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Statement?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Placement?: (this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode, arg2: NonterminalNode) => T;
  PlacementBody_offsets?: (this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: NonterminalNode) => T;
  PlacementBody_dependency?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  PlacementBody?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Rule?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Spacing?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  Composite?: (this: NonterminalNode, arg0: IterationNode, arg1: NonterminalNode, arg2: NonterminalNode, arg3: IterationNode, arg4: IterationNode, arg5: NonterminalNode) => T;
  Dependency?: (this: NonterminalNode, arg0: IterationNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  Count?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  FastingWait?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  Travel?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: IterationNode, arg3: IterationNode) => T;
  TravelArrive?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  TravelReturn?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  Hospitalization?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: IterationNode) => T;
  HospitalizationFrom?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  AnchorRef?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Direction?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Targets?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Offsets?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Offset_pre?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Offset_post?: (this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode) => T;
  Offset?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  PostOffset?: (this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode) => T;
  Window?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode) => T;
  tokens?: (this: NonterminalNode, arg0: IterationNode) => T;
  item?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  blank?: (this: NonterminalNode, arg0: TerminalNode) => T;
  token?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  unknown_quote?: (this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode) => T;
  unknown_word?: (this: NonterminalNode, arg0: IterationNode) => T;
  unknown?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  stop?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  count?: (this: NonterminalNode, arg0: IterationNode, arg1: TerminalNode) => T;
  duration?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode) => T;
  percent?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode) => T;
  activity?: (this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode, arg2: TerminalNode) => T;
  colon?: (this: NonterminalNode, arg0: TerminalNode) => T;
  sep?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  comma?: (this: NonterminalNode, arg0: TerminalNode) => T;
  window?: (this: NonterminalNode, arg0: TerminalNode) => T;
  day_anchor?: (this: NonterminalNode, arg0: TerminalNode) => T;
  before?: (this: NonterminalNode, arg0: TerminalNode) => T;
  after?: (this: NonterminalNode, arg0: TerminalNode) => T;
  state?: (this: NonterminalNode, arg0: TerminalNode) => T;
  qualifier?: (this: NonterminalNode, arg0: TerminalNode) => T;
  rel?: (this: NonterminalNode, arg0: TerminalNode) => T;
  edge?: (this: NonterminalNode, arg0: TerminalNode) => T;
  occurrence?: (this: NonterminalNode, arg0: TerminalNode) => T;
  pre?: (this: NonterminalNode, arg0: TerminalNode) => T;
  post?: (this: NonterminalNode, arg0: TerminalNode) => T;
  travel?: (this: NonterminalNode, arg0: TerminalNode) => T;
  sequence?: (this: NonterminalNode, arg0: TerminalNode) => T;
  admission?: (this: NonterminalNode, arg0: TerminalNode) => T;
  return?: (this: NonterminalNode, arg0: TerminalNode) => T;
  return_mode?: (this: NonterminalNode, arg0: TerminalNode) => T;
  hosp?: (this: NonterminalNode, arg0: TerminalNode) => T;
  anchor?: (this: NonterminalNode, arg0: TerminalNode) => T;
  from?: (this: NonterminalNode, arg0: TerminalNode) => T;
  number?: (this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: IterationNode) => T;
  newline?: (this: NonterminalNode, arg0: TerminalNode) => T;
  idchar?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  rest?: (this: NonterminalNode, arg0: IterationNode) => T;
  space?: (this: NonterminalNode, arg0: TerminalNode) => T;
}

export interface RuleDslSemantics extends Semantics {
  addOperation<T>(name: string, actionDict: RuleDslActionDict<T>): this;
  extendOperation<T>(name: string, actionDict: RuleDslActionDict<T>): this;
  addAttribute<T>(name: string, actionDict: RuleDslActionDict<T>): this;
  extendAttribute<T>(name: string, actionDict: RuleDslActionDict<T>): this;
}

export interface RuleDslGrammar extends Grammar {
  createSemantics(): RuleDslSemantics;
  extendSemantics(superSemantics: RuleDslSemantics): RuleDslSemantics;
}

declare const grammar: RuleDslGrammar;
export default grammar;
