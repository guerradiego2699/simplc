import { ChevronRight } from 'lucide-react';
import { startDragOrClick } from '@/simulator/ui/drag';
import { getChallenge } from '@/simulator/challenges';
import { useSim, useStoreApi, useStrings, type SimStrings } from '@/simulator/ui/context';
import type { PaletteItem } from '@/simulator/store/simulator-store';
import { spec, type InstructionType } from '../catalog';
import type { CoilType, ContactType } from '../model';
import { InstructionIcon } from './symbols';

const GROUPS: { title: keyof SimStrings['palette']; types: InstructionType[] }[] = [
  { title: 'contacts', types: ['NO', 'NC', 'P', 'N'] },
  { title: 'compare', types: ['EQ', 'NE', 'LT', 'GT', 'LE', 'GE'] },
  { title: 'timers', types: ['TON', 'TOF', 'TP'] },
  { title: 'counters', types: ['CTU', 'CTD', 'CTUD'] },
  { title: 'coils', types: ['coil', 'negated', 'set', 'reset'] },
  { title: 'operations', types: ['MOVE', 'ADD', 'SUB', 'MUL', 'DIV', 'SCALE'] },
];

const ICON = { w: 44, h: 28, scale: 1.6 };
const colors = { left: 'var(--text-muted)', right: 'var(--text-muted)', body: 'var(--text)' };

export const paletteItem = (type: InstructionType): PaletteItem =>
  spec(type).side === 'logic'
    ? { kind: 'contact', type: type as ContactType }
    : { kind: 'coil', type: type as CoilType };

export function Palette() {
  const t = useStrings();
  const store = useStoreApi();
  // In a challenge, only its allowed instructions are offered.
  const allowed = getChallenge(useSim((s) => s.project.challenge))?.allowed ?? null;
  const groups = GROUPS.map((g) => ({
    ...g,
    types: allowed ? g.types.filter((type) => allowed.includes(type as never)) : g.types,
  })).filter((g) => g.types.length > 0);

  return (
    <aside
      aria-label={t.palette.title}
      className="flex h-full flex-col overflow-y-auto border-r border-border bg-surface"
    >
      <h2 className="border-b border-border px-3 py-2 text-xs font-semibold tracking-wider text-text-muted uppercase">
        {t.palette.title}
      </h2>
      {allowed && (
        <p
          className="border-b border-border px-3 py-2 text-xs text-text-muted"
          data-palette-limited
        >
          {t.challenge.paletteLimited}
        </p>
      )}
      {groups.map((group) => (
        <details key={group.title} open className="group/section border-b border-border/60">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-text-muted select-none hover:text-text [&::-webkit-details-marker]:hidden">
            <ChevronRight
              size={12}
              aria-hidden="true"
              className="transition-transform group-open/section:rotate-90"
            />
            {t.palette[group.title]}
          </summary>
          <ul className="px-2 pb-1.5">
            {group.types.map((type) => {
              const item = paletteItem(type);
              return (
                <li key={type}>
                  <button
                    type="button"
                    data-palette={type}
                    title={t.elements[type]}
                    className="flex w-full cursor-grab items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[13px] text-text hover:bg-surface-2 active:cursor-grabbing"
                    onPointerDown={(e) =>
                      startDragOrClick(e, store, { source: 'palette', ...item }, () =>
                        store.getState().insertFromPalette(item),
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        store.getState().insertFromPalette(item);
                      }
                    }}
                  >
                    <svg
                      width={ICON.w}
                      height={ICON.h}
                      viewBox={`0 0 ${ICON.w * ICON.scale} ${ICON.h * ICON.scale}`}
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <InstructionIcon
                        type={type}
                        w={ICON.w * ICON.scale}
                        h={ICON.h * ICON.scale}
                        colors={colors}
                      />
                    </svg>
                    <span className="leading-tight">{t.elementsShort[type]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      <p className="mt-auto px-3 py-3 text-xs leading-relaxed text-text-muted">{t.palette.hint}</p>
    </aside>
  );
}
