/**
 * One chat turn for the serverless function. Functions keep no memory between requests, so the
 * whole conversation (history + simulated inventory) travels to the browser as a signed token and
 * comes back with the next message.
 */
import type { Content } from '@google/genai';
import { LogisticsAgent, type ChatModel } from './agent.js';
import type { LabEvent } from './events.js';
import { emptyInventory, MockInventory, type InventoryState } from './inventory.js';
import { sign, verify } from './session.js';
import { ToolExecutor } from './tools.js';

export const MAX_MESSAGE_LENGTH = 2000;

export interface ConversationState {
  v: 1;
  history: Content[];
  inventory: InventoryState;
}

export const newConversation = (): ConversationState => ({
  v: 1,
  history: [],
  inventory: emptyInventory(),
});

export function decodeState(token: string, key: Buffer): ConversationState | null {
  const state = verify(token, key) as Partial<ConversationState> | null;
  if (state?.v !== 1 || !Array.isArray(state.history) || typeof state.inventory !== 'object') {
    return null;
  }
  return state as ConversationState;
}

export interface TurnResult {
  reply: string;
  events: LabEvent[];
  inventory: InventoryState;
  state: string;
}

export async function runTurn(
  makeModel: (log: (event: LabEvent) => void) => ChatModel,
  key: Buffer,
  message: string,
  state: ConversationState,
): Promise<TurnResult> {
  const events: LabEvent[] = [];
  const log = (event: LabEvent) => events.push(event);
  const inventory = new MockInventory(state.inventory, (order) =>
    log({ type: 'order', id: order.id, product: order.product, quantity: order.quantity }),
  );
  const agent = new LogisticsAgent(
    makeModel(log),
    new ToolExecutor(inventory, log),
    state.history,
    log,
  );

  const reply = await agent.send(message);
  const next: ConversationState = { v: 1, history: agent.history, inventory: inventory.state };
  return { reply, events, inventory: inventory.state, state: sign(next, key) };
}
