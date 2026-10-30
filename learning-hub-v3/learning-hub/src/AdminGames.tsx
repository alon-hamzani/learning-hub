import { useEffect, useState } from 'react';
import { Gamepad2, Plus, Save, ShieldCheck } from 'lucide-react';
import { supabase } from './cloud';
import type { AppUser, CatalogGame, UserGamePermission } from './cloud';
import { moduleInstalled } from './games/registry';

async function callAdminGame(body: Record<string,unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-game-action', { body });
  if (error || data?.error) throw new Error(error?.message || data?.error || 'לא ניתן לבצע את הפעולה');
}
export function UserGamePermissions({ user, games, grants, refresh }: {
  user: AppUser; games: CatalogGame[]; grants: UserGamePermission[]; refresh: () => Promise<void>;
}) {
  const [working, setWorking] = useState<string|null>(null), [error, setError] = useState('');
  async function change(gameId: string, enabled: boolean) {
    setWorking(gameId); setError('');
    try { await callAdminGame({ action:enabled ? 'grant':'revoke', userId:user.id,gameId }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setWorking(null);
  }
  if (user.role === 'super_admin') return <p>למנהל הראשי יש הרשאה אוטומטית לכל המשחקים, כולל משחקים מושבתים לצורך ניהול.</p>;
  return <section>
    <h3><ShieldCheck size={20}/> הרשאות המשחקים של המשתמש</h3>
    <p>אישור החשבון והרשאות המשחקים מנוהלים בנפרד. שינוי נשמר בענן ונאכף ב־API.</p>
    {error && <div className="cloud-error" role="alert">{error}</div>}
    <div className="admin-permission-list">
      {games.map(game => { const checked = grants.some(p => p.user_id===user.id && p.game_id===game.id);
        return <div className="admin-permission" key={game.id}>
          <label><input type="checkbox" checked={checked} disabled={working!==null}
            onChange={event => void change(game.id,event.target.checked)}/>
            <span>{game.icon} <strong>{game.title}</strong> {!game.active && '(מושבת)'}</span>
          </label>
          <small>{checked ? 'גישה הוקצתה':'ללא הרשאה'}</small>
        </div>;
      })}
      {!games.length && <p>אין משחקים רשומים בקטלוג.</p>}
    </div>
  </section>;
}

const blankGame = { id:'', module_key:'', title:'', description:'', icon:'🎮', active:false };
export default function AdminGames({ users, games, grants, refresh }: {
  users: AppUser[]; games:CatalogGame[]; grants:UserGamePermission[]; refresh:()=>Promise<void>;
}) {
  const [editing,setEditing]=useState<CatalogGame|null>(null);
  const [form,setForm]=useState(blankGame);
  const [selected,setSelected]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(() => { if (editing) setForm({id:editing.id,module_key:editing.module_key,title:editing.title,description:editing.description,icon:editing.icon,active:editing.active}); }, [editing]);
  async function save() {
    if (!form.id || !form.module_key || !form.title) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await callAdminGame({ action:'upsert',gameId:form.id,moduleKey:form.module_key,
        title:form.title,description:form.description,icon:form.icon,active:form.active });
      await refresh(); setMessage('פרטי המשחק נשמרו. משחק חדש יפעל לאחר פרסום מודול ה־React שלו.'); setEditing(null);
    } catch(e) { setError(e instanceof Error ? e.message:String(e)); }
    setBusy(false);
  }
  async function changeGrant(gameId:string,userId:string,enabled:boolean) {
    setBusy(true); setError('');
    try { await callAdminGame({action:enabled?'grant':'revoke',gameId,userId}); await refresh(); }
    catch(e) { setError(e instanceof Error ? e.message:String(e)); }
    setBusy(false);
  }
  return <section className="panel admin-section">
    <div className="admin-section-title"><div><Gamepad2 size={22}/><h2>ניהול משחקים</h2></div>
      <button onClick={()=>{setEditing(null);setForm(blankGame);setSelected(null);setMessage('new');}}><Plus size={16}/> רישום משחק חדש</button></div>
    <p>רשימת המודולים, מספר המורשים וסטטוס הפרסום. משחק מושבת לא יוצג למשתמש רגיל גם אם הוקצתה לו הרשאה.</p>
    {error && <div className="cloud-error" role="alert">{error}</div>}
    {message && message!=='new' && <p role="status">{message}</p>}
    <div className="admin-game-list">
      {games.map(g => <div className="admin-game-item" key={g.id}>
        <div className="admin-game-meta"><span className="admin-game-icon">{g.icon}</span><div><strong>{g.title}</strong><div className="admin-game-sub">{g.id} · {g.active ? 'פעיל' : 'מושבת'} · {grants.filter(p=>p.game_id===g.id).length} מורשים · {moduleInstalled(g.module_key) ? 'קוד מותקן' : 'קוד טרם פורסם'}</div></div></div>
        <div className="admin-actions"><button onClick={()=>{setEditing(g);setMessage('');setSelected(null);}}>עריכת פרטים</button>
          <button onClick={()=>setSelected(selected===g.id?null:g.id)}>משתמשים והרשאות</button></div>
      </div>)}
    </div>
    {selected && <div className="admin-game-detail"><h4>הרשאות עבור {games.find(g=>g.id===selected)?.title}</h4>
      <div className="admin-permission-list">{users.filter(u=>u.role!=='super_admin').map(u => {
        const checked = grants.some(p=>p.user_id===u.id && p.game_id===selected);
        return <div className="admin-permission" key={u.id}>
          <label><input type="checkbox" checked={checked} disabled={busy} onChange={e=>void changeGrant(selected,u.id,e.target.checked)}/><span>{u.full_name || u.email} ({u.status})</span></label>
          <small>{checked ? 'מאושר למשחק' : 'לא הוקצה'}</small>
        </div>;
      })}</div>
    </div>}
    {(editing || message==='new') && <div className="admin-game-detail"><h3>{editing ? 'עריכת משחק' : 'רישום משחק נוסף'}</h3>
      <p>חשוב: רישום משחק בקטלוג אינו מעלה קוד אוטומטית. יש להוסיף רכיב React ל־src/games/registry.ts ולפרסם גרסה חדשה. אין להגדיר משחק כפעיל לפני שקוד המודול פורסם.</p>
      <div className="admin-game-editor">
        <label>מזהה המשחק (ID)<input dir="ltr" value={form.id} disabled={!!editing} onChange={e=>setForm({...form,id:e.target.value.toLowerCase().replaceAll(' ','-')})} placeholder="new-game"/></label>
        <label>מזהה מודול React<input dir="ltr" value={form.module_key} disabled={!!editing} onChange={e=>setForm({...form,module_key:e.target.value.toLowerCase().replaceAll(' ','-')})} placeholder="new-game"/></label>
        <label>שם המשחק<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <label>אייקון<input value={form.icon} onChange={e=>setForm({...form,icon:e.target.value})}/></label>
        <label className="wide">תיאור<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <label className="checkline"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> משחק פעיל</label>
        <button onClick={save} disabled={busy || !form.title || !form.id || !form.module_key}><Save size={16}/> שמירת המשחק</button>
      </div>
      <button onClick={()=>{setEditing(null);setMessage('');}}>ביטול</button>
    </div>}
    <p className="admin-footnote">משחקים חדשים דורשים פריסת קוד. הרשאות משחקים נשמרות במסד הנתונים ואינן מעניקות גישה למי שסטטוס החשבון שלו אינו Approved.</p>
  </section>;
}
