/**
 * "Virtual plant" tab: choose the plant connected to the program, watch it and operate it.
 */
import { useShallow } from 'zustand/react/shallow';
import { formatAddressStyled } from '@/simulator/addressing/styles';
import { PLANTS } from '@/simulator/plants/models';
import { isPlantId, PLANT_IDS, type PlantId } from '@/simulator/plants/types';
import { PlantView } from '@/simulator/plants/views/PlantViews';
import { InputControl } from '@/simulator/io-panel/IoBoard';
import { PANEL_INPUTS, PANEL_OUTPUTS } from '@/simulator/store/controller';
import { useController, useSim, useStoreApi, useStrings } from './context';

export function PlantPanel() {
  const t = useStrings();
  const store = useStoreApi();
  const controller = useController();
  const { plantId, plantState, outputs, running, analogOutputs, style } = useSim(
    useShallow((s) => ({
      plantId: s.project.plant,
      plantState: s.plantState,
      outputs: s.snapshot?.physicalOutputs,
      running: s.snapshot?.mode === 'RUN',
      analogOutputs: s.snapshot?.words.QW,
      style: s.addressStyle,
    })),
  );
  const plant = isPlantId(plantId) ? plantId : null;
  const out = (address: string) => outputs?.[PANEL_OUTPUTS.indexOf(address)] ?? false;
  // Physical analog outputs drop to 0 in STOP, like the plant sees them.
  const word = (address: string) =>
    running ? (analogOutputs?.[Number(address.slice(2))] ?? 0) : 0;

  return (
    <div className="flex h-full gap-4 overflow-auto px-3 py-2.5" data-testid="plant-panel">
      <div className="flex min-w-0 flex-1 items-center justify-center">
        {plant ? (
          <PlantView
            plant={plant}
            state={plantState}
            out={out}
            word={word}
            t={t.plant}
            onCommand={(name) => controller.plantCommand(name)}
          />
        ) : (
          <p className="max-w-md text-center text-sm text-text-muted">{t.plant.empty}</p>
        )}
      </div>
      <aside className="flex w-72 shrink-0 flex-col gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-text-muted">{t.plant.select}</span>
          <select
            data-testid="plant-select"
            value={plant ?? ''}
            onChange={(e) => {
              const next = e.target.value;
              store.getState().commit((p) => ({ ...p, plant: isPlantId(next) ? next : null }));
            }}
            className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          >
            <option value="">{t.plant.none}</option>
            {PLANT_IDS.map((id) => (
              <option key={id} value={id}>
                {t.plant.names[id]}
              </option>
            ))}
          </select>
        </label>
        {plant && <OperatorControls plant={plant} />}
        {plant && <Connections plant={plant} style={style} />}
        {plant && <p className="text-text-muted">{t.plant.resetHint}</p>}
      </aside>
    </div>
  );
}

/** The panel inputs with a label (switches, buttons), so the plant can be run from this tab. */
function OperatorControls({ plant }: { plant: PlantId }) {
  const t = useStrings();
  const { io, controls } = useSim(
    useShallow((s) => ({ io: s.project.io, controls: s.ioControls })),
  );
  const sensors: readonly string[] = PLANTS[plant].sensors;
  const inputs = PANEL_INPUTS.filter((a) => io.inputs[a]?.label && !sensors.includes(a));
  if (inputs.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1.5 font-semibold text-text-muted">{t.plant.controls}</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {inputs.map((address) => {
          const label = io.inputs[address]?.label ?? '';
          return (
            <li key={address} className="flex items-center gap-2" data-plant-control={address}>
              <InputControl
                address={address}
                mode={io.inputs[address]?.mode ?? 'switch'}
                name={`${address} ${label}`}
                active={controls[address] ?? false}
                small
              />
              <span className="font-medium text-text">{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Connections({
  plant,
  style,
}: {
  plant: PlantId;
  style: Parameters<typeof formatAddressStyled>[1];
}) {
  const t = useStrings();
  const model = PLANTS[plant];
  const signals = t.plant.signals[plant] as Record<string, string>;
  const rows = [
    ...model.actuators.map((a) => ({ address: a, kind: t.plant.actuator })),
    ...model.sensors.map((a) => ({ address: a, kind: t.plant.sensor })),
  ];
  return (
    <section>
      <h3 className="mb-1 font-semibold text-text-muted">{t.plant.connections}</h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map(({ address, kind }) => (
          <li key={address} className="flex gap-2" title={kind}>
            <span className="w-12 shrink-0 font-mono text-text-muted">
              {formatAddressStyled(address, style)}
            </span>
            <span className="text-text">{signals[address.replace('.', '_')]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
