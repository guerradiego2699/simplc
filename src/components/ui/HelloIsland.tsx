import { useState } from 'react';

/** Phase 0 smoke test: proves React islands hydrate. Remove in Phase 1. */
export default function HelloIsland() {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      data-testid="hello-island"
      className="rounded border border-slate-300 px-4 py-2 font-mono"
      onClick={() => setCount((c) => c + 1)}
    >
      React island: {count}
    </button>
  );
}
