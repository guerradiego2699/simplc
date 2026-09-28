/**
 * PlcRuntime — the simulated PLC.
 *
 * Owns the memory, the loaded program and the simulated clock, and executes the scan cycle:
 *
 *   1. read inputs    physical inputs (or forced values) → input image (I)
 *   2. execute        every network in order, against the process images
 *   3. write outputs  output image (Q) (or forced values) → physical outputs
 *   4. housekeeping   first-scan flag off, scan counter, simulated clock += cycle time
 *
 * Pure TypeScript: no DOM, no React, no timers. Time only advances when the caller runs scans,
 * so a UI can run it in real time and the challenge validator can run it as fast as possible.
 */
import type { IrProgram } from '@/simulator/ir/types';
import { bitIndex, parseBitAddress, SYSTEM_BITS, type BitArea, type BitRef } from './address';
import { analyze, hasErrors, type AnalyzeOptions } from './analyze';
import { compileProgram, type CompiledNetwork, type ExecContext } from './compile';
import { ProgramLoadError, WatchdogError, type Diagnostic, type PlcFault } from './errors';
import { DEFAULT_LAYOUT, Memory, type MemoryLayout } from './memory';

export type RunMode = 'STOP' | 'RUN';

export interface RuntimeOptions {
  layout?: Partial<MemoryLayout>;
  /** Simulated duration of one scan cycle, in ms. Default 10 (spec 6.2). */
  cycleTimeMs?: number;
  /** Maximum statements (and loop iterations) per scan before the watchdog trips. */
  maxStepsPerScan?: number;
  /** Record probe values for power-flow display. Default false. */
  trace?: boolean;
}

/** Emitted by `scanSteps()` AFTER each part of the scan completes (for "visualize scan"). */
export type ScanEvent =
  | { phase: 'read' }
  | { phase: 'execute'; networkId: string; index: number }
  | { phase: 'write' }
  | { phase: 'housekeeping' };

export interface MemorySnapshot {
  mode: RunMode;
  timeMs: number;
  scanCount: number;
  fault: PlcFault | null;
  bits: Record<BitArea, boolean[]>;
  physicalInputs: boolean[];
  physicalOutputs: boolean[];
  forced: Record<string, boolean>;
}

const toBools = (arr: Uint8Array) => Array.from(arr, (v) => v === 1);

export class PlcRuntime {
  readonly memory: Memory;
  readonly cycleTimeMs: number;

  mode: RunMode = 'STOP';
  fault: PlcFault | null = null;
  /** Simulated time in ms (start of the current/next scan). */
  timeMs = 0;
  /** Completed scans since the last start. */
  scanCount = 0;

  private networks: CompiledNetwork[] = [];
  private program: IrProgram | null = null;
  private firstScan = false;
  /** Forced inputs (applied when reading) and outputs (applied when writing). */
  private readonly forces = new Map<string, { ref: BitRef; value: boolean }>();
  private readonly ctx: ExecContext;

  constructor(options: RuntimeOptions = {}) {
    this.memory = new Memory({ ...DEFAULT_LAYOUT, ...options.layout });
    this.cycleTimeMs = options.cycleTimeMs ?? 10;
    if (!(this.cycleTimeMs > 0)) throw new RangeError('cycleTimeMs must be > 0');
    this.ctx = {
      memory: this.memory,
      temps: new Map(),
      probes: options.trace ? new Map() : null,
      steps: 0,
      maxSteps: options.maxStepsPerScan ?? 100_000,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Program
  // -------------------------------------------------------------------------------------------

  /**
   * Validates and loads a program. Throws ProgramLoadError if there are errors; returns the
   * warnings otherwise. Loading while in RUN swaps the program without clearing memory
   * (like an online change on a real PLC).
   */
  load(program: IrProgram, options?: AnalyzeOptions): Diagnostic[] {
    const diagnostics = analyze(program, this.memory.layout, options);
    if (hasErrors(diagnostics)) throw new ProgramLoadError(diagnostics);
    this.networks = compileProgram(program, this.ctx);
    this.program = program;
    return diagnostics;
  }

  get loadedProgram(): IrProgram | null {
    return this.program;
  }

  // -------------------------------------------------------------------------------------------
  // Operating mode
  // -------------------------------------------------------------------------------------------

  /** STOP → RUN. Warm restart by default; `cold` also clears retentive markers. */
  start(options: { cold?: boolean } = {}): void {
    this.memory.restart(options.cold ?? false);
    this.fault = null;
    this.firstScan = true;
    this.scanCount = 0;
    this.mode = 'RUN';
    this.applyOutputs(); // forced outputs apply immediately
  }

  /** RUN → STOP. Physical outputs go to the safe state (off); forced outputs stay forced. */
  stop(): void {
    this.mode = 'STOP';
    this.memory.physicalOutputs.fill(0);
    this.applyOutputForcesOnly();
  }

  // -------------------------------------------------------------------------------------------
  // I/O, monitoring and forcing
  // -------------------------------------------------------------------------------------------

  /** Sets a physical input terminal (I/O panel, plant). Takes effect at the next "read inputs". */
  setInput(address: string, value: boolean): void {
    const ref = this.ref(address, 'I');
    this.memory.physicalInputs[bitIndex(ref)] = value ? 1 : 0;
  }

  getInput(address: string): boolean {
    return this.memory.physicalInputs[bitIndex(this.ref(address, 'I'))] === 1;
  }

  /** Physical output terminal state. */
  getOutput(address: string): boolean {
    return this.memory.physicalOutputs[bitIndex(this.ref(address, 'Q'))] === 1;
  }

  /** Value as seen by the program (process image or marker). */
  read(address: string): boolean {
    return this.memory.get(this.ref(address));
  }

  /** Writes a value once (monitor "modify"). The program may overwrite it in the next scan. */
  write(address: string, value: boolean): void {
    const ref = this.ref(address);
    if (ref.area === 'S') throw new RangeError(`${address} is read-only`);
    this.memory.set(ref, value);
  }

  /**
   * Forces an input or output (pass null to release). A forced input is what the program reads;
   * a forced output is what the terminal shows, whatever the program writes.
   */
  force(address: string, value: boolean | null): void {
    const ref = this.ref(address);
    if (ref.area !== 'I' && ref.area !== 'Q') {
      throw new RangeError(`Only inputs and outputs can be forced: ${address}`);
    }
    const key = `${ref.area}${ref.byte}.${ref.bit}`;
    if (value === null) this.forces.delete(key);
    else this.forces.set(key, { ref, value });
    if (ref.area === 'Q') this.applyOutputForcesOnly();
  }

  isForced(address: string): boolean {
    const ref = this.ref(address);
    return this.forces.has(`${ref.area}${ref.byte}.${ref.bit}`);
  }

  /** Last value of each probe (power flow). Empty unless created with `trace: true`. */
  get probes(): ReadonlyMap<string, boolean> {
    return this.ctx.probes ?? new Map();
  }

  // -------------------------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------------------------

  /** Runs one complete scan cycle. In STOP it only advances the simulated clock. */
  scan(): void {
    const steps = this.scanSteps();
    while (!steps.next().done) {
      /* run to completion */
    }
  }

  /**
   * Runs the scan cycle one part at a time. Each `next()` performs the next part and yields an
   * event describing what just happened. Used by step-by-step and "visualize scan" modes.
   */
  *scanSteps(): Generator<ScanEvent, void, void> {
    if (this.mode !== 'RUN') {
      this.timeMs += this.cycleTimeMs;
      return;
    }

    this.readInputs();
    yield { phase: 'read' };

    this.ctx.steps = 0;
    for (let index = 0; index < this.networks.length; index++) {
      const network = this.networks[index];
      if (!network) continue;
      try {
        network.run();
      } catch (error) {
        if (error instanceof WatchdogError) {
          this.trip({ code: 'WATCHDOG', networkId: network.id, timeMs: this.timeMs });
          return;
        }
        throw error;
      }
      yield { phase: 'execute', networkId: network.id, index };
    }

    this.writeOutputs();
    yield { phase: 'write' };

    this.firstScan = false;
    this.scanCount++;
    this.timeMs += this.cycleTimeMs;
    yield { phase: 'housekeeping' };
  }

  /**
   * Advances simulated time by `ms`, running as many complete scans as fit.
   * Returns the number of scans executed. Partial cycles are carried over by the caller.
   */
  advance(ms: number): number {
    const scans = Math.floor(ms / this.cycleTimeMs);
    for (let i = 0; i < scans; i++) this.scan();
    return scans;
  }

  snapshot(): MemorySnapshot {
    const forced: Record<string, boolean> = {};
    for (const [key, f] of this.forces) forced[key] = f.value;
    const { bits } = this.memory;
    return {
      mode: this.mode,
      timeMs: this.timeMs,
      scanCount: this.scanCount,
      fault: this.fault,
      bits: { I: toBools(bits.I), Q: toBools(bits.Q), M: toBools(bits.M), S: toBools(bits.S) },
      physicalInputs: toBools(this.memory.physicalInputs),
      physicalOutputs: toBools(this.memory.physicalOutputs),
      forced,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  private readInputs(): void {
    const { bits, physicalInputs } = this.memory;
    bits.I.set(physicalInputs);
    for (const { ref, value } of this.forces.values()) {
      if (ref.area === 'I') bits.I[bitIndex(ref)] = value ? 1 : 0;
    }
    this.setSystem(SYSTEM_BITS.alwaysOn, true);
    this.setSystem(SYSTEM_BITS.firstScan, this.firstScan);
    this.setSystem(SYSTEM_BITS.clock1Hz, this.timeMs % 1000 < 500);
  }

  private writeOutputs(): void {
    this.memory.physicalOutputs.set(this.memory.bits.Q);
    this.applyOutputForcesOnly();
  }

  private applyOutputs(): void {
    if (this.mode === 'RUN') this.memory.physicalOutputs.set(this.memory.bits.Q);
    this.applyOutputForcesOnly();
  }

  private applyOutputForcesOnly(): void {
    for (const { ref, value } of this.forces.values()) {
      if (ref.area === 'Q') this.memory.physicalOutputs[bitIndex(ref)] = value ? 1 : 0;
    }
  }

  private setSystem(address: string, value: boolean): void {
    const ref = parseBitAddress(address);
    if (ref) this.memory.set(ref, value);
  }

  /** A fault stops the PLC: outputs go off and the fault is kept until the next start. */
  private trip(fault: PlcFault): void {
    this.fault = fault;
    this.stop();
  }

  private ref(address: string, expected?: BitArea): BitRef {
    const ref = parseBitAddress(address);
    if (!ref || !this.memory.contains(ref) || (expected && ref.area !== expected)) {
      throw new RangeError(`Invalid address: ${address}`);
    }
    return ref;
  }
}
