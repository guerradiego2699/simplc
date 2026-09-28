/** Address helpers re-exported for UI code (keeps UI imports on the engine's public API). */
import { parseBitAddress, type BitRef } from '@/simulator/engine';

export { parseBitAddress };
export const bitIndexOf = (ref: BitRef) => ref.byte * 8 + ref.bit;
