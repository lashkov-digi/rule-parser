import { useState, type KeyboardEvent, type SubmitEvent } from 'react';
import type { DayConfig } from '../derivation/index.ts';

type Catalog = DayConfig['activities'];

const positive = (value: string) => {
  const minutes = Number(value);
  return value.trim() !== '' && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
};

// Enter commits a field the same way leaving it does, instead of submitting the add row.
const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.currentTarget.blur();
};

// The activity catalog the derivation reads durations from. Names the text uses but the catalog lacks show as
// empty rows, so adding one is typing its duration. The last row adds a name the text does not use yet.
export function CatalogEditor({
  catalog,
  mentioned,
  changed,
  onChange,
  onRename,
  onReset,
}: {
  catalog: Catalog;
  mentioned: string[];
  changed: boolean;
  onChange: (next: Catalog) => void;
  onRename: (from: string, to: string) => void;
  onReset: () => void;
}) {
  // What is typed in each field, until it loses focus. Only a valid value reaches the catalog.
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [added, setAdded] = useState({ name: '', duration: '' });
  const [problem, setProblem] = useState<string | null>(null);

  const names = [...Object.keys(catalog), ...mentioned.filter((name) => !(name in catalog))];
  const used = new Set(mentioned);

  // A name goes inside quotes in the text, so it cannot hold a quote or a line break.
  const invalidName = (name: string, current?: string) => {
    if (name === '') return 'An activity needs a name';
    if (/["\r\n]/.test(name)) return 'A name cannot contain a quote or a line break';
    if (name !== current && name in catalog) return `"${name}" is already in the catalog`;
    return null;
  };

  const typeDuration = (name: string, value: string) => {
    setDurations((current) => ({ ...current, [name]: value }));
    const minutes = positive(value);
    if (minutes !== null) onChange({ ...catalog, [name]: { duration: minutes } });
  };
  const settleDuration = (name: string) => setDurations(({ [name]: _dropped, ...rest }) => rest);

  const settleName = (name: string) => {
    const next = (renames[name] ?? name).trim();
    setRenames(({ [name]: _dropped, ...rest }) => rest);
    if (next === name) return;
    const reason = invalidName(next, name);
    setProblem(reason);
    if (reason === null) onRename(name, next);
  };

  const remove = (name: string) => onChange(Object.fromEntries(Object.entries(catalog).filter(([key]) => key !== name)));

  const add = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = added.name.trim();
    const minutes = positive(added.duration);
    const reason = invalidName(name) ?? (minutes === null ? 'A duration is a positive number of minutes' : null);
    setProblem(reason);
    if (reason !== null || minutes === null) return;
    onChange({ ...catalog, [name]: { duration: minutes } });
    setAdded({ name: '', duration: '' });
  };

  return (
    <section>
      <div className="input-head">
        <h2>Activities</h2>
        <button type="button" className="reset" onClick={onReset} disabled={!changed}>
          Reset
        </button>
      </div>
      <form onSubmit={add}>
        <table className="catalog">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Duration, min</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const missing = !(name in catalog);
              return (
                <tr key={name} className={missing ? 'catalog-missing' : used.has(name) ? undefined : 'catalog-unused'}>
                  <td>
                    {missing ? (
                      <span className="catalog-name">
                        {name}
                        <span className="catalog-note">not in catalog</span>
                      </span>
                    ) : (
                      <input
                        className="catalog-field"
                        value={renames[name] ?? name}
                        onChange={(event) => setRenames((current) => ({ ...current, [name]: event.target.value }))}
                        onBlur={() => settleName(name)}
                        onKeyDown={commitOnEnter}
                        spellCheck={false}
                        aria-label={`Name of ${name}`}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      className="catalog-field catalog-duration"
                      value={durations[name] ?? (missing ? '' : String(catalog[name].duration))}
                      placeholder={missing ? 'Add' : undefined}
                      onChange={(event) => typeDuration(name, event.target.value)}
                      onBlur={() => settleDuration(name)}
                      onKeyDown={commitOnEnter}
                      aria-label={`Duration of ${name} in minutes`}
                    />
                  </td>
                  <td>
                    {!missing && (
                      <button type="button" className="catalog-remove" onClick={() => remove(name)} aria-label={`Remove ${name}`}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="catalog-new">
              <td>
                <input
                  className="catalog-field"
                  value={added.name}
                  onChange={(event) => setAdded((current) => ({ ...current, name: event.target.value }))}
                  placeholder="New activity"
                  spellCheck={false}
                  aria-label="New activity name"
                />
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  className="catalog-field catalog-duration"
                  value={added.duration}
                  onChange={(event) => setAdded((current) => ({ ...current, duration: event.target.value }))}
                  placeholder="min"
                  aria-label="New activity duration in minutes"
                />
              </td>
              <td>
                <button type="submit" className="catalog-add" aria-label="Add activity">
                  +
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
      {problem && <p className="catalog-problem">{problem}</p>}
    </section>
  );
}
