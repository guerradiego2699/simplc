/**
 * Catches rendering errors in the simulator so the page never goes blank (spec section 11).
 * Offers to reload, to download the current project (from the store, which survives the crash)
 * and to start from scratch (clears the autosave). The PLC controller is stopped.
 */
import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { AUTOSAVE_KEY } from '@/simulator/file/autosave';
import type { SimulationController } from '@/simulator/store/controller';
import type { SimulatorStoreApi } from '@/simulator/store/simulator-store';
import type { SimStrings } from './context';
import { downloadProject } from './file-actions';

interface Props {
  t: SimStrings;
  store: SimulatorStoreApi;
  controller: SimulationController;
  children: ReactNode;
}

export class CrashBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.controller.stop();
    console.error('Simulator error', error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const { t, store } = this.props;
    const c = t.crash;
    const button = 'rounded-md px-3 py-1.5 text-sm font-medium';
    return (
      <div className="flex h-full items-center justify-center bg-bg p-6" role="alert">
        <div className="max-w-lg rounded-lg border border-border bg-surface p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
            <TriangleAlert size={20} aria-hidden="true" className="text-warning" />
            {c.title}
          </h2>
          <p className="mt-2 text-sm text-text-muted">{c.body}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${button} bg-primary text-on-primary hover:bg-primary-hover`}
              onClick={() => window.location.reload()}
            >
              {c.reload}
            </button>
            <button
              type="button"
              className={`${button} border border-border text-text hover:border-primary`}
              onClick={() => downloadProject(store, t)}
            >
              {c.download}
            </button>
            <button
              type="button"
              className={`${button} text-danger hover:bg-surface-2`}
              onClick={() => {
                if (!window.confirm(c.confirmReset)) return;
                try {
                  localStorage.removeItem(AUTOSAVE_KEY);
                } catch {
                  /* storage blocked: nothing saved anyway */
                }
                window.location.reload();
              }}
            >
              {c.reset}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
