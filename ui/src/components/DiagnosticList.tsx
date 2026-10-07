import type { Diagnostic } from '../derivation/index.ts';

// Errors and warnings from the parser and the derivation, each with its span and the tokens expected there.
export function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return <p className="diagnostics-empty muted">No errors.</p>;
  return (
    <ul className="diagnostics">
      {diagnostics.map((diagnostic, index) => (
        <li key={index} className={`diagnostic diagnostic-${diagnostic.severity}`}>
          <span className="diagnostic-where">
            {diagnostic.code} {diagnostic.from}-{diagnostic.to}
          </span>{' '}
          {diagnostic.message}
          {diagnostic.expected && diagnostic.expected.length > 0 && (
            <span className="diagnostic-expected"> Expected: {diagnostic.expected.join(', ')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
