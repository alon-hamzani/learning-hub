import {BADGES,WORLDS,createProfile,dayKey,pairKey} from '../game';
import type {Profile} from '../game';
import type {GameCloud} from '../cloud';

export type GodCapability={allowed:boolean;session_key:string|null};
export function godPreferenceKey(owner:string){return `learning-hub:god-mode:${owner}`;}
export function restoreGodMode(owner:string,capability:GodCapability):boolean {
  if(!capability.allowed||!capability.session_key)return false;
  try{return sessionStorage.getItem(godPreferenceKey(owner))===capability.session_key;}catch{return false;}
}
export function rememberGodMode(owner:string,capability:GodCapability,enabled:boolean){
  try{if(enabled&&capability.allowed&&capability.session_key)sessionStorage.setItem(godPreferenceKey(owner),capability.session_key);else sessionStorage.removeItem(godPreferenceKey(owner));}catch{/* Optional tab preference never grants permission. */}
}
export function createCompletedTestProfile(moduleKey='multiplication-quest'):Profile {
  const now=Date.now();
  const profile=createProfile('God Mode — בדיקה','🧪');
  profile.id=`god-mode:${moduleKey}`;
  profile.xp=10000;
  profile.progress=Object.fromEntries(WORLDS.map(world=>[world.id,{lesson:true,guided:true,practice:true,checkpoint:true,best:100}]));
  profile.skills=Object.fromEntries(Array.from({length:100},(_,index)=>{
    const a=Math.floor(index/10)+1,b=index%10+1;
    return [pairKey(a,b),{seen:3,firstCorrect:3,wrong:0,guidedCorrect:3,streak:3,lastAt:now,dueAt:now+86400000,days:[dayKey(now-86400000),dayKey(now)]}];
  }));
  profile.earnedBadges=BADGES.map(badge=>badge.id);
  return profile;
}
export function keepTestCompletion(profile:Profile):Profile {
  const complete=createCompletedTestProfile();
  return {...profile,xp:complete.xp,skills:complete.skills,progress:complete.progress,earnedBadges:complete.earnedBadges};
}
export function createSandboxCloud():GameCloud & {flush:()=>Promise<void>} {
  const ignore=()=>{};
  const forbidden=async()=>{throw Error('איפוס ומחיקה אינם זמינים במצב בדיקה.');};
  // This adapter has no client, network, outbox or persistent-storage dependency.
  return {onProfilesChanged:ignore,onModuleEvent:ignore,onSessionStart:ignore,onGameEvent:ignore,onSessionComplete:ignore,onActivity:ignore,
    deleteProfile:forbidden,resetProfile:forbidden,flush:async()=>{}};
}
