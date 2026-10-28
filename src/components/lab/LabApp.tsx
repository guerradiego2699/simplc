import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { Bot, Lock, LogOut, Package, RotateCcw, Send, Terminal } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import type { LabEvent } from '@/lib/lab/events';
import type { InventoryState } from '@/lib/lab/inventory';

type Strings = Dictionary['lab'];
type Auth = 'checking' | 'anonymous' | 'authenticated' | 'unconfigured';

interface Message {
  role: 'user' | 'agent';
  text: string;
}

interface ConsoleLine {
  id: number;
  time: string;
  event: LabEvent;
}

interface TurnResponse {
  reply: string;
  events: LabEvent[];
  inventory: InventoryState;
  state: string;
}

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));

const EMPTY_INVENTORY: InventoryState = { stock: {}, orders: [] };

export default function LabApp({ strings }: { strings: Strings }) {
  const [auth, setAuth] = useState<Auth>('checking');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/lab/session')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { configured: boolean; authenticated: boolean }) =>
        setAuth(
          !body.configured ? 'unconfigured' : body.authenticated ? 'authenticated' : 'anonymous',
        ),
      )
      .catch(() => {
        setAuth('anonymous');
        setNotice(strings.login.error);
      });
  }, [strings.login.error]);

  if (auth === 'checking') {
    return <div className="mt-10 h-64 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (auth === 'authenticated') {
    return (
      <Workspace
        strings={strings}
        onSignedOut={(reason) => {
          setNotice(reason);
          setAuth('anonymous');
        }}
      />
    );
  }
  return (
    <LoginForm
      strings={strings.login}
      notice={auth === 'unconfigured' ? strings.login.notConfigured : notice}
      disabled={auth === 'unconfigured'}
      onSignedIn={() => {
        setNotice(null);
        setAuth('authenticated');
      }}
    />
  );
}

function LoginForm({
  strings,
  notice,
  disabled,
  onSignedIn,
}: {
  strings: Strings['login'];
  notice: string | null;
  disabled: boolean;
  onSignedIn: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/lab/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) return onSignedIn();
      setError(response.status === 401 ? strings.invalid : strings.error);
    } catch {
      setError(strings.error);
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? notice;
  const inputClass =
    'mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60';

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-10 max-w-sm rounded-lg border border-border bg-surface p-6"
      data-lab-login
    >
      <div className="flex items-center gap-2">
        <Lock size={18} aria-hidden="true" className="text-primary" />
        <h2 className="text-lg font-semibold text-text">{strings.title}</h2>
      </div>
      <p className="mt-2 text-sm text-text-muted">{strings.body}</p>

      <label htmlFor={`${id}-user`} className="mt-5 block text-sm font-medium text-text">
        {strings.username}
      </label>
      <input
        id={`${id}-user`}
        className={inputClass}
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={disabled || busy}
        required
      />
      <label htmlFor={`${id}-pass`} className="mt-4 block text-sm font-medium text-text">
        {strings.password}
      </label>
      <input
        id={`${id}-pass`}
        type="password"
        className={inputClass}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={disabled || busy}
        required
      />

      {message && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || busy}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}

function Workspace({
  strings,
  onSignedOut,
}: {
  strings: Strings;
  onSignedOut: (reason: string | null) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [inventory, setInventory] = useState<InventoryState>(EMPTY_INVENTORY);
  const [token, setToken] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextLine = useRef(0);
  const s = strings.chat;

  function log(events: LabEvent[]) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLines((current) => [
      ...current,
      ...events.map((event) => ({ id: nextLine.current++, time, event })),
    ]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/lab/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, state: token }),
      });
      if (response.status === 401) return onSignedOut(s.expired);
      if (!response.ok) throw new Error(String(response.status));
      const turn = (await response.json()) as TurnResponse;
      setToken(turn.state);
      setInventory(turn.inventory);
      log(turn.events);
      setMessages((current) => [...current, { role: 'agent', text: turn.reply }]);
    } catch {
      setError(s.error);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setLines([]);
    setInventory(EMPTY_INVENTORY);
    setToken(undefined);
    setError(null);
  }

  async function signOut() {
    await fetch('/api/lab/session', { method: 'DELETE' }).catch(() => undefined);
    onSignedOut(null);
  }

  const buttonClass =
    'inline-flex h-9 items-center gap-2 rounded-md border whitespace-nowrap border-border bg-bg px-3 text-sm font-medium text-text hover:border-primary hover:text-primary disabled:opacity-60';

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" data-lab-workspace>
      <section className="flex min-w-0 flex-col rounded-lg border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-on-primary">
              <Bot size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text">{s.title}</h2>
              <p className="font-mono text-xs text-text-muted">{s.subtitle}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={reset} disabled={busy}>
              <RotateCcw size={14} aria-hidden="true" />
              {s.reset}
            </button>
            <button type="button" className={buttonClass} onClick={signOut}>
              <LogOut size={14} aria-hidden="true" />
              {s.logout}
            </button>
          </div>
        </header>

        <Messages strings={strings} messages={messages} busy={busy} onPick={send} />

        {error && (
          <p role="alert" className="px-4 pb-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <form
          className="flex gap-2 border-t border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="lab-message" className="sr-only">
            {s.placeholder}
          </label>
          <input
            id="lab-message"
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            placeholder={s.placeholder}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={busy || draft.trim() === ''}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
          >
            <Send size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{s.send}</span>
          </button>
        </form>
      </section>

      <aside className="flex min-w-0 flex-col gap-6">
        <ConsolePanel strings={strings.console} lines={lines} />
        <InventoryPanel strings={strings.inventory} inventory={inventory} />
      </aside>
    </div>
  );
}

function Messages({
  strings,
  messages,
  busy,
  onPick,
}: {
  strings: Strings;
  messages: Message[];
  busy: boolean;
  onPick: (text: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const s = strings.chat;

  useEffect(() => {
    // Scroll only the panel, never the page.
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [messages, busy]);

  return (
    <div ref={box} className="h-[28rem] overflow-y-auto p-4" aria-live="polite" data-lab-messages>
      {messages.length === 0 && (
        <div>
          <p className="text-sm text-text-muted">{s.empty}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {s.suggestions.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => onPick(text)}
                  className="rounded-full border border-border bg-bg px-3 py-1.5 text-left text-sm text-text hover:border-primary hover:text-primary"
                >
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="flex flex-col gap-4">
        {messages.map((message, index) => (
          <li
            key={index}
            className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            data-role={message.role}
          >
            <div
              className={
                message.role === 'user'
                  ? 'max-w-[85%] rounded-lg bg-primary px-4 py-2.5 text-sm text-on-primary'
                  : 'max-w-[85%] rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text'
              }
            >
              <p className="sr-only">{message.role === 'user' ? s.you : s.agent}:</p>
              <RichText text={message.text} />
            </div>
          </li>
        ))}
      </ol>
      {busy && (
        <p className="mt-4 animate-pulse text-sm text-text-muted" data-lab-thinking>
          {s.thinking}
        </p>
      )}
    </div>
  );
}

/** Plain text with line breaks and **bold** — the only formatting the agent is told to use. */
function RichText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .map((chunk, index) =>
          chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4 ? (
            <strong key={index}>{chunk.slice(2, -2)}</strong>
          ) : (
            chunk.replace(/^\* /gm, '• ')
          ),
        )}
    </p>
  );
}

function ConsolePanel({ strings, lines }: { strings: Strings['console']; lines: ConsoleLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the panel, never the page.
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  return (
    <section className="rounded-lg border border-border bg-surface">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-text">
        <Terminal size={15} aria-hidden="true" />
        {strings.title}
      </h2>
      <div
        className="h-64 overflow-y-auto bg-bg p-3 font-mono text-xs leading-relaxed"
        ref={box}
        data-lab-console
      >
        {lines.length === 0 ? (
          <p className="text-text-muted">{strings.empty}</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {lines.map(({ id, time, event }) => (
              <li key={id} className="break-words">
                <span className="text-text-muted">{time} </span>
                <ConsoleText strings={strings} event={event} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ConsoleText({ strings, event }: { strings: Strings['console']; event: LabEvent }) {
  switch (event.type) {
    case 'call':
      return (
        <span className="text-primary">
          → {event.name}({JSON.stringify(event.args)})
        </span>
      );
    case 'result':
      return (
        <span className={'error' in event.result ? 'text-warning' : 'text-text'}>
          ← {JSON.stringify(event.result)}
        </span>
      );
    case 'order':
      return (
        <span className="font-semibold text-text">
          [SISTEMA]{' '}
          {fill(strings.order, { id: event.id, quantity: event.quantity, product: event.product })}
        </span>
      );
    case 'retry':
      return (
        <span className="text-warning">
          {fill(strings.retry, { status: event.status, seconds: event.waitSeconds })}
        </span>
      );
    case 'error':
      return <span className="text-danger">{event.message}</span>;
  }
}

function InventoryPanel({
  strings,
  inventory,
}: {
  strings: Strings['inventory'];
  inventory: InventoryState;
}) {
  const stock = Object.entries(inventory.stock);
  return (
    <section className="rounded-lg border border-border bg-surface" data-lab-inventory>
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-text">
        <Package size={15} aria-hidden="true" />
        {strings.title}
      </h2>
      <div className="p-4 text-sm">
        {stock.length === 0 ? (
          <p className="text-text-muted">{strings.empty}</p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            {stock.map(([product, units]) => (
              <div key={product} className="contents">
                <dt className="text-text">{product}</dt>
                <dd className="text-right font-mono text-text tabular-nums">
                  {units} {strings.units}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <h3 className="mt-5 text-xs font-semibold tracking-wider text-text-muted uppercase">
          {strings.ordersTitle}
        </h3>
        {inventory.orders.length === 0 ? (
          <p className="mt-2 text-text-muted">{strings.ordersEmpty}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {inventory.orders.map((order) => (
              <li
                key={order.id}
                className="flex justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
              >
                <span className="font-mono text-text">{order.id}</span>
                <span className="text-text">
                  {order.quantity} × {order.product}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
