/**
 * Bridge between Gemini function calling and the business functions.
 *
 * The model can hallucinate function names, arguments or types, so nothing reaches the inventory
 * without going through `ToolExecutor.execute`, which never throws: problems come back as
 * `{ error }` for the model to explain or correct.
 */
import type { FunctionDeclaration, Tool } from '@google/genai';
import { BusinessError, CATALOG, MAX_UNITS_PER_ORDER, resolveProduct } from './inventory.js';
import type { MockInventory } from './inventory.js';
import type { LogEvent } from './events.js';

const PRODUCT = {
  type: 'string',
  description: `Producto del catálogo, tal como lo nombra el usuario. Catálogo: ${Object.keys(CATALOG).join(', ')}.`,
};

export const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'consultar_stock',
    description: 'Devuelve las unidades disponibles hoy en el inventario para un producto.',
    parametersJsonSchema: {
      type: 'object',
      properties: { producto: PRODUCT },
      required: ['producto'],
    },
  },
  {
    name: 'emitir_orden_compra',
    description:
      'Emite una orden de compra real. Solo debe llamarse después de que el usuario confirme explícitamente el producto y la cantidad.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        producto: PRODUCT,
        cantidad: {
          type: 'integer',
          description: 'Unidades a comprar (entero positivo).',
          minimum: 1,
          maximum: MAX_UNITS_PER_ORDER,
        },
      },
      required: ['producto', 'cantidad'],
    },
  },
];

export const TOOLS: Tool[] = [{ functionDeclarations: DECLARATIONS }];

class InvalidArgument extends Error {}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidArgument(
      `'${name}' debe ser un texto no vacío; se recibió ${JSON.stringify(value)}.`,
    );
  }
  return value.trim();
}

function integer(value: unknown, name: string): number {
  // Arguments arrive as JSON: 7 and 7.0 are the same number. Fractions, strings and booleans are not.
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InvalidArgument(`'${name}' debe ser un entero; se recibió ${JSON.stringify(value)}.`);
  }
  return value;
}

type Validator = (value: unknown, name: string) => unknown;

interface ToolSpec {
  params: Record<string, Validator>;
  run: (args: Record<string, unknown>) => Record<string, unknown>;
}

export class ToolExecutor {
  private readonly tools: Record<string, ToolSpec>;

  constructor(
    inventory: MockInventory,
    private readonly log: LogEvent = () => {},
  ) {
    this.tools = {
      consultar_stock: {
        params: { producto: text },
        run: ({ producto }) => ({
          producto: resolveProduct(producto as string),
          stock: inventory.checkStock(producto as string),
        }),
      },
      emitir_orden_compra: {
        params: { producto: text, cantidad: integer },
        run: ({ producto, cantidad }) => {
          const status = inventory.issuePurchaseOrder(producto as string, cantidad as number);
          // Index instead of .at(): Vercel type-checks the functions with an ES2021 lib.
          const order = inventory.state.orders[inventory.state.orders.length - 1];
          return {
            status,
            orden_id: order?.id,
            producto: order?.product,
            cantidad: order?.quantity,
          };
        },
      },
    };
  }

  execute(name: string, args: Record<string, unknown> | undefined): Record<string, unknown> {
    const received = args ?? {};
    this.log({ type: 'call', name, args: received });
    const result = this.run(name, received);
    this.log({ type: 'result', name, result });
    return result;
  }

  private run(name: string, args: Record<string, unknown>): Record<string, unknown> {
    try {
      const tool = this.tools[name];
      if (tool === undefined) {
        throw new InvalidArgument(
          `La función '${name}' no existe. Disponibles: ${Object.keys(this.tools).join(', ')}.`,
        );
      }
      return tool.run(validate(tool, args));
    } catch (error) {
      if (error instanceof InvalidArgument || error instanceof BusinessError) {
        return { error: error.message };
      }
      console.error(`Unexpected failure running ${name}`, error);
      return { error: 'Fallo interno del sistema de inventario. Intenta de nuevo más tarde.' };
    }
  }
}

function validate(tool: ToolSpec, args: Record<string, unknown>): Record<string, unknown> {
  const allowed = Object.keys(tool.params);
  const extra = Object.keys(args).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    throw new InvalidArgument(
      `Parámetros no soportados: ${extra.sort().join(', ')}. Usa solo: ${allowed.join(', ')}.`,
    );
  }
  const missing = allowed.filter((key) => !(key in args));
  if (missing.length > 0) {
    throw new InvalidArgument(`Faltan parámetros obligatorios: ${missing.join(', ')}.`);
  }
  return Object.fromEntries(
    Object.entries(tool.params).map(([key, check]) => [key, check(args[key], key)]),
  );
}
