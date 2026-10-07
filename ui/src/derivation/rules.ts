import { block, type Draft } from './block.ts';
import type { Command, DayConfig, Diagnostic, Flag, Item, Minutes, RuleCommand, Span } from './types.ts';

// One occurrence of an activity on the day, e.g. the 2nd PK sampling.
type Occurrence = {
  activity: string;
  n: number; // 0-based
  duration: Minutes;
  start: Minutes | null; // set once placed; fixed occurrences get it from an offset
  fixed: boolean;
  isAnchor: boolean;
  window: Item['window'];
  commandIds: string[];
  flags: Flag[];
};

// "first runs before second", from a dependency, paired by occurrence.
type Edge = { first: Occurrence; second: Occurrence };

const END = 'end'; // slot for occurrences that no fixed occurrence bounds; they run after everything else

/*
 * Rules mode, POC scope: count, dependency and composite. Placement:
 * 1. Composite offsets fix occurrences relative to the anchor (T 0 = anchor start).
 * 2. Every other occurrence is floating. It joins the "slot" of the fixed occurrence it must run before,
 *    directly or through a chain of dependencies. With no such bound it runs after everything.
 * 3. A slot runs as early as possible after the previous fixed occurrence. The first slot of an
 *    activity-anchored day has nothing before it, so it packs right up against its fixed occurrence;
 *    that is where the day starts.
 * finish() then turns the idle time between blocks into derived waits.
 */
export function deriveRules(commands: Command[], config: DayConfig): Draft {
  const diagnostics: Diagnostic[] = [];
  const report = (source: Span, severity: Diagnostic['severity'], message: string) =>
    diagnostics.push({ ...source, severity, code: 'semantic', message });

  const rules: RuleCommand[] = [];
  for (const command of commands) {
    if (command.type === 'slot') report(command.source, 'error', 'A sequence slot cannot appear in rules mode');
    else if (command.type === 'count' || command.type === 'dependency' || command.type === 'composite') rules.push(command);
    else report(command.source, 'warning', `The POC derivation does not support ${command.type} rules yet`);
  }

  // Every activity the text mentions, with its duration from the catalog.
  const names = new Set<string>();
  for (const rule of rules) {
    names.add(rule.subject);
    if (rule.type === 'dependency') rule.targets.forEach((target) => names.add(target));
    if (rule.type === 'composite' && rule.anchor.kind === 'activity') names.add(rule.anchor.name);
  }
  const duration = (name: string, source: Span) => {
    const found = config.activities[name]?.duration;
    if (found === undefined) report(source, 'error', `"${name}" is not in the activity catalog`);
    return found ?? 0;
  };

  // Counts: written counts and offsets first, then dependencies without a count inherit their target's count.
  const counts = new Map<string, number>();
  const setCount = (name: string, count: number, source: Span) => {
    const existing = counts.get(name);
    if (existing !== undefined && existing !== count) report(source, 'warning', `"${name}" already runs ${existing} times`);
    else counts.set(name, count);
  };
  for (const rule of rules) {
    if (rule.type === 'count') setCount(rule.subject, rule.count, rule.source);
    if (rule.type === 'dependency' && rule.count !== null) setCount(rule.subject, rule.count, rule.source);
    if (rule.type === 'composite') {
      if (rule.count !== null && rule.count !== rule.offsets.length) {
        report(rule.source, 'warning', `${rule.count}x does not match the ${rule.offsets.length} offsets; the offsets win`);
      }
      setCount(rule.subject, rule.offsets.length, rule.source);
    }
  }
  const inheriting = rules.filter(
    (rule): rule is Extract<RuleCommand, { type: 'dependency' }> =>
      rule.type === 'dependency' && rule.count === null && !counts.has(rule.subject),
  );
  for (let pass = 0; pass < inheriting.length; pass++) {
    for (const rule of inheriting) {
      const inherited = Math.max(...rule.targets.map((target) => counts.get(target) ?? 1));
      counts.set(rule.subject, Math.max(counts.get(rule.subject) ?? 1, inherited));
    }
  }

  // Occurrences.
  const sourceOf = (name: string) => rules.find((rule) => rule.subject === name)?.source ?? rules[0].source;
  const occurrences = new Map<string, Occurrence[]>();
  for (const name of names) {
    const each = duration(name, sourceOf(name));
    const commandIds = rules
      .filter((rule) => rule.subject === name || (rule.type === 'composite' && rule.anchor.kind === 'activity' && rule.anchor.name === name))
      .map((rule) => rule.id);
    occurrences.set(
      name,
      Array.from({ length: counts.get(name) ?? 1 }, (_, n) => ({
        activity: name,
        n,
        duration: each,
        start: null,
        fixed: false,
        isAnchor: false,
        window: null,
        commandIds,
        flags: [],
      })),
    );
  }
  const all = [...occurrences.values()].flat();
  const of = (name: string) => occurrences.get(name) ?? [];

  // 1. Fixed occurrences from composite offsets. One anchor per day in the POC.
  const composites = rules.filter((rule): rule is Extract<RuleCommand, { type: 'composite' }> => rule.type === 'composite');
  const anchor = composites[0]?.anchor ?? null;
  let anchorAt: Minutes | null = null;
  if (anchor?.kind === 'activity') {
    const [first, ...rest] = of(anchor.name);
    if (rest.length > 0) report(composites[0].source, 'warning', `"${anchor.name}" runs more than once; offsets use the first`);
    first.start = 0;
    first.fixed = true;
    first.isAnchor = true;
    anchorAt = 0;
  }
  for (const rule of composites) {
    if (JSON.stringify(rule.anchor) !== JSON.stringify(anchor)) {
      report(rule.source, 'warning', 'The POC derivation supports one anchor per day; this rule is skipped');
      continue;
    }
    if (rule.anchor.kind === 'day' && rule.anchor.at === 'day-end') {
      report(rule.source, 'warning', 'The POC derivation does not support day-end yet');
      continue;
    }
    // A post offset counts only the time in between: neither the anchor nor the subject's earlier
    // post occurrences use up the offset. "post 1h 2h" after a 1 min IP with 5 min PK draws puts the
    // draws at IP end + 60 and IP end + 120 + 5, so each hour between draws is a full hour.
    const anchorDuration = rule.anchor.kind === 'activity' ? of(rule.anchor.name)[0].duration : 0;
    let excluded = anchorDuration;
    let previousAfter = -1;
    rule.offsets.forEach((offset, i) => {
      const occurrence = of(rule.subject)[i];
      occurrence.fixed = true;
      if (offset.kind === 'pre') {
        if (rule.anchor.kind === 'day') report(rule.source, 'error', '`pre` needs an activity anchor');
        occurrence.start = -occurrence.duration;
        return;
      }
      if (offset.after <= previousAfter) report(rule.source, 'warning', 'Post offsets should go from shortest to longest');
      previousAfter = offset.after;
      occurrence.start = excluded + offset.after;
      excluded += occurrence.duration;
      if (offset.window) {
        const minutes = offset.window.kind === 'duration' ? offset.window.value : Math.round((offset.after * offset.window.value) / 100);
        occurrence.window = { before: minutes, after: minutes };
      }
    });
  }

  // Dependencies become edges between occurrences, paired by occurrence up to the smaller count.
  const edges: Edge[] = [];
  for (const rule of rules) {
    if (rule.type !== 'dependency') continue;
    const subject = of(rule.subject);
    for (const target of rule.targets) {
      const other = of(target);
      subject.forEach((occurrence, n) => {
        if (n >= other.length) {
          if (!occurrence.flags.includes('unpaired')) occurrence.flags.push('unpaired');
          return;
        }
        edges.push(rule.direction === 'before' ? { first: occurrence, second: other[n] } : { first: other[n], second: occurrence });
      });
    }
  }

  // 2. Slots for floating occurrences.
  const fixed = all.filter((occurrence) => occurrence.fixed).sort((a, b) => a.start! - b.start!);
  type Slot = Occurrence | typeof END;
  const nextFixedAfter = (occurrence: Occurrence): Slot =>
    fixed.find((candidate) => candidate.start! >= occurrence.start! + occurrence.duration) ?? END;
  const timeOf = (slot: Slot) => (slot === END ? Infinity : slot.start!);
  const earliest = (candidates: Slot[]) => candidates.reduce<Slot>((best, slot) => (timeOf(slot) < timeOf(best) ? slot : best), END);

  // Pass 1, deadline: the earliest fixed occurrence it must run before, following "before" chains only.
  // A loop here is a real contradiction (A before B before A).
  const deadlines = new Map<Occurrence, Slot>();
  const visiting = new Set<Occurrence>();
  function deadlineOf(occurrence: Occurrence): Slot {
    if (occurrence.fixed) return occurrence;
    const known = deadlines.get(occurrence);
    if (known) return known;
    if (visiting.has(occurrence)) {
      report(sourceOf(occurrence.activity), 'error', `"${occurrence.activity}" is part of a dependency loop`);
      return END;
    }
    visiting.add(occurrence);
    const deadline = earliest(edges.filter((edge) => edge.first === occurrence).map((edge) => deadlineOf(edge.second)));
    visiting.delete(occurrence);
    deadlines.set(occurrence, deadline);
    return deadline;
  }

  // Pass 2, slot: its deadline; without one, it follows what it runs after, as early as it can.
  const slots = new Map<Occurrence, Slot>();
  function slotOf(occurrence: Occurrence): Slot {
    if (occurrence.fixed) return occurrence;
    const known = slots.get(occurrence);
    if (known) return known;
    slots.set(occurrence, END); // guards the walk; loops were reported in pass 1
    const deadline = deadlineOf(occurrence);
    const slot =
      deadline !== END
        ? deadline
        : earliest(
            edges
              .filter((edge) => edge.second === occurrence)
              .map((edge) => (edge.first.fixed ? nextFixedAfter(edge.first) : slotOf(edge.first))),
          );
    slots.set(occurrence, slot);
    return slot;
  }
  const floating = all.filter((occurrence) => !occurrence.fixed);
  floating.forEach(slotOf);

  // 3. Place each slot: dependency order first, CDT order to break ties.
  const cdt = (name: string) => {
    const index = config.cdtOrder.indexOf(name);
    return index === -1 ? config.cdtOrder.length : index;
  };
  const order = (group: Occurrence[]) => {
    const sorted: Occurrence[] = [];
    const left = new Set(group);
    while (left.size > 0) {
      const ready = [...left]
        .filter((occurrence) => !edges.some((edge) => edge.second === occurrence && left.has(edge.first)))
        .sort((a, b) => cdt(a.activity) - cdt(b.activity) || a.n - b.n);
      const next = ready[0] ?? [...left][0]; // a loop was already reported; keep going
      sorted.push(next);
      left.delete(next);
    }
    return sorted;
  };
  const pack = (group: Occurrence[], from: Minutes) => {
    let at = from;
    for (const occurrence of group) {
      const after = edges.filter((edge) => edge.second === occurrence && edge.first.start !== null);
      at = Math.max(at, ...after.map((edge) => edge.first.start! + edge.first.duration));
      occurrence.start = at;
      at += occurrence.duration;
    }
    return at;
  };

  let cursor = anchor?.kind === 'activity' ? -Infinity : 0;
  for (const target of [...fixed, END] as const) {
    const group = order(floating.filter((occurrence) => slots.get(occurrence) === target));
    if (group.length > 0) {
      const total = group.reduce((sum, occurrence) => sum + occurrence.duration, 0);
      const end = pack(group, cursor === -Infinity ? (target === END ? 0 : target.start!) - total : cursor);
      if (target !== END && end > target.start!) {
        report(sourceOf(group[0].activity), 'warning', `Not enough time before ${target.activity} ${target.n + 1}`);
        group.forEach((occurrence) => occurrence.flags.push('overlap'));
      }
      cursor = Math.max(cursor, end);
    }
    if (target !== END) cursor = Math.max(cursor, target.start! + target.duration);
  }

  return {
    blocks: all.map((occurrence) =>
      block({
        kind: 'activity',
        activities: [occurrence.activity],
        start: occurrence.start!,
        duration: occurrence.duration,
        isAnchor: occurrence.isAnchor,
        window: occurrence.window,
        commandIds: occurrence.commandIds,
        flags: occurrence.flags,
      }),
    ),
    anchorAt,
    diagnostics,
  };
}
