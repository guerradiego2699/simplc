/**
 * React context for the simulator app: the store, the simulation controller and the UI strings.
 * Client code receives only the `simulator` part of the dictionary (not both full dictionaries).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/config/site';
import type { SimulationController } from '@/simulator/store/controller';
import type { SimulatorStore, SimulatorStoreApi } from '@/simulator/store/simulator-store';

export type SimStrings = Dictionary['simulator'];

interface SimContext {
  store: SimulatorStoreApi;
  controller: SimulationController;
  t: SimStrings;
  locale: Locale;
}

const Context = createContext<SimContext | null>(null);

export function SimProvider({ value, children }: { value: SimContext; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function useSimContext(): SimContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('Simulator context missing');
  return ctx;
}

export function useSim<T>(selector: (s: SimulatorStore) => T): T {
  return useStore(useSimContext().store, selector);
}

export const useStoreApi = () => useSimContext().store;
export const useController = () => useSimContext().controller;
export const useStrings = () => useSimContext().t;
export const useLocale = () => useSimContext().locale;

/** Replaces {name} placeholders (client-side twin of i18n `format`). */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
