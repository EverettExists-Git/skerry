// SKERRY - sound.
// Everything audible lives here; Index.html only calls it:  SFX.tick and SFX.machines (every frame), SFX.play, SFX.thunder, SFX.step, SFX.roar, SFX.growl, SFX.speak, SFX.toast, SFX.pad.
//  - Ambient beds (the ocean and rain recordings in SoundData.html) loop forever and fade in and out with where the camera is.
//    Rain overpowers the ocean: ocean volume = (1 - rain), so under a storm over open water you hear only rain.
//  - Generators and working drills hum (EngineSFX / DrillSound recordings, looped): each hum gets louder the closer the camera is and pans toward the machine.
//  - Thunder is a one-shot recording, louder / sharper when the strike is close and delayed a little when it is far.
//  - Every other sound is synthesised with the Web Audio API (no files): soft sines and triangles for UI, filtered noise for mechanical things.
// Browsers keep audio locked until the first click / key press, so nothing starts before that.
const SFX=(()=>{
 const BED={ocean:1.7,rain:.55}, // loudness trim per ambient file (the rain recording is much louder than the ocean one)
  MACH={engine:.25,drill:.8}, // loudness trim for the two machine hums: EngineSFX.mp3 (a generator) and DrillSound.mp3 (a working drill). The engine recording is much louder than the drill one.
  THUNDER=1.0,THUNDER_RANGE=380; // dots: beyond this a strike is silent
 let ctx=null,master,bus,ambBus,duckG,duckUntil=0,duckDepth=1,nbuf,vol=.8,muted=false,lastAny=0,loading=false;
 const buf={},loops={},cur={ocean:0,rain:0},gate={},mach={},mcur={engine:0,drill:0},mpan={engine:0,drill:0};
 try{const v=localStorage.getItem('void_vol');if(v!==null&&!isNaN(+v))vol=Math.max(0,Math.min(1,+v));muted=localStorage.getItem('void_mute')==='1'}catch(e){}
 const save=()=>{try{localStorage.setItem('void_vol',String(vol));localStorage.setItem('void_mute',muted?'1':'0')}catch(e){}};
 const taper=v=>v*v; // slider position -> gain, so the bottom half of the slider is still useful
 const live=()=>ctx&&ctx.state==='running'&&!muted&&vol>0;
 function applyMaster(){if(master)master.gain.setTargetAtTime(muted?0:taper(vol),ctx.currentTime,.05)}

 function ensure(){
  if(ctx)return true;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
  try{ctx=new AC()}catch(e){return false}
  const comp=ctx.createDynamicsCompressor(); // keeps a thunderclap on top of a chime from clipping
  comp.threshold.value=-18;comp.knee.value=20;comp.ratio.value=5;comp.attack.value=.003;comp.release.value=.2;
  master=ctx.createGain();master.gain.value=muted?0:taper(vol);
  bus=ctx.createGain();bus.gain.value=.9;ambBus=ctx.createGain();ambBus.gain.value=1;
  duckG=ctx.createGain();duckG.gain.value=1; // the ambient beds and machine hums go through here, so they can dip out of the way of one-shot sounds
  bus.connect(comp);comp.connect(master);ambBus.connect(duckG);duckG.connect(master);master.connect(ctx.destination); // one-shot effects share the compressor; the endless loops bypass it so they can't squash a thunderclap
  nbuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const d=nbuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; // 1 s of white noise, reused for every hiss
  load();return true}
 function unlock(){if(!ensure())return;if(ctx.state!=='running')ctx.resume().catch(()=>{})}
 for(const ev of['pointerdown','keydown','touchend'])addEventListener(ev,unlock,{capture:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend().catch(()=>{});else ctx.resume().catch(()=>{})}); // silent while the tab is in the background

 // ---- the recordings ----
 const unb64=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer};
 const decode=ab=>new Promise((ok,no)=>{try{const p=ctx.decodeAudioData(ab,ok,no);if(p&&p.catch)p.catch(no)}catch(e){no(e)}});
 // MP3s have a tiny gap at each end, which would click on every loop. So the last few seconds are blended into the first few
 // and the loop is cut where those two meet: the end flows straight back into the start.
 function seamless(b,sec){
  const sr=b.sampleRate,F=Math.min(Math.floor(sec*sr),Math.floor(b.length/3)),N=b.length-F,M=N-F,o=ctx.createBuffer(b.numberOfChannels,N,sr);
  for(let c=0;c<b.numberOfChannels;c++){const s=b.getChannelData(c),d=o.getChannelData(c);
   for(let i=0;i<M;i++)d[i]=s[F+i];
   for(let j=0;j<F;j++){const u=j/F*1.5708;d[M+j]=s[N+j]*Math.cos(u)+s[j]*Math.sin(u)}}
  return o}
 function startLoop(k){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buf[k];s.loop=true;g.gain.value=0;s.connect(g);g.connect(ambBus);s.start(0,Math.random()*buf[k].duration);loops[k]=g}
 async function load(){
  if(loading||typeof AUDIO_B64==='undefined')return;loading=true;
  for(const k of Object.keys(AUDIO_B64)){
   try{let b=await decode(unb64(AUDIO_B64[k]));if(k==='ocean'||k==='rain')b=seamless(b,3);else if(k in MACH)b=seamless(b,.3);buf[k]=b;if(k==='ocean'||k==='rain')startLoop(k);else if(k in MACH)startMachine(k)}catch(e){}}}

 // Called every frame. ocean / rain: 0..1 for where the camera is; k: 0..1 overall ambient level (the map view and far zoom fade it out).
 function tick(dt,ocean,rain,k){
  if(!ctx)return;
  const to={ocean:ocean*(1-rain)*k,rain:rain*k},a=1-Math.exp(-dt/.7);
  for(const n in to){const g=loops[n];if(!g)continue;cur[n]+=(to[n]-cur[n])*a;if(cur[n]<.0005&&to[n]===0)cur[n]=0;g.gain.value=cur[n]*BED[n]}}

 // ---- generator and drill hums ----
 // One looping recording per machine type, run through a stereo panner. Index.html works out, for the camera, how loud each type should be (0..1, from the
 // distance to the nearest generators / working drills) and which side it is on (-1 left .. 1 right), and hands both to machines() every frame.
 function startMachine(k){const s=ctx.createBufferSource(),g=ctx.createGain(),p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  s.buffer=buf[k];s.loop=true;g.gain.value=0;s.connect(g);if(p){g.connect(p);p.connect(ambBus)}else g.connect(ambBus);
  s.start(0,Math.random()*buf[k].duration);mach[k]={g,p}}
 // e, d: {v, p} for engines and drills (omit or v=0 for silence)
 function machines(dt,e,d){
  if(!ctx)return;
  const to={engine:e,drill:d},a=1-Math.exp(-dt/.25);
  for(const n in to){const m=mach[n];if(!m)continue;const t=to[n]||{v:0,p:0};
   mcur[n]+=(t.v-mcur[n])*a;if(mcur[n]<.0005&&!t.v)mcur[n]=0;
   if(t.v>0)mpan[n]+=(t.p-mpan[n])*a;
   m.g.gain.value=mcur[n]*MACH[n];if(m.p)m.p.pan.value=Math.max(-1,Math.min(1,mpan[n]))}}

 // Dip the ambient beds and machine hums to 'depth' (0..1) starting at time t, hold for 'hold' s, then ease back over about 'rel' s. A shallower dip never cuts a deeper one short.
 function duck(t,depth,hold,rel){
  if(!duckG)return;const now=ctx.currentTime;if(now<duckUntil&&depth>duckDepth)return;
  duckDepth=depth;duckUntil=t+hold+rel;const g=duckG.gain;g.cancelScheduledValues(now);g.setTargetAtTime(depth,Math.max(now,t-.02),.04);g.setTargetAtTime(1,t+hold,rel/3)}

 // ---- synth helpers ----
 const N=m=>440*Math.pow(2,(m-69)/12),PEN=[0,2,4,7,9],rp=()=>PEN[Math.floor(Math.random()*5)]; // N: midi note -> Hz; rp: a random pentatonic step, so placing dots sounds like a little tune
 function env(v,t,a,d,dest){const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);g.connect(dest||bus);return g}
 // a tone that slides f0 -> f1 over dur seconds; lp: optional lowpass to soften saw/square waves
 function osc(type,f0,f1,t,dur,v,a,lp){a=a==null?.006:a;const o=ctx.createOscillator(),g=env(v,t,a,Math.max(.02,dur-a));
  o.type=type;o.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+dur);
  if(lp){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=lp;o.connect(f);f.connect(g)}else o.connect(g);
  o.start(t);o.stop(t+dur+.05)}
 // filtered noise whose filter sweeps f0 -> f1: whooshes, thuds, splashes, scrapes
 function hiss(type,f0,f1,q,t,dur,v,a){a=a==null?.004:a;const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=env(v,t,a,Math.max(.02,dur-a));
  s.buffer=nbuf;s.loop=true;f.type=type;f.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)f.frequency.exponentialRampToValueAtTime(f1,t+dur);f.Q.value=q;
  s.connect(f);f.connect(g);s.start(t,Math.random()*.8);s.stop(t+dur+.05)}

 const S={
  click:t=>osc('triangle',1500,1000,t,.05,.035),
  place:(t,o)=>{const m=72+(o.n!=null?o.n:rp());osc('sine',N(m),N(m),t,.16,.09);osc('sine',N(m+12),N(m+12),t+.01,.1,.025);hiss('highpass',5000,0,.7,t,.025,.03)},
  drill:t=>{hiss('bandpass',250,1100,3,t,.3,.14,.02);osc('sawtooth',80,50,t,.28,.1,.01,420);osc('square',40,40,t+.02,.2,.05,.01,200)},
  generator:t=>{osc('sawtooth',55,130,t,.5,.09,.06,500);osc('square',900,200,t+.02,.14,.025,.004,2600);osc('sine',N(79),N(91),t+.28,.3,.06,.02)},
  port:t=>{[1,2.01,3.2].forEach((r,i)=>osc('sine',392*r,392*r,t,[.9,.6,.35][i],[.1,.045,.025][i],.004));osc('sawtooth',98,92,t+.02,.55,.045,.1,420)}, // a bell and a low horn
  container:t=>{hiss('lowpass',600,150,1,t,.14,.22,.002);osc('sine',170,75,t,.16,.14,.003);osc('triangle',N(88),N(88),t+.1,.14,.035,.003);osc('triangle',N(93),N(93),t+.18,.2,.035,.003)}, // a thunk and a jingle
  flood:t=>{osc('square',110,70,t,.09,.05,.002,450);hiss('bandpass',250,1400,1.2,t+.05,.3,.07,.05);osc('sine',N(79),N(95),t+.2,.4,.05,.03);osc('triangle',N(98),N(98),t+.5,.25,.025,.01)}, // a clunk, a lamp warming up
  pump:t=>{hiss('lowpass',700,160,1,t,.16,.2,.002);osc('sine',150,62,t,.2,.14,.003);osc('sawtooth',70,95,t+.08,.22,.04,.05,360);osc('triangle',N(64),N(64),t+.2,.14,.04,.004);osc('triangle',N(71),N(71),t+.3,.22,.04,.004)}, // a clunk, the creak of the pumpjack and two low glugs
  outpost:t=>{hiss('lowpass',900,200,1,t,.14,.2,.002);osc('sine',140,68,t,.2,.14,.003);[0,.09,.18].forEach((d,i)=>osc('triangle',N(62+i*5),N(62+i*5),t+.1+d,.2,.05,.004));osc('sawtooth',N(55),N(55),t+.34,.5,.04,.05,500)}, // a thud, three wooden knocks and a low horn
  rod:t=>{osc('sine',2093,2093,t,.55,.06,.002);osc('sine',3136,3136,t,.35,.035,.002);hiss('highpass',3500,9000,.7,t,.09,.06)},
  erase:t=>{osc('sine',N(72),N(52),t,.18,.075,.004);hiss('bandpass',3000,400,.8,t,.2,.09)},
  deny:t=>{osc('triangle',170,135,t,.13,.085,.004,900);osc('triangle',135,105,t+.11,.18,.08,.004,900)},
  simBegin:t=>{hiss('bandpass',200,1800,.9,t,.3,.08,.08);osc('sine',N(60),N(72),t,.3,.05,.05)},
  chop:t=>{hiss('bandpass',950,500,2.2,t,.07,.2,.002);osc('sine',210,110,t,.1,.12,.002)},
  pad:(t,o)=>{const f=[261.6,329.6,392,523.3][o.i|0];osc('sine',f,f,t,.42,.11,.02);osc('triangle',f*2,f*2,t,.28,.022,.02)}, // the four memory-game notes
  miss:t=>{hiss('lowpass',500,150,1,t,.28,.2,.003);osc('sawtooth',120,55,t,.32,.07,.004,320)},
  mine:t=>{[0,.11,.22].forEach((d,i)=>{hiss('bandpass',900-i*80,500,2.2,t+d,.07,.18,.002);osc('sine',210,110,t+d,.1,.11,.002)});osc('sine',N(88),N(88),t+.42,.45,.06,.004);osc('sine',N(95),N(95),t+.42,.3,.025,.004)},
  capture:t=>{[72,76,79,84].forEach((m,i)=>{osc('sine',N(m),N(m),t+i*.075,.55,.08,.004);osc('triangle',N(m+12),N(m+12),t+i*.075,.3,.02,.004)});hiss('highpass',4000,9000,.6,t,.25,.035,.02)},
  capital:t=>{S.capture(t);osc('sine',95,28,t,1.3,.26,.01);hiss('lowpass',900,120,1,t,1,.2,.01);[67,64,60].forEach((m,i)=>osc('triangle',N(m),N(m),t+.35+i*.12,.6,.05,.01))},
  alert:t=>{[81,74,81,74].forEach((m,i)=>osc('triangle',N(m),N(m),t+i*.15,.13,.1,.004,3000));osc('sine',110,110,t,.6,.05,.01)},
  boat:t=>{osc('sawtooth',98,98,t,.75,.07,.1,550);osc('sawtooth',147,147,t,.75,.04,.1,550);hiss('lowpass',1400,300,.8,t+.05,.7,.06,.1)}, // a ship's horn and the splash
  land:t=>{[76,79,83,88].forEach((m,i)=>osc('sine',N(m),N(m),t+i*.1,.7,.07,.005));hiss('lowpass',1500,300,.8,t,.5,.05,.05)},
  mapOpen:t=>hiss('bandpass',250,3200,.8,t,.3,.07,.1),
  mapClose:t=>hiss('bandpass',3200,250,.8,t,.28,.06,.05),
  fly:t=>hiss('bandpass',500,1700,.8,t,.22,.05,.06),
  chatIn:t=>{osc('sine',N(84),N(84),t,.1,.06,.004);osc('sine',N(89),N(89),t+.09,.16,.06,.004)},
  ping:t=>{osc('sine',N(88),N(88),t,.22,.07,.004);osc('sine',N(95),N(95),t+.08,.32,.06,.004);osc('triangle',N(100),N(100),t+.08,.16,.012,.004)}, // chat popup while the chat is closed
  chatOut:t=>osc('sine',N(79),N(86),t,.09,.05,.004),
  ally:t=>{[79,83,86,91].forEach((m,i)=>{osc('sine',N(m),N(m),t+i*.1,.9,.065,.004);osc('sine',N(m)*2.01,N(m)*2.01,t+i*.1,.5,.02,.004)})}, // a request came in
  allyYes:t=>{[72,76,79,84,88].forEach((m,i)=>osc('triangle',N(m),N(m),t+i*.07,.6,.06,.004));hiss('highpass',4500,9000,.6,t,.3,.03,.02)}, // they accepted
  coin:t=>{osc('triangle',N(91),N(91),t,.1,.05,.002);osc('triangle',N(96),N(96),t+.07,.25,.05,.002)},
  join:t=>{osc('sine',N(48),N(55),t,1.5,.09,.35);osc('sine',N(60),N(67),t,1.3,.05,.35);osc('sine',N(72),N(72),t+.25,1.1,.025,.4);hiss('highpass',4000,6000,.5,t,1.2,.015,.5)},
  far:t=>{const f=N(84+rp());osc('sine',f,f,t,.08,.02,.004)}, // somebody else's dot appeared on your screen
  zap:(t,o)=>{const V=o.v==null?1:o.v;hiss('highpass',2000,7000,.8,t,.16,.12*V,.002);osc('sawtooth',1400,180,t,.2,.05*V,.002,3200)}, // lightning rod took a strike
  swOff:t=>{[0,.045,.09,.135].forEach((d,i)=>{hiss('bandpass',2800-i*320,1500,3,t+d,.03,.09,.001);osc('square',640-i*60,560-i*50,t+d,.03,.03,.001,2000)});hiss('lowpass',700,140,1,t+.18,.16,.22,.002);osc('sine',130,48,t+.18,.2,.2,.003);osc('sawtooth',170,36,t+.22,.9,.05,.01,380)}, // the lever ratchets down, clunks, and the engine winds down
  swOn:t=>{[0,.045,.09,.135].forEach((d,i)=>{hiss('bandpass',1500+i*320,2800,3,t+d,.03,.09,.001);osc('square',540+i*60,620+i*50,t+d,.03,.03,.001,2000)});hiss('lowpass',700,140,1,t+.18,.16,.22,.002);osc('sine',130,48,t+.18,.2,.2,.003);osc('sawtooth',40,150,t+.22,.7,.05,.04,380);osc('sawtooth',150,150,t+.9,.18,.02,.1,380)}, // the lever ratchets up, clunks, and the engine spins up
  wreck:(t,o)=>{const V=o.v==null?1:o.v;hiss('lowpass',1800,200,1,t,.9,.25*V,.004);osc('sine',130,34,t,.9,.2*V,.004)} // a generator was destroyed
 };
 const GAP={click:30,place:40,far:350,alert:2500,chatIn:250,ping:400,coin:80,deny:140,swOff:200,swOn:200}; // minimum ms between repeats of the same sound
 function play(n,o){
  if(!live()||!S[n])return;
  const now=performance.now();if(GAP[n]&&now-(gate[n]||0)<GAP[n])return;gate[n]=now;if(n!=='click')lastAny=now;
  try{S[n](ctx.currentTime+.01,o||{});if(n!=='click'&&n!=='far')duck(ctx.currentTime+.01,.5,.25,.5)}catch(e){}}

 // Error toasts get a soft "no". Success messages already have their own sound, so they stay quiet here.
 const BAD=/ran out|can't|cannot|couldn't|not enough|easy there|catching your breath|slow down|too many|no luck|not quite|wrong note|slipped|grabbed|is gone|protected|changed while|nothing there|no sea|no coast|only |already|isn't|busy|click on or near|there is a tree|you don't have|costs \d|no longer|not yours/i;
 function toast(m){if(performance.now()-lastAny<300)return;if(BAD.test(m||''))play('deny')}

 // A lightning strike d dots from the camera. mine: it hit one of your own dots. kind: 1 = a rod took it, 0 = a generator was destroyed. age: ms since it happened.
 function thunder(d,mine,kind,age){
  if(!live()||!buf.thunder||age>6000)return;
  const q=Math.pow(Math.max(0,1-d/THUNDER_RANGE),1.2),v=mine?1:q;if(v<.02)return;
  const t=ctx.currentTime+.02+Math.max(0,Math.min(4,d*.011)-age/1000), // far strikes arrive a moment after the flash
   s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  s.buffer=buf.thunder;s.playbackRate.value=.93+Math.random()*.14;
  f.type='lowpass';f.frequency.value=mine?18000:700+15300*q; // distance muffles it
  g.gain.value=THUNDER*v;s.connect(f);f.connect(g);g.connect(bus);s.start(t);
  duck(t,mine?.15:Math.max(.15,.6-.45*q),Math.min(3.5,buf.thunder.duration*.7),.9); // rain, ocean and machine hums get out of the way of the rumble
  if(v>.3||mine)try{S[kind?'zap':'wreck'](t,{v:Math.min(1,v)})}catch(e){}}

 // ---- the creature's footsteps ----
 // One of the step recordings in SoundData.html (step0, step1, ...), picked at random and slowed a little because it is huge. d: dots from the camera to the foot; pan: -1 left .. 1 right.
 // Unlike thunder this is never out of range: from anywhere on the map it is clearly audible - far away it is only a little quieter and duller (STEP_MIN is the quietest it gets, STEP_LP the dullest it gets).
 const STEP_V=1.3,STEP_RANGE=2200,STEP_MIN=.65,STEP_LP=1400;
 function step(d,pan){
  if(!live())return;const ks=Object.keys(buf).filter(k=>k.indexOf('step')===0);if(!ks.length)return;
  const q=Math.pow(Math.max(0,1-d/STEP_RANGE),1.3),v=STEP_MIN+(1-STEP_MIN)*q,t=ctx.currentTime+.02+Math.random()*.05, // a tiny random delay, so two feet landing together don't phase
   s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  s.buffer=buf[ks[Math.floor(Math.random()*ks.length)]];s.playbackRate.value=.78+Math.random()*.16;
  f.type='lowpass';f.frequency.value=STEP_LP+(18000-STEP_LP)*q; // distance muffles it (a little)
  g.gain.value=STEP_V*v;s.connect(f);f.connect(g);if(p){p.pan.value=Math.max(-1,Math.min(1,pan||0));g.connect(p);p.connect(bus)}else g.connect(bus);s.start(t);
  duck(t,Math.max(.5,.9-.4*q),.25,.5)} // the ambient beds dip out of the way when it is close

 // The creature's roar (the 'roar' recording), when it notices a light and turns on it. Like its footsteps it is heard from anywhere: far away it is quieter and muffled (ROAR_MIN is the quietest it gets),
 // close up it is full and the ambient sound ducks out of its way. d: distance in dots from the camera to the creature; pan: -1 (left) .. 1 (right).
 const ROAR_V=1,ROAR_RANGE=7000,ROAR_MIN=.25;
 function roar(d,pan){
  if(!live()||!buf.roar)return;
  const q=Math.pow(Math.max(0,1-d/ROAR_RANGE),1.2),v=ROAR_MIN+(1-ROAR_MIN)*q,t=ctx.currentTime+.03,
   s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  s.buffer=buf.roar;f.type='lowpass';f.frequency.value=700+17000*q; // distance muffles it
  g.gain.value=ROAR_V*v;s.connect(f);f.connect(g);if(p){p.pan.value=Math.max(-1,Math.min(1,pan||0));g.connect(p);p.connect(bus)}else g.connect(bus);s.start(t);
  duck(t,.35,buf.roar.duration*.7,1.2)}

 // The creature's far-away calls (growl0..growl3 in SoundData.html). Index.html picks WHEN (from the server clock, so every player hears the same call at the same moment) and WHICH one; like the footsteps it is
 // heard from anywhere on the map. It is meant to sound distant: fairly quiet (GROWL_V), always a little dull, and sent through an echo (a repeating delay plus a big cave-like reverb) that is wetter the further away it is.
 const GROWL_V=.42,GROWL_RANGE=9000,GROWL_MIN=.5;
 let echoB=null;
 function echoBus(){if(echoB)return echoB;
  const inG=ctx.createGain(),dl=ctx.createDelay(2),fb=ctx.createGain(),lp=ctx.createBiquadFilter(),cv=ctx.createConvolver(),out=ctx.createGain(),sr=ctx.sampleRate,n=Math.floor(sr*3.4),ir=ctx.createBuffer(2,n,sr);
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3)} // the reverb: noise that fades out over 3.4 s
  cv.buffer=ir;dl.delayTime.value=.62;fb.gain.value=.42;lp.type='lowpass';lp.frequency.value=1500; // the echo: one repeat every 0.62 s, each one duller and quieter than the last
  inG.connect(dl);dl.connect(lp);lp.connect(fb);fb.connect(dl);lp.connect(out);inG.connect(cv);cv.connect(out);out.gain.value=1;out.connect(bus);
  return echoB={inG}}
 function growl(d,pan,i){
  if(!live())return;const ks=Object.keys(buf).filter(k=>k.indexOf('growl')===0).sort();if(!ks.length)return;
  const q=Math.pow(Math.max(0,1-d/GROWL_RANGE),1.2),v=GROWL_MIN+(1-GROWL_MIN)*q,t=ctx.currentTime+.05,b=buf[ks[((i|0)%ks.length+ks.length)%ks.length]],
   s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),w=ctx.createGain(),p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  s.buffer=b;s.playbackRate.value=.94+Math.random()*.1;f.type='lowpass';f.frequency.value=1200+4300*q; // distance muffles it
  g.gain.value=GROWL_V*v*.7;w.gain.value=GROWL_V*(1-.45*q); // the dry sound; and how much goes to the echo (more when it is further away)
  s.connect(f);f.connect(g);f.connect(w);w.connect(echoBus().inG);
  if(p){p.pan.value=Math.max(-1,Math.min(1,pan||0));g.connect(p);p.connect(bus)}else g.connect(bus);s.start(t);
  duck(t,.75,b.duration*.5,1.2)} // the ambient beds dip a little

 // clicks on any button / row / swatch
 document.addEventListener('pointerdown',e=>{const b=e.target.closest&&e.target.closest('button,.sr,.ar,.bopt,#sw i,#shp i');if(b&&!b.classList.contains('pad'))play('click')},true);

 // A resident talking (the 'speak' recording, Animal Crossing style): a quick run of 3-12 blips, each one at its own random pitch. You only hear it when the camera is close to the one talking
 // (SPEAK_RANGE dots; quieter the further away, panned to the side it is on). SPEAK_V is the loudness trim (the recording is quiet), BLIP_GAP the time between blips (s), PITCH the range in semitones.
 const SPEAK_V=3.4,SPEAK_RANGE=70,BLIP_GAP=.085,PITCH_LO=-6,PITCH_HI=9,speakEnd=[];
 function speak(d,pan){
  if(!live()||!buf.speak)return;
  const q=Math.pow(Math.max(0,1-d/SPEAK_RANGE),1.4);if(q<.02)return; // too far away to hear
  const now=ctx.currentTime;while(speakEnd.length&&speakEnd[0]<now)speakEnd.shift();if(speakEnd.length>=4)return; // never a pile of voices at once
  const n=3+Math.floor(Math.random()*10),p0=Math.max(-1,Math.min(1,pan||0));let t=now+.03;
  for(let i=0;i<n;i++){
   const s=ctx.createBufferSource(),g=ctx.createGain(),p=ctx.createStereoPanner?ctx.createStereoPanner():null,rate=Math.pow(2,(PITCH_LO+Math.random()*(PITCH_HI-PITCH_LO))/12),dur=buf.speak.duration/rate;
   s.buffer=buf.speak;s.playbackRate.value=rate;g.gain.setValueAtTime(SPEAK_V*q*(.8+Math.random()*.2),t);g.gain.linearRampToValueAtTime(0,t+dur);
   s.connect(g);if(p){p.pan.value=p0;g.connect(p);p.connect(bus)}else g.connect(bus);s.start(t);
   t+=BLIP_GAP*(.85+Math.random()*.4)}
  speakEnd.push(t+.15)}

 return{unlock,play,toast,thunder,step,roar,growl,speak,tick,machines,pad:i=>play('pad',{i}),
  volume:()=>vol,muted:()=>muted,
  setVolume:v=>{vol=Math.max(0,Math.min(1,v));save();applyMaster()},
  setMuted:m=>{muted=!!m;save();applyMaster()}}
})();
