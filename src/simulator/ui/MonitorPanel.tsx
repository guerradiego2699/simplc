import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { parseAddress, parseLiteral, type AddressRef } from '@/simulator/engine';
import { formatAddressStyled } from '@/simulator/addressing/styles';
import { spec } from '@/simulator/languages/ladder/catalog';
import { formatValue, liveValue } from '@/simulator/languages/ladder/editor/ElementView';
import { allElements } from '@/simulator/languages/ladder/model';
import { resolveOperand, tagForAddress } from '@/simulator/project/tags';
import { fmt, useController, useLocale, useSim, useStrings } from './context';

/** Display order: inputs, outputs, markers, system, words, timers, counters. */
function sortKey(ref: AddressRef): number[] {
  switch (ref.kind) {
    case 'bit':
      return [{ I: 0, Q: 1, M: 2, S: 3 }[ref.area], ref.byte * 8 + ref.bit, 0];
    case 'word':
      return [{ MW: 4, MD: 5, IW: 6, QW: 7 }[ref.area], ref.index, 0];
    case 'timer':
      return [8, ref.index, ref.member === 'Q' ? 0 : 1];
    case 'counter':
      return [9, ref.index, ref.member === 'Q' ? 0 : 1];
  }
}

const compareKeys = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

export function MonitorPanel() {
  const t = useStrings();
  const locale = useLocale() === 'es' ? 'es-CL' : 'en-US';
  const controller = useController();
  const { ladder, tags, snapshot, status, style } = useSim(
    useShallow((s) => ({
      ladder: s.project.ladder,
      tags: s.project.tags,
      snapshot: s.snapshot,
      status: s.status,
      style: s.addressStyle,
    })),
  );

  // Every address used by the program (operands and parameters) or declared as a variable.
  // Timers and counters also show their elapsed time / count.
  const addresses = useMemo(() => {
    const set = new Set<string>();
    const addText = (text: string | undefined) => {
      if (!text) return;
      const res = resolveOperand(text, tags);
      if (res.ok) set.add(res.address);
    };
    for (const el of allElements(ladder)) {
      addText(el.operand);
      Object.values(el.params ?? {}).forEach(addText);
      const family = spec(el.type).family;
      const res = resolveOperand(el.operand, tags);
      if (res.ok && family === 'timer') set.add(`${res.address}.ET`);
      if (res.ok && family === 'counter') set.add(`${res.address}.CV`);
    }
    tags.forEach((tg) => addText(tg.address));
    return [...set]
      .map((a) => ({ a, ref: parseAddress(a) }))
      .filter((x): x is { a: string; ref: AddressRef } => x.ref !== null)
      .sort((x, y) => compareKeys(sortKey(x.ref), sortKey(y.ref)))
      .map((x) => x.a);
  }, [ladder, tags]);

  const forced = snapshot?.forced ?? {};
  const forcedCount = Object.keys(forced).length;
  const live = snapshot !== null && status !== 'stopped';

  if (addresses.length === 0) {
    return <p className="p-4 text-sm text-text-muted">{t.monitor.empty}</p>;
  }

  const btn =
    'rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40';

  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-border px-3 py-1.5 text-xs text-text-muted">
        {status === 'stopped'
          ? t.monitor.notRunning
          : forcedCount > 0
            ? fmt(t.monitor.forcedCount, { n: forcedCount })
            : ' '}
      </p>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 bg-surface text-[11px] text-text-muted uppercase">
            <tr>
              <th className="px-3 py-1.5 font-medium">{t.variables.name}</th>
              <th className="px-2 py-1.5 font-medium">{t.variables.address}</th>
              <th className="px-2 py-1.5 font-medium">{t.monitor.value}</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {addresses.map((address) => {
              const ref = parseAddress(address);
              if (!ref) return null;
              const value = live ? liveValue(address, snapshot) : undefined;
              const isForced = forced[address] !== undefined;
              const name = tagForAddress(address, tags)?.name ?? '';
              const styled = formatAddressStyled(address, style);
              return (
                <tr key={address} className="border-t border-border" data-monitor={address}>
                  <td className="px-3 py-1 font-mono">{name}</td>
                  <td className="px-2 py-1 font-mono text-text-muted" title={address}>
                    {styled}
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        data-value
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-xs font-semibold ${
                          typeof value === 'boolean'
                            ? value
                              ? 'bg-led-on text-on-led'
                              : 'bg-surface-2 text-text-muted'
                            : 'text-text'
                        }`}
                      >
                        {formatValue(value, address, locale)}
                      </span>
                      {isForced && (
                        <span
                          className="rounded bg-warning px-1 font-mono text-[10px] font-bold text-on-warning"
                          title={t.editor.forced}
                        >
                          F
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {ref.kind === 'bit' && (ref.area === 'I' || ref.area === 'Q') ? (
                      <>
                        <button
                          type="button"
                          className={btn}
                          title={t.monitor.force1}
                          aria-label={`${t.monitor.force1} ${address}`}
                          onClick={() => controller.force(address, true)}
                        >
                          F1
                        </button>
                        <button
                          type="button"
                          className={btn}
                          title={t.monitor.force0}
                          aria-label={`${t.monitor.force0} ${address}`}
                          onClick={() => controller.force(address, false)}
                        >
                          F0
                        </button>
                        <button
                          type="button"
                          className={btn}
                          disabled={!isForced}
                          title={t.monitor.release}
                          aria-label={`${t.monitor.release} ${address}`}
                          onClick={() => controller.force(address, null)}
                        >
                          ✕
                        </button>
                      </>
                    ) : ref.kind === 'bit' && ref.area === 'M' ? (
                      <button
                        type="button"
                        className={btn}
                        disabled={!live}
                        title={t.monitor.toggle}
                        aria-label={`${t.monitor.toggle} ${address}`}
                        onClick={() => controller.write(address, !value)}
                      >
                        ⇄
                      </button>
                    ) : ref.kind === 'word' && (ref.area === 'MW' || ref.area === 'MD') ? (
                      <WordWriter address={address} disabled={!live} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Small input to write a value into a memory word (press Enter). */
function WordWriter({ address, disabled }: { address: string; disabled: boolean }) {
  const t = useStrings();
  const controller = useController();
  const [text, setText] = useState('');
  const label = fmt(t.monitor.write, { address });
  return (
    <input
      aria-label={label}
      title={label}
      disabled={disabled}
      value={text}
      placeholder="="
      className="w-16 rounded border border-border bg-bg px-1.5 py-0.5 text-right font-mono text-xs text-text focus:border-primary focus:outline-none disabled:opacity-40"
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        const literal = parseLiteral(text);
        if (!literal) return;
        controller.write(address, literal.value);
        setText('');
      }}
    />
  );
}
