import { describe, expect, it } from 'vitest';
import {
  and,
  assign,
  if_,
  let_,
  network,
  no,
  program,
  read,
  rising,
  set,
  temp,
} from '@/simulator/ir/builders';
import type { IrProgram } from '@/simulator/ir/types';
import { analyze, hasErrors } from '../analyze';
import { PlcRuntime } from '../runtime';
import { ProgramLoadError } from '../errors';

const codes = (p: IrProgram) => analyze(p).map((d) => `${d.severity}:${d.code}`);

describe('analyze', () => {
  it('accepts a valid program', () => {
    const p = program(network('n1', [assign('Q0.0', and(no('I0.0'), no('I0.1')))]));
    expect(analyze(p)).toEqual([]);
  });

  it('reports invalid and out-of-range addresses with their source', () => {
    const p = program(
      network('n1', [
        assign('Q0.0', { kind: 'read', address: 'I9.0', source: 'contact-1' }),
        { kind: 'assign', target: 'Z0.0', value: read('I0.0'), source: 'coil-1' },
      ]),
    );
    const d = analyze(p);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({
      severity: 'error',
      code: 'INVALID_ADDRESS',
      params: { address: 'I9.0' },
      networkId: 'n1',
      source: 'contact-1',
    });
    expect(d[1]).toMatchObject({ code: 'INVALID_ADDRESS', source: 'coil-1' });
  });

  it('forbids writing system bits and warns when writing inputs', () => {
    expect(codes(program(network('n', [assign('S0.0', read('I0.0'))])))).toEqual([
      'error:READ_ONLY_TARGET',
    ]);
    expect(codes(program(network('n', [set('I0.0', read('I0.1'))])))).toEqual([
      'warning:INPUT_WRITE',
    ]);
  });

  it('warns about duplicate coils in every place they appear', () => {
    const p = program(
      network('n1', [assign('Q0.0', read('I0.0'))]),
      network('n2', [assign('Q0.0', read('I0.1'))]),
    );
    const d = analyze(p);
    expect(d.map((x) => [x.code, x.networkId])).toEqual([
      ['DUPLICATE_OUTPUT', 'n1'],
      ['DUPLICATE_OUTPUT', 'n2'],
    ]);
    expect(hasErrors(d)).toBe(false);
  });

  it('does not count set/reset or assignments nested in IF as duplicate coils', () => {
    const p = program(
      network('n1', [
        assign('Q0.0', read('I0.0')),
        set('Q0.0', read('I0.1')),
        if_(read('I0.2'), [assign('Q0.0', read('I0.3'))]),
      ]),
    );
    expect(analyze(p)).toEqual([]);
  });

  it('can disable the duplicate coil warning (for ST)', () => {
    const p = program(network('n', [assign('Q0.0', read('I0.0')), assign('Q0.0', read('I0.1'))]));
    expect(analyze(p, undefined, { warnDuplicateOutputs: false })).toEqual([]);
  });

  it('requires temporaries to be declared before use, per network', () => {
    const ok = program(network('n', [let_('t', read('I0.0')), assign('Q0.0', temp('t'))]));
    expect(analyze(ok)).toEqual([]);

    const usedBefore = program(network('n', [assign('Q0.0', temp('t')), let_('t', read('I0.0'))]));
    expect(codes(usedBefore)).toEqual(['error:UNDEFINED_TEMP']);

    const otherNetwork = program(
      network('a', [let_('t', read('I0.0'))]),
      network('b', [assign('Q0.0', temp('t'))]),
    );
    expect(codes(otherNetwork)).toEqual(['error:UNDEFINED_TEMP']);
  });

  it('detects shared edge instances, duplicate network ids and empty operations', () => {
    const p = program(
      network('n', [
        assign('Q0.0', rising(read('I0.0'), 'e')),
        assign('Q0.1', rising(read('I0.1'), 'e')),
      ]),
      network('n', [assign('Q0.2', and())]),
    );
    expect(codes(p)).toEqual([
      'error:DUPLICATE_EDGE_INSTANCE',
      'error:DUPLICATE_NETWORK_ID',
      'error:EMPTY_OPERATION',
    ]);
  });

  it('rejects unknown IR versions', () => {
    const p = { version: 99, networks: [] } as unknown as IrProgram;
    expect(codes(p)).toEqual(['error:UNSUPPORTED_VERSION']);
  });

  it('runtime.load throws with diagnostics on errors and returns warnings otherwise', () => {
    const rt = new PlcRuntime();
    try {
      rt.load(program(network('n', [assign('Q9.9', read('I0.0'))])));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProgramLoadError);
      expect((e as ProgramLoadError).diagnostics[0]?.code).toBe('INVALID_ADDRESS');
    }
    const warnings = rt.load(program(network('n', [assign('I0.0', read('I0.1'))])));
    expect(warnings.map((w) => w.code)).toEqual(['INPUT_WRITE']);
  });
});
