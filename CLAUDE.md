# CLAUDE.md — SimPLC conventions

Full specification: `PROMPT_SIMPLC.md` (read it first). Work **phase by phase** (section 12) and
stop for the owner's approval after each phase. Explain changes to the owner in **Spanish**.

## Stack

Astro 7 (static) · React 19 islands · TypeScript strict (`astro/tsconfigs/strictest`) ·
Tailwind CSS 4 (via `@tailwindcss/vite`) · Vitest · Playwright · ESLint (flat) + Prettier.
Later phases: MDX content collections, Zustand, Zod, Monaco, Framer Motion, Lucide, @fontsource.

## Commands

- `npm run dev` — dev server at http://localhost:4321
- `npm run lint` — ESLint + Prettier check (`npm run format` to fix)
- `npm run test` — Vitest unit tests (`src/**/*.test.ts`)
- `npm run build` — `astro check` + static build to `dist/`
- `npm run test:e2e` — Playwright against `astro preview` (run `npm run build` first).
  Screenshots go to `test-results/screens/`.

Done-criteria for every phase: lint, test, build and e2e all green; screenshots reviewed in
light/dark (desktop always, mobile only for content pages); short Spanish summary; git commit.

## Rules

- Code, folders, identifiers in **English**. Every visible string goes through i18n (`src/i18n`) —
  no hardcoded UI text (Phase 0 placeholder page is the only exception).
- Site name lives only in `src/config/site.ts` (`SITE.name`). Import it, never retype it.
- Import alias: `@/` → `src/`.
- `src/simulator/engine/` is **pure TypeScript**: no React, no DOM, no `setTimeout`. Timers use
  simulated time. All languages compile to the common IR in `src/simulator/ir/`; the engine only
  runs IR.
- `localStorage` only inside try/catch; the app must work if it is empty or blocked.
- Colors only from CSS tokens (`--bg`, `--primary`, `--wire-on`, …). Green `--wire-on`/`--led-on`
  means "logic active" and is never decorative.
- Simulator is desktop-only (< 1024 px shows a notice). Content pages are responsive.
- Respect `prefers-reduced-motion`. Icons: Lucide. No brand logos, only brand names in text.
- Never invent product specs/prices; use qualitative ranges and a review date.
- No accounts, no database, no ads/pop-ups in simulator or challenges.
- Don't add heavy libraries without explaining why to the owner.

## i18n & layout (Phase 1)

- Pages live under `src/pages/[lang]/`; `/` only redirects (saved choice → browser language → es).
- Strings: `src/i18n/{es,en}.json` (same keys — a unit test enforces it). In Astro use
  `const t = getTranslator(locale)`; keys are type-checked. Links: `localizePath(locale, '/learn')`.
- Every page uses `BaseLayout` (`locale`, `title`, `description`, `path` for canonical/hreflang).
- Theme: `data-theme` on <html> (`light`/`dark`, absent = system). Tailwind utilities map to tokens:
  `bg-bg`, `bg-surface`, `text-text-muted`, `bg-primary`, `text-on-primary`, `stroke-wire-on`…
- Unbuilt sections render `[lang]/[section].astro` ("under construction"). When a phase builds a
  real page, remove its slug from `PLACEHOLDER_SECTIONS` in `src/config/navigation.ts`.
- Header/footer/theme/language controls are plain Astro + small scripts (no React on content pages).

## Learn content (Phase 2)

- Pages: `src/content/learn/{es,en}/<slug>.mdx` (frontmatter: `title`, `description`, `updated`,
  optional `example`). Order and grouping come from `LEARN_TOPICS` in `src/config/learn.ts`; a topic
  without an MDX file shows as "coming soon" (title in `learn.upcoming.<slug>`). A missing English
  file falls back to Spanish with a notice.
- MDX components (no import needed, see `src/components/content/mdx-components.ts`): `<Callout
type="industry|tip|note|warning|safety">`, `<TrySimulator example="…">`, `<PlcBlockDiagram />`,
  `<ScanCycle />`, `<SensorWiring />`, `<AnalogSignal />`. React widgets live in
  `src/components/content/widgets/` and get their strings from `widgets.*` in the dictionaries.
- Prose styles in `src/styles/prose.css` target direct children of `.prose`; components use
  `not-prose`. Code highlighting is off until Phase 11 (blocks are ASCII ladder diagrams).
- Technical claims must be accurate (cite the standard: IEC 61131-2, IEC 60947-5-2, NAMUR NE 43…).
- E2E widget tests must wait for hydration (`hydrated()` helper in `tests/e2e/phase2.spec.ts`).

## Environment notes

- Windows. Project lives in `C:\dev\simplc` (kept out of OneDrive on purpose: node_modules sync
  caused slowness/locks). Remote: https://github.com/guerradiego2699/simplc (branch `main`).
- Playwright uses the installed Microsoft Edge (`channel: 'msedge'`) because downloading
  Playwright's Chromium times out on this machine.
