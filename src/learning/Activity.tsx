import {useState} from 'react';
import type {Question} from '../game';
import NumberPad from './NumberPad';
export default function Activity({question:q,index,disabled,onAnswer}:{question:Question;index:number;disabled:boolean;onAnswer:(answer:string)=>void}) {
  const [value,setValue]=useState(''),[picked,setPicked]=useState<string|null>(null),[source,setSource]=useState(false),[flipped,setFlipped]=useState<string[]>([]);
  const correct=q.correctAnswer;
  const options=q.options??Array.from(new Set([correct,...[1,-1,2,-2,3,4].map(d=>String(Math.max(0,Number(correct)+d)))] )).slice(0,4).sort((a,b)=>Number(a)-Number(b));
  const mode=q.type==='truefalse'||(index%5===4&&q.options)?3:index%5;
  const instructions=['מחברים: נוגעים בתרגיל ואז בתוצאה המתאימה','גוררים תוצאה אל התרגיל, או בוחרים תוצאה ואז נוגעים במשבצת','מתאימים זוג: בוחרים את התרגיל ואז את התוצאה שלו','בוחרים את התשובה המתאימה','מקלידים תשובה בלוח המספרים'];
  if(mode===4&&!q.options)return <div className="activity"><p>{instructions[mode]}</p><NumberPad value={value} onChange={setValue} onSubmit={()=>onAnswer(value)} disabled={disabled}/><input className="keyboard-answer" aria-label="תשובה במקלדת, אופציונלי" value={value} inputMode="none" onChange={e=>setValue(e.target.value.replace(/\D/g,'').slice(0,3))} onKeyDown={e=>{if(e.key==='Enter'&&value)onAnswer(value);}}/></div>;
  return <div className={`activity activity-${mode}`}><p>{instructions[mode]}</p>
    {mode===0&&<div className="link-activity"><button className={source?'selected':''} disabled={disabled} onClick={()=>setSource(true)}><span dir="auto">{q.prompt}</span><span aria-hidden="true"> ━●</span></button><div>{options.map(option=><button key={option} disabled={disabled||!source} onClick={()=>onAnswer(option)}><span aria-hidden="true">●━ </span>{option}</button>)}</div></div>}
    {mode===1&&<><div className="answer-drop" role="button" tabIndex={disabled?-1:0} aria-label="הנחת התוצאה בתרגיל" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const answer=e.dataTransfer.getData('text/plain');if(!disabled&&options.includes(answer))onAnswer(answer);}} onClick={()=>{if(picked&&!disabled)onAnswer(picked);}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&picked&&!disabled){e.preventDefault();onAnswer(picked);}}}>{picked??'מניחים כאן תוצאה'}</div><div className="answer-grid">{options.map(option=><button key={option} draggable={!disabled} disabled={disabled} aria-pressed={picked===option} className="answer-choice" onDragStart={e=>e.dataTransfer.setData('text/plain',option)} onClick={()=>setPicked(option)}>{option}</button>)}</div></>}
    {mode===2&&<><button className="memory-tile revealed" disabled={disabled} onClick={()=>setSource(true)}>{source?q.prompt:'פותחים את קלף התרגיל'}</button><div className="answer-grid">{options.map((option,i)=><button key={option} className={`memory-tile ${flipped.includes(option)?'revealed':''}`} disabled={disabled||!source} aria-label={`קלף תוצאה ${i+1}: ${option}`} onClick={()=>{setFlipped(prev=>[...prev,option]);onAnswer(option);}}>{option}</button>)}</div></>}
    {mode===3&&<div className="answer-grid">{options.map(option=><button className="answer-choice" key={option} disabled={disabled} onClick={()=>onAnswer(option)}>{option}</button>)}</div>}
  </div>;
}
