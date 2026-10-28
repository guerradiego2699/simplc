/**
 * Agent loop tests with a scripted model (no API calls). Responses are real SDK objects
 * (`GenerateContentResponse`), so the same code path as with Gemini is exercised.
 */
import { ApiError, GenerateContentResponse, type Content, type Part } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { LogisticsAgent, TOO_MANY_STEPS, type ChatModel } from './agent';
import { MockInventory } from './inventory';
import { ToolExecutor } from './tools';

function response(...parts: Part[]): GenerateContentResponse {
  return Object.assign(new GenerateContentResponse(), {
    candidates: [{ content: { role: 'model', parts } }],
  });
}
const text = (t: string) => response({ text: t });
const call = (name: string, args: Record<string, unknown>, id = 'c1') =>
  response({ functionCall: { id, name, args } });

type Step = GenerateContentResponse | Error | ((history: Content[]) => GenerateContentResponse);

class ScriptedModel implements ChatModel {
  readonly seen: Content[][] = [];
  constructor(private readonly steps: Step[]) {}
  async generate(history: Content[]) {
    this.seen.push([...history]);
    const step = this.steps.shift();
    if (step === undefined) throw new Error('script exhausted');
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(history) : step;
  }
}

const lastToolResult = (history: Content[]) =>
  history.at(-1)?.parts?.[0]?.functionResponse?.response ?? {};

function setup(steps: Step[], stock = 3, options = {}) {
  const inventory = new MockInventory(undefined, undefined, () => (stock - 1) / 5);
  const model = new ScriptedModel(steps);
  const agent = new LogisticsAgent(model, new ToolExecutor(inventory), [], undefined, options);
  return { agent, model, inventory };
}

const apiError = (status: number) =>
  new ApiError({ status, message: `{"error":{"code":${status}}}` });

describe('LogisticsAgent', () => {
  it('runs the 10-laptops scenario across two turns', async () => {
    const { agent, model, inventory } = setup([
      call('consultar_stock', { producto: 'laptops' }),
      (h) => {
        const stock = lastToolResult(h)['stock'] as number;
        return text(`Hay ${stock}. Faltan ${10 - stock}. ¿Emito orden por ${10 - stock}?`);
      },
      call('emitir_orden_compra', { producto: 'laptops', cantidad: 7 }, 'c2'),
      (h) => text(`Listo: orden ${String(lastToolResult(h)['orden_id'])}.`),
    ]);

    expect(await agent.send('Necesitamos equipar a 10 nuevos empleados con laptops')).toBe(
      'Hay 3. Faltan 7. ¿Emito orden por 7?',
    );
    expect(inventory.state.orders).toEqual([]);

    expect(await agent.send('Sí')).toBe('Listo: orden OC-0001.');
    expect(inventory.state.orders).toEqual([{ id: 'OC-0001', product: 'laptops', quantity: 7 }]);

    // Memory: in the second turn the model received everything said before.
    const texts = model.seen[2]!.flatMap((c) => c.parts ?? []).flatMap((p) => p.text ?? []);
    expect(texts).toEqual([
      'Necesitamos equipar a 10 nuevos empleados con laptops',
      'Hay 3. Faltan 7. ¿Emito orden por 7?',
      'Sí',
    ]);
  });

  it('answers each function call with a response carrying its id and name', async () => {
    const { agent, model } = setup([
      call('consultar_stock', { producto: 'teclados' }, 'abc'),
      text('ok'),
    ]);
    await agent.send('¿Teclados?');
    expect(model.seen[1]!.at(-1)?.parts?.[0]?.functionResponse).toEqual({
      id: 'abc',
      name: 'consultar_stock',
      response: { producto: 'teclados', stock: 3 },
    });
  });

  it('sends validation errors back to the model instead of ordering', async () => {
    const { agent, inventory } = setup([
      call('emitir_orden_compra', { producto: 'laptops', cantidad: -5 }),
      (h) => text(`No: ${String(lastToolResult(h)['error'])}`),
    ]);
    expect(await agent.send('Compra -5 laptops')).toMatch(/mayor que cero/);
    expect(inventory.state.orders).toEqual([]);
  });

  it('drops a failed turn without side effects so the user can retry cleanly', async () => {
    const { agent } = setup([apiError(503), text('Hola')]);
    expect(await agent.send('¿Stock?')).toMatch(/503/);
    expect(agent.history).toEqual([]);
    expect(await agent.send('¿Stock?')).toBe('Hola');
    expect(agent.history).toHaveLength(2);
  });

  it('explains the free-tier quota limit', async () => {
    const { agent } = setup([apiError(429)]);
    expect(await agent.send('hola')).toMatch(/límite gratuito/);
  });

  it('keeps an issued order in memory when the API fails afterwards', async () => {
    const { agent, inventory } = setup([
      call('emitir_orden_compra', { producto: 'sillas', cantidad: 2 }),
      apiError(500),
    ]);
    await agent.send('Confirmo, compra 2 sillas');
    expect(inventory.state.orders).toHaveLength(1);
    expect(agent.history.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model']);
  });

  it('stops tool loops after the round limit', async () => {
    const { agent } = setup(
      [0, 1, 2].map((i) => call('consultar_stock', { producto: 'laptops' }, String(i))),
      3,
      { maxToolRounds: 3 },
    );
    expect(await agent.send('loop')).toBe(TOO_MANY_STEPS);
    expect(agent.history.at(-1)?.role).toBe('model');
  });

  it('trims history at user messages, never between a call and its response', async () => {
    const steps: Step[] = [];
    for (let i = 0; i < 4; i++) {
      steps.push(call('consultar_stock', { producto: 'laptops' }, String(i)), text(`r${i}`));
    }
    const { agent, model } = setup(steps, 3, { maxHistoryTurns: 2 });
    for (let i = 0; i < 4; i++) await agent.send(`pregunta ${i}`);

    expect(agent.history[0]?.parts?.[0]?.text).toBe('pregunta 2');
    for (const seen of model.seen) expect(seen[0]?.parts?.[0]?.text).toBeDefined();
  });
});
