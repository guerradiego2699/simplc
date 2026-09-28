/**
 * Draws one Ladder element (contact, compare, timer, counter, coil or output box) with its
 * operand labels, live values in RUN, forced/diagnostic markers and selection frame.
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  formatTime,
  parseAddress,
  parseLiteral,
  type MemorySnapshot,
  type Value,
} from '@/simulator/engine';
import { formatAddressStyled, type AddressStyle } from '@/simulator/addressing/styles';
import { resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import { diagnosticMessage, worst } from '@/simulator/ui/diagnostics';
import { useLocale, useStrings } from '@/simulator/ui/context';
import { spec } from '../catalog';
import { stateProbe, type LadderDiagnostic } from '../compile';
import type { PlacedElement } from '../layout';
import type { Element } from '../model';
import { BoxShape, CoilShape, CompareShape, ContactShape } from './symbols';

export const CELL_W = 96;
export const CELL_H = 76;

const clip = (s: string, max = 12) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export interface OperandDisplay {
  /** Main text: tag name, styled address or literal. */
  label: string;
  /** Secondary text: the address of a tag. */
  sub: string;
  ok: boolean;
  address?: string;
}

/** How an operand is shown in the editor for a given address style. */
export function displayOperand(
  text: string,
  tags: readonly Tag[],
  style: AddressStyle,
  empty: string,
): OperandDisplay {
  const trimmed = text.trim();
  if (trimmed === '') return { label: empty, sub: '', ok: false };
  if (parseLiteral(trimmed)) return { label: trimmed, sub: '', ok: true };
  const res = resolveOperand(trimmed, tags);
  if (!res.ok) return { label: trimmed, sub: '', ok: false };
  const styled = formatAddressStyled(res.address, style);
  return res.tag
    ? { label: res.tag.name, sub: styled, ok: true, address: res.address }
    : { label: styled, sub: '', ok: true, address: res.address };
}

/** Current value of an address in a snapshot. */
export function liveValue(address: string, snap: MemorySnapshot): Value | undefined {
  const ref = parseAddress(address);
  if (!ref) return undefined;
  switch (ref.kind) {
    case 'bit':
      return snap.bits[ref.area][ref.byte * 8 + ref.bit];
    case 'word':
      return snap.words[ref.area][ref.index];
    case 'timer': {
      const t = snap.timers[ref.index];
      if (!t) return undefined;
      return ref.member === 'ET'
        ? t.et
        : ref.member === 'PT'
          ? t.pt
          : ref.member === 'IN'
            ? t.in
            : t.q;
    }
    case 'counter': {
      const c = snap.counters[ref.index];
      if (!c) return undefined;
      if (ref.member === 'CV') return c.cv;
      if (ref.member === 'PV') return c.pv;
      if (ref.member === 'QD') return c.qd;
      return ref.member === 'QU' ? c.qu : c.type === 'CTD' ? c.qd : c.qu;
    }
  }
}

export function formatValue(
  v: Value | undefined,
  address: string | undefined,
  locale: string,
): string {
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '1' : '0';
  const ref = address ? parseAddress(address) : null;
  if (ref?.kind === 'timer' && (ref.member === 'ET' || ref.member === 'PT')) {
    return formatTime(v, locale);
  }
  if (ref?.kind === 'word' && ref.area === 'MD') {
    return v.toLocaleString(locale, { maximumFractionDigits: 3 });
  }
  return String(v);
}

const MATH_SIGN: Record<string, string> = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷' };

interface Props {
  placed: PlacedElement;
  element: Element;
  x: number;
  y: number;
  selected: boolean;
  running: boolean;
  power: (ref: string) => boolean;
  probes: Record<string, Value>;
  snapshot: MemorySnapshot | null;
  style: AddressStyle;
  diagnostics: LadderDiagnostic[] | undefined;
  tags: readonly Tag[];
  onPress: (e: ReactPointerEvent) => void;
  onActivate: () => void;
}

export function ElementView({
  placed,
  element,
  x,
  y,
  selected,
  running,
  power,
  probes,
  snapshot,
  style,
  diagnostics,
  tags,
  onPress,
  onActivate,
}: Props) {
  const t = useStrings();
  const locale = useLocale() === 'es' ? 'es-CL' : 'en-US';
  const info = spec(element.type);
  const show = (key: string) =>
    displayOperand(
      key === 'operand' ? element.operand : (element.params?.[key] ?? ''),
      tags,
      style,
      t.editor.empty,
    );
  const main = show('operand');
  const live = running && snapshot !== null;

  // Top label, bottom label and the detail line inside boxes.
  let top = main;
  let bottom = main.sub;
  let detail: string | undefined;
  switch (info.family) {
    case 'compare':
      bottom = show('in2').label;
      break;
    case 'timer': {
      bottom = `PT ${show('pt').label}`;
      const et = main.address ? liveValue(`${main.address}.ET`, snapshot ?? emptySnap) : undefined;
      if (live && typeof et === 'number') detail = formatTime(et, locale);
      break;
    }
    case 'counter': {
      bottom = `PV ${show('pv').label}`;
      const cv = main.address ? liveValue(`${main.address}.CV`, snapshot ?? emptySnap) : undefined;
      if (live && typeof cv === 'number') detail = `CV ${cv}`;
      break;
    }
    case 'box': {
      top = { ...main, label: `→ ${main.label}` };
      const sign = MATH_SIGN[element.type];
      bottom = sign ? `${show('in1').label} ${sign} ${show('in2').label}` : show('in').label;
      if (live && main.address) {
        detail = `= ${formatValue(liveValue(main.address, snapshot), main.address, locale)}`;
      }
      break;
    }
  }

  const isForced = main.address !== undefined && snapshot?.forced[main.address] !== undefined;
  const severity = worst(diagnostics);

  const wire = (ref: string) => (power(ref) ? 'var(--wire-on)' : 'var(--wire-off)');
  const active =
    info.side === 'logic' ? probes[stateProbe(element.id)] === true : power(placed.powerOut);
  const body = running ? (active ? 'var(--wire-on)' : 'var(--text-muted)') : 'var(--text)';
  const colors = { left: wire(placed.powerIn), right: wire(placed.powerOut), body };

  const name = t.elements[element.type];
  const problems = diagnostics?.map((d) => diagnosticMessage(d, t)).join('\n');
  const topOk = main.ok;
  const bottomLimit = info.family === 'box' ? 14 : 12;

  return (
    <g
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={`${name}: ${main.label}${main.sub ? ` (${main.sub})` : ''}`}
      aria-pressed={selected}
      data-element={element.id}
      data-type={element.type}
      className="cursor-pointer outline-none [&:focus-visible>rect.focus]:stroke-primary"
      onPointerDown={onPress}
      onDoubleClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <title>{problems ? `${name}\n${problems}` : name}</title>
      <rect
        className="focus"
        x={3}
        y={5}
        width={CELL_W - 6}
        height={CELL_H - 10}
        rx={5}
        fill={selected ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent'}
        stroke={selected ? 'var(--primary)' : 'transparent'}
        strokeWidth={1.5}
      />
      {info.family === 'contact' && (
        <ContactShape type={element.type as never} w={CELL_W} h={CELL_H} colors={colors} />
      )}
      {info.family === 'coil' && (
        <CoilShape type={element.type as never} w={CELL_W} h={CELL_H} colors={colors} />
      )}
      {info.family === 'compare' && (
        <CompareShape symbol={info.symbol} w={CELL_W} h={CELL_H} colors={colors} />
      )}
      {(info.family === 'timer' || info.family === 'counter' || info.family === 'box') && (
        <BoxShape symbol={info.symbol} detail={detail} w={CELL_W} h={CELL_H} colors={colors} />
      )}
      <text
        x={CELL_W / 2}
        y={
          CELL_H / 2 -
          (info.family === 'contact' || info.family === 'coil' || info.family === 'compare'
            ? 21
            : 24)
        }
        textAnchor="middle"
        fontFamily="var(--ff-mono)"
        fontSize={12}
        fontWeight={600}
        fill={topOk ? 'var(--text)' : 'var(--danger)'}
        data-live={detail}
      >
        {clip(top.label)}
      </text>
      {bottom && (
        <text
          x={CELL_W / 2}
          y={CELL_H / 2 + 31}
          textAnchor="middle"
          fontFamily="var(--ff-mono)"
          fontSize={10.5}
          fill="var(--text-muted)"
        >
          {clip(bottom, bottomLimit)}
        </text>
      )}
      {isForced && (
        <g transform="translate(6 8)">
          <rect width={14} height={14} rx={3} fill="var(--warning)" />
          <text
            x={7}
            y={11}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="var(--on-warning)"
            fontFamily="var(--ff-mono)"
          >
            F
          </text>
          <title>{t.editor.forced}</title>
        </g>
      )}
      {severity && (
        <circle
          cx={CELL_W - 12}
          cy={14}
          r={4.5}
          fill={severity === 'error' ? 'var(--danger)' : 'var(--warning)'}
        />
      )}
    </g>
  );
}

const emptySnap = {
  bits: { I: [], Q: [], M: [], S: [] },
  words: { MW: [], MD: [], IW: [], QW: [] },
  timers: [],
  counters: [],
} as unknown as MemorySnapshot;
