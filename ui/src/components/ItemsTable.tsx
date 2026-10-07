import type { CSSProperties } from 'react';
import { duration, elapsed, offset } from '../format';
import type { Item, Minutes, TimelineResult } from '../timeline';

const STATE_LABEL: Record<Exclude<Item['kind'], 'activity'>, string> = {
  fast: 'Fasting',
  wait: 'Wait',
  travel: 'Travel',
  hospitalization: 'Hospitalized',
};

// With an anchor, times read "T +1:00" relative to it. Without one (legacy days), they are plain times from day start.
function At({ item, anchorAt }: { item: Item; anchorAt: Minutes | null }) {
  const time = (minutes: Minutes) => (anchorAt === null ? elapsed(minutes) : offset(minutes - anchorAt));
  if (item.placement.kind === 'auto-fit') {
    return (
      <>
        {time(item.placement.from)} <span className="muted">→</span> {time(item.placement.to)}
      </>
    );
  }
  return (
    <span className={item.isAnchor ? 'anchor' : undefined}>
      {anchorAt === null ? time(item.placement.start) : `T ${time(item.placement.start)}`}
      {item.isAnchor && <span className="anchor-badge">anchor</span>}
      {item.window && (
        <span className="muted">
          {' '}
          ±{duration(item.window.before)}
        </span>
      )}
    </span>
  );
}

// Derivation computes the gap; an auto-fit slot shows its free window instead.
function Gap({ item }: { item: Item }) {
  if (item.placement.kind === 'auto-fit') return <em>{duration(item.placement.to - item.placement.from)} free</em>;
  if (item.gap === null) return <span className="muted">—</span>;
  return <span className="muted">{item.gap < 0 ? 'overlap' : duration(item.gap)}</span>;
}

function State({ item }: { item: Item }) {
  if (item.kind === 'activity') return null;
  return (
    <span className="state">
      <span className={`swatch swatch-${item.kind}`} />
      {STATE_LABEL[item.kind]}
      {item.flags.includes('derived-wait') && <span className="derived-badge">derived</span>}
    </span>
  );
}

function Activity({ item }: { item: Item }) {
  if (item.activities.length === 0) return <>—</>;
  return (
    <>
      {item.activities.join(item.together ? ' + ' : ' · ')}
      {item.occurrence && ` · ${item.occurrence.n} of ${item.occurrence.of}`}
      {item.together && (
        <>
          {' '}
          <span className="pill">
            together
          </span>
        </>
      )}
      {item.placement.kind === 'auto-fit' && (
        <>
          {' '}
          <span className="autofit-badge">auto-fit</span>
        </>
      )}
    </>
  );
}

export function ItemsTable({ timeline }: { timeline: TimelineResult }) {
  return (
    <table className="items">
      <thead>
        <tr>
          <th>At</th>
          <th>Gap</th>
          <th>State</th>
          <th>Activity</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {timeline.items.map((item, i) => (
          <tr key={item.id} className={item.isAnchor ? 'row-anchor' : undefined} style={{ '--i': i } as CSSProperties}>
            <td>
              <At item={item} anchorAt={timeline.anchorAt} />
            </td>
            <td>
              <Gap item={item} />
            </td>
            <td>
              <State item={item} />
            </td>
            <td>
              <Activity item={item} />
            </td>
            <td>{duration(item.duration)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5}>
            On site {duration(timeline.summary.onSite)} · with travel {duration(timeline.summary.withTravel)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
