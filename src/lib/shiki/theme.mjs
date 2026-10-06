/**
 * Shiki theme built from the site's CSS tokens, so code blocks follow light/dark mode and never
 * introduce colours outside the palette. Only a few roles are coloured, to keep contrast high.
 */
/** @type {import('shiki').ThemeRegistration} */
export const plcampusTheme = {
  name: 'plcampus',
  type: 'light',
  colors: { 'editor.foreground': 'var(--text)', 'editor.background': 'var(--surface)' },
  tokenColors: [
    { scope: ['comment'], settings: { foreground: 'var(--text-muted)', fontStyle: 'italic' } },
    {
      scope: ['keyword', 'keyword.control', 'keyword.other', 'keyword.operator.word'],
      settings: { foreground: 'var(--primary)', fontStyle: 'bold' },
    },
    { scope: ['storage.type', 'support.type'], settings: { foreground: 'var(--primary)' } },
  ],
};
