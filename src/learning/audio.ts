let context: AudioContext | undefined;
let lastSound=0;
export function sound(kind:'tap'|'correct'|'wrong'|'reward'|'complete',enabled:boolean) {
  if(!enabled || Date.now()-lastSound<90) return;
  lastSound=Date.now();
  try {
    context ??= new AudioContext();
    void context.resume();
    const frequencies={tap:[350],correct:[523,659],wrong:[240],reward:[659,784,1047],complete:[523,659,784,1047]}[kind];
    frequencies.forEach((frequency,i)=>{
      const oscillator=context!.createOscillator(),gain=context!.createGain(),at=context!.currentTime+i*.09;
      oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.035,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.15);
      oscillator.connect(gain);gain.connect(context!.destination);oscillator.start(at);oscillator.stop(at+.16);
    });
  } catch { /* Sound never blocks learning. */ }
}
export function stopAudio() { if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();if(context)void context.suspend(); }
export function speakHebrew(text:string):boolean {
  if(typeof speechSynthesis==='undefined')return false;
  const voice=speechSynthesis.getVoices().find(v=>/^he(?:-|$)/i.test(v.lang));
  if(!voice)return false;
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text.replace(/×/g,' כפול ').replace(/=/g,' שווה ').replace(/\?/g,' כמה'));
  utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=.85;speechSynthesis.speak(utterance);return true;
}
