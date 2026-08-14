import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface SitesTreeContextValue {
  version: number;
  refresh: () => void;
}

const SitesTreeContext = createContext<SitesTreeContextValue | null>(null);

export function SitesTreeProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return <SitesTreeContext.Provider value={{ version, refresh }}>{children}</SitesTreeContext.Provider>;
}

export function useSitesTree() {
  const ctx = useContext(SitesTreeContext);
  if (!ctx) throw new Error("useSitesTree must be used within a SitesTreeProvider");
  return ctx;
}
