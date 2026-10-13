import type { CSSProperties } from 'react';
import { dictionary, kindOf as kindOfType } from '../lexemes.ts';
import type { Token } from '../timeline';

const shown = (text: string) => (text === '\n' || text === '\r\n' ? '↵' : text);

// The token chips, one per token. Hovering a chip, or the token in the editor, highlights both. The hovered token
// index lives with the caller, so the timeline can light up the rows it belongs to. `linked` holds the token indexes
// behind the hovered timeline row.
export function TokenView({
  tokens,
  active,
  setActive,
  linked,
}: {
  tokens: Token[];
  active: number | null;
  setActive: (index: number | null) => void;
  linked: Set<number>;
}) {
  const state = (index: number) => (index === active ? ' active' : linked.has(index) ? ' linked' : '');
  const kindOf = (index: number) => kindOfType(tokens[index].type);

  return (
    <section>
      <h2>Tokens</h2>
      <div className="tokens">
        {tokens.map((token, index) => (
          <span
            key={index}
            style={{ '--i': index } as CSSProperties}
            className={`token kind-${kindOf(index)}${state(index)}`}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="token-text">{shown(token.text)}</span>
            <span className="token-type">{token.type}</span>
          </span>
        ))}
      </div>
      {/* Always rendered with a fixed height, so hovering never moves the content below. */}
      <p className="token-info">
        {active === null || !tokens[active] ? (
          <span className="muted">Hover a token to see what it means.</span>
        ) : (
          <span key={active} className="token-info-text">
            <strong>{tokens[active].type}</strong> <span className="muted">{kindOf(active)}</span>{' '}
            {dictionary.get(tokens[active].type)?.description}
          </span>
        )}
      </p>
    </section>
  );
}
