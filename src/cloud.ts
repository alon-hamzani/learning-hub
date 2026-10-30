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
export type CloudGameStart = { id: string; studentId: string; worldId: number; mode: QuizMode; count: number };
export interface GameCloud {
  onProfilesChanged: (profiles: Profile[]) => void;
  deleteProfile: (id: string) => Promise<void>;
  onModuleEvent: (studentId: string, eventKind: string, payload?: Record<string,unknown>) => void;
  onSessionStart: (run: CloudGameStart) => void;
  onGameEvent: (event: CloudEvent) => void;
  onSessionComplete: (id: string) => void;
  onActivity: (kind: 'lesson_completed' | 'profile_created' | 'profile_reset' | 'profile_deleted' | 'mini_game', studentId?: string, meta?: Record<string, unknown>) => void;
}
export function createGameCloud(ownerId: string, gameId: string, onFailure: (message: string) => void, initialProfiles: Profile[] = []): GameCloud & { flush: () => Promise<void> } {
  let chain = Promise.resolve();
  // Ordered writes: session creation precedes answers; answers precede finalization.
  const append = (job: () => Promise<void>) => {
    chain = chain.catch(() => undefined).then(async () => {
      try { await job(); } catch (err) { onFailure(err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)); }
    });
  };
  const content = (p: Profile) => { const { _revision, ...snapshot } = p; return JSON.stringify(snapshot); };
  const revisions = new Map(initialProfiles.map(p => [p.id, p._revision ?? null]));
  const saved = new Map(initialProfiles.map(p => [p.id, content(p)]));
  const conflicted = new Set<string>();
  let latestRequest = '';
  const api: GameCloud & { flush: () => Promise<void> } = {
    flush: () => chain,
    onProfilesChanged(profiles) {
      const current = JSON.stringify(profiles);
      if (current === latestRequest) return;
      latestRequest = current;
      // Freeze the request, so later mutations cannot alter an already queued save.
      const requested = profiles.map(p => JSON.parse(content(p)) as Profile);
      append(async () => {
        try {
          for (const p of requested) {
            if (saved.get(p.id) === content(p)) continue;
            if (conflicted.has(p.id)) throw new Error('ההתקדמות השתנתה במכשיר אחר. יש לרענן את הדף לפני שממשיכים.');
            const { data, error } = await supabase.rpc('save_game_profile', {
              p_student_id: p.id, p_game_id: gameId, p_snapshot: p,
              p_expected_revision: revisions.get(p.id) ?? null,
            });
            if (error) {
              if (error.code === '40001') {
                conflicted.add(p.id);
                throw new Error('ההתקדמות השתנתה במכשיר אחר. יש לרענן את הדף לפני שממשיכים.');
              }
              throw error;
            }
            revisions.set(p.id, Number(data)); saved.set(p.id, content(p));
          }
        } catch (error) {
          if (latestRequest === current) latestRequest = '';
          throw error;
        }
      });
    },
    async deleteProfile(id) {
      let failure: unknown;
      append(async () => {
        const { error } = await supabase.rpc('delete_student_profile', { p_student_id: id });
        if (error) { failure = error; throw error; }
        saved.delete(id); revisions.delete(id); conflicted.delete(id); latestRequest = '';
      });
      await chain;
      if (failure) throw failure;
    },
    onModuleEvent(studentId,eventKind,payload) {
      append(async () => {
        const { error } = await supabase.from('game_events').insert({
          owner_id:ownerId, student_id:studentId, game_id:gameId,
          event_kind:eventKind.slice(0,70), payload:payload||{},
        });
        if (error) throw error;
      });
    },
    onSessionStart(run) {
      append(async () => {
        const { error } = await supabase.from('game_sessions').insert({
          id: run.id, owner_id: ownerId, student_id: run.studentId, world_id: run.worldId,
          mode: run.mode, question_count: run.count, game_id: gameId,
        });
        if (error) throw error;
      });
    },
    onGameEvent(event) {
      append(async () => {
        const q = event.question;
        const missing_side = q.type === 'missing' ? (q.prompt.trim().startsWith('?') ? 'left' : 'right') : null;
        // Derive the correct answer inside PostgreSQL (generated column), not in the client.
        const { error } = await supabase.from('question_attempts').insert({
          session_id: event.sessionId, owner_id: ownerId,
          student_id: currentStudentBySession.get(event.sessionId),
          question_uid: q.uid, a: q.a, b: q.b, kind: q.type, shown_result: q.shownResult ?? null,
          missing_side, action: event.action, response: event.response ?? null,
        });
        if (error) throw error;
      });
    },
    onSessionComplete(sessionId) {
      append(async () => {
        const { error } = await supabase.rpc('finalize_game', { p_session_id: sessionId });
        if (error) throw error;
        currentStudentBySession.delete(sessionId);
      });
    },
    onActivity(kind, studentId, meta) {
      append(async () => {
        const { error } = await supabase.from('activity_events').insert({
          owner_id: ownerId, student_id: studentId ?? null, event_type: kind, game_id: gameId, payload: meta || {},
        });
        if (error) throw error;
      });
    },
  };
  const start = api.onSessionStart;
  api.onSessionStart = (run) => { currentStudentBySession.set(run.id, run.studentId); start(run); };
  return api;
}
const currentStudentBySession = new Map<string, string>();
export async function readStudentProfiles(ownerId: string, gameId: string): Promise<Profile[]> {
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
