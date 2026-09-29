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

## PLC engine (Phase 3)

- `src/simulator/ir/`: the IR every language compiles to (`types.ts`) + `builders.ts` helpers.
  Networks run in order; statements in order (last write wins); AND/OR/XOR never short-circuit;
  edges keep per-`instance` memory (start FALSE after restart, like R_TRIG); temps are per network.
- `src/simulator/engine/`: `PlcRuntime` (load → start → scan/advance), `analyze()` diagnostics with
  stable codes (UI translates them), `compile.ts` (IR → closures), `instructions/`, `memory.ts`.
  Addresses are canonical generic bits: `I`/`Q` (2 bytes each), `M` (32 bytes), `S` system bits
  (`S0.0` always on, `S0.1` first scan, `S0.2` 1 Hz clock). Parser also accepts `%IX0.0`.
- Scan: read inputs (physical/forced → I image) → networks → write outputs (Q → physical/forced)
  → housekeeping (clock += cycle, default 10 ms). `scanSteps()` yields after each part.
  Watchdog = `maxStepsPerScan` → STOP + `fault`. `trace: true` records IR `probe` values.
- ESLint forbids React/DOM/timers/`Date` inside engine and IR. Keep it that way.
- `npm run engine:demo` prints a scan-by-scan table; `npm run test:coverage` for coverage.

## Ladder editor & simulator UI (Phase 4)

- `src/simulator/languages/ladder/`: `model.ts` (rung = series–parallel tree of contacts + parallel
  coils; pure immutable ops: insertAt/moveElement/removeElement/wrapInParallel…), `layout.ts`
  (grid cells, wires tagged with the probe id of their power, drop zones), `compile.ts` (LD → IR,
  one `let` per element so edges run once; probes `<id>` = power after, `<id>:state` = contact
  closed; diagnostics mapped to rung/element), `editor/` (SVG `LadderEditor`, `Palette`, `symbols`).
- `src/simulator/project/`: `Project` type (language, ladder, tags, io panel setup), tags
  (case-insensitive resolution, validation), operations (rename tag updates operands), examples.
- `src/simulator/store/`: Zustand store (`createSimulatorStore`: project + undo/redo with
  coalescing, selection, drag, UI layout) and `SimulationController` (RAF loop, speed, step,
  online change, forcing; holds each panel press for ≥1 scan so quick clicks are never lost).
- `src/simulator/ui/`: `SimulatorApp` (client:only island; gets only `simulator.*` strings),
  panels (Properties, Variables, Monitor, Console), Toolbar, StatusBar, pointer-based drag & drop
  (`drag.ts`: zones carry `data-drop` JSON). `src/simulator/io-panel/IoBoard.tsx`: 16 in / 16 out.
- Page `src/pages/[lang]/simulator.astro` uses `BaseLayout app` (no footer, full height); < 1024 px
  shows the desktop-only notice. E2E: `tests/e2e/phase4.spec.ts` (runs at 1440×900).
- The in-app browser pane may run at ~3 fps when hidden; verify simulator timing with Playwright.

## Timers, counters, math, styles, visualize scan (Phase 5)

- Engine data: `MW` INT (Int16, wraps), `MD` REAL (Float32), analog `IW`/`QW`, timers `T0–T31`
  (members Q/ET/PT/IN; bare `T0` = Q), counters `C0–C31` (Q/QU/QD/CV/PV). No overlap between
  areas. Literals: `5`, `1.5`, `16#FF`, `T#1m30s` (`engine/literals.ts`). IR adds `compare`,
  `arith`, `convert`, `timer`, `counter`. `analyze()` type-checks (BOOL vs numbers; INT/REAL/TIME
  mix freely). Timers use scan start time (`ctx.now`); memory resets timers/counters IN PLACE.
- Ladder instructions come from `languages/ladder/catalog.ts` (side, family, main operand +
  `params`). Elements keep `kind: 'contact' | 'coil'`; extra operands live in `params`.
  Timer/counter boxes pass their Q as power; output boxes run inside `IF <rung power>`.
  New timers/counters get the first free instance (`nextFreeInstance`).
- `simulator/addressing/styles.ts`: display-only brand notation (generic/siemens/ab/mitsubishi/
  omron); stored in `localStorage` (`plcampus:addressStyle`). Operands are always typed generic.
- Visualize scan: `controller.visualize()/nextPart()/exitVisualize()` walk `runtime.scanSteps()`;
  `ScanPanel` shows phases + terminal vs image and has its own input controls (`InputControl`).
  Presses made mid-scan are held until the NEXT scan completes.
- UI code: never generate TSX/template literals through bash heredocs or `node -e` strings —
  `${…}` gets eaten by the shell. Use the Write/Edit tools.

## Files (Phase 6)

- `simulator/file/project-file.ts`: `.plcampus.json` = `{ format: 'plcampus-project', version,
savedAt, project }`, validated with **`zod/mini`** (keep it mini: small bundle). Import gives
  every rung/series/element/tag a fresh id. Errors: INVALID_JSON / NOT_A_PROJECT / NEWER_VERSION /
  INVALID_CONTENT(path). Bump `FILE_VERSION` + add a migration when the format changes.
- `simulator/file/autosave.ts`: localStorage key `plcampus:project` (try/catch, same validation).
  `ui/FileSupport.tsx`: debounced autosave (flushed on pagehide), file drop zone, notice banner.
  `ui/file-actions.ts`: download (Ctrl+S) / open (Ctrl+O, hidden `#project-file-input`).
- `Project` now has `name` and `plant` (null until Phase 7). `store.replaceProject()` is undoable.
- E2E suites that reload pages clear `plcampus:project` in `beforeEach` (see phase4/5 specs).
- Export to `.st` is deferred to Phase 11 (needs the LD → ST converter).

## Plants and examples (Phase 7)

- `src/simulator/plants/`: `types.ts` (`PlantModel`: fixed sensors/actuators, `initial`, `step(state,
dtMs, output)`, `read`, optional `command`), `models.ts` (lamp, motor, traffic, tank — pure TS,
  ESLint purity applies), `coupling.ts` (`scanWithPlant`: sensors → scan → physics; also for the
  challenge validator). `views/PlantViews.tsx`: props-only SVG views (simulator + static previews).
- Controller: with `project.plant` set, every scan is `applyInputs` (panel, then plant sensors
  override) → scan → `stepPlant`. Plant state is published as `plantState`; it resets on start,
  stop and plant change. `controller.plantCommand(name)` for operator actions. Plant-driven inputs
  show a factory icon in the I/O board instead of a control.
- Examples: bilingual JSON in `src/content/examples/<id>.json` (order = spec section 7 number,
  level, plant, title/summary, io list with names per language, steps, rungs without ids).
  `src/simulator/examples/` validates them (zod) and builds a `Project` via `exampleProject`
  (goes through `parseProjectFile`). Unit tests require every example to compile with zero
  diagnostics and check behaviour coupled to its plant.
- Pages `[lang]/examples/index.astro` (gallery + upcoming list from `examples.upcoming.<n>`) and
  `[lang]/examples/[id].astro` (static plant, I/O table, `StaticLadder`, steps).
  `/simulator?example=<id>` loads it as an undoable replace and removes the parameter;
  `<TrySimulator example>` fails the build on unknown ids. File menu lists all examples.
- i18n keys can't contain dots: plant signal strings use `I0_2`-style keys.

## Challenges (Phase 8)

- Content: `src/content/challenges/<id>.json` (order, level, plant, title, statement paragraphs,
  io, `allowed` Ladder types or null, progressive `hints`, `tests`). A test = `steps`
  `{ at, inputs?, plant? }` + `expect` `{ at, outputs }` on simulated ms. Inputs with mode
  `button-nc` start at 1. Leave margin around timer edges. Solutions are NOT shipped: reference
  solutions live in `src/simulator/challenges/challenges.test.ts` and must pass.
- `challenges/validator.ts` (pure, ESLint purity): fresh runtime per case, per scan: steps →
  plant sensors → scan → plant physics → expectations. Results: invalid (errors / empty /
  notAllowed) or per-case pass/fail with time, address, expected, actual (UI explains it).
- `challenges/index.ts`: registry, `challengeProject` (empty program + tags + panel + plant +
  `project.challenge` id), `challengeRules`. Shared content → project builder:
  `project/from-content.ts` (also used by examples). `challenges/progress.ts`: localStorage
  `plcampus:challenges` (try/catch).
- Simulator: `?challenge=<id>` (resumes if the autosaved project is that challenge), right tab
  "Desafío" (`ChallengePanel`; hints/result kept in store `challengeSession`), palette shows only
  allowed instructions. Page `[lang]/challenges/index.astro` marks completed cards with a small
  script. Client islands import `localizePath` from `@/i18n/paths` (no dictionaries).

## Environment notes

- Windows. Project lives in `C:\dev\simplc` (kept out of OneDrive on purpose: node_modules sync
  caused slowness/locks). Remote: https://github.com/guerradiego2699/simplc (branch `main`).
- E2E tests run `astro preview` on port **4330**; `npm run dev` uses 4321. Never point tests at the
  dev server. After installing packages, restart the dev server; if islands fail with
  `_jsxDEV is not a function`, stop it, delete `node_modules/.vite` and start again.
- The owner uses Windows PowerShell, where `npm` is blocked by the execution policy: tell them to
  run `npm.cmd run dev` from `C:\dev\simplc`.
- Playwright uses the installed Microsoft Edge (`channel: 'msedge'`) because downloading
  Playwright's Chromium times out on this machine.
