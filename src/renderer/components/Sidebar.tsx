import { useEffect, useMemo, useState, type JSX } from 'react';
import { calculate, formatNumber } from '../../shared/tools/calculator.js';
import { convert, findCategory, UNIT_CATEGORIES } from '../../shared/tools/units.js';
import { Assistant } from './Assistant.js';
import { CloseIcon } from './icons.js';

export type SidebarTool = 'assistant' | 'notes' | 'calculator' | 'units';

interface SidebarProps {
  tool: SidebarTool;
  notes: string;
  hasAssistantKey: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
}

const TOOLS: { id: SidebarTool; label: string }[] = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'notes', label: 'Notes' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'units', label: 'Units' },
];

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-1 py-1 text-[13px] text-ink outline-none focus-ring';

function Notes({ notes }: { notes: string }): JSX.Element {
  const [text, setText] = useState(notes);

  // Notes persist locally, so a slow typist should not write a file per key.
  useEffect(() => {
    if (text === notes) return;
    const timer = setTimeout(() => {
      window.vela.tools.setNotes(text);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [text, notes]);

  return (
    <div className="flex h-full flex-col gap-1">
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        aria-label="Notes"
        placeholder="Notes stay on this machine."
        spellCheck
        className={`${FIELD} min-h-0 flex-1 resize-none leading-relaxed`}
      />
      <p className="text-[11px] text-ink-muted">Saved locally, never synced.</p>
    </div>
  );
}

function Calculator(): JSX.Element {
  const [input, setInput] = useState('');
  const result = useMemo(() => calculate(input), [input]);

  return (
    <div className="flex flex-col gap-1">
      <input
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
        }}
        aria-label="Expression"
        placeholder="12 * (3 + 4)"
        spellCheck={false}
        className={FIELD}
      />

      <output
        className={`min-h-6 rounded-lg px-1 py-1 text-right text-[18px] tabular-nums ${
          result.ok ? 'text-ink' : 'text-ink-muted'
        }`}
      >
        {result.ok ? formatNumber(result.value) : result.error}
      </output>

      <p className="text-[11px] text-ink-muted">
        Evaluated by a parser, not by running your input as code.
      </p>
    </div>
  );
}

function Units(): JSX.Element {
  const [categoryId, setCategoryId] = useState('length');
  const category = findCategory(categoryId);
  const [amount, setAmount] = useState('1');
  const [fromId, setFromId] = useState(category.units[0]?.id ?? '');
  const [toId, setToId] = useState(category.units[1]?.id ?? '');

  useEffect(() => {
    setFromId(category.units[0]?.id ?? '');
    setToId(category.units[1]?.id ?? '');
  }, [category]);

  const value = Number.parseFloat(amount);
  const converted = Number.isNaN(value) ? null : convert(value, categoryId, fromId, toId);

  return (
    <div className="flex flex-col gap-1">
      <select
        value={categoryId}
        onChange={(event) => {
          setCategoryId(event.target.value);
        }}
        aria-label="Category"
        className={FIELD}
      >
        {UNIT_CATEGORIES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>

      <input
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        aria-label="Amount"
        inputMode="decimal"
        className={FIELD}
      />

      <div className="flex items-center gap-1">
        <select
          value={fromId}
          onChange={(event) => {
            setFromId(event.target.value);
          }}
          aria-label="From unit"
          className={FIELD}
        >
          {category.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ink-muted">to</span>
        <select
          value={toId}
          onChange={(event) => {
            setToId(event.target.value);
          }}
          aria-label="To unit"
          className={FIELD}
        >
          {category.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </div>

      <output className="min-h-6 px-1 py-1 text-right text-[18px] tabular-nums text-ink">
        {converted === null ? '—' : formatNumber(converted)}
      </output>

      <p className="text-[11px] text-ink-muted">
        Every factor ships with the app. No currency: a live rate would mean a request Vela does not
        make.
      </p>
    </div>
  );
}

/**
 * The sidebar panel. It sits beside the page rather than over it, so the
 * content insets shrink and the `WebContentsView` is repositioned to match.
 */
export function Sidebar({
  tool,
  notes,
  hasAssistantKey,
  onOpenSettings,
  onClose,
}: SidebarProps): JSX.Element {
  return (
    <aside
      aria-label="Sidebar tools"
      className="flex h-full w-[280px] shrink-0 flex-col gap-2 border-l border-line bg-raised p-2"
    >
      <div className="flex items-center justify-between gap-1">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">
          {TOOLS.find((entry) => entry.id === tool)?.label ?? 'Tools'}
        </h2>

        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
        >
          <CloseIcon width={11} height={11} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tool === 'assistant' ? (
          <Assistant hasKey={hasAssistantKey} onOpenSettings={onOpenSettings} />
        ) : null}
        {tool === 'notes' ? <Notes notes={notes} /> : null}
        {tool === 'calculator' ? <Calculator /> : null}
        {tool === 'units' ? <Units /> : null}
      </div>
    </aside>
  );
}
