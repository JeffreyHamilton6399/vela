import { useEffect, useRef, useState, type JSX } from 'react';
import type { AssistantMessage } from '../../shared/types/ipc.js';

interface AssistantProps {
  hasKey: boolean;
  onOpenSettings: () => void;
}

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-1 py-1 text-[13px] text-ink outline-none focus-ring';

/**
 * The sidebar assistant.
 *
 * It talks to whichever key the user put in Settings, and to nothing until
 * they do. Vela ships without a key on purpose: this is a downloadable app, so
 * a key compiled into it would be readable by anyone who unzips the bundle and
 * billed to whoever shipped it.
 */
export function Assistant({ hasKey, onOpenSettings }: AssistantProps): JSX.Element {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending]);

  const send = (): void => {
    const text = draft.trim();
    if (text === '' || pending) return;

    const next: AssistantMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setDraft('');
    setPending(true);
    setError(null);

    void window.vela.assistant.ask(next).then((reply) => {
      setPending(false);
      if (reply.ok) {
        setMessages([...next, { role: 'assistant', content: reply.text }]);
      } else {
        setError(reply.error ?? 'Something went wrong.');
      }
    });
  };

  if (!hasKey) {
    return (
      <div className="flex h-full flex-col gap-2 text-[13px] leading-relaxed text-ink-muted">
        <p className="text-ink">The assistant needs your own API key.</p>
        <p>
          Vela ships without one. It is a downloadable app, so any key built into it would sit in
          the bundle for anyone to read — and every download would bill whoever put it there.
        </p>
        <p>
          Paste a key from <span className="text-ink">console.groq.com</span> into Settings and this
          panel starts working. It is stored in your local settings file and sent only to that
          service, only when you send a message.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="focus-ring self-start rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface hover:opacity-90"
        >
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface p-1">
        {messages.length === 0 ? (
          <p className="p-1 text-[12px] leading-relaxed text-ink-muted">
            Ask anything. The assistant cannot see your tabs, history or any page — only what you
            type here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.map((message, index) => (
              <li
                key={`${message.role}-${String(index)}`}
                className={`whitespace-pre-wrap rounded-lg px-1 py-1 text-[13px] leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-hover text-ink'
                    : 'border border-line bg-raised text-ink'
                }`}
              >
                {message.content}
              </li>
            ))}
          </ul>
        )}

        {pending ? <p className="px-1 py-1 text-[12px] text-ink-muted">Thinking…</p> : null}
        {error === null ? null : <p className="px-1 py-1 text-[12px] text-danger">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-1">
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          aria-label="Message the assistant"
          placeholder="Ask something… (Enter to send)"
          rows={2}
          className={`${FIELD} resize-none`}
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || draft.trim() === ''}
          className="focus-ring shrink-0 rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface transition-opacity duration-150 hover:opacity-90 disabled:opacity-30"
        >
          Send
        </button>
      </div>

      {messages.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setError(null);
          }}
          className="focus-ring self-start rounded-lg px-1 text-[11px] text-ink-muted hover:text-ink"
        >
          Clear conversation
        </button>
      ) : null}
    </div>
  );
}
