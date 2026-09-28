import { startDragOrClick } from '@/simulator/ui/drag';
import { useStoreApi, useStrings } from '@/simulator/ui/context';
import type { PaletteItem } from '@/simulator/store/simulator-store';
import { CoilShape, ContactShape } from './symbols';

const CONTACTS: PaletteItem[] = [
  { kind: 'contact', type: 'NO' },
  { kind: 'contact', type: 'NC' },
  { kind: 'contact', type: 'P' },
  { kind: 'contact', type: 'N' },
];
const COILS: PaletteItem[] = [
  { kind: 'coil', type: 'coil' },
  { kind: 'coil', type: 'negated' },
  { kind: 'coil', type: 'set' },
  { kind: 'coil', type: 'reset' },
];

const ICON = { w: 44, h: 28 };
const colors = { left: 'var(--text-muted)', right: 'var(--text-muted)', body: 'var(--text)' };

export function Palette() {
  const t = useStrings();

  return (
    <aside
      aria-label={t.palette.title}
      className="flex h-full flex-col overflow-y-auto border-r border-border bg-surface"
    >
      <h2 className="border-b border-border px-3 py-2 text-xs font-semibold tracking-wider text-text-muted uppercase">
        {t.palette.title}
      </h2>
      <Group title={t.palette.contacts} items={CONTACTS} />
      <Group title={t.palette.coils} items={COILS} />
      <p className="mt-auto border-t border-border px-3 py-3 text-xs leading-relaxed text-text-muted">
        {t.palette.hint}
      </p>
    </aside>
  );
}

function Group({ title, items }: { title: string; items: PaletteItem[] }) {
  const t = useStrings();
  const store = useStoreApi();
  return (
    <section className="px-2 py-2">
      <h3 className="px-1 pb-1 text-[11px] font-medium text-text-muted">{title}</h3>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.type}>
            <button
              type="button"
              data-palette={item.type}
              title={t.elements[item.type]}
              className="flex w-full cursor-grab items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] text-text hover:bg-surface-2 active:cursor-grabbing"
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
                viewBox={`0 0 ${ICON.w * 1.6} ${ICON.h * 1.6}`}
                aria-hidden="true"
                className="shrink-0"
              >
                {item.kind === 'contact' ? (
                  <ContactShape
                    type={item.type}
                    w={ICON.w * 1.6}
                    h={ICON.h * 1.6}
                    colors={colors}
                  />
                ) : (
                  <CoilShape type={item.type} w={ICON.w * 1.6} h={ICON.h * 1.6} colors={colors} />
                )}
              </svg>
              <span className="leading-tight">{t.elementsShort[item.type]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
