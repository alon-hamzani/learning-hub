import { BookOpen, LockKeyhole, Play, Sparkles } from 'lucide-react';
import type { CatalogGame } from './cloud';
import { moduleInstalled } from './games/registry';
import type {Profile} from './game';
import {useState} from 'react';

export default function LearningHub({ games, displayName, openGame, isAdmin,profiles=[] }: {
  profiles?:Profile[];
  games: CatalogGame[];
  displayName: string;
  openGame: (game: CatalogGame) => void;
  isAdmin: boolean;
}) {
  const [child,setChild]=useState(()=>{try{return localStorage.getItem('learning-hub:active-profile')||'';}catch{return '';}});
  const [showFamilyInfo,setShowFamilyInfo]=useState(()=>{try{return localStorage.getItem('learning-hub:family-info-seen')!=='yes';}catch{return true;}});
  const selected=profiles.find(p=>p.id===child);
  const available = games.filter(g => g.active && moduleInstalled(g.module_key));
  const unpublished = games.filter(g => g.active && !moduleInstalled(g.module_key));
  return <main className="hub" dir="rtl">
    <section className="hub-hero">
      <div className="hub-overline"><Sparkles size={18}/> Learning Hub · לומדים ומשחקים ביחד</div>
      <h1>שלום, {selected?.name||displayName.split(' ')[0] || 'חברים'}! 👋</h1>
      <p>בחרו משחק, גלו עולמות חדשים והמשיכו ללמוד בדיוק מהמקום שבו עצרתם.</p>
      <div className="hub-hero-stat"><BookOpen size={18}/> {available.length} {available.length === 1 ? 'משחק זמין' : 'משחקים זמינים'} בספרייה שלכם</div>
    </section>
    <section className="hub-content" aria-label="ספריית המשחקים">
      {profiles.length>0&&<section className="family-picker" aria-label="מי משחק היום?"><h2>מי יוצא היום להרפתקה?</h2><div>{profiles.map(profile=><button className={profile.id===child?'selected':''} aria-pressed={profile.id===child} key={profile.id} onClick={()=>{setChild(profile.id);try{localStorage.setItem('learning-hub:active-profile',profile.id);}catch{/* optional preference */}}}><span>{profile.avatar}</span>{profile.name}</button>)}</div>{selected&&<p>המסע של {selected.name}: ⭐ {selected.xp.toLocaleString('he-IL')} כוכבים במסע הכפל</p>}</section>}
      <details className="family-info" open={showFamilyInfo} onToggle={event=>{setShowFamilyInfo(event.currentTarget.open);try{localStorage.setItem('learning-hub:family-info-seen','yes');}catch{/* optional preference */}}}><summary>👨‍👩‍👧‍👦 הורים, שימו לב! חשבון משפחתי, התקדמות אישית</summary><p>גם אם התחברתם עם חשבון Google שלכם, אפשר להגדיר מספר ילדים בחשבון המשפחתי. לכל ילד נשמרות ההתקדמות, הנקודות וההישגים בנפרד בכל משחק. כך כל ילד לומד ומשחק בקצב שלו! 🌟</p></details>
      <div className="hub-title"><h2>המשחקים שלי</h2><span>כל המשחקים שהוקצו לחשבון שלכם</span></div>
      {available.length === 0 ? <div className="hub-empty">
        <div className="hub-empty-icon"><LockKeyhole size={32}/></div>
        <h3>עוד לא הוקצו לכם משחקים</h3>
        <p>החשבון שלכם אושר, אבל מנהל המערכת עדיין לא בחר עבורכם משחקים. המשחקים יופיעו כאן לאחר ההקצאה.</p>
      </div> : <div className="hub-grid">
        {available.map(game => <article className="hub-game-card" key={game.id}>
          <div className="hub-card-graphic" aria-hidden="true">{game.module_key==='multiplication-quest'?<img src={`${import.meta.env.BASE_URL}multiplication-notebook.svg`} alt="" width="280" height="180"/>:<span className="hub-game-icon">{game.icon}</span>}<span className="hub-graphic-star">✦</span></div>
          <div className="hub-card-body"><h3>{game.title}</h3><p>{game.description}</p>
            <button className="hub-play" onClick={() => openGame(game)}><Play size={18}/> בואו נשחק!</button>
          </div>
        </article>)}
      </div>}
      {isAdmin && unpublished.length > 0 && <p className="hub-admin-hint">לידיעת מנהל המערכת: {unpublished.length} משחקים רשומים אך טרם הותקן עבורם מודול React. יש להוסיף קוד לרישום המודולים ולפרסם גרסה חדשה.</p>}
    </section>
  </main>;
}
