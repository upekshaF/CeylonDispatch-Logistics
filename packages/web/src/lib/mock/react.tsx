/**
 * React bindings for the mock store: a provider plus hooks.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createStore, type Store } from "./store.js";
import type { State } from "./types.js";

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => createStore(), []);
  // gentle live simulation so the map and ETAs move during a demo
  useEffect(() => {
    const t = setInterval(() => store.simulateTick(), 4000);
    return () => clearInterval(t);
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

export function useAppState(): State {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
