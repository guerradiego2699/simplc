import { describe, expect, it } from 'vitest';
import type { LabEvent } from './events';
import { MockInventory } from './inventory';
import { ToolExecutor } from './tools';

function setup(stock = 3) {
  const orders: string[] = [];
  const inventory = new MockInventory(
    undefined,
    (o) => orders.push(`${o.id}:${o.quantity}`),
    () => (stock - 1) / 5,
  );
  const events: LabEvent[] = [];
  return { inventory, orders, events, tools: new ToolExecutor(inventory, (e) => events.push(e)) };
}

describe('inventory', () => {
  it('keeps the random stock stable for the conversation and normalizes names', () => {
    const { inventory } = setup(3);
    expect(inventory.checkStock('laptops')).toBe(3);
    expect(inventory.checkStock('  PORTÁTILES ')).toBe(3);
    expect(inventory.checkStock('Laptop')).toBe(3);
  });

  it('draws stock between 1 and 5', () => {
    for (const r of [0, 0.5, 0.9999]) {
      const stock = new MockInventory(undefined, undefined, () => r).checkStock('sillas');
      expect(stock).toBeGreaterThanOrEqual(1);
      expect(stock).toBeLessThanOrEqual(5);
    }
  });
});

describe('ToolExecutor', () => {
  it('returns the canonical product with its stock and logs the call', () => {
    const { tools, events } = setup(4);
    expect(tools.execute('consultar_stock', { producto: 'monitor' })).toEqual({
      producto: 'monitores',
      stock: 4,
    });
    expect(events.map((e) => e.type)).toEqual(['call', 'result']);
  });

  it('issues an order and returns status OK', () => {
    const { tools, orders } = setup();
    expect(tools.execute('emitir_orden_compra', { producto: 'laptops', cantidad: 7 })).toEqual({
      status: 'OK',
      orden_id: 'OC-0001',
      producto: 'laptops',
      cantidad: 7,
    });
    expect(orders).toEqual(['OC-0001:7']);
  });

  it.each([-3, 0, 501])('rejects out-of-range quantity %s', (cantidad) => {
    const { tools, orders } = setup();
    expect(tools.execute('emitir_orden_compra', { producto: 'laptops', cantidad })).toHaveProperty(
      'error',
    );
    expect(orders).toEqual([]);
  });

  it.each([2.5, '5', true, null])('rejects hallucinated quantity type %s', (cantidad) => {
    const { tools, orders } = setup();
    const result = tools.execute('emitir_orden_compra', { producto: 'laptops', cantidad });
    expect(result['error']).toMatch(/entero/);
    expect(orders).toEqual([]);
  });

  it('rejects unknown products, functions and parameters', () => {
    const { tools, orders } = setup();
    expect(tools.execute('consultar_stock', { producto: 'unicornios' })['error']).toMatch(
      /no existe en el catálogo/,
    );
    expect(tools.execute('borrar_inventario', {})['error']).toMatch(/no existe/);
    expect(
      tools.execute('emitir_orden_compra', { producto: 'laptops', cantidad: 2, descuento: 50 })[
        'error'
      ],
    ).toMatch(/descuento/);
    expect(tools.execute('emitir_orden_compra', { producto: 'laptops' })['error']).toMatch(
      /cantidad/,
    );
    expect(tools.execute('consultar_stock', undefined)['error']).toMatch(/producto/);
    expect(orders).toEqual([]);
  });
});
