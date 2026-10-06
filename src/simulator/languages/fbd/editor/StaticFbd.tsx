/**
 * Read-only FBD drawing of a program for content pages (server-rendered, no store).
 */
import type { Tag } from '@/simulator/project/types';
import { displayOperand } from '@/simulator/languages/ladder/editor/ElementView';
import type { LadderProgram } from '@/simulator/languages/ladder/model';
import { layoutFbdNetwork } from '../layout';
import { FbdNetworkView } from './FbdNetworkView';

interface Props {
  program: LadderProgram;
  tags: readonly Tag[];
  /** Heading of each network, e.g. "Network 1". */
  networkLabel: (n: number) => string;
}

export function StaticFbd({ program, tags, networkLabel }: Props) {
  return (
    <ol className="flex flex-col gap-5">
      {program.rungs.map((rung, i) => {
        const layout = layoutFbdNetwork(
          rung,
          (text) => displayOperand(text, tags, 'generic', '?').label,
        );
        return (
          <li key={rung.id}>
            <p className="mb-1 text-sm">
              <span className="font-mono font-semibold text-text-muted">{networkLabel(i + 1)}</span>
              {rung.comment && <span className="text-text"> — {rung.comment}</span>}
            </p>
            <div className="overflow-x-auto rounded-md border border-border bg-bg">
              <svg
                viewBox={`0 0 ${layout.w} ${layout.h}`}
                width={layout.w}
                height={layout.h}
                className="block max-w-none"
                role="img"
                aria-label={`${networkLabel(i + 1)}${rung.comment ? `: ${rung.comment}` : ''}`}
              >
                <FbdNetworkView layout={layout} value={() => null} />
              </svg>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
