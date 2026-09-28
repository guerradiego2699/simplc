import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { removeTag, renameTag, updateTag } from '@/simulator/project/operations';
import { tag, validateTags } from '@/simulator/project/tags';
import { useSim, useStoreApi, useStrings } from './context';

const cell =
  'w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-text hover:border-border focus:border-primary focus:bg-bg focus:outline-none';

export function VariablesPanel() {
  const t = useStrings();
  const store = useStoreApi();
  const { tags } = useSim(useShallow((s) => ({ tags: s.project.tags })));
  const problems = useMemo(() => validateTags(tags), [tags]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {tags.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">{t.variables.empty}</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 bg-surface text-[11px] text-text-muted uppercase">
              <tr>
                <th className="w-[34%] px-2 py-1.5 font-medium">{t.variables.name}</th>
                <th className="w-[20%] px-2 py-1.5 font-medium">{t.variables.address}</th>
                <th className="px-2 py-1.5 font-medium">{t.variables.comment}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tags.map((tg) => {
                const issues = problems.get(tg.id) ?? [];
                return (
                  <tr key={tg.id} className="border-t border-border align-top">
                    <td className="px-1 py-1">
                      <input
                        aria-label={t.variables.name}
                        aria-invalid={issues.some((p) => p !== 'INVALID_TAG_ADDRESS')}
                        className={`${cell} font-mono aria-[invalid=true]:border-danger`}
                        value={tg.name}
                        spellCheck={false}
                        onChange={(e) =>
                          store
                            .getState()
                            .commit((p) => renameTag(p, tg.id, e.target.value), `tag-name:${tg.id}`)
                        }
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        aria-label={t.variables.address}
                        aria-invalid={issues.includes('INVALID_TAG_ADDRESS')}
                        className={`${cell} font-mono uppercase aria-[invalid=true]:border-danger`}
                        value={tg.address}
                        spellCheck={false}
                        onChange={(e) =>
                          store
                            .getState()
                            .commit(
                              (p) => updateTag(p, tg.id, { address: e.target.value }),
                              `tag-address:${tg.id}`,
                            )
                        }
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        aria-label={t.variables.comment}
                        className={cell}
                        value={tg.comment}
                        onChange={(e) =>
                          store
                            .getState()
                            .commit(
                              (p) => updateTag(p, tg.id, { comment: e.target.value }),
                              `tag-comment:${tg.id}`,
                            )
                        }
                      />
                      {issues.length > 0 && (
                        <ul className="px-1.5 pt-0.5 text-[11px] text-danger">
                          {issues.map((p) => (
                            <li key={p}>{t.variables.problems[p]}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-1 pr-1">
                      <button
                        type="button"
                        aria-label={t.variables.remove}
                        title={t.variables.remove}
                        className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
                        onClick={() => store.getState().commit((p) => removeTag(p, tg.id))}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border p-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text hover:border-primary hover:text-primary"
          onClick={() => store.getState().commit((p) => ({ ...p, tags: [...p.tags, tag('', '')] }))}
        >
          <Plus size={14} aria-hidden="true" />
          {t.variables.add}
        </button>
      </div>
    </div>
  );
}
