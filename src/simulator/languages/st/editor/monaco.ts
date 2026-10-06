/**
 * Monaco editor setup for IEC 61131-3 Structured Text. Loaded lazily (only when a project is
 * in ST), so the rest of the site never downloads the editor.
 *
 * We import the editor core plus the contributions we use, not `editor.main` (which would also
 * bring dozens of unrelated languages).
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/editor/browser/coreCommands';
import 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/editor/contrib/caretOperations/browser/caretOperations';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/editor/contrib/comment/browser/comment';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError';
import 'monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/indentation/browser/indentation';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/editor/common/standaloneStrings';
import '/node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import '/node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { ST_TYPES } from '../ast';
import { KEYWORDS } from '../lexer';
import { IL_MNEMONICS } from '../../il/compile';

export { monaco };

export const ST_LANGUAGE = 'iec-st';
export const IL_LANGUAGE = 'iec-il';
export const ST_THEME = 'plcampus';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.languages.register({ id: ST_LANGUAGE, extensions: ['.st'], aliases: ['Structured Text'] });

monaco.languages.setLanguageConfiguration(ST_LANGUAGE, {
  comments: { lineComment: '//', blockComment: ['(*', '*)'] },
  brackets: [
    ['(', ')'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '(*', close: ' *)', notIn: ['comment'] },
  ],
  indentationRules: {
    increaseIndentPattern:
      /^\s*(IF|ELSIF|ELSE|CASE|FOR|WHILE|REPEAT|VAR|PROGRAM)\b.*$|^\s*[\w\s,.-]+:\s*$/i,
    decreaseIndentPattern: /^\s*(END_\w+|ELSIF|ELSE|UNTIL)\b.*$/i,
  },
  folding: {
    markers: { start: /^\s*(IF|CASE|FOR|WHILE|REPEAT|VAR)\b/i, end: /^\s*END_\w+/i },
  },
});

monaco.languages.setMonarchTokensProvider(ST_LANGUAGE, {
  ignoreCase: true,
  keywords: [...KEYWORDS],
  typeKeywords: [...ST_TYPES],
  tokenizer: {
    root: [
      [/\(\*/, 'comment', '@blockComment'],
      [/\/\*/, 'comment', '@cComment'],
      [/\/\/.*$/, 'comment'],
      [/(?:T|TIME)#-?[0-9a-z_.]+/, 'number.time'],
      [/%[a-z]{1,2}\d+(?:\.\d+)?/, 'variable.address'],
      [/\b[IQMS]\d+\.[0-7]\b/, 'variable.address'],
      [/\b(?:MW|MD|IW|QW)\d+\b/, 'variable.address'],
      [/\b[TC]\d+\b/, 'variable.address'],
      [/(?:2|8|16)#[0-9a-f_]+/, 'number'],
      [/\d[\d_]*(?:\.\d[\d_]*)?(?:e[+-]?\d+)?/, 'number'],
      [
        /[a-z_]\w*/,
        { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@default': 'identifier' } },
      ],
      [/:=|=>|<=|>=|<>|\*\*|[+\-*/=<>&]/, 'operator'],
      [/[;,.:()[\]]/, 'delimiter'],
    ],
    blockComment: [
      [/\*\)/, 'comment', '@pop'],
      [/./, 'comment'],
    ],
    cComment: [
      [/\*\//, 'comment', '@pop'],
      [/./, 'comment'],
    ],
  },
});

// ------------------------------------------------------------------------- Instruction List

/** Words highlighted as keywords in IL: operators plus the declaration keywords. */
export const IL_KEYWORDS = [
  ...IL_MNEMONICS.keys(),
  'PROGRAM',
  'END_PROGRAM',
  'VAR',
  'END_VAR',
  'TRUE',
  'FALSE',
];

monaco.languages.register({ id: IL_LANGUAGE, extensions: ['.il'], aliases: ['Instruction List'] });

monaco.languages.setLanguageConfiguration(IL_LANGUAGE, {
  comments: { lineComment: '//', blockComment: ['(*', '*)'] },
  brackets: [['(', ')']],
  autoClosingPairs: [{ open: '(*', close: ' *)', notIn: ['comment'] }],
});

monaco.languages.setMonarchTokensProvider(IL_LANGUAGE, {
  ignoreCase: true,
  keywords: IL_KEYWORDS,
  typeKeywords: [...ST_TYPES],
  tokenizer: {
    root: [
      [/\(\*/, 'comment', '@blockComment'],
      [/\/\/.*$/, 'comment'],
      [/^\s*[a-z_]\w*\s*:(?!=)/, 'type'],
      [/(?:T|TIME)#-?[0-9a-z_.]+/, 'number.time'],
      [/%[a-z]{1,2}\d+(?:\.\d+)?/, 'variable.address'],
      [/\b[IQMS]\d+\.[0-7]\b/, 'variable.address'],
      [/\b(?:MW|MD|IW|QW)\d+\b/, 'variable.address'],
      [/\b[TC]\d+\b/, 'variable.address'],
      [/(?:2|8|16)#[0-9a-f_]+/, 'number'],
      [/\d[\d_]*(?:\.\d[\d_]*)?(?:e[+-]?\d+)?/, 'number'],
      [
        /[a-z_]\w*/,
        { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@default': 'identifier' } },
      ],
      [/:=|[()]/, 'delimiter'],
      [/[;,.:]/, 'delimiter'],
    ],
    blockComment: [
      [/\*\)/, 'comment', '@pop'],
      [/./, 'comment'],
    ],
  },
});

/** Any CSS colour → "#rrggbb" (minified CSS may turn #ffffff into #fff; Monaco needs 6 digits). */
let probe: CanvasRenderingContext2D | null = null;
function normalizeColor(value: string): string {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return '#000000';
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  const result = probe.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(result) ? result : '#000000';
}

/** Reads a design token from the page, so the editor follows the site theme. */
const token = (name: string) =>
  normalizeColor(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
const hex = (c: string) => c.replace('#', '');

/** (Re)defines the editor theme from the current CSS tokens (light or dark). */
export function applyTheme(): void {
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  monaco.editor.defineTheme(ST_THEME, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: hex(token('--primary')), fontStyle: 'bold' },
      { token: 'type', foreground: hex(token('--primary')) },
      { token: 'comment', foreground: hex(token('--text-muted')), fontStyle: 'italic' },
      { token: 'number', foreground: hex(token('--text')) },
      { token: 'number.time', foreground: hex(token('--text')) },
      { token: 'variable.address', foreground: hex(token('--text-muted')) },
      { token: 'identifier', foreground: hex(token('--text')) },
      { token: 'operator', foreground: hex(token('--text')) },
    ],
    colors: {
      'editor.background': token('--bg'),
      'editor.foreground': token('--text'),
      'editorLineNumber.foreground': token('--text-muted'),
      'editorLineNumber.activeForeground': token('--text'),
      'editor.lineHighlightBackground': token('--surface'),
      'editorCursor.foreground': token('--primary'),
      'editorWidget.background': token('--surface'),
      'editorWidget.border': token('--border'),
      'editorError.foreground': token('--danger'),
      'editorWarning.foreground': token('--warning'),
    },
  });
  monaco.editor.setTheme(ST_THEME);
}
