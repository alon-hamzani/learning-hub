export type Operation={id:string;owner:string;kind:string;payload:Record<string,unknown>};
export type Transport=(operation:Operation)=>Promise<unknown>;
const queues=new Map<string,Outbox>();
export class Outbox {
  private jobs:Operation[]=[];
  private running:Promise<void>|null=null;
  private transport:Transport;
  private error:(message:string)=>void;
  private key:string;
  private blocked=new Set<string>();
  constructor(readonly owner:string,transport:Transport,onError:(message:string)=>void){
    this.transport=transport;this.error=onError;this.key=`learning-hub:v4:outbox:${owner}`;
    const raw=localStorage.getItem(this.key);
    if(raw){const stored=JSON.parse(raw);if(!Array.isArray(stored)||stored.some(job=>job.owner!==owner))throw Error('תור שמירה מקומי אינו תקין');this.jobs=stored;}
    window.addEventListener('online',()=>void this.drain());
  }
  configure(transport:Transport,onError:(message:string)=>void){this.transport=transport;this.error=onError;}
  pending(){return this.jobs.length;}
  discard(){if(this.running)throw Error('יש להמתין לסיום ניסיון הסנכרון.');this.jobs=[];this.blocked.clear();this.persist();}
  private persist(){localStorage.setItem(this.key,JSON.stringify(this.jobs));window.dispatchEvent(new CustomEvent('learning-sync',{detail:{pending:this.jobs.length}}));}
  enqueue(kind:string,payload:Record<string,unknown>){
    const operation={id:crypto.randomUUID(),owner:this.owner,kind,payload:structuredClone(payload)};
    this.jobs.push(operation);
    try{this.persist();}catch{this.jobs.pop();throw Error('אין אפשרות לשמור במכשיר. פנו מקום לפני שממשיכים.');}
    void this.drain();return operation.id;
  }
  async drain():Promise<void>{
    if(this.running)return this.running;
    if(!navigator.onLine||!this.jobs.length)return;
    this.running=(async()=>{
      while(this.jobs.length&&navigator.onLine){
        const index=this.jobs.findIndex(job=>!this.blocked.has(String(job.payload.studentId??(job.payload.snapshot as {id?:string})?.id??'')));
        if(index<0)break;
        const job=this.jobs[index];
        try {await this.transport(job);this.jobs.splice(index,1);this.persist();}
        catch(error){
          const conflict=error&&typeof error==='object'&&'code'in error&&(error.code==='PT409'||error.code==='40001');
          this.error(conflict?'ההתקדמות השתנתה במכשיר אחר. הפעולות נשמרו במכשיר; יש לרענן ולפתור את ההתנגשות לפני המשך.':error&&typeof error==='object'&&'message'in error?String(error.message):'השמירה ממתינה לחיבור.');
          if(conflict){this.blocked.add(String(job.payload.studentId??(job.payload.snapshot as {id?:string})?.id??''));continue;}break;
        }
      }
    })().finally(()=>{this.running=null;});
    return this.running;
  }
  snapshots(gameId:string):Record<string,unknown>[] {return this.jobs.filter(j=>j.kind==='profile'&&j.payload.gameId===gameId).map(j=>j.payload as Record<string,unknown>);}
}
export function accountOutbox(owner:string,transport:Transport,onError:(message:string)=>void){let box=queues.get(owner);if(!box){box=new Outbox(owner,transport,onError);queues.set(owner,box);}else box.configure(transport,onError);return box;}
export function discardAccountQueue(owner:string){const box=queues.get(owner);if(box)box.discard();else localStorage.removeItem(`learning-hub:v4:outbox:${owner}`);}
