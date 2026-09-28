/** Public API of the PLC engine. UI code should import from here only. */
export { PlcRuntime } from './runtime';
export type { MemorySnapshot, RunMode, RuntimeOptions, ScanEvent } from './runtime';
export { analyze, hasErrors } from './analyze';
export type { AnalyzeOptions } from './analyze';
export {
  BIT_AREAS,
  SYSTEM_BITS,
  WORD_AREAS,
  formatAddress,
  formatBitAddress,
  isWritable,
  normalizeAddress,
  normalizeBitAddress,
  parseAddress,
  parseBitAddress,
  parseInstance,
  typeOfAddress,
} from './address';
export type { AddressRef, BitArea, BitRef, DataType, WordArea } from './address';
export { formatTime, formatTimeLiteral, parseLiteral, parseTime } from './literals';
export type { Literal } from './literals';
export type { Value } from './instructions/math';
export type { CounterType, TimerType } from './memory';
export { DEFAULT_LAYOUT } from './memory';
export type { MemoryLayout } from './memory';
export { ProgramLoadError } from './errors';
export type { Diagnostic, DiagnosticCode, FaultCode, PlcFault } from './errors';
