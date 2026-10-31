import {useEffect,useMemo,useRef,useState} from 'react';
import {makeQuestion,rand,shuffle} from '../game';
import type {Question} from '../game';
import {sound} from './audio';
export type BonusKind='maze'|'robot'|'builder'|'treasure'|'race'|'rhythm';
export const BONUS_GAMES:{id:BonusKind;icon:string;title:string;description:string}[]=[
 {id:'maze',icon:'🧩',title:'מבוך המספרים',description:'מוצאים דרך, פותחים שערים ומגיעים לדגל'},
 {id:'robot',icon:'🤖',title:'מפעל הרובוטים',description:'מרכיבים הזמנות של חלקים בקבוצות שוות'},
 {id:'builder',icon:'🧱',title:'אדריכלי הקוביות',description:'בונים מבנים משורות ועמודות לפי תוכנית'},
 {id:'treasure',icon:'🗺️',title:'צייד האוצרות',description:'חושפים מפה ומשתמשים ברמזי כפל'},
 {id:'race',icon:'🏎️',title:'מרוץ המסלולים',description:'נוהגים בין נתיבים ובוחרים שערי כפל'},
 {id:'rhythm',icon:'🥁',title:'תזמורת הכפל',description:'בונים קבוצות של פעימות ויוצרים מנגינה'},
];
export type MiniInteraction=(q:Question,action:'answer'|'hint'|'reveal',response?:string)=>void;
type Props={kind:BonusKind;table:number;enabled:boolean;onEvent:MiniInteraction;onRecord:(q:Question,first:boolean,points:number,resolved:boolean)=>void};
export default function BonusAdventure({kind,table,enabled,onRecord,onEvent}:Props){
 const [round,setRound]=useState(0),[wrong,setWrong]=useState(false),[message,setMessage]=useState(''),[won,setWon]=useState(false),[reset,setReset]=useState(0);
 const q=useMemo(()=>({...makeQuestion(table,rand(1,10)),activity:kind}),[table,round,reset,kind]);
 const completed=useRef(new Set<string>());
 const finish=(correct:boolean)=>{if(won||completed.current.has(q.uid))return;onEvent(q,'answer',correct?q.correctAnswer:'בנייה לא מתאימה');if(!correct){setWrong(true);setMessage('עוד ניסיון! בדקו את הקבוצות והכמויות.');sound('wrong',enabled);return;}completed.current.add(q.uid);onRecord(q,!wrong,wrong?6:10,true);sound(round===4?'complete':'correct',enabled);setMessage('המשימה הושלמה! 🌟');if(round===4)setWon(true);else{setRound(r=>r+1);setWrong(false);}};
 const info=BONUS_GAMES.find(g=>g.id===kind)!;
 return <section className="panel bonus-adventure"><header><h2>{info.icon} {info.title}</h2><span>משימה {Math.min(round+1,5)} מתוך 5</span></header><p>{info.description}</p>{won?<div className="bonus-victory"><div>🏆</div><h2>השלמתם את המשימה!</h2><p>פתרתם, בניתם והתקדמתם בדרך שלכם.</p><button className="primary" onClick={()=>{setRound(0);setWrong(false);setMessage('');setWon(false);setReset(r=>r+1);}}>הרפתקה חדשה</button></div>:<div key={`${round}-${reset}`}>
 {kind==='maze'&&<Maze q={q} onFinish={finish}/>}
 {kind==='robot'&&<Robot q={q} onFinish={finish}/>}
 {kind==='builder'&&<Builder q={q} onFinish={finish}/>}
 {kind==='treasure'&&<Treasure q={q} onFinish={finish}/>}
 {kind==='race'&&<Race q={q} onFinish={finish}/>}
 {kind==='rhythm'&&<Rhythm q={q} enabled={enabled} onFinish={finish}/>}
 </div>}<p className="bonus-feedback" role="status">{message}</p></section>;
}
function Maze({q,onFinish}:{q:Question;onFinish:(ok:boolean)=>void}){
 const [position,setPosition]=useState(20),[keys,setKeys]=useState<number[]>([]);
 const walls=[2,7,12,17],doors=[4,9,14,19],options=useMemo(()=>shuffle([q.a*q.b,q.a*q.b+q.a,q.a*q.b+1,q.a*q.b+2]),[q]);
 const move=(next:number)=>{if(next<0||next>=25||walls.includes(next))return;if(doors.includes(next)){const ok=options[doors.indexOf(next)]===q.a*q.b;if(ok){if(!keys.includes(next))setKeys([...keys,next]);}else{onFinish(false);return;}}setPosition(next);if(next===24){if(keys.length)onFinish(true);else onFinish(false);}};
 return <><h3>פותחים שער שתוצאתו <span dir="ltr">{q.a} × {q.b}</span>, אוספים מפתח וחוזרים לדגל.</h3><div className="maze-board">{Array.from({length:25},(_,i)=>{const adjacent=Math.abs(position-i)===5||(Math.floor(position/5)===Math.floor(i/5)&&Math.abs(position-i)===1);return <button key={i} disabled={!adjacent||walls.includes(i)} className={`${walls.includes(i)?'wall':''} ${doors.includes(i)?'door':''} ${position===i?'player':''}`} aria-label={position===i?'המיקום שלי':walls.includes(i)?'קיר':i===24?'דגל הסיום':doors.includes(i)?`שער ${options[doors.indexOf(i)]}`:`משבצת ${i+1}`} onClick={()=>move(i)}>{position===i?'🦊':walls.includes(i)?'🌳':i===24?'🏁':doors.includes(i)?keys.includes(i)?'🔑':options[doors.indexOf(i)]:'·'}</button>;})}</div><p>נוגעים במשבצת סמוכה כדי להתקדם. מפתחות: {keys.length}</p><button className="secondary" onClick={()=>setPosition(20)}>חזרה לנקודת ההתחלה</button></>;
}
function Robot({q,onFinish}:{q:Question;onFinish:(ok:boolean)=>void}){
 const [parts,setParts]=useState<number[]>([]),[selected,setSelected]=useState(q.b);
 return <><h3>הזמנה: {q.a} יחידות, בכל אחת {q.b} גלגלי שיניים</h3><div className="robot-body"><div className="robot-face">🤖</div><div className="robot-parts">{parts.map((n,i)=><button key={i} title="הסרת יחידה" onClick={()=>setParts(p=>p.filter((_,index)=>index!==i))}>{'⚙️'.repeat(n)}</button>)}</div></div><p>בחרו אריזה והוסיפו אותה לרובוט. אפשר להסיר אריזה בלחיצה.</p><div className="table-tools">{[Math.max(1,q.b-1),q.b,q.b+1].filter((n,i,list)=>list.indexOf(n)===i).map(n=><button className={selected===n?'primary':'secondary'} key={n} onClick={()=>setSelected(n)}>אריזה של {n}</button>)}</div><button className="secondary" disabled={parts.length>=10} onClick={()=>setParts(p=>[...p,selected])}>הוספת אריזה</button><button className="primary" onClick={()=>onFinish(parts.length===q.a&&parts.every(n=>n===q.b))}>בדיקת ההזמנה</button><p>נבנו {parts.length} יחידות · {parts.reduce((sum,n)=>sum+n,0)} גלגלים</p></>;
}
function Builder({q,onFinish}:{q:Question;onFinish:(ok:boolean)=>void}){
 const [blocks,setBlocks]=useState<boolean[]>(()=>Array(100).fill(false)),[draw,setDraw]=useState(false);
 const toggle=(index:number)=>setBlocks(prev=>prev.map((value,i)=>i===index?!value:value));
 return <><h3>תוכנית בנייה: מלבן של {q.a} שורות ו־{q.b} קוביות בכל שורה</h3><p>בונים מהפינה הימנית העליונה. נוגעים בתא להוספת קובייה או להסרתה.</p><div className="builder-grid" onPointerUp={()=>setDraw(false)} onPointerLeave={()=>setDraw(false)}>{blocks.map((filled,i)=><button key={i} aria-label={`שורה ${Math.floor(i/10)+1}, עמודה ${i%10+1}`} aria-pressed={filled} onPointerDown={()=>setDraw(true)} onPointerEnter={e=>{if(draw&&e.buttons===1&&!filled)toggle(i);}} onClick={()=>toggle(i)}>{filled?'🧱':'·'}</button>)}</div><p>במבנה יש {blocks.filter(Boolean).length} קוביות.</p><button className="primary" onClick={()=>onFinish(blocks.every((filled,i)=>filled===(Math.floor(i/10)<q.a&&i%10<q.b)))}>בדיקת המבנה</button><button className="secondary" onClick={()=>setBlocks(Array(100).fill(false))}>פירוק המבנה בלבד</button></>;
}
function Treasure({q,onFinish}:{q:Question;onFinish:(ok:boolean)=>void}){
 const [revealed,setRevealed]=useState<number[]>([]),[clue,setClue]=useState(0);
 const cells=useMemo(()=>shuffle(Array.from({length:10},(_,i)=>(i+1)*q.a)),[q]);
 return <><h3>המפה אומרת: האוצר נמצא ליד הכמות של {q.a} קבוצות עם {q.b} יהלומים בכל קבוצה</h3><p>חוקרים את האיים ומשתמשים ברמזים. האוצר היחיד נמצא מתחת למספר המתאים.</p><div className="treasure-map">{cells.map((value,i)=><button disabled={revealed.includes(i)} key={i} onClick={()=>{setRevealed(prev=>[...prev,i]);if(value===q.a*q.b)onFinish(true);else{onFinish(false);setClue(value<q.a*q.b?1:-1);}}}><span>{revealed.includes(i)?'🐚':i%3===0?'🏝️':'🌴'}</span><b>{value}</b></button>)}</div><p>{clue===1?'מצאתם צדף. חפשו כמות גדולה יותר.':clue===-1?'מצאתם צדף. חפשו כמות קטנה יותר.':'כל אי מסתיר משהו. המספר הוא חלק מהרמז.'}</p></>;
}
function Race({q,onFinish}:{q:Question;onFinish:(ok:boolean)=>void}){
 const [lane,setLane]=useState(1),[distance,setDistance]=useState(0),[driving,setDriving]=useState(false);
 const choices=useMemo(()=>shuffle([q.a*q.b,q.a*q.b+q.a,q.a*q.b+1]),[q]);
 const callback=useRef(onFinish);callback.current=onFinish;
 useEffect(()=>{if(!driving)return;const timer=setInterval(()=>setDistance(d=>Math.min(100,d+2)),65);return()=>clearInterval(timer);},[driving]);
 useEffect(()=>{if(distance>=100&&driving){setDriving(false);setDistance(0);callback.current(choices[lane]===q.a*q.b);}},[distance,driving,lane,choices]);
 return <><h3>בחרו את נתיב <span dir="ltr">{q.a} × {q.b}</span>, ואז נוסעים אל השער</h3><div className="race-road"><div className="race-gates">{choices.map((choice,i)=><button aria-pressed={lane===i} key={i} onClick={()=>setLane(i)}>{choice}</button>)}</div><div className="race-car" style={{left:`${lane*33.33+8}%`,bottom:`${15+distance*.55}%`}}>🏎️</div><span className="road-line line-one"/><span className="road-line line-two"/></div><div className="race-controls"><button className="secondary" disabled={lane===0} onClick={()=>setLane(l=>l-1)}>נתיב שמאלה</button><button className="primary" onClick={()=>setDriving(d=>!d)}>{driving?'עוצרים לחשוב':'נוסעים!'}</button><button className="secondary" disabled={lane===2} onClick={()=>setLane(l=>l+1)}>נתיב ימינה</button></div><p>אין לחץ זמן. אפשר לעצור ולבחור נתיב בכל רגע.</p></>;
}
function Rhythm({q,enabled,onFinish}:{q:Question;enabled:boolean;onFinish:(ok:boolean)=>void}){
 const [beats,setBeats]=useState<boolean[]>(()=>Array(q.a*10).fill(false)),[playing,setPlaying]=useState(-1);
 useEffect(()=>{if(playing<0)return;const timer=setTimeout(()=>{if(beats[playing])sound('tap',enabled);setPlaying(p=>p+1>=beats.length?-1:p+1);},160);return()=>clearTimeout(timer);},[playing,beats,enabled]);
 return <><h3>מכינים {q.a} תיבות קצב. בכל תיבה {q.b} פעימות.</h3><p>מסמנים פעימות בכל שורה ואז מאזינים ליצירה. אפשר גם לראות את הסמן בלי צליל.</p><div className="rhythm-grid">{beats.map((active,i)=><button key={i} className={`${active?'active':''} ${playing===i?'playing':''}`} aria-label={`תיבה ${Math.floor(i/10)+1}, פעימה ${i%10+1}`} aria-pressed={active} onClick={()=>setBeats(prev=>prev.map((value,index)=>index===i?!value:value))}>{active?'♪':'·'}</button>)}</div><p>{beats.filter(Boolean).length} פעימות ביצירה</p><button className="secondary" onClick={()=>setPlaying(p=>p<0?0:-1)}>{playing<0?'▶ מאזינים ורואים':'■ עצירה'}</button><button className="primary" onClick={()=>onFinish(Array.from({length:q.a},(_,row)=>beats.slice(row*10,row*10+10).filter(Boolean).length).every(n=>n===q.b))}>בדיקת היצירה</button></>;
}
