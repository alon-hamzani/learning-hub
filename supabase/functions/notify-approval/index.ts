import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (code: number, body: unknown) => new Response(JSON.stringify(body), {
  status: code, headers: { ...headers, 'Content-Type': 'application/json' },
});
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return response(405, { error: 'Method not allowed' });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret) return response(500, { error: 'Supabase server secret unavailable' });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return response(401, { error: 'Unauthorized' });
    const { data: account, error } = await admin.from('app_users').select('id,email,full_name,status,created_at')
      .eq('id',auth.user.id).single();
    if (error || !account) return response(404, { error: 'Account not found' });
    if (account.status !== 'pending') return response(200, { notified: false, reason: 'Not pending' });
    // Unique record reserves this request; repeated visits cannot send duplicate notifications.
    const { error: reserved } = await admin.from('approval_notifications').insert({ user_id: account.id });
    if (reserved) {
      if (reserved.code === '23505') return response(200, { notified: false, reason: 'Already requested' });
      throw reserved;
    }
    const key = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!key || !from) {
      await admin.from('approval_notifications').delete().eq('user_id',account.id);
      return response(503,{error:'Email provider not configured'});
    }
    const name = String(account.full_name || 'לא צוין').slice(0,120);
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: ['alon.hamzani@gmail.com'], subject: 'בקשת הצטרפות חדשה · מסע הכפל שלי',
        text: `בקשת הצטרפות חדשה למשחק\n\nשם: ${name}\nמייל: ${account.email}\nנרשם בתאריך: ${account.created_at}\n\nכדי לאשר או לדחות היכנס לממשק הניהול של המשחק.`,
      }),
    });
    if (!emailResponse.ok) {
      const reason = await emailResponse.text();
      await admin.from('approval_notifications').delete().eq('user_id',account.id);
      return response(502,{error:'Email delivery failed',details:reason.slice(0,250)});
    }
    await admin.from('approval_notifications').update({ sent_at: new Date().toISOString() }).eq('user_id',account.id);
    return response(200,{notified:true});
  } catch (e) { return response(500,{error:e instanceof Error ? e.message : 'Server error'}); }
});
