import '../src/styles.css';import '../src/hub.css';import '../src/cloud.css';
import ReactDOM from 'react-dom/client';
import App from '../src/App';
import LearningHub from '../src/LearningHub';
import {createProfile,WORLDS} from '../src/game';

const profile=createProfile('דנה','🦊');profile.id='preview-child';profile.xp=240;
for(const world of WORLDS.slice(0,4))profile.progress[world.id]={lesson:true,guided:true,practice:true,checkpoint:true};
const noop=()=>{};
ReactDOM.createRoot(document.getElementById('root')!).render(location.search.includes('portal')?<LearningHub profiles={[profile]} games={[{id:'multiplication-quest',module_key:'multiplication-quest',title:'מסע הכפל שלי',description:'מחברת הרפתקאות עם עולמות, תרגול ומשחקים',icon:'📒',active:true}]} displayName="משפחת בדיקה" isAdmin={false} openGame={()=>location.href='preview.html'}/>:<App initialProfiles={[profile]} cloud={{onProfilesChanged:noop,onActivity:noop,onSessionStart:noop,onSessionComplete:noop,onGameEvent:noop,onModuleEvent:noop,deleteProfile:async()=>{},resetProfile:async()=>{}}}/>);
