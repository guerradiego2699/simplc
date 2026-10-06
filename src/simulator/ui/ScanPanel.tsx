/**
 * "Scan cycle" tab: walk through the scan one part at a time (spec 6.2, visualize scan).
 * Shows the four phases, what just happened, and terminals vs. process image for the inputs
 * and outputs used by the program — the key idea of the process image, made visible.
 */
import { useMemo } from 'react';
import { Pause, Play, SkipForward, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { parseAddress } from '@/simulator/engine';
import { formatAddressStyled } from '@/simulator/addressing/styles';
import { irAddresses } from '@/simulator/ir/walk';
import { tagForAddress } from '@/simulator/project/tags';
import { InputControl } from '@/simulator/io-panel/IoBoard';
import { fmt, useController, useSim, useStrings } from './context';

const PHASES = ['read', 'execute', 'write', 'housekeeping'] as const;

export function ScanPanel() {
  const t = useStrings();
  const controller = useController();
  const { scanView, snapshot, ladder, ir, language, tags, style, io, controls } = useSim(
    useShallow((s) => ({
      scanView: s.scanView,
      io: s.project.io,
      controls: s.ioControls,
      snapshot: s.snapshot,
      ladder: s.project.ladder,
      ir: s.compiled.ir,
      language: s.project.language,
      tags: s.project.tags,
      style: s.addressStyle,
    })),
  );

  const event = scanView.active ? scanView.event : null;
  const rungNumber =
    event?.phase === 'execute' ? ladder.rungs.findIndex((r) => r.id === event.networkId) + 1 : 0;
  const cycle = (snapshot?.scanCount ?? 0) + (event?.phase === 'housekeeping' ? 0 : 1);

  const explanation = !event
    ? t.scan.explain.idle
    : event.phase === 'execute'
      ? language === 'ST'
        ? t.scan.explain.executeSt
        : fmt(language === 'FBD' ? t.fbd.executeScan : t.scan.explain.execute, { n: rungNumber })
      : fmt(t.scan.explain[event.phase], { n: snapshot?.scanCount ?? 0 });

  // Inputs and outputs used by the program, to compare terminal vs image.
  const { inputs, outputs } = useMemo(() => {
    // From the compiled program, so it works for every language.
    const used = ir ? irAddresses(ir) : new Set<string>();
    const bits = [...used].filter((a) => parseAddress(a)?.kind === 'bit').sort();
    return {
      inputs: bits.filter((a) => a.startsWith('I')),
      outputs: bits.filter((a) => a.startsWith('Q')),
    };
  }, [ir]);

  const bit = (arr: boolean[] | undefined, address: string) => {
    const ref = parseAddress(address);
    return ref?.kind === 'bit' ? (arr?.[ref.byte * 8 + ref.bit] ?? false) : false;
  };

  const btn =
    'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-xs font-semibold text-text hover:border-primary hover:text-primary';

  return (
    <div className="grid h-full gap-4 overflow-auto p-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <ol className="flex flex-wrap gap-1.5" aria-label={t.scan.title}>
          {PHASES.map((phase, i) => {
            const current = event?.phase === phase;
            return (
              <li
                key={phase}
                aria-current={current ? 'step' : undefined}
                data-phase={phase}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  current
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-bg text-text-muted'
                }`}
              >
                <span className="font-mono">{i + 1}</span>
                {t.scan.phases[phase]}
                {phase === 'execute' && current && rungNumber > 0 && (
                  <span className="font-mono">· {rungNumber}</span>
                )}
              </li>
            );
          })}
          {scanView.active && (
            <li className="ml-auto self-center font-mono text-xs text-text-muted">
              {fmt(t.scan.cycle, { n: cycle })}
            </li>
          )}
        </ol>
        <p
          className="mt-3 max-w-prose text-sm text-text"
          aria-live="polite"
          data-testid="scan-explanation"
        >
          {explanation}
        </p>
        {!scanView.active && <p className="mt-1 text-xs text-text-muted">{t.scan.intro}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {scanView.active && scanView.auto ? (
            <button type="button" className={btn} onClick={() => controller.pauseVisualize()}>
              <Pause size={14} aria-hidden="true" />
              {t.scan.pause}
            </button>
          ) : (
            <button type="button" className={btn} onClick={() => controller.visualize()}>
              <Play size={14} aria-hidden="true" />
              {scanView.active ? t.scan.resume : t.scan.start}
            </button>
          )}
          <button type="button" className={btn} onClick={() => controller.nextPart()}>
            <SkipForward size={14} aria-hidden="true" />
            {t.scan.next}
          </button>
          {scanView.active && (
            <button type="button" className={btn} onClick={() => controller.exitVisualize()}>
              <X size={14} aria-hidden="true" />
              {t.scan.exit}
            </button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 text-xs">
        {(
          [
            ['inputs', inputs, snapshot?.physicalInputs, snapshot?.bits.I],
            ['outputs', outputs, snapshot?.bits.Q, snapshot?.physicalOutputs],
          ] as const
        ).map(([key, list, first, second]) => (
          <table key={key} className="w-full border-collapse self-start">
            <caption className="pb-1 text-left text-[11px] font-semibold tracking-wider text-text-muted uppercase">
              {t.scan[key]}
            </caption>
            <thead className="text-[11px] text-text-muted">
              <tr>
                <th className="py-0.5 text-left font-medium" />
                <th className="py-0.5 font-medium">
                  {key === 'inputs' ? t.scan.terminal : t.scan.image}
                </th>
                <th className="py-0.5 font-medium">
                  {key === 'inputs' ? t.scan.image : t.scan.terminal}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((address) => (
                <tr key={address} className="border-t border-border" data-scan-row={address}>
                  <td className="py-1 pr-2 font-mono text-text">
                    <span className="inline-flex items-center gap-2">
                      {key === 'inputs' && (
                        <InputControl
                          small
                          address={address}
                          mode={io.inputs[address]?.mode ?? 'switch'}
                          name={address}
                          active={controls[address] ?? false}
                        />
                      )}
                      {tagForAddress(address, tags)?.name ?? formatAddressStyled(address, style)}
                    </span>
                  </td>
                  {[first, second].map((arr, i) => {
                    const on = bit(arr, address);
                    return (
                      <td key={i} className="py-1 text-center">
                        <span
                          data-bit
                          className={`inline-flex size-5 items-center justify-center rounded font-mono font-semibold ${
                            on ? 'bg-led-on text-on-led' : 'bg-surface-2 text-text-muted'
                          }`}
                        >
                          {on ? 1 : 0}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
