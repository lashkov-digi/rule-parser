import { useState, type CSSProperties } from 'react';
import lexemes from '../../../lexemes.json';
import type { Token } from '../timeline';

type Kind = 'literal' | 'string' | 'keyword' | 'operator' | 'separator';

const dictionary = new Map(lexemes.tokens.map((token) => [token.name, token as { kind: Kind; description: string }]));

const shown = (text: string) => (text === '\n' || text === '\r\n' ? '↵' : text);

// The DSL text with each token's characters marked, and the token chips under it. Hovering either side highlights both.
export function TokenView({ text, tokens }: { text: string; tokens: Token[] }) {
  const [active, setActive] = useState<number | null>(null);

  const segments: Array<{ text: string; index: number | null }> = [];
  let at = 0;
  tokens.forEach((token, index) => {
    if (token.from > at) segments.push({ text: text.slice(at, token.from), index: null });
    segments.push({ text: text.slice(token.from, token.to), index });
    at = token.to;
  });
  if (at < text.length) segments.push({ text: text.slice(at), index: null });

  const kindOf = (index: number) => dictionary.get(tokens[index].type)?.kind ?? 'literal';

  return (
    <>
      <section>
        <h2>Text</h2>
        <pre className="code">
          {segments.map((segment, i) =>
            segment.index === null ? (
              segment.text
            ) : (
              <span
                key={i}
                className={`lexeme kind-${kindOf(segment.index)}${segment.index === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(segment.index)}
                onMouseLeave={() => setActive(null)}
              >
                {segment.text}
              </span>
            ),
          )}
        </pre>
      </section>

      <section>
        <h2>Tokens</h2>
        <div className="tokens">
          {tokens.map((token, index) => (
            <span
              key={index}
              style={{ '--i': index } as CSSProperties}
              className={`token kind-${kindOf(index)}${index === active ? ' active' : ''}`}
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
          {active === null ? (
            <span className="muted">Hover a token to see what it means.</span>
          ) : (
            <span key={active} className="token-info-text">
              <strong>{tokens[active].type}</strong> <span className="muted">{kindOf(active)}</span>{' '}
              {dictionary.get(tokens[active].type)?.description}
            </span>
          )}
        </p>
      </section>
    </>
  );
}
