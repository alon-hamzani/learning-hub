import {useEffect,useState} from 'react';
export default function SyncStatus(){
 const [pending,setPending]=useState(0),[online,setOnline]=useState(navigator.onLine);
 useEffect(()=>{const status=(event:Event)=>setPending((event as CustomEvent<{pending:number}>).detail.pending),network=()=>setOnline(navigator.onLine);window.addEventListener('learning-sync',status);window.addEventListener('online',network);window.addEventListener('offline',network);return()=>{window.removeEventListener('learning-sync',status);window.removeEventListener('online',network);window.removeEventListener('offline',network);};},[]);
 return <div className={`sync-status ${pending||!online?'pending':''}`} role="status">{!online?'אין חיבור — אפשר להמשיך בתרגול שנטען. השמירה ממתינה לסנכרון.':pending?`${pending} פעולות ממתינות לאישור בענן…`:'מחוברים · פעולות המשחק שאושרו נשמרו בענן'}</div>;
}
