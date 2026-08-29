import { useEffect, useRef, useState, type JSX } from 'react';
import type { WebPanel } from '../../shared/settings.js';
import { Assistant } from './Assistant.js';
import { CloseIcon } from './icons.js';
import { SIDEBAR_FRAME } from './sidebar-frame.js';

export type SidebarTool = 'assistant' | 'notes' | 'panels';

interface SidebarProps {
  tool: SidebarTool;
  notes: string;
  panels: readonly WebPanel[];
  addingPanel: boolean;
  onAddPanelDone: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const TOOLS: { id: SidebarTool; label: string }[] = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'notes', label: 'Notes' },
  { id: 'panels', label: 'Sidebar sites' },
];

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-1 py-1 text-[13px] text-ink outline-none focus-ring';

/**
 * Manage the sites docked into the rail — Opera's web panels, which are just
 * ordinary pages living in the sidebar instead of a tab.
 */
function Panels({
  panels,
  autoFocus,
  onDone,
}: {
  panels: readonly WebPanel[];
  autoFocus: boolean;
  onDone: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="flex h-full flex-col gap-2">
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          const url = draft.trim();
          if (url !== '') window.vela.panels.add(url, '');
          setDraft('');
          onDone();
        }}
      >
        <label className="flex flex-col gap-[3px]">
          <span className="text-[13px] text-ink">Site address</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="chat.openai.com"
            spellCheck={false}
            className={FIELD}
          />
        </label>
        <span className="text-[11px] text-ink-muted">
          It opens beside the page, on the same hardened session a tab uses.
        </span>
      </form>

      {panels.length === 0 ? null : (
        <ul className="flex flex-col gap-[2px]">
          {panels.map((panel) => (
            <li key={panel.id} className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={panel.url}>
                {panel.title}
              </span>
              <button
                type="button"
                onClick={() => {
                  window.vela.panels.remove(panel.id);
                }}
                className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

/**
 * The sidebar panel. It sits beside the page rather than over it, so the
 * content insets shrink and the `WebContentsView` is repositioned to match.
 */
export function Sidebar({
  tool,
  notes,
  panels,
  addingPanel,
  onAddPanelDone,
  onOpenSettings,
  onClose,
}: SidebarProps): JSX.Element {
  return (
    // No `h-full`: the frame carries margins now, and a full-height box plus a
    // margin is taller than the row it sits in — which pushed the footer out
    // through the bottom of the card and onto the chrome behind it. Stretching
    // is the flex row's default and already does the right thing.
    <aside
      aria-label="Sidebar tools"
      className={`flex min-h-0 flex-col gap-2 p-2 ${SIDEBAR_FRAME}`}
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
        {tool === 'assistant' ? <Assistant onOpenSettings={onOpenSettings} /> : null}
        {tool === 'notes' ? <Notes notes={notes} /> : null}
        {tool === 'panels' ? (
          <Panels panels={panels} autoFocus={addingPanel} onDone={onAddPanelDone} />
        ) : null}
      </div>
    </aside>
  );
}
