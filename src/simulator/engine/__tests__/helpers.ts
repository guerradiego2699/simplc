import type { IrProgram } from '@/simulator/ir/types';
import { PlcRuntime, type RuntimeOptions } from '../runtime';

/** Creates a runtime, loads the program and switches it to RUN. */
export function running(program: IrProgram, options: RuntimeOptions = {}): PlcRuntime {
  const rt = new PlcRuntime(options);
  rt.load(program);
  rt.start();
  return rt;
}

/** Sets the given physical inputs and runs one scan. */
export function scanWith(rt: PlcRuntime, inputs: Record<string, boolean> = {}): PlcRuntime {
  for (const [address, value] of Object.entries(inputs)) rt.setInput(address, value);
  rt.scan();
  return rt;
}

/** All combinations of n booleans: [[false,false],[false,true],…]. */
export function truthTable(n: number): boolean[][] {
  return Array.from({ length: 2 ** n }, (_, row) =>
    Array.from({ length: n }, (_, col) => ((row >> (n - 1 - col)) & 1) === 1),
  );
}
