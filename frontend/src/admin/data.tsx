import { createContext, useContext } from 'react';
import type { Row } from '../api';

export type AppData = {
  me: Row;                       // logged-in staff user
  meta: { grades: string[]; current_year: string; settings: Record<string, string> };
  classes: Row[];                // classes of ALL academic years
  years: Row[];
  reload: () => void;            // re-fetch classes / years / settings after changes
  go: (path: string) => void;
};
export const DataCtx = createContext<AppData>(null as unknown as AppData);
export const useApp = () => useContext(DataCtx);
/** Classes belonging to the current academic year. */
export const useCurrentClasses = () => { const { classes, meta } = useApp(); return classes.filter(c => c.academic_year === meta.current_year); };
