/**
 * Pointer-based drag and drop (works over SVG, gives full control over drop zones).
 * A drag starts after the pointer moves a few pixels; a press without movement is a click.
 * Drop zones are elements with `data-drop` (a JSON InsertTarget) and `data-accepts`.
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { InsertTarget } from '@/simulator/languages/ladder/model';
import type { DragItem, SimulatorStoreApi } from '@/simulator/store/simulator-store';

const THRESHOLD_PX = 5;

export const acceptsOf = (item: DragItem): 'contact' | 'coil' =>
  item.kind === 'coil' ? 'coil' : 'contact';

function zoneAt(
  x: number,
  y: number,
  accepts: string,
): { key: string; target: InsertTarget } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement | SVGElement>('[data-drop]');
  if (!el || el.dataset['accepts'] !== accepts) return null;
  try {
    return { key: el.dataset['zoneKey'] ?? '', target: JSON.parse(el.dataset['drop'] ?? '') };
  } catch {
    return null;
  }
}

/** Returns an onPointerDown handler that turns a press into a click or a drag. */
export function startDragOrClick(
  event: ReactPointerEvent,
  store: SimulatorStoreApi,
  item: DragItem,
  onClick: (e: PointerEvent) => void,
): void {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  const accepts = acceptsOf(item);

  const move = (e: PointerEvent) => {
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD_PX) return;
    dragging = true;
    const zone = zoneAt(e.clientX, e.clientY, accepts);
    store.getState().setDrag({
      item,
      x: e.clientX,
      y: e.clientY,
      zoneKey: zone?.key ?? null,
      target: zone?.target ?? null,
    });
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', key);
  };

  const up = (e: PointerEvent) => {
    cleanup();
    if (!dragging) {
      onClick(e);
      return;
    }
    const target = store.getState().drag?.target;
    store.getState().setDrag(null);
    if (target) store.getState().dropAt(target, item);
  };

  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    cleanup();
    store.getState().setDrag(null);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', key);
}
