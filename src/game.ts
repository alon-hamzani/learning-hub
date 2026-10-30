export type World = { id: number; name: string; short: string; subtitle: string; icon: string; shade: string; method: string; example: string };
export type Stage = 'guided' | 'practice' | 'checkpoint';
export type QuizMode = Stage | 'daily' | 'mixed' | 'focused' | 'rocket' | 'tower' | 'treasure';
export type QuestionType = 'number' | 'choice' | 'missing' | 'truefalse' | 'story' | 'visual';
export type Skill = { seen: number; firstCorrect: number; wrong: number; guidedCorrect: number; streak: number; lastAt: number; dueAt: number; days: string[] };
export type WorldProgress = { lesson?: boolean; guided?: boolean; practice?: boolean; checkpoint?: boolean; best?: number };
export type RecordAttempt = { when: number; worldId: number; correct: number; total: number; label: string };
export type Profile = {
  _revision?: number;
  id: string; name: string; avatar: string; joined: number; xp: number; sound: boolean;
  progress: Record<string, WorldProgress>; skills: Record<string, Skill>;
  activity: RecordAttempt[]; earnedBadges: string[]; dailyDate?: string;
};
export type Question = {
  uid: string; a: number; b: number; key: string; type: QuestionType;
  prompt: string; correctAnswer: string; options?: string[];
  hint: string; moreHint: string; explanation: string; shownResult?: number;
};
export const WORLDS: World[] = [
  { id: 0, name: 'הקסם של הכפל', short: 'ההתחלה', subtitle: 'מגלים מהי קבוצת פריטים ומהו כפל', icon: '🌈', shade: 'mint', method: 'כפל הוא חיבור של קבוצות שוות. נספור יחד ונראה איך חיבור הופך לכפל. וגם: אם אין קבוצות, או שיש 0 פריטים בכל קבוצה, התוצאה תמיד 0 (למשל 5 × 0 = 0).', example: '3 × 4 = 4 + 4 + 4 = 12' },
  { id: 1, name: 'כופלים באחד', short: 'כפולות 1', subtitle: 'כל מספר נשאר בדיוק כפי שהוא', icon: '🌱', shade: 'green', method: 'כל מספר כפול 1 נשאר אותו מספר. קבוצה אחת של 7 מכילה בדיוק 7 פריטים.', example: '1 × 7 = 7' },
  { id: 10, name: 'עולם העשרות', short: 'כפולות 10', subtitle: 'עשרות עגולות, ממש בקלות', icon: '🔟', shade: 'blue', method: 'כשכופלים מספר שלם ב־10 מקבלים עשר פעמים את המספר: אפשר להוסיף 0 מימין למספר.', example: '10 × 6 = 60' },
  { id: 2, name: 'חברים בזוגות', short: 'כפולות 2', subtitle: 'מכפילים מספרים בשניים', icon: '🦋', shade: 'pink', method: 'כפל ב־2 הוא אותו מספר ועוד אותו מספר. שתי קבוצות שוות בדיוק.', example: '2 × 6 = 6 + 6 = 12' },
  { id: 5, name: 'כוכבי החמש', short: 'כפולות 5', subtitle: 'סופרים בקפיצות של חמש', icon: '⭐', shade: 'yellow', method: 'סופרים 5, 10, 15, 20... התוצאה מסתיימת תמיד ב־0 או 5.', example: '5 × 4 = 5 + 5 + 5 + 5 = 20' },
  { id: 3, name: 'שלישיות שמחות', short: 'כפולות 3', subtitle: 'קבוצות של שלושה', icon: '🍓', shade: 'red', method: 'לכפל ב־3 אפשר לחבר שלוש פעמים את המספר, או להוסיף עוד קבוצה לכפל ב־2.', example: '3 × 6 = 2 × 6 + 6 = 18' },
  { id: 4, name: 'כפול כפול', short: 'כפולות 4', subtitle: 'מכפילים בשניים פעמיים', icon: '🎲', shade: 'violet', method: 'כפל ב־4 הוא להכפיל ב־2, ואז שוב להכפיל ב־2.', example: '4 × 6 = 2 × (2 × 6) = 24' },
  { id: 6, name: 'סוד השש', short: 'כפולות 6', subtitle: 'משתמשים בכפולות של חמש', icon: '🚀', shade: 'blue', method: 'כדי לכפול ב־6 אפשר לכפול ב־5 ולהוסיף עוד פעם את המספר.', example: '6 × 7 = 5 × 7 + 7 = 42' },
  { id: 7, name: 'שבעת האוצרות', short: 'כפולות 7', subtitle: 'מפרקים תרגילים ומגלים אוצרות', icon: '💎', shade: 'pink', method: 'אפשר לפרק את 7 ל־5 ועוד 2, ולחבר שתי תוצאות שכבר מכירים.', example: '7 × 8 = 5 × 8 + 2 × 8 = 56' },
  { id: 8, name: 'טורבו שמונה', short: 'כפולות 8', subtitle: 'כופלים בשניים שלוש פעמים', icon: '⚡', shade: 'yellow', method: 'כפל ב־8 הוא להכפיל בשניים, שוב בשניים, ושוב בשניים.', example: '8 × 3 = 6 → 12 → 24' },
  { id: 9, name: 'קסם התשע', short: 'כפולות 9', subtitle: 'מגלים טריק מבריק', icon: '🪄', shade: 'violet', method: 'כדי לכפול ב־9 אפשר לכפול ב־10 ואז להפחית פעם אחת את המספר.', example: '9 × 7 = 70 − 7 = 63' },
  { id: 99, name: 'אקדמיית האלופים', short: 'אתגר הסיום', subtitle: 'כל לוח הכפל מעורבב!', icon: '🏆', shade: 'yellow', method: 'עכשיו מחברים את כל מה שלמדנו ומתרגלים מכל הלוח.', example: 'כל הכפולות יחד!' },
];
export const AVATARS = ['🦊', '🦁', '🐼', '🐬', '🐸', '🦄', '🐨', '🐯'];
export const BADGES = [
  { id: 'first', icon: '🌟', name: 'כוכב ראשון', detail: 'פתרת את התרגיל הראשון' },
  { id: 'hundred', icon: '💯', name: 'מאה נקודות', detail: 'צברת 100 נקודות' },
  { id: 'fivehundred', icon: '💎', name: 'אספן יהלומים', detail: 'צברת 500 נקודות' },
  { id: 'thousand', icon: '👑', name: 'מלך הנקודות', detail: 'צברת 1,000 נקודות' },
  { id: 'three', icon: '🧠', name: 'מוח של כפל', detail: 'סיימת שלושה עולמות' },
  { id: 'six', icon: '🚀', name: 'טייס הכפל', detail: 'סיימת שישה עולמות' },
  { id: 'ten', icon: '🏅', name: 'גיבור המסע', detail: 'סיימת את כל עולמות הלמידה' },
  { id: 'accuracy', icon: '🎯', name: 'עין חדה', detail: 'צברת עשרים הצלחות בניסיון ראשון' },
  { id: 'champion', icon: '🏆', name: 'אלוף לוח הכפל', detail: 'שליטה בכל 100 הצירופים ואתגר סיום מוצלח' },
] as const;

export const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const shuffle = <T,>(arr: T[]): T[] => {
  const copied = [...arr];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = rand(0, i); [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
};
export const pairKey = (a: number, b: number) => `${a}x${b}`;
export const dayKey = (now = Date.now()) => new Date(now).toLocaleDateString('en-CA');
export const skillLevel = (s?: Skill): 'unseen' | 'needs' | 'learning' | 'mastered' => {
  if (!s || s.seen === 0) return 'unseen';
  if (s.firstCorrect >= 2 && s.days.length >= 2 && s.streak >= 2) return 'mastered';
  if (s.firstCorrect > 0 && s.streak > 0) return 'learning';
  return 'needs';
};
export const masteryCount = (p: Profile) => Array.from({ length: 100 }, (_, index) => {
  const a = Math.floor(index / 10) + 1, b = (index % 10) + 1;
  return skillLevel(p.skills[pairKey(a, b)]) === 'mastered' ? 1 : 0;
}).reduce<number>((a, b) => a + b, 0);
export const totalAttempts = (p: Profile) => Object.values(p.skills).reduce((sum, s) => sum + s.seen, 0);
export const firstHitCount = (p: Profile) => Object.values(p.skills).reduce((sum, s) => sum + s.firstCorrect, 0);
export const worldCompleted = (p: Profile, id: number) => Boolean(p.progress[id]?.checkpoint);
export const ordinaryCompletedCount = (p: Profile) => WORLDS.filter(w => w.id !== 99 && worldCompleted(p, w.id)).length;
export const worldIsUnlocked = (p: Profile, index: number) => index >= 0 && index < WORLDS.length &&
  WORLDS.slice(0, index).every(w => worldCompleted(p, w.id));
export const canOpenWorld = (p: Profile, id: number) => worldIsUnlocked(p, WORLDS.findIndex(w => w.id === id));
export const canStartQuiz = (p: Profile, id: number, mode: QuizMode) => {
  if (!canOpenWorld(p, id)) return false;
  const progress = p.progress[id];
  return mode === 'guided' ? Boolean(progress?.lesson)
    : mode === 'practice' ? Boolean(progress?.guided)
    : mode === 'checkpoint' ? Boolean(progress?.practice) : true;
};
export const currentWorldIndex = (p: Profile) => {
  const idx = WORLDS.findIndex((_, i) => !worldIsUnlocked(p, i) || !worldCompleted(p, WORLDS[i].id));
  return idx === -1 ? WORLDS.length - 1 : Math.max(0, idx);
};
export function badgesFor(p: Profile): string[] {
  const done = ordinaryCompletedCount(p);
  const hits = firstHitCount(p);
  return [...(p.earnedBadges || []),
    ...(totalAttempts(p) > 0 ? ['first'] : []),
    ...(p.xp >= 100 ? ['hundred'] : []), ...(p.xp >= 500 ? ['fivehundred'] : []),
    ...(p.xp >= 1000 ? ['thousand'] : []), ...(done >= 3 ? ['three'] : []),
    ...(done >= 6 ? ['six'] : []), ...(done >= 11 ? ['ten'] : []),
    ...(hits >= 20 ? ['accuracy'] : []),
    ...(p.progress[99]?.checkpoint && masteryCount(p) === 100 ? ['champion'] : []),
  ].filter((badge, index, list) => list.indexOf(badge) === index);
}
export function recordSkill(p: Profile, question: Question, firstTry: boolean, assisted: boolean): Profile {
  const now = Date.now();
  const old = p.skills[question.key] ?? { seen: 0, firstCorrect: 0, wrong: 0, guidedCorrect: 0, streak: 0, lastAt: 0, dueAt: 0, days: [] };
  const success = firstTry || assisted;
  const nextStreak = firstTry ? old.streak + 1 : 0;
  const days = firstTry && !old.days.includes(dayKey(now)) ? [...old.days, dayKey(now)] : old.days;
  const intervals = [0, 60 * 60 * 1000, 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];
  const due = now + (firstTry ? intervals[Math.min(nextStreak, intervals.length - 1)] : 6 * 60 * 1000);
  return { ...p, skills: { ...p.skills, [question.key]: {
    seen: old.seen + 1, firstCorrect: old.firstCorrect + Number(firstTry), wrong: old.wrong + Number(!firstTry),
    guidedCorrect: old.guidedCorrect + Number(success), streak: nextStreak,
    lastAt: now, dueAt: due, days,
  } } };
}
function pickFact(worldId: number, profile: Profile, mode: QuizMode, index: number, previously: string[]): [number, number] {
  if (worldId === 0) return [rand(2, 5), rand(1, 5)];
  if (worldId !== 99 && mode !== 'mixed' && mode !== 'daily' && mode !== 'focused') {
    if (mode === 'guided') return [worldId, (index % 10) + 1];
    if (mode === 'checkpoint') return [worldId, (index % 10) + 1];
  }
  const candidates: [number, number][] = [];
  if (worldId === 99 || mode === 'mixed' || mode === 'daily') {
    const unlocked = WORLDS.filter((_, i) => i > 0 && i < WORLDS.length - 1 && worldIsUnlocked(profile, i)).map(w => w.id);
    const tables = worldId === 99 ? Array.from({ length: 10 }, (_, i) => i + 1) : unlocked.length ? unlocked : [1, 2];
    for (const a of tables) for (let b = 1; b <= 10; b++) candidates.push([a, b]);
  } else {
    for (let b = 1; b <= 10; b++) candidates.push([worldId, b]);
  }
  const last4 = previously.slice(-4);
  const ranked = candidates.map(pair => {
    const s = profile.skills[pairKey(...pair)];
    const unseen = !s?.seen;
    const due = s && s.dueAt < Date.now();
    const weak = s && (s.wrong > s.firstCorrect || s.streak === 0);
    const novelty = last4.includes(pairKey(...pair)) ? -100 : 0;
    return { pair, weight: novelty + (unseen ? 16 : 0) + (due ? 12 : 0) + (weak ? 12 : 0) + rand(0, 18) - (s?.seen ?? 0) * 0.4 };
  }).sort((a, b) => b.weight - a.weight);
  return ranked[0]?.pair || [1, 1];
}
export function makeQuestion(a: number, b: number, type: QuestionType = 'number'): Question {
  const answer = a * b;
  const key = pairKey(a, b);
  const base = { uid: `${key}_${Math.random().toString(36).slice(2, 9)}`, key, a, b };
  const hint = `יש ${a} קבוצות של ${b}. אפשר לחשב ${Array.from({ length: a }, () => b).join(' + ')}.`;
  const moreHint = a > 1 ? `אפשר להשתמש בתרגיל קטן יותר: ${a - 1} × ${b} = ${(a - 1) * b}, ואז להוסיף ${b}.` : `קבוצה אחת של ${b} מכילה ${b} פריטים.`;
  const explanation = `${a} × ${b} = ${answer}. ${a} קבוצות של ${b} פריטים הן ${answer} פריטים.`;
  if (type === 'missing') {
    const first = Math.random() > .5;
    return { ...base, type, prompt: first ? `${a} × ? = ${answer}` : `? × ${b} = ${answer}`, correctAnswer: String(first ? b : a), hint, moreHint, explanation };
  }
  if (type === 'choice') {
    const possible = new Set([String(answer)]);
    for (const d of shuffle([-20, -10, -b, -a, -2, -1, 1, 2, a, b, 10, 20])) {
      if (possible.size === 4) break;
      if (answer + d >= 0 && answer + d <= 110) possible.add(String(answer + d));
    }
    for (let n = 0; possible.size < 4; n++) possible.add(String(answer + n + 1));
    return { ...base, type, prompt: `${a} × ${b} = ?`, correctAnswer: String(answer), options: shuffle([...possible]), hint, moreHint, explanation };
  }
  if (type === 'truefalse') {
    const valid = Math.random() > .5;
    const offset = shuffle([-10, -5, -3, -2, -1, 1, 2, 3, 5, 10]).find(d => answer + d >= 0) ?? 1;
    const shownResult = valid ? answer : answer + offset;
    return { ...base, type, prompt: `${a} × ${b} = ${shownResult}`, shownResult, correctAnswer: valid ? 'נכון' : 'לא נכון', options: ['נכון', 'לא נכון'], hint, moreHint, explanation };
  }
  if (type === 'story') {
    const objects = shuffle(['מדבקות', 'כוכבים', 'גולות', 'קוביות', 'פרחים'])[0];
    return { ...base, type, prompt: `לילד יש ${a} קופסאות. בכל קופסה ${b} ${objects}. כמה ${objects} יש בסך הכול?`, correctAnswer: String(answer), hint, moreHint, explanation };
  }
  if (type === 'visual') return { ...base, type, prompt: `כמה נקודות יש ב־${a} הקבוצות?`, correctAnswer: String(answer), hint, moreHint, explanation };
  return { ...base, type: 'number', prompt: `${a} × ${b} = ?`, correctAnswer: String(answer), hint, moreHint, explanation };
}
export function makeQuiz(worldId: number, mode: QuizMode, profile: Profile, selectedTable?: number): Question[] {
  const lengths: Record<QuizMode, number> = { guided: 8, practice: 24, checkpoint: 20, daily: 12, mixed: 30, focused: 20, rocket: 12, tower: 12, treasure: 12 };
  const types: QuestionType[] = mode === 'guided' ? ['visual', 'choice', 'number', 'visual', 'missing', 'choice', 'number', 'story']
    : mode === 'checkpoint' || mode === 'mixed' ? ['number', 'missing', 'choice', 'truefalse', 'story']
    : ['number', 'choice', 'missing', 'visual', 'truefalse', 'story'];
  const length = lengths[mode];
  const previous: string[] = [];
  let facts: [number, number][] = [];
  if (mode === 'checkpoint' && worldId !== 99 && worldId !== 0) {
    facts = shuffle(Array.from({ length: 20 }, (_, i) => [worldId, (i % 10) + 1] as [number, number]));
  } else if (mode === 'guided' && worldId !== 99) {
    facts = shuffle(Array.from({ length: length }, (_, i) => worldId === 0 ? [2 + i % 3, 2 + i % 4] as [number, number] : [worldId, i + 1] as [number, number]));
  } else if (mode === 'practice' && worldId !== 99 && worldId !== 0) {
    facts = shuffle([...Array.from({ length: 10 }, (_, i) => [worldId, i + 1] as [number, number]), ...Array.from({ length: 10 }, (_, i) => [worldId, i + 1] as [number, number]), ...Array.from({ length: 4 }, () => [worldId, rand(1, 10)] as [number, number])]);
  } else {
    const adjustedWorld = selectedTable && selectedTable > 0 && mode !== 'mixed' ? selectedTable : worldId;
    for (let i = 0; i < length; i++) {
      const fact = pickFact(adjustedWorld, profile, mode, i, previous);
      facts.push(fact);
      previous.push(pairKey(...fact));
    }
  }
  return facts.map(([a, b], i) => makeQuestion(a, b, types[i % types.length]));
}
export function createProfile(name: string, avatar: string): Profile {
  return { id: `kid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: name.trim().slice(0, 22), avatar,
    joined: Date.now(), xp: 0, sound: false, progress: {}, skills: {}, activity: [], earnedBadges: [] };
}
export const percent = (n: number, d: number) => d ? Math.round(n / d * 100) : 0;
export const formatNumber = (n: number) => n.toLocaleString('he-IL');
