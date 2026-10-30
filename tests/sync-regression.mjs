import ts from 'typescript';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(source,imports,extra={}) {
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context={exports:{},require:imports,Date,Math,Intl,console,...extra};vm.createContext(context);vm.runInContext(code,context);return context.exports;
}
const game=load(read('src/game.ts'),()=>{}), pagination=load(read('src/pagination.ts'),()=>{});
const results=[];
async function test(name,fn){try{await fn();results.push({name,result:'PASS'})}catch(e){results.push({name,result:'FAIL',detail:e.message})}}
const base={...game.createProfile('QA','🦊'),id:'child-a',_revision:1};
function fixture(initial=[base]) {
  const rows=new Map(initial.map(p=>[p.id,{revision:p._revision,snapshot:structuredClone(p)}]));
  const calls=[],errors=[];let fail=false;
  const client={from(){throw Error('Profile writes must use guarded RPCs')},async rpc(name,data){
    calls.push({name,data:structuredClone(data)});
    if(fail){fail=false;return {error:{message:'Temporary failure'}}}
    if(name==='delete_student_profile'){rows.delete(data.p_student_id);return {error:null}}
    const previous=rows.get(data.p_student_id);
    if((previous?.revision??null)!==data.p_expected_revision)return {error:{code:'40001',message:'conflict'}};
    const revision=(previous?.revision||0)+1;rows.set(data.p_student_id,{revision,snapshot:data.p_snapshot});return {data:revision,error:null};
  }};
  const source=read('src/cloud.ts').replace(/import\.meta\.env\.VITE_SUPABASE_URL/g,"'https://example.invalid'").replace(/import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/g,"'public-test'");
  const cloud=load(source,n=>n==='@supabase/supabase-js'?{createClient:()=>client}:game);
  return {rows,calls,errors,fail:()=>{fail=true},cloud:cloud.createGameCloud('owner','multiplication-quest',m=>errors.push(m),initial)};
}
await test('stale list never deletes a child created on another device',async()=>{
  const f=fixture();f.rows.set('child-b',{revision:1,snapshot:{name:'Other child'}});
  f.cloud.onProfilesChanged([{...base,xp:20}]);await f.cloud.flush();assert(f.rows.has('child-b'));assert(f.calls.every(c=>c.name==='save_game_profile'));
});
await test('A-B-A quick changes preserve the final A state',async()=>{
  const f=fixture();f.cloud.onProfilesChanged([{...base,name:'B'}]);f.cloud.onProfilesChanged([base]);await f.cloud.flush();
  assert.equal(f.rows.get(base.id).snapshot.name,'QA');assert.equal(f.rows.get(base.id).revision,3);
});
await test('queued payload is immutable',async()=>{
  const f=fixture(),p={...base,xp:20};f.cloud.onProfilesChanged([p]);p.xp=999;await f.cloud.flush();assert.equal(f.rows.get(base.id).snapshot.xp,20);
});
await test('retry after a transient failure preserves the expected revision',async()=>{
  const f=fixture(),p={...base,xp:20};f.fail();f.cloud.onProfilesChanged([p]);await f.cloud.flush();f.cloud.onProfilesChanged([p]);await f.cloud.flush();
  assert.equal(f.rows.get(base.id).snapshot.xp,20);assert.equal(f.calls[0].data.p_expected_revision,1);assert.equal(f.calls[1].data.p_expected_revision,1);
});
await test('revision conflict cannot overwrite newer progress even on subsequent edits',async()=>{
  const f=fixture();f.rows.set(base.id,{revision:2,snapshot:{xp:100}});f.cloud.onProfilesChanged([{...base,xp:20}]);await f.cloud.flush();
  f.cloud.onProfilesChanged([{...base,xp:30}]);await f.cloud.flush();assert.equal(f.rows.get(base.id).snapshot.xp,100);assert.equal(f.calls.length,1);assert(f.errors[0].includes('מכשיר אחר'));
});
await test('delete requires the explicit delete API and retains unrelated profiles',async()=>{
  const f=fixture();f.rows.set('other',{revision:1});await f.cloud.deleteProfile(base.id);assert(!f.rows.has(base.id));assert(f.rows.has('other'));
});
await test('unchanged initial data creates no write',async()=>{const f=fixture();f.cloud.onProfilesChanged([base]);await f.cloud.flush();assert.equal(f.calls.length,0)});
await test('pagination loads 1203 rows without dropping records beyond the first 1000',async()=>{
  const data=Array.from({length:1203},(_,id)=>({id})),ranges=[];
  const rows=await pagination.readAllPages(async(from,to)=>(ranges.push([from,to]),{data:data.slice(from,to+1),error:null}));
  assert.equal(rows.length,1203);assert.equal(rows.at(-1).id,1202);assert.equal(ranges.length,3);
});
await test('pagination propagates errors instead of displaying a partial total',async()=>{
  await assert.rejects(()=>pagination.readAllPages(async()=>({data:null,error:{message:'read failed'}})),/read failed/);
});
await test('locked worlds cannot open or start any quiz through a secondary route',()=>{
  const p=game.createProfile('QA','🦊');for(const id of [1,9,99,-1,123]){assert(!game.canOpenWorld(p,id));for(const mode of ['guided','practice','checkpoint','daily','mixed','focused','rocket','tower','treasure'])assert(!game.canStartQuiz(p,id,mode))}
  p.progress[8]={checkpoint:true};assert(!game.canOpenWorld(p,9),'isolated late checkpoint unlocked a world');
});
await test('stage prerequisites are enforced centrally',()=>{
  const p=game.createProfile('QA','🦊');assert(game.canOpenWorld(p,0));assert(!game.canStartQuiz(p,0,'guided'));
  p.progress[0]={lesson:true};assert(game.canStartQuiz(p,0,'guided'));assert(!game.canStartQuiz(p,0,'practice'));
  p.progress[0].guided=true;assert(game.canStartQuiz(p,0,'practice'));assert(!game.canStartQuiz(p,0,'checkpoint'));
  p.progress[0].practice=true;assert(game.canStartQuiz(p,0,'checkpoint'));p.progress[0].checkpoint=true;assert(game.canOpenWorld(p,1));
});
await test('mixed exercises stay within unlocked tables',()=>{
  const p=game.createProfile('QA','🦊');p.progress[0]={checkpoint:true};
  for(let i=0;i<50;i++)assert(game.makeQuiz(1,'mixed',p).every(q=>q.a===1));
});
await test('authentication consumes lazy touch_login RPC, and a logging failure does not block access',async()=>{
  for(const fails of [false,true]) {
    let consumed=0,reload;const modes=[];
    const hooks={lazy:()=>()=>null,useCallback:f=>(reload=f,f),useEffect:()=>{},useMemo:()=>null,useState:initial=>[typeof initial==='function'?initial():initial,v=>modes.push(v)]};
    const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:()=>({then(resolve){consumed++;return Promise.resolve({error:fails?{message:'temporary'}:null}).then(resolve)}}),from:()=>({select(){return this},eq(){return this},single:async()=>({data:{id:'owner',status:'approved',role:'user'},error:null})})};
    const gate=load(read('src/AuthGate.tsx'),n=>n==='react'?hooks:n==='react/jsx-runtime'?require(n):n==='./cloud'?{cloudReady:true,supabase:client,readCatalog:async()=>[]}:n==='./games/registry'?{}:{},
      {window:{location:{hash:''}},console:{warn:()=>{}}});
    gate.default();await reload();assert.equal(consumed,1);assert(modes.includes('approved'));assert(!modes.includes('error'));
  }
});
console.log(JSON.stringify({environment:'isolated synchronization, navigation, authentication and pagination regressions',results},null,2));
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
