import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { BRANCHES as FALLBACK, HEADQUARTERS as FALLBACK_HQ } from '../lib/branches.js';

const BranchesContext = createContext(null);

/**
 * Loads the live branch list from the API (admins can add/edit/delete branches),
 * falling back to the built-in defaults until it arrives. Any component can call
 * useBranches() to get names, the HQ, full details, and a refresh function.
 */
export function BranchesProvider({ children }) {
  const [details, setDetails] = useState(null);
  const [hq, setHq] = useState(FALLBACK_HQ);

  const refresh = useCallback(async () => {
    try {
      const r = await api('/content/branches');
      setDetails(r.branches || []);
      if (r.headquarters) setHq(r.headquarters);
    } catch {
      setDetails(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const names = details ? details.map((b) => b.name) : FALLBACK;
  const value = { branches: names, details: details || [], headquarters: hq, refresh };
  return <BranchesContext.Provider value={value}>{children}</BranchesContext.Provider>;
}

export function useBranches() {
  const ctx = useContext(BranchesContext);
  // Safe fallback if used outside the provider.
  return ctx || { branches: FALLBACK, details: [], headquarters: FALLBACK_HQ, refresh: () => {} };
}
