import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, LogIn, LogOut, RefreshCw, Shield, ShieldAlert, Sparkles } from 'lucide-react';
import LearningHub from './LearningHub';
import { cloudReady, createGameCloud, readCatalog, readStudentProfiles, resumeLearningWrites, supabase } from './cloud';
import type { AppUser, CatalogGame } from './cloud';
import type { Profile } from './game';
import {createSandboxCloud,restoreGodMode,rememberGodMode} from './games/godMode';
import type {GodCapability} from './games/godMode';
import { registeredModules, moduleInstalled,gameTestProfiles,registeredTestModes } from './games/registry';
import './cloud.css';
import './hub.css';
import './learning/learning.css';
import SyncRecovery from './learning/SyncRecovery';
import ParentGate from './learning/ParentGate';
const Admin = lazy(() => import('./Admin'));

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
  const [loadedOwner,setLoadedOwner]=useState<string|null>(null);
  const [loadedGodMode,setLoadedGodMode]=useState<boolean|null>(null);
  const [godMode,setGodMode]=useState(false);
  const [godCapability,setGodCapability]=useState<GodCapability>({allowed:false,session_key:null});
  const [switchingGod,setSwitchingGod]=useState(false);
  const [gameActivity,setGameActivity]=useState(false);
  const [godError,setGodError]=useState('');
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [syncError, setSyncError] = useState('');
  const [pinConfigured,setPinConfigured]=useState<boolean|null>(null);
  const [recovery,setRecovery]=useState(false);
  const [family,setFamily]=useState<Profile[]>([]);
  const reload = useCallback(async () => {
    if (!cloudReady) { setMode('error'); setErrorText('יש להגדיר משתני Supabase ב־README_HUB.md.'); return; }
    try {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user) { setGodMode(false);setGodCapability({allowed:false,session_key:null});setMode('logged_out'); setMe(null); setGames([]); setStudents(null); return; }
      const { error: loginError } = await supabase.rpc('touch_login');
      if (loginError) console.warn('לא ניתן לעדכן את מועד ההתחברות:', loginError.message);
      const { data, error: profileError } = await supabase.from('app_users').select('*').eq('id',auth.user.id).single();
      if (profileError || !data) throw profileError || new Error('פרטי משתמש לא נמצאו');
      const account = data as AppUser;
      setMe(account);
      if (account.status === 'approved') {
        const assigned = await readCatalog();
        setGames(assigned);
        const {data:pinStatus,error:pinError}=await supabase.rpc('parent_pin_status');
        if(pinError)throw pinError;
        setPinConfigured(Boolean(pinStatus?.configured));
        const {data:capability,error:capabilityError}=await supabase.rpc('god_mode_capability');
        const verified:GodCapability=!capabilityError&&capability?.allowed===true&&typeof capability.session_key==='string'
          ?capability:{allowed:false,session_key:null};
        setGodCapability(verified);setGodMode(restoreGodMode(account.id,verified));
        setMode('approved');
      } else {
        setGodMode(false);setGodCapability({allowed:false,session_key:null});setMode(account.status); setGames([]); setStudents(null);
        if (account.status === 'pending') void supabase.functions.invoke('notify-approval').catch(() => undefined);
      }
    } catch (err) { setGodMode(false);setGodCapability({allowed:false,session_key:null});setMode('error'); setErrorText(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => {
    void reload();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void reload(),0); });
    const poll = window.setInterval(() => { void reload(); }, 30000);
    const focus = () => { void reload(); };
    const hashChanged = () => setRouteState(currentRoute());
    window.addEventListener('online',focus);
    window.addEventListener('focus',focus); window.addEventListener('hashchange',hashChanged);
    return () => { window.removeEventListener('online',focus); subscription.unsubscribe(); window.clearInterval(poll); window.removeEventListener('focus',focus); window.removeEventListener('hashchange',hashChanged); };
  }, [reload]);
  const routeGameId = route.startsWith('games/') ? route.slice('games/'.length) : null;
  const selectedGame = games.find(g => g.id === routeGameId && (g.active || me?.role === 'super_admin') && moduleInstalled(g.module_key));
  useEffect(() => {
    if (mode!=='approved'||!me||!selectedGame){setActiveGameId(null);setStudents(null);setLoadedOwner(null);setLoadedGodMode(null);return;}
    if(selectedGame.id===activeGameId&&loadedOwner===me.id&&loadedGodMode===godMode)return;
    let alive=true;setStudents(null);
    const loaded=(profiles:Profile[])=>{if(alive){setStudents(profiles);setActiveGameId(selectedGame.id);setLoadedOwner(me.id);setLoadedGodMode(godMode);}};
    if(godMode)loaded(gameTestProfiles(selectedGame.module_key)??[]);
    else readStudentProfiles(me.id,selectedGame.id).then(loaded).catch(err=>{if(alive){setSyncError(err instanceof Error?err.message:String(err));setRoute('home');}});
    return()=>{alive=false;};
  },[mode,me?.id,selectedGame?.id,activeGameId,loadedOwner,loadedGodMode,godMode]);
  const cloud=useMemo(()=>(me?.status==='approved'&&activeGameId&&students&&loadedOwner===me.id&&loadedGodMode===godMode)
    ?godMode?createSandboxCloud():createGameCloud(me.id,activeGameId,setSyncError,students):null,
    [me?.id,me?.status,activeGameId,students,loadedOwner,loadedGodMode,godMode]);
  useEffect(()=>{
    if(mode!=='approved'||!me||route!=='home')return;
    if(godMode){setFamily(gameTestProfiles('multiplication-quest')??[]);return;}
    let alive=true;void readStudentProfiles(me.id,'multiplication-quest').then(profiles=>{if(alive)setFamily(profiles);}).catch(()=>{if(alive)setFamily([]);});
    return()=>{alive=false;};
  },[mode,me?.id,route,godMode]);
  async function toggleGodMode(){
    if(!me||switchingGod)return;
    if(gameActivity){setGodError('סיימו או צאו מהפעילות הנוכחית לפני החלפת מצב הבדיקה.');return;}
    setSwitchingGod(true);setGodError('');
    try{
      if(godMode){rememberGodMode(me.id,godCapability,false);setStudents(null);setActiveGameId(null);setLoadedGodMode(null);setLoadedOwner(null);setGameActivity(false);setGodMode(false);return;}
      const {data:capability,error}=await supabase.rpc('god_mode_capability');
      if(error||!capability?.allowed||!capability.session_key)throw Error('מצב הבדיקה זמין רק לבעל החשבון המורשה.');
      if(cloud)await cloud.flush();
      await resumeLearningWrites(me.id);
      const next=!godMode;rememberGodMode(me.id,capability,next);setGodCapability(capability);
      setStudents(null);setActiveGameId(null);setLoadedGodMode(null);setLoadedOwner(null);setGameActivity(false);setGodMode(next);
    }catch(error){setGodError(error instanceof Error?error.message:'לא ניתן להחליף מצב כרגע. השלימו את השמירה ונסו שוב.');}
    finally{setSwitchingGod(false);}
  }
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
  async function goAdmin() {
    if (cloud) await cloud.flush();
    setRoute(route === 'admin' ? 'home' : 'admin');
  }
  async function logout() {
    if (cloud) await cloud.flush();
    if(me)rememberGodMode(me.id,godCapability,false);setGodMode(false);setGodCapability({allowed:false,session_key:null});
    setPinConfigured(null);await supabase.auth.signOut(); setMe(null); setMode('logged_out'); setGames([]);
    setStudents(null); setActiveGameId(null); setRoute('home');
  }
  if (mode === 'approved' && me) {
    if(recovery)return <SyncRecovery owner={me.id} onClose={()=>setRecovery(false)}/>;
    if(pinConfigured===null)return <main className="hub-loading">טוענים הגדרות משפחתיות…</main>;
    if(!pinConfigured)return <ParentGate setup onDone={()=>setPinConfigured(true)}/>;
    const admin = me.role === 'super_admin';
    const showAdmin = route === 'admin' && admin;
    const testSupported=selectedGame&&moduleInstalled(selectedGame.module_key)&&Boolean(registeredTestModes[selectedGame.module_key]);
    const Component = selectedGame && moduleInstalled(selectedGame.module_key)
      ? registeredModules[selectedGame.module_key] : null;
    return <div className="cloud-app-shell">
      <div className="cloud-toolbar hub-toolbar" dir="rtl"><button className="hub-brand" onClick={() => void goHome()}><BookOpen size={21}/> מרכז הלמידה</button>
        <div>{godCapability.allowed&&<button type="button" role="switch" aria-checked={godMode} aria-label="God Mode — מצב בדיקה" disabled={switchingGod} onClick={()=>void toggleGodMode()}>{switchingGod?'מחליפים מצב…':godMode?'🧪 God Mode פעיל':'🧪 הפעלת God Mode'}</button>}<span className="hub-username">☁️ {me.full_name || me.email}</span>
          {selectedGame && <button onClick={() => void goHome()}><ArrowRight size={17}/> לכל המשחקים</button>}
          {admin && <button onClick={() => void goAdmin()}><Shield size={16}/> {showAdmin ? 'ספריית המשחקים':'ממשק ניהול'}</button>}
          <button onClick={logout} disabled={switchingGod}><LogOut size={16}/> יציאה</button>
        </div>
      </div>
      {godMode&&<div className="god-mode-banner" role="status"><strong>🧪 God Mode פעיל — נתוני בדיקה בלבד</strong><span>כל התוכן פתוח. נקודות והתקדמות אינן נשמרות בענן.</span></div>}
      {godError&&<div className="cloud-error" role="alert">{godError}<button onClick={()=>setGodError('')}>סגירה</button></div>}
      {syncError && <div className="cloud-error" role="alert">לא ניתן לסנכרן נתונים: {syncError} <button onClick={() => window.location.reload()}>רענון נתונים מהענן</button> <button onClick={()=>setRecovery(true)}>טיפול בשמירה ממתינה</button> <button onClick={() => setSyncError('')}>סגור</button></div>}
      <div inert={switchingGod} aria-busy={switchingGod}><Suspense fallback={<main className="hub-loading" dir="rtl">טוענים…</main>}>
      {showAdmin ? <Admin /> : selectedGame && Component ?
        godMode&&!testSupported?<main className="hub-empty" dir="rtl"><h2>המשחק עדיין אינו תומך במצב בדיקה</h2><p>כבו God Mode כדי להיכנס במצב רגיל.</p></main>:
        activeGameId === selectedGame.id && students && cloud && loadedOwner===me.id && loadedGodMode===godMode ?
          <Component key={`${me.id}:${selectedGame.id}:${godMode?'test':'normal'}`} initialProfiles={students} cloud={cloud} testMode={godMode} onSessionActiveChange={setGameActivity}/>
          : <main className="hub-loading" dir="rtl">טוענים את ההתקדמות האישית…</main>
        : routeGameId ? <main className="hub-empty hub-missing" dir="rtl">
          <ShieldAlert size={33}/><h2>אין גישה למשחק המבוקש</h2>
          <p>ייתכן שההרשאה הוסרה או שהמשחק אינו פעיל.</p>
          <button onClick={() => setRoute('home')}>חזרה לספריית המשחקים</button>
        </main> : <LearningHub profiles={family} games={games} displayName={me.full_name || me.email} isAdmin={admin}
          openGame={g => setRoute(`games/${g.id}`)}/>}
      </Suspense></div>
    </div>;
  }
  return <main className="cloud-auth" dir="rtl"><section className="cloud-auth-card">
    <div className="cloud-auth-icon">{mode === 'pending' ? '⏳' : mode === 'suspended' || mode === 'rejected' ? '🔒':'📚'}</div>
    <h1>{mode==='logged_out'?'ברוכים הבאים למרכז המשחקים והלמידה':'מרכז המשחקים והלמידה'}</h1>
    {mode === 'loading' && <p>בודקים התחברות והרשאות…</p>}
    {mode === 'logged_out' && <><p>בואו לגלות עולם קסום של למידה, משחקים ואתגרים! לומדים, מתרגלים, צוברים ידע ומשתפרים בכל שלב – כי הדרך להיות הכי טובים מתחילה בליהנות מהדרך! 🚀✨</p><button className="cloud-primary" onClick={login} disabled={busy}><LogIn size={20}/> התחברות באמצעות Google</button></>}
    {mode === 'pending' && <><h2>הבקשה התקבלה!</h2><p>{me?.full_name || me?.email}, החשבון ממתין לאישור מנהל המערכת.</p><button onClick={() => void reload()}><RefreshCw size={16}/> בדיקה חוזרת</button><button onClick={logout}>יציאה</button></>}
    {mode === 'rejected' && <><ShieldAlert/><p>בקשת הגישה נדחתה. אפשר לפנות ל<a href="mailto:alon.hamzani@gmail.com">מנהל הפלטפורמה</a>.</p><button onClick={logout}>יציאה</button></>}
    {mode === 'suspended' && <><ShieldAlert/><p>הגישה לחשבון הושעתה. פנו ל<a href="mailto:alon.hamzani@gmail.com">מנהל הפלטפורמה</a>.</p><button onClick={logout}>יציאה</button></>}
    {mode === 'error' && <><p>לא ניתן לטעון את החשבון כרגע.</p><button onClick={() => void reload()}>ניסיון נוסף</button></>}
    {errorText && <p className="cloud-error" role="alert">{errorText}</p>}
    <small><Sparkles size={14}/> תכנים לימודיים לילדים · ההורה מתחבר באמצעות חשבונו</small>
    <footer className="brand-footer">© 2026 מגה טק – עולם של למידה ומשחק | תכנים לימודיים אינטראקטיביים לילדים. כל הזכויות שמורות.<br/><a href="mailto:alon.hamzani@gmail.com">צור קשר</a></footer>
  </section></main>;
}
