/**
 * Training panel (spec 6.6): 16 digital inputs — switch or momentary push button (NO/NC),
 * selectable per input — and 16 output LEDs, with editable labels.
 * Input LEDs show the terminal state (what the PLC input receives); output LEDs show the
 * physical outputs (including forced ones). Addresses follow the selected brand style.
 * Inputs wired to the virtual plant's sensors are driven by the plant, not by the panel.
 */
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Factory, Pencil } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { formatAddressStyled, type AddressStyle } from '@/simulator/addressing/styles';
import { PLANTS } from '@/simulator/plants/models';
import { ANALOG_FULL_SCALE, isPlantId } from '@/simulator/plants/types';
import {
  PANEL_ANALOG_INPUTS,
  PANEL_ANALOG_OUTPUTS,
  PANEL_INPUTS,
  PANEL_OUTPUTS,
  physicalInput,
} from '@/simulator/store/controller';
import type { InputMode, IoPanelSetup, Project } from '@/simulator/project/types';
import { fmt, useSim, useStoreApi, useStrings } from '@/simulator/ui/context';

const MODES: InputMode[] = ['switch', 'button-no', 'button-nc'];

const setInputSetup = (
  p: Project,
  address: string,
  patch: { label?: string; mode?: InputMode },
): Project => ({
  ...p,
  io: { ...p.io, inputs: { ...p.io.inputs, [address]: { ...p.io.inputs[address], ...patch } } },
});
const setOutputLabel = (p: Project, address: string, label: string): Project => ({
  ...p,
  io: { ...p.io, outputs: { ...p.io.outputs, [address]: { label } } },
});

function Led({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${on ? 1 : 0}`}
      data-on={on}
      className={`inline-block size-3.5 shrink-0 rounded-full border ${
        on ? 'border-led-on bg-led-on shadow-[0_0_8px_var(--led-on)]' : 'border-border bg-surface-2'
      }`}
    />
  );
}

function AddressText({ address, style }: { address: string; style: AddressStyle }) {
  return (
    <span className="font-mono text-[11px] text-text-muted" title={address}>
      {formatAddressStyled(address, style)}
    </span>
  );
}

export function IoBoard() {
  const t = useStrings();
  const store = useStoreApi();
  const [editing, setEditing] = useState(false);
  const { io, controls, outputs, inputs, plant, style } = useSim(
    useShallow((s) => ({
      io: s.project.io,
      controls: s.ioControls,
      outputs: s.snapshot?.physicalOutputs,
      inputs: s.snapshot?.physicalInputs,
      plant: s.project.plant,
      style: s.addressStyle,
    })),
  );
  const plantSensors: readonly string[] = isPlantId(plant) ? PLANTS[plant].sensors : [];

  return (
    <div className="relative h-full">
      <div className="absolute top-1.5 right-3 z-10">
        <button
          type="button"
          aria-pressed={editing}
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text aria-pressed:text-primary"
        >
          <Pencil size={13} aria-hidden="true" />
          {editing ? t.io.done : t.io.edit}
        </button>
      </div>
      <div className="grid h-full gap-4 overflow-auto px-3 pt-2.5 pb-3 xl:grid-cols-2">
        <section aria-label={t.io.inputs}>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            {t.io.inputs}
          </h3>
          <div className="grid grid-cols-8 gap-1">
            {PANEL_INPUTS.map((address, i) => (
              <InputSlot
                key={address}
                address={address}
                io={io}
                controls={controls}
                editing={editing}
                style={style}
                fromPlant={plantSensors.includes(address) ? (inputs?.[i] ?? false) : null}
              />
            ))}
          </div>
        </section>
        <section aria-label={t.io.outputs}>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            {t.io.outputs}
          </h3>
          <div className="grid grid-cols-8 gap-1">
            {PANEL_OUTPUTS.map((address, i) => {
              const label = io.outputs[address]?.label ?? '';
              return (
                <div
                  key={address}
                  data-output={address}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border bg-bg px-1 py-1.5"
                >
                  <Led on={outputs?.[i] ?? false} label={address} />
                  <AddressText address={address} style={style} />
                  {editing ? (
                    <input
                      aria-label={`${t.io.labelPlaceholder} ${address}`}
                      placeholder={t.io.labelPlaceholder}
                      className="w-full min-w-0 rounded border border-border bg-bg px-1 text-center text-[11px] text-text focus:border-primary focus:outline-none"
                      value={label}
                      onChange={(e) =>
                        store
                          .getState()
                          .commit(
                            (p) => setOutputLabel(p, address, e.target.value),
                            `out-label:${address}`,
                          )
                      }
                    />
                  ) : (
                    <span
                      className="w-full truncate text-center text-[11px] font-medium text-text"
                      title={label}
                    >
                      {label || ' '}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <AnalogPanel plantSensors={plantSensors} />
      </div>
    </div>
  );
}

/** Analog channels: potentiometers for IW0/IW1 and bar indicators for QW0/QW1 (spec 6.6). */
function AnalogPanel({ plantSensors }: { plantSensors: readonly string[] }) {
  const t = useStrings();
  const store = useStoreApi();
  const { values, iw, qw, style } = useSim(
    useShallow((s) => ({
      values: s.analogInputs,
      iw: s.snapshot?.words.IW,
      qw: s.snapshot?.words.QW,
      style: s.addressStyle,
    })),
  );
  const pct = (raw: number) =>
    Math.round((Math.max(0, Math.min(raw, ANALOG_FULL_SCALE)) / ANALOG_FULL_SCALE) * 100);
  const row = 'flex items-center gap-2 rounded-md border border-border bg-bg px-2 py-1.5';
  return (
    <section aria-label={t.io.analog} className="xl:col-span-2" data-analog-panel>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
        {t.io.analog}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {PANEL_ANALOG_INPUTS.map((address, i) => {
          const fromPlant = plantSensors.includes(address);
          const raw = fromPlant ? (iw?.[i] ?? 0) : (values[address] ?? 0);
          return (
            <div key={address} className={row} data-analog-input={address}>
              <AddressText address={address} style={style} />
              {fromPlant ? (
                <span
                  role="img"
                  aria-label={`${address}: ${t.plant.fromPlant}`}
                  title={t.plant.fromPlant}
                  data-from-plant
                  className="inline-flex text-text-muted"
                >
                  <Factory size={15} aria-hidden="true" />
                </span>
              ) : null}
              <input
                type="range"
                min={0}
                max={ANALOG_FULL_SCALE}
                step={1}
                value={raw}
                disabled={fromPlant}
                aria-label={fmt(t.io.potentiometer, { address })}
                onChange={(e) => store.getState().setAnalogInput(address, Number(e.target.value))}
                className="min-w-0 flex-1 accent-primary disabled:opacity-60"
              />
              <span className="w-24 text-right font-mono text-[11px] text-text">
                {raw} · {fmt(t.io.percent, { p: pct(raw) })}
              </span>
            </div>
          );
        })}
        {PANEL_ANALOG_OUTPUTS.map((address, i) => {
          const raw = qw?.[i] ?? 0;
          return (
            <div key={address} className={row} data-analog-output={address}>
              <AddressText address={address} style={style} />
              <div
                className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
                role="meter"
                aria-label={address}
                aria-valuemin={0}
                aria-valuemax={ANALOG_FULL_SCALE}
                aria-valuenow={raw}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct(raw)}%` }} />
              </div>
              <span className="w-24 text-right font-mono text-[11px] text-text">
                {raw} · {fmt(t.io.percent, { p: pct(raw) })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InputSlot({
  address,
  io,
  controls,
  editing,
  style,
  fromPlant,
}: {
  address: string;
  io: IoPanelSetup;
  controls: Record<string, boolean>;
  editing: boolean;
  style: AddressStyle;
  /** Terminal value set by the plant's sensor (null = the panel drives this input). */
  fromPlant: boolean | null;
}) {
  const t = useStrings();
  const store = useStoreApi();
  const setup = io.inputs[address];
  const mode: InputMode = setup?.mode ?? 'switch';
  const label = setup?.label ?? '';
  const terminal = fromPlant ?? physicalInput(address, io, controls);
  const name = `${address}${label ? ` ${label}` : ''}`;

  return (
    <div
      data-input={address}
      className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border bg-bg px-1 py-1.5"
    >
      <Led on={terminal} label={address} />
      {fromPlant === null ? (
        <InputControl
          address={address}
          mode={mode}
          name={name}
          active={controls[address] ?? false}
        />
      ) : (
        <span
          role="img"
          aria-label={`${name}: ${t.plant.fromPlant}`}
          title={t.plant.fromPlant}
          data-from-plant
          className="inline-flex h-7 items-center text-text-muted"
        >
          <Factory size={18} aria-hidden="true" />
        </span>
      )}
      <AddressText address={address} style={style} />
      {editing ? (
        <>
          <input
            aria-label={`${t.io.labelPlaceholder} ${address}`}
            placeholder={t.io.labelPlaceholder}
            className="w-full min-w-0 rounded border border-border bg-bg px-1 text-center text-[11px] text-text focus:border-primary focus:outline-none"
            value={label}
            onChange={(e) =>
              store
                .getState()
                .commit(
                  (p) => setInputSetup(p, address, { label: e.target.value }),
                  `in-label:${address}`,
                )
            }
          />
          <select
            aria-label={`${t.io.modes.switch} / ${t.io.modes['button-no']} ${address}`}
            className="w-full min-w-0 rounded border border-border bg-bg text-[10px] text-text"
            value={mode}
            onChange={(e) =>
              store
                .getState()
                .commit((p) => setInputSetup(p, address, { mode: e.target.value as InputMode }))
            }
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t.io.modes[m]}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span
          className="w-full truncate text-center text-[11px] font-medium text-text"
          title={label}
        >
          {label || ' '}
        </span>
      )}
    </div>
  );
}

/**
 * The control of one input: a maintained switch, or a momentary push button (NO or NC) that is
 * active only while held with the mouse, touch or keyboard. Used by the panel and the scan tab.
 */
export function InputControl({
  address,
  mode,
  name,
  active,
  small = false,
}: {
  address: string;
  mode: InputMode;
  name: string;
  active: boolean;
  small?: boolean;
}) {
  const t = useStrings();
  const store = useStoreApi();
  const set = (value: boolean) => store.getState().setIoControl(address, value);

  if (mode === 'switch') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${t.io.modes.switch} ${name}`}
        onClick={() => set(!active)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-wire-off'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-bg shadow transition-transform ${active ? 'translate-x-4' : ''}`}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${t.io.modes[mode]} ${name}`}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onKeyDown={(e: KeyboardEvent) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          set(true);
        }
      }}
      onKeyUp={(e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') set(false);
      }}
      onBlur={() => set(false)}
      className={`${small ? 'size-5' : 'size-7'} shrink-0 rounded-full border-2 shadow-sm transition-transform select-none aria-pressed:translate-y-px aria-pressed:shadow-none ${
        mode === 'button-nc' ? 'border-danger bg-danger/80' : 'border-border bg-surface-2'
      }`}
    />
  );
}
