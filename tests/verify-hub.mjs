import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let ts; try { ts=require('typescript'); } catch { ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const read = p=>readFileSync(new URL(p,import.meta.url),'utf8');
for (const file of ['../src/AuthGate.tsx','../src/LearningHub.tsx','../src/Admin.tsx','../src/AdminGames.tsx','../src/games/registry.ts','../src/cloud.ts']) {
  const code = read(file);
  const result=ts.transpileModule(code,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,`${file}: ${errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`);
}
const game=read('../src/App.tsx'), gameData=read('../src/game.ts'), gameCss=read('../src/styles.css');
assert.equal(game,read('../../multiplication-quest-cloud/src/App.tsx'),'Original game App.tsx changed');
assert.equal(gameData,read('../../multiplication-quest-cloud/src/game.ts'),'Original game logic changed');
assert.equal(gameCss,read('../../multiplication-quest-cloud/src/styles.css'),'Original game styling changed');
const sql=read('../supabase/migrations/20261030_learning_hub.sql');
for(const piece of ['create table public.games','create table public.user_game_permissions','create table public.game_progress','private.has_game_access','create policy attempts_insert','create policy progress_update','create policy sessions_read','select owner_id,id,\'multiplication-quest\',snapshot','begin;','commit;']) assert.ok(sql.includes(piece),`Missing SQL ${piece}`);
const adminFn=read('../supabase/functions/admin-game-action/index.ts');
for(const piece of ['getUser(token)',"action === 'grant'","action === 'upsert'",'admin_audit','alon.hamzani@gmail.com']) assert.ok(adminFn.includes(piece),`Missing server security ${piece}`);
console.log('OK: React/TypeScript syntax, original-game byte identity, SQL migration structures and admin-function security checks.');
