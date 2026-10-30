import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, RefreshCw, Search, ShieldAlert, Users } from 'lucide-react';
import { supabase } from './cloud';
import type { CatalogGame, UserGamePermission } from './cloud';
import AdminGames, { UserGamePermissions } from './AdminGames';
import type { AppUser, AccessStatus } from './cloud';

type SessionRow = { id: string; game_id: string; owner_id: string; student_id: string; world_id: number; mode: string; question_count: number; score: number | null; first_correct: number; wrong_answers: number; hints_used: number; started_at: string; finished_at: string | null };
type StudentRow = { id: string; owner_id: string; name: string; avatar: string };
type AttemptRow = { id: string; session_id: string; question_uid: string; a: number; b: number; kind: string; action: string; response: string | null; correct: boolean; created_at: string };
type AuditRow = { id: number; action: string; admin_user_id: string | null; target_user_id: string | null; created_at: string };
type EventRow = { id: number; game_id?: string|null; owner_id: string; student_id: string | null; event_type: string; created_at: string };
const datetime = (value?: string | null) => value ? new Date(value).toLocaleString('he-IL') : '—';
const statusHe: Record<AccessStatus, string> = { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', suspended: 'מושעה' };
function csvDownload(filename: string, columns: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const csv = '\ufeff' + [columns, ...rows].map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
export default function Admin() {
  const [tab, setTab] = useState<'users'|'games'|'analytics'>('users');
  const [games, setGames] = useState<CatalogGame[]>([]), [grants, setGrants] = useState<UserGamePermission[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]), [students, setStudents] = useState<StudentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]), [events, setEvents] = useState<EventRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]), [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null), [session, setSession] = useState<string | null>(null);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [kind, setKind] = useState('all');
  const [gameFilter, setGameFilter] = useState('all');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function refresh() {
    setBusy(true); setError('');
    try {
      const [u, p, s, e, a, g, permissions] = await Promise.all([
        supabase.from('app_users').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('student_profiles').select('id,owner_id,name,avatar').limit(1000),
        supabase.from('game_sessions').select('*').order('started_at', { ascending: false }).limit(1000),
        supabase.from('activity_events').select('id,owner_id,student_id,event_type,created_at').order('created_at', { ascending: false }).limit(1000),
        supabase.from('admin_audit').select('id,action,admin_user_id,target_user_id,created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('games').select('*').order('created_at').limit(1000),
        supabase.from('user_game_permissions').select('*').limit(2000),
      ]);
      for (const r of [u,p,s,e,a,g,permissions]) if (r.error) throw r.error;
      setUsers(u.data as AppUser[]); setStudents(p.data as StudentRow[]); setSessions(s.data as SessionRow[]);
      setEvents(e.data as EventRow[]); setAudits(a.data as AuditRow[]);
      setGames(g.data as CatalogGame[]); setGrants(permissions.data as UserGamePermission[]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!session) { setAttempts([]); return; }
    void supabase.from('question_attempts').select('id,session_id,question_uid,a,b,kind,action,response,correct,created_at')
      .eq('session_id',session).order('created_at').limit(1000).then(({ data, error }) => {
        if (error) setError(error.message); else setAttempts(data as AttemptRow[]);
      });
  }, [session]);
  async function changeStatus(user: AppUser, action: 'approve' | 'reject' | 'suspend' | 'restore' | 'delete') {
    const label = { approve:'לאשר', reject:'לדחות', suspend:'להשעות', restore:'להחזיר גישה', delete:'למחוק לצמיתות' }[action];
    if (!window.confirm(`${label} את ${user.full_name || user.email}?${action === 'delete' ? '\nכל נתוני החשבון והילדים שלו יימחקו לצמיתות!' : ''}`)) return;
    setBusy(true); setError('');
    const { data, error } = await supabase.functions.invoke('admin-action', { body: { targetId: user.id, action } });
    if (error || data?.error) setError(error?.message || data.error);
    else { if (action === 'delete') setSelected(null); await refresh(); }
    setBusy(false);
  }
  const visibleUsers = users.filter(u => (filter === 'all' || u.status === filter) && (`${u.email} ${u.full_name}`.toLowerCase().includes(search.toLowerCase())));
  const selectedUser = users.find(u => u.id === selected);
  const selectedStudents = students.filter(s => s.owner_id === selected);
  const filteredSessions = sessions.filter(s => (!selected || s.owner_id === selected)
    && (kind === 'all' || s.mode === kind)
    && (gameFilter === 'all' || s.game_id === gameFilter)
    && (!from || s.started_at.slice(0, 10) >= from)
    && (!to || s.started_at.slice(0, 10) <= to));
  const finished = sessions.filter(s => s.finished_at && s.score != null);
  const activeCount = (days: number) => new Set(events.filter(e => e.created_at >= new Date(Date.now() - days*86400000).toISOString()).map(e => e.owner_id)).size;
  const average = finished.length ? Math.round(finished.reduce((sum,s) => sum + (s.score || 0),0)/finished.length) : 0;
  const filteredAttempts = useMemo(() => attempts.filter(a => (!from || a.created_at.slice(0,10)>=from) && (!to || a.created_at.slice(0,10)<=to)), [attempts,from,to]);
  return <main className="admin-wrap" dir="rtl">
    <div className="admin-heading"><div><div className="eyebrow">Back Office · Super Admin</div><h1>מרכז הניהול 🛡️</h1><p>משתמשים, הרשאות, תרגולים ובקרה בענן</p></div><button className="secondary" onClick={refresh} disabled={busy}><RefreshCw size={17}/> רענון נתונים</button></div>
    {error && <div className="cloud-error" role="alert">{error}</div>}
    <div className="admin-tabs" role="tablist" aria-label="אזורי ניהול">
      <button role="tab" aria-selected={tab==='users'} onClick={()=>setTab('users')}>👥 משתמשים והרשאות</button>
      <button role="tab" aria-selected={tab==='games'} onClick={()=>setTab('games')}>🎮 ניהול משחקים</button>
      <button role="tab" aria-selected={tab==='analytics'} onClick={()=>setTab('analytics')}>📊 פעילות ונתונים</button>
    </div>
    <div className="admin-kpis">
      {[[String(users.length),'משתמשים'],[String(users.filter(u => u.status==='approved').length),'מאושרים'],[String(users.filter(u => u.status==='pending').length),'ממתינים'],[String(activeCount(7)),'פעילים ב־7 ימים'],[String(activeCount(30)),'פעילים ב־30 ימים'],[String(games.length),'משחקים בקטלוג'],[String(finished.length),'תרגולים שהושלמו'],[`${average}%`,'ממוצע תוצאות']].map(([v,t])=><div key={t} className="admin-kpi"><strong>{v}</strong><span>{t}</span></div>)}
    </div>
    {tab==='games' && <AdminGames users={users} games={games} grants={grants} refresh={refresh}/>}
    {tab==='analytics' && <section className="panel admin-section"><h2>פעילות לפי משחק</h2>
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>משחק</th><th>תרגולים</th><th>משתמשים ששיחקו</th><th>ציון ממוצע</th><th>הרשאות שהוקצו</th></tr></thead><tbody>
        {games.map(g=>{const rows=finished.filter(s=>s.game_id===g.id);const count=rows.length;return <tr key={g.id}>
          <td>{g.icon} {g.title}</td><td>{count}</td><td>{new Set(rows.map(r=>r.owner_id)).size}</td>
          <td>{count ? Math.round(rows.reduce((n,r)=>n+(r.score||0),0)/count)+'%' : '—'}</td>
          <td>{grants.filter(p=>p.game_id===g.id).length}</td>
        </tr>})}</tbody></table></div>
      <h3>פעילות אחרונה</h3><div>{events.slice(0,40).map(e=><p key={e.id}>{datetime(e.created_at)} · {users.find(u=>u.id===e.owner_id)?.full_name || e.owner_id} · {e.game_id ? games.find(g=>g.id===e.game_id)?.title || e.game_id : 'פלטפורמה'} · {e.event_type}</p>)}</div>
    </section>}
    {tab==='users' && (selectedUser ? <section className="panel admin-section">
      <button className="back-link" onClick={() => { setSelected(null); setSession(null); }}><ArrowRight size={16}/> בחזרה לכל המשתמשים</button>
      <h2>{selectedUser.full_name || selectedUser.email}</h2><p dir="ltr">{selectedUser.email}</p>
      <p>סטטוס: <b>{statusHe[selectedUser.status]}</b> · הצטרפות: {datetime(selectedUser.created_at)} · התחברות: {datetime(selectedUser.last_login_at)}</p>
      <div className="admin-actions">
        {selectedUser.role !== 'super_admin' && <>
          {selectedUser.status !== 'approved' && <button onClick={() => changeStatus(selectedUser,'approve')}><CheckCircle2 size={16}/> אישור</button>}
          {selectedUser.status === 'pending' && <button onClick={() => changeStatus(selectedUser,'reject')}>דחייה</button>}
          {selectedUser.status === 'approved' && <button onClick={() => changeStatus(selectedUser,'suspend')}>השעיה</button>}
          {selectedUser.status === 'suspended' && <button onClick={() => changeStatus(selectedUser,'restore')}>החזרת גישה</button>}
          <button className="admin-danger" onClick={() => changeStatus(selectedUser,'delete')}>מחיקת חשבון ונתונים</button>
        </>}
      </div>
      <UserGamePermissions user={selectedUser} games={games} grants={grants} refresh={refresh}/>
      <h3>פרופילי ילדים</h3><div className="admin-students">{selectedStudents.length ? selectedStudents.map(s => <span key={s.id}>{s.avatar} {s.name}</span>) : <span>אין עדיין פרופילים.</span>}</div>
      <h3>היסטוריית משחקים ותרגולים</h3>
      <div className="admin-filters"><label>משחק<select value={gameFilter} onChange={e=>setGameFilter(e.target.value)}><option value="all">כל המשחקים</option>{games.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label><label>מתאריך<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>עד תאריך<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>סוג תרגול<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">הכול</option>{Array.from(new Set(sessions.map(s=>s.mode))).map(k=><option value={k} key={k}>{k}</option>)}</select></label>
        <button onClick={() => csvDownload('sessions.csv',['session','game','student','mode','start','score','first_correct','wrong','hints'],filteredSessions.map(s=>[s.id,s.game_id,students.find(p=>p.id===s.student_id)?.name || '',s.mode,s.started_at,s.score,s.first_correct,s.wrong_answers,s.hints_used]))}><Download size={16}/> ייצוא CSV</button>
      </div>
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>מועד</th><th>משחק</th><th>ילד/ה</th><th>סוג</th><th>שאלות</th><th>ציון</th><th>טעויות</th><th>רמזים</th><th>פירוט</th></tr></thead><tbody>{filteredSessions.map(s=><tr key={s.id}><td>{datetime(s.started_at)}</td><td>{games.find(g=>g.id===s.game_id)?.title || s.game_id}</td><td>{students.find(x=>x.id===s.student_id)?.name || '—'}</td><td>{s.mode}</td><td>{s.question_count}</td><td>{s.score == null ? 'לא הסתיים' : `${s.score}%`}</td><td>{s.wrong_answers}</td><td>{s.hints_used}</td><td><button onClick={()=>setSession(s.id)}>ניסיונות</button></td></tr>)}</tbody></table></div>
      {session && <><h3>ניסיונות בשאלות · {session}</h3><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>זמן</th><th>תרגיל</th><th>פעולה</th><th>תשובה</th><th>נכון?</th></tr></thead><tbody>{filteredAttempts.map(a=><tr key={a.id}><td>{datetime(a.created_at)}</td><td dir="ltr">{a.a} × {a.b}</td><td>{a.action}</td><td>{a.response || '—'}</td><td>{a.action === 'answer' ? a.correct ? '✓' : '✗' : '—'}</td></tr>)}</tbody></table></div><button onClick={()=>csvDownload('attempts.csv',['time','question','action','response','correct'],filteredAttempts.map(a=>[a.created_at,`${a.a}x${a.b}`,a.action,a.response,a.correct]))}><Download size={16}/> ייצוא ניסיונות</button></>}
      <h3>אירועים אחרונים</h3><div>{events.filter(e=>e.owner_id===selected).slice(0,20).map(e=><p key={e.id}>{datetime(e.created_at)} · {e.event_type}</p>)}</div>
    </section> : <section className="panel admin-section">
      <div className="admin-section-title"><div><Users size={20}/><h2>ניהול משתמשים</h2></div><button onClick={()=>csvDownload('users.csv',['name','email','status','joined','last_login','games'],visibleUsers.map(u=>[u.full_name,u.email,u.status,u.created_at,u.last_login_at,sessions.filter(s=>s.owner_id===u.id).length]))}><Download size={16}/> ייצוא CSV</button></div>
      <div className="admin-filters"><label className="admin-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="חיפוש שם או כתובת מייל"/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">כל הסטטוסים</option>{Object.entries(statusHe).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>משתמש</th><th>כתובת מייל</th><th>סטטוס</th><th>נרשם</th><th>התחבר לאחרונה</th><th>תרגולים</th><th>ציון ממוצע</th><th>ניהול</th></tr></thead><tbody>{visibleUsers.map(u=>{const own=sessions.filter(s=>s.owner_id===u.id);const scored=own.filter(s=>s.score!==null);return <tr key={u.id}><td><span className="admin-person">{u.avatar_url ? <img src={u.avatar_url} alt="" referrerPolicy="no-referrer"/> : '👤'} {u.full_name || 'ללא שם'}</span></td><td dir="ltr">{u.email}</td><td><span className={`admin-status ${u.status}`}>{statusHe[u.status]}</span></td><td>{datetime(u.created_at)}</td><td>{datetime(u.last_login_at)}</td><td>{own.length}</td><td>{scored.length ? Math.round(scored.reduce((n,s)=>n+(s.score || 0),0)/scored.length)+'%' : '—'}</td><td><button onClick={()=>setSelected(u.id)}>פרטים וניהול</button></td></tr>;})}</tbody></table></div>
      <p className="admin-footnote">הטבלאות מוגבלות ל־1,000 רשומות לכל קטגוריה בתצוגה זו. למערכת גדולה יש להוסיף עימוד בצד השרת.</p>
    </section>)}
    <section className="panel admin-section"><div className="admin-section-title"><h2><ShieldAlert size={20}/> יומן ניהול (Audit Log)</h2></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>תאריך</th><th>פעולה</th><th>מנהל</th><th>משתמש יעד</th></tr></thead><tbody>{audits.slice(0,30).map(a=><tr key={a.id}><td>{datetime(a.created_at)}</td><td>{a.action}</td><td>{users.find(u=>u.id===a.admin_user_id)?.email || '—'}</td><td>{users.find(u=>u.id===a.target_user_id)?.email || 'נמחק/לא זמין'}</td></tr>)}</tbody></table></div></section>
  </main>;
}
