/**
 * Everything around the text editor (ST and IL) that is NOT Monaco (so it loads immediately):
 * the lazy editor host, the snippet palette and the quick-reference panel.
 */
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useStrings, type SimStrings } from '@/simulator/ui/context';
import { stEditorBridge } from './bridge';
import type { TextLanguage } from './StEditor';

const StEditor = lazy(() => import('./StEditor'));

class LoadBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function StEditorHost({ language = 'ST' }: { language?: TextLanguage }) {
  const t = useStrings();
  const message = (text: string) => (
    <p className="p-4 text-sm text-text-muted" role="status">
      {text}
    </p>
  );
  return (
    <LoadBoundary fallback={message(t.st.loadError)}>
      <Suspense fallback={message(t.st.loading)}>
        {/* key: a fresh editor (model, language) when switching between ST and IL */}
        <StEditor key={language} language={language} />
      </Suspense>
    </LoadBoundary>
  );
}

type Placeholders = SimStrings['st']['snippets']['placeholders'];
interface Snippet {
  id: string;
  code: (p: Placeholders) => string;
}

/** Monaco snippets; placeholders follow the UI language. */
const ST_SNIPPETS: Snippet[] = [
  {
    id: 'if',
    code: (p) => `IF \${1:${p.condition}} THEN\n\t\${2:${p.output}} := TRUE;\nEND_IF;\n`,
  },
  {
    id: 'ifElse',
    code: (p) =>
      `IF \${1:${p.condition}} THEN\n\t\${2:${p.output}} := TRUE;\nELSE\n\t\${2:${p.output}} := FALSE;\nEND_IF;\n`,
  },
  {
    id: 'case',
    code: (p) => `CASE \${1:${p.value}} OF\n\t1: \${2}\n\t2, 3: \${3}\nELSE\n\t\${4}\nEND_CASE;\n`,
  },
  {
    id: 'for',
    code: () => `FOR \${1:MW10} := 1 TO \${2:10} DO\n\t\${3}\nEND_FOR;\n`,
  },
  {
    id: 'while',
    code: (p) => `WHILE \${1:${p.condition}} DO\n\t\${2}\nEND_WHILE;\n`,
  },
  {
    id: 'var',
    code: (p) => `VAR\n\t\${1:${p.value}} : \${2:INT} := 0;\nEND_VAR\n`,
  },
  {
    id: 'ton',
    code: (p) =>
      `(* VAR ${p.timer} : TON; END_VAR *)\n\${1:${p.timer}}(IN := \${2:${p.input}}, PT := \${3:T#5s});\n\${4:${p.output}} := \${1:${p.timer}}.Q;\n`,
  },
  {
    id: 'ctu',
    code: (p) =>
      `(* VAR ${p.counter} : CTU; END_VAR *)\n\${1:${p.counter}}(CU := \${2:${p.input}}, R := \${3:FALSE}, PV := \${4:10});\n\${5:${p.output}} := \${1:${p.counter}}.Q;\n`,
  },
  {
    id: 'rtrig',
    code: (p) =>
      `(* VAR ${p.edge} : R_TRIG; END_VAR *)\n\${1:${p.edge}}(CLK := \${2:${p.input}});\nIF \${1:${p.edge}}.Q THEN\n\t\${3}\nEND_IF;\n`,
  },
];

const IL_SNIPPETS: Snippet[] = [
  {
    id: 'sealIn',
    code: (p) =>
      `LD    \${1:${p.input}}\nOR    \${2:${p.output}}\nANDN  \${3:${p.stop}}\nST    \${2:${p.output}}\n`,
  },
  {
    id: 'deferred',
    code: (p) => `LD    \${1:a}\nAND(  \${2:b}\nOR    \${3:c}\n)\nST    \${4:${p.output}}\n`,
  },
  {
    id: 'setReset',
    code: (p) =>
      `LD    \${1:${p.input}}\nS     \${3:${p.output}}\nLD    \${2:${p.stop}}\nR     \${3:${p.output}}\n`,
  },
  {
    id: 'compare',
    code: (p) => `LD    \${1:MW0}\nGE    \${2:10}\nST    \${3:${p.output}}\n`,
  },
  {
    id: 'math',
    code: () => `LD    \${1:MW0}\nADD   \${2:1}\nST    \${1:MW0}\n`,
  },
  {
    id: 'ton',
    code: (p) =>
      `(* VAR ${p.timer} : TON; END_VAR *)\nCAL   \${1:${p.timer}}(IN := \${2:${p.input}}, PT := \${3:T#5s})\nLD    \${1:${p.timer}}.Q\nST    \${4:${p.output}}\n`,
  },
  {
    id: 'ctu',
    code: (p) =>
      `(* VAR ${p.counter} : CTU; END_VAR *)\nCAL   \${1:${p.counter}}(CU := \${2:${p.input}}, R := \${3:FALSE}, PV := \${4:10})\nLD    \${1:${p.counter}}.Q\nST    \${5:${p.output}}\n`,
  },
  {
    id: 'jump',
    code: (p) => `LD    \${1:${p.condition}}\nJMPCN \${2:SALTO}\n\${3}\n\${2:SALTO}:\n`,
  },
  {
    id: 'var',
    code: (p) => `VAR\n\t\${1:${p.value}} : \${2:INT} := 0;\nEND_VAR\n`,
  },
];

export function StSnippets({ language = 'ST' }: { language?: TextLanguage }) {
  const t = useStrings();
  const s = t.st.snippets;
  const names = (language === 'IL' ? t.il.snippets : s) as unknown as Record<string, string>;
  const list = language === 'IL' ? IL_SNIPPETS : ST_SNIPPETS;
  return (
    <aside
      aria-label={s.title}
      className="flex h-full flex-col overflow-y-auto border-r border-border bg-surface"
    >
      <h2 className="border-b border-border px-3 py-2 text-xs font-semibold tracking-wider text-text-muted uppercase">
        {s.title}
      </h2>
      <ul className="flex flex-col gap-0.5 p-2">
        {list.map(({ id, code }) => (
          <li key={id}>
            <button
              type="button"
              data-snippet={id}
              onClick={() => stEditorBridge.current?.insertSnippet(code(s.placeholders))}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[13px] text-text hover:bg-surface-2"
            >
              <ChevronRight size={13} aria-hidden="true" className="text-text-muted" />
              {names[id]}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-auto px-3 py-3 text-xs leading-relaxed text-text-muted">{s.hint}</p>
    </aside>
  );
}

export function StHelp({ language = 'ST' }: { language?: TextLanguage }) {
  const t = useStrings();
  const h = language === 'IL' ? t.il.help : t.st.help;
  return (
    <div className="h-full overflow-y-auto p-3 text-sm" data-testid="st-help">
      <h2 className="font-semibold text-text">{h.title}</h2>
      <p className="mt-2 text-xs text-text-muted">{h.intro}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {h.items.map((item) => (
          <li
            key={item}
            className="rounded border border-border bg-bg px-2 py-1.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-text"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
