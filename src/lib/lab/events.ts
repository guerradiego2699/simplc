/** System log entries shown in the lab's console panel. */
export type LabEvent =
  | { type: 'call'; name: string; args: Record<string, unknown> }
  | { type: 'result'; name: string; result: Record<string, unknown> }
  | { type: 'order'; id: string; product: string; quantity: number }
  | { type: 'retry'; status: number; waitSeconds: number }
  | { type: 'error'; message: string };

export type LogEvent = (event: LabEvent) => void;
