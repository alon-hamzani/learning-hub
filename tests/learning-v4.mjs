import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.session',true))$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`);
for(const name of ['20261030_cloud.sql','20261030_learning_hub.sql','20261030_audit_fixes.sql','20261030_server_privileges.sql','20261030_sync_safety.sql','20261030_admin_summary.sql','20261030_sync_conflict_response.sql','20261031_parent_pin.sql','20261031_learning_ledger.sql','20261031_learning_sync.sql','20261031_learning_order.sql']){
 const sql=readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');try{await db.exec(sql);}catch(e){console.log('SQL',e.message,'position',e.position,'internal',e.internalQuery,e.internalPosition,'near',sql.slice(Math.max(0,Number(e.position)-160),Number(e.position)+160));await db.close();throw e;}console.log('migration',name,'OK');
}
const owner=randomUUID(),other=randomUUID();
await db.query(`insert into auth.users values($1,'test-a@example.invalid',now(),'{"provider":"google"}','{}'),($2,'test-b@example.invalid',now(),'{"provider":"google"}','{}')`,[owner,other]);
await db.exec(`update app_users set status='approved';`);
await db.query(`insert into user_game_permissions(user_id,game_id) values($1,'multiplication-quest'),($2,'multiplication-quest')`,[owner,other]);
const as=async(id,fn)=>{await db.exec(`set role authenticated;`);await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.session','test-session',false)`,[id]);try{return await fn();}finally{await db.exec('reset role');}};
const rpc=async(name,args=[])=>{const result=await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);return result.rows[0].result;};
const operation=(kind,payload,id=randomUUID())=>rpc('sync_learning_operation',[id,kind,{...payload,gameId:'multiplication-quest'}]);
const profile={id:'child-test',name:'QA',avatar:'🦊',joined:Date.now(),xp:99999,sound:false,progress:{},skills:{},activity:[],earnedBadges:[]};
let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS',name);}
await check('PIN hashes are salted, private, four digits only',()=>as(owner,async()=>{
 await assert.rejects(()=>rpc('set_parent_pin',['123']));assert.equal((await rpc('set_parent_pin',['0123'])).ok,true);
 await assert.rejects(()=>db.query('select * from private.parent_pins'));
}));
await check('five incorrect attempts lock even the correct PIN',()=>as(owner,async()=>{for(let i=0;i<5;i++)assert.equal((await rpc('verify_parent_pin',['9999'])).ok,false);assert.equal((await rpc('verify_parent_pin',['0123'])).locked,true);}));
await db.exec(`update private.parent_pins set locked_until=now()-interval '1 second';`);
await check('PIN can unlock after lockout expires',()=>as(owner,async()=>assert.equal((await rpc('verify_parent_pin',['0123'])).ok,true)));
await check('second account cannot reuse parent unlock',()=>as(other,async()=>assert.equal((await rpc('parent_pin_status')).configured,false)));
await check('client supplied XP is ignored',()=>as(owner,async()=>{await operation('profile',{snapshot:profile,revision:null});const rows=(await db.query(`select snapshot->>'xp' xp from game_progress`)).rows;assert.equal(rows[0].xp,'0');}));
await check('operation retries are idempotent; mismatched reuse rejected',()=>as(owner,async()=>{const id=randomUUID(),payload={snapshot:{...profile,name:'Changed'},revision:1};assert.equal((await operation('profile',payload,id)).revision,2);assert.equal((await operation('profile',payload,id)).revision,2);await assert.rejects(()=>operation('profile',{...payload,revision:2},id));}));
const questions=Array.from({length:4},(_,i)=>({uid:'q'+i,a:6,b:7,type:'number'}));
await as(owner,()=>operation('run',{run:{id:'test-run',studentId:profile.id,worldId:6,mode:'practice',count:4,questions}}));
const event=(uid,action,response)=>operation('answer',{sessionId:'test-run',question:{uid},action,response:response??null});
await check('server awards 10 for clean, 6 after mistake, 3 after hint plus mistake, 0 reveal',()=>as(owner,async()=>{
 assert.equal((await event('q0','answer','42')).points,10);
 await event('q1','answer','41');assert.equal((await event('q1','answer','42')).points,6);
 await event('q2','answer','41');await event('q2','hint');assert.equal((await event('q2','answer','42')).points,3);
 assert.equal((await event('q3','reveal')).points,0);
 assert.equal((await db.query(`select sum(points)::integer total from learning_rewards`)).rows[0].total,19);
}));
await check('resolved question cannot earn points twice',()=>as(owner,()=>assert.rejects(()=>event('q0','answer','42'))));
await check('foreign account cannot submit answers',()=>as(other,()=>assert.rejects(()=>event('q0','answer','42'))));
await check('finishing awards stage bonus once',()=>as(owner,async()=>{await operation('finish',{sessionId:'test-run'});await operation('finish',{sessionId:'test-run'});assert.equal((await db.query(`select sum(points)::integer total from learning_rewards`)).rows[0].total,54);}));
await check('profile save preserves server balance',()=>as(owner,async()=>{await operation('profile',{snapshot:{...profile,xp:1000000},revision:2});assert.equal((await db.query(`select snapshot->>'xp' xp from game_progress`)).rows[0].xp,'54');}));
await db.exec(`delete from private.parent_unlocks;`);
await check('delete and reset require current parent PIN',()=>as(owner,async()=>{await assert.rejects(()=>rpc('delete_student_profile',[profile.id]));await assert.rejects(()=>rpc('reset_game_profile',[profile.id,'multiplication-quest']));}));
await check('direct attempt insertion cannot bypass scoring',()=>as(owner,()=>assert.rejects(()=>db.exec(`insert into question_attempts(session_id,owner_id,student_id,question_uid,a,b,kind,action,response) values('test-run','${owner}','child-test','fake',1,1,'number','answer','1')`))));
await check('PIN is a bcrypt hash, never plaintext',async()=>{const row=(await db.query('select pin_hash from private.parent_pins where owner_id=$1',[owner])).rows[0];assert.match(row.pin_hash,/^\$2[ab]\$10\$/);assert.notEqual(row.pin_hash,'0123');});
await check('valid parent PIN permits reset and clears the balance',()=>as(owner,async()=>{await rpc('verify_parent_pin',['0123']);await rpc('reset_game_profile',[profile.id,'multiplication-quest']);assert.equal((await db.query(`select snapshot->>'xp' xp from game_progress where student_id='child-test'`)).rows[0].xp,'0');assert.equal((await db.query(`select count(*)::integer n from learning_rewards`)).rows[0].n,0);}));
await check('the same parent in a different login session must enter the PIN again',()=>as(owner,async()=>{await db.query(`select set_config('request.jwt.session','another-session',false)`);await assert.rejects(()=>rpc('parent_authorized'));}));
await check('bonus games record real wrong attempts before a corrected answer',()=>as(owner,async()=>{
 const question={uid:'bonus-test',a:7,b:8,type:'number'};
 await operation('module',{studentId:profile.id,eventKind:'mini_interaction',payload:{question,action:'answer',response:'54'}});
 await operation('module',{studentId:profile.id,eventKind:'mini_interaction',payload:{question,action:'hint',response:null}});
 await operation('module',{studentId:profile.id,eventKind:'mini_interaction',payload:{question,action:'answer',response:'56'}});
 const result=(await db.query(`select score,wrong_answers,hints_used from game_sessions where id='mini_bonus-test'`)).rows[0];
 assert.equal(result.score,0);assert.equal(result.wrong_answers,1);assert.equal(result.hints_used,1);
 assert.equal((await db.query(`select sum(points)::integer total from learning_rewards`)).rows[0].total,3);
}));
await check('repeating a legacy completed stage cannot re-award its old bonus',async()=>{
 const legacy={...profile,id:'legacy-child',progress:{1:{lesson:true,guided:true}}};
 await as(owner,()=>operation('profile',{snapshot:legacy,revision:null}));
 await db.query(`insert into learning_rewards(owner_id,student_id,game_id,reward_key,points) values($1,'legacy-child','multiplication-quest','baseline',30)`,[owner]);
 const migration=readFileSync(new URL('../supabase/migrations/20261031_legacy_milestones.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 await as(owner,async()=>{
  await operation('run',{run:{id:'legacy-repeat',studentId:legacy.id,worldId:1,mode:'guided',count:1,questions:[{uid:'legacy-q',a:1,b:4,type:'number'}]}});
  await operation('answer',{sessionId:'legacy-repeat',question:{uid:'legacy-q'},action:'answer',response:'4'});
  await operation('finish',{sessionId:'legacy-repeat'});
  assert.equal((await db.query(`select sum(points)::integer total from learning_rewards where student_id='legacy-child'`)).rows[0].total,40);
 });
});
console.log(`${passed} learning-v4 database checks passed`);await db.close();
