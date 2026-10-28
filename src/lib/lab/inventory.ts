/** Mock business functions of the logistics agent. They know nothing about the LLM. */

export const MAX_UNITS_PER_ORDER = 500;

/** Canonical product name → synonyms the user (or the model) may use. */
export const CATALOG: Readonly<Record<string, readonly string[]>> = {
  laptops: ['laptop', 'portatil', 'portatiles', 'notebook', 'notebooks', 'computador portatil'],
  monitores: ['monitor', 'monitors', 'pantalla', 'pantallas', 'screen', 'screens'],
  teclados: ['teclado', 'keyboard', 'keyboards'],
  mouses: ['mouse', 'mice', 'raton', 'ratones'],
  headsets: ['headset', 'audifonos', 'auriculares', 'diadema', 'diademas', 'headphones'],
  sillas: ['silla', 'silla ergonomica', 'sillas ergonomicas', 'chair', 'chairs'],
};

/** Validation error returned to the agent so it can explain it to the user. */
export class BusinessError extends Error {}

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

const ALIASES = new Map(
  Object.entries(CATALOG).flatMap(([canonical, synonyms]) =>
    [canonical, ...synonyms].map((alias) => [normalize(alias), canonical] as const),
  ),
);

export function resolveProduct(product: string): string {
  const canonical = ALIASES.get(normalize(product));
  if (canonical === undefined) {
    throw new BusinessError(
      `'${product}' no existe en el catálogo. Productos disponibles: ${Object.keys(CATALOG).join(', ')}.`,
    );
  }
  return canonical;
}

export interface PurchaseOrder {
  id: string;
  product: string;
  quantity: number;
}

/** Everything the inventory remembers between requests (serverless functions keep no memory). */
export interface InventoryState {
  stock: Record<string, number>;
  orders: PurchaseOrder[];
}

export const emptyInventory = (): InventoryState => ({ stock: {}, orders: [] });

export class MockInventory {
  readonly state: InventoryState;

  /**
   * Stock is random (1–5) the first time a product is checked and then stays fixed for the
   * conversation, so the agent never sees two different numbers for the same product.
   */
  constructor(
    state: InventoryState = emptyInventory(),
    private readonly onOrder: (order: PurchaseOrder) => void = () => {},
    private readonly random: () => number = Math.random,
  ) {
    this.state = { stock: { ...state.stock }, orders: [...state.orders] };
  }

  checkStock(product: string): number {
    const canonical = resolveProduct(product);
    const known = this.state.stock[canonical];
    if (known !== undefined) return known;
    const stock = 1 + Math.floor(this.random() * 5);
    this.state.stock[canonical] = stock;
    return stock;
  }

  issuePurchaseOrder(product: string, quantity: number): string {
    const canonical = resolveProduct(product);
    if (!Number.isInteger(quantity)) {
      throw new BusinessError(`La cantidad debe ser un entero; se recibió ${String(quantity)}.`);
    }
    if (quantity <= 0) {
      throw new BusinessError(`La cantidad debe ser mayor que cero; se recibió ${quantity}.`);
    }
    if (quantity > MAX_UNITS_PER_ORDER) {
      throw new BusinessError(
        `Máximo ${MAX_UNITS_PER_ORDER} unidades por orden; se pidieron ${quantity}.`,
      );
    }
    const order: PurchaseOrder = {
      id: `OC-${String(this.state.orders.length + 1).padStart(4, '0')}`,
      product: canonical,
      quantity,
    };
    this.state.orders.push(order);
    this.onOrder(order);
    return 'OK';
  }
}
