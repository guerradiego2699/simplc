/**
 * Structured Text editor (Monaco). Default export so it can be loaded with React.lazy.
 *
 * - The source lives in `project.st`; edits are committed to the store (undoable, coalesced).
 * - Diagnostics from the compiler become squiggles; the console can move the cursor to them.
 * - Completion: keywords, types, tags, VAR locals and timer/counter members after a dot.
 * - In RUN, each assignment line shows the current value of its target, and hovering a name
 *   shows its address and live value.
 */
import { useEffect, useRef } from 'react';
import { parseAddress, type MemorySnapshot } from '@/simulator/engine';
import { formatAddressStyled } from '@/simulator/addressing/styles';
import { formatValue, liveValue } from '@/simulator/languages/ladder/editor/ElementView';
import { diagnosticMessage } from '@/simulator/ui/diagnostics';
import { fmt, useLocale, useStoreApi, useStrings } from '@/simulator/ui/context';
import type { StSymbol } from '../compile';
import { ST_TYPES } from '../ast';
import { KEYWORDS } from '../lexer';
import { stEditorBridge } from './bridge';
import { applyTheme, monaco, ST_LANGUAGE } from './monaco';

/** Members of each kind of instance, offered after "name.". */
const MEMBERS: Record<string, string[]> = {
  timer: ['Q', 'ET', 'PT', 'IN'],
  counter: ['Q', 'QU', 'QD', 'CV', 'PV'],
  edge: ['Q'],
};

/** What the language-wide providers need from the mounted editor. */
const live: {
  symbols: StSymbol[];
  snapshot: MemorySnapshot | null;
  describe: (s: StSymbol) => string;
  valueText: (address: string) => string | null;
} = {
  symbols: [],
  snapshot: null,
  describe: () => '',
  valueText: () => null,
};

const findSymbol = (name: string) => {
  const upper = name.toUpperCase();
  return live.symbols.find((s) => s.name.toUpperCase() === upper);
};

/** Kind of instance behind a name, for member completion. */
function instanceKind(name: string): keyof typeof MEMBERS | null {
  const symbol = findSymbol(name);
  if (symbol?.type === 'R_TRIG' || symbol?.type === 'F_TRIG') return 'edge';
  const ref = parseAddress(symbol?.address ?? name);
  if (ref?.kind === 'timer') return 'timer';
  if (ref?.kind === 'counter') return 'counter';
  return null;
}

let providersRegistered = false;
function registerProviders() {
  if (providersRegistered) return;
  providersRegistered = true;

  monaco.languages.registerCompletionItemProvider(ST_LANGUAGE, {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const dotted = /([A-Za-z_]\w*)\.$/.exec(before);
      if (dotted) {
        const kind = instanceKind(dotted[1] ?? '');
        return {
          suggestions: (kind ? (MEMBERS[kind] ?? []) : []).map((m) => ({
            label: m,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: m,
            range,
          })),
        };
      }
      return {
        suggestions: [
          ...live.symbols.map((s) => ({
            label: s.name,
            kind:
              s.origin === 'local'
                ? monaco.languages.CompletionItemKind.Variable
                : monaco.languages.CompletionItemKind.Field,
            detail: live.describe(s),
            ...(s.comment ? { documentation: s.comment } : {}),
            insertText: s.name,
            range,
          })),
          ...[...KEYWORDS].map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range,
          })),
          ...ST_TYPES.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.TypeParameter,
            insertText: k,
            range,
          })),
        ],
      };
    },
  });

  monaco.languages.registerHoverProvider(ST_LANGUAGE, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const symbol = findSymbol(word.word);
      const address = symbol?.address ?? (parseAddress(word.word) ? word.word : null);
      if (!symbol && !address) return null;
      const lines = [symbol ? live.describe(symbol) : address];
      const value = address ? live.valueText(address) : null;
      if (value !== null) lines.push(value);
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
        contents: lines.filter(Boolean).map((value) => ({ value: value! })),
      };
    },
  });
}

/** Assignment target at the start of a line ("x := …"), for live values. */
const ASSIGNMENT = /^\s*([A-Za-z_%][\w.%]*)\s*:=/;

export default function StEditor() {
  const t = useStrings();
  const locale = useLocale();
  const store = useStoreApi();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    registerProviders();
    applyTheme();

    const state = store.getState();
    const model = monaco.editor.createModel(state.project.st ?? '', ST_LANGUAGE);
    const editor = monaco.editor.create(element, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: 'JetBrains Mono Variable, ui-monospace, monospace',
      fontSize: 14,
      tabSize: 2,
      scrollBeyondLastLine: false,
      wordBasedSuggestions: 'off',
      fixedOverflowWidgets: true,
      renderLineHighlight: 'line',
      ariaLabel: t.st.editorLabel,
      padding: { top: 8 },
    });

    const numberLocale = locale === 'es' ? 'es-CL' : 'en-US';
    live.describe = (s) => {
      const style = store.getState().addressStyle;
      const where = s.address ? formatAddressStyled(s.address, style) : '—';
      return fmt(s.origin === 'local' ? t.st.local : t.st.tag, { type: s.type, address: where });
    };
    live.valueText = (address) => {
      const snap = live.snapshot;
      if (!snap || store.getState().status === 'stopped') return null;
      const v = liveValue(address, snap);
      return v === undefined
        ? null
        : fmt(t.st.value, { value: formatValue(v, address, numberLocale) });
    };

    // Editor → store (one undo step per burst of typing).
    let applying = false;
    const changes = model.onDidChangeContent(() => {
      if (applying) return;
      const st = model.getValue();
      store.getState().commit((p) => ({ ...p, st }), 'st-edit');
    });

    let decorations = editor.createDecorationsCollection();

    const sync = () => {
      const s = store.getState();
      // Store → editor (undo/redo, opened file, conversion).
      const st = s.project.st ?? '';
      if (st !== model.getValue()) {
        applying = true;
        const selection = editor.getSelection();
        model.pushEditOperations(
          selection ? [selection] : [],
          [{ range: model.getFullModelRange(), text: st }],
          () => null,
        );
        applying = false;
      }
      // Diagnostics → squiggles.
      const result = s.compiled.st;
      live.symbols = result?.symbols ?? [];
      monaco.editor.setModelMarkers(
        model,
        'st',
        (result?.diagnostics ?? []).map((d) => {
          const word = model.getWordAtPosition({
            lineNumber: d.range.start.line,
            column: d.range.start.col,
          });
          const empty = d.range.end.offset <= d.range.start.offset;
          return {
            severity:
              d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
            message: diagnosticMessage(d, t),
            startLineNumber: d.range.start.line,
            startColumn: d.range.start.col,
            endLineNumber: empty ? d.range.start.line : d.range.end.line,
            endColumn: empty ? (word?.endColumn ?? d.range.start.col + 1) : d.range.end.col,
          };
        }),
      );
    };

    const showLiveValues = () => {
      const s = store.getState();
      live.snapshot = s.snapshot;
      if (s.status === 'stopped' || !s.snapshot) {
        decorations.clear();
        return;
      }
      const list: monaco.editor.IModelDeltaDecoration[] = [];
      for (let line = 1; line <= model.getLineCount(); line++) {
        const m = ASSIGNMENT.exec(model.getLineContent(line));
        if (!m) continue;
        const name = m[1] ?? '';
        const address = findSymbol(name)?.address ?? (parseAddress(name) ? name : null);
        if (!address) continue;
        const v = liveValue(address, s.snapshot);
        if (v === undefined) continue;
        const end = model.getLineMaxColumn(line);
        list.push({
          range: new monaco.Range(line, end, line, end),
          options: {
            showIfCollapsed: true,
            after: {
              content: `   ${name} = ${formatValue(v, address, numberLocale)}`,
              inlineClassName: v === true ? 'st-live-value st-live-on' : 'st-live-value',
            },
          },
        });
      }
      decorations.set(list);
    };

    sync();
    showLiveValues();
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.project.st !== prev.project.st || s.compiled !== prev.compiled) sync();
      if (s.snapshot !== prev.snapshot || s.status !== prev.status) showLiveValues();
      if (s.stReveal && s.stReveal !== prev.stReveal) {
        const position = { lineNumber: s.stReveal.line, column: s.stReveal.col };
        editor.setPosition(position);
        editor.revealPositionInCenter(position);
        editor.focus();
      }
    });

    // Follow the site theme (light/dark toggle or OS change).
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);

    stEditorBridge.set({
      insertSnippet(snippet) {
        editor.focus();
        const controller = editor.getContribution('snippetController2') as {
          insert(template: string): void;
        } | null;
        controller?.insert(snippet);
      },
    });

    return () => {
      stEditorBridge.set(null);
      unsubscribe();
      observer.disconnect();
      media.removeEventListener('change', applyTheme);
      changes.dispose();
      decorations.clear();
      decorations = editor.createDecorationsCollection();
      editor.dispose();
      model.dispose();
    };
  }, [store, t, locale]);

  return <div ref={host} className="h-full w-full" data-testid="st-editor" />;
}
