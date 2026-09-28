import { useEffect, useId, useRef } from 'react';
import { ArrowDown, ArrowUp, GitFork, ListPlus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  locate,
  moveRung,
  setRungComment,
  updateElement,
  type CoilType,
  type ContactType,
} from '@/simulator/languages/ladder/model';
import { formatAddressStyled } from '@/simulator/addressing/styles';
import { siblingTypes, spec } from '@/simulator/languages/ladder/catalog';
import { resolveOperand } from '@/simulator/project/tags';
import { diagnosticMessage } from './diagnostics';
import { fmt, useSim, useStoreApi, useStrings } from './context';

const field =
  'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none';
const button =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text';

export function PropertiesPanel() {
  const t = useStrings();
  const store = useStoreApi();
  const { selection, ladder, tags, diagnostics, focusOperand, style } = useSim(
    useShallow((s) => ({
      selection: s.selection,
      ladder: s.project.ladder,
      tags: s.project.tags,
      diagnostics: s.compiled.diagnostics,
      focusOperand: s.focusOperand,
      style: s.addressStyle,
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

  const info = spec(node.type);
  const types = siblingTypes(node.type);
  const fields = [info.main, ...info.params];
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
          disabled={types.length < 2}
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
              {t.elements[type]}
            </option>
          ))}
        </select>
      </label>

      {fields.map((param, i) => {
        const isMain = param.key === 'operand';
        const value = isMain ? node.operand : (node.params?.[param.key] ?? '');
        const res = value.trim() ? resolveOperand(value, tags) : null;
        const label = isMain
          ? t.operandLabel[info.family]
          : (t.params as Record<string, string>)[param.key];
        return (
          <div key={param.key}>
            <label className="block text-xs font-medium text-text-muted">
              {label}
              {param.optional && <span className="font-normal"> ({t.optional})</span>}
              <input
                ref={i === 0 ? operandRef : undefined}
                data-testid={isMain ? 'operand-input' : `param-${param.key}`}
                className={`${field} mt-1 font-mono placeholder:font-sans`}
                value={value}
                placeholder={t.placeholders[param.kind]}
                list={listId}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) =>
                  store.getState().commit(
                    (p) => ({
                      ...p,
                      ladder: updateElement(
                        p.ladder,
                        node.id,
                        isMain
                          ? { operand: e.target.value }
                          : { params: { [param.key]: e.target.value } },
                      ),
                    }),
                    `param:${node.id}:${param.key}`,
                  )
                }
              />
            </label>
            {res?.ok && (
              <p className="mt-1 font-mono text-xs text-text-muted">
                {fmt(t.properties.resolvesTo, { address: formatAddressStyled(res.address, style) })}
                {res.tag?.comment ? ` · ${res.tag.comment}` : ''}
              </p>
            )}
          </div>
        );
      })}
      <datalist id={listId}>
        {tags.map((tg) => (
          <option key={tg.id} value={tg.name}>
            {tg.address}
            {tg.comment ? ` — ${tg.comment}` : ''}
          </option>
        ))}
      </datalist>

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
      {spec(node.type).side === 'output' ? null : (
        <p className="text-xs text-text-muted">{t.properties.rangeHint}</p>
      )}
    </div>
  );
}
