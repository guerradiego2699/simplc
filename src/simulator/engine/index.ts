/** Public API of the PLC engine. UI code should import from here only. */
export { PlcRuntime } from './runtime';
export type { MemorySnapshot, RunMode, RuntimeOptions, ScanEvent } from './runtime';
export { analyze, hasErrors } from './analyze';
export type { AnalyzeOptions } from './analyze';
export {
  BIT_AREAS,
  SYSTEM_BITS,
  formatBitAddress,
  normalizeBitAddress,
  parseBitAddress,
} from './address';
export type { BitArea, BitRef } from './address';
export { DEFAULT_LAYOUT } from './memory';
export type { MemoryLayout } from './memory';
export { ProgramLoadError } from './errors';
export type { Diagnostic, DiagnosticCode, FaultCode, PlcFault } from './errors';
