import { PGlite } from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,result:'PASS'});}catch(e){results.push({name,result:'FAIL',detail:e.message});}};
const assert=(x,m)=>{if(!x)throw Error(m)};
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
for(const name of ['20261030_cloud.sql','20261030_learning_hub.sql','20261030_audit_fixes.sql','20261030_server_privileges.sql']){
 const sql=readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8').replace('create extension if not exists pgcrypto;','');
 await check('migration '+name,()=>db.exec(sql));
}
const admin='10000000-0000-4000-8000-000000000001',a='10000000-0000-4000-8000-000000000002',b='10000000-0000-4000-8000-000000000003',pending='10000000-0000-4000-8000-000000000004';
await check('server role has required SQL privileges',async()=>{
 const r=(await db.query(`select has_table_privilege('service_role','public.app_users','SELECT,UPDATE') as users,has_table_privilege('service_role','public.games','SELECT,INSERT,UPDATE') as games,has_table_privilege('service_role','public.admin_audit','INSERT') as audit`)).rows[0];
 assert(r.users&&r.games&&r.audit,'missing server privileges');
});
for(const [id,email,confirmed] of [[admin,'alon.hamzani@gmail.com',true],[a,'qa-a@example.invalid',true],[b,'qa-b@example.invalid',true],[pending,'qa-pending@example.invalid',false]])await db.query(`insert into auth.users values($1,$2,$3,'{"provider":"google"}','{}')`,[id,email,confirmed?new Date().toISOString():null]);
await check('admin bootstrap verified-at-insert',async()=>assert((await db.query(`select role,status from app_users where id=$1`,[admin])).rows[0].role==='super_admin','not admin'));
await db.exec(`update app_users set status='approved' where id in ('${a}','${b}'); insert into user_game_permissions(user_id,game_id) values('${a}','multiplication-quest'),('${b}','multiplication-quest'); insert into student_profiles(id,owner_id,name) values('qa-child-a','${a}','QA A'),('qa-child-b','${b}','QA B');`);
const as=async(id,fn)=>{await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${id}',true);`);try{return await fn()}finally{await db.exec('rollback')}};
const denied=async(fn)=>{let hit=false;try{await fn()}catch{hit=true}assert(hit,'unexpectedly allowed')};
await check('pending sees no children',()=>as(pending,async()=>assert((await db.query('select id from student_profiles')).rows.length===0,'data exposed')));
await check('approved sees only own children',()=>as(a,async()=>assert(JSON.stringify((await db.query('select id from student_profiles')).rows)==='[{"id":"qa-child-a"}]','wrong rows')));
await check('ordinary cannot promote self',()=>as(a,()=>denied(()=>db.exec(`update app_users set role='super_admin' where id='${a}'`))));
await check('ordinary cannot insert permissions',()=>as(a,()=>denied(()=>db.exec(`insert into user_game_permissions(user_id,game_id) values('${pending}','multiplication-quest')`))));
await check('legacy snapshots hidden',()=>as(a,()=>denied(()=>db.query('select snapshot from student_profiles'))));
await check('profile upsert used by app',()=>as(a,()=>db.exec(`insert into student_profiles(id,owner_id,name,avatar) values('qa-child-a','${a}','QA renamed','fox') on conflict(id) do update set owner_id=excluded.owner_id,name=excluded.name,avatar=excluded.avatar`)));
await check('cannot create session for other owner child',()=>as(a,()=>denied(()=>db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-foreign','${a}','qa-child-b',1,'practice',1)`))));
await check('cannot create progress for other child',()=>as(a,()=>denied(()=>db.exec(`insert into game_progress(owner_id,student_id,game_id) values('${a}','qa-child-b','multiplication-quest')`))));
await db.exec(`insert into game_progress(owner_id,student_id,game_id) values('${a}','qa-child-a','multiplication-quest');`);
await check('cannot retarget existing progress to other child',()=>as(a,()=>denied(()=>db.query(`update game_progress set student_id='qa-child-b' where student_id='qa-child-a' returning student_id`))));
await check('complete session produces server result',()=>as(a,async()=>{await db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-complete','${a}','qa-child-a',2,'practice',1); insert into question_attempts(session_id,owner_id,student_id,question_uid,a,b,kind,action,response) values('qa-complete','${a}','qa-child-a','q1',2,6,'number','answer','12');`);const r=await db.query(`select finalize_game('qa-complete') result`);assert(r.rows[0].result.score===100,'wrong score');assert((await db.query(`select score from game_results where session_id='qa-complete'`)).rows[0].score===100,'no result')}));
await check('incomplete session rejected',()=>as(a,async()=>{await db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-incomplete','${a}','qa-child-a',2,'practice',2)`);await denied(()=>db.query(`select finalize_game('qa-incomplete')`))}));
await check('numeric leading-zero answer matches browser acceptance',()=>as(a,async()=>{await db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-zero','${a}','qa-child-a',2,'practice',1);insert into question_attempts(session_id,owner_id,student_id,question_uid,a,b,kind,action,response) values('qa-zero','${a}','qa-child-a','q1',2,6,'number','answer','012');`);assert((await db.query(`select correct from question_attempts where session_id='qa-zero'`)).rows[0].correct===true,'browser accepts 012 but database rejects it')}));
await check('revoked game hidden',async()=>{await db.exec(`delete from user_game_permissions where user_id='${a}'`);await as(a,async()=>assert((await db.query('select * from games')).rows.length===0,'game still visible'))});
await check('anon cannot read app users',async()=>{await db.exec('begin;set local role anon;');try{await denied(()=>db.query('select * from app_users'))}finally{await db.exec('rollback')}});
await check('admin confirmation after signup',async()=>{
 await db.exec(`delete from auth.users where id='${admin}'; insert into auth.users values('${admin}','alon.hamzani@gmail.com',null,'{"provider":"google"}','{}');`);
 assert((await db.query(`select status from app_users where id='${admin}'`)).rows[0].status==='pending','expected initial pending');
 await db.exec(`update auth.users set email_confirmed_at=now() where id='${admin}'`);
 assert((await db.query(`select role,status from app_users where id='${admin}'`)).rows[0].role==='super_admin','confirmation did not promote');
});
await db.exec(`insert into user_game_permissions(user_id,game_id) values('${a}','multiplication-quest') on conflict do nothing`);
await check('ordinary cannot read admin audit',()=>as(a,async()=>assert((await db.query('select * from admin_audit')).rows.length===0,'audit exposed')));
await check('ordinary cannot read approval notifications',()=>as(a,()=>denied(()=>db.query('select * from approval_notifications'))));
await check('ordinary cannot write scores',()=>as(a,()=>denied(()=>db.exec(`update game_sessions set score=100`))));
await check('ordinary cannot write result rows',()=>as(a,()=>denied(()=>db.exec(`delete from game_results`))));
await check('ordinary cannot change user status',()=>as(a,()=>denied(()=>db.exec(`update app_users set status='approved'`))));
await check('cross-account profile rename blocked',()=>as(a,async()=>assert((await db.query(`update student_profiles set name='intruder' where id='qa-child-b' returning id`)).rows.length===0,'foreign rename allowed')));
await check('cross-account profile delete blocked',()=>as(a,async()=>assert((await db.query(`delete from student_profiles where id='qa-child-b' returning id`)).rows.length===0,'foreign delete allowed')));
for(const status of ['suspended','rejected']) await check(status+' account cannot read progress',async()=>{await db.exec(`update app_users set status='${status}' where id='${a}'`);await as(a,async()=>assert((await db.query('select * from game_progress')).rows.length===0,'progress exposed'));await db.exec(`update app_users set status='approved' where id='${a}'`)});
await check('finalize idempotent; finished answers blocked',()=>as(a,async()=>{
 await db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-idempotent','${a}','qa-child-a',2,'practice',1);insert into question_attempts(session_id,owner_id,student_id,question_uid,a,b,kind,action,response) values('qa-idempotent','${a}','qa-child-a','q1',2,6,'number','answer','00012')`);
 await db.query(`select finalize_game('qa-idempotent')`);await db.query(`select finalize_game('qa-idempotent')`);
 assert((await db.query(`select * from game_results where session_id='qa-idempotent'`)).rows.length===1,'duplicate result');
 await denied(()=>db.exec(`insert into question_attempts(session_id,owner_id,student_id,question_uid,a,b,kind,action,response) values('qa-idempotent','${a}','qa-child-a','q2',2,6,'number','answer','12')`));
}));
await db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-owner-check','${b}','qa-child-b',2,'practice',1)`);
await check('cannot finalize another owner session',()=>as(a,()=>denied(()=>db.query(`select finalize_game('qa-owner-check')`))));
await check('revocation blocks unfinished session finalization',()=>as(a,async()=>{await db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-revoked','${a}','qa-child-a',2,'practice',1);reset role;delete from user_game_permissions where user_id='${a}';set local role authenticated;`);await denied(()=>db.query(`select finalize_game('qa-revoked')`))}));
await check('question counts constrained',()=>as(a,()=>denied(()=>db.exec(`insert into game_sessions(id,owner_id,student_id,world_id,mode,question_count) values('qa-count','${a}','qa-child-a',2,'practice',0)`))));
for(const name of ['20261030_sync_safety.sql','20261030_admin_summary.sql','20261030_sync_conflict_response.sql']) await check('migration '+name,()=>db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')));
await db.exec(`insert into user_game_permissions(user_id,game_id) values('${a}','multiplication-quest') on conflict do nothing`);
const snapshot={id:'qa-child-a',name:'QA A',avatar:'🦊',xp:10};
const save=(profile,revision)=>db.query('select save_game_profile($1,$2,$3,$4) revision',[profile.id,'multiplication-quest',profile,revision]);
await check('atomic save updates revision and profile together',()=>as(a,async()=>{
 const result=await save({...snapshot,name:'Atomic'},1);assert(Number(result.rows[0].revision)===2,'revision not incremented');
 assert((await db.query(`select name from student_profiles where id='qa-child-a'`)).rows[0].name==='Atomic','identity not saved');
}));
await check('stale device update rejected without overwriting latest',()=>as(a,async()=>{
 await save({...snapshot,xp:20},1);
 await db.exec('savepoint stale');
 let conflict;try{await save({...snapshot,xp:1},1)}catch(error){conflict=error}assert(conflict?.code==='PT409','business conflict must map to HTTP 409');
 await db.exec('rollback to savepoint stale');
 assert((await db.query(`select snapshot->>'xp' xp from game_progress where student_id='qa-child-a'`)).rows[0].xp==='20','stale write won');
}));
await check('existing profile cannot be overwritten as a new profile',()=>as(a,()=>denied(()=>save(snapshot,null))));
await check('foreign child cannot be saved through RPC',()=>as(a,()=>denied(()=>save({...snapshot,id:'qa-child-b'},null))));
await check('pending account cannot save profile',()=>as(pending,()=>denied(()=>save({...snapshot,id:'qa-pending'},null))));
await check('new profile and progress created atomically',()=>as(a,async()=>{
 const result=await save({...snapshot,id:'qa-new-child'},null);assert(Number(result.rows[0].revision)===1,'wrong first revision');
 assert((await db.query(`select id from student_profiles where id='qa-child-b'`)).rows.length===0,'foreign profile exposed');
}));
await check('malformed snapshot rejected',()=>as(a,()=>denied(()=>save({...snapshot,name:''},1))));
await check('legacy direct progress write blocked',()=>as(a,()=>denied(()=>db.exec(`update game_progress set snapshot='{}'`))));
await check('legacy direct child deletion blocked',()=>as(a,()=>denied(()=>db.exec(`delete from student_profiles where id='qa-child-a'`))));
await check('explicit own child deletion cascades progress',()=>as(a,async()=>{
 await db.query(`select delete_student_profile('qa-child-a')`);
 assert((await db.query(`select student_id from game_progress where student_id='qa-child-a'`)).rows.length===0,'progress remains');
}));
await check('explicit deletion cannot target another owner',()=>as(a,()=>denied(()=>db.query(`select delete_student_profile('qa-child-b')`))));
await check('stale browser cannot recreate a deleted profile',()=>as(a,async()=>{
 await db.query(`select delete_student_profile('qa-child-a')`); await denied(()=>save(snapshot,1));
}));
await check('ordinary user cannot read global summary',()=>as(a,()=>denied(()=>db.query('select admin_dashboard_summary()'))));
await check('admin summary covers all data and per-game stats',()=>as(admin,async()=>{
 const summary=(await db.query('select admin_dashboard_summary() summary')).rows[0].summary;
 assert(summary.users===4,'wrong total users');assert(summary.games===1,'wrong game total');
 assert(summary.byGame['multiplication-quest'],'missing per-game totals');
}));
await check('touch_login records timestamp and throttles repeated events',()=>as(a,async()=>{
 await db.query('select touch_login()');await db.query('select touch_login()');
 assert((await db.query(`select last_login_at from app_users where id='${a}'`)).rows[0].last_login_at,'no timestamp');
 assert((await db.query(`select count(*)::int n from activity_events where owner_id='${a}' and event_type='login'`)).rows[0].n===1,'duplicate login event');
}));


// Supabase's server role bypasses RLS, but still needs ordinary SQL privileges.
await db.exec('alter role service_role bypassrls');
const asServer=async fn=>{await db.exec('begin;set local role service_role;');try{return await fn()}finally{await db.exec('rollback')}};
await check('old permission upsert reproduces missing UPDATE privilege',()=>asServer(()=>denied(()=>db.query(`insert into user_game_permissions(user_id,game_id,granted_by) values('${pending}','multiplication-quest','${admin}') on conflict(user_id,game_id) do update set granted_by=excluded.granted_by`))));
await check('server can grant, repeat grant, and revoke using existing privileges',()=>asServer(async()=>{
 const grant=`insert into user_game_permissions(user_id,game_id,granted_by) values('${pending}','multiplication-quest','${admin}') on conflict(user_id,game_id) do nothing`;
 await db.query(grant);await db.query(grant);
 const rows=(await db.query(`select * from user_game_permissions where user_id='${pending}'`)).rows;
 assert(rows.length===1&&rows[0].granted_by===admin,'grant was not idempotent');
 await db.query(`delete from user_game_permissions where user_id='${pending}'`);
 assert((await db.query(`select * from user_game_permissions where user_id='${pending}'`)).rows.length===0,'revoke failed');
 assert(!(await db.query(`select has_table_privilege('service_role','user_game_permissions','UPDATE') allowed`)).rows[0].allowed,'unexpected update privilege');
}));

console.log(JSON.stringify({environment:'isolated PostgreSQL second pass',results},null,2));
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
await db.close();

