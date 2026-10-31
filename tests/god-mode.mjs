import ts from 'typescript';import vm from 'node:vm';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const memory=new Map();let writes=0;
const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
function load(source,require){const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const context={exports:{},require,Date,Math,Intl,sessionStorage:storage,localStorage:new Proxy({},{get(){writes++;throw Error('Sandbox must not use persistent storage');}})};vm.createContext(context);vm.runInContext(code,context);return context.exports;}
const game=load(read('src/game.ts'),()=>{}),god=load(read('src/games/godMode.ts'),()=>game);
const registry=load(read('src/games/registry.ts'),name=>name==='react'?{lazy:()=>()=>null}:god);
const original=game.createProfile('Real child','🦊'),before=JSON.stringify(original),test=god.createCompletedTestProfile();
assert(test.id.startsWith('god-mode:'));
assert.equal(game.masteryCount(test),100);assert.equal(game.badgesFor(test).length,game.BADGES.length);
for(const world of game.WORLDS){assert(game.canOpenWorld(test,world.id));for(const mode of ['guided','practice','checkpoint','daily','mixed','focused'])assert(game.canStartQuiz(test,world.id,mode));}
assert.equal(game.WORLDS.filter((_,index)=>game.worldIsUnlocked(original,index)).length,1);
assert.equal(game.makeQuiz(99,'mixed',test).length,30);
const frozen=god.keepTestCompletion({...game.recordSkill(test,game.makeQuestion(9,8),false,false),progress:{},earnedBadges:[],xp:0});
assert.equal(game.masteryCount(frozen),100);assert(frozen.progress[99].checkpoint);assert.equal(frozen.xp,10000);
const sandbox=god.createSandboxCloud();
sandbox.onProfilesChanged([test]);sandbox.onSessionStart({id:'test',studentId:test.id,worldId:99,mode:'checkpoint',count:1});
sandbox.onGameEvent({sessionId:'test',question:game.makeQuestion(8,9),action:'answer',response:'72'});sandbox.onModuleEvent(test.id,'test',{});sandbox.onActivity('lesson_completed',test.id);sandbox.onSessionComplete('test');await sandbox.flush();
await assert.rejects(()=>sandbox.deleteProfile(original.id));await assert.rejects(()=>sandbox.resetProfile(original.id));
assert.equal(writes,0);assert.equal(JSON.stringify(original),before);
const capability={allowed:true,session_key:'session-a'};god.rememberGodMode('owner',capability,true);assert(god.restoreGodMode('owner',capability));
assert(!god.restoreGodMode('other-owner',capability));assert(!god.restoreGodMode('owner',{allowed:false,session_key:'session-a'}));assert(!god.restoreGodMode('owner',{allowed:true,session_key:'new-login'}));
god.rememberGodMode('owner',capability,false);assert(!god.restoreGodMode('owner',capability));
assert.equal(registry.gameTestProfiles('not-installed'),null);assert.equal(registry.gameTestProfiles('multiplication-quest').length,1);
console.log('PASS God Mode: every world/stage and mastery unlocked; real data unchanged; no persistent writes; reset/delete blocked; per-account/per-login restoration; explicit game adapters.');
