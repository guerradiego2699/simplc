/**
 * Diagnostics and runtime faults. They carry a stable `code` plus parameters; the UI turns
 * them into translated messages (spec 9: compiler and simulator errors are translated).
 */

export type DiagnosticCode =
  /** The text is not a valid address, or it does not exist in the memory layout. */
  | 'INVALID_ADDRESS'
  /** Writing to a read-only area (system bits). */
  | 'READ_ONLY_TARGET'
  /** Writing to the input image: allowed, but it is overwritten at the next scan. */
  | 'INPUT_WRITE'
  /** The same address is assigned (coil) in more than one place: the last one wins. */
  | 'DUPLICATE_OUTPUT'
  /** A temporary is read before it is declared in the network. */
  | 'UNDEFINED_TEMP'
  /** Two edge detectors share the same memory instance. */
  | 'DUPLICATE_EDGE_INSTANCE'
  /** Two networks share the same id. */
  | 'DUPLICATE_NETWORK_ID'
  /** An AND/OR/XOR without operands. */
  | 'EMPTY_OPERATION'
  /** The program uses an IR version this engine does not understand. */
  | 'UNSUPPORTED_VERSION';

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: DiagnosticCode;
  /** Values for the translated message, e.g. { address: 'Q0.0' }. */
  params: Record<string, string | number>;
  networkId?: string;
  /** Id of the source element (from the IR node's `source`). */
  source?: string;
}

export type FaultCode =
  /** The scan exceeded the maximum number of steps (e.g. an endless WHILE loop). */
  'WATCHDOG';

export interface PlcFault {
  code: FaultCode;
  networkId?: string;
  /** Simulated time (ms) at which the fault happened. */
  timeMs: number;
}

/** Thrown inside a scan when the step budget is exhausted; caught by the runtime. */
export class WatchdogError extends Error {
  constructor() {
    super('Scan step budget exceeded');
    this.name = 'WatchdogError';
  }
}

export class ProgramLoadError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(`Program has ${diagnostics.filter((d) => d.severity === 'error').length} error(s)`);
    this.name = 'ProgramLoadError';
    this.diagnostics = diagnostics;
  }
}
