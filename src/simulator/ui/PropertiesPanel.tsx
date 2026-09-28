import { useEffect, useId, useRef } from 'react';
import { ArrowDown, ArrowUp, GitFork, ListPlus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  isCoilType,
  locate,
  moveRung,
  setRungComment,
  updateElement,
  type CoilType,
  type ContactType,
} from '@/simulator/languages/ladder/model';
import { resolveOperand } from '@/simulator/project/tags';
import { diagnosticMessage } from './diagnostics';
import { fmt, useSim, useStoreApi, useStrings } from './context';

const CONTACT_TYPES: ContactType[] = ['NO', 'NC', 'P', 'N'];
const COIL_TYPES: CoilType[] = ['coil', 'negated', 'set', 'reset'];

const field =
  'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none';
const button =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text';

export function PropertiesPanel() {
  const t = useStrings();
  const store = useStoreApi();
  const { selection, ladder, tags, diagnostics, focusOperand } = useSim(
    useShallow((s) => ({
      selection: s.selection,
      ladder: s.project.ladder,
      tags: s.project.tags,
      diagnostics: s.compiled.diagnostics,
      focusOperand: s.focusOperand,
    })),
  );
  const operandRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (focusOperand) operandRef.current?.focus();
  }, [focusOperand]);

  if (!selection) {
    return (
      <div className="space-y-3 p-4 text-sm text-text-muted">
        <p>{t.properties.nothingSelected}</p>
        <p className="text-xs">{t.properties.rangeHint}</p>
      </div>
    );
  }

  if (selection.kind === 'rung') {
    const index = ladder.rungs.findIndex((r) => r.id === selection.id);
    const rung = ladder.rungs[index];
    if (!rung) return null;
    return (
      <div className="space-y-4 p-4">
        <h3 className="font-mono text-sm font-semibold text-text">
          {fmt(t.editor.rung, { n: index + 1 })}
        </h3>
        <label className="block text-xs font-medium text-text-muted">
          {t.properties.comment}
          <textarea
            className={`${field} mt-1 min-h-20 resize-y`}
            value={rung.comment}
            onChange={(e) =>
              store
                .getState()
                .commit(
                  (p) => ({ ...p, ladder: setRungComment(p.ladder, rung.id, e.target.value) }),
                  `comment:${rung.id}`,
                )
            }
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={index === 0}
            onClick={() =>
              store.getState().commit((p) => ({ ...p, ladder: moveRung(p.ladder, rung.id, -1) }))
            }
          >
            <ArrowUp size={14} aria-hidden="true" />
            {t.properties.moveUp}
          </button>
          <button
            type="button"
            className={button}
            disabled={index === ladder.rungs.length - 1}
            onClick={() =>
              store.getState().commit((p) => ({ ...p, ladder: moveRung(p.ladder, rung.id, 1) }))
            }
          >
            <ArrowDown size={14} aria-hidden="true" />
            {t.properties.moveDown}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => store.getState().addRungAfterSelection()}
          >
            <ListPlus size={14} aria-hidden="true" />
            {t.properties.insertRungBelow}
          </button>
          <button
            type="button"
            className={`${button} hover:border-danger hover:text-danger`}
            onClick={() => store.getState().deleteSelection()}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t.properties.deleteRung}
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'range') {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm font-medium text-text">
          {fmt(t.properties.rangeSelected, { n: selection.ids.length })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => store.getState().wrapSelection()}>
            <GitFork size={14} aria-hidden="true" />
            {t.properties.wrapBranch}
          </button>
          <button
            type="button"
            className={`${button} hover:border-danger hover:text-danger`}
            onClick={() => store.getState().deleteSelection()}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t.properties.delete}
          </button>
        </div>
      </div>
    );
  }

  const where = locate(ladder, selection.id);
  if (!where) return null;
  const node = where.node;

  if (node.kind === 'parallel') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">{t.elements.parallel}</h3>
        <p className="text-xs text-text-muted">{t.properties.parallelHint}</p>
        <button
          type="button"
          className={`${button} hover:border-danger hover:text-danger`}
          onClick={() => store.getState().deleteSelection()}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t.properties.delete}
        </button>
      </div>
    );
  }

  const types: string[] = node.kind === 'contact' ? CONTACT_TYPES : COIL_TYPES;
  const res = resolveOperand(node.operand, tags);
  const problems = diagnostics.filter((d) => d.elementId === node.id);

  return (
    <div className="space-y-4 p-4">
      <p className="font-mono text-xs text-text-muted">
        {fmt(t.editor.rung, { n: where.rungIndex + 1 })}
      </p>
      <label className="block text-xs font-medium text-text-muted">
        {t.properties.type}
        <select
          className={`${field} mt-1`}
          value={node.type}
          onChange={(e) =>
            store.getState().commit((p) => ({
              ...p,
              ladder: updateElement(p.ladder, node.id, {
                type: e.target.value as ContactType | CoilType,
              }),
            }))
          }
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {t.elements[type as ContactType | CoilType]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-text-muted">
        {t.properties.operand}
        <input
          ref={operandRef}
          data-testid="operand-input"
          className={`${field} mt-1 font-mono uppercase placeholder:normal-case`}
          value={node.operand}
          placeholder={t.properties.operandPlaceholder}
          list={listId}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) =>
            store.getState().commit(
              (p) => ({
                ...p,
                ladder: updateElement(p.ladder, node.id, { operand: e.target.value }),
              }),
              `operand:${node.id}`,
            )
          }
        />
        <datalist id={listId}>
          {tags.map((tg) => (
            <option key={tg.id} value={tg.name}>
              {tg.address}
              {tg.comment ? ` — ${tg.comment}` : ''}
            </option>
          ))}
        </datalist>
      </label>
      {res.ok && (
        <p className="-mt-2 font-mono text-xs text-text-muted">
          {fmt(t.properties.resolvesTo, { address: res.address })}
          {res.tag?.comment ? ` · ${res.tag.comment}` : ''}
        </p>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 text-xs">
          {problems.map((d, i) => (
            <li
              key={i}
              className={`flex gap-1.5 ${d.severity === 'error' ? 'text-danger' : 'text-text'}`}
            >
              <span
                aria-hidden="true"
                className={`mt-1 size-2 shrink-0 rounded-full ${d.severity === 'error' ? 'bg-danger' : 'bg-warning'}`}
              />
              {diagnosticMessage(d, t)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {node.kind === 'contact' && (
          <button type="button" className={button} onClick={() => store.getState().wrapSelection()}>
            <GitFork size={14} aria-hidden="true" />
            {t.properties.wrapBranch}
          </button>
        )}
        <button
          type="button"
          className={`${button} hover:border-danger hover:text-danger`}
          onClick={() => store.getState().deleteSelection()}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t.properties.delete}
        </button>
      </div>
      {isCoilType(node.type) ? null : (
        <p className="text-xs text-text-muted">{t.properties.rangeHint}</p>
      )}
    </div>
  );
}
