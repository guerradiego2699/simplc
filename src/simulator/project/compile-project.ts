/**
 * Compiles the project in its current language to IR. Ladder diagnostics point at rungs and
 * elements; Structured Text diagnostics point at source ranges (`st`).
 */
import { compileLadder, type LadderCompileResult } from '@/simulator/languages/ladder/compile';
import { compileSt, type StCompileResult } from '@/simulator/languages/st/compile';
import type { Project } from './types';

export interface ProjectCompileResult extends LadderCompileResult {
  /** Result of the ST compiler when the project language is ST, else null. */
  st: StCompileResult | null;
}

export function compileProject(project: Project): ProjectCompileResult {
  if (project.language === 'ST') {
    const st = compileSt(project.st ?? '', project.tags);
    return { ir: st.ir, diagnostics: [], st };
  }
  return { ...compileLadder(project.ladder, project.tags), st: null };
}

/** Error and warning counts of either language. */
export function diagnosticCounts(result: ProjectCompileResult) {
  const list = result.st ? result.st.diagnostics : result.diagnostics;
  const errors = list.filter((d) => d.severity === 'error').length;
  return { errors, warnings: list.length - errors };
}
