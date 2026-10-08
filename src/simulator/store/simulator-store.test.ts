import { describe, expect, it } from 'vitest';
import { exampleProject, getExample } from '@/simulator/examples';
import { emptyProject } from '@/simulator/project/examples';
import { createSimulatorStore } from './simulator-store';

const example = (id: string) => exampleProject(getExample(id)!, 'es');

describe('project switches', () => {
  it('replacing the project announces a switch and clears the panel controls', () => {
    const store = createSimulatorStore(example('traffic-light'));
    store.getState().setIoControl('I0.0', true);
    store.getState().setAnalogInput('IW0', 1000);
    store.getState().replaceProject(example('tank-filling'));
    const s = store.getState();
    expect(s.projectSwitch).toBe(1);
    expect(s.ioControls).toEqual({});
    expect(s.analogInputs).toEqual({});
    expect(s.project.plant).toBe('tank');
  });

  it('undo/redo across a replacement is a switch; across a normal edit it is not', () => {
    const store = createSimulatorStore(emptyProject());
    store.getState().replaceProject(example('lamp-switch'));
    store.getState().commit((p) => ({ ...p, name: 'Edited' }), 'name');
    expect(store.getState().projectSwitch).toBe(1);
    store.getState().undo(); // undo the rename: same project
    expect(store.getState().projectSwitch).toBe(1);
    store.getState().undo(); // back to the empty project: a different one
    expect(store.getState().projectSwitch).toBe(2);
    store.getState().redo(); // forward to the example again
    expect(store.getState().projectSwitch).toBe(3);
    store.getState().redo(); // the rename
    expect(store.getState().projectSwitch).toBe(3);
    expect(store.getState().project.name).toBe('Edited');
  });

  it('the switch is announced before the new project is applied', () => {
    const store = createSimulatorStore(example('traffic-light'));
    const seen: (string | null)[] = [];
    store.subscribe((s, prev) => {
      if (s.projectSwitch !== prev.projectSwitch) seen.push(s.project.plant);
    });
    store.getState().replaceProject(example('oven-temperature'));
    expect(seen).toEqual(['traffic']);
  });
});
