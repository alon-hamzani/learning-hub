import { BookOpen, LockKeyhole, Play, Sparkles } from 'lucide-react';
import type { CatalogGame } from './cloud';
import { moduleInstalled } from './games/registry';

export default function LearningHub({ games, displayName, openGame, isAdmin }: {
  games: CatalogGame[];
  displayName: string;
  openGame: (game: CatalogGame) => void;
  isAdmin: boolean;
}) {
  const available = games.filter(g => g.active && moduleInstalled(g.module_key));
  const unpublished = games.filter(g => g.active && !moduleInstalled(g.module_key));
  return <main className="hub" dir="rtl">
    <section className="hub-hero">
      <div className="hub-overline"><Sparkles size={18}/> Learning Hub · לומדים ומשחקים ביחד</div>
      <h1>שלום, {displayName.split(' ')[0] || 'חברים'}! 👋</h1>
      <p>בחרו משחק, גלו עולמות חדשים והמשיכו ללמוד בדיוק מהמקום שבו עצרתם.</p>
      <div className="hub-hero-stat"><BookOpen size={18}/> {available.length} {available.length === 1 ? 'משחק זמין' : 'משחקים זמינים'} בספרייה שלכם</div>
    </section>
    <section className="hub-content" aria-label="ספריית המשחקים">
      <div className="hub-title"><h2>המשחקים שלי</h2><span>כל המשחקים שהוקצו לחשבון שלכם</span></div>
      {available.length === 0 ? <div className="hub-empty">
        <div className="hub-empty-icon"><LockKeyhole size={32}/></div>
        <h3>עוד לא הוקצו לכם משחקים</h3>
        <p>החשבון שלכם אושר, אבל מנהל המערכת עדיין לא בחר עבורכם משחקים. המשחקים יופיעו כאן לאחר ההקצאה.</p>
      </div> : <div className="hub-grid">
        {available.map(game => <article className="hub-game-card" key={game.id}>
          <div className="hub-card-graphic" aria-hidden="true"><span className="hub-game-icon">{game.icon}</span><span className="hub-graphic-star">✦</span></div>
          <div className="hub-card-body"><h3>{game.title}</h3><p>{game.description}</p>
            <button className="hub-play" onClick={() => openGame(game)}><Play size={18}/> בואו נשחק!</button>
          </div>
        </article>)}
      </div>}
      {isAdmin && unpublished.length > 0 && <p className="hub-admin-hint">לידיעת מנהל המערכת: {unpublished.length} משחקים רשומים אך טרם הותקן עבורם מודול React. יש להוסיף קוד לרישום המודולים ולפרסם גרסה חדשה.</p>}
    </section>
  </main>;
}
