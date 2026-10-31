export type Operation={id:string;owner:string;kind:string;createdAt:number;payload:Record<string,unknown>};
export type Transport=(operation:Operation)=>Promise<unknown>;
const queues=new Map<string,Outbox>();
export class Outbox {
  private jobs:Operation[]=[];
  private running:Promise<void>|null=null;
  private transport:Transport;
  private error:(message:string)=>void;
  private key:string;
  private blocked=new Set<string>();
  private storedIds=new Set<string>();
  private clock=0;
  constructor(readonly owner:string,transport:Transport,onError:(message:string)=>void){
    this.transport=transport;this.error=onError;this.key=`learning-hub:v4:outbox:${owner}`;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(this.key+':'))continue;
      const job=JSON.parse(localStorage.getItem(key)!);if(job.owner!==owner)throw Error('תור שמירה מקומי אינו תקין');
      this.jobs.push(job);this.storedIds.add(job.id);this.clock=Math.max(this.clock,job.createdAt);
    }
    this.jobs.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
    window.addEventListener('online',()=>void this.drain());
  }
  configure(transport:Transport,onError:(message:string)=>void){this.transport=transport;this.error=onError;}
  pending(){return this.jobs.length;}
  discard(){if(this.running)throw Error('יש להמתין לסיום ניסיון הסנכרון.');this.jobs=[];this.blocked.clear();this.persist();}
  private persist(){
    // One immutable key per operation prevents two offline tabs overwriting each other's queue.
    const active=new Set(this.jobs.map(job=>job.id));
    for(const job of this.jobs)localStorage.setItem(this.key+':'+job.id,JSON.stringify(job));
    for(const id of this.storedIds)if(!active.has(id))localStorage.removeItem(this.key+':'+id);
    this.storedIds=active;
    window.dispatchEvent(new CustomEvent('learning-sync',{detail:{pending:this.jobs.length}}));
  }
  enqueue(kind:string,payload:Record<string,unknown>){
    this.clock=Math.max(Date.now(),this.clock+1);
    const operation={id:crypto.randomUUID(),owner:this.owner,kind,createdAt:this.clock,payload:structuredClone(payload)};
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
export function discardAccountQueue(owner:string){const box=queues.get(owner);if(box)box.discard();const prefix=`learning-hub:v4:outbox:${owner}:`;for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(prefix))localStorage.removeItem(key);}}
