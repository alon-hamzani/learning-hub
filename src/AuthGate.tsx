import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, LogIn, LogOut, RefreshCw, Shield, ShieldAlert, Sparkles } from 'lucide-react';
import Admin from './Admin';
import LearningHub from './LearningHub';
import { cloudReady, createGameCloud, readCatalog, readStudentProfiles, supabase } from './cloud';
import type { AppUser, CatalogGame } from './cloud';
import type { Profile } from './game';
import { registeredModules, moduleInstalled } from './games/registry';
import './cloud.css';
import './hub.css';

type AuthMode = 'loading'|'logged_out'|'pending'|'rejected'|'suspended'|'approved'|'error';
const currentRoute = () => window.location.hash.replace(/^#\/?/,'') || 'home';
const setRoute = (route: string) => { window.location.hash = `#/${route}`; };

export default function AuthGate() {
  const [mode, setMode] = useState<AuthMode>('loading');
  const [me, setMe] = useState<AppUser|null>(null);
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [route, setRouteState] = useState(currentRoute);
  const [students, setStudents] = useState<Profile[]|null>(null);
  const [activeGameId, setActiveGameId] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [syncError, setSyncError] = useState('');
  const reload = useCallback(async () => {
    if (!cloudReady) { setMode('error'); setErrorText('יש להגדיר משתני Supabase ב־README_HUB.md.'); return; }
    try {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user) { setMode('logged_out'); setMe(null); setGames([]); setStudents(null); return; }
      void supabase.rpc('touch_login');
      const { data, error: profileError } = await supabase.from('app_users').select('*').eq('id',auth.user.id).single();
      if (profileError || !data) throw profileError || new Error('פרטי משתמש לא נמצאו');
      const account = data as AppUser;
      setMe(account);
      if (account.status === 'approved') {
        const assigned = await readCatalog();
        setGames(assigned);
        setMode('approved');
      } else {
        setMode(account.status); setGames([]); setStudents(null);
        if (account.status === 'pending') void supabase.functions.invoke('notify-approval').catch(() => undefined);
      }
    } catch (err) { setMode('error'); setErrorText(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => {
    void reload();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void reload(),0); });
    const poll = window.setInterval(() => { void reload(); }, 30000);
    const focus = () => { void reload(); };
    const hashChanged = () => setRouteState(currentRoute());
    window.addEventListener('focus',focus); window.addEventListener('hashchange',hashChanged);
    return () => { subscription.unsubscribe(); window.clearInterval(poll); window.removeEventListener('focus',focus); window.removeEventListener('hashchange',hashChanged); };
  }, [reload]);
  const routeGameId = route.startsWith('games/') ? route.slice('games/'.length) : null;
  const selectedGame = games.find(g => g.id === routeGameId && (g.active || me?.role === 'super_admin') && moduleInstalled(g.module_key));
  useEffect(() => {
    if (mode !== 'approved' || !me || !selectedGame) { setActiveGameId(null); setStudents(null); return; }
    if (selectedGame.id === activeGameId) return;
    let alive = true;
    setStudents(null);
    readStudentProfiles(me.id,selectedGame.id).then(profiles => {
      if (alive) { setStudents(profiles); setActiveGameId(selectedGame.id); }
    }).catch(err => { if (alive) { setSyncError(err instanceof Error ? err.message : String(err)); setRoute('home'); } });
    return () => { alive = false; };
  }, [mode, me?.id, selectedGame?.id, activeGameId]);
  const cloud = useMemo(() => (me?.status === 'approved' && activeGameId)
    ? createGameCloud(me.id, activeGameId, setSyncError) : null, [me?.id, me?.status, activeGameId]);
  async function login() {
    setBusy(true); setErrorText('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider:'google', options:{ redirectTo:window.location.href.split('#')[0].split('?')[0] },
    });
    if (error) { setErrorText(error.message); setBusy(false); }
  }
  async function goHome() {
    if (cloud) await cloud.flush();
    setRoute('home');
  }
  async function logout() {
    if (cloud) await cloud.flush();
    await supabase.auth.signOut(); setMe(null); setMode('logged_out'); setGames([]);
    setStudents(null); setActiveGameId(null); setRoute('home');
  }
  if (mode === 'approved' && me) {
    const admin = me.role === 'super_admin';
    const showAdmin = route === 'admin' && admin;
    const Component = selectedGame && moduleInstalled(selectedGame.module_key)
      ? registeredModules[selectedGame.module_key] : null;
    return <div className="cloud-app-shell">
      <div className="cloud-toolbar hub-toolbar" dir="rtl"><button className="hub-brand" onClick={() => void goHome()}><BookOpen size={21}/> מרכז הלמידה</button>
        <div><span className="hub-username">☁️ {me.full_name || me.email}</span>
          {selectedGame && <button onClick={() => void goHome()}><ArrowRight size={17}/> לכל המשחקים</button>}
          {admin && <button onClick={() => setRoute(showAdmin ? 'home':'admin')}><Shield size={16}/> {showAdmin ? 'ספריית המשחקים':'ממשק ניהול'}</button>}
          <button onClick={logout}><LogOut size={16}/> יציאה</button>
        </div>
      </div>
      {syncError && <div className="cloud-error" role="alert">לא ניתן לסנכרן נתונים: {syncError} <button onClick={() => setSyncError('')}>סגור</button></div>}
      {showAdmin ? <Admin /> : selectedGame && Component ?
        activeGameId === selectedGame.id && students && cloud ?
          <Component key={`${me.id}:${selectedGame.id}`} initialProfiles={students} cloud={cloud}/>
          : <main className="hub-loading" dir="rtl">טוענים את ההתקדמות האישית…</main>
        : routeGameId ? <main className="hub-empty hub-missing" dir="rtl">
          <ShieldAlert size={33}/><h2>אין גישה למשחק המבוקש</h2>
          <p>ייתכן שההרשאה הוסרה או שהמשחק אינו פעיל.</p>
          <button onClick={() => setRoute('home')}>חזרה לספריית המשחקים</button>
        </main> : <LearningHub games={games} displayName={me.full_name || me.email} isAdmin={admin}
          openGame={g => setRoute(`games/${g.id}`)}/>}
    </div>;
  }
  return <main className="cloud-auth" dir="rtl"><section className="cloud-auth-card">
    <div className="cloud-auth-icon">{mode === 'pending' ? '⏳' : mode === 'suspended' || mode === 'rejected' ? '🔒':'🌟'}</div>
    <h1>מרכז המשחקים והלמידה</h1>
    {mode === 'loading' && <p>בודקים התחברות והרשאות…</p>}
    {mode === 'logged_out' && <><p>משחקים, אתגרים ותרגול אישי – עם שמירה בענן. הכניסה באמצעות Google ובאישור מנהל הפלטפורמה.</p><button className="cloud-primary" onClick={login} disabled={busy}><LogIn size={20}/> התחברות באמצעות Google</button></>}
    {mode === 'pending' && <><h2>הבקשה התקבלה!</h2><p>{me?.full_name || me?.email}, החשבון ממתין לאישור מנהל המערכת.</p><button onClick={() => void reload()}><RefreshCw size={16}/> בדיקה חוזרת</button><button onClick={logout}>יציאה</button></>}
    {mode === 'rejected' && <><ShieldAlert/><p>בקשת הגישה נדחתה. אפשר לפנות למנהל הפלטפורמה.</p><button onClick={logout}>יציאה</button></>}
    {mode === 'suspended' && <><ShieldAlert/><p>הגישה לחשבון הושעתה. פנו למנהל הפלטפורמה.</p><button onClick={logout}>יציאה</button></>}
    {mode === 'error' && <><p>לא ניתן לטעון את החשבון כרגע.</p><button onClick={() => void reload()}>ניסיון נוסף</button></>}
    {errorText && <p className="cloud-error" role="alert">{errorText}</p>}
    <small><Sparkles size={14}/> תכנים לימודיים לילדים · ההורה מתחבר באמצעות חשבונו</small>
  </section></main>;
}
