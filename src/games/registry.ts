// Add a new deployed React game module here. A catalog record alone cannot publish executable code.
import { lazy } from 'react';
import {createCompletedTestProfile} from './godMode';
const App = lazy(() => import('../App'));
export const registeredModules = {
  'multiplication-quest': App,
};
export type ModuleKey = keyof typeof registeredModules;
export const moduleInstalled = (key: string): key is ModuleKey => key in registeredModules;

// Register an explicit sandbox adapter with each future game. Unsupported games
// must never silently fall back to a real, writable cloud while God Mode is on.
export const registeredTestModes:Partial<Record<ModuleKey,()=>ReturnType<typeof createCompletedTestProfile>[]>>={
  'multiplication-quest':()=>[createCompletedTestProfile('multiplication-quest')],
};
export function gameTestProfiles(key:string){return moduleInstalled(key)?registeredTestModes[key]?.()??null:null;}
