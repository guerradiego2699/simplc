import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileLadder } from '@/simulator/languages/ladder/compile';
import {
  allElements,
  coil,
  contact,
  parallel,
  rung,
  series,
} from '@/simulator/languages/ladder/model';
import { motorStartStopProject } from '@/simulator/project/examples';
import type { Project } from '@/simulator/project/types';
import { AUTOSAVE_KEY, loadAutosave, saveAutosave } from './autosave';
import { fileNameFor, parseProjectFile, serializeProject } from './project-file';

const TEXTS = {
  name: 'Partida y parada',
  start: 'MARCHA',
  stop: 'PARO',
  motor: 'MOTOR',
  startComment: 'NA',
  stopComment: 'NC',
  motorComment: 'Contactor',
  rungComment: 'Autorretención',
};

/** Structure without ids, to compare projects before and after a round trip. */
function shape(p: Project) {
  return JSON.parse(JSON.stringify(p, (key, value) => (key === 'id' ? undefined : value)));
}

describe('project file', () => {
  it('round-trips a project (same content, fresh ids)', () => {
    const original = motorStartStopProject(TEXTS);
    original.ladder.rungs.push(
      rung([contact('TON', 'T0', { pt: 'T#2s' })], [coil('ADD', 'MW0', { in1: 'MW0', in2: '1' })]),
    );
    const result = parseProjectFile(serializeProject(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.project)).toEqual(shape(original));

    const before = new Set(allElements(original.ladder).map((e) => e.id));
    expect(allElements(result.project.ladder).some((e) => before.has(e.id))).toBe(false);
    // The loaded program still compiles without errors.
    expect(compileLadder(result.project.ladder, result.project.tags).ir).not.toBeNull();
  });

  it('writes format, version and date', () => {
    const json = JSON.parse(
      serializeProject(motorStartStopProject(TEXTS), new Date('2026-01-02T03:04:05Z')),
    );
    expect(json).toMatchObject({
      format: 'plcampus-project',
      version: 1,
      savedAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('gives unique ids even if the file repeats them', () => {
    const p = motorStartStopProject(TEXTS);
    const json = JSON.parse(serializeProject(p));
    // Hand-edited file: every element and rung gets the same id.
    const text = JSON.stringify(json).replace(/"id":"[^"]+"/g, '"id":"same"');
    const result = parseProjectFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = allElements(result.project.ladder).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts files without ids and keeps nested branches', () => {
    const p = motorStartStopProject(TEXTS);
    p.ladder.rungs[0]!.logic.items.push(parallel(series([contact('NO', 'I0.5')]), series()));
    const text = JSON.stringify(JSON.parse(serializeProject(p)), (k, v) =>
      k === 'id' ? undefined : v,
    );
    const result = parseProjectFile(text);
    expect(result.ok && result.project.ladder.rungs[0]!.logic.items).toHaveLength(3);
  });

  it('rejects invalid JSON, foreign files and newer versions', () => {
    expect(parseProjectFile('{nope')).toEqual({ ok: false, error: { code: 'INVALID_JSON' } });
    expect(parseProjectFile('{"hello":1}')).toEqual({
      ok: false,
      error: { code: 'NOT_A_PROJECT' },
    });
    expect(parseProjectFile('[]')).toEqual({ ok: false, error: { code: 'NOT_A_PROJECT' } });
    const future = JSON.parse(serializeProject(motorStartStopProject(TEXTS)));
    future.version = 9;
    expect(parseProjectFile(JSON.stringify(future))).toEqual({
      ok: false,
      error: { code: 'NEWER_VERSION', version: 9 },
    });
  });

  it('points at the first invalid part of the content', () => {
    const json = JSON.parse(serializeProject(motorStartStopProject(TEXTS)));
    json.project.ladder.rungs[0].coils[0].type = 'explode';
    expect(parseProjectFile(JSON.stringify(json))).toEqual({
      ok: false,
      error: { code: 'INVALID_CONTENT', path: 'project.ladder.rungs.0.coils.0.type' },
    });

    const noTags = JSON.parse(serializeProject(motorStartStopProject(TEXTS)));
    delete noTags.project.tags;
    expect(parseProjectFile(JSON.stringify(noTags))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CONTENT', path: 'project.tags' },
    });
  });

  it('builds safe file names', () => {
    expect(fileNameFor('Partida y parada: motor Nº1!', 'x')).toBe(
      'partida-y-parada-motor-n-1.plcampus.json',
    );
    expect(fileNameFor('   ', 'proyecto')).toBe('proyecto.plcampus.json');
  });
});

describe('autosave', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    return data;
  }

  it('saves and restores the project', () => {
    stubStorage();
    expect(loadAutosave()).toBeNull();
    const p = motorStartStopProject(TEXTS);
    expect(saveAutosave(p)).toBe('saved');
    expect(shape(loadAutosave()!)).toEqual(shape(p));
  });

  it('ignores corrupt data', () => {
    const data = stubStorage();
    data.set(AUTOSAVE_KEY, '{broken');
    expect(loadAutosave()).toBeNull();
  });

  it('keeps working when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(loadAutosave()).toBeNull();
    expect(saveAutosave(motorStartStopProject(TEXTS))).toBe('unavailable');
  });
});
