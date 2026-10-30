// Add a new deployed React game module here. A catalog record alone cannot publish executable code.
import { lazy } from 'react';
const App = lazy(() => import('../App'));
export const registeredModules = {
  'multiplication-quest': App,
};
export type ModuleKey = keyof typeof registeredModules;
export const moduleInstalled = (key: string): key is ModuleKey => key in registeredModules;
