/**
 * "Challenge" tab (spec section 8): statement, I/O, allowed instructions, progressive hints and
 * automatic checking of the user's program against the challenge's test cases.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleCheck, Lightbulb, ListChecks, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { localizePath } from '@/i18n/paths';
import { formatAddressStyled } from '@/simulator/addressing/styles';
import {
  challengeProject,
  challengeRules,
  getChallenge,
  nextChallenge,
  type Challenge,
} from '@/simulator/challenges';
import { loadProgress, markCompleted } from '@/simulator/challenges/progress';
import { validate, type CaseResult, type Validation } from '@/simulator/challenges/validator';
import { fmt, useController, useLocale, useSim, useStoreApi, useStrings } from './context';

export function ChallengePanel() {
  const id = useSim((s) => s.project.challenge);
  const challenge = getChallenge(id);
  // Remount per challenge so hints and results start fresh.
  return challenge ? <ChallengeView key={challenge.id} challenge={challenge} /> : null;
}

function ChallengeView({ challenge }: { challenge: Challenge }) {
  const t = useStrings();
  const locale = useLocale();
  const store = useStoreApi();
  const controller = useController();
  // Hints and the last result live in the store so they survive switching tabs.
  const stored = useSim((s) => s.challengeSession);
  const session =
    stored?.id === challenge.id ? stored : { id: challenge.id, hintsShown: 0, result: null };
  const { hintsShown, result } = session;
  // Bring a new result into view (the panel is narrow and long).
  const resultRef = useRef<HTMLDivElement>(null);
  const [checks, setChecks] = useState(0);
  useEffect(() => {
    if (checks > 0) resultRef.current?.scrollIntoView({ block: 'nearest' });
  }, [checks]);
  const update = (patch: Partial<typeof session>) =>
    store.setState({ challengeSession: { ...session, ...patch } });
  const [completed, setCompleted] = useState(() => challenge.id in loadProgress().completed);
  const { ladder, tags, style } = useSim(
    useShallow((s) => ({ ladder: s.project.ladder, tags: s.project.tags, style: s.addressStyle })),
  );
  const c = t.challenge;
  const hints = challenge.hints[locale];
  const next = nextChallenge(challenge.id);

  const verify = () => {
    const { compiled, project } = store.getState();
    const validation = validate(compiled.ir, project.ladder, challengeRules(challenge));
    update({ result: { validation, ladder: project.ladder } });
    setChecks((n) => n + 1);
    if (validation.status === 'passed') {
      markCompleted(challenge.id);
      setCompleted(true);
    }
  };

  const openNext = () => {
    if (!next) return;
    controller.stop();
    const project = challengeProject(next, locale);
    store.getState().replaceProject(project);
    store.getState().setLayout({ rightTab: 'challenge' });
    store
      .getState()
      .setNotice({ kind: 'info', text: fmt(c.loaded, { name: project.name }), id: Date.now() });
  };

  const nameOf = (address: string) => {
    const tag = tags.find((tg) => tg.address === address);
    const styled = formatAddressStyled(address, style);
    return tag ? `${tag.name} (${styled})` : styled;
  };
  const seconds = (ms: number) =>
    (ms / 1000).toLocaleString(locale === 'es' ? 'es-CL' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const explain = (r: Exclude<CaseResult, { passed: true }>) =>
    r.reason === 'fault'
      ? fmt(c.fault, { time: seconds(r.at) })
      : r.reason === 'analog'
        ? fmt(c.expectedAnalog, {
            time: seconds(r.at),
            name: nameOf(r.address),
            min: r.min,
            max: r.max,
            actual: r.actual,
          })
        : fmt(c.expected, {
            time: seconds(r.at),
            name: nameOf(r.address),
            expected: r.expected ? 1 : 0,
            actual: r.actual ? 1 : 0,
          });

  const heading = 'mb-1.5 text-[11px] font-semibold tracking-wider text-text-muted uppercase';

  return (
    <div className="flex h-full flex-col overflow-y-auto text-sm" data-testid="challenge-panel">
      <div className="flex flex-col gap-4 p-3">
        <header>
          <p className="flex items-center gap-2 text-xs text-text-muted">
            {fmt(c.heading, { n: challenge.order, level: challenge.level })}
            {completed && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-primary px-1.5 py-px text-[11px] font-medium text-primary"
                data-testid="challenge-completed"
              >
                <CircleCheck size={12} aria-hidden="true" />
                {c.completed}
              </span>
            )}
          </p>
          <h2 className="mt-1 text-base font-semibold text-text">{challenge.title[locale]}</h2>
        </header>

        <section aria-label={c.statement} className="flex flex-col gap-2 text-text">
          {challenge.statement[locale].map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {challenge.plant && <p className="text-xs text-text-muted">{c.plantNote}</p>}
        </section>

        <section>
          <h3 className={heading}>{c.io}</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {challenge.io.map((s) => (
              <li key={s.address} className="flex gap-2">
                <span className="w-10 shrink-0 font-mono text-text-muted">
                  {formatAddressStyled(s.address, style)}
                </span>
                <span>
                  <span className="font-mono font-semibold text-text">{s.name[locale]}</span>
                  <span className="text-text-muted"> — {s.description[locale]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className={heading}>{c.allowed}</h3>
          {challenge.allowed ? (
            <ul className="flex flex-wrap gap-1">
              {challenge.allowed.map((type) => (
                <li
                  key={type}
                  className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-text"
                >
                  {t.elements[type]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted">{c.allInstructions}</p>
          )}
        </section>

        <section>
          <h3 className={heading}>{c.hints}</h3>
          <ol className="flex flex-col gap-1.5">
            {hints.slice(0, hintsShown).map((hint, i) => (
              <li key={i} className="rounded-md border border-border bg-bg p-2 text-xs text-text">
                <span className="font-semibold">{fmt(c.hint, { n: i + 1 })}: </span>
                {hint}
              </li>
            ))}
          </ol>
          {hintsShown < hints.length && (
            <button
              type="button"
              onClick={() => update({ hintsShown: hintsShown + 1 })}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-surface-2"
            >
              <Lightbulb size={14} aria-hidden="true" />
              {fmt(c.showHint, { n: hintsShown + 1, total: hints.length })}
            </button>
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={verify}
            data-testid="challenge-verify"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            <ListChecks size={16} aria-hidden="true" />
            {c.verify}
          </button>
          <p className="text-xs text-text-muted">{c.howItWorks}</p>
          <div ref={resultRef} className="flex flex-col gap-2 empty:hidden">
            {result && (
              <Results
                validation={result.validation}
                stale={result.ladder !== ladder}
                explain={explain}
                names={challenge.tests.map((test) => test.name[locale])}
              />
            )}
            {result?.validation.status === 'passed' && (
              <div className="flex flex-wrap gap-2">
                {next && (
                  <button
                    type="button"
                    onClick={openNext}
                    data-testid="challenge-next"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary px-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-on-primary"
                  >
                    {c.next}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )}
                <a
                  href={localizePath(locale, '/challenges')}
                  className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium text-text no-underline hover:border-primary hover:text-primary"
                >
                  {c.all}
                </a>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Results({
  validation,
  stale,
  explain,
  names,
}: {
  validation: Validation;
  stale: boolean;
  explain: (r: Exclude<CaseResult, { passed: true }>) => string;
  names: string[];
}) {
  const t = useStrings();
  const c = t.challenge;
  const summary = (() => {
    switch (validation.status) {
      case 'invalid':
        if (validation.problem === 'errors') return c.errors;
        if (validation.problem === 'empty') return c.empty;
        return fmt(c.notAllowed, {
          types: validation.types.map((type) => t.elements[type as never] ?? type).join(', '),
        });
      case 'passed':
        return fmt(c.passed, { n: validation.cases.length });
      case 'failed':
        return fmt(c.failed, {
          passed: validation.cases.filter((r) => r.passed).length,
          total: validation.cases.length,
        });
    }
  })();
  const ok = validation.status === 'passed';

  return (
    <div data-testid="challenge-result" data-status={validation.status} aria-live="polite">
      <p
        className={`rounded-md border p-2 text-xs font-medium ${
          ok ? 'border-primary text-primary' : 'border-danger/60 text-text'
        }`}
      >
        {summary}
      </p>
      {stale && <p className="mt-1 text-xs text-warning">{c.stale}</p>}
      {validation.status !== 'invalid' && (
        <>
          <h3 className="mt-3 mb-1.5 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            {c.cases}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {validation.cases.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs" data-case={i} data-passed={r.passed}>
                {r.passed ? (
                  <Check size={15} aria-hidden="true" className="mt-px shrink-0 text-primary" />
                ) : (
                  <X size={15} aria-hidden="true" className="mt-px shrink-0 text-danger" />
                )}
                <span>
                  <span className="text-text">{names[i]}</span>
                  {!r.passed && <span className="block text-text-muted">{explain(r)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
