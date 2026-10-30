const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
Deno.serve(async req => {
  if (req.method !== 'POST') return reply(405,{error:'POST required'});
  const tokens = [req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '', req.headers.get('apikey') || ''];
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const keys = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')).filter(v => typeof v === 'string');
  if (!tokens.some(token => token && (token === legacy || keys.includes(token)))) return reply(403,{error:'Server administrator authentication required'});
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return reply(503,{error:'Mail configuration missing'});
  const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'learning-hub-mail-verification-20261030'},body:JSON.stringify({from,to:['alon.hamzani@gmail.com'],subject:'Learning Hub — בדיקת שליחת דוא״ל',text:'זוהי הודעת בדיקה של Learning Hub. אם ההודעה הגיעה, חיבור ספק הדוא״ל פועל. אין צורך להשיב.'})});
  const data = await response.json();
  return response.ok ? reply(200,{sent:true,email_id:data.id}) : reply(response.status,{sent:false,error:data.message||data.name||'Email provider rejected request'});
});