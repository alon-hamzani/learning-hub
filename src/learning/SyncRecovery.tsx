import {useState} from 'react';
import ParentGate from './ParentGate';
import {discardAccountQueue} from './outbox';
import {resumeLearningWrites} from '../cloud';
export default function SyncRecovery({owner,onClose}:{owner:string;onClose:()=>void}){
 const [authorized,setAuthorized]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 if(!authorized)return <ParentGate title="טיפול בשמירה ממתינה" onDone={()=>setAuthorized(true)} onCancel={onClose}/>;
 async function retry(){setBusy(true);try{await resumeLearningWrites(owner);window.location.reload();}catch{setMessage('השמירה עדיין לא הושלמה. בדקו חיבור והרשאות; במקרה של התנגשות אפשר לבחור בנתוני הענן.');}finally{setBusy(false);}}
 return <section className="parent-gate panel"><h1>שמירה ממתינה במכשיר</h1><p>ייתכן שנותק החיבור, שהרשאה השתנתה או שנשמרה התקדמות ממכשיר אחר. הנתונים הממתינים נשארים במכשיר עד לפתרון.</p><button className="primary" disabled={busy} onClick={retry}>ניסיון סנכרון נוסף</button><button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('לבטל את כל הפעולות שטרם סונכרנו בחשבון הזה במכשיר זה, ולהשתמש בנתונים שכבר נשמרו בענן? פעולות שבוטלו לא יישלחו שוב.')){try{discardAccountQueue(owner);window.location.reload();}catch(error){setMessage(error instanceof Error?error.message:'נסו שוב לאחר סיום הסנכרון.');}}}}>בחירת נתוני הענן וביטול הפעולות הממתינות</button><p role="status">{message}</p><button className="text-link" onClick={onClose}>חזרה</button></section>;
}
