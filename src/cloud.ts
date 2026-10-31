import {accountOutbox} from './learning/outbox';
import type {Operation} from './learning/outbox';
import { createClient } from '@supabase/supabase-js';
import { createProfile } from './game';
import type { Profile, Question, QuizMode } from './game';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const cloudReady = Boolean(url && publishableKey);
export const supabase = createClient(url || 'https://not-configured.supabase.co', publishableKey || 'missing-key', {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
export type AccessStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type AppUser = {
  id: string; email: string; full_name: string; avatar_url: string | null;
  role: 'user' | 'super_admin'; status: AccessStatus;
  created_at: string; approved_at: string | null; last_login_at: string | null;
};
export type CatalogGame = {
  id: string; module_key: string; title: string; description: string;
  icon: string; active: boolean; created_at?: string; updated_at?: string;
};
export type UserGamePermission = { user_id: string; game_id: string; granted_at: string };
export async function readCatalog(): Promise<CatalogGame[]> {
  const { data, error } = await supabase.from('games').select('*').order('created_at');
  if (error) throw error;
  return data as CatalogGame[];
}
export type CloudEvent = { sessionId: string; question: Question; action: 'answer' | 'hint' | 'reveal'; response?: string };
export type CloudGameStart = { id: string; studentId: string; worldId: number; mode: QuizMode; count: number; questions?:Question[] };
export interface GameCloud {
  onProfilesChanged: (profiles: Profile[]) => void;
  deleteProfile: (id: string) => Promise<void>;
  resetProfile: (id: string) => Promise<void>;
  onModuleEvent: (studentId: string, eventKind: string, payload?: Record<string,unknown>) => void;
  onSessionStart: (run: CloudGameStart) => void;
  onGameEvent: (event: CloudEvent) => void;
  onSessionComplete: (id: string) => void;
  onActivity: (kind: 'lesson_completed' | 'profile_created' | 'profile_reset' | 'profile_deleted' | 'mini_game', studentId?: string, meta?: Record<string, unknown>) => void;
}
function learningTransport(ownerId:string) { return async(operation:Operation)=>{
    const {data:auth}=await supabase.auth.getSession();
    if(auth.session?.user.id!==ownerId)throw Error('יש להתחבר לחשבון המשפחתי כדי להשלים את השמירה.');
    const {data,error}=await supabase.rpc('sync_learning_operation',{p_operation_id:operation.id,p_kind:operation.kind,p_payload:operation.payload});
    if(error)throw error;return data;
  }; }
export async function resumeLearningWrites(ownerId:string) {
  const box=accountOutbox(ownerId,learningTransport(ownerId),()=>undefined);
  await box.drain();
  if(box.pending())throw Error('יש פעולות שמירה ממתינות במכשיר. יש להשלים את הסנכרון לפני טעינה מחדש.');
}
export function createGameCloud(ownerId:string,gameId:string,onFailure:(message:string)=>void,initialProfiles:Profile[]=[]):GameCloud & {flush:()=>Promise<void>} {
  const transport=learningTransport(ownerId);
  const box=accountOutbox(ownerId,transport,onFailure);
  const revisions=new Map(initialProfiles.map(p=>[p.id,p._revision??null]));
  const content=(p:Profile)=>{const {_revision,...rest}=p;return JSON.stringify(rest);};
  const saved=new Map(initialProfiles.map(p=>[p.id,content(p)]));
  const deleted=new Set<string>();
  const sessionStudents=new Map<string,string>();
  for(const queued of box.snapshots(gameId)) {const snapshot=queued.snapshot as Profile;revisions.set(snapshot.id,Number(queued.revision??0)+1);saved.set(snapshot.id,content(snapshot));}
  const put=(kind:string,payload:Record<string,unknown>)=>{try{return box.enqueue(kind,{...payload,gameId});}catch(error){onFailure(error instanceof Error?error.message:String(error));throw error;}};
  return {
    flush:()=>box.drain(),
    onProfilesChanged(profiles){for(const profile of profiles){if(deleted.has(profile.id)||saved.get(profile.id)===content(profile))continue;const revision=revisions.get(profile.id)??null;put('profile',{snapshot:profile,revision,studentId:profile.id});revisions.set(profile.id,Number(revision??0)+1);saved.set(profile.id,content(profile));}},
    async deleteProfile(id){deleted.add(id);try{await box.drain();if(box.pending())throw Error('יש להשלים סנכרון לפני מחיקה.');const {error}=await supabase.rpc('delete_student_profile',{p_student_id:id});if(error)throw error;saved.delete(id);revisions.delete(id);}catch(error){deleted.delete(id);throw error;}},
    async resetProfile(id){await box.drain();if(box.pending())throw Error('יש להשלים סנכרון לפני איפוס.');const {error}=await supabase.rpc('reset_game_profile',{p_student_id:id,p_game_id:gameId});if(error)throw error;revisions.set(id,(revisions.get(id)??0)+1);saved.delete(id);},
    onModuleEvent(studentId,eventKind,payload){put('module',{studentId,eventKind,payload});},
    onSessionStart(run){sessionStudents.set(run.id,run.studentId);put('run',{run,studentId:run.studentId});},
    onGameEvent(event){put('answer',{studentId:sessionStudents.get(event.sessionId),sessionId:event.sessionId,question:event.question,action:event.action,response:event.response??null});},
    onSessionComplete(id){put('finish',{studentId:sessionStudents.get(id),sessionId:id});},
    onActivity(kind,studentId,meta){put('activity',{kind,studentId,meta:meta??{}});},
  };
}
export async function readStudentProfiles(ownerId: string, gameId: string): Promise<Profile[]> {
  await resumeLearningWrites(ownerId);
  const { data: kids, error: kidError } = await supabase.from('student_profiles')
    .select('id,name,avatar').eq('owner_id',ownerId).order('created_at');
  if (kidError) throw kidError;
  const { data: progress, error: progressError } = await supabase.from('game_progress')
    .select('student_id,snapshot,revision').eq('owner_id',ownerId).eq('game_id',gameId);
  if (progressError) throw progressError;
  const progressByStudent = new Map((progress || []).map(p => [p.student_id, { ...(p.snapshot as Profile), _revision: Number(p.revision) }]));
  return (kids || []).map(kid => ({
    ...(progressByStudent.get(kid.id) || createProfile(kid.name, kid.avatar)),
    id: kid.id, name: kid.name, avatar: kid.avatar,
  }));
}
