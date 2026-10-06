/**
 * Compiles the project in its current language to IR. Ladder/FBD diagnostics point at rungs and
 * elements; Structured Text and Instruction List diagnostics point at source ranges (`st`, `il`);
 * SFC diagnostics point at steps, transitions and actions (`sfc`).
 */
import { compileIl } from '@/simulator/languages/il/compile';
import { compileLadder, type LadderCompileResult } from '@/simulator/languages/ladder/compile';
import { compileSfc, type SfcCompileResult } from '@/simulator/languages/sfc/compile';
import { starterSfc } from '@/simulator/languages/sfc/model';
import { compileSt, type StCompileResult } from '@/simulator/languages/st/compile';
import type { Project } from './types';

export interface ProjectCompileResult extends LadderCompileResult {
  /** Result of the ST compiler when the project language is ST, else null. */
  st: StCompileResult | null;
  /** Result of the IL compiler when the project language is IL, else null. */
  il: StCompileResult | null;
  /** Result of the SFC compiler when the project language is SFC, else null. */
  sfc: SfcCompileResult | null;
}

export function compileProject(project: Project): ProjectCompileResult {
  const none = { st: null, il: null, sfc: null };
  if (project.language === 'ST') {
    const st = compileSt(project.st ?? '', project.tags);
    return { ir: st.ir, diagnostics: [], ...none, st };
  }
  if (project.language === 'IL') {
    const il = compileIl(project.il ?? '', project.tags);
    return { ir: il.ir, diagnostics: [], ...none, il };
  }
  if (project.language === 'SFC') {
    const sfc = compileSfc(project.sfc ?? starterSfc(), project.tags);
    return { ir: sfc.ir, diagnostics: [], ...none, sfc };
  }
  return { ...compileLadder(project.ladder, project.tags), ...none };
}

/** Error and warning counts of any language. */
export function diagnosticCounts(result: ProjectCompileResult) {
  const list: readonly { severity: 'error' | 'warning' }[] =
    result.st?.diagnostics ??
    result.il?.diagnostics ??
    result.sfc?.diagnostics ??
    result.diagnostics;
  const errors = list.filter((d) => d.severity === 'error').length;
  return { errors, warnings: list.length - errors };
}
