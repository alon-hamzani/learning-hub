// Test mathematical correctness of generated exercise types.
// Run with: node tests/verify.mjs (after build; the build can import source through Vite)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts; try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
import vm from 'node:vm';
const src = readFileSync(new URL('../src/game.ts', import.meta.url), 'utf-8');
const code = ts.transpileModule(src, {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{},require,Date,Math,Intl};
vm.createContext(context);vm.runInContext(code, context);
const {makeQuestion,makeQuiz,createProfile,WORLDS,skillLevel,pairKey}=context.exports;
let checked=0;
for(let a=1;a<=10;a++)for(let b=1;b<=10;b++)for(const type of ['number','choice','missing','truefalse','visual','story']){
  const q=makeQuestion(a,b,type), product=a*b;
  if(q.key !== `${a}x${b}`)throw Error('Incorrect key');
  if(type==='missing' && ![String(a),String(b)].includes(q.correctAnswer))throw Error('Incorrect missing factor');
  if(['number','choice','visual','story'].includes(type) && q.correctAnswer!==String(product))throw Error('Incorrect product');
  if(q.options && (q.options.length !== new Set(q.options).size || !q.options.includes(q.correctAnswer)))throw Error('Bad choices');
  if(type==='truefalse' && (q.correctAnswer === 'נכון') !== (q.shownResult === product))throw Error('Bad truth question');
  checked++;
}
const p=createProfile('מיקה','🦊');
for(const world of WORLDS)for(const mode of ['guided','practice','checkpoint','daily','mixed','focused','rocket','tower','treasure']){
 const qs=makeQuiz(world.id,mode,p);const length={guided:8,practice:24,checkpoint:20,daily:12,mixed:30,focused:20,rocket:12,tower:12,treasure:12}[mode];
 if(qs.length!==length)throw Error(`Wrong quiz length ${world.id} ${mode} ${qs.length}`);
 if(qs.some(q=>q.a<1||q.b<1||q.a>10||q.b>10))throw Error('Invalid pair');
 checked+=qs.length;
}
if(skillLevel(undefined)!=='unseen'||!pairKey(3,8).includes('x'))throw Error('Skill helper failed');
console.log(`OK: ${checked} mathematical and quiz-generation cases verified.`);
