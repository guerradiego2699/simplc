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

## Environment notes

- Windows + project inside OneDrive. If `npm install` fails with EPERM/EBUSY, pause OneDrive sync
  and retry.
