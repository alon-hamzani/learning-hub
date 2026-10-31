import {useState} from 'react';
import type {FormEvent} from 'react';
import {supabase} from '../cloud';
export default function ParentGate({setup=false,title='אזור ההורים',onDone,onCancel}:{setup?:boolean;title?:string;onDone:()=>void;onCancel?:()=>void}) {
  const [pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent) {
    event.preventDefault();if(!/^\d{4}$/.test(pin)||busy)return;
    if(setup&&pin!==confirm){setError('הקודים אינם זהים. נסו שוב.');return;}
    setBusy(true);setError('');
    try {
      const {data,error:failure}=await supabase.rpc(setup?'set_parent_pin':'verify_parent_pin',{p_pin:pin});
      if(failure)throw failure;
      if(!data?.ok){setError(data?.locked?'יותר מדי ניסיונות. אפשר לנסות שוב בעוד חמש דקות.':'הקוד שגוי. נסו שוב.');setPin('');return;}
      setPin('');setConfirm('');onDone();
    } catch {setError('לא ניתן לאמת כרגע. ודאו שיש חיבור לאינטרנט ונסו שוב.');}
    finally{setBusy(false);}
  }
  return <section className="parent-gate panel" dir="rtl"><div className="gate-icon">🔐</div><h1>{setup?'מגדירים קוד להורים':title}</h1><p>{setup?'בחרו קוד אישי בן 4 ספרות. הוא יידרש באזור ההורים ולפני איפוס או מחיקה. שמרו אותו אצלכם; אין שחזור במייל.':'הזינו את הקוד ההורי בן 4 הספרות.'}</p><form onSubmit={submit}><label>קוד הורי<input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} required/></label>{setup&&<label>הקלידו שוב לאישור<input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={confirm} onChange={e=>setConfirm(e.target.value.replace(/\D/g,''))} required/></label>}{error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy||pin.length!==4}>{busy?'בודקים…':setup?'שמירת קוד וממשיכים':'כניסה'}</button>{onCancel&&<button className="secondary" type="button" onClick={onCancel}>חזרה למשחק</button>}</form></section>;
}
