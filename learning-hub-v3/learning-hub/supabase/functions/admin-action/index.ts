import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (code: number, body: unknown) => new Response(JSON.stringify(body), {
  status: code, headers: { ...headers, 'Content-Type': 'application/json' },
});
type Action = 'approve' | 'reject' | 'suspend' | 'restore' | 'delete';
const transitions: Record<Exclude<Action,'delete'>, { from: string[]; to: string }> = {
  approve: { from: ['pending','rejected','suspended'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  suspend: { from: ['approved'], to: 'suspended' },
  restore: { from: ['suspended'], to: 'approved' },
};
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return response(405,{error:'Method not allowed'});
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'') || '';
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret) return response(500, { error: 'Supabase server secret unavailable' });
    const server = createClient(Deno.env.get('SUPABASE_URL')!, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: auth, error: authError } = await server.auth.getUser(token);
    if (authError || !auth.user) return response(401,{error:'Unauthorized'});
    const { data: me } = await server.from('app_users').select('email,role,status').eq('id',auth.user.id).single();
    if (me?.email !== 'alon.hamzani@gmail.com' || me.role !== 'super_admin' || me.status !== 'approved') return response(403,{error:'Admin access only'});
    const body = await req.json().catch(() => ({}));
    const action: Action = body.action;
    const targetId: string = body.targetId;
    if (!['approve','reject','suspend','restore','delete'].includes(action) || typeof targetId !== 'string' || !/^[a-f0-9-]{36}$/i.test(targetId)) return response(400,{error:'Invalid action or target'});
    const { data: target } = await server.from('app_users').select('id,email,role,status').eq('id',targetId).single();
    if (!target) return response(404,{error:'User not found'});
    if (target.role==='super_admin' || targetId === auth.user.id) return response(403,{error:'Cannot modify administrator'});
    if (action === 'delete') {
      // Audited BEFORE cascade deletion; audit target reference becomes null afterwards.
      const { error: auditErr } = await server.from('admin_audit').insert({admin_user_id:auth.user.id,target_user_id:targetId,action:'delete_user',metadata:{deletion_requested:true}});
      if (auditErr) throw auditErr;
      const { error: deleteErr } = await server.auth.admin.deleteUser(targetId);
      if (deleteErr) throw deleteErr;
    } else {
      const rule = transitions[action];
      if (!rule.from.includes(target.status)) return response(409,{error:`Cannot ${action} from ${target.status}`});
      const { data: changed, error: updateErr } = await server.from('app_users')
        .update({status:rule.to,approved_at:rule.to==='approved'? new Date().toISOString():null})
        .eq('id',targetId).eq('status',target.status).select('id').single();
      if (updateErr || !changed) return response(409,{error:updateErr?.message || 'Concurrent change'});
      const { error: auditErr } = await server.from('admin_audit').insert({admin_user_id:auth.user.id,target_user_id:targetId,action,metadata:{from:target.status,to:rule.to}});
      if (auditErr) throw auditErr;
    }
    return response(200,{ok:true});
  } catch (e) { return response(500,{error:e instanceof Error ? e.message : 'Server error'}); }
});
