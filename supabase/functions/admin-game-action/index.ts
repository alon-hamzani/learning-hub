import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const slug = (s: unknown) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{2,60}$/.test(s);
const uuid = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret) return json(500, { error: 'Server secret missing' });
    const server = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await server.auth.getUser(token);
    if (authError || !auth.user) return json(401, { error: 'Login required' });
    const { data: admin } = await server.from('app_users').select('email,role,status').eq('id', auth.user.id).single();
    if (admin?.email !== 'alon.hamzani@gmail.com' || admin.role !== 'super_admin' || admin.status !== 'approved')
      return json(403, { error: 'Administrator only' });
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const gameId = body.gameId;
    if (!slug(gameId)) return json(400, { error: 'Invalid game ID' });
    const { data: game } = await server.from('games').select('id,module_key').eq('id',gameId).maybeSingle();
    if (action === 'grant' || action === 'revoke') {
      if (!uuid(body.userId) || !game) return json(400, { error: 'Invalid user or game' });
      const { data: user } = await server.from('app_users').select('id,status,role').eq('id',body.userId).maybeSingle();
      if (!user || user.role === 'super_admin') return json(400, { error: 'User not eligible' });
      // Assignment is allowed even while Pending. Status still gates platform access.
      const result = action === 'grant'
        ? await server.from('user_game_permissions').upsert({ user_id: user.id, game_id: gameId, granted_by: auth.user.id }, { onConflict: 'user_id,game_id' })
        : await server.from('user_game_permissions').delete().eq('user_id',user.id).eq('game_id',gameId);
      if (result.error) throw result.error;
      const { error: auditError } = await server.from('admin_audit').insert({
        admin_user_id: auth.user.id, target_user_id: user.id,
        action: action + '_game', metadata: { game_id: gameId },
      });
      if (auditError) throw auditError;
    } else if (action === 'upsert') {
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const icon = String(body.icon || '🎮').trim();
      const moduleKey = String(body.moduleKey || gameId);
      const active = body.active === true;
      if (!slug(moduleKey) || title.length < 2 || title.length > 90 || description.length > 380 || icon.length > 24)
        return json(400, { error: 'Invalid game metadata' });
      // module_key must map to a real React component deployed in src/games/registry.ts.
      const result = game
        ? await server.from('games').update({ title,description,icon,active }).eq('id',gameId)
        : await server.from('games').insert({ id:gameId,module_key:moduleKey,title,description,icon,active });
      if (result.error) throw result.error;
      const { error: auditError } = await server.from('admin_audit').insert({
        admin_user_id:auth.user.id,action:game ? 'update_game':'create_game', metadata: { game_id:gameId, title, active },
      });
      if (auditError) throw auditError;
    } else return json(400, { error: 'Unknown action' });
    return json(200, { ok:true });
  } catch (e) {
    return json(500, { error:e instanceof Error ? e.message : 'Server error' });
  }
});
