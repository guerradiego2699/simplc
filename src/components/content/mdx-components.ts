/**
 * Components available inside every Learn MDX file without importing them.
 * Usage in MDX: <Callout type="industry">…</Callout>, <ScanCycle />, <TrySimulator example="…" />
 */
import AnalogSignal from './AnalogSignal.astro';
import Callout from './Callout.astro';
import PlcBlockDiagram from './PlcBlockDiagram.astro';
import ScanCycle from './ScanCycle.astro';
import SensorWiring from './SensorWiring.astro';
import TrySimulator from './TrySimulator.astro';

export const mdxComponents = {
  AnalogSignal,
  Callout,
  PlcBlockDiagram,
  ScanCycle,
  SensorWiring,
  TrySimulator,
};
