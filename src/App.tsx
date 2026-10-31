import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, CircleHelp, Delete, Home, LockKeyhole, Menu, Play, Plus, Printer, RotateCcw, Settings, ShieldCheck, Sparkles, Star, Target, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import {
  AVATARS, BADGES, WORLDS, badgesFor, createProfile, currentWorldIndex, dayKey, firstHitCount,
  formatNumber, makeQuestion, makeQuiz, masteryCount, ordinaryCompletedCount, pairKey, percent,
  recordSkill, shuffle, skillLevel, totalAttempts, worldCompleted, worldIsUnlocked, canOpenWorld, canStartQuiz,
} from './game';
import type { Profile, Question, QuizMode, World } from './game';
import type { GameCloud, CloudEvent } from './cloud';
import BonusAdventure,{BONUS_GAMES} from './learning/BonusAdventure';
import type {BonusKind,MiniInteraction} from './learning/BonusAdventure';
import SyncStatus from './learning/SyncStatus';
import ParentGate from './learning/ParentGate';
import Activity from './learning/Activity';
import Lesson from './learning/ChapterLesson';
import MultiplicationBoard from './learning/MultiplicationBoard';
import {sound, speakHebrew, stopAudio} from './learning/audio';
import './learning/learning.css';

type Page = 'home' | 'map' | 'world' | 'lesson' | 'quiz' | 'games' | 'progress' | 'parents' | 'profiles' | 'table';
type Session = { runId: string; worldId: number; mode: QuizMode; table?: number; questions: Question[] };
const byId = (id: number) => WORLDS.find(w => w.id === id) || WORLDS[0];
const getWorldIndex = (id: number) => WORLDS.findIndex(w => w.id === id);
const levelLabel = { unseen: 'עוד לא למדנו', needs: 'צריך לחזק', learning: 'בדרך לשליטה', mastered: 'שולט היטב' };
const exerciseStageTitle: Record<QuizMode, string> = {
  guided: 'מתרגלים יחד', practice: 'תרגול עצמאי', checkpoint: 'מבחן העולם', daily: 'האתגר היומי',
  mixed: 'מסע בין הכפולות', focused: 'חיזוק אישי', rocket: 'מרוץ החלל', tower: 'מגדל הכפל', treasure: 'צייד האוצרות',
};
function playBeep(success: boolean, enabled: boolean) { sound(success?'correct':'wrong',enabled); }
function App({ initialProfiles, cloud }: { initialProfiles: Profile[]; cloud: GameCloud }) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [activeId, setActiveId] = useState(() => {
    try {
      const previous = localStorage.getItem('learning-hub:active-profile');
      if (initialProfiles.some(p => p.id === previous)) return previous!;
    } catch { /* Profile selection is optional on devices that block storage. */ }
    return initialProfiles[0]?.id || '';
  });
  const [page, setPage] = useState<Page>('home');
  const [worldId, setWorldId] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [createName, setCreateName] = useState('');
  const [createAvatar, setCreateAvatar] = useState(AVATARS[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusMode,setFocusMode]=useState(false);
  const [notice, setNotice] = useState('');
  const [parentAction,setParentAction]=useState<null|(()=>void)>(null);
  const active = profiles.find(p => p.id === activeId) ?? null;
  useEffect(() => { cloud.onProfilesChanged(profiles); }, [profiles, cloud]);
  useEffect(() => { try { localStorage.setItem('learning-hub:active-profile', activeId); } catch { /* optional */ } }, [activeId]);
  useEffect(()=>{if(page!=='parents')return;const timeout=setTimeout(()=>setPage('home'),5*60*1000);return()=>clearTimeout(timeout);},[page]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timeout); }, [notice]);
  const updateActive = (fn: (p: Profile) => Profile) => setProfiles(ps => ps.map(p => {
    if (p.id !== activeId) return p;
    const updated = fn(p);
    return { ...updated, earnedBadges: Array.from(new Set([...(updated.earnedBadges || []), ...badgesFor(updated)])) };
  }));
  function createKid(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    const p = createProfile(createName, createAvatar);
    cloud.onProfilesChanged([...profiles, p]); cloud.onActivity('profile_created', p.id);
    setProfiles(prev => [...prev, p]); setActiveId(p.id); setCreateName(''); setPage('home');
    setNotice(`איזה כיף, ${p.name}! המסע שלך מתחיל עכשיו 🌟`);
  }
  function navigate(p: Page) { stopAudio(); if(p==='parents'){setParentAction(()=>()=>setPage('parents'));return;} setPage(p); setMenuOpen(false); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth' }); }
  function checkWorld(id: number) {
    if (active && canOpenWorld(active, id)) return true;
    setNotice('העולם הזה עדיין נעול. משלימים קודם את העולמות הקודמים.'); return false;
  }
  function openWorld(id: number) { if (checkWorld(id)) { setWorldId(id); navigate('world'); } }
  function startLesson(id: number) { if (checkWorld(id)) { setWorldId(id); navigate('lesson'); } }
  function startQuiz(mode: QuizMode, id: number, table?: number, fact?:number) {
    if (!active) return;
    if (!checkWorld(id)) return;
    if (!canStartQuiz(active, id, mode)) { setNotice('משלימים קודם את השלב הקודם בעולם הזה.'); return; }
    const runId = crypto.randomUUID();
    const questions = makeQuiz(id, mode, active, table, fact);
    cloud.onSessionStart({ id: runId, studentId: active.id, worldId: id, mode, count: questions.length, questions });
    setWorldId(id); setSession({ runId, worldId: id, mode, table, questions }); navigate('quiz');
  }
  function completeLesson(id: number) {
    updateActive(p => {
      if (p.progress[id]?.lesson) return p;
      return { ...p, xp: p.xp + 30, progress: { ...p.progress, [id]: { ...p.progress[id], lesson: true } } };
    });
    if(active&&!active.progress[id]?.lesson)sound('reward',active.sound);
    cloud.onActivity('lesson_completed', activeId, { worldId: id });
    setNotice('סיימת את השיעור! קיבלת 30 כוכבים ⭐'); navigate('world');
  }
  function recordAnswer(q: Question, firstTry: boolean, points: number, resolved: boolean) {
    updateActive(p => ({ ...(q.activity==='memory'?p:recordSkill(p, q, firstTry, resolved)), xp: p.xp + points }));
  }
  const miniEvent:MiniInteraction=(q,action,response)=>cloud.onModuleEvent(activeId,'mini_interaction',{question:q,action,response:response??null});
  function completeQuiz(mode: QuizMode, id: number, first: number, total: number) {
    if (session) cloud.onSessionComplete(session.runId);
    const threshold = id === 99 ? 90 : 85;
    const passed = percent(first, total) >= threshold;
    if(active)sound(passed?'complete':'tap',active.sound);
    updateActive(p => {
      const next = { ...p, activity: [{ when: Date.now(), worldId: id, correct: first, total, label: exerciseStageTitle[mode] }, ...p.activity].slice(0, 120) };
      if (mode === 'daily') return { ...next, dailyDate: dayKey() };
      if (mode === 'guided' || mode === 'practice') {
        const wasCompleted = Boolean(p.progress[id]?.[mode]);
        return { ...next, xp: p.xp + (wasCompleted ? 0 : 35), progress: { ...p.progress, [id]: { ...p.progress[id], [mode]: true } } };
      }
      if (mode === 'checkpoint') {
        const previous = p.progress[id] || {};
        const finalCleared = id !== 99 || masteryCount(p) === 100;
        const earned = passed && finalCleared && !previous.checkpoint ? 100 : 0;
        return { ...next, xp: p.xp + earned,
          progress: { ...p.progress, [id]: { ...previous, best: Math.max(previous.best || 0, percent(first, total)), checkpoint: previous.checkpoint || (passed && finalCleared) } } };
      }
      return next;
    });
  }
  async function resetKid(id: string, deleteEntirely: boolean) {
    const target = profiles.find(p => p.id === id); if (!target) return;
    setParentAction(()=>()=>void performReset(id,deleteEntirely));
  }
  async function performReset(id:string,deleteEntirely:boolean) {
    const target=profiles.find(p=>p.id===id);if(!target)return;
    if (!window.confirm(deleteEntirely ? `למחוק לצמיתות את הפרופיל של ${target.name} וההתקדמות וההיסטוריה שלו בכל המשחקים? הפעולה אינה ניתנת לביטול.` : `לאפס את ההתקדמות של ${target.name}? כל הנקודות וההישגים יימחקו.`)) return;
    if (deleteEntirely) {
      try { await cloud.deleteProfile(id); }
      catch { setNotice('המחיקה לא הושלמה. הפרופיל נשאר ברשימה; אפשר לנסות שוב.'); return; }
      const remaining = profiles.filter(p => p.id !== id);
      cloud.onActivity('profile_deleted', undefined, { profileId: id });
      cloud.onProfilesChanged(remaining);
      setProfiles(remaining); setActiveId(remaining[0]?.id || '');
      navigate(remaining.length ? 'home' : 'profiles');
    } else {
      try { await cloud.resetProfile(id); } catch { setNotice('האיפוס לא הושלם. הנתונים נשארו ללא שינוי.'); return; }
      cloud.onActivity('profile_reset', id);
      setProfiles(prev => prev.map(p => p.id === id ? { ...createProfile(p.name, p.avatar), id: p.id, joined: p.joined, _revision:(p._revision??0)+1 } : p));
      setActiveId(id); navigate('home');
    }
    setNotice(deleteEntirely ? 'הפרופיל נמחק.' : 'יצאנו למסע חדש! בהצלחה!');
  }
  const navItems: { id: Page; label: string; icon: ReactNode }[] = [
    { id: 'home', label: 'בית', icon: <Home size={19}/> }, { id: 'map', label: 'מפת העולמות', icon: <Sparkles size={19}/> },
    { id: 'games', label: 'משחקים', icon: <Play size={19}/> }, { id: 'progress', label: 'ההישגים שלי', icon: <Trophy size={19}/> },
    { id: 'table', label: 'לוח הכפל', icon: <BookOpen size={19}/> },
    { id: 'parents', label: 'להורים', icon: <ShieldCheck size={19}/> },
  ];
  if (!active) {
    return <div className="app onboarding">
      <div className="blob blob-one"/><div className="blob blob-two"/>
      <div className="onboarding-shell">
        {profiles.length > 0 && <button className="ghost back-to-kids" onClick={() => { setActiveId(profiles[0].id); navigate('profiles'); }}><ArrowRight size={17}/> בחירת פרופיל</button>}
        <div className="intro-icon">📒<span className="orbit-dot">✦</span></div>
        <p className="eyebrow centered">הרפתקה מתמטית מתחילה כאן</p>
        <h1>מסע הכפל <span>שלי!</span></h1>
        <p className="intro-subtitle">עולמות קסומים, משחקים, מדליות והמון רגעי ״הצלחתי!״<br/>לומדים את לוח הכפל בכיף ובקצב שלך.</p>
        <form onSubmit={createKid} className="signup-card">
          <div className="section-small-title">איך קוראים לך, אלוף או אלופה?</div>
          <label className="visually-hidden" htmlFor="kid-name">השם שלי</label>
          <input id="kid-name" autoFocus maxLength={22} value={createName} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateName(e.target.value)} placeholder="השם שלי..." className="name-input" required/>
          <div className="section-small-title" style={{ marginTop: 22 }}>בוחרים חבר למסע!</div>
          <div className="avatars">{AVATARS.map(a => <button type="button" key={a} aria-label={`בחירת דמות ${a}`} aria-pressed={createAvatar === a} className={`avatar-choice ${createAvatar === a ? 'selected' : ''}`} onClick={() => setCreateAvatar(a)}>{a}</button>)}</div>
          <button className="primary large" type="submit">בואו נצא להרפתקה! <ArrowLeft size={21}/></button>
          <p className="privacy-note">☁️ הנקודות וההתקדמות נשמרות בענן ומקושרות לחשבון המשפחתי שאיתו התחברתם באמצעות Google. אפשר להמשיך גם ממכשיר אחר! 🚀</p>
        </form>
        {profiles.length > 0 && <button className="text-link" onClick={() => { setActiveId(profiles[0].id); navigate('profiles'); }}>כבר יש לי פרופיל</button>}
      </div>
    </div>;
  }
  const completed = ordinaryCompletedCount(active);
  const mastery = masteryCount(active);
  const currentWorld = WORLDS[currentWorldIndex(active)];
  const dailyDone = active.dailyDate === dayKey();
  const earned = badgesFor(active);
  if(parentAction)return <ParentGate title="אישור הורי" onDone={()=>{const action=parentAction;setParentAction(null);action();}} onCancel={()=>setParentAction(null)}/>;
  return <div className={`app ${focusMode?'focus-mode':''}`}>
    <header className="topbar">
      <div className="topbar-inner">
        <button className="logo-button" onClick={() => navigate('home')} aria-label="מסע הכפל שלי - מסך הבית"><span className="logo-mark">📒</span><span>מסע הכפל <b>שלי!</b></span></button>
        <nav className={`main-nav ${menuOpen ? 'expanded' : ''}`} aria-label="ניווט ראשי">{navItems.map(n => <button key={n.id} className={`nav-link ${page === n.id || ((page === 'world' || page === 'lesson' || page === 'quiz') && n.id === 'map') ? 'active' : ''}`} onClick={() => navigate(n.id)}>{n.icon}<span>{n.label}</span></button>)}</nav>
        <div className="top-actions"><button className="text-link" aria-label={active.sound?'השתקת צלילים':'הפעלת צלילים'} onClick={()=>{stopAudio();updateActive(p=>({...p,sound:!p.sound}));}}>{active.sound?<Volume2 size={21}/>:<VolumeX size={21}/>}</button>
          <div className="top-points" title="הנקודות שצברת"><Star size={17} fill="#f9bb42" stroke="#f9bb42"/><b>{formatNumber(active.xp)}</b></div>
          <button className="profile-pill" onClick={() => navigate('profiles')} title="החלפת פרופיל"><span>{active.avatar}</span><strong>{active.name}</strong><ChevronLeft size={16}/></button>
          <button className="mobile-menu" aria-label="פתיחת תפריט" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button>
        </div>
      </div>
    </header>
    {notice && <div role="status" className="toast">{notice}</div>}
    <SyncStatus/><main className="main-container">
      {page === 'home' && <>
        <section className="hero">
          <div className="hero-content">
            <div className="hero-tag"><Sparkles size={15}/> מגלים, לומדים ומנצחים</div>
            <h1>היי {active.name}! <span className="wave">👋</span><br/><span>מוכנים להרפתקה?</span></h1>
            <p>כל תרגיל הוא עוד צעד בדרך להפוך לאלופי הכפל. יש לך את זה!</p>
            <button className="primary hero-action" onClick={() => openWorld(currentWorld.id)}>ממשיכים במסע <ArrowLeft size={20}/></button>
          </div>
          <div className="hero-illustration" aria-hidden="true"><span className="float f1">✦</span><span className="float f2">✳</span><div className="hero-star">📒</div><div className="hero-mascot">{active.avatar}</div><span className="float f3">✦</span><div className="hero-calc">3 × 4 = 12</div></div>
        </section>
        <section className="stat-grid" aria-label="ההתקדמות שלי">
          <Stat icon="⭐" value={formatNumber(active.xp)} label="הכוכבים שלי" color="peach"/>
          <Stat icon="🗺️" value={`${completed}/11`} label="עולמות שהושלמו" color="lavender"/>
          <Stat icon="🎯" value={`${mastery}/100`} label="כפולות בשליטה" color="mint"/>
          <Stat icon="🏅" value={earned.length.toString()} label="מדליות שאספתי" color="sky"/>
        </section>
        <div className="home-columns">
          <section className="panel journey-panel">
            <div className="panel-head"><div><div className="eyebrow">המסע שלי</div><h2>העולם הבא שלך</h2></div><button className="text-link" onClick={() => navigate('map')}>לכל העולמות <ArrowLeft size={15}/></button></div>
            <div className={`featured-world tint-${currentWorld.shade}`}>
              <div className="featured-icon">{currentWorld.icon}</div>
              <div><span className="tiny-label">עולם {Math.min(currentWorldIndex(active) + 1, 12)} מתוך 12</span><h3>{currentWorld.name}</h3><p>{currentWorld.subtitle}</p></div>
              <button className="circle-arrow" aria-label={`לכניסה אל ${currentWorld.name}`} onClick={() => openWorld(currentWorld.id)}><ArrowLeft/></button>
            </div>
            <div className="progress-title"><span>התקדמות במסע</span><b>{percent(completed, 11)}%</b></div>
            <Progress value={percent(completed, 11)}/>
            <p className="quiet-note">לא ממהרים — כל שלב קטן הוא ניצחון גדול 💜</p>
          </section>
          <section className="panel daily-panel">
            <div className="panel-head"><div><div className="eyebrow">קצת בכל יום</div><h2>האתגר היומי ✨</h2></div><div className="daily-emblem">⚡</div></div>
            <p>12 שאלות קצרות ומגוונות שיעזרו לשמור על הידע ולחזק את הביטחון.</p>
            {dailyDone && <div className="inline-success"><CheckCircle2 size={18}/> השלמת אתגר היום! אפשר גם לשחק שוב.</div>}
            <button className="secondary full" onClick={() => startQuiz('daily', currentWorld.id)}>{dailyDone ? 'רוצים סיבוב נוסף?' : 'יוצאים לאתגר!'} <ArrowLeft size={17}/></button>
          </section>
        </div>
        <section className="section-heading"><div><div className="eyebrow">מגלים עולמות</div><h2>העולמות שלי</h2></div><button className="text-link" onClick={() => navigate('map')}>הצגת כל העולמות <ArrowLeft size={16}/></button></section>
        <div className="world-preview-grid">{WORLDS.slice(0, 4).map((w, i) => <WorldCard key={w.id} world={w} index={i} profile={active} onClick={() => openWorld(w.id)}/>)}</div>
      </>}
      {page === 'map' && <>
        <div className="page-title"><div className="eyebrow">ההרפתקה שלך</div><h1>מפת עולמות הכפל 🗺️</h1><p>בכל עולם לומדים משהו חדש, מתאמנים ומקבלים כוכבים. בואו נתקדם בקצב שלנו!</p></div>
        <div className="map-progress panel"><div className="map-progress-number">{completed}<span>/11</span></div><div className="map-progress-text"><h3>עולמות שהשלמת</h3><p>אחרי כל מבחן מוצלח נפתח העולם הבא</p><Progress value={percent(completed, 11)}/></div><div className="map-progress-decoration">🌟</div></div>
        <div className="world-grid adventure-map"><svg className="map-trail" viewBox="0 0 100 1200" preserveAspectRatio="none" aria-hidden="true"><path d={'M 28 45 '+WORLDS.slice(1).map((_,i)=>`Q 50 ${i*100+95} ${i%2===0?72:28} ${i*100+145}`).join(' ')}/></svg>{WORLDS.map((w, i) => <WorldCard key={w.id} world={w} index={i} profile={active} onClick={() => openWorld(w.id)}/>)}</div>
      </>}
      {page === 'world' && <WorldPage world={byId(worldId)} profile={active} onBack={() => navigate('map')} onLesson={() => startLesson(worldId)} onQuiz={mode => startQuiz(mode, worldId)}/>}
      {page === 'lesson' && <Lesson key={worldId} world={byId(worldId)} name={active.name} onBack={() => navigate('world')} onFinish={() => completeLesson(worldId)}/>}
      {page === 'quiz' && session && <QuizScreen key={session.runId} profile={active} world={byId(session.worldId)} mode={session.mode} questions={session.questions} onInteraction={(event) => cloud.onGameEvent({ ...event, sessionId: session.runId })} onRecord={recordAnswer} onComplete={(first, total) => completeQuiz(session.mode, session.worldId, first, total)} onExit={() => navigate(session.mode === 'checkpoint' || session.mode === 'practice' || session.mode === 'guided' ? 'world' : 'games')} onRetry={() => startQuiz(session.mode, session.worldId, session.table)} onWorld={() => navigate('world')} onNext={()=>{const next=WORLDS[getWorldIndex(session.worldId)+1];if(next&&canOpenWorld(active,next.id))openWorld(next.id);else navigate('progress');}} />}
      {page === 'games' && <GamesPage onEvent={miniEvent} profile={active} onPlay={(mode, table) => startQuiz(mode, table || currentWorld.id, table)} onRecord={(q, first, points, resolved) => { recordAnswer(q, first, points, resolved); cloud.onActivity('mini_game', active.id, { a: q.a, b: q.b, first, points, resolved }); }}/>}
      {page === 'progress' && <ProgressPage profile={active} onWorld={openWorld} onPractice={(n,b) => startQuiz('focused', n, n,b)}/>}
      {page === 'table' && <MultiplicationBoard onEvent={miniEvent} onRecord={(q,first,points,resolved)=>{recordAnswer(q,first,points,resolved);cloud.onActivity('mini_game',active.id,{a:q.a,b:q.b,first,points,resolved});}}/>}
      {page === 'parents' && <ParentsPage profile={active} onPractice={n => startQuiz('focused', n, n)} onReset={() => resetKid(active.id, false)}/>}
      {page === 'profiles' && <section className="profiles-page"><div className="page-title"><div className="eyebrow">משחק לכל אחד</div><h1>מי משחק היום? 🎮</h1><p>לכל ילד או ילדה יש מסע, נקודות והישגים משלהם.</p></div><div className="profile-grid">{profiles.map(p => <div className={`profile-card panel ${p.id === activeId ? 'selected-profile' : ''}`} key={p.id}><div className="profile-large-avatar">{p.avatar}</div><h3>{p.name}</h3><p>⭐ {formatNumber(p.xp)} נקודות · {ordinaryCompletedCount(p)} עולמות</p><button className="primary full" onClick={() => { setActiveId(p.id); navigate('home'); }}>ממשיכים לשחק <ArrowLeft size={16}/></button><div className="profile-controls"><button onClick={() => resetKid(p.id, false)}><RotateCcw size={14}/> התחל מהתחלה</button><button className="danger-text" onClick={() => resetKid(p.id, true)}><Delete size={14}/> מחק פרופיל</button></div></div>)}<div className="profile-card panel new-profile"><div className="new-profile-icon"><Plus size={34}/></div><h3>חבר חדש למסע?</h3><p>אפשר לפתוח פרופיל נוסף בלי לאבד את הישגי האחרים.</p><button className="secondary full" onClick={() => setActiveId('')}>יצירת פרופיל חדש <Plus size={17}/></button></div></div><div className="settings-box panel"><Settings size={21}/><div><h3>הגדרות המשחק</h3><button className="text-link" onClick={()=>setFocusMode(value=>!value)}>{focusMode?'יציאה ממצב ריכוז':'מצב ריכוז: פחות עיטורים ותנועה'}</button><p>ניתן להפעיל או להשתיק צלילי הצלחה במהלך התרגול.</p></div><button className="secondary" onClick={() => {stopAudio();updateActive(p => ({ ...p, sound: !p.sound }));}}>{active.sound ? <Volume2 size={17}/> : <VolumeX size={17}/>} {active.sound ? 'צלילים פועלים' : 'צלילים כבויים'}</button></div></section>}
    </main>
    <footer className="footer"><span>✨ מסע הכפל שלי · לומדים באהבה</span><span>שמירה מאובטחת בענן · ללא פרסומות</span></footer>
    <nav className="mobile-bottom-nav" aria-label="ניווט נייד">{navItems.slice(0, 4).map(n => <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => navigate(n.id)}>{n.icon}<span>{n.label}</span></button>)}</nav>
  </div>;
}
function Progress({ value }: { value: number }) { return <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.min(100, Math.max(0, value))}%` }}/></div>; }
function Stat({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) { return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div><b>{value}</b><span>{label}</span></div></div>; }
function WorldCard({ world, profile, index, onClick }: { world: World; profile: Profile; index: number; onClick: () => void }) {
  const unlocked = worldIsUnlocked(profile, index); const done = worldCompleted(profile, world.id);
  return <button onClick={onClick} disabled={!unlocked} className={`world-card panel tint-${world.shade} ${!unlocked ? 'locked' : ''} ${done ? 'done' : ''}`}>
    {unlocked&&index===currentWorldIndex(profile)&&<div className="map-you">{profile.avatar} אתם כאן</div>}<div className="world-card-top"><span className="world-number">עולם {index + 1}</span>{done ? <span className="status done-status"><Check size={14}/> הושלם!</span> : unlocked ? <span className="status open-status">פתוח למשחק</span> : <LockKeyhole size={16} className="lock-icon"/>}</div>
    <div className="world-big-emoji">{unlocked ? world.icon : '🔒'}</div><h3>{world.name}</h3><p>{world.subtitle}</p>
    <span className="world-card-footer">{done ? 'אפשר לחזור ולתרגל' : unlocked ? 'נכנסים לעולם' : 'ייפתח בהמשך'} <ArrowLeft size={16}/></span>
  </button>;
}
function WorldPage({ world, profile, onBack, onLesson, onQuiz }: { world: World; profile: Profile; onBack: () => void; onLesson: () => void; onQuiz: (mode: QuizMode) => void }) {
  const prog = profile.progress[world.id] || {};
  const final = world.id === 99;
  const steps = [
    { icon: '📚', title: 'לומדים ומבינים', text: 'המחשות, סיפורים קטנים ושיטה חכמה לכל כפולה', enabled: true, done: prog.lesson, action: onLesson, button: prog.lesson ? 'לצפות שוב בשיעור' : 'מתחילים ללמוד' },
    { icon: '🧩', title: 'מתרגלים יחד', text: '8 תרגילים עם רמזים ועזרה בכל שלב', enabled: prog.lesson, done: prog.guided, action: () => onQuiz('guided'), button: 'בואו נתרגל' },
    { icon: '💪', title: 'אני יכול לבד', text: '24 תרגילים במגוון משחקים ושאלות', enabled: prog.guided, done: prog.practice, action: () => onQuiz('practice'), button: 'מתחילים תרגול' },
    { icon: '🏅', title: final ? 'מבחן אלופי הכפל' : 'מבחן סיום העולם', text: final ? '90% הצלחה וידע מוכח בכל 100 הצירופים' : '20 תרגילים, לפחות 85% דיוק בניסיון ראשון', enabled: prog.practice, done: prog.checkpoint, action: () => onQuiz('checkpoint'), button: 'מוכנים למבחן?' },
  ];
  return <>
    <button className="back-link" onClick={onBack}><ArrowRight size={18}/> חזרה למפת העולמות</button>
    <section className={`world-detail-hero tint-${world.shade}`}><div className="world-detail-badge">עולם {getWorldIndex(world.id) + 1} מתוך 12</div><div className="world-detail-illustration">{world.icon}</div><div><h1>{world.name}</h1><p>{world.subtitle}</p><div className="world-detail-fact">💡 {world.example}</div></div></section>
    <div className="section-heading"><div><div className="eyebrow">מתקדמים בצעדים קטנים</div><h2>השלבים בעולם הזה</h2></div><span className="muted">{steps.filter(s => s.done).length} מתוך 4 שלבים</span></div>
    <div className="stage-grid">{steps.map((s, i) => <div key={s.title} className={`stage-card panel ${s.done ? 'stage-done' : ''} ${!s.enabled ? 'stage-locked' : ''}`}><div className="stage-top"><span className="stage-number">{i + 1}</span>{s.done ? <CheckCircle2 size={21} className="green-check"/> : !s.enabled ? <LockKeyhole size={19} className="muted"/> : null}</div><div className="stage-emoji">{s.icon}</div><h3>{s.title}</h3><p>{s.text}</p><button className={s.done ? 'outline full' : 'primary full'} disabled={!s.enabled} onClick={s.action}>{s.enabled ? s.button : 'ייפתח בהמשך'} <ArrowLeft size={16}/></button></div>)}</div>
    <div className="tip-banner"><span>🧠</span><p>טיפ של אלופים: לא בטוחים? זה בסדר! לחצו על ״רמז״ ונחשוב על הפתרון יחד. ההבנה חשובה מהמהירות.</p></div>
  </>;
}
function DotGroups({ groups, perGroup, dense = false }: { groups: number; perGroup: number; dense?: boolean }) {
  return <div className={`dot-groups ${dense ? 'dense' : ''}`} aria-label={`${groups} קבוצות עם ${perGroup} נקודות בכל קבוצה`}>
    {Array.from({ length: groups }, (_, i) => <div className="dot-group" key={i}>{Array.from({ length: perGroup }, (_, j) => <span className="math-dot" key={j}/>)}</div>)}
  </div>;
}
function QuizScreen({ profile, world, mode, questions, onRecord, onComplete, onExit, onRetry, onWorld, onNext, onInteraction }: {
  profile: Profile; world: World; mode: QuizMode; questions: Question[];
  onRecord: (q: Question, firstTry: boolean, points: number, resolved: boolean) => void;
  onComplete: (first: number, total: number) => void; onExit: () => void; onRetry: () => void; onWorld: () => void; onNext:()=>void;
  onInteraction: (event: Omit<CloudEvent, 'sessionId'>) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [wrongTries, setWrongTries] = useState(0), [hints, setHints] = useState(0);
  const [status, setStatus] = useState<'ready' | 'wrong' | 'correct'>('ready');
  const [revealed, setRevealed] = useState(false), [complete, setComplete] = useState(false);
  const [firstCount, setFirstCount] = useState(0), [earnedPoints, setEarnedPoints] = useState(0);
  const [feedback, setFeedback] = useState('');
  const pendingRef = useRef(false);
  const q = questions[idx];
  const final = world.id === 99 && mode === 'checkpoint';
  function submit(raw: string) {
    if (!q || status === 'correct' || pendingRef.current) return;
    const answer = raw.trim(); if (!answer) return;
    const ok = answer === q.correctAnswer || (!q.options && Number(answer) === Number(q.correctAnswer));
    onInteraction({ question: q, action: 'answer', response: answer });
    if (ok) {
      pendingRef.current = true;
      const clean = wrongTries === 0 && hints === 0;
      const points = hints>0 ? 3 : wrongTries>0 ? 6 : 10;
      setFirstCount(c => c + Number(clean)); setEarnedPoints(p => p + points);
      onRecord(q, clean, points, true);
      playBeep(true, profile.sound);
      setStatus('correct'); setFeedback(clean ? shuffle(['אליפות! תשובה מושלמת! 🎉', 'איזה יופי! כל הכבוד! ⭐', 'פגיעה בול! ממשיכים! 💜'])[0] : 'מצוין! התמדת והצלחת! 💪');
    } else {
      setWrongTries(n => n + 1); setStatus('wrong');
      playBeep(false, profile.sound);
      setFeedback('לא בדיוק, אבל אנחנו לומדים! נסו שוב או בקשו רמז. 💜');
    }
  }
  function revealAnswer() {
    if (status === 'correct') return;
    onInteraction({ question: q, action: 'reveal' });
    onRecord(q, false, 0, false); setRevealed(true); setStatus('correct');
    setFeedback(`התשובה היא ${q.correctAnswer}. כדאי לחזור על התרגיל גם בהמשך.`);
  }
  function next() {
    if (idx + 1 === questions.length) { setComplete(true); onComplete(firstCount, questions.length); return; }
    setIdx(i => i + 1); setWrongTries(0); setHints(0); setStatus('ready'); setRevealed(false); setFeedback('');
    pendingRef.current = false;
  }
  if (complete) {
    const accuracy = percent(firstCount, questions.length);
    const threshold = final ? 90 : 85;
    const passed = accuracy >= threshold;
    const isTest = mode === 'checkpoint';
    const certificated = final && passed && masteryCount(profile) === 100;
    return <div className="quiz-summary panel"><div className="summary-emoji">{passed ? '🏆' : '🌱'}</div><div className="eyebrow">סיימנו את האתגר!</div><h1>{passed ? `איזו עבודה נהדרת, ${profile.name}!` : `כל הכבוד על ההתמדה, ${profile.name}!`}</h1><p>{passed ? 'השקעת והצלחת! הכוכבים ממשיכים להצטבר.' : 'כל ניסיון מלמד אותנו עוד משהו. עכשיו יודעים על מה כדאי לחזור.'}</p><div className="summary-stats"><Stat color="mint" icon="🎯" value={`${accuracy}%`} label="תשובות בניסיון ראשון"/><Stat color="peach" icon="⭐" value={`+${earnedPoints}`} label="כוכבים שצברת"/><Stat color="lavender" icon="✅" value={`${firstCount}/${questions.length}`} label="הצלחות ללא עזרה"/></div>
      {isTest && <div className={`result-message ${passed ? 'success-msg' : 'retry-msg'}`}>{passed ? (final && !certificated ? 'עמדת ביעד הדיוק! כדי לקבל תעודת אלוף יש לשלוט בכל 100 הצירופים בתרגולים חוזרים בימים שונים.' : 'עמדת ביעד המבחן! העולם הושלם ונפתח השלב הבא!') : `כדי לעבור את המבחן צריך לפחות ${threshold}% נכונות בניסיון ראשון. מומלץ לחזור לתרגול ולהתנסות שוב.`}</div>}
      <div className="summary-actions">{isTest&&passed&&(!final||certificated)&&<button className="primary" onClick={onNext}>{final?'המסע שלי וההישגים':'ממשיכים לעולם הבא!'}</button>}<button className="outline" onClick={onRetry}><RotateCcw size={17}/> משחקים שוב</button><button className="primary" onClick={onWorld}>בחזרה לעולם <ArrowLeft size={17}/></button></div>
    </div>;
  }
  return <div className="quiz-layout"><div className="quiz-header"><button className="back-link" onClick={() => { if (window.confirm('לצאת מהתרגול? הנקודות שכבר צברת יישמרו, אבל הסבב לא ייחשב כהושלם.')) onExit(); }}><ArrowRight size={18}/> יציאה מהתרגול</button><div className="quiz-header-badge">{mode === 'rocket' ? '🚀' : mode === 'tower' ? '🏗️' : mode === 'treasure' ? '🗝️' : '🎯'} {exerciseStageTitle[mode]}</div></div>
    <div className="quiz-top-meta"><div className="quiz-stage-label"><span>שאלה {idx + 1} מתוך {questions.length}</span><b>⭐ +{earnedPoints}</b></div><Progress value={idx / questions.length * 100}/></div>
    {(mode === 'rocket' || mode === 'tower' || mode === 'treasure') && <div className={`play-track ${mode}`}>
      <div className="play-track-caption"><b>{mode === 'rocket' ? 'בדרך לכוכב הבא 🌍' : mode === 'tower' ? 'בונים מגדל ביחד 🧱' : 'מפת האוצר שלנו 🗺️'}</b><span>{idx} / {questions.length}</span></div>
      <div className="play-track-line"><div style={{ width: `${idx / questions.length * 100}%` }} /><span className="moving-icon" style={{ right: `calc(${idx / questions.length * 90}% - 11px)` }}>{mode === 'rocket' ? '🚀' : mode === 'tower' ? '🏗️' : '💎'}</span></div>
    </div>}
    <div className="quiz-card panel"><div className="quiz-character">{mode === 'rocket' ? '🚀' : mode === 'tower' ? '🏗️' : mode === 'treasure' ? '💎' : profile.avatar}</div><p className="quiz-instruction">{q.type === 'truefalse' ? 'האם המשפט הזה נכון?' : q.type === 'story' ? 'חושבים על הסיפור ופותרים' : q.type === 'visual' ? 'סופרים את הקבוצות' : q.type === 'missing' ? 'מהו המספר החסר?' : 'מהי התשובה הנכונה?'}</p>
      <h1 className={`${q.type === 'story' ? 'story-question' : 'question-math'}`} dir={q.type === 'story' || q.type === 'visual' ? 'rtl' : 'ltr'}>{q.prompt}</h1>
      {q.type === 'visual' && <DotGroups groups={q.a} perGroup={q.b} dense/>}
      <Activity key={q.uid} question={q} index={idx} disabled={status === 'correct'} onAnswer={submit}/>
      {feedback && <div className={`answer-feedback ${status === 'correct' ? 'feedback-success' : 'feedback-error'}`} role="status">{status === 'correct' ? <CheckCircle2 size={20}/> : <CircleHelp size={20}/>}<div><b>{feedback}</b>{status === 'correct' && <p>{q.explanation}</p>}</div></div>}
      {status !== 'correct' && <div className="help-zone"><button className="hint-button" onClick={() => { if (hints < 2) { onInteraction({ question: q, action: 'hint' }); setHints(h => h + 1); } }}><CircleHelp size={17}/> {hints === 0 ? 'אפשר רמז?' : hints === 1 ? 'אפשר עוד רמז?' : 'שני הרמזים פתוחים'}</button><button className="speaker-button" title="השמעת השאלה" onClick={() => {if(!speakHebrew(q.prompt))setFeedback('אין קול עברי זמין במכשיר. אפשר לקרוא את השאלה על המסך.');}} aria-label="השמעת השאלה"><Volume2 size={19}/></button></div>}
      {hints >= 1 && status !== 'correct' && <div className="hint-card"><span>💡 רמז ראשון</span><p>{q.hint}</p>{hints >= 2 && <><span>🧩 רמז נוסף</span><p>{q.moreHint}</p></>}</div>}
      {status !== 'correct' && (wrongTries >= 2 || hints >= 2) && <button className="reveal-link" onClick={revealAnswer}>רוצה לראות את הפתרון המלא?</button>}
      {status === 'correct' && <button className="primary next-question" onClick={next}>{revealed ? 'הבנתי, לשאלה הבאה' : idx + 1 === questions.length ? 'מסיימים ורואים תוצאות' : 'ממשיכים לשאלה הבאה'} <ArrowLeft size={18}/></button>}
    </div><p className="quiz-bottom-note">🌈 מותר לטעות. כשחושבים ומנסים שוב — המוח מתחזק!</p>
  </div>;
}
function GamesPage({ profile, onPlay, onRecord,onEvent }: { profile: Profile; onEvent:MiniInteraction; onPlay: (mode: QuizMode, table?: number) => void; onRecord: (q: Question, firstTry: boolean, points: number, resolved: boolean) => void }) {
  const [selected, setSelected] = useState(2);
  const [mini, setMini] = useState<'memory' | 'bingo' | BonusKind | null>(null);
  const unlockedTables = WORLDS.filter((_, i) => i > 0 && i < 11 && worldIsUnlocked(profile, i)).map(w => w.id);
  const table = unlockedTables.includes(selected) ? selected : unlockedTables[0] ?? 1;
  return <><div className="page-title"><div className="eyebrow">ללמוד בדרך הכי כיפית</div><h1>ארקייד הכפל 🎮</h1><p>כל משחק מאמן את המוח בדרך אחרת. בוחרים משחק ויוצאים לדרך!</p></div>
    {!mini ? <><div className="table-picker panel"><div><h3>איזה לוח כפל מתרגלים?</h3><p>בוחרים עולם שכבר נפתח במסע הלמידה.</p></div><div className="table-chips">{unlockedTables.map(n => <button key={n} className={`chip ${table === n ? 'active' : ''}`} onClick={() => setSelected(n)}>{n}</button>)}</div></div>
      <div className="game-grid">
        <GameCard icon="🃏" title="משחק הזיכרון" subtitle="מצאו זוגות של תרגילים ותוצאות" color="lavender" onClick={() => setMini('memory')}/>
        <GameCard icon="🎱" title="בינגו כפל" subtitle="מצאו את התוצאה הנכונה על הלוח" color="mint" onClick={() => setMini('bingo')}/>
        {BONUS_GAMES.map(game=><GameCard key={game.id} icon={game.icon} title={game.title} subtitle={game.description} color="sky" onClick={()=>setMini(game.id)}/>)}
        <GameCard icon="🎯" title="חיזוק אישי" subtitle="תרגילים חכמים לפי מה שכדאי לחזק" color="pink" onClick={() => onPlay('focused', table)}/>
        <GameCard icon="🧭" title="מסע בין הכפולות" subtitle="30 שאלות מגוונות מעולמות שכבר נפתחו" color="sky" onClick={() => onPlay('mixed')}/>
      </div></> : <div><button className="back-link" onClick={() => setMini(null)}><ArrowRight size={18}/> לכל המשחקים</button>{mini === 'memory' ? <MemoryGame onEvent={onEvent} key={`memory_${table}`} table={table} onRecord={onRecord}/> : mini==='bingo'?<BingoGame onEvent={onEvent} key={`bingo_${table}`} table={table} onRecord={onRecord}/>:<BonusAdventure onEvent={onEvent} key={`${mini}_${table}`} kind={mini} table={table} enabled={profile.sound} onRecord={onRecord}/>}</div>}
  </>;
}
function GameCard({ icon, title, subtitle, color, onClick }: { icon: string; title: string; subtitle: string; color: string; onClick: () => void }) { return <button className="game-card panel" onClick={onClick}><div className={`game-icon ${color}`}>{icon}</div><h3>{title}</h3><p>{subtitle}</p><span>משחקים עכשיו <ArrowLeft size={16}/></span></button>; }
type MemoryTile = { id: string; kind: 'fact' | 'answer'; pair: number; value: string };
function MemoryGame({ table, onRecord,onEvent }: { table: number; onEvent:MiniInteraction; onRecord: (q: Question, firstTry: boolean, points: number, resolved: boolean) => void }) {
  const memoryQuestions=useRef(new Map<number,Question>()),failedPairs=useRef(new Set<number>());
  const memoryQuestion=(b:number)=>{if(!memoryQuestions.current.has(b))memoryQuestions.current.set(b,{...makeQuestion(table,b),activity:'memory'});return memoryQuestions.current.get(b)!;};
  const [tiles, setTiles] = useState<MemoryTile[]>(() => {
    const factors = shuffle(Array.from({ length: 10 }, (_, i) => i + 1)).slice(0, 6);
    return shuffle(factors.flatMap((b, i) => [{ id: `f_${i}`, kind: 'fact' as const, pair: b, value: `${table} × ${b}` }, { id: `a_${i}`, kind: 'answer' as const, pair: b, value: String(table * b) }]));
  });
  const [flipped, setFlipped] = useState<string[]>([]), [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0), [busy, setBusy] = useState(false);const [,setWrongPairs]=useState(0);
  const done = matched.length === 6;
  function select(t: MemoryTile) {
    if (busy || done || flipped.includes(t.id) || matched.includes(t.pair)) return;
    if (flipped.length === 0) { setFlipped([t.id]); return; }
    const previous = tiles.find(tile => tile.id === flipped[0]); if (!previous) return;
    setMoves(m => m + 1);
    if (previous.pair === t.pair && previous.kind !== t.kind) {
      setMatched(a => [...a, t.pair]); setFlipped([]);
      const q=memoryQuestion(t.pair);onEvent(q,'answer',q.correctAnswer);onRecord(q,!failedPairs.current.has(t.pair),failedPairs.current.has(t.pair)?6:10,true);
    } else {
      if(previous.kind!==t.kind){const fact=previous.kind==='fact'?previous:t,answer=previous.kind==='answer'?previous:t;failedPairs.current.add(fact.pair);onEvent(memoryQuestion(fact.pair),'answer',answer.value);}
      setFlipped([flipped[0], t.id]); setBusy(true); setWrongPairs(n => n + 1);
      window.setTimeout(() => { setFlipped([]); setBusy(false); }, 850);
    }
  }
  function newGame() {
    const factors = shuffle(Array.from({ length: 10 }, (_, i) => i + 1)).slice(0, 6);
    memoryQuestions.current.clear();failedPairs.current.clear();
    setTiles(shuffle(factors.flatMap((b, i) => [{ id: `f_${i}`, kind: 'fact' as const, pair: b, value: `${table} × ${b}` }, { id: `a_${i}`, kind: 'answer' as const, pair: b, value: String(table * b) }])));
    setFlipped([]); setMatched([]); setMoves(0); setBusy(false); setWrongPairs(0);
  }
  return <div className="minigame panel"><div className="minigame-head"><div><h2>🃏 משחק הזיכרון</h2><p>הופכים שני קלפים ומנסים להתאים תרגיל לתוצאה שלו.</p></div><div className="game-score">{matched.length}/6 זוגות · {moves} ניסיונות</div></div>
    <div className="memory-grid">{tiles.map(t => <button key={t.id} className={`memory-tile ${flipped.includes(t.id) || matched.includes(t.pair) ? 'revealed' : ''} ${matched.includes(t.pair) ? 'matched' : ''}`} onClick={() => select(t)} aria-label={flipped.includes(t.id) || matched.includes(t.pair) ? t.value : 'קלף הפוך'}>{flipped.includes(t.id) || matched.includes(t.pair) ? t.value : '✦'}</button>)}</div>
    {done && <div className="inline-success center-success">🏆 מדהים! התאמת את כל הזוגות!</div>}
    <button className="secondary" onClick={newGame}><RotateCcw size={16}/> משחק חדש</button>
  </div>;
}
function BingoGame({ table, onRecord,onEvent }: { table: number; onEvent:MiniInteraction; onRecord: (q: Question, firstTry: boolean, points: number, resolved: boolean) => void }) {
  const [factors, setFactors] = useState(() => shuffle(Array.from({ length: 10 }, (_, i) => i + 1)).slice(0, 9));
  const [order, setOrder] = useState(() => shuffle(Array.from({ length: 9 }, (_, i) => i)));
  const [idx, setIdx] = useState(0), [wrong, setWrong] = useState(false), [message, setMessage] = useState('');
  const [solved, setSolved] = useState(false);
  const done = idx === 9;
  const currentFactor = done ? 0 : factors[order[idx]];
  const bingoQuestion=useRef<{factor:number;question:Question}|null>(null);
  if(bingoQuestion.current?.factor!==currentFactor)bingoQuestion.current={factor:currentFactor,question:makeQuestion(table,currentFactor)};
  function choose(factor: number) {
    if (solved || done || order.slice(0, idx).some(i => factors[i] === factor)) return;
    const q=bingoQuestion.current!.question;onEvent(q,'answer',String(table*factor));
    if (factor === currentFactor) {
      onRecord(q, !wrong, wrong ? 6 : 10, true); setSolved(true); setMessage('בינגו! תשובה נכונה! 🎉');
    } else { setWrong(true); setMessage('לא בדיוק! נסו למצוא את התוצאה של התרגיל שמופיע למעלה.'); }
  }
  function newGame() { bingoQuestion.current=null;setFactors(shuffle(Array.from({ length: 10 }, (_, i) => i + 1)).slice(0, 9)); setOrder(shuffle(Array.from({ length: 9 }, (_, i) => i))); setIdx(0); setWrong(false); setMessage(''); setSolved(false); }
  return <div className="minigame panel"><div className="minigame-head"><div><h2>🎱 בינגו כפל</h2><p>על הלוח יש 9 תוצאות. נוגעים בתוצאה המתאימה!</p></div><div className="game-score">{idx}/9 נמצאו</div></div>
    <div className="bingo-prompt" dir="ltr">{done ? 'BINGO! 🎉' : `${table} × ${currentFactor} = ?`}</div>
    <div className="bingo-grid">{factors.map((factor, i) => { const marked = order.slice(0, idx).some(j => factors[j] === factor) || (solved && factor === currentFactor); return <button key={i} className={`bingo-tile ${marked ? 'marked' : ''}`} disabled={marked || done} onClick={() => choose(factor)}>{table * factor}{marked && <Check size={20}/>}</button>; })}</div>
    {message && <div className={`answer-feedback ${solved ? 'feedback-success' : 'feedback-error'}`}>{message}</div>}
    {solved && <button className="primary" onClick={() => { setIdx(i => i + 1); setSolved(false); setWrong(false); setMessage(''); }}>התרגיל הבא <ArrowLeft size={17}/></button>}
    {done && <div className="center-success inline-success">🏆 בינגו מלא! פתרת את כל 9 התרגילים!</div>}
    <button className="outline" onClick={newGame}><RotateCcw size={16}/> לוח חדש</button>
  </div>;
}
function ProgressPage({ profile, onWorld, onPractice }: { profile: Profile; onWorld: (id: number) => void; onPractice: (n: number,b?:number) => void }) {
  const earned = badgesFor(profile); const mastered = masteryCount(profile);
  const [selected,setSelected]=useState<[number,number]|null>(null);
  return <><div className="page-title"><div className="eyebrow">כל כוכב מספר סיפור</div><h1>ההישגים של {profile.name} 🏆</h1><p>כאן רואים את כל מה שכבר למדת ואת הצעד הבא בדרך לשליטה.</p></div>
    <section className="stat-grid"><Stat icon="⭐" value={formatNumber(profile.xp)} label="כוכבים" color="peach"/><Stat icon="🏅" value={earned.length.toString()} label="מדליות" color="lavender"/><Stat icon="🎯" value={`${mastered}/100`} label="צירופים בשליטה" color="mint"/><Stat icon="🧩" value={formatNumber(totalAttempts(profile))} label="תרגילים שפתרתי" color="sky"/></section>
    <section className="panel heatmap-panel"><div className="panel-head"><div><div className="eyebrow">לוח ההתקדמות שלי</div><h2>טבלת כפל חכמה</h2></div><div className="heatmap-legend"><span><i className="dot-unseen"/> חדש</span><span><i className="dot-needs"/> חיזוק</span><span><i className="dot-learning"/> מתרגלים</span><span><i className="dot-mastered"/> שליטה</span></div></div><p className="quiet-note">לוחצים על משבצת כדי לתרגל את הכפולות שלה. שליטה מתבססת על תשובות נכונות בכמה ימים שונים.</p><div className="heatmap-scroll"><div className="heatmap" role="table" aria-label="רמות השליטה בלוח הכפל"><div className="heat-header">×</div>{Array.from({ length: 10 }, (_, i) => <div className="heat-header" key={`x${i}`}>{i + 1}</div>)}{Array.from({ length: 10 }, (_, a) => [<div className="heat-header" key={`y${a}`}>{a + 1}</div>, ...Array.from({ length: 10 }, (_, b) => { const level = skillLevel(profile.skills[pairKey(a + 1, b + 1)]); return <button key={`${a}-${b}`} title={`${a + 1} × ${b + 1} = ${(a + 1) * (b + 1)} · ${levelLabel[level]}`} aria-label={`${a + 1} כפול ${b + 1}: ${levelLabel[level]}`} className={`heat-cell ${level}`} onClick={() => setSelected([a+1,b+1])}>{(a + 1) * (b + 1)}</button>; })])}</div></div></section>
    <section className="panel badge-panel"><div className="panel-head"><div><div className="eyebrow">איזה אוסף מדהים</div><h2>אוסף המדליות שלי</h2></div><span className="muted">{earned.length}/{BADGES.length} מדליות</span></div><div className="badge-grid">{BADGES.map(b => <div className={`badge-item ${earned.includes(b.id) ? 'unlocked' : 'not-yet'}`} key={b.id}><span className="badge-emoji">{earned.includes(b.id) ? b.icon : '🔒'}</span><b>{b.name}</b><span>{b.detail}</span></div>)}</div></section>
    {selected&&<section className="panel fact-details"><h2 dir="ltr">{selected[0]} × {selected[1]} = {selected[0]*selected[1]}</h2><p>{levelLabel[skillLevel(profile.skills[pairKey(...selected)])]}</p><p>ניסיונות עצמאיים מוצלחים: {profile.skills[pairKey(...selected)]?.firstCorrect??0} · ימים שבהם הצלחתם: {profile.skills[pairKey(...selected)]?.days.length??0}</p><button className="primary" onClick={()=>onPractice(selected[0],selected[1])}>מחזקים את התרגיל הזה</button><button className="secondary" onClick={()=>setSelected(null)}>סגירה</button></section>}
    <div className="section-heading"><h2>העולמות שכבר הכרתי</h2></div><div className="achievement-worlds">{WORLDS.filter(w => w.id !== 99).map(w => <button className="mini-world" key={w.id} disabled={!canOpenWorld(profile,w.id)} onClick={() => onWorld(w.id)}><span>{w.icon}</span><b>{w.short}</b>{!canOpenWorld(profile,w.id) ? <LockKeyhole size={17}/> : worldCompleted(profile, w.id) ? <CheckCircle2 size={17} className="green-check"/> : <span className="mini-world-dash">—</span>}</button>)}</div>
  </>;
}
function ParentsPage({ profile, onPractice, onReset }: { profile: Profile; onPractice: (n: number) => void; onReset: () => void }) {
  const total = totalAttempts(profile), first = firstHitCount(profile);
  const weak = Array.from({ length: 100 }, (_, i) => { const a = Math.floor(i / 10) + 1, b = i % 10 + 1; return { a, b, s: profile.skills[pairKey(a, b)] }; }).filter(x => x.s && skillLevel(x.s) !== 'mastered').sort((a, b) => ((b.s!.wrong * 2) - b.s!.firstCorrect) - ((a.s!.wrong * 2) - a.s!.firstCorrect)).slice(0, 8);
  const mastery = masteryCount(profile);
  const isChampion = badgesFor(profile).includes('champion');
  return <><div className="page-title"><div className="eyebrow">מבט להורים</div><h1>איך מתקדמים בלמידה? 📊</h1><p>נתוני התרגול וההתקדמות של {profile.name}, השמורים בענן בחשבון המשפחתי.</p></div>
    <section className="stat-grid"><Stat icon="🧮" value={formatNumber(total)} label="תרגילים שהושלמו" color="lavender"/><Stat icon="🎯" value={`${percent(first, total)}%`} label="דיוק בניסיון ראשון" color="mint"/><Stat icon="🗺️" value={`${ordinaryCompletedCount(profile)}/11`} label="עולמות לימוד" color="sky"/><Stat icon="🏆" value={`${mastery}/100`} label="צירופים בשליטה" color="peach"/></section>
    <div className="parent-columns"><section className="panel"><div className="panel-head"><div><div className="eyebrow">מיקוד חכם</div><h2>מה כדאי לחזק?</h2></div><Target size={26} color="#7756d9"/></div>{weak.length ? <div className="weak-list">{weak.map(x => <button key={`${x.a}x${x.b}`} onClick={() => onPractice(x.a)}><span dir="ltr">{x.a} × {x.b} = {x.a * x.b}</span><span>תרגול <ArrowLeft size={15}/></span></button>)}</div> : <p className="empty-state">עוד לא הצטבר מספיק מידע. התחילו לשחק כדי לראות המלצות ממוקדות.</p>}</section>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">תרגולים אחרונים</div><h2>יומן ההתקדמות</h2></div><BookOpen size={25} color="#7756d9"/></div>{profile.activity.length ? <div className="activity-list">{profile.activity.slice(0, 7).map((a, i) => <div key={`${a.when}_${i}`}><div><b>{a.label}</b><span>{byId(a.worldId).short} · {new Date(a.when).toLocaleDateString('he-IL')}</span></div><strong>{percent(a.correct, a.total)}%</strong></div>)}</div> : <p className="empty-state">לאחר השלמת תרגול ראשון יוצג כאן סיכום קצר.</p>}</section></div>
    <section className="panel parent-notes"><div><h2>💡 איך נקבעת שליטה אמיתית?</h2><p>כל צירוף (למשל 7×8) נחשב לנלמד היטב לאחר לפחות שתי הצלחות בניסיון ראשון, בשני ימים שונים וברצף הצלחות חיובי. סיום המבחן האחרון דורש גם דיוק של 90% לפחות וגם שליטה בכל 100 הצירופים. אפשר להגיע לשם במספר מפגשים, בלי לחץ זמן.</p></div><div className="note-bubble">🧠</div></section>
    <section className={`panel certificate ${isChampion ? 'has-certificate' : 'locked-certificate'}`}><div className="certificate-star">🏆</div><div className="eyebrow">תעודת הוקרה מיוחדת</div><h2>תעודת אלוף הכפל</h2><p className="certificate-name">מוענקת באהבה ל־{profile.name}</p><p>{isChampion ? 'על שליטה בכל לוח הכפל מ־1 עד 10!' : 'התעודה תיפתח אחרי שליטה בכל 100 הצירופים והצלחה במבחן אלופי הכפל.'}</p>{isChampion && <><p>{new Date().toLocaleDateString('he-IL')}</p><button className="primary print-certificate" onClick={() => window.print()}><Printer size={17}/> הדפסת התעודה</button></>}</section>
    <div className="settings-box panel"><Settings size={20}/><div><h3>איפוס התקדמות</h3><p>אפשר למחוק את כל הנקודות, המדליות וההתקדמות של הילד ולהתחיל מהתחלה.</p></div><button className="outline danger-text" onClick={onReset}><RotateCcw size={17}/> התחלה מחדש</button></div>
  </>;
}
export default App;
