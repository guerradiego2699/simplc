import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { bitIndexOf, parseBitAddress } from './address-utils';
import { allElements } from '@/simulator/languages/ladder/model';
import { resolveOperand, tagForAddress } from '@/simulator/project/tags';
import { fmt, useController, useSim, useStrings } from './context';

const AREA_ORDER = { I: 0, Q: 1, M: 2, S: 3 } as const;

export function MonitorPanel() {
  const t = useStrings();
  const controller = useController();
  const { ladder, tags, snapshot, status } = useSim(
    useShallow((s) => ({
      ladder: s.project.ladder,
      tags: s.project.tags,
      snapshot: s.snapshot,
      status: s.status,
    })),
  );

  // Every address used by the program or declared in the variable table, sorted I, Q, M, S.
  const addresses = useMemo(() => {
    const set = new Set<string>();
    for (const el of allElements(ladder)) {
      const res = resolveOperand(el.operand, tags);
      if (res.ok) set.add(res.address);
    }
    for (const tg of tags) {
      const res = resolveOperand(tg.address, []);
      if (res.ok) set.add(res.address);
    }
    return [...set]
      .map((a) => ({ a, ref: parseBitAddress(a) }))
      .filter((x): x is { a: string; ref: NonNullable<typeof x.ref> } => x.ref !== null)
      .sort(
        (x, y) =>
          AREA_ORDER[x.ref.area] - AREA_ORDER[y.ref.area] ||
          x.ref.byte - y.ref.byte ||
          x.ref.bit - y.ref.bit,
      )
      .map((x) => x.a);
  }, [ladder, tags]);

  const forced = snapshot?.forced ?? {};
  const forcedCount = Object.keys(forced).length;

  if (addresses.length === 0)
    return <p className="p-4 text-sm text-text-muted">{t.monitor.empty}</p>;

  const btn =
    'rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text';

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
              const ref = parseBitAddress(address);
              if (!ref) return null;
              const value =
                snapshot && status !== 'stopped'
                  ? snapshot.bits[ref.area][bitIndexOf(ref)]
                  : undefined;
              const isForced = forced[address] !== undefined;
              const name = tagForAddress(address, tags)?.name ?? '';
              return (
                <tr key={address} className="border-t border-border" data-monitor={address}>
                  <td className="px-3 py-1 font-mono">{name}</td>
                  <td className="px-2 py-1 font-mono text-text-muted">{address}</td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-xs font-semibold ${
                          value === undefined
                            ? 'text-text-muted'
                            : value
                              ? 'bg-led-on text-on-led'
                              : 'bg-surface-2 text-text-muted'
                        }`}
                      >
                        {value === undefined ? '—' : value ? '1' : '0'}
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
                    {ref.area === 'I' || ref.area === 'Q' ? (
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
                    ) : ref.area === 'M' ? (
                      <button
                        type="button"
                        className={btn}
                        disabled={status === 'stopped'}
                        title={t.monitor.toggle}
                        aria-label={`${t.monitor.toggle} ${address}`}
                        onClick={() => controller.write(address, !value)}
                      >
                        ⇄
                      </button>
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
