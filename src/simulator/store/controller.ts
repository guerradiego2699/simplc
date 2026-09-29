/**
 * Connects the store to the PLC engine and drives it in real time.
 *
 * Every animation frame: push the I/O panel state into the physical inputs, advance simulated
 * time by (elapsed real time × speed), and publish a snapshot + power-flow probes to the store
 * (throttled). The engine itself stays pure; timing lives here, in the UI layer.
 *
 * With a virtual plant, every scan is coupled to it: panel → plant sensors (they override the
 * panel for their inputs) → scan → plant physics for one cycle of simulated time.
 */
import { PlcRuntime, type ScanEvent, type Value } from '@/simulator/engine';
import { applySensors, stepPlant } from '@/simulator/plants/coupling';
import { PLANTS } from '@/simulator/plants/models';
import { isPlantId, type PlantModel } from '@/simulator/plants/types';
import type { IoPanelSetup } from '@/simulator/project/types';
import type { SimulatorStoreApi } from './simulator-store';

/** Inputs of the training panel: 2 bytes × 8 bits (spec 6.6). */
export const PANEL_INPUTS = Array.from({ length: 16 }, (_, i) => `I${Math.floor(i / 8)}.${i % 8}`);
export const PANEL_OUTPUTS = Array.from({ length: 16 }, (_, i) => `Q${Math.floor(i / 8)}.${i % 8}`);

const PUBLISH_EVERY_MS = 50;
const MAX_FRAME_MS = 250;

/** Terminal state of an input given its control and mode (an NC button is 1 at rest). */
export function physicalInput(
  address: string,
  io: IoPanelSetup,
  controls: Record<string, boolean>,
): boolean {
  const active = controls[address] ?? false;
  return io.inputs[address]?.mode === 'button-nc' ? !active : active;
}

export class SimulationController {
  private readonly store: SimulatorStoreApi;
  private readonly runtime = new PlcRuntime({ trace: true });
  private frame = 0;
  private lastFrame = 0;
  private lastPublish = 0;
  private carry = 0;
  private unsubscribe: (() => void) | null = null;
  /**
   * Controls activated recently, with the scan count at that moment. A quick click can be
   * shorter than one scan; we keep the contact "pressed" until at least one full scan has read
   * it, so every click is seen by the program (at any simulation speed).
   */
  private readonly held = new Map<string, number>();
  private plantState: unknown = null;

  constructor(store: SimulatorStoreApi) {
    this.store = store;
    this.unsubscribe = store.subscribe((state, prev) => {
      // Online change: reload the program while running whenever it compiles.
      if (state.compiled !== prev.compiled && state.status !== 'stopped') this.loadCompiled();
      if (state.ioControls !== prev.ioControls) {
        for (const [address, on] of Object.entries(state.ioControls)) {
          if (on && !prev.ioControls[address])
            // A press in the middle of a scan (visualize mode) was not read by that scan:
            // keep it until the next one completes.
            this.held.set(address, this.runtime.scanCount + (this.scanParts ? 1 : 0));
        }
      }
      if (state.project.plant !== prev.project.plant) this.resetPlant();
    });
    this.resetPlant();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.vizTimer);
    this.unsubscribe?.();
  }

  get cycleTimeMs(): number {
    return this.runtime.cycleTimeMs;
  }

  /** The plant model of the current project (null = no plant). */
  private get plant(): PlantModel | null {
    const id = this.store.getState().project.plant;
    return isPlantId(id) ? PLANTS[id] : null;
  }

  /** Operator action on the plant (simulate overload, turn the consumer off…). */
  plantCommand(name: string): void {
    const plant = this.plant;
    if (!plant?.command) return;
    this.plantState = plant.command(this.plantState, name);
    this.applyInputs();
    this.publish(true);
  }

  /** Puts the plant back in its initial state (new plant, PLC start or stop). */
  resetPlant(): void {
    this.plantState = this.plant?.initial() ?? null;
    this.applyInputs();
    this.publish(true);
  }

  run(): void {
    this.exitVisualize();
    const { status } = this.store.getState();
    if (status === 'stopped' && !this.startProgram()) return;
    this.store.setState({ status: 'running' });
    this.loop();
  }

  pause(): void {
    if (this.store.getState().status !== 'running') return;
    this.store.setState({ status: 'paused' });
  }

  stop(): void {
    this.exitVisualize();
    this.runtime.stop();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.store.setState({ status: 'stopped', notLoaded: false, probes: {} });
    this.resetPlant();
  }

  /** Runs exactly one scan cycle and stays paused (starts the PLC if needed). */
  step(): void {
    this.exitVisualize();
    const { status } = this.store.getState();
    if (status === 'stopped' && !this.startProgram()) return;
    this.store.setState({ status: 'paused' });
    this.scanOnce();
    this.afterScans();
    this.publish(true);
    this.loop();
  }

  setSpeed(speed: number): void {
    this.store.setState({ speed });
  }

  force(address: string, value: boolean | null): void {
    this.runtime.force(address, value);
    this.publish(true);
  }

  isForced(address: string): boolean {
    return this.runtime.isForced(address);
  }

  /** Monitor "modify": write a marker, output or word once. */
  write(address: string, value: Value): void {
    this.runtime.write(address, value);
    this.publish(true);
  }

  // -------------------------------------------------------------------------------------------
  // Visualize scan (spec 6.2): walk through one part of the scan at a time
  // -------------------------------------------------------------------------------------------

  private scanParts: Generator<ScanEvent, void, void> | null = null;
  private vizTimer: ReturnType<typeof setTimeout> | undefined;

  /** Starts (or resumes) the automatic, slow walk through the scan cycle. */
  visualize(): void {
    if (!this.enterVisualize()) return;
    this.setScanView({ auto: true });
    this.scheduleVisualize();
  }

  pauseVisualize(): void {
    clearTimeout(this.vizTimer);
    this.setScanView({ auto: false });
  }

  /** Performs exactly the next part of the scan (read, one rung, write or housekeeping). */
  nextPart(): void {
    if (!this.enterVisualize()) return;
    clearTimeout(this.vizTimer);
    this.setScanView({ auto: false });
    this.visualizeStep();
  }

  /** Leaves visualize mode, completing the scan in progress so memory stays consistent. */
  exitVisualize(): void {
    clearTimeout(this.vizTimer);
    if (this.scanParts) {
      while (!this.scanParts.next().done) {
        /* finish the current scan */
      }
      this.scanParts = null;
      this.afterScans();
    }
    if (this.store.getState().scanView.active) {
      this.store.setState({ scanView: { active: false, auto: true, event: null } });
      this.publish(true);
    }
  }

  private enterVisualize(): boolean {
    const { status } = this.store.getState();
    if (status === 'stopped' && !this.startProgram()) return false;
    if (status !== 'paused') this.store.setState({ status: 'paused' });
    this.store.setState({ bottomTab: 'scan' });
    this.setScanView({ active: true });
    this.loop();
    return true;
  }

  private setScanView(patch: Partial<ReturnType<SimulatorStoreApi['getState']>['scanView']>): void {
    this.store.setState({ scanView: { ...this.store.getState().scanView, ...patch } });
  }

  private visualizeStep(): void {
    if (this.runtime.mode !== 'RUN') {
      this.exitVisualize();
      return;
    }
    if (!this.scanParts) {
      this.applyInputs();
      this.scanParts = this.runtime.scanSteps();
    }
    const next = this.scanParts.next();
    if (next.done) {
      this.scanParts = null;
      this.afterPlantScan();
      this.visualizeStep();
      return;
    }
    this.afterScans();
    this.setScanView({ event: next.value });
    this.publish(true);
  }

  private scheduleVisualize(): void {
    clearTimeout(this.vizTimer);
    const { scanView, speed } = this.store.getState();
    if (!scanView.active || !scanView.auto) return;
    const base = scanView.event?.phase === 'execute' ? 1100 : 1600;
    this.vizTimer = setTimeout(() => {
      this.visualizeStep();
      this.scheduleVisualize();
    }, base / speed);
  }

  // -------------------------------------------------------------------------------------------

  private startProgram(): boolean {
    const { compiled } = this.store.getState();
    if (!compiled.ir) {
      this.store.setState({ bottomTab: 'console' });
      return false;
    }
    this.runtime.load(compiled.ir);
    this.runtime.start();
    this.carry = 0;
    this.plantState = this.plant?.initial() ?? null;
    this.store.setState({ notLoaded: false });
    return true;
  }

  private loadCompiled(): void {
    const { compiled } = this.store.getState();
    if (compiled.ir) {
      this.runtime.load(compiled.ir);
      this.store.setState({ notLoaded: false });
    } else {
      this.store.setState({ notLoaded: true });
    }
  }

  private applyInputs(): void {
    const { project, ioControls } = this.store.getState();
    let controls = ioControls;
    for (const [address, since] of this.held) {
      // Released only after a scan that started after the press has completed.
      if (this.runtime.scanCount > since || this.runtime.mode !== 'RUN') this.held.delete(address);
      else if (!controls[address]) controls = { ...controls, [address]: true };
    }
    for (const address of PANEL_INPUTS) {
      this.runtime.setInput(address, physicalInput(address, project.io, controls));
    }
    const plant = this.plant;
    if (plant) applySensors(this.runtime, plant, this.plantState);
  }

  /** One scan with fresh inputs, followed by one cycle of plant physics. */
  private scanOnce(): void {
    this.applyInputs();
    this.runtime.scan();
    this.afterPlantScan();
  }

  private afterPlantScan(): void {
    const plant = this.plant;
    if (plant && this.runtime.mode === 'RUN')
      this.plantState = stepPlant(this.runtime, plant, this.plantState);
  }

  /** A watchdog fault stops the PLC by itself: reflect it in the UI. */
  private afterScans(): void {
    if (this.runtime.mode === 'STOP' && this.store.getState().status !== 'stopped') {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.store.setState({ status: 'stopped', probes: {}, bottomTab: 'console' });
    }
  }

  private loop(): void {
    if (this.frame) return;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      const state = this.store.getState();
      if (state.status === 'stopped') {
        this.frame = 0;
        return;
      }
      this.applyInputs();
      if (state.status === 'running') {
        this.carry += Math.min(now - this.lastFrame, MAX_FRAME_MS) * state.speed;
        const cycle = this.runtime.cycleTimeMs;
        if (this.plant) {
          // The plant needs its sensors refreshed before every scan.
          for (; this.carry >= cycle && this.runtime.mode === 'RUN'; this.carry -= cycle)
            this.scanOnce();
        } else {
          this.carry -= this.runtime.advance(this.carry) * cycle;
        }
        this.afterScans();
      }
      this.lastFrame = now;
      if (now - this.lastPublish >= PUBLISH_EVERY_MS) this.publish();
      this.frame = this.store.getState().status === 'stopped' ? 0 : requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private publish(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastPublish < PUBLISH_EVERY_MS) return;
    this.lastPublish = now;
    const running = this.store.getState().status !== 'stopped';
    this.store.setState({
      snapshot: this.runtime.snapshot(),
      plantState: this.plantState,
      probes: running ? Object.fromEntries(this.runtime.probes) : {},
    });
  }
}
