/**
 * Geometry of an FBD network (pure, in px at zoom 1): inputs on the left, blocks growing to the
 * right, outputs in a column joined by a bus. Every wire is horizontal because each block input
 * pin is placed at the height of the block that feeds it.
 */
import { spec } from '@/simulator/languages/ladder/catalog';
import type { Coil, Contact, InsertTarget } from '@/simulator/languages/ladder/model';
import { fbdNetwork, type FbdNode } from './tree';

export const FBD = {
  pin: 26,
  gap: 26,
  gateW: 44,
  margin: 16,
  operandH: 15,
  rowH: 17,
  titleH: 20,
  charW: 7.2,
} as const;

const textW = (s: string) => Math.ceil(s.length * FBD.charW);

export interface FbdBox {
  key: string;
  /** What the box is: a gate, an element box (edge, comparison, timer…) or an output. */
  role: 'and' | 'or' | 'element' | 'output';
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  /** Text above the box (the operand), if any. */
  operand?: string;
  /** Text rows inside the box (parameters). */
  rows: string[];
  /** Element for selection/properties, or the parallel id of an OR. */
  selectId?: string;
  element?: Contact | Coil;
  /** Input pins (absolute y) with the node that drives each one (null = bus / constant). */
  inputs: { y: number; node: FbdNode | null; negated: boolean }[];
  outY: number;
  /** Node whose value is this box's output (null for outputs). */
  node: FbdNode | null;
}

export interface FbdInputLabel {
  key: string;
  element: Contact;
  x: number;
  y: number;
  w: number;
  text: string;
  negated: boolean;
  node: FbdNode;
}

export interface FbdWire {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The node whose value the wire carries (null = always TRUE). */
  node: FbdNode | null;
}

export interface FbdZone {
  target: InsertTarget;
  accepts: 'contact' | 'coil';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FbdNetworkLayout {
  rungId: string;
  w: number;
  h: number;
  root: FbdNode;
  boxes: FbdBox[];
  inputs: FbdInputLabel[];
  constants: { x: number; y: number }[];
  wires: FbdWire[];
  zones: FbdZone[];
}

const COMPARE: Record<string, string> = {
  EQ: '==',
  NE: '<>',
  LT: '<',
  GT: '>',
  LE: '<=',
  GE: '>=',
};
const OUTPUT_TITLE: Record<string, string> = { coil: '=', negated: '=', set: 'S', reset: 'R' };
const MATH: Record<string, string> = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷' };

/** Parameter rows shown inside a box ("PT T#5s"). */
function rowsOf(el: Contact | Coil, label: (text: string) => string): string[] {
  const info = spec(el.type);
  const p = (k: string) => el.params?.[k] ?? '';
  switch (info.family) {
    case 'compare':
      return [label(el.operand), label(p('in2'))];
    case 'timer':
      return ['IN', `PT ${label(p('pt'))}`];
    case 'counter': {
      const pin = el.type === 'CTD' ? 'CD' : 'CU';
      const rows = [pin];
      if (el.type === 'CTUD') rows.push(`CD ${label(p('cd'))}`);
      if (p('r') && el.type !== 'CTD') rows.push(`R ${label(p('r'))}`);
      if (p('ld') && el.type !== 'CTU') rows.push(`LD ${label(p('ld'))}`);
      rows.push(`PV ${label(p('pv'))}`);
      return rows;
    }
    case 'box': {
      if (el.type === 'MOVE') return ['EN', `IN ${label(p('in'))}`];
      if (el.type === 'SCALE')
        return [
          'EN',
          ...['in', 'inMin', 'inMax', 'outMin', 'outMax'].map(
            (k) => `${k.toUpperCase()} ${label(p(k))}`,
          ),
        ];
      return ['EN', `IN1 ${label(p('in1'))}`, `IN2 ${label(p('in2'))}`];
    }
    default:
      return [];
  }
}

interface Built {
  w: number;
  h: number;
  outY: number;
  emit: (x: number, y: number) => void;
}

/**
 * Lays out one network. `label` turns an operand into display text (tag name or styled address;
 * placeholder when empty).
 */
export function layoutFbdNetwork(
  rung: Parameters<typeof fbdNetwork>[0],
  label: (text: string) => string,
): FbdNetworkLayout {
  const net = fbdNetwork(rung);
  const out: FbdNetworkLayout = {
    rungId: rung.id,
    w: 0,
    h: 0,
    root: net.root,
    boxes: [],
    inputs: [],
    constants: [],
    wires: [],
    zones: [],
  };
  const zone = (target: InsertTarget, x: number, y: number, w: number, h: number) =>
    out.zones.push({ target, accepts: 'contact', x, y, w, h });

  /** Zones around an element: insert before it, or put it in an OR with a new input. */
  const elementZones = (
    n: FbdNode & { element: Contact },
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    if (n.kind === 'input' || n.kind === 'leaf' || n.kind === 'fb') {
      zone({ kind: 'series', seriesId: n.seriesId, index: n.index }, x - 12, y, 14, h);
      zone({ kind: 'branch', nodeId: n.element.id }, x, y + h - 4, w, 10);
    }
  };

  const build = (node: FbdNode): Built => {
    switch (node.kind) {
      case 'true': {
        const w = 28;
        return {
          w,
          h: FBD.pin,
          outY: FBD.pin / 2,
          emit: (x, y) => out.constants.push({ x: x + w - 10, y: y + FBD.pin / 2 }),
        };
      }
      case 'input': {
        const text = label(node.element.operand);
        const negated = node.element.type === 'NC';
        const w = textW(text) + 22;
        return {
          w,
          h: FBD.pin,
          outY: FBD.pin / 2,
          emit: (x, y) => {
            out.inputs.push({
              key: node.element.id,
              element: node.element,
              x,
              y,
              w,
              text,
              negated,
              node,
            });
            elementZones(node, x, y, w, FBD.pin);
          },
        };
      }
      case 'leaf': {
        const el = node.element;
        const info = spec(el.type);
        const compare = info.family === 'compare';
        const rows = compare ? rowsOf(el, label) : [];
        const operand = compare ? undefined : label(el.operand);
        const title = compare ? `CMP ${COMPARE[el.type] ?? ''}` : el.type;
        const boxW = Math.max(52, ...rows.map((r) => textW(r) + 16), textW(title) + 16);
        const w = Math.max(boxW, operand ? textW(operand) : 0);
        const top = operand ? FBD.operandH : 0;
        const boxH = compare ? FBD.titleH + rows.length * FBD.rowH + 4 : 30;
        const h = top + boxH;
        const outY = top + boxH / 2;
        return {
          w,
          h,
          outY,
          emit: (x, y) => {
            const bx = x + (w - boxW);
            out.boxes.push({
              key: el.id,
              role: 'element',
              x: bx,
              y: y + top,
              w: boxW,
              h: boxH,
              title,
              ...(operand ? { operand } : {}),
              rows,
              selectId: el.id,
              element: el,
              inputs: [],
              outY: y + outY,
              node,
            });
            elementZones(node, x, y, w, h);
          },
        };
      }
      case 'fb': {
        const el = node.element;
        const rows = rowsOf(el, label);
        const operand = label(el.operand);
        const boxW = Math.max(84, ...rows.map((r) => textW(r) + 16), textW(operand));
        // One extra row at the bottom shows the live ET / CV in RUN.
        const boxH = FBD.titleH + (rows.length + 1) * FBD.rowH + 4;
        const pinOffset = FBD.operandH + FBD.titleH + FBD.rowH / 2; // first row = logic input
        const child = build(node.input);
        // Align the child's output with the logic input pin.
        const childTop = Math.max(0, pinOffset - child.outY);
        const boxTop = Math.max(0, child.outY - pinOffset);
        const h = Math.max(childTop + child.h, boxTop + FBD.operandH + boxH);
        const w = child.w + FBD.gap + boxW;
        const outY = boxTop + pinOffset;
        return {
          w,
          h,
          outY,
          emit: (x, y) => {
            child.emit(x, y + childTop);
            const bx = x + child.w + FBD.gap;
            out.wires.push({
              x1: x + child.w,
              y1: y + outY,
              x2: bx,
              y2: y + outY,
              node: node.input,
            });
            out.boxes.push({
              key: el.id,
              role: 'element',
              x: bx,
              y: y + boxTop + FBD.operandH,
              w: boxW,
              h: boxH,
              title: el.type,
              operand,
              rows,
              selectId: el.id,
              element: el,
              inputs: [{ y: y + outY, node: node.input, negated: false }],
              outY: y + outY,
              node,
            });
            elementZones(node, bx, y + boxTop, boxW, FBD.operandH + boxH);
          },
        };
      }
      case 'and':
      case 'or': {
        const children = node.inputs.map(build);
        const childW = Math.max(...children.map((c) => c.w));
        // Stack the children; each input pin sits at its child's output height.
        let cursor = 0;
        const offsets = children.map((c) => {
          const at = cursor;
          cursor += c.h + 6;
          return at;
        });
        const pins = children.map((c, i) => offsets[i]! + c.outY);
        let boxTop = Math.min(...pins) - 14;
        const boxBottom = Math.max(...pins) + 14;
        const shift = boxTop < 0 ? -boxTop : 0;
        boxTop += shift;
        const boxH = Math.max(36, boxBottom + shift - boxTop);
        const h = Math.max(cursor - 6 + shift, boxTop + boxH + 12);
        const outY = boxTop + boxH / 2;
        const w = childW + FBD.gap + FBD.gateW;
        return {
          w,
          h,
          outY,
          emit: (x, y) => {
            const gx = x + childW + FBD.gap;
            children.forEach((c, i) => {
              const cx = gx - FBD.gap - c.w;
              c.emit(cx, y + shift + offsets[i]!);
              const py = y + shift + pins[i]!;
              out.wires.push({ x1: gx - FBD.gap, y1: py, x2: gx, y2: py, node: node.inputs[i]! });
            });
            out.boxes.push({
              key: node.kind === 'or' ? node.parallelId : `and:${node.seriesId}:${x}:${y}`,
              role: node.kind,
              x: gx,
              y: y + boxTop,
              w: FBD.gateW,
              h: boxH,
              title: node.kind === 'and' ? '&' : '≥1',
              rows: [],
              ...(node.kind === 'or' ? { selectId: node.parallelId } : {}),
              inputs: pins.map((p, i) => ({
                y: y + shift + p,
                node: node.inputs[i]!,
                negated: false,
              })),
              outY: y + outY,
              node,
            });
            // Add an input: to the AND's series, or a new branch of the OR.
            zone(
              node.kind === 'and'
                ? { kind: 'series', seriesId: node.seriesId, index: 9999 }
                : { kind: 'branch', nodeId: node.parallelId },
              gx,
              y + boxTop + boxH,
              FBD.gateW,
              12,
            );
          },
        };
      }
    }
  };

  // ------------------------------------------------------------------ logic + output column
  const root = build(net.root);
  const outputs = net.outputs.map((c) => {
    const title = OUTPUT_TITLE[c.type] ?? MATH[c.type] ?? c.type;
    const rows = OUTPUT_TITLE[c.type] ? [] : rowsOf(c, label);
    const operand = label(c.operand);
    const boxW = Math.max(OUTPUT_TITLE[c.type] ? 40 : 96, ...rows.map((r) => textW(r) + 16));
    const boxH = rows.length ? FBD.titleH + rows.length * FBD.rowH + 4 : 28;
    return { coil: c, title, rows, operand, boxW, boxH, h: FBD.operandH + boxH + 10 };
  });

  const m = FBD.margin;
  const rootX = m + 14;
  const busX = rootX + root.w + 30;
  const outX = busX + 22;
  const firstPin = outputs.length
    ? FBD.operandH + (outputs[0]!.boxH > 28 ? FBD.titleH / 2 + 2 : 14)
    : 0;
  const rootTop = m + Math.max(0, firstPin - root.outY);
  const outTop = m + Math.max(0, root.outY - firstPin);
  root.emit(rootX, rootTop);
  const rootOutY = rootTop + root.outY;
  out.wires.push({ x1: rootX + root.w, y1: rootOutY, x2: busX, y2: rootOutY, node: net.root });
  // Append to the network logic (also creates the first AND around a single input).
  zone(
    { kind: 'series', seriesId: net.logicId, index: 9999 },
    rootX + root.w + 2,
    rootOutY - 12,
    22,
    24,
  );

  let y = outTop;
  let maxW = outX;
  outputs.forEach((o, i) => {
    out.zones.push({
      target: { kind: 'coil', rungId: rung.id, index: i },
      accepts: 'coil',
      x: outX,
      y: y - 6,
      w: o.boxW,
      h: 10,
    });
    const pinY = y + FBD.operandH + (o.rows.length ? FBD.titleH / 2 + 2 : 14);
    out.wires.push({ x1: busX, y1: pinY, x2: outX, y2: pinY, node: net.root });
    if (pinY !== rootOutY)
      out.wires.push({
        x1: busX,
        y1: Math.min(pinY, rootOutY),
        x2: busX,
        y2: Math.max(pinY, rootOutY),
        node: net.root,
      });
    out.boxes.push({
      key: o.coil.id,
      role: 'output',
      x: outX,
      y: y + FBD.operandH,
      w: o.boxW,
      h: o.boxH,
      title: o.title,
      operand: o.operand,
      rows: o.rows,
      selectId: o.coil.id,
      element: o.coil,
      inputs: [{ y: pinY, node: net.root, negated: o.coil.type === 'negated' }],
      outY: pinY,
      node: null,
    });
    maxW = Math.max(maxW, outX + o.boxW);
    y += o.h;
  });
  out.zones.push({
    target: { kind: 'coil', rungId: rung.id, index: outputs.length },
    accepts: 'coil',
    x: outX,
    y: Math.max(y - 4, rootOutY - 12),
    w: 96,
    h: 24,
  });

  out.w = Math.max(maxW, outX + 96) + m;
  out.h = Math.max(rootTop + root.h, y + 24) + m;
  return out;
}
