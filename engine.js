// 《地獄籃不住：籃獄圖譜》HOOPocalypse: Atlas of the Damned Rim
// Single-finger physics basketball × dark-comedy roguelite × boss hunt × relic collection.
// Data-driven rebuild. Self-contained, no network. Bean-style art. exposes start(canvas, root).

function resetLocalDataIfRequested(){
  try{
    const params=new URLSearchParams(window.location.search||'');
    const shouldReset=params.has('resetLocalData')||params.has('freshStart')||params.has('reset-local-data');
    if(!shouldReset) return false;
    const keys=['hoopocalypse_save_v2','abyss_hoop_save_v1','abyss_hoop_save_v1_backup','hb_profile_v2','hb_layout_v1'];
    for(const k of keys) localStorage.removeItem(k);
    try{ sessionStorage.clear(); }catch(e){}
    for(const k of ['resetLocalData','freshStart','reset-local-data']) params.delete(k);
    const query=params.toString();
    const next=window.location.pathname+(query?'?'+query:'')+window.location.hash;
    window.history&&window.history.replaceState&&window.history.replaceState(null,'',next);
    return true;
  }catch(e){ return false; }
}
function start(canvas, root){ const didReset=resetLocalDataIfRequested(); const G=new Game(canvas,root); G.boot(); try{window.__HB=G; window.__HB_RESET_DONE=didReset;}catch(e){} if(didReset){ try{ setTimeout(()=>G.toast('本機資料已清除','可以重新開始遊玩'),200); }catch(e){} } return G; }
try{ window.HBStart = start; }catch(e){}

// ---------- math / util ----------
const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const chance=p=>Math.random()<p;
let BW=1920; const BH=1080,FIXED=1/120;
const SAVE_KEY='hoopocalypse_save_v2';
const OLD_KEY='abyss_hoop_save_v1';
const SUPABASE_SYNC={
  url:'https://brkkasnsikzxoienzdzb.supabase.co',
  key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya2thc25zaWt6eG9pZW56ZHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTMxODgsImV4cCI6MjA5ODA2OTE4OH0.jlVVfDrHWGNFJGN_HUeNMfD1lXPf53LP4SvoK_UiBJk',
  table:'player_accounts'
};

// ---------- persistence + migration ----------
function defaultSave(){ return {
  ver:2, coins:0, tutorialDone:false, admin:false, layoutMode:false,
  hero:'shade',
  relics:[null,null,null],        // 3 universal slots (relic ids)
  loadout:[null,null,null,null,null], // 5-relic pre-expedition loadout (hero page)
  library:[],                     // relic ids in storage
  acts:1,                         // highest act unlocked
  marks:{},                       // bossId -> mark count
  heat:{},                        // routeId -> 0..5
  memory:{},                      // routeId -> state string
  bossClears:{},                  // bossId -> times
  nodeProg:{},                    // act -> 已開通節點數(永久, 逐關傳送點)
  endless:false, endlessBest:0,
  deaths:0, deathsDay:0, deathsDayKey:'',
  login:{ name:'', code:'', remember:true },
  stats:{ bestScore:0, bestAcc:0, bestCombo:0, totalShots:0, swishes:0, banks:0 },
  settings:{ music:true, sfx:true, vibrate:true, reduceMotion:false, lefty:false, lowPerf:false, shotPush:false, musicVol:0.5, sfxVol:0.8 },
}; }
function loadSave(){
  let s=null; try{ s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); }catch(e){}
  if(!s){ s=migrateOld()||defaultSave(); }
  const d=defaultSave();
  for(const k in d) if(!(k in s)) s[k]=d[k];
  for(const k in d.settings) if(!(k in s.settings)) s.settings[k]=d.settings[k];
  for(const k in d.stats) if(!(k in s.stats)) s.stats[k]=d.stats[k];
  if(!s.login||typeof s.login!=='object') s.login={};
  for(const k in d.login) if(!(k in s.login)) s.login[k]=d.login[k];
  if(!s.login.code&&s.login.pass) s.login.code=s.login.pass;
  // ---- per-mode progress 遷移：把舊全域進度複製進三模式（不鎖任何模式），此後各自獨立 ----
  if(!s.modeProg){
    const mk=()=>({ acts:s.acts||1, marks:Object.assign({},s.marks||{}), bossClears:Object.assign({},s.bossClears||{}), heat:Object.assign({},s.heat||{}), memory:Object.assign({},s.memory||{}), nodeProg:Object.assign({},s.nodeProg||{}) });
    s.modeProg={ fast:mk(), std:mk(), corrupt:mk() };
  }
  return s;
}
function migrateOld(){
  let o=null; try{ o=JSON.parse(localStorage.getItem(OLD_KEY)||'null'); }catch(e){}
  if(!o) return null;
  try{ localStorage.setItem(OLD_KEY+'_backup', JSON.stringify(o)); }catch(e){}
  const s=defaultSave();
  s.coins=o.coins||0; s.tutorialDone=!!o.tutorialDone;
  if(o.bestScore) s.stats.bestScore=o.bestScore;
  if(o.bestCombo) s.stats.bestCombo=o.bestCombo;
  if(o.bestAccuracy) s.stats.bestAcc=o.bestAccuracy;
  if(o.maxAbyss) s.acts=clamp(o.maxAbyss,1,5);
  if(o.settings){ for(const k in s.settings) if(k in o.settings) s.settings[k]=o.settings[k];
    if(o.settings.musicVol!=null) s.settings.musicVol=o.settings.musicVol;
    if(o.settings.sfxVol!=null) s.settings.sfxVol=o.settings.sfxVol; }
  // convert old legendary gear into nearest relics, drop into library
  const conv={ emberheart:'abbey_ember', stormglass:'citadel_battery', gravemoon:'deadeye_sigil', frostcore:'final_chill',
    wardband:'kings_seal', deadeyewrap:'deadeye_sigil', hexring:'hex_idol', bloodring:'blood_chalice',
    riftstep:'rift_feather', cinderstep:'sand_bow', timewalker:'pilgrim_bone', pilgrim:'pilgrim_bone' };
  const add=it=>{ if(it&&it.uniqId&&conv[it.uniqId] && !s.library.includes(conv[it.uniqId])) s.library.push(conv[it.uniqId]); };
  if(o.equipped){ add(o.equipped.orb); add(o.equipped.wrist); add(o.equipped.boots); }
  if(Array.isArray(o.bag)) o.bag.forEach(add);
  // seat first 3 into slots
  for(let i=0;i<3 && s.library.length;i++){ s.relics[i]=s.library.shift(); }
  return s;
}
function persist(s){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }catch(e){} }

// ---------- Web Audio synth ----------
class Audio{
  constructor(){ this.ac=null; this.master=null; this.musicGain=null; this.sfxGain=null;
    this.enMusic=true; this.enSfx=true; this.mVol=0.5; this.sVol=0.8; this._theme=null; this._timer=null;
    this._song=null; this._songSrc='/assets/audio/court_of_stone.mp3'; this._usingSong=false; }
  ensure(){ if(this.ac) return; try{ const AC=window.AudioContext||window.webkitAudioContext; this.ac=new AC();
    this.master=this.ac.createGain(); this.master.gain.value=0.9; this.master.connect(this.ac.destination);
    this.musicGain=this.ac.createGain(); this.musicGain.gain.value=this.enMusic?this.mVol:0; this.musicGain.connect(this.master);
    this.sfxGain=this.ac.createGain(); this.sfxGain.gain.value=this.enSfx?this.sVol:0; this.sfxGain.connect(this.master);
  }catch(e){ this.ac=null; } }
  _musicVol(){ return this.enMusic?Math.max(0,Math.min(1,this.mVol)):0; }
  _ensureSong(){ if(this._song) return this._song; try{ const a=new window.Audio(this._songSrc); a.loop=true; a.preload='auto'; a.volume=this._musicVol(); this._song=a; return a; }catch(e){ return null; } }
  _startSong(){ const a=this._ensureSong(); if(!a||!this.enMusic) return false; this._usingSong=true; a.volume=this._musicVol(); const p=a.play(); if(p&&p.catch)p.catch(()=>{}); return true; }
  _stopSong(){ if(this._song){ try{ this._song.pause(); }catch(e){} } this._usingSong=false; }
  resume(){ this.ensure(); if(this.ac&&this.ac.state==='suspended') this.ac.resume(); if(this._usingSong&&this._song&&this.enMusic){ const p=this._song.play(); if(p&&p.catch)p.catch(()=>{}); } }
  setMusic(b){ this.enMusic=b; if(this.musicGain) this.musicGain.gain.value=b?this.mVol:0; if(this._song){ this._song.volume=this._musicVol(); if(b&&this._usingSong){ const p=this._song.play(); if(p&&p.catch)p.catch(()=>{}); } else if(!b){ try{this._song.pause();}catch(e){} } } }
  setSfx(b){ this.enSfx=b; if(this.sfxGain) this.sfxGain.gain.value=b?this.sVol:0; }
  setMVol(v){ this.mVol=v; if(this.musicGain) this.musicGain.gain.value=this.enMusic?v:0; if(this._song)this._song.volume=this._musicVol(); }
  setSVol(v){ this.sVol=v; if(this.sfxGain) this.sfxGain.gain.value=this.enSfx?v:0; }
  tone(f,dur,type,gain,when,slide){ if(!this.ac||!this.enSfx) return; const t=when||this.ac.currentTime;
    const o=this.ac.createOscillator(),g=this.ac.createGain(); o.type=type||'sine'; o.frequency.setValueAtTime(f,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+dur);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain||0.3,t+0.005); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t+dur+0.02); }
  noise(dur,gain,ff,when,type){ if(!this.ac||!this.enSfx) return; const t=when||this.ac.currentTime;
    const len=Math.max(1,Math.floor(this.ac.sampleRate*dur)); const buf=this.ac.createBuffer(1,len,this.ac.sampleRate); const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    const src=this.ac.createBufferSource(); src.buffer=buf; const fl=this.ac.createBiquadFilter(); fl.type=type||'lowpass'; fl.frequency.value=ff||1200;
    const g=this.ac.createGain(); g.gain.setValueAtTime(gain||0.3,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(fl); fl.connect(g); g.connect(this.sfxGain); src.start(t); src.stop(t+dur+0.02); }
  sfx(n){ if(!this.ac) return; const T=this.ac.currentTime; switch(n){
    case 'release': this.tone(420,0.12,'sawtooth',0.12,T,180); this.noise(0.1,0.06,3000,T,'highpass'); break;
    case 'whoosh': this.noise(0.18,0.05,900,T,'bandpass'); break;
    case 'floor': this.tone(120,0.09,'sine',0.22,T,70); this.noise(0.05,0.08,500); break;
    case 'board': this.tone(180,0.11,'square',0.14,T,120); this.noise(0.06,0.07,1600); break;
    case 'rim': this.tone(900,0.09,'triangle',0.13,T,600); this.tone(1350,0.07,'sine',0.08); break;
    case 'score': this.tone(523,0.12,'sine',0.22,T); this.tone(784,0.16,'sine',0.18,T+0.04); break;
    case 'bank': this.tone(415,0.12,'triangle',0.2,T); this.tone(622,0.16,'sine',0.16,T+0.05); this.tone(831,0.18,'sine',0.12,T+0.1); break;
    case 'swish': this.tone(660,0.14,'sine',0.22,T); this.tone(990,0.18,'sine',0.2,T+0.05); this.tone(1320,0.22,'sine',0.16,T+0.1); this.noise(0.2,0.04,6000,T,'highpass'); break;
    case 'hit': this.tone(220,0.08,'sawtooth',0.16,T,120); this.noise(0.06,0.1,2200); break;
    case 'death': this.tone(160,0.22,'sawtooth',0.18,T,50); this.noise(0.18,0.12,800); break;
    case 'fire': this.noise(0.25,0.1,1400,T,'bandpass'); this.tone(300,0.2,'sawtooth',0.08,T,90); break;
    case 'ice': this.tone(1400,0.18,'sine',0.1,T,2400); this.tone(2100,0.12,'triangle',0.07); break;
    case 'lightning': this.noise(0.12,0.14,4000,T,'highpass'); this.tone(1800,0.08,'sawtooth',0.1,T,400); break;
    case 'axe': this.tone(200,0.16,'sawtooth',0.14,T,90); this.noise(0.12,0.1,1200,T,'bandpass'); break;
    case 'arrow': this.noise(0.14,0.08,3500,T,'bandpass'); this.tone(900,0.1,'triangle',0.1,T,500); break;
    case 'hurt': this.tone(200,0.18,'sawtooth',0.2,T,80); this.noise(0.12,0.12,700); break;
    case 'ui': this.tone(600,0.06,'sine',0.1,T,800); break;
    case 'select': this.tone(440,0.1,'sine',0.14,T); this.tone(660,0.12,'sine',0.12,T+0.04); break;
    case 'coin': this.tone(880,0.08,'square',0.1,T); this.tone(1320,0.1,'square',0.08,T+0.04); break;
    case 'levelup': this.tone(523,0.1,'sine',0.18,T); this.tone(659,0.1,'sine',0.18,T+0.08); this.tone(880,0.16,'sine',0.18,T+0.16); break;
    case 'word': this.tone(330,0.2,'sawtooth',0.16,T,160); this.tone(494,0.24,'square',0.12,T+0.1); this.tone(659,0.3,'sine',0.16,T+0.22); break;
    case 'whistle': this.tone(2300,0.18,'square',0.08,T,2600); this.tone(2600,0.12,'square',0.06,T+0.12); break;
    case 'win': this.tone(523,0.18,'sine',0.2,T); this.tone(659,0.18,'sine',0.2,T+0.12); this.tone(784,0.18,'sine',0.2,T+0.24); this.tone(1047,0.3,'sine',0.2,T+0.36); break;
    case 'lose': this.tone(330,0.3,'sawtooth',0.18,T,160); this.tone(247,0.5,'sine',0.16,T+0.15,120); break;
    case 'boss': this.tone(70,0.6,'sawtooth',0.2,T,180); this.tone(110,0.5,'square',0.1,T+0.1); break;
  } }
  startTheme(key,intense){ this.ensure(); const id=key+(intense?'!':''); if(this._theme===id) return; this.stopTheme(); this._theme=id; if(!this.enMusic) return;
    if(key!=='hub'&&this._startSong()) return;
    if(!this.ac) return;
    const ac=this.ac; const roots={abbey:110,sand:98,city:104,inferno:87,final:123.47,hub:98};
    const root=roots[key]||104; const seq=[0,0,3,0,5,3,0,-2]; let step=0; const beat=intense?0.32:0.5;
    const play=()=>{ if(!this.ac||this._theme!==id) return; const t=ac.currentTime; const f=root*Math.pow(2,seq[step%seq.length]/12);
      const o=ac.createOscillator(),g=ac.createGain(); o.type='sine'; o.frequency.value=f/2; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.15,t+0.04); g.gain.exponentialRampToValueAtTime(0.0001,t+beat*0.9); o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t+beat);
      const o2=ac.createOscillator(),g2=ac.createGain(); o2.type='triangle'; o2.frequency.value=f; g2.gain.setValueAtTime(0.0001,t); g2.gain.exponentialRampToValueAtTime(0.05,t+0.1); g2.gain.exponentialRampToValueAtTime(0.0001,t+beat*1.6); o2.connect(g2); g2.connect(this.musicGain); o2.start(t); o2.stop(t+beat*1.7);
      if(intense&&step%2===0) this.noise(0.05,0.05,6000,t,'highpass'); step++; this._timer=setTimeout(play,beat*1000); };
    play();
  }
  stopTheme(){ if(this._timer) clearTimeout(this._timer); this._timer=null; this._stopSong(); this._theme=null; }
}
// ============================================================
// DATA TABLES (§22)
// ============================================================
// element colors
const COL={ fire:'#ff7a3c', ice:'#6fd8ff', lightning:'#ffe14d', axe:'#cdd2da', arrow:'#b9f06a', normal:'#ff9a4a',
  gold:'#e8b83a', ink:'#ece0c4', corrupt:'#c4342a', set:'#39ad39', magic:'#6b86e8' };

// ---- BALL FORMS ---- attack(G, ctx{hx,hy,guards,swish,bank,dmg,combo}) executed on basket
const BALL_FORMS = {
  normal:{ id:'normal', name:'老派皮球', en:'Worn Leather', color:'#e0631e', land:'bounce',
    desc:'單體爆發最高，空心/擦板倍率提升', attack:(G,c)=>G.formNormal(c) },
  fire:{ id:'fire', name:'火球', en:'Fireball', color:'#ff7a3c', land:'fire',
    desc:'轟向最密集區，範圍爆炸＋燃燒', attack:(G,c)=>G.formFire(c) },
  ice:{ id:'ice', name:'冰封球', en:'Frost Orb', color:'#6fd8ff', land:'ice',
    desc:'凍結 3~5 隻，優先施法者，擊碎爆裂', attack:(G,c)=>G.formIce(c) },
  lightning:{ id:'lightning', name:'閃電球', en:'Storm Ball', color:'#ffe14d', land:'lightning',
    desc:'連鎖多隻，空心增加跳躍', attack:(G,c)=>G.formLightning(c) },
  axe:{ id:'axe', name:'斬魂斧', en:'Soulcleaver', color:'#cdd2da', land:'axe',
    desc:'橫掃怪群再返回，最多命中兩次', attack:(G,c)=>G.formAxe(c) },
  arrow:{ id:'arrow', name:'魂弓箭矢', en:'Wraith Arrow', color:'#b9f06a', land:'arrow',
    desc:'穿透直線敵人，優先施法者', attack:(G,c)=>G.formArrow(c) },
};
const FORM_CHOICES=['fire','ice','lightning','axe','arrow'];

// ---- GUARD TYPES ---- (orbit host; some carry interference)
const GUARDS = {
  skel:    { name:'骷髏替補', hp:22, r:30, color:'#e7ddc4', body:'skel' },
  shield:  { name:'盾牌骷髏', hp:30, r:34, color:'#cbb9a0', body:'shield', shield:true },
  slime:   { name:'黏液替補', hp:26, r:32, color:'#9ac63f', body:'slime' },
  mummy:   { name:'木乃伊啦啦隊', hp:24, r:32, color:'#d8c9a0', body:'mummy' },
  spider:  { name:'蛛網小怪', hp:20, r:28, color:'#8a6cc0', body:'spider' },
  // interference creatures
  chain:   { name:'鐵鍊小鬼', hp:24, r:30, color:'#9a8f80', body:'imp', intf:'gravity' },
  bat:     { name:'迷霧蝙蝠', hp:16, r:26, color:'#7d6cff', body:'bat', intf:'shortTraj' },
  zombie:  { name:'油手殭屍', hp:30, r:34, color:'#7fae6a', body:'zombie', intf:'maxPull' },
  frost:   { name:'冰冷巫師', hp:26, r:32, color:'#6fd8ff', body:'wizard', intf:'slowCharge' },
  eye:     { name:'詛咒眼球', hp:18, r:28, color:'#e0633c', body:'eye', intf:'hideLanding' },
  drummer: { name:'鼓手惡魔', hp:28, r:32, color:'#c46a3a', body:'drummer', intf:'drum' },
};

// ---- INTERFERENCES ---- (per shot, telegraphed; applied at aim/flight)
const INTERFERENCES = {
  gravity:    { name:'重力增幅', icon:'⛓', desc:'下一球重力 +25%', shots:1 },
  shortTraj:  { name:'迷霧短軌', icon:'🌫', desc:'兩球軌跡縮短 50%', shots:2 },
  maxPull:    { name:'油手黏球', icon:'🖐', desc:'下一球最大拉力 -15%', shots:1 },
  slowCharge: { name:'寒霜蓄力', icon:'❄', desc:'下一球蓄力變慢 25%', shots:1 },
  hideLanding:{ name:'詛咒之眼', icon:'👁', desc:'隱藏落點一球', shots:1 },
  drum:       { name:'戰鼓催促', icon:'🥁', desc:'其他小怪倒數前進一格', shots:0 },
};

// ---- 精英手段 (蓄招; 蓄滿主動放招, 進球反制) ----
const ELITE_MOVES = {
  chain:   {id:'pull',   name:'拽拉', charge:2, eff:'grav',   counter:'空心打斷'},
  bat:     {id:'fog',    name:'濃霧', charge:2, eff:'fog',    counter:'空心打斷'},
  zombie:  {id:'grip',   name:'黏球', charge:2, eff:'grip',   counter:'空心打斷'},
  frost:   {id:'freeze', name:'凍框', charge:2, eff:'freeze', counter:'空心打斷'},
  eye:     {id:'gaze',   name:'凝視', charge:2, eff:'gaze',   counter:'空心打斷／擊殺'},
  drummer: {id:'drum',   name:'戰鼓', charge:3, eff:'drum',   counter:'擊殺它解除'},
  shield:  {id:'guard',  name:'鐵壁', charge:0, eff:'armor',  counter:'空心或擦板破甲'},
};
const ELITE_MOVE_DEFAULT = {id:'slam', name:'蠻擊', charge:2, eff:'slam', counter:'空心打斷／擊殺'};
function _eliteMoveFor(type){ return ELITE_MOVES[type]||ELITE_MOVE_DEFAULT; }

// ---- 英雄招牌特效 (基礎攻擊剪影; 進球觸發) ----
const HERO_SIG = {
  whistle: {kind:'sigFist',  col:'#f3e2a8', dur:0.85},
  archer:  {kind:'sigSpears',col:'#7fe0a8', dur:0.85},
  axer:    {kind:'sigAxe',   col:'#ff8a5a', dur:0.85},
  shade:   {kind:'sigDash',  col:'#a98cf0', dur:0.85},
  elem:    {kind:'sigElem',  col:'#6fd8ff', dur:0.9},
  beast:   {kind:'sigClaw',  col:'#e0a050', dur:0.7},
  bone:    {kind:'sigBone',  col:'#cdd2b2', dur:0.85},
};
function _ez(t){ return t<=0?0:(t>=1?1:1-Math.pow(1-t,3)); }
function _lp(a,b,t){ return a+(b-a)*t; }

// ---- 速投模式 專屬沙包（每幕一隻，依序 act1-5）----
const SANDBAGS = {
  1:{name:'灰哨不倒僧', file:'/assets/mob/speed/act1.webp'},
  2:{name:'補丁不倒囚', file:'/assets/mob/speed/act2.webp'},
  3:{name:'苔膿不倒屍', file:'/assets/mob/speed/act3.webp'},
  4:{name:'凍封不倒翁', file:'/assets/mob/speed/act4.webp'},
  5:{name:'加冕不倒王', file:'/assets/mob/speed/act5.webp'},
};

// ---- ABILITIES (球途盤, 3 trees) ---- effect flags read in combat
const ABILITIES = [
  // 元素之徑
  {id:'ember', tree:'element', name:'餘燼核心', desc:l=>`火球燃燒 +${1+l}秒`},
  {id:'triple', tree:'element', name:'爆裂三分', desc:l=>`每第三球追加範圍爆炸 ${(18+l*8)|0}`},
  {id:'chain', tree:'element', name:'鏈式火花', desc:l=>`閃電多跳 ${l} 次`},
  {id:'overload', tree:'element', name:'超載空心', desc:l=>`空心球追加雷擊 ${(16+l*8)|0}`},
  {id:'deepfreeze', tree:'element', name:'深度凍結', desc:l=>`凍結時間 +${(l*0.6).toFixed(1)}秒`},
  {id:'shatter', tree:'element', name:'冰裂', desc:l=>`凍結敵死亡爆裂 ${(20+l*10)|0}`},
  // 兵器之徑
  {id:'returnblade', tree:'weapon', name:'返回刀路', desc:l=>`斧頭返回傷害 +${30+l*10}%`},
  {id:'bigaxe', tree:'weapon', name:'巨斧擦板', desc:l=>`擦板放大斧頭 +${l} 命中`},
  {id:'pierce', tree:'weapon', name:'穿心箭', desc:l=>`箭矢穿透 +${l}`},
  {id:'splitarrow', tree:'weapon', name:'分裂箭雨', desc:l=>`箭矢命中分裂 ${l} 支`},
  {id:'execute', tree:'weapon', name:'處刑記號', desc:l=>`殘血小怪傷害 +${40+l*15}%`},
  {id:'witchaim', tree:'weapon', name:'獵巫準星', desc:l=>`對施法者傷害 +${50+l*15}%`},
  // 神射之徑
  {id:'deadeye', tree:'sharp', name:'死眼', desc:l=>`空心球傷害 +${40+l*10}%`},
  {id:'boardmaster', tree:'sharp', name:'籃板宗師', desc:l=>`擦板球傷害 +${30+l*10}%`},
  {id:'hothand', tree:'sharp', name:'火熱手感', desc:l=>`連擊倍率 +${(l*4)}%/層`},
  {id:'quicklearn', tree:'sharp', name:'快速開竅', desc:l=>`所有進球 XP +${20+l*10}%`},
  {id:'secondchance', tree:'sharp', name:'第二次機會', desc:l=>`每關首次失手不扣血`},
  {id:'lastshot', tree:'sharp', name:'背水一投', desc:l=>`低血傷害+軌跡 +${25+l*5}%`},
];
const TREE_NAME={ element:'元素之徑', weapon:'兵器之徑', sharp:'神射之徑' };

// ---- BALL WORDS (球語) ----
const BALL_WORDS = [
  {id:'cremation', name:'火葬三分', en:'Cremation Three', form:'fire', need:['ember','triple','deadeye']},
  {id:'fullcurrent', name:'全場通電', en:'Full Court Volt', form:'lightning', need:['chain','overload']},
  {id:'benchking', name:'冷板凳之王', en:'King of the Bench', form:'ice', need:['deepfreeze','shatter']},
  {id:'axefoul', name:'投斧違例', en:'Axe Violation', form:'axe', need:['returnblade','bigaxe']},
  {id:'arcdeadeye', name:'弧線死眼', en:'Arcing Deadeye', form:'arrow', need:['pierce','witchaim']},
  {id:'onemore', name:'再投一球', en:'One More Shot', need:['secondchance','lastshot','quicklearn']},
  {id:'leatheronly', name:'我只投皮球', en:'Leather Only', form:'normal', need:['deadeye','boardmaster','hothand']},
];

// ---- RELICS (聖物) ---- class: core/feel/oath ; signature relics grant a starting form
const RELICS = {
  // 5 signature
  abbey_ember:   {name:'修院餘燼', cls:'core', form:'fire', act:1, desc:'開局火球形態；首球進球全體小爆'},
  sand_bow:      {name:'貫穿球核', cls:'core', form:'arrow', act:2, desc:'開局貫穿形態；遠投穿透 +1'},
  citadel_battery:{name:'城邦電瓶', cls:'core', form:'lightning', act:3, desc:'開局閃電形態；每關首次空心連鎖全體'},
  red_axe:       {name:'迴旋球核', cls:'core', form:'axe', act:4, desc:'開局迴旋形態；橫掃多名怪'},
  final_chill:   {name:'終場寒核', cls:'core', form:'ice', act:5, desc:'開局冰封形態；每關首球取消一名施法'},
  ember_saint:   {name:'餘燼聖球', cls:'core', form:'fire', act:1, desc:'開局火球；空心進球在密集區追加聖火爆'},
  iron_hook:     {name:'鐵索鉤球', cls:'core', form:'arrow', act:2, desc:'開局貫穿；進球額外鉤擊最遠的怪'},
  coldflame_tesla:{name:'冷焰連電球', cls:'core', form:'lightning', act:3, desc:'開局閃電；空心進球冷焰連鎖三人並凍緩'},
  thunderbone:   {name:'雷骨碎裂球', cls:'core', form:'axe', act:4, desc:'開局迴旋；進球落雷劈最強敵並骨刺迸射'},
  absolute_zero: {name:'絕對零度球', cls:'core', form:'ice', act:5, desc:'開局冰封；每第四球凍結全場前排'},
  // 10 universal
  broken_glass:  {name:'破碎沙漏', cls:'feel', desc:'所有干擾持續 -1 球'},
  deadeye_sigil: {name:'死眼徽記', cls:'feel', desc:'軌跡 +20%，空心傷害 +15%'},
  kings_seal:    {name:'王衛印璽', cls:'feel', desc:'擦板球獲 6 護盾'},
  blood_chalice: {name:'血之聖杯', cls:'oath', desc:'連擊≥5每兩球回 2 生命'},
  hex_idol:      {name:'咒織偶像', cls:'core', desc:'每第五球隨機火/冰/雷'},
  pilgrim_bone:  {name:'朝聖者遺骨', cls:'oath', desc:'完成關卡回 8% 最大生命'},
  rift_feather:  {name:'裂隙羽骨', cls:'oath', desc:'每幕一次致命失手剩 1 生命'},
  champ_ball:    {name:'爛皮冠軍球', cls:'core', desc:'保持皮球時空心/擦板倍率提高'},
  bench_towel:   {name:'替補席毛巾', cls:'feel', desc:'每次升級額外重抽一次'},
  ref_glasses:   {name:'裁判近視眼鏡', cls:'feel', desc:'軌跡縮短干擾減半（畫面略糊）'},
  board_brace:   {name:'板魂護腕', cls:'feel', desc:'擦板進球額外觸發小範圍震波'},
};
const RELIC_CLASS={ core:'球核', feel:'手感', oath:'誓約' };

// ---- HEROES (7 投手) ----
const HEROES = [
  {id:'shade', name:'影步空心仔', en:'Shadow Swisher', tag:'只要空心夠準，整場都是他的表演。', origin:'影投客', role:'連擊／空心', body:'mage', col:'#6a3fa8', passive:'空心球後，下一球軌跡 +15%'},
  {id:'bone', name:'骨灰級教練', en:'Fossil Coach', tag:'死掉的隊友還會幫他補刀。', origin:'骨場教練', role:'擊殺連鎖', body:'necro', col:'#5a7a52', passive:'小怪死亡時有機率射出骨片'},
  {id:'archer', name:'荒原三分嬸', en:'Wasteland Longshot', tag:'站越遠越準，近的反而不想投。', origin:'荒弓前鋒', role:'箭矢／遠投', body:'amazon', col:'#2f8a78', passive:'遠距離進球傷害 +12%'},
  {id:'axer', name:'擦板蠻王', en:'Boardbarian', tag:'專門用籃板羞辱敵人。', origin:'狂斧中鋒', role:'戰斧／擦板', body:'barb', col:'#b5483f', passive:'擦板球使下次範圍傷害提高'},
  {id:'whistle', name:'假摔聖騎', en:'Flop Crusader', tag:'投不進就說是對方犯規。', origin:'聖哨後衛', role:'生存／容錯', body:'paladin', col:'#aeb4b3', passive:'每關第一次失手只扣一半生命'},
  {id:'elem', name:'元素外掛仔', en:'Elemental Cheeser', tag:'進一球就像開外掛。', origin:'元素投手', role:'火冰雷', body:'mage2', col:'#a97545', passive:'第一次元素能力自動+1級'},
  {id:'beast', name:'鹿角撿板仔', en:'Antler Rebounder', tag:'靠亂彈賺的。', origin:'野獸控球', role:'混合／XP', body:'druid', col:'#c85e20', passive:'多殺 XP 提高，落地彈跳更誇張'},
];
const HERO_TALENTS = {
  axer: {
    break: [
      {name:'粗暴擦板', desc:'擦板傷害提高。'},
      {name:'斧影回彈', desc:'擦板後產生斧頭返回。'},
      {name:'籃板碎裂', desc:'擦板進球造成小範圍震波。'},
      {name:'蠻力追框', desc:'籃框換位後，第一球傷害提高。'},
      {name:'雙重板羞辱', desc:'一球碰板兩次後進球，觸發額外斬擊。'},
      {name:'破框重擊', desc:'擦板進球有機率秒殺低血小怪。'},
      {name:'板命一擊', desc:'Boss 波中，第一次擦板空心觸發大範圍斧爆。'},
    ],
    dirty: [
      {name:'不怕打鐵', desc:'打框未進時，下一球軌跡略增。'},
      {name:'裁判裝死', desc:'每關第一次普通失手不觸發怪物干擾。'},
      {name:'反制重球', desc:'重力增幅效果降低。'},
      {name:'框邊挑釁', desc:'彈框進球也算連擊不中斷。'},
      {name:'亂板干擾', desc:'擦板進球後，使一名干擾怪沉默一球。'},
      {name:'鐵框護體', desc:'打板進球時獲得短暫護盾。'},
      {name:'犯規也算', desc:'每關一次投失，若球碰到框，仍觸發半額傷害。'},
    ],
    feel: [
      {name:'老派手腕', desc:'蓄力條更穩。'},
      {name:'板感記憶', desc:'擦板進球後，下次顯示更長預測線。'},
      {name:'重手不飄', desc:'球受風與干擾影響降低。'},
      {name:'慢投老司機', desc:'長時間蓄力後，傷害提高。'},
      {name:'落點直覺', desc:'詛咒之眼隱藏落點時，仍保留模糊提示。'},
      {name:'手感發燙', desc:'連續進球提高球速與得分。'},
      {name:'蠻王手感', desc:'擦板、彈框、空心都能累積不同層數加成。'},
    ],
  },
};

// ---- ROUTE STONES (球路石板) ----
const ROUTE_STONES = [
  {id:'nogate', name:'無門捷徑', desc:'跳過一個菁英關，但 Boss +一組護衛'},
  {id:'greed', name:'貪婪深路', desc:'聖物掉落提高，失手傷害 +20%'},
  {id:'hunter', name:'追獵者誓約', desc:'菁英比例提高，所有進球 XP +20%'},
  {id:'seal', name:'不朽鎮印', desc:'本次遠征第一次失手不扣血'},
  {id:'farsight', name:'遠望之徑', desc:'顯示所有事件與標誌傾向'},
  {id:'bench', name:'替補名單', desc:'每次升級可重抽，但 Boss 多一階段護衛'},
];

// ---- ACTS / STAGES (5 acts × 4 stages) ----
const ACTS = [
  {id:1, key:'abbey', name:'灰哨修院', sub:'Ashen Whistle Abbey', sky:['#1b1726','#120d18'], floor:'#15110d', rune:'#e08a32', relic:'abbey_ember', boss:'院長 痛苦院長'},
  {id:2, key:'sand', name:'鐵籃貧民窟', sub:'Iron Rim Slums', sky:['#1a0d0a','#241410'], floor:'#1c1210', rune:'#ffb070', relic:'sand_bow', boss:'鐵籃收租王'},
  {id:3, key:'city', name:'冷焰球具塔', sub:'Coldflame Tower', sky:['#0e1a12','#101f16'], floor:'#0e1310', rune:'#9ac63f', relic:'citadel_battery', boss:'冷焰記分員'},
  {id:4, key:'inferno', name:'雷骨看台', sub:'Thunderbone Stands', sky:['#1f0c08','#2a120a'], floor:'#1c0f08', rune:'#ff6a2a', relic:'red_axe', boss:'雷骨裁判長'},
  {id:5, key:'final', name:'終焉籃堂', sub:'Final Court', sky:['#0a0f1a','#101a2a'], floor:'#0e1320', rune:'#9fe6ff', relic:'final_chill', boss:'籃框宿主本尊'},
];
// stage: {act, idx, name, hostName, hostBody, guards:[ids], count, boss, waves, postier}
const STAGES = {
  1:[ {name:'血汗荒原', host:'血羽隊長', body:'captain', guards:['chain','skel'], count:9, tier:1, tut:true},
      {name:'亂葬球場', host:'墓鐘伯爵夫人', body:'countess', guards:['bat','zombie'], count:11, tier:2},
      {name:'地獄球具室', host:'鐵匠裁判', body:'smith', guards:['shield','drummer'], count:12, tier:2},
      {name:'禁聲長廊', host:'靜默監學', body:'smith', guards:['zombie','shield'], count:13, tier:2},
      {name:'地下籃堂', host:'痛苦院長', body:'dean', guards:['chain','bat','skel'], count:18, boss:true, waves:3, tier:3} ],
  2:[ {name:'鐵皮外場', host:'鐵皮工頭', body:'smith', guards:['shield','chain'], count:12, tier:2},
      {name:'破網巷', host:'破網扒手', body:'captain', guards:['drummer','bat'], count:13, tier:2},
      {name:'犯規工寮', host:'黑工監督', body:'countess', guards:['shield','drummer'], count:14, tier:3},
      {name:'地下罰球線', host:'討債組長', body:'star', guards:['chain','shield','drummer'], count:15, tier:3},
      {name:'鐵籃收租王', host:'鐵籃收租王', body:'siege', guards:['shield','drummer','chain'], count:20, boss:true, waves:3, tier:4} ],
  3:[ {name:'冰冷置物間', host:'凍庫管理員', body:'frostref', guards:['frost','bat'], count:13, tier:3},
      {name:'白霧練投室', host:'白霧教練', body:'summoner', guards:['frost','eye'], count:14, tier:3},
      {name:'詛咒看板區', host:'詛咒記分員', body:'gravekeeper', guards:['eye','frost'], count:15, tier:4},
      {name:'無聲三分線', host:'噤聲哨裁', body:'frostref', guards:['eye','frost','bat'], count:16, tier:4},
      {name:'冷焰記分員', host:'冷焰記分員', body:'worm', guards:['frost','eye','slime'], count:22, boss:true, waves:3, tier:4} ],
  4:[ {name:'斷電觀眾席', host:'斷電引座員', body:'knight', guards:['chain','bat'], count:14, tier:4},
      {name:'骨架加油區', host:'骨架啦啦隊', body:'spiderhost', guards:['bat','chain'], count:15, tier:4},
      {name:'重力犯規場', host:'重力裁判', body:'anvil', guards:['chain','shield'], count:16, tier:4},
      {name:'雷鳴高架框', host:'雷鳴技師', body:'redlord', guards:['chain','bat','eye'], count:17, tier:4},
      {name:'雷骨裁判長', host:'雷骨裁判長', body:'redlord', guards:['chain','bat','frost'], count:24, boss:true, waves:3, tier:5} ],
  5:[ {name:'破碎中線', host:'碎線守衛', body:'siege', guards:['chain','frost'], count:15, tier:4},
      {name:'無框禁區', host:'無框惡靈', body:'frostref', guards:['eye','bat'], count:16, tier:4},
      {name:'萬哨死角', host:'萬哨混音師', body:'drumlord', guards:['drummer','chain','frost'], count:17, tier:5},
      {name:'最後罰球', host:'終末裁判', body:'trio', guards:['chain','bat','eye'], count:18, tier:5},
      {name:'籃框宿主本尊', host:'籃框宿主本尊', body:'worldking', guards:['chain','frost','drummer','eye'], count:30, boss:true, waves:4, tier:5, finale:true} ],
};
// ============================================================
// GAME CLASS — core (boot/loop/input/resize/fx/helpers)
// ============================================================
class Game{
  constructor(canvas,root){ this.canvas=canvas; this.root=root; this.ctx=canvas.getContext('2d');
    this.save=loadSave(); this.audio=new Audio();
    const st=this.save.settings; this.audio.enMusic=st.music; this.audio.enSfx=st.sfx; this.audio.mVol=st.musicVol; this.audio.sVol=st.sfxVol;
    this.screen='home'; this.t=0; this.dpr=1; this.scale=1; this.ox=0; this.oy=0; this.portrait=false;
    this.pointer={down:false,x:0,y:0,sx:0,sy:0,id:null,moved:0};
    this.buttons=[]; this.particles=[]; this.floaters=[];
    this.run=null; this._paused=false; this._confirm=null; this._toast=null; this._loginOpen=false; this._loginEls=null;
    this.cam={y:0,zoom:1,ty:0,tz:1}; this.bgScroll=0;
    this.stars=this._mkStars();
    this._raf=null; this._last=0; this._dead=false;
    this._selAct=1; this._selNode=null; this._scroll=0;
    this.insL=0; this.insR=0; this.insT=0; this.insB=0;
    try{ const sp=document.createElement('div'); sp.setAttribute('aria-hidden','true'); sp.style.cssText='position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);'; (document.body||document.documentElement).appendChild(sp); this._safeProbe=sp; }catch(e){}
  }
  _mkStars(){ const s=[]; for(let i=0;i<90;i++) s.push({x:Math.random()*BW,y:Math.random()*BH*0.7,r:Math.random()*1.8+0.4,a:Math.random()*0.5+0.2,tw:Math.random()*TAU}); return s; }

  boot(){ this._onResize=()=>{try{this.resize();}catch(err){this._hbErr(err);}}; window.addEventListener('resize',this._onResize); window.addEventListener('orientationchange',this._onResize);
    this._onVis=()=>{ if(document.hidden){ if(this.screen==='battle'&&this.run) this._paused=true; this.audio.stopTheme(); } };
    document.addEventListener('visibilitychange',this._onVis);
    this._bindInput(); this.resize(); this._preloadHeroes(); this._last=performance.now();
    const loop=(ts)=>{ if(!this.canvas.isConnected){ this._dead=true; return; } this._raf=requestAnimationFrame(loop);
      let dt=(ts-this._last)/1000; this._last=ts; if(dt>0.1)dt=0.1; this.t+=dt; try{ this.update(dt); this.render(); }catch(err){ this._hbErr(err); } };
    this._raf=requestAnimationFrame(loop);
  }
  _hbErr(err){ try{ console.error('[HB]',err); }catch(e){}
    if(this._errShown) return; this._errShown=true;
    try{ var d=document.getElementById('__hb_err'); if(!d){ d=document.createElement('div'); d.id='__hb_err'; document.body.appendChild(d); }
      d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;font:11px/1.5 ui-monospace,monospace;background:#2a1215;color:#ff9a90;padding:10px;border-radius:8px;white-space:pre-wrap;max-height:40vh;overflow:auto;border:1px solid #5c2b2e';
      var msg=(err&&err.message)?err.message:String(err); var stk=(err&&err.stack)?String(err.stack).split('\n').slice(0,4).join('\n'):'';
      d.textContent='[籃框真實錯誤] '+msg+'\n'+stk;
    }catch(e){} }
  destroy(){ cancelAnimationFrame(this._raf); window.removeEventListener('resize',this._onResize); window.removeEventListener('orientationchange',this._onResize);
    document.removeEventListener('visibilitychange',this._onVis); this.audio.stopTheme(); this._unbind&&this._unbind(); this._destroyLoginInputs&&this._destroyLoginInputs(); }

  resize(){ const r=this.root.getBoundingClientRect(); const cw=r.width||innerWidth, ch=r.height||innerHeight;
    this.dpr=Math.max(0.5,Math.min(2,window.devicePixelRatio||1)); this.canvas.width=Math.floor(cw*this.dpr); this.canvas.height=Math.floor(ch*this.dpr);
    this.canvas.style.width=cw+'px'; this.canvas.style.height=ch+'px';
    this.portrait=ch>cw*1.04;
    const minBW=Math.round(BH*1704/786);
    const oldBW=BW; if(!this.portrait){ BW=Math.max(minBW,Math.min(3200,Math.round(BH*cw/ch))); } else { BW=minBW; }
    if(BW!==oldBW && this._mkStars){ try{ this.stars=this._mkStars(); }catch(e){} }
    const s=Math.min(cw/BW,ch/BH); this.scale=s; this.ox=(cw-BW*s)/2; this.oy=(ch-BH*s)/2; this.cw=cw; this.ch=ch;
    try{ if(this._safeProbe){ const cs=getComputedStyle(this._safeProbe); const k=1/(s||1); this.insL=(parseFloat(cs.paddingLeft)||0)*k; this.insR=(parseFloat(cs.paddingRight)||0)*k; this.insT=(parseFloat(cs.paddingTop)||0)*k; this.insB=(parseFloat(cs.paddingBottom)||0)*k; } }catch(e){} }
  toDesign(px,py){ return { x:(px-this.ox)/this.scale, y:(py-this.oy)/this.scale }; }

  _bindInput(){ const c=this.canvas;
    // The canvas is a fullscreen position:fixed inset:0 element, so its visual top-left
    // is always the viewport origin (0,0). On iOS landscape after the address bar
    // collapses, getBoundingClientRect().top can falsely report a non-zero value
    // (layout vs visual viewport drift) while content still renders from y=0 — this
    // shifted every tap upward and made buttons unhittable. So we DON'T subtract
    // rect.left/top; we treat client coords as canvas-local and use the rect only for
    // its width/height (to derive the letterbox scale). In the non-drift case rect.top
    // is 0 anyway, so this is identical and safe everywhere.
    const mapXY=(localX,localY)=>{ const r=c.getBoundingClientRect(); const w=r.width||this.cw||BW, h=r.height||this.ch||BH; const sc=Math.min(w/BW,h/BH)||1; const oxx=(w-BW*sc)/2, oyy=(h-BH*sc)/2; return { x:(localX-oxx)/sc, y:(localY-oyy)/sc }; };
    const getXY=(cx,cy)=>mapXY(cx, cy);
    let lastDownT=0;
    const fresh=()=>{ const n=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); if(n-lastDownT<80) return false; lastDownT=n; return true; };
    const doDown=(cx,cy)=>{ try{this.audio.resume();}catch(e){} if(this.pointer.down) return; const p=getXY(cx,cy);
      this.pointer.down=true; this.pointer.id=null; this.pointer.sx=p.x; this.pointer.sy=p.y; this.pointer.x=p.x; this.pointer.y=p.y; this.pointer.moved=0; try{this.onDown(p.x,p.y);}catch(err){this._hbErr(err);} };
    const doMove=(cx,cy)=>{ if(!this.pointer.down) return; const p=getXY(cx,cy); this.pointer.moved+=dist(this.pointer.x,this.pointer.y,p.x,p.y); this.pointer.x=p.x; this.pointer.y=p.y; try{this.onMove(p.x,p.y);}catch(err){this._hbErr(err);} };
    const doUp=(cx,cy)=>{ if(!this.pointer.down) return; const p=getXY(cx,cy); this.pointer.down=false; this.pointer.id=null; try{this.onUp(p.x,p.y);}catch(err){this._hbErr(err);} };
    let usingTouch=false;
    const DBG=()=>{};
    const pd=e=>{ DBG('PD',e.clientX,e.clientY,e); if(usingTouch)return; if(!fresh())return; doDown(e.clientX,e.clientY); };
    const pm=e=>{ if(usingTouch)return; doMove(e.clientX,e.clientY); };
    const pu=e=>{ DBG('PU',e.clientX,e.clientY,e); if(usingTouch)return; doUp(e.clientX,e.clientY); };
    const ts=e=>{ const t=e.touches[0]; if(t)DBG('TS',t.clientX,t.clientY); usingTouch=true; if(!fresh())return; if(t) doDown(t.clientX,t.clientY); };
    const tm=e=>{ usingTouch=true; const t=e.touches[0]; if(t) doMove(t.clientX,t.clientY); };
    const te=e=>{ const t=e.changedTouches[0]; if(t)DBG('TE',t.clientX,t.clientY); usingTouch=true; if(t) doUp(t.clientX,t.clientY); };
    // CLICK fallback — click is the most reliable tap event on iOS Safari. Uses the
    // same client-direct mapping (no rect.top/left subtraction) so it is immune to the
    // iOS landscape viewport drift that shifted taps upward. Deduped against the
    // up-path via _lastHitT so a tap never fires twice.
    const ck=e=>{ DBG('CK',e.clientX,e.clientY,e); if(this.portrait) return;
      if(this.screen==='battle'&&this.run&&!this._paused&&!this.run.modal) return;
      const now=(typeof performance!=='undefined'?performance.now():Date.now());
      if(now-(this._lastHitT||0) < 450) return;
      var p=mapXY(e.clientX,e.clientY);
      if(this._confirm||this._loginOpen){ try{this.onUp(p.x,p.y);}catch(err){this._hbErr(err);} return; }
      try{ if(this.hitButtons(p.x,p.y)) this.render(); }catch(err){ this._hbErr(err); } };
    const wheel=e=>{ if(this._scrollable){ this._scroll=clamp(this._scroll+e.deltaY,0,this._scrollMax||0); } };
    c.addEventListener('pointerdown',pd); c.addEventListener('pointermove',pm); c.addEventListener('pointerup',pu); c.addEventListener('pointercancel',pu);
    c.addEventListener('touchstart',ts,{passive:true}); c.addEventListener('touchmove',tm,{passive:true}); c.addEventListener('touchend',te,{passive:true}); c.addEventListener('touchcancel',te,{passive:true});
    c.addEventListener('click',ck);
    c.addEventListener('wheel',wheel,{passive:true});
    this._unbind=()=>{ c.removeEventListener('pointerdown',pd); c.removeEventListener('pointermove',pm); c.removeEventListener('pointerup',pu); c.removeEventListener('pointercancel',pu); c.removeEventListener('touchstart',ts); c.removeEventListener('touchmove',tm); c.removeEventListener('touchend',te); c.removeEventListener('touchcancel',te); c.removeEventListener('click',ck); c.removeEventListener('wheel',wheel); };
  }
  vibrate(ms){ if(this.save.settings.vibrate&&navigator.vibrate){ try{navigator.vibrate(ms);}catch(e){} } }
  toast(m,sub){ this._toast={m,sub,t:2.6}; }
  confirm(m,onYes){ this._confirm={m,onYes}; }
  go(s){ this._closeLogin&&this._closeLogin(false); this._relicSheet=null; this._talSheet=null; this._bag=null; this._heroSheet=null; this._endlessIntro=false; this._detailOpen=false; this._detailIntf=null; this._peek=null; this._peekFromChip=false; if(s==='heroes'){ this._heroView=Math.max(0,HEROES.findIndex(h=>h.id===this.save.hero)); } if(s==='hub') this._fromHome=false; this.screen=s; this._scroll=0; this.particles.length=0; this.floaters.length=0; this.audio.sfx('ui'); this.render(); }

  // ---- buttons ----
  btn(x,y,w,h,id,cb,opts){ this.buttons.push({x,y,w,h,id,cb,opts:opts||{}}); }
  hitButtons(x,y){ for(let i=this.buttons.length-1;i>=0;i--){ const b=this.buttons[i]; if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ this.audio.sfx('ui'); this._lastHit=b.id; this._lastHitT=(typeof performance!=='undefined'?performance.now():Date.now()); b.cb(); return true; } } this._lastHit='miss@'+Math.round(x)+','+Math.round(y); return false; }

  // ---- pointer dispatch ----
  onDown(x,y){ if(this.portrait) return; if(this._loginOpen) return; if(this._detailOpen){ const c=this._chipAt(x,y); this._peekFromChip=!!c; this._peek=c?c.peek:null; this.render(); return; } if(this._confirm||this._toast) {} if(this.screen==='battle'&&!this._paused&&this.run){ this.battleDown(x,y); } }
  onMove(x,y){ if(this._detailOpen){ if(this._peekFromChip){ const c=this._chipAt(x,y); const np=c?c.peek:null; if(np!==this._peek){ this._peek=np; this.render(); } } return; } if(this.screen==='battle'&&this.run) this.battleMove(x,y); }
  onUp(x,y){ if(this.portrait) return;
    if(this._detailOpen){ if(this._detailJustOpened){ this._detailJustOpened=false; return; } const fromChip=this._peekFromChip; this._peek=null; this._peekFromChip=false; this.render(); if(!fromChip) this._closeDetail(); return; }
    if(this._loginOpen){ for(let i=this.buttons.length-1;i>=0;i--){ const b=this.buttons[i]; if(b.opts._login&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ this.audio.sfx('ui'); b.cb(); return; } } return; }
    if(this._confirm){ for(let i=this.buttons.length-1;i>=0;i--){ const b=this.buttons[i]; if(b.opts._confirm&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ this.audio.sfx('ui'); b.cb(); return; } } return; }
    if(this.screen==='battle'&&!this._paused&&!this._detailOpen&&this.run){ if(this.run.modal){ this.hitButtons(x,y); return; } this.battleUp(x,y); return; }
    this.hitButtons(x,y); this.render();
  }

  // ---- update ----
  update(dt){ this.updateFx(dt); if(this._toast){ this._toast.t-=dt; if(this._toast.t<=0)this._toast=null; } this.bgScroll+=dt*12;
    // camera ease
    this.cam.y=lerp(this.cam.y,this.cam.ty,clamp(dt*6,0,1)); this.cam.zoom=lerp(this.cam.zoom,this.cam.tz,clamp(dt*6,0,1));
    if(this.screen==='battle'&&this.run&&!this._paused&&!this._detailOpen&&!this.portrait&&!this.run.modal) this.updateBattle(dt);
    if(!this.portrait){ if(this.screen==='battle'&&this.run){ this.audio.startTheme(ACTS[this.run.act-1].key, this.run.stage.boss); } else { this.audio.startTheme('hub',false); } }
  }

  render(){ const ctx=this.ctx,dpr=this.dpr; ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.fillStyle='#150f22'; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    if(this.portrait){ this._hideLoginInputs&&this._hideLoginInputs(); this.drawRotate(); return; }
    ctx.setTransform(this.scale*dpr,0,0,this.scale*dpr,this.ox*dpr,this.oy*dpr);
    this.buttons=[]; this._scrollable=false; this._layIds=[];
    switch(this.screen){
      case 'home': this.drawHome(); break;
      case 'hub': this.drawHub(); break;
      case 'heroes': this.drawHeroes(); break;
      case 'atlas': this.drawAtlas(); break;
      case 'route': this.drawRoute(); break;
      case 'relics': this.drawRelics(); break;
      case 'codex': this.drawCodex(); break;
      case 'settings': this.drawSettings(); break;
      case 'battle': this.drawBattle(); break;
      case 'reward': this.drawReward(); break;
      case 'shop': this.drawShop(); break;
      case 'talents': this.drawTalents(); break;
      case 'win': case 'lose': this.drawEnd(); break;
    }
    if(this.screen!=='battle') this.drawFx();
    if(this._toast) this.drawToast();
    if(this._endlessIntro&&this.screen==='hub') this._drawEndlessIntroPanel&&this._drawEndlessIntroPanel();
    if(this._confirm) this.drawConfirm();
    if(this._loginOpen) this.drawLoginModal(); else this._hideLoginInputs&&this._hideLoginInputs();
    if(this.save.layoutMode && this.screen==='route') this.drawLayoutBar();
    if(this._adminPadOpen) this.drawAdminPad();
    ctx.setTransform(1,0,0,1,0,0);
  }

  drawRotate(){ const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height; const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#140f1c'); g.addColorStop(1,'#06040a'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.translate(w/2,h/2); ctx.scale(this.dpr,this.dpr); const t=this.t; ctx.strokeStyle='#e08a32'; ctx.lineWidth=4; ctx.save(); ctx.rotate(Math.sin(t*1.4)*0.5); ctx.strokeRect(-46,-78,92,156); ctx.restore();
    ctx.fillStyle='#ece0c4'; ctx.textAlign='center'; ctx.font='600 26px Georgia,serif'; ctx.fillText('請旋轉手機',0,130); ctx.font='15px Georgia,serif'; ctx.globalAlpha=0.7; ctx.fillText('橫向以進入籃獄',0,162); ctx.font='12px Georgia,serif'; ctx.globalAlpha=0.5; ctx.fillText('若畫面轉不過去，請關閉手機螢幕方向鎖定',0,192); ctx.restore(); }

  // ---- FX ----
  _fxColor(color,fallback){ return (typeof color==='string'&&color.trim()) ? color : (fallback||'#e08a32'); }
  _ballColor(form){ const F=BALL_FORMS[form]||BALL_FORMS.normal; return this._fxColor(F&&F.color,'#e0631e'); }
  _isMobileFx(){ const s=(this.save&&this.save.settings)||{}, w=this.cw||0, h=this.ch||0; return !!(s.reduceMotion||s.lowPerf||(w&&h&&w<=980&&h<=540)||(this.dpr>=2.5&&w<=1280)); }
  _fxBudget(){ const s=(this.save&&this.save.settings)||{}, reduce=!!s.reduceMotion, low=!!s.lowPerf, mobile=this._isMobileFx(); if(reduce)return {mobile:true,mul:0.18,max:150,glow:false,flash:false,ring:0.52,trailMax:2,trailChance:0.03,ambient:0.08,blur:0,smoke:false}; if(low)return {mobile:true,mul:0.30,max:260,glow:false,flash:false,ring:0.62,trailMax:4,trailChance:0.08,ambient:0.12,blur:0,smoke:true}; if(mobile)return {mobile:true,mul:0.42,max:420,glow:false,flash:false,ring:0.72,trailMax:6,trailChance:0.13,ambient:0.18,blur:0,smoke:true}; return {mobile:false,mul:1,max:1250,glow:true,flash:true,ring:1,trailMax:12,trailChance:0.34,ambient:0.4,blur:1,smoke:true}; }
  _pruneFx(max){ const ps=this.particles; if(!ps)return false; if(ps.length>max)ps.splice(0,ps.length-max); return ps.length<max; }
  burst(x,y,n,color,spd,life,o){ o=o||{}; color=this._fxColor(color); const b=this._fxBudget();
    n=Math.ceil(n*(o.mul==null?1.65:o.mul)*b.mul); if(n<1||!this._pruneFx(b.max)) return; n=Math.min(n,b.max-this.particles.length,b.mobile?28:90);
    const spread=o.spread==null?TAU:o.spread, base=o.dir==null?0:o.dir, kind=o.kind||null;
    for(let i=0;i<n;i++){ const a=(o.dir==null?Math.random()*TAU:base+rand(-spread/2,spread/2)), s=spd*(0.35+Math.random()*1.15);
      const k=kind||(o.smoke?'smoke':(o.shard?'shard':(o.glow&&(i%3!==0)?'streak':(i%5===0?'shard':'dot'))));
      if(k==='smoke'&&!b.smoke)continue;
      const lf=life*(b.mobile?0.78:1)*(0.62+Math.random()*0.65), rr=(o.r||5)*(b.mobile?0.82:1)*(0.65+Math.random()*1.15);
      this.particles.push({kind:k,x,y,px:x,py:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:lf,max:lf,r:rr,color,g:o.g||0,drag:o.drag||(k==='smoke'?0.985:0.965),glow:!!(o.glow&&b.glow),rot:Math.random()*TAU,spin:rand(-9,9),len:(o.len||34)*(b.mobile?0.72:1)*(0.55+Math.random()*1.15),alpha:o.alpha||1}); } }
  spawn(x,y,vx,vy,life,r,color,o){ o=o||{}; color=this._fxColor(color); const b=this._fxBudget(); if(!this._pruneFx(b.max))return; if(b.mobile&&!o.critical&&Math.random()>0.55)return; const lf=life*(b.mobile?0.82:1); this.particles.push({kind:o.kind||'dot',x,y,px:x,py:y,vx,vy,life:lf,max:lf,r:r*(b.mobile?0.82:1),color,g:o.g||0,drag:o.drag||0.98,glow:!!(o.glow&&b.glow),rot:o.rot||0,spin:o.spin||0,len:(o.len||24)*(b.mobile?0.7:1),alpha:o.alpha||1}); }
  ringFx(x,y,color,life,o){ o=o||{}; color=this._fxColor(color); const b=this._fxBudget(); if(!this._pruneFx(b.max))return; const lf=(life||0.5)*(b.mobile?0.82:1); this.particles.push({ring:true,x,y,color,life:lf,max:lf,r0:(o.r0||10)*b.ring,r1:(o.r1||340)*b.ring,width:(o.width||22)*(b.mobile?0.72:1),glow:!!(o.glow!==false&&b.glow)}); }
  flashFx(x,y,color,r,life){ color=this._fxColor(color,'#fff3df'); const b=this._fxBudget(); if(!b.flash)return; const lf=life||0.18; if(!this._pruneFx(b.max))return; this.particles.push({flash:true,x,y,color,life:lf,max:lf,r:r||220}); }
  shockFx(x,y,color,r,life){ const b=this._fxBudget(); this.ringFx(x,y,color,life||0.45,{r0:18,r1:r||460,width:b.mobile?18:28}); if(!b.mobile)this.ringFx(x,y,'#fff3df',(life||0.45)*0.72,{r0:6,r1:(r||460)*0.58,width:10}); }
  basketImpactFx(H,type,color){ const sw=type==='swish', bank=type==='bank', lucky=type==='lucky'; const c=this._fxColor(sw?'#fff0c0':bank?'#e08a32':(lucky?'#c89bff':color));
    this.flashFx(H.x,H.y,c,sw?360:bank?300:250,sw?0.22:0.18);
    this.shockFx(H.x,H.y,c,sw?560:bank?440:360,sw?0.58:0.46);
    this.burst(H.x,H.y+16,sw?34:24,c,sw?520:390,sw?0.72:0.56,{kind:'streak',dir:-Math.PI/2,spread:sw?1.05:1.35,glow:true,r:5,g:420,len:58});
    this.burst(H.x,H.y+22,bank?18:12,bank?'#ffb070':'#fff3df',300,0.48,{kind:'shard',glow:sw,r:4,g:360});
    if(!sw) this.burst(H.x,H.y+42,8,'#6a5238',120,0.65,{kind:'smoke',r:9,g:-20,alpha:0.75}); }
  elementImpactFx(kind,x,y,color,scale){ scale=scale||1; if(kind==='fire'){ this.flashFx(x,y,'#ff7a3c',260*scale,0.22); this.shockFx(x,y,'#ff7a3c',360*scale,0.42); this.burst(x,y,28*scale,'#ff7a3c',440,0.62,{kind:'streak',glow:true,r:5,g:-70,len:62}); this.burst(x,y,12*scale,'#2b140c',150,0.9,{kind:'smoke',r:14,g:-30,alpha:0.8}); }
    else if(kind==='ice'){ this.flashFx(x,y,'#bdf6ff',220*scale,0.18); this.ringFx(x,y,'#6fd8ff',0.42,{r0:8,r1:250*scale,width:16}); this.burst(x,y,22*scale,'#8fe8ff',360,0.72,{kind:'shard',glow:true,r:5,g:90}); }
    else if(kind==='lightning'){ this.flashFx(x,y,'#fff48a',210*scale,0.16); this.burst(x,y,18*scale,'#ffe14d',520,0.38,{kind:'streak',glow:true,r:4,g:80,len:78}); this.ringFx(x,y,'#ffe14d',0.26,{r0:4,r1:190*scale,width:9}); } }
  floater(x,y,text,color,size,o){ o=o||{}; this.floaters.push({x,y,text,color,size:size||30,t:o.t||0.9,t0:o.t||0.9,vy:o.vy||-50,crit:o.crit}); }
  updateFx(dt){ const ps=this.particles; for(let i=ps.length-1;i>=0;i--){ const p=ps[i]; p.life-=dt; if(p.life<=0){ps.splice(i,1);continue;} if(p.ring||p.flash)continue; p.px=p.x; p.py=p.y; p.vy+=p.g*dt; p.vx*=p.drag; p.vy*=p.drag; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=(p.spin||0)*dt; }
    const fs=this.floaters; for(let i=fs.length-1;i>=0;i--){ const f=fs[i]; f.t-=dt; if(f.t<=0){fs.splice(i,1);continue;} f.y+=f.vy*dt; f.vy*=0.92; } }
  drawFx(){ const ctx=this.ctx, b=this._fxBudget(); for(const p of this.particles){ const a=clamp(p.life/p.max,0,1), col=this._fxColor(p.color); ctx.globalAlpha=a;
      if(p.flash){ if(!b.flash)continue; const rr=p.r*(1-a*0.25); ctx.save(); ctx.globalCompositeOperation='lighter'; const g=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,rr); g.addColorStop(0,col); g.addColorStop(0.35,this._fade?this._fade(col,0.35):col); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.globalAlpha=a*0.55; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,TAU); ctx.fill(); ctx.restore(); continue; }
      if(p.ring){ const q=1-a, rr=lerp(p.r0,p.r1,q); ctx.save(); if(p.glow&&b.glow){ctx.shadowBlur=24;ctx.shadowColor=col;} ctx.strokeStyle=col; ctx.lineWidth=lerp(p.width||22,2,q); ctx.globalAlpha=a*(b.mobile?0.72:0.9); ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,TAU); ctx.stroke(); ctx.restore(); continue; }
      if(p.kind==='smoke'){ ctx.save(); ctx.globalAlpha=a*(b.mobile?0.13:0.22)*(p.alpha||1); const rr=p.r*(1.4+(1-a)*(b.mobile?2.2:3.2)); if(b.mobile){ ctx.fillStyle=this._fade?this._fade(col,0.18):col; ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,TAU); ctx.fill(); } else { const g=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,rr); g.addColorStop(0,this._fade?this._fade(col,0.26):col); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,TAU); ctx.fill(); } ctx.restore(); continue; }
      if(p.kind==='streak'){ ctx.save(); ctx.globalAlpha=a*(p.alpha||1)*(b.mobile?0.82:1); ctx.lineCap='round'; ctx.strokeStyle=col; ctx.lineWidth=Math.max(2,p.r*0.9*a); if(p.glow&&b.glow){ctx.shadowBlur=18;ctx.shadowColor=col;} ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-(p.vx||0)*(b.mobile?0.026:0.035),p.y-(p.vy||0)*(b.mobile?0.026:0.035)); ctx.stroke(); ctx.restore(); continue; }
      if(p.kind==='shard'){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot||0); ctx.globalAlpha=a*(p.alpha||1); if(p.glow&&b.glow){ctx.shadowBlur=14;ctx.shadowColor=col;} ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(0,-p.r*1.7); ctx.lineTo(p.r*0.75,0); ctx.lineTo(0,p.r*1.7); ctx.lineTo(-p.r*0.75,0); ctx.closePath(); ctx.fill(); ctx.restore(); continue; }
      if(p.glow&&b.glow){ctx.shadowBlur=18;ctx.shadowColor=col;} else ctx.shadowBlur=0; ctx.fillStyle=col; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(0.35+a*0.8),0,TAU); ctx.fill(); if(p.glow)ctx.shadowBlur=0; }
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.shadowBlur=0; ctx.textAlign='center'; for(const f of this.floaters){ const a=clamp(f.t/f.t0,0,1); ctx.globalAlpha=a; ctx.fillStyle=this._fxColor(f.color,'#ece0c4'); ctx.font=`${f.crit?'800':'700'} ${f.size}px Georgia,serif`; ctx.shadowBlur=b.mobile?2:6; ctx.shadowColor='#000'; ctx.fillText(f.text,f.x,f.y); ctx.shadowBlur=0; } ctx.globalAlpha=1; ctx.textAlign='left'; }

  // ---- draw helpers ----
  rr(x,y,w,h,r){ const ctx=this.ctx; r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  panel(x,y,w,h,o){ o=o||{}; const ctx=this.ctx; this.rr(x,y,w,h,o.r||16); const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,o.c0||'rgba(33,24,16,0.92)'); g.addColorStop(1,o.c1||'rgba(20,14,9,0.95)'); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=o.lw||2; ctx.strokeStyle=o.stroke||'rgba(200,155,60,0.32)'; ctx.stroke(); }
  text(s,x,y,size,color,o){ o=o||{}; const ctx=this.ctx; ctx.font=`${o.weight||'600'} ${size}px ${o.font||'Georgia,serif'}`; ctx.textAlign=o.align||'left'; ctx.textBaseline=o.baseline||'alphabetic'; if(o.glow){ctx.shadowBlur=o.glow;ctx.shadowColor=color;} ctx.fillStyle=color; ctx.fillText(s,x,y); ctx.shadowBlur=0; ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
  button(x,y,w,h,label,id,cb,o){ o=o||{}; const ctx=this.ctx; this.rr(x,y,w,h,o.r||12);
    if(o.primary){ const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,'#caa23a'); g.addColorStop(1,'#8a6a1e'); ctx.fillStyle=g; } else if(o.danger){ ctx.fillStyle='rgba(120,30,30,0.92)'; } else if(o.sel){ ctx.fillStyle='rgba(90,66,28,0.95)'; } else ctx.fillStyle='rgba(40,30,18,0.92)';
    ctx.fill(); ctx.lineWidth=o.sel?3:2; ctx.strokeStyle=o.primary?'#e6c068':(o.danger?'#e6433c':(o.sel?'#e6c068':'rgba(200,155,60,0.4)')); ctx.stroke();
    this.text(label,x+w/2,y+h/2,o.size||26,o.primary?'#1a120a':(o.color||'#ece0c4'),{align:'center',baseline:'middle',weight:o.weight||'700'}); this.btn(x,y,w,h,id,cb,o); }
  wrap(str,cx,y,maxW,lh,color,size,align){ const ctx=this.ctx; ctx.font=`400 ${size||22}px Georgia,serif`; ctx.textAlign=align||'center'; ctx.fillStyle=color; let line='',yy=y; for(const ch of str){ const tt=line+ch; if(ctx.measureText(tt).width>maxW){ ctx.fillText(line,cx,yy); line=ch; yy+=lh; } else line=tt; } if(line)ctx.fillText(line,cx,yy); ctx.textAlign='left'; return yy; }
  drawToast(){ const ctx=this.ctx,t=this._toast; ctx.globalAlpha=clamp(t.t,0,1); const w=Math.min(1000,80+t.m.length*26),x=BW/2-w/2,y=120,h=t.sub?96:70; this.panel(x,y,w,h,{r:14}); this.text(t.m,BW/2,y+(t.sub?40:42),30,'#e6c068',{align:'center',weight:'800'}); if(t.sub)this.text(t.sub,BW/2,y+74,20,'#a2926e',{align:'center'}); ctx.globalAlpha=1; }
  drawConfirm(){ const ctx=this.ctx; ctx.fillStyle='rgba(2,1,4,0.72)'; ctx.fillRect(0,0,BW,BH); const w=820,h=300,x=BW/2-w/2,y=BH/2-h/2; this.panel(x,y,w,h,{r:20}); this.wrap(this._confirm.m,BW/2,y+96,w-120,40,'#ece0c4',30); const bw=260,bh=74,by=y+h-110;
    this.rr(BW/2-bw-20,by,bw,bh,12); ctx.fillStyle='rgba(120,30,30,0.92)'; ctx.fill(); ctx.strokeStyle='#e6433c'; ctx.lineWidth=2; ctx.stroke(); this.text('確定',BW/2-bw-20+bw/2,by+bh/2,28,'#fff',{align:'center',baseline:'middle'}); this.buttons.push({x:BW/2-bw-20,y:by,w:bw,h:bh,id:'cy',opts:{_confirm:true},cb:()=>{const f=this._confirm.onYes;this._confirm=null;f&&f();}});
    this.rr(BW/2+20,by,bw,bh,12); ctx.fillStyle='rgba(40,30,18,0.92)'; ctx.fill(); ctx.strokeStyle='rgba(200,155,60,0.4)'; ctx.stroke(); this.text('取消',BW/2+20+bw/2,by+bh/2,28,'#ece0c4',{align:'center',baseline:'middle'}); this.buttons.push({x:BW/2+20,y:by,w:bw,h:bh,id:'cn',opts:{_confirm:true},cb:()=>{this._confirm=null;}}); }
  openLogin(){ const L=this.save.login||{}; this._loginDraft={name:L.name||'',code:L.code||L.pass||'',busy:false,msg:''}; this._loginOpen=true; this.render(); setTimeout(()=>{try{ const e=this._loginEls; (e&&(e.name.value?e.code:e.name)).focus(); }catch(_e){}},60); }
  _supabaseCfg(){ const w=(typeof window!=='undefined'&&window.HB_SUPABASE)||{}; const url=String(w.url||SUPABASE_SYNC.url||'').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,''); return {url,key:w.key||w.anonKey||SUPABASE_SYNC.key,table:w.table||SUPABASE_SYNC.table||'player_accounts'}; }
  _syncLoginFields(){ const e=this._loginEls; if(!e)return; const d=this._loginDraft||{}; d.name=e.name.value||''; d.code=e.code.value||''; }
  _destroyLoginInputs(){ const e=this._loginEls; if(e){ try{e.name.remove(); e.code.remove();}catch(_e){} } this._loginEls=null; }
  _hideLoginInputs(){ const e=this._loginEls; if(e){ e.name.style.display='none'; e.code.style.display='none'; } }
  _closeLogin(redraw){ this._loginOpen=false; this._destroyLoginInputs(); if(redraw)this.render(); }
  _placeInput(el,x,y,w,h,fs){ const sc=this.scale||1,dpr=this.dpr||1; el.style.left=(this.ox+x*sc)+'px'; el.style.top=(this.oy+y*sc)+'px'; el.style.width=(w*sc)+'px'; el.style.height=(h*sc)+'px'; el.style.fontSize=(fs*sc)+'px'; el.style.display='block'; }
  _ensureLoginInputs(nameR,codeR,fs){ if(!this._loginEls){ const mk=(type,ph)=>{ const el=document.createElement('input'); el.type=type; el.placeholder=ph; el.autocomplete='on'; el.style.cssText='position:fixed;z-index:99998;box-sizing:border-box;border:0;outline:0;border-radius:12px;background:linear-gradient(180deg,rgba(13,10,18,.98),rgba(4,3,8,.99));color:#f5f0dc;padding:0 24px;font-family:\"Microsoft JhengHei\",\"PingFang TC\",serif;font-weight:900;letter-spacing:0;caret-color:#bfff2f;text-shadow:0 1px 2px #000;box-shadow:inset 0 0 0 3px rgba(118,65,154,.9),inset 0 0 0 6px rgba(19,12,28,.9),inset 0 0 24px rgba(180,255,47,.08),0 8px 22px rgba(0,0,0,.62);'; el.addEventListener('pointerdown',e=>e.stopPropagation()); el.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true}); el.addEventListener('click',e=>e.stopPropagation()); el.addEventListener('focus',()=>{el.style.boxShadow='inset 0 0 0 3px rgba(186,255,47,.95),inset 0 0 0 6px rgba(44,21,70,.9),inset 0 0 30px rgba(180,255,47,.18),0 0 22px rgba(186,255,47,.26),0 8px 22px rgba(0,0,0,.62)';}); el.addEventListener('blur',()=>{el.style.boxShadow='inset 0 0 0 3px rgba(118,65,154,.9),inset 0 0 0 6px rgba(19,12,28,.9),inset 0 0 24px rgba(180,255,47,.08),0 8px 22px rgba(0,0,0,.62)';}); el.addEventListener('input',()=>this._syncLoginFields()); el.addEventListener('keydown',e=>{ if(e.key==='Enter')this._submitLogin(); if(e.key==='Escape')this._closeLogin(true); }); document.body.appendChild(el); return el; };
      const d=this._loginDraft||{}; this._loginEls={name:mk('text','輸入你的名字'),code:mk('text','背號或代號')}; this._loginEls.name.value=d.name||''; this._loginEls.code.value=d.code||''; this._loginEls.code.inputMode='numeric'; this._loginEls.name.name='hb-player-name'; this._loginEls.code.name='hb-player-code'; }
    this._placeInput(this._loginEls.name,nameR.x,nameR.y,nameR.w,nameR.h,fs); this._placeInput(this._loginEls.code,codeR.x,codeR.y,codeR.w,codeR.h,fs);
  }
  async _submitLogin(){ if(this._loginDraft&&this._loginDraft.busy)return; this._syncLoginFields(); const d=this._loginDraft||{}, name=(d.name||'').trim(), code=(d.code||'').trim(); if(!name){ this.toast('請輸入名字','帳號請填你的名字'); return; } if(!code){ this.toast('請輸入代號','代號可用背號，避免使用個人密碼'); return; }
    d.busy=true; d.msg='正在同步...'; this.render();
    this.save.login={name,code,remember:true,lastLoginAt:new Date().toISOString()}; persist(this.save);
    let synced=false, skipped=false;
    try{ const cfg=this._supabaseCfg(); if(!cfg.url||!cfg.key){ skipped=true; } else { const base=cfg.url.replace(/\/+$/,'')+'/rest/v1/'+encodeURIComponent(cfg.table); const payload={player_name:name,jersey_code:code,remember:true,last_login_at:new Date().toISOString(),user_agent:(navigator&&navigator.userAgent)||''};
        const send=body=>fetch(base+'?on_conflict=player_name',{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
        let res=await send(payload);
        if(!res.ok){ const detail=await res.text(); if(/jersey_code/i.test(detail)){ const legacy={...payload,jersey_password:code}; delete legacy.jersey_code; res=await send(legacy); if(!res.ok) throw new Error(await res.text()); } else throw new Error(detail); }
        synced=true; } }
    catch(e){ try{console.warn('[HB Supabase]',e);}catch(_e){} }
    d.busy=false; this._closeLogin(false); this.toast(synced?'已登入並同步':'已登入', skipped?'尚未設定 Supabase，已先本機記住':(synced?'Supabase 已更新':'Supabase 同步失敗，本機已記住')); this.go('hub');
  }
  drawLoginModal(){ const ctx=this.ctx; const w=1470,h=690,x=BW/2-w/2,y=BH/2-h/2+8, d=this._loginDraft||{}, pulse=0.5+0.5*Math.sin(this.t*3);
    ctx.save(); ctx.fillStyle='rgba(3,1,8,0.72)'; ctx.fillRect(0,0,BW,BH);
    const halo=ctx.createRadialGradient(BW/2,y+h*0.5,20,BW/2,y+h*0.5,760); halo.addColorStop(0,'rgba(116,52,154,0.25)'); halo.addColorStop(0.42,'rgba(28,12,44,0.25)'); halo.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=halo; ctx.fillRect(0,0,BW,BH); ctx.restore();
    this.btn(-3000,-3000,BW+6000,BH+6000,'login_scrim',()=>{}, {_login:true});

    const stone=(rx,ry,rw,rh)=>{ ctx.beginPath(); ctx.moveTo(rx+72,ry+24); ctx.quadraticCurveTo(rx+230,ry-18,rx+410,ry+18); ctx.lineTo(rx+rw-410,ry+18); ctx.quadraticCurveTo(rx+rw-230,ry-18,rx+rw-72,ry+24); ctx.lineTo(rx+rw-28,ry+88); ctx.lineTo(rx+rw-44,ry+rh-112); ctx.quadraticCurveTo(rx+rw-70,ry+rh-20,rx+rw-160,ry+rh-28); ctx.lineTo(rx+160,ry+rh-28); ctx.quadraticCurveTo(rx+70,ry+rh-20,rx+44,ry+rh-112); ctx.lineTo(rx+28,ry+88); ctx.closePath(); };
    const bevel=(rx,ry,rw,rh,cut)=>{ ctx.beginPath(); ctx.moveTo(rx+cut,ry); ctx.lineTo(rx+rw-cut,ry); ctx.lineTo(rx+rw,ry+cut); ctx.lineTo(rx+rw,ry+rh-cut); ctx.lineTo(rx+rw-cut,ry+rh); ctx.lineTo(rx+cut,ry+rh); ctx.lineTo(rx,ry+rh-cut); ctx.lineTo(rx,ry+cut); ctx.closePath(); };
    const slime=(sx,sy,sc=1)=>{ ctx.save(); ctx.fillStyle='#b8ef2f'; ctx.shadowBlur=10; ctx.shadowColor='rgba(184,239,47,.55)'; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(sx+10*sc,sy+22*sc,sx+1*sc,sy+42*sc); ctx.quadraticCurveTo(sx-9*sc,sy+22*sc,sx,sy); ctx.fill(); ctx.restore(); };
    const skull=(cx,cy,r)=>{ if(this._hgSkull) this._hgSkull(cx,cy,r); else { ctx.fillStyle='#d8d0c0'; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.fill(); } };

    ctx.save(); ctx.shadowBlur=34; ctx.shadowColor='rgba(0,0,0,.95)';
    stone(x,y,w,h); const bg=ctx.createLinearGradient(0,y,0,y+h); bg.addColorStop(0,'#171622'); bg.addColorStop(0.5,'#0b0b13'); bg.addColorStop(1,'#090713'); ctx.fillStyle=bg; ctx.fill(); ctx.shadowBlur=0;
    const rg=ctx.createRadialGradient(BW/2,y+170,40,BW/2,y+260,w*0.58); rg.addColorStop(0,'rgba(76,36,112,.22)'); rg.addColorStop(0.58,'rgba(0,0,0,0)'); rg.addColorStop(1,'rgba(92,38,126,.18)'); ctx.fillStyle=rg; ctx.fill();
    ctx.lineWidth=18; ctx.strokeStyle='#171123'; stone(x+8,y+8,w-16,h-16); ctx.stroke();
    ctx.lineWidth=8; ctx.strokeStyle='#5c367a'; stone(x+22,y+22,w-44,h-44); ctx.stroke();
    ctx.lineWidth=3; ctx.strokeStyle='rgba(183,239,47,.52)'; stone(x+34,y+34,w-68,h-68); ctx.stroke(); ctx.restore();

    for(const p of [[x+210,y+72],[x+w-170,y+88],[x+520,y+90],[x+w-520,y+90],[x+980,y+328],[x+1070,y+456],[x+430,y+h-80]]) slime(p[0],p[1],p[2]?0.7:1);
    ctx.save(); ctx.strokeStyle='rgba(93,53,129,.9)'; ctx.lineWidth=16; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x+70,y+h-90); ctx.quadraticCurveTo(x+220,y+h-20,x+410,y+h-68); ctx.moveTo(x+w-70,y+h-90); ctx.quadraticCurveTo(x+w-220,y+h-20,x+w-410,y+h-68); ctx.stroke(); ctx.restore();

    ctx.save(); ctx.beginPath(); ctx.rect(x+40,y+50,230,180); ctx.clip(); this.drawHero('shade',x+148,y+218,0.55); ctx.restore();
    skull(BW/2,y+46,36); skull(x+w-118,y+140,44); skull(x+112,y+h-118,50); this._statIcon&&this._statIcon('ball',x+w-135,y+h-104,42);

    ctx.save(); ctx.font='900 96px \"Microsoft JhengHei\",\"PingFang TC\",serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
    ctx.lineWidth=16; ctx.strokeStyle='#090711'; ctx.strokeText('登入帳號',BW/2,y+150);
    ctx.shadowBlur=18; ctx.shadowColor='rgba(184,239,47,.72)'; ctx.fillStyle='#c7ee46'; ctx.fillText('登入帳號',BW/2,y+150); ctx.shadowBlur=0; ctx.restore();
    this.text('帳號請填名字，代號可填號碼，登入後會自動記住。',BW/2,y+245,30,'#c9bdad',{align:'center',baseline:'middle',weight:'800'});
    ctx.save(); ctx.fillStyle='#b8ef2f'; ctx.beginPath(); ctx.arc(BW/2-446,y+245,8,0,TAU); ctx.arc(BW/2+446,y+245,8,0,TAU); ctx.fill(); ctx.restore();

    const fw=900,fh=82,fx=BW/2-fw/2,nr={x:fx,y:y+315,w:fw,h:fh},pr={x:fx,y:y+455,w:fw,h:fh};
    const drawField=(r,label,sub)=>{ ctx.save(); this.text(label,r.x+8,r.y-24,34,'#c7ee46',{weight:'900'});
      bevel(r.x-14,r.y-12,r.w+28,r.h+24,28); const og=ctx.createLinearGradient(0,r.y-12,0,r.y+r.h+12); og.addColorStop(0,'rgba(119,72,159,.95)'); og.addColorStop(0.55,'rgba(35,19,52,.98)'); og.addColorStop(1,'rgba(13,9,22,.99)'); ctx.fillStyle=og; ctx.fill(); ctx.lineWidth=3.5; ctx.strokeStyle='#8e55b8'; ctx.stroke();
      bevel(r.x,r.y,r.w,r.h,22); ctx.fillStyle='rgba(5,4,10,.96)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(188,239,47,.34)'; ctx.stroke();
      skull(r.x-18,r.y+r.h/2,17); this.text(sub,r.x+r.w+44,r.y+r.h/2,27,'#c9bdad',{baseline:'middle',weight:'800'}); ctx.restore(); };
    drawField(nr,'帳號 / 名字','例：阿薩'); drawField(pr,'代號 / 背號','例：23');
    this._ensureLoginInputs({x:nr.x+24,y:nr.y+8,w:nr.w-48,h:nr.h-16},{x:pr.x+24,y:pr.y+8,w:pr.w-48,h:pr.h-16},33);

    const by=y+550,bw=370,bh=82,cx=BW/2;
    const drawBtn=(rx,ry,rw,rh,label,ok)=>{ ctx.save(); bevel(rx,ry,rw,rh,32); const g=ctx.createLinearGradient(0,ry,0,ry+rh);
      if(ok){ g.addColorStop(0,d.busy?'#c9d676':'#d8ff44'); g.addColorStop(0.52,d.busy?'#879642':'#a9df24'); g.addColorStop(1,d.busy?'#47511a':'#5b850e'); ctx.shadowBlur=22+10*pulse; ctx.shadowColor='rgba(184,239,47,.76)'; }
      else { g.addColorStop(0,'rgba(105,64,140,.98)'); g.addColorStop(0.55,'rgba(50,24,78,.99)'); g.addColorStop(1,'rgba(25,13,40,.99)'); ctx.shadowBlur=12; ctx.shadowColor='rgba(141,83,184,.45)'; }
      ctx.fillStyle=g; ctx.fill(); ctx.shadowBlur=0; ctx.lineWidth=4; ctx.strokeStyle=ok?'#d9ff5a':'#8e55b8'; ctx.stroke(); ctx.lineWidth=1.3; ctx.strokeStyle='rgba(255,255,255,.32)'; bevel(rx+14,ry+10,rw-28,rh-20,24); ctx.stroke();
      this.text(label,rx+rw/2,ry+rh/2+2,48,ok?'#111606':'#f0dff8',{align:'center',baseline:'middle',weight:'900'}); ctx.restore(); };
    drawBtn(cx-bw-44,by,bw,bh,'取消',false); this.buttons.push({x:cx-bw-44,y:by,w:bw,h:bh,id:'login_cancel',opts:{_login:true},cb:()=>this._closeLogin(true)});
    drawBtn(cx+44,by,bw,bh,d.busy?'同步中':'登入',true); this.buttons.push({x:cx+44,y:by,w:bw,h:bh,id:'login_ok',opts:{_login:true},cb:()=>this._submitLogin()});
    this.text('代號不是正式密碼，只作遊戲識別；資料會暫存在本機並同步。',BW/2,y+h-24,22,'#c9bdad',{align:'center',weight:'800'});
  }
}
(function(){
  const LOGIN_PANEL_SRC='/assets/ui/login_panel_user_trans.png';
  const LOGIN_PANEL_CROP={x:52,y:18,w:1339,h:1057};
  Game.prototype._ensureLoginPanel=function(){
    if(this._loginPanelImg===undefined){
      try{
        const im=new Image();
        im.onload=()=>{ try{ if(this._loginOpen&&this.render)this.render(); }catch(e){} };
        im.onerror=()=>{ this._loginPanelErr=true; };
        im.src=LOGIN_PANEL_SRC;
        this._loginPanelImg=im;
      }catch(e){ this._loginPanelErr=true; this._loginPanelImg=null; }
    }
    return this._loginPanelImg;
  };
  Game.prototype._ensureLoginInputs=function(nameR,codeR,fs){
    if(!this._loginEls){
      const mk=(type,ph)=>{
        const el=document.createElement('input');
        el.type=type; el.placeholder=ph; el.autocomplete='on';
        el.style.cssText='position:fixed;z-index:99998;box-sizing:border-box;border:0;outline:0;border-radius:0;background:transparent;color:#f4ecd8;padding:0 12px;font-family:"Microsoft JhengHei","PingFang TC",serif;font-weight:900;letter-spacing:0;caret-color:#bfff2f;text-shadow:0 2px 3px #000;box-shadow:none;';
        el.addEventListener('pointerdown',e=>e.stopPropagation());
        el.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
        el.addEventListener('click',e=>e.stopPropagation());
        el.addEventListener('input',()=>this._syncLoginFields());
        el.addEventListener('keydown',e=>{ if(e.key==='Enter')this._submitLogin(); if(e.key==='Escape')this._closeLogin(true); });
        document.body.appendChild(el);
        return el;
      };
      const d=this._loginDraft||{};
      this._loginEls={name:mk('text','輸入你的名字'),code:mk('text','背號或代號')};
      this._loginEls.name.value=d.name||''; this._loginEls.code.value=d.code||'';
      this._loginEls.code.inputMode='numeric'; this._loginEls.name.name='hb-player-name'; this._loginEls.code.name='hb-player-code';
    }
    this._placeInput(this._loginEls.name,nameR.x,nameR.y,nameR.w,nameR.h,fs);
    this._placeInput(this._loginEls.code,codeR.x,codeR.y,codeR.w,codeR.h,fs);
  };
  Game.prototype.drawLoginModal=function(){
    const ctx=this.ctx, img=this._ensureLoginPanel();
    ctx.save();
    ctx.fillStyle='rgba(3,1,8,0.72)';
    ctx.fillRect(0,0,BW,BH);
    ctx.restore();
    this.btn(-3000,-3000,BW+6000,BH+6000,'login_scrim',()=>{}, {_login:true});

    const src=LOGIN_PANEL_CROP;
    const sc=Math.min((BW*0.94)/src.w,(BH*0.96)/src.h);
    const dw=src.w*sc, dh=src.h*sc, dx=BW/2-dw/2, dy=BH/2-dh/2+2;
    if(img&&img.complete&&img.naturalWidth&&!this._loginPanelErr){
      ctx.save();
      const floor=ctx.createRadialGradient(BW/2,dy+dh*0.88,20,BW/2,dy+dh*0.9,dw*0.48);
      floor.addColorStop(0,'rgba(0,0,0,0.62)');
      floor.addColorStop(0.52,'rgba(42,18,66,0.28)');
      floor.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=floor; ctx.beginPath(); ctx.ellipse(BW/2,dy+dh*0.9,dw*0.45,dh*0.12,0,0,TAU); ctx.fill();
      ctx.restore();
      const glow=(blur,color,alpha,offY)=>{ ctx.save(); ctx.globalAlpha=alpha; ctx.shadowBlur=blur; ctx.shadowColor=color; ctx.drawImage(img,src.x,src.y,src.w,src.h,dx,dy+(offY||0),dw,dh); ctx.restore(); };
      glow(62,'rgba(116,52,154,0.82)',0.78,0);
      glow(30,'rgba(184,239,47,0.44)',0.62,0);
      glow(18,'rgba(80,30,120,0.5)',0.45,6);
      ctx.drawImage(img,src.x,src.y,src.w,src.h,dx,dy,dw,dh);
    } else {
      this.panel(dx,dy,dw,dh,{r:20,c0:'rgba(18,12,25,.98)',c1:'rgba(6,4,10,.99)',lw:3,stroke:'rgba(184,239,47,.55)'});
      this.text('登入帳號',BW/2,dy+dh*0.25,54,'#c7ee46',{align:'center',weight:'900',glow:14});
    }
    const map=(x,y,w,h)=>({x:dx+x*sc,y:dy+y*sc,w:w*sc,h:h*sc});
    const nameR=map(285,450,720,70);
    const codeR=map(285,628,720,70);
    this._ensureLoginInputs(nameR,codeR,30);

    const cancelR=map(220,770,395,120), okR=map(700,770,410,120);
    this.buttons.push({x:cancelR.x,y:cancelR.y,w:cancelR.w,h:cancelR.h,id:'login_cancel',opts:{_login:true},cb:()=>this._closeLogin(true)});
    this.buttons.push({x:okR.x,y:okR.y,w:okR.w,h:okR.h,id:'login_ok',opts:{_login:true},cb:()=>this._submitLogin()});
  };
})();

// === final activation v25: bold monster status text pops ===
(function(){
  if(typeof Game==='undefined') return;

  const STATUS_META={
    fire:{text:'燃燒',color:'#ff6a2f',key:'burn'},
    burn:{text:'燃燒',color:'#ff6a2f',key:'burn'},
    ice:{text:'冰凍',color:'#6fd8ff',key:'freeze'},
    freeze:{text:'冰凍',color:'#6fd8ff',key:'freeze'},
    frozen:{text:'冰凍',color:'#6fd8ff',key:'freeze'},
    lightning:{text:'閃電',color:'#ffe14d',key:'lightning'},
    shock:{text:'電擊',color:'#ffe14d',key:'shock'},
    poison:{text:'中毒',color:'#8cff37',key:'poison'},
    venom:{text:'中毒',color:'#8cff37',key:'poison'},
    bleed:{text:'流血',color:'#ff4d59',key:'bleed'},
    shield:{text:'護盾',color:'#f0d49a',key:'shield'},
    breakShield:{text:'破盾',color:'#f0d49a',key:'breakShield'},
    block:{text:'格擋',color:'#d8cfb8',key:'block'},
    mirror:{text:'鏡框反彈',color:'#8fe8ff',key:'mirror'},
    coldrim:{text:'寒框鎖定',color:'#6fd8ff',key:'coldrim'},
    lockrim:{text:'鎖框',color:'#d8ff44',key:'lockrim'},
    greed:{text:'貪分',color:'#c89bff',key:'greed'},
    debt:{text:'碎板債',color:'#ffb34d',key:'debt'},
    crown:{text:'深淵冠冕',color:'#ffe14d',key:'crown'},
    countdown:{text:'倒數懲罰',color:'#ff6a4a',key:'countdown'}
  };

  const nowOf=()=> (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  const hasStatus=(g,names)=>{
    if(!g) return false;
    for(const n of names) if((Number(g[n])||0)>0 || g[n]===true) return true;
    return false;
  };
  const snapStatus=g=>({
    hp:g?Number(g.hp)||0:0,
    shield:!!(g&&g.shieldUp),
    mirror:Number(g&&g.endlessMirror)||0,
    burn:Number(g&&g.burn)||0,
    frozen:!!(g&&g.frozen),
    freeze:Number(g&&g.freeze)||0,
    poison:hasStatus(g,['poison','venom','toxic','poisoned']),
    bleed:hasStatus(g,['bleed','bleeding'])
  });

  Game.prototype._hbMonsterStatusText=function(g,type,opts){
    if(!g||g.dead&&!(opts&&opts.allowDead)) return;
    const m=STATUS_META[type]||{text:String(type||''),color:'#ffe7a6',key:String(type||'status')};
    if(!m.text) return;
    const t=nowOf();
    g._hbStatusStamp=g._hbStatusStamp||{};
    const key=m.key||type;
    const cooldown=(opts&&opts.cooldown!=null)?opts.cooldown:520;
    if(g._hbStatusStamp[key] && t-g._hbStatusStamp[key]<cooldown) return;
    g._hbStatusStamp[key]=t;
    const elite=!!(g.elite||g.endlessAffix);
    const base=Number(g.r)||30;
    const size=(opts&&opts.size)||Math.round(elite?50:43);
    const x=(Number(g.x)||BW/2)+((Math.random()*2-1)*(opts&&opts.jitterX!=null?opts.jitterX:20));
    const y=(Number(g.y)||BH/2)-Math.max(base*1.18,46)-((opts&&opts.lift)||0);
    this._hbStatusFloaters=this._hbStatusFloaters||[];
    this._hbStatusFloaters.push({
      x,y,
      text:m.text,
      color:m.color,
      size,
      t:(opts&&opts.t)||1.05,
      t0:(opts&&opts.t)||1.05,
      vx:(Math.random()*2-1)*18,
      vy:(opts&&opts.vy)||-58,
      wob:Math.random()*TAU,
      big:!!(opts&&opts.big)
    });
    if(this._hbStatusFloaters.length>42) this._hbStatusFloaters.splice(0,this._hbStatusFloaters.length-42);
  };

  Game.prototype._hbStatusDiffPop=function(g,before,ctxType){
    if(!g||!before) return;
    const after=snapStatus(g);
    if(before.shield&&!after.shield) this._hbMonsterStatusText(g,'breakShield',{size:48,cooldown:120});
    else if(before.shield&&after.shield&&after.hp>=before.hp) this._hbMonsterStatusText(g,'block',{size:42,cooldown:260});
    if(after.burn>before.burn+0.05) this._hbMonsterStatusText(g,'burn',{size:46,cooldown:320});
    if((after.frozen&&!before.frozen)||(after.freeze>before.freeze+0.05)) this._hbMonsterStatusText(g,'freeze',{size:48,cooldown:260});
    if(after.poison&&!before.poison) this._hbMonsterStatusText(g,'poison',{size:46,cooldown:260});
    if(after.bleed&&!before.bleed) this._hbMonsterStatusText(g,'bleed',{size:44,cooldown:260});
    if(ctxType==='fire') this._hbMonsterStatusText(g,'burn',{size:46,cooldown:420});
    else if(ctxType==='ice') this._hbMonsterStatusText(g,'freeze',{size:48,cooldown:420});
    else if(ctxType==='lightning') this._hbMonsterStatusText(g,'lightning',{size:48,cooldown:320});
  };

  const previousUpdateFx=Game.prototype.updateFx;
  Game.prototype.updateFx=function(dt){
    const r=previousUpdateFx?previousUpdateFx.apply(this,arguments):undefined;
    const fs=this._hbStatusFloaters;
    if(fs&&fs.length){
      for(let i=fs.length-1;i>=0;i--){
        const f=fs[i];
        f.t-=dt;
        if(f.t<=0){ fs.splice(i,1); continue; }
        f.x+=f.vx*dt;
        f.y+=f.vy*dt;
        f.vx*=0.90;
        f.vy*=0.91;
      }
    }
    return r;
  };

  const previousDrawFx=Game.prototype.drawFx;
  Game.prototype.drawFx=function(){
    if(previousDrawFx) previousDrawFx.apply(this,arguments);
    const fs=this._hbStatusFloaters;
    if(!fs||!fs.length) return;
    const ctx=this.ctx;
    ctx.save();
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.lineJoin='round';
    for(const f of fs){
      const a=Math.max(0,Math.min(1,f.t/f.t0));
      const p=1-a;
      const pop=1+Math.sin(Math.min(1,p)*Math.PI)*0.16+(f.big?0.06:0);
      const y=f.y+Math.sin((p*5+f.wob))*5;
      ctx.save();
      ctx.translate(f.x,y);
      ctx.scale(pop,pop);
      ctx.globalAlpha=Math.min(1,a*1.25);
      ctx.font='900 '+f.size+'px "Microsoft JhengHei","PingFang TC",Georgia,serif';
      const w=Math.max(96,ctx.measureText(f.text).width+34);
      const h=f.size*1.18;
      ctx.shadowBlur=14;
      ctx.shadowColor='rgba(0,0,0,0.95)';
      this.rr(-w/2,-h/2,w,h,12);
      ctx.fillStyle='rgba(0,0,0,0.58)';
      ctx.fill();
      ctx.lineWidth=Math.max(8,f.size*0.24);
      ctx.strokeStyle='rgba(0,0,0,0.96)';
      ctx.strokeText(f.text,0,1);
      ctx.lineWidth=Math.max(3,f.size*0.08);
      ctx.strokeStyle='rgba(255,239,190,0.42)';
      ctx.strokeText(f.text,0,1);
      ctx.fillStyle=f.color||'#ffe7a6';
      ctx.shadowBlur=10;
      ctx.shadowColor=f.color||'#ffe7a6';
      ctx.fillText(f.text,0,0);
      ctx.restore();
    }
    ctx.restore();
  };

  const previousHurtGuard=Game.prototype.hurtGuard;
  Game.prototype.hurtGuard=function(g,dmg,c,primary){
    const before=snapStatus(g);
    const run=this.run;
    const mirrorBefore=!!(run&&run.endless&&g&&Number(g.endlessMirror)>0);
    const type=this._hbElementTextContext||null;
    const r=previousHurtGuard.apply(this,arguments);
    if(g){
      this._hbStatusDiffPop(g,before,type);
      if(mirrorBefore&&Number(g.endlessMirror||0)<=0) this._hbMonsterStatusText(g,'mirror',{size:50,cooldown:120});
      if(run&&run.endless&&g.endlessFreezeHoop) this._hbMonsterStatusText(g,'coldrim',{size:43,cooldown:850});
      if(run&&run.endless&&g.endlessLocksHoop) this._hbMonsterStatusText(g,'lockrim',{size:42,cooldown:850});
      if((before.burn>0)&&!(c&&c.hx!=null)) this._hbMonsterStatusText(g,'burn',{size:38,cooldown:850});
    }
    return r;
  };

  const wrapElement=(name,type)=>{
    const old=Game.prototype[name];
    if(!old) return;
    Game.prototype[name]=function(c){
      const prev=this._hbElementTextContext;
      this._hbElementTextContext=type;
      try{ return old.apply(this,arguments); }
      finally{ this._hbElementTextContext=prev; }
    };
  };
  wrapElement('formFire','fire');
  wrapElement('formIce','ice');
  wrapElement('formLightning','lightning');

  const previousShared=Game.prototype._applySharedSkillEffects;
  if(previousShared){
    Game.prototype._applySharedSkillEffects=function(ctx){
      const run=this.run;
      const before=new Map();
      if(run&&Array.isArray(run.guards)){
        for(const g of run.guards) before.set(g,snapStatus(g));
      }
      const r=previousShared.apply(this,arguments);
      if(run&&Array.isArray(run.guards)){
        for(const g of run.guards){
          const b=before.get(g);
          if(b) this._hbStatusDiffPop(g,b,null);
        }
      }
      return r;
    };
  }

  const previousRelicBasket=Game.prototype.relicOnBasket;
  if(previousRelicBasket){
    Game.prototype.relicOnBasket=function(swish,bank,ctx){
      const run=this.run;
      const before=new Map();
      if(run&&Array.isArray(run.guards)){
        for(const g of run.guards) before.set(g,snapStatus(g));
      }
      const r=previousRelicBasket.apply(this,arguments);
      if(run&&Array.isArray(run.guards)){
        for(const g of run.guards){
          const b=before.get(g);
          if(b) this._hbStatusDiffPop(g,b,null);
        }
      }
      return r;
    };
  }

  const previousKillGuard=Game.prototype.killGuard;
  Game.prototype.killGuard=function(g){
    const aff=g&&g.endlessAffix;
    const greed=!!(g&&g.endlessGreed);
    const debt=!!(g&&g.endlessDebt);
    const r=previousKillGuard.apply(this,arguments);
    if(g&&g.dead){
      if(aff==='crown') this._hbMonsterStatusText(g,'crown',{size:46,allowDead:true,cooldown:120});
      if(greed) this._hbMonsterStatusText(g,'greed',{size:44,allowDead:true,cooldown:120});
      if(debt) this._hbMonsterStatusText(g,'debt',{size:44,allowDead:true,cooldown:120});
    }
    return r;
  };
})();

// === final activation v22: last-write bean art wiring ===
(function(){
  if(typeof Game==='undefined') return;

  const ART_VER='20260629_bean_all_v1';
  const RELIC_VER='20260629_bean_relics_7x_v1';
  const mobUrl=p=>p+'?v='+ART_VER;
  const lim=(v,a,b)=>Math.max(a,Math.min(b,v));
  const isStdRun=run=>!!(run&&!run.endless&&!run.sandbag&&run.act>=1&&run.act<=5);

  if(typeof SANDBAGS!=='undefined'){
    for(let i=1;i<=5;i++) if(SANDBAGS[i]) SANDBAGS[i].file=mobUrl('/assets/mob/speed/act'+i+'.png');
  }

  const spread=[
    {x:-500,y:132,s:1.20,layer:2},{x:-365,y:54,s:1.10,layer:1},{x:-230,y:150,s:1.18,layer:2},
    {x:-455,y:-76,s:0.98,layer:0},{x:-285,y:-118,s:0.96,layer:0},{x:-104,y:-72,s:1.00,layer:0},
    {x:82,y:-58,s:0.98,layer:0},{x:230,y:38,s:1.08,layer:1},{x:300,y:146,s:1.16,layer:2},
    {x:-570,y:14,s:1.06,layer:1},{x:-46,y:178,s:1.12,layer:2},{x:142,y:116,s:1.08,layer:2}
  ];
  const prevSpawn=Game.prototype.spawnGuard;
  Game.prototype.spawnGuard=function(type){
    const g=prevSpawn.apply(this,arguments), run=this.run, host=run&&run.host;
    if(!g||g.sandbag||!run||!host) return g;
    const slot=spread[(g.slot||0)%spread.length], cycle=Math.floor((g.slot||0)/spread.length);
    const dir=(this.save&&this.save.settings&&this.save.settings.lefty)?-1:1;
    const jitter=((cycle%2)?42:-28)*(1+Math.min(2,cycle)*0.35);
    g.bx=slot.x*dir+jitter*dir;
    g.by=slot.y+((cycle%3)-1)*18;
    g.layer=slot.layer;
    g.drawScale=slot.s*(g.elite?1.16:1);
    g.x=lim(host.x+g.bx,80,BW-80);
    g.y=lim(host.baseY+g.by,BH*0.26,BH-88);
    return g;
  };

  const prevGuard=Game.prototype.drawGuard;
  Game.prototype.drawGuard=function(g){
    const run=this.run;
    if(isStdRun(run)&&g&&!g.dead){
      const ctx=this.ctx, im=this._standardBeanMobSpriteFor&&this._standardBeanMobSpriteFor(g);
      if(!im||!im.complete||!im.naturalWidth||im._err) return prevGuard?prevGuard.call(this,g):undefined;
      const sc=(g.drawScale||1)*(g.elite?1.12:1), bob=Math.sin((this.t||0)*2.1+(g.slot||0))*3, foot=g.y+g.r*0.78;
      const H=Math.min(Math.max(g.r*(g.elite?5.45:5.05)*sc,g.elite?222:172),BH*(g.elite?0.35:0.31));
      const W=H*im.naturalWidth/im.naturalHeight, rim=g.elite?'#ffe14d':'rgba(160,255,48,0.72)';
      ctx.save(); ctx.globalAlpha=g.phased?0.5:1;
      const sh=ctx.createRadialGradient(g.x,foot-4,8,g.x,foot-4,W*0.52);
      sh.addColorStop(0,'rgba(0,0,0,0.48)'); sh.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(g.x,foot-4,W*0.48,H*0.075,0,0,TAU); ctx.fill();
      ctx.save(); ctx.globalAlpha=g.phased?0.26:0.62; ctx.filter='brightness(0) opacity(0.96)';
      const outline=Math.max(3,H*0.025);
      ctx.drawImage(im,g.x-W/2-outline,foot+bob-H,W,H); ctx.drawImage(im,g.x-W/2+outline,foot+bob-H,W,H);
      ctx.drawImage(im,g.x-W/2,foot+bob-H-outline,W,H); ctx.drawImage(im,g.x-W/2,foot+bob-H+outline,W,H);
      ctx.restore();
      ctx.save(); ctx.shadowColor=rim; ctx.shadowBlur=H*(g.elite?0.15:0.10); ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H); ctx.restore();
      ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
      if(g.frozen){ ctx.globalAlpha=0.32; ctx.fillStyle='#6fd8ff'; ctx.beginPath(); ctx.ellipse(g.x,foot-H*0.48,W*0.5,H*0.48,0,0,TAU); ctx.fill(); ctx.globalAlpha=1; }
      if(g.flash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.62,g.flash*0.72); ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H); }
      ctx.restore(); this.drawGuardTags&&this.drawGuardTags(g); return;
    }
    return prevGuard?prevGuard.apply(this,arguments):undefined;
  };

  Game.prototype._hbChapterBossImg=function(act){
    this._hbChapterBossImgs=this._hbChapterBossImgs||{};
    const key='v22_'+act;
    if(this._hbChapterBossImgs[key]!==undefined) return this._hbChapterBossImgs[key];
    try{
      const im=new Image();
      im.onerror=()=>{ im._err=true; };
      im.onload=()=>{ try{ if(this.screen==='battle'&&this.render) this.render(); }catch(_e){} };
      im.src=mobUrl('/assets/mob/bosses/act'+act+'.png');
      this._hbChapterBossImgs[key]=im;
      return im;
    }catch(e){ this._hbChapterBossImgs[key]=null; return null; }
  };
  Game.prototype._hbDrawChapterBossArt=function(){
    const run=this.run, host=run&&run.host;
    if(!run||!host||run.endless||run.sandbag||!run.stage||!run.stage.boss) return;
    const im=this._hbChapterBossImg(run.act);
    if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const ctx=this.ctx, nw=im.naturalWidth, nh=im.naturalHeight;
    let H=BH*0.72, W=H*nw/nh;
    if(W>BW*0.48){ W=BW*0.48; H=W*nh/nw; }
    const cx=host.x, by=BH-20;
    ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,32,cx,by-H*0.48,W*0.72);
    glow.addColorStop(0,'rgba(185,255,47,0.18)'); glow.addColorStop(0.54,'rgba(126,60,190,0.12)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.ellipse(cx,by-H*0.46,W*0.64,H*0.54,0,0,TAU); ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.44);
    sh.addColorStop(0,'rgba(0,0,0,0.58)'); sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.44,H*0.08,0,0,TAU); ctx.fill();
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.46,run._mobHitFlash*0.65); ctx.drawImage(im,cx-W/2,by-H,W,H); }
    ctx.restore();
  };
  const prevHostHoop=Game.prototype.drawHostAndHoop;
  Game.prototype.drawHostAndHoop=function(){
    this._hbDrawChapterBossArt&&this._hbDrawChapterBossArt();
    return prevHostHoop?prevHostHoop.apply(this,arguments):undefined;
  };

  const eMeta={
    crack_runner:{s:mobUrl('/assets/endless/enemies/crack_runner.png'),c:'#9fe024',z:1.18},
    screen_idol:{s:mobUrl('/assets/endless/enemies/screen_idol.png'),c:'#d7a945',z:1.34},
    iron_whistle:{s:mobUrl('/assets/endless/enemies/iron_whistle.png'),c:'#ffe14d',z:1.12},
    oil_monk:{s:mobUrl('/assets/endless/enemies/oil_monk.png'),c:'#6fbe30',z:1.24},
    mist_librarian:{s:mobUrl('/assets/endless/enemies/mist_librarian.png'),c:'#b980ff',z:1.18},
    cold_rim_guard:{s:mobUrl('/assets/endless/enemies/cold_rim_guard.png'),c:'#6fd8ff',z:1.25},
    war_drum_leader:{s:mobUrl('/assets/endless/enemies/war_drum_leader.png'),c:'#ffb34d',z:1.25},
    shattered_board_collector:{s:mobUrl('/assets/endless/enemies/shattered_board_collector.png'),c:'#d8ff44',z:1.20}
  };
  const prevEndGuard=Game.prototype.drawEndlessGuard;
  Game.prototype.drawEndlessGuard=function(g){
    const run=this.run;
    if(run&&run.stage&&run.stage.boss) return;
    const id=(g&&g.endlessEnemyId)||'crack_runner', info=eMeta[id]||eMeta.crack_runner;
    const im=this._endlessImg?this._endlessImg('enemy_'+id+'_'+ART_VER,info.s):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return prevEndGuard?prevEndGuard.call(this,g):undefined;
    const ctx=this.ctx, base=g.r||28, bob=Math.sin((this.t||0)*2.4+(g.slot||0))*4, scale=(g.drawScale||1)*(info.z||1)*(g.elite?1.12:1);
    let H=Math.min(Math.max(base*(g.elite?5.3:4.85)*scale,g.elite?225:172),BH*(g.elite?0.36:0.31));
    let W=H*im.naturalWidth/im.naturalHeight;
    const maxW=base*(g.elite?7.2:6.2)*scale;
    if(W>maxW){ W=maxW; H=W*im.naturalHeight/im.naturalWidth; }
    const x=-W/2, y=bob+base*1.05-H, rimCol=g.endlessAffixColor||g.endlessColor||info.c||'#9fe024';
    ctx.save(); ctx.translate(g.x,g.y); ctx.globalAlpha=g.phased?0.48:1; this.shadow(0,base*0.94,base*1.18,0.28);
    const glow=ctx.createRadialGradient(0,bob-base*0.45,4,0,bob-base*0.45,Math.max(base*2.7,W*0.68));
    glow.addColorStop(0,g.endlessAffix?'rgba(255,225,77,0.24)':'rgba(155,255,50,0.20)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,bob-base*0.4,Math.max(base*2.35,W*0.58),0,TAU); ctx.fill();
    ctx.save(); ctx.globalAlpha=g.phased?0.28:0.58; ctx.filter='brightness(0) opacity(0.96)';
    const outline=Math.max(3,H*0.026);
    ctx.drawImage(im,x-outline,y,W,H); ctx.drawImage(im,x+outline,y,W,H); ctx.drawImage(im,x,y-outline,W,H); ctx.drawImage(im,x,y+outline,W,H);
    ctx.restore();
    ctx.save(); ctx.globalAlpha=g.phased?0.34:0.86; ctx.shadowColor=rimCol; ctx.shadowBlur=H*(g.elite?0.16:0.11); ctx.drawImage(im,x,y,W,H); ctx.restore();
    ctx.drawImage(im,x,y,W,H);
    if(g.flash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.62,g.flash*0.7); ctx.drawImage(im,x,y,W,H); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; }
    if(g.shieldUp){ ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.88)'; ctx.beginPath(); ctx.ellipse(0,bob-base*0.45,W*0.48,H*0.45,0,0,TAU); ctx.stroke(); }
    if(g.endlessAffix){
      const col=g.endlessAffixColor||'#ffe14d';
      ctx.save(); ctx.translate(0,y-18); this.rr(-24,-16,48,32,10); ctx.fillStyle='rgba(9,6,5,0.88)'; ctx.fill(); ctx.lineWidth=2.4; ctx.strokeStyle=col; ctx.stroke(); this.text(g.endlessAffixShort||'菁',0,2,20,col,{align:'center',baseline:'middle',weight:'900',glow:8}); ctx.restore();
      if(g.endlessCountdown>0) this.text(Math.ceil(g.endlessCountdown),0,y+22,18,'#ff6a4a',{align:'center',baseline:'middle',weight:'900'});
    }
    ctx.restore(); this.drawGuardTags&&this.drawGuardTags(g);
  };

  const eBoss=[
    [5,'free_throw_executioner',mobUrl('/assets/endless/bosses/free_throw_executioner.png')],
    [10,'broken_rim_stitcher',mobUrl('/assets/endless/bosses/broken_rim_stitcher.png')],
    [15,'coldflame_scorekeeper',mobUrl('/assets/endless/bosses/coldflame_scorekeeper.png')],
    [20,'thunderbone_announcer',mobUrl('/assets/endless/bosses/thunderbone_announcer.png')],
    [9999,'abyss_hoop_lord',mobUrl('/assets/endless/bosses/abyss_hoop_lord.png')]
  ];
  Game.prototype._endlessBossSprite=function(depth){
    depth=Math.max(1,Number(depth)||1);
    const b=eBoss.find(x=>depth<=x[0])||eBoss[eBoss.length-1];
    return {key:b[1],src:b[2]};
  };
  const prevEndBoss=Game.prototype.drawEndlessBossArt;
  Game.prototype.drawEndlessBossArt=function(){
    const ctx=this.ctx, run=this.run, boss=this._endlessBossSprite(run&&run.endlessDepth), im=this._endlessImg?this._endlessImg('boss_'+boss.key+'_'+ART_VER,boss.src):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return prevEndBoss?prevEndBoss.call(this):undefined;
    const nw=im.naturalWidth, nh=im.naturalHeight;
    let H=BH*0.76, W=H*nw/nh;
    if(W>BW*0.64){ W=BW*0.64; H=W*nh/nw; }
    const cx=BW*0.67, by=BH-18; ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,30,cx,by-H*0.48,W*0.72);
    glow.addColorStop(0,'rgba(160,255,48,0.24)'); glow.addColorStop(0.58,'rgba(100,255,36,0.09)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.ellipse(cx,by-H*0.45,W*0.64,H*0.54,0,0,TAU); ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.42);
    sh.addColorStop(0,'rgba(0,0,0,0.58)'); sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.42,H*0.08,0,0,TAU); ctx.fill();
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run&&run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.45,run._mobHitFlash*0.65); ctx.drawImage(im,cx-W/2,by-H,W,H); }
    ctx.restore();
  };

  const typeInfo={
    ball:{label:'籃球',tab:'籃球',sheet:'icons_balls.png',names:['冠軍金球','冷焰籃球','燼鏈戰球','深淵紫球','碎玻璃球','毒裂籃球','幸運空心球']},
    wrist:{label:'護腕',tab:'護腕',sheet:'icons_wrist.png',names:['骨哨護腕','鐵鏈護腕','黏油護腕','血紅腕帶','雷骨腕甲','霜封護腕','冠軍腕甲']},
    shoes:{label:'球鞋',tab:'球鞋',sheet:'icons_shoes.png',names:['羽翼疾鞋','鐵底球鞋','霜步球鞋','燼火鞋','影步鞋','荊棘戰靴','遠投金靴']},
    charm:{label:'護符',tab:'護符',sheet:'icons_charms.png',names:['骷髏墜飾','深淵護符','幸運框牌','碎鏡吊墜','綠焰符牌','裁判哨符','小王冠印']},
    mask:{label:'面具',tab:'面具',sheet:'icons_masks.png',names:['裁判面罩','影客兜帽','冷焰骨面','教練骨面','血戰面甲','毒沼面具','王冠金面']},
    hoop:{label:'籃框',tab:'籃框',sheet:'icons_hoops.png',names:['破金籃框','鎖鏈鐵框','深淵紫框','冷焰冰框','黏油毒框','燼火紅框','骷髏冠框']}
  };
  const order=['ball','wrist','shoes','charm','mask','hoop'];
  const baseDesc='基底外觀固定；實際掉落強度、品質與詞綴由 RNG 決定。';
  const baseDefs={
    ball:[['hb_ball_0','冠軍金球','normal'],['hb_ball_1','冷焰籃球','ice'],['hb_ball_2','燼鏈戰球','fire'],['hb_ball_3','深淵紫球','lightning'],['hb_ball_4','碎玻璃球','arrow'],['hb_ball_5','毒裂籃球','axe'],['hb_ball_6','幸運空心球','normal']],
    wrist:[['hb_wrist_0','骨哨護腕'],['hb_wrist_1','鐵鏈護腕'],['hb_wrist_2','黏油護腕'],['hb_wrist_3','血紅腕帶'],['hb_wrist_4','雷骨腕甲'],['hb_wrist_5','霜封護腕'],['hb_wrist_6','冠軍腕甲']],
    shoes:[['hb_shoes_0','羽翼疾鞋'],['hb_shoes_1','鐵底球鞋'],['hb_shoes_2','霜步球鞋'],['hb_shoes_3','燼火鞋'],['hb_shoes_4','影步鞋'],['hb_shoes_5','荊棘戰靴'],['hb_shoes_6','遠投金靴']],
    charm:[['hb_charm_0','骷髏墜飾'],['hb_charm_1','深淵護符'],['hb_charm_2','幸運框牌'],['hb_charm_3','碎鏡吊墜'],['hb_charm_4','綠焰符牌'],['hb_charm_5','裁判哨符'],['hb_charm_6','小王冠印']],
    mask:[['hb_mask_0','裁判面罩'],['hb_mask_1','影客兜帽'],['hb_mask_2','冷焰骨面'],['hb_mask_3','教練骨面'],['hb_mask_4','血戰面甲'],['hb_mask_5','毒沼面具'],['hb_mask_6','王冠金面']],
    hoop:[['hb_hoop_0','破金籃框'],['hb_hoop_1','鎖鏈鐵框'],['hb_hoop_2','深淵紫框'],['hb_hoop_3','冷焰冰框'],['hb_hoop_4','黏油毒框'],['hb_hoop_5','燼火紅框'],['hb_hoop_6','骷髏冠框']]
  };
  const visualById={
    abbey_ember:['ball',2],sand_bow:['ball',4],citadel_battery:['ball',3],red_axe:['hoop',5],final_chill:['ball',1],
    ember_saint:['charm',4],iron_hook:['hoop',1],coldflame_tesla:['ball',1],thunderbone:['wrist',4],absolute_zero:['ball',1],
    broken_glass:['ball',4],deadeye_sigil:['mask',0],kings_seal:['mask',6],blood_chalice:['charm',0],hex_idol:['charm',1],
    pilgrim_bone:['charm',0],rift_feather:['shoes',0],champ_ball:['ball',0],bench_towel:['wrist',3],ref_glasses:['mask',0],board_brace:['wrist',6]
  };
  if(typeof RELICS!=='undefined'){
    for(const type of order){
      for(let i=0;i<baseDefs[type].length;i++){
        const def=baseDefs[type][i], id=def[0];
        visualById[id]=[type,i];
        if(!RELICS[id]) RELICS[id]={name:def[1],cls:type==='ball'?'core':(type==='charm'||type==='hoop'?'oath':'feel'),equipType:type,form:def[2]||null,desc:baseDesc};
      }
    }
  }
  Game.prototype._hbRelicUiUrl=function(name){ return '/assets/relic_ui/'+name+'?v='+RELIC_VER; };
  Game.prototype._relicUiImg=function(name){
    this._relicUi=this._relicUi||{};
    const key=name+'?v='+RELIC_VER;
    if(this._relicUi[key]!==undefined) return this._relicUi[key];
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._bag||this._relicCompare||this.screen==='relics') this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=this._hbRelicUiUrl(name);
      this._relicUi[key]=im;
      return im;
    }catch(e){ this._relicUi[key]=null; return null; }
  };
  Game.prototype._preloadRelicUiAssets=function(){
    for(const name of ['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png']) this._relicUiImg(name);
  };
  Game.prototype._relicVisual=function(rid){
    if(visualById[rid]) return {type:visualById[rid][0],idx:visualById[rid][1]};
    const R=(typeof RELICS!=='undefined'&&RELICS[rid])||{};
    if(R.equipType&&typeInfo[R.equipType]) return {type:R.equipType,idx:0};
    if(R.form) return {type:'ball',idx:({fire:2,ice:1,lightning:3,axe:5,arrow:4,normal:6}[R.form]||0)};
    if(R.cls==='oath') return {type:'charm',idx:1};
    if(R.cls==='feel') return {type:'wrist',idx:0};
    return {type:'hoop',idx:0};
  };
  Game.prototype._relicBaseName=function(type,idx){
    const t=typeInfo[type]||typeInfo.ball;
    return t.names[idx%7]||t.label;
  };
  Game.prototype._allRelicCatalog=function(){
    const out=[];
    for(const type of order){
      const t=typeInfo[type];
      for(let i=0;i<7;i++) out.push({catalog:true,id:'cat_'+type+'_'+i,type,idx:i,name:t.names[i],core:t.label,tier:i%5,tab:t.tab});
    }
    return out;
  };
  Game.prototype._relicDisplay=function(rid,owned){
    const R=(typeof RELICS!=='undefined'&&RELICS[rid])||{}, v=this._relicVisual(rid), meta=owned&&this._relicMeta?this._relicMeta(rid):null;
    const t=typeInfo[v.type]||typeInfo.ball;
    return {id:rid,name:R.name||this._relicBaseName(v.type,v.idx),type:v.type,idx:v.idx%7,cls:R.cls||'core',core:t.label,desc:R.desc||baseDesc,tier:meta?meta.tier:0,q:meta?meta.q:0,affixes:meta&&meta.affixes?meta.affixes:[]};
  };

  const prevFull=Game.prototype._hbFullPreloadImages;
  Game.prototype._hbFullPreloadImages=function(){
    const base=prevFull?prevFull.call(this):[], add=[];
    for(let i=1;i<=5;i++){ add.push(mobUrl('/assets/mob/speed/act'+i+'.png')); add.push(mobUrl('/assets/mob/bosses/act'+i+'.png')); }
    for(let act=1;act<=5;act++) for(let i=0;i<6;i++) add.push('/assets/mob/standard/act'+act+'/enemy_'+i+'.png?v=20260629_bean_mobs_v1');
    for(const id of Object.keys(eMeta)) add.push(eMeta[id].s);
    for(const b of eBoss) add.push(b[2]);
    for(const name of ['icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png']) add.push(this._hbRelicUiUrl?this._hbRelicUiUrl(name):('/assets/relic_ui/'+name));
    const seen={}, out=[];
    for(const src of base.concat(add)){ if(src&&!seen[src]){ seen[src]=1; out.push(src); } }
    return out;
  };
})();

// === final activation v21: approved bean assets, 7 relic bases per slot ===
(function(){
  if(typeof Game==='undefined') return;

  const ART_VER='20260629_bean_all_v1';
  const RELIC_VER='20260629_bean_relics_7x_v1';
  const mobUrl=p=>p+'?v='+ART_VER;
  const lim=(v,a,b)=>Math.max(a,Math.min(b,v));
  const isStdRun=run=>!!(run&&!run.endless&&!run.sandbag&&run.act>=1&&run.act<=5);

  if(typeof SANDBAGS!=='undefined'){
    for(let i=1;i<=5;i++) if(SANDBAGS[i]) SANDBAGS[i].file=mobUrl('/assets/mob/speed/act'+i+'.png');
  }

  const slotSpread=[
    {x:-500,y:132,s:1.20,layer:2},{x:-365,y:54,s:1.10,layer:1},{x:-230,y:150,s:1.18,layer:2},
    {x:-455,y:-76,s:0.98,layer:0},{x:-285,y:-118,s:0.96,layer:0},{x:-104,y:-72,s:1.00,layer:0},
    {x:82,y:-58,s:0.98,layer:0},{x:230,y:38,s:1.08,layer:1},{x:300,y:146,s:1.16,layer:2},
    {x:-570,y:14,s:1.06,layer:1},{x:-46,y:178,s:1.12,layer:2},{x:142,y:116,s:1.08,layer:2}
  ];
  const prevSpawnGuard=Game.prototype.spawnGuard;
  Game.prototype.spawnGuard=function(type){
    const g=prevSpawnGuard.apply(this,arguments);
    const run=this.run, host=run&&run.host;
    if(!g||g.sandbag||!run||!host) return g;
    const slot=slotSpread[(g.slot||0)%slotSpread.length];
    const cycle=Math.floor((g.slot||0)/slotSpread.length);
    const dir=(this.save&&this.save.settings&&this.save.settings.lefty)?-1:1;
    const jitter=((cycle%2)?42:-28)*(1+Math.min(2,cycle)*0.35);
    g.bx=slot.x*dir+jitter*dir;
    g.by=slot.y+((cycle%3)-1)*18;
    g.layer=slot.layer;
    g.drawScale=slot.s*(g.elite?1.16:1);
    g.x=lim(host.x+g.bx,80,BW-80);
    g.y=lim(host.baseY+g.by,BH*0.26,BH-88);
    return g;
  };

  const prevDrawGuard=Game.prototype.drawGuard;
  Game.prototype.drawGuard=function(g){
    const run=this.run;
    if(isStdRun(run)&&g&&!g.dead){
      const ctx=this.ctx, im=this._standardBeanMobSpriteFor&&this._standardBeanMobSpriteFor(g);
      if(!im||!im.complete||!im.naturalWidth||im._err) return prevDrawGuard?prevDrawGuard.call(this,g):undefined;
      const sc=(g.drawScale||1)*(g.elite?1.12:1);
      const bob=Math.sin((this.t||0)*2.1+(g.slot||0))*3;
      const foot=g.y+g.r*0.78;
      const rawH=g.r*(g.elite?5.45:5.05)*sc;
      const H=Math.min(Math.max(rawH,g.elite?222:172),BH*(g.elite?0.35:0.31));
      const W=H*im.naturalWidth/im.naturalHeight;
      ctx.save();
      ctx.globalAlpha=g.phased?0.5:1;
      const sh=ctx.createRadialGradient(g.x,foot-4,8,g.x,foot-4,W*0.52);
      sh.addColorStop(0,'rgba(0,0,0,0.48)');
      sh.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(g.x,foot-4,W*0.48,H*0.075,0,0,TAU); ctx.fill();
      const rim=g.elite?'#ffe14d':'rgba(160,255,48,0.72)';
      ctx.save();
      ctx.globalAlpha=g.phased?0.26:0.62;
      ctx.filter='brightness(0) opacity(0.96)';
      const outline=Math.max(3,H*0.025);
      ctx.drawImage(im,g.x-W/2-outline,foot+bob-H,W,H);
      ctx.drawImage(im,g.x-W/2+outline,foot+bob-H,W,H);
      ctx.drawImage(im,g.x-W/2,foot+bob-H-outline,W,H);
      ctx.drawImage(im,g.x-W/2,foot+bob-H+outline,W,H);
      ctx.restore();
      ctx.save();
      ctx.shadowColor=rim;
      ctx.shadowBlur=H*(g.elite?0.15:0.10);
      ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
      ctx.restore();
      ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
      if(g.frozen){ ctx.globalAlpha=0.32; ctx.fillStyle='#6fd8ff'; ctx.beginPath(); ctx.ellipse(g.x,foot-H*0.48,W*0.5,H*0.48,0,0,TAU); ctx.fill(); ctx.globalAlpha=1; }
      if(g.flash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.62,g.flash*0.72); ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H); }
      ctx.restore();
      this.drawGuardTags&&this.drawGuardTags(g);
      return;
    }
    return prevDrawGuard?prevDrawGuard.apply(this,arguments):undefined;
  };

  Game.prototype._hbChapterBossImg=function(act){
    this._hbChapterBossImgs=this._hbChapterBossImgs||{};
    const key='act'+act;
    if(this._hbChapterBossImgs[key]!==undefined) return this._hbChapterBossImgs[key];
    try{
      const im=new Image();
      im.onerror=()=>{ im._err=true; };
      im.onload=()=>{ try{ if(this.screen==='battle'&&this.render) this.render(); }catch(_e){} };
      im.src=mobUrl('/assets/mob/bosses/act'+act+'.png');
      this._hbChapterBossImgs[key]=im;
      return im;
    }catch(e){ this._hbChapterBossImgs[key]=null; return null; }
  };
  Game.prototype._hbDrawChapterBossArt=function(){
    const run=this.run, host=run&&run.host;
    if(!run||!host||run.endless||run.sandbag||!run.stage||!run.stage.boss) return;
    const im=this._hbChapterBossImg(run.act);
    if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const ctx=this.ctx, nw=im.naturalWidth, nh=im.naturalHeight;
    let H=BH*0.72, W=H*nw/nh;
    if(W>BW*0.48){ W=BW*0.48; H=W*nh/nw; }
    const cx=host.x, by=BH-20;
    ctx.save();
    const g=ctx.createRadialGradient(cx,by-H*0.48,32,cx,by-H*0.48,W*0.72);
    g.addColorStop(0,'rgba(185,255,47,0.18)');
    g.addColorStop(0.54,'rgba(126,60,190,0.12)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(cx,by-H*0.46,W*0.64,H*0.54,0,0,TAU); ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.44);
    sh.addColorStop(0,'rgba(0,0,0,0.58)'); sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.44,H*0.08,0,0,TAU); ctx.fill();
    let lp=0; if(run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(lim(tt,0,1)*Math.PI); }
    if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.045,1+lp*0.045); ctx.translate(-cx-lp*46,-by); }
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.46,run._mobHitFlash*0.65); ctx.drawImage(im,cx-W/2,by-H,W,H); }
    ctx.restore();
  };
  const prevDrawHostAndHoop=Game.prototype.drawHostAndHoop;
  Game.prototype.drawHostAndHoop=function(){
    this._hbDrawChapterBossArt&&this._hbDrawChapterBossArt();
    return prevDrawHostAndHoop?prevDrawHostAndHoop.apply(this,arguments):undefined;
  };

  const endlessMeta={
    crack_runner:{s:mobUrl('/assets/endless/enemies/crack_runner.png'),c:'#9fe024',z:1.18},
    screen_idol:{s:mobUrl('/assets/endless/enemies/screen_idol.png'),c:'#d7a945',z:1.34},
    iron_whistle:{s:mobUrl('/assets/endless/enemies/iron_whistle.png'),c:'#ffe14d',z:1.12},
    oil_monk:{s:mobUrl('/assets/endless/enemies/oil_monk.png'),c:'#6fbe30',z:1.24},
    mist_librarian:{s:mobUrl('/assets/endless/enemies/mist_librarian.png'),c:'#b980ff',z:1.18},
    cold_rim_guard:{s:mobUrl('/assets/endless/enemies/cold_rim_guard.png'),c:'#6fd8ff',z:1.25},
    war_drum_leader:{s:mobUrl('/assets/endless/enemies/war_drum_leader.png'),c:'#ffb34d',z:1.25},
    shattered_board_collector:{s:mobUrl('/assets/endless/enemies/shattered_board_collector.png'),c:'#d8ff44',z:1.20}
  };
  const prevDrawEndlessGuard=Game.prototype.drawEndlessGuard;
  Game.prototype.drawEndlessGuard=function(g){
    const run=this.run;
    if(run&&run.stage&&run.stage.boss) return;
    const id=(g&&g.endlessEnemyId)||'crack_runner';
    const info=endlessMeta[id]||endlessMeta.crack_runner;
    const im=this._endlessImg?this._endlessImg('enemy_'+id+'_'+ART_VER,info.s):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return prevDrawEndlessGuard?prevDrawEndlessGuard.call(this,g):undefined;
    const ctx=this.ctx, base=g.r||28, bob=Math.sin((this.t||0)*2.4+(g.slot||0))*4, scale=(g.drawScale||1)*(info.z||1)*(g.elite?1.12:1);
    let H=Math.min(Math.max(base*(g.elite?5.3:4.85)*scale,g.elite?225:172),BH*(g.elite?0.36:0.31));
    let W=H*im.naturalWidth/im.naturalHeight;
    const maxW=base*(g.elite?7.2:6.2)*scale;
    if(W>maxW){ W=maxW; H=W*im.naturalHeight/im.naturalWidth; }
    const x=-W/2, y=bob+base*1.05-H;
    ctx.save(); ctx.translate(g.x,g.y); ctx.globalAlpha=g.phased?0.48:1; this.shadow(0,base*0.94,base*1.18,0.28);
    const glow=ctx.createRadialGradient(0,bob-base*0.45,4,0,bob-base*0.45,Math.max(base*2.7,W*0.68));
    glow.addColorStop(0,g.endlessAffix?'rgba(255,225,77,0.24)':'rgba(155,255,50,0.20)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,bob-base*0.4,Math.max(base*2.35,W*0.58),0,TAU); ctx.fill();
    const rimCol=g.endlessAffixColor||g.endlessColor||info.c||'#9fe024';
    ctx.save(); ctx.globalAlpha=g.phased?0.28:0.58; ctx.filter='brightness(0) opacity(0.96)';
    const outline=Math.max(3,H*0.026);
    ctx.drawImage(im,x-outline,y,W,H); ctx.drawImage(im,x+outline,y,W,H); ctx.drawImage(im,x,y-outline,W,H); ctx.drawImage(im,x,y+outline,W,H);
    ctx.restore();
    ctx.save(); ctx.globalAlpha=g.phased?0.34:0.86; ctx.shadowColor=rimCol; ctx.shadowBlur=H*(g.elite?0.16:0.11); ctx.drawImage(im,x,y,W,H); ctx.restore();
    ctx.drawImage(im,x,y,W,H);
    if(g.flash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.62,g.flash*0.7); ctx.drawImage(im,x,y,W,H); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; }
    if(g.shieldUp){ ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.88)'; ctx.beginPath(); ctx.ellipse(0,bob-base*0.45,W*0.48,H*0.45,0,0,TAU); ctx.stroke(); }
    if(g.endlessAffix){
      const col=g.endlessAffixColor||'#ffe14d';
      ctx.save(); ctx.translate(0,y-18); this.rr(-24,-16,48,32,10); ctx.fillStyle='rgba(9,6,5,0.88)'; ctx.fill(); ctx.lineWidth=2.4; ctx.strokeStyle=col; ctx.stroke(); this.text(g.endlessAffixShort||'菁',0,2,20,col,{align:'center',baseline:'middle',weight:'900',glow:8}); ctx.restore();
      if(g.endlessCountdown>0) this.text(Math.ceil(g.endlessCountdown),0,y+22,18,'#ff6a4a',{align:'center',baseline:'middle',weight:'900'});
    }
    ctx.restore(); this.drawGuardTags&&this.drawGuardTags(g);
  };

  const endlessBosses=[
    [5,'free_throw_executioner',mobUrl('/assets/endless/bosses/free_throw_executioner.png')],
    [10,'broken_rim_stitcher',mobUrl('/assets/endless/bosses/broken_rim_stitcher.png')],
    [15,'coldflame_scorekeeper',mobUrl('/assets/endless/bosses/coldflame_scorekeeper.png')],
    [20,'thunderbone_announcer',mobUrl('/assets/endless/bosses/thunderbone_announcer.png')],
    [9999,'abyss_hoop_lord',mobUrl('/assets/endless/bosses/abyss_hoop_lord.png')]
  ];
  Game.prototype._endlessBossSprite=function(depth){
    depth=Math.max(1,Number(depth)||1);
    const b=endlessBosses.find(x=>depth<=x[0])||endlessBosses[endlessBosses.length-1];
    return {key:b[1],src:b[2]};
  };
  const prevDrawEndlessBossArt=Game.prototype.drawEndlessBossArt;
  Game.prototype.drawEndlessBossArt=function(){
    const ctx=this.ctx, run=this.run, boss=this._endlessBossSprite(run&&run.endlessDepth), im=this._endlessImg?this._endlessImg('boss_'+boss.key+'_'+ART_VER,boss.src):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return prevDrawEndlessBossArt?prevDrawEndlessBossArt.call(this):undefined;
    const nw=im.naturalWidth, nh=im.naturalHeight;
    let H=BH*0.76, W=H*nw/nh;
    if(W>BW*0.64){ W=BW*0.64; H=W*nh/nw; }
    const cx=BW*0.67, by=BH-18; ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,30,cx,by-H*0.48,W*0.72); glow.addColorStop(0,'rgba(160,255,48,0.24)'); glow.addColorStop(0.58,'rgba(100,255,36,0.09)'); glow.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=glow; ctx.beginPath(); ctx.ellipse(cx,by-H*0.45,W*0.64,H*0.54,0,0,TAU); ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.42); sh.addColorStop(0,'rgba(0,0,0,0.58)'); sh.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.42,H*0.08,0,0,TAU); ctx.fill();
    let lp=0; if(run&&run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(lim(tt,0,1)*Math.PI); } if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.05,1+lp*0.05); ctx.translate(-cx-lp*54,-by); }
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run&&run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.45,run._mobHitFlash*0.65); ctx.drawImage(im,cx-W/2,by-H,W,H); }
    ctx.restore();
  };

  const typeInfo={
    ball:{label:'籃球',tab:'籃球',sheet:'icons_balls.png',names:['冠軍金球','冷焰籃球','燼鏈戰球','深淵紫球','碎玻璃球','毒裂籃球','幸運空心球']},
    wrist:{label:'護腕',tab:'護腕',sheet:'icons_wrist.png',names:['骨哨護腕','鐵鏈護腕','黏油護腕','血紅腕帶','雷骨腕甲','霜封護腕','冠軍腕甲']},
    shoes:{label:'球鞋',tab:'球鞋',sheet:'icons_shoes.png',names:['羽翼疾鞋','鐵底球鞋','霜步球鞋','燼火鞋','影步鞋','荊棘戰靴','遠投金靴']},
    charm:{label:'護符',tab:'護符',sheet:'icons_charms.png',names:['骷髏墜飾','深淵護符','幸運框牌','碎鏡吊墜','綠焰符牌','裁判哨符','小王冠印']},
    mask:{label:'面具',tab:'面具',sheet:'icons_masks.png',names:['裁判面罩','影客兜帽','冷焰骨面','教練骨面','血戰面甲','毒沼面具','王冠金面']},
    hoop:{label:'籃框',tab:'籃框',sheet:'icons_hoops.png',names:['破金籃框','鎖鏈鐵框','深淵紫框','冷焰冰框','黏油毒框','燼火紅框','骷髏冠框']}
  };
  const typeOrder=['ball','wrist','shoes','charm','mask','hoop'];
  const baseDesc='基底外觀固定；實際掉落強度、品質與詞綴由 RNG 決定。';
  const baseDefs={
    ball:[['hb_ball_0','冠軍金球','normal'],['hb_ball_1','冷焰籃球','ice'],['hb_ball_2','燼鏈戰球','fire'],['hb_ball_3','深淵紫球','lightning'],['hb_ball_4','碎玻璃球','arrow'],['hb_ball_5','毒裂籃球','axe'],['hb_ball_6','幸運空心球','normal']],
    wrist:[['hb_wrist_0','骨哨護腕'],['hb_wrist_1','鐵鏈護腕'],['hb_wrist_2','黏油護腕'],['hb_wrist_3','血紅腕帶'],['hb_wrist_4','雷骨腕甲'],['hb_wrist_5','霜封護腕'],['hb_wrist_6','冠軍腕甲']],
    shoes:[['hb_shoes_0','羽翼疾鞋'],['hb_shoes_1','鐵底球鞋'],['hb_shoes_2','霜步球鞋'],['hb_shoes_3','燼火鞋'],['hb_shoes_4','影步鞋'],['hb_shoes_5','荊棘戰靴'],['hb_shoes_6','遠投金靴']],
    charm:[['hb_charm_0','骷髏墜飾'],['hb_charm_1','深淵護符'],['hb_charm_2','幸運框牌'],['hb_charm_3','碎鏡吊墜'],['hb_charm_4','綠焰符牌'],['hb_charm_5','裁判哨符'],['hb_charm_6','小王冠印']],
    mask:[['hb_mask_0','裁判面罩'],['hb_mask_1','影客兜帽'],['hb_mask_2','冷焰骨面'],['hb_mask_3','教練骨面'],['hb_mask_4','血戰面甲'],['hb_mask_5','毒沼面具'],['hb_mask_6','王冠金面']],
    hoop:[['hb_hoop_0','破金籃框'],['hb_hoop_1','鎖鏈鐵框'],['hb_hoop_2','深淵紫框'],['hb_hoop_3','冷焰冰框'],['hb_hoop_4','黏油毒框'],['hb_hoop_5','燼火紅框'],['hb_hoop_6','骷髏冠框']]
  };
  const visualById={
    abbey_ember:['ball',2],sand_bow:['ball',4],citadel_battery:['ball',3],red_axe:['hoop',5],final_chill:['ball',1],
    ember_saint:['charm',4],iron_hook:['hoop',1],coldflame_tesla:['ball',1],thunderbone:['wrist',4],absolute_zero:['ball',1],
    broken_glass:['ball',4],deadeye_sigil:['mask',0],kings_seal:['mask',6],blood_chalice:['charm',0],hex_idol:['charm',1],
    pilgrim_bone:['charm',0],rift_feather:['shoes',0],champ_ball:['ball',0],bench_towel:['wrist',3],ref_glasses:['mask',0],board_brace:['wrist',6]
  };
  if(typeof RELICS!=='undefined'){
    for(const type of typeOrder){
      for(let i=0;i<baseDefs[type].length;i++){
        const def=baseDefs[type][i], id=def[0];
        visualById[id]=[type,i];
        if(!RELICS[id]) RELICS[id]={name:def[1],cls:type==='ball'?'core':(type==='charm'||type==='hoop'?'oath':'feel'),equipType:type,form:def[2]||null,desc:baseDesc};
      }
    }
  }
  Game.prototype._hbRelicUiUrl=function(name){ return '/assets/relic_ui/'+name+'?v='+RELIC_VER; };
  Game.prototype._relicUiImg=function(name){
    this._relicUi=this._relicUi||{};
    const key=name+'?v='+RELIC_VER;
    if(this._relicUi[key]!==undefined) return this._relicUi[key];
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._bag||this._relicCompare||this.screen==='relics') this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=this._hbRelicUiUrl(name);
      this._relicUi[key]=im;
      return im;
    }catch(e){ this._relicUi[key]=null; return null; }
  };
  Game.prototype._preloadRelicUiAssets=function(){
    for(const name of ['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png']) this._relicUiImg(name);
  };
  Game.prototype._relicVisual=function(rid){
    if(visualById[rid]) return {type:visualById[rid][0],idx:visualById[rid][1]};
    const R=(typeof RELICS!=='undefined'&&RELICS[rid])||{};
    if(R.equipType&&typeInfo[R.equipType]) return {type:R.equipType,idx:0};
    if(R.form) return {type:'ball',idx:({fire:2,ice:1,lightning:3,axe:5,arrow:4,normal:6}[R.form]||0)};
    if(R.cls==='oath') return {type:'charm',idx:1};
    if(R.cls==='feel') return {type:'wrist',idx:0};
    return {type:'hoop',idx:0};
  };
  Game.prototype._relicBaseName=function(type,idx){
    const t=typeInfo[type]||typeInfo.ball;
    return t.names[idx%7]||t.label;
  };
  Game.prototype._allRelicCatalog=function(){
    const out=[];
    for(const type of typeOrder){
      const t=typeInfo[type];
      for(let i=0;i<7;i++) out.push({catalog:true,id:'cat_'+type+'_'+i,type,idx:i,name:t.names[i],core:t.label,tier:i%5,tab:t.tab});
    }
    return out;
  };
  Game.prototype._relicDisplay=function(rid,owned){
    const R=(typeof RELICS!=='undefined'&&RELICS[rid])||{}, v=this._relicVisual(rid), meta=owned&&this._relicMeta?this._relicMeta(rid):null;
    const t=typeInfo[v.type]||typeInfo.ball;
    return {id:rid,name:R.name||this._relicBaseName(v.type,v.idx),type:v.type,idx:v.idx%7,cls:R.cls||'core',core:t.label,desc:R.desc||baseDesc,tier:meta?meta.tier:0,q:meta?meta.q:0,affixes:meta&&meta.affixes?meta.affixes:[]};
  };

  const prevFullPreload=Game.prototype._hbFullPreloadImages;
  Game.prototype._hbFullPreloadImages=function(){
    const base=prevFullPreload?prevFullPreload.call(this):[];
    const add=[];
    for(let i=1;i<=5;i++){ add.push(mobUrl('/assets/mob/speed/act'+i+'.png')); add.push(mobUrl('/assets/mob/bosses/act'+i+'.png')); }
    for(let act=1;act<=5;act++) for(let i=0;i<6;i++) add.push('/assets/mob/standard/act'+act+'/enemy_'+i+'.png?v=20260629_bean_mobs_v1');
    for(const id of Object.keys(endlessMeta)) add.push(endlessMeta[id].s);
    for(const b of endlessBosses) add.push(b[2]);
    for(const name of ['icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png']) add.push(this._hbRelicUiUrl?this._hbRelicUiUrl(name):('/assets/relic_ui/'+name));
    const seen={}, out=[];
    for(const src of base.concat(add)){ if(src&&!seen[src]){ seen[src]=1; out.push(src); } }
    return out;
  };
})();

// === final activation v11: endless stage banners do not inherit act names ===
(function(){
  if(typeof Game==='undefined') return;
  const prevEnterStage=Game.prototype.enterStage;
  Game.prototype.enterStage=function(pi){
    const out=prevEnterStage.apply(this,arguments);
    const run=this.run;
    if(run&&run.endless&&run.stage){
      this._primeEndlessRun&&this._primeEndlessRun(run);
      const depth=run.endlessDepth||1;
      const biome=run.endlessBiomeName||'無盡深淵';
      if(run.stage.boss){
        run.banner={text:run.stage.name,sub:'第 '+depth+' 層 · '+(run.stage.endlessTag||'Boss 降臨'),t:2.2};
      }else{
        run.banner={text:biome,sub:'第 '+depth+' 層 · 集滿進度召喚 Boss',t:2.2};
      }
    }
    return out;
  };
})();

// === final activation v13: endless sprites, affixes, leaderboards, and daily shot detail ===
(function(){
  if(typeof Game==='undefined') return;

  const MIN_DAILY_SHOTS=10;
  const ENDLESS_ENEMIES={
    crack_runner:{name:'裂縫跑位者',src:'/assets/endless/enemies/crack_runner.png',color:'#9fe024',scale:1.18},
    screen_idol:{name:'擋拆石像',src:'/assets/endless/enemies/screen_idol.png',color:'#d7a945',scale:1.34},
    iron_whistle:{name:'鐵哨裁判',src:'/assets/endless/enemies/iron_whistle.png',color:'#ffe14d',scale:1.12},
    oil_monk:{name:'黏油球僧',src:'/assets/endless/enemies/oil_monk.png',color:'#6fbe30',scale:1.24},
    mist_librarian:{name:'霧線司書',src:'/assets/endless/enemies/mist_librarian.png',color:'#b980ff',scale:1.18},
    cold_rim_guard:{name:'寒框守衛',src:'/assets/endless/enemies/cold_rim_guard.png',color:'#6fd8ff',scale:1.25},
    war_drum_leader:{name:'戰鼓看台長',src:'/assets/endless/enemies/war_drum_leader.png',color:'#ffb34d',scale:1.25},
    shattered_board_collector:{name:'碎板收債人',src:'/assets/endless/enemies/shattered_board_collector.png',color:'#d8ff44',scale:1.20}
  };
  const ENEMY_BY_BIOME={
    rift:{chain:'crack_runner',bat:'mist_librarian',zombie:'oil_monk',drummer:'war_drum_leader',shield:'screen_idol',eye:'iron_whistle',frost:'cold_rim_guard'},
    iron:{shield:'screen_idol',chain:'iron_whistle',drummer:'war_drum_leader',zombie:'oil_monk',bat:'crack_runner',eye:'shattered_board_collector',frost:'cold_rim_guard'},
    cold:{frost:'cold_rim_guard',eye:'mist_librarian',bat:'mist_librarian',zombie:'oil_monk',chain:'crack_runner',shield:'screen_idol',drummer:'war_drum_leader'},
    thunder:{drummer:'war_drum_leader',chain:'shattered_board_collector',eye:'iron_whistle',frost:'cold_rim_guard',shield:'screen_idol',zombie:'oil_monk',bat:'mist_librarian'},
    finale:{shield:'screen_idol',chain:'crack_runner',drummer:'war_drum_leader',frost:'cold_rim_guard',eye:'shattered_board_collector',zombie:'oil_monk',bat:'mist_librarian'}
  };
  const AFFIXES=[
    {id:'crown',name:'深淵冠冕',short:'冠',color:'#ffe14d'},
    {id:'mirror',name:'鏡框',short:'鏡',color:'#8fe8ff'},
    {id:'countdown',name:'倒數',short:'倒',color:'#ff6a4a'},
    {id:'lockrim',name:'鎖框',short:'鎖',color:'#d8ff44'},
    {id:'greed',name:'貪分',short:'貪',color:'#c89bff'}
  ];
  const BOSS_SPRITES=[
    {max:5,key:'free_throw_executioner',src:'/assets/endless/bosses/free_throw_executioner.png'},
    {max:10,key:'broken_rim_stitcher',src:'/assets/endless/bosses/broken_rim_stitcher.png'},
    {max:15,key:'coldflame_scorekeeper',src:'/assets/endless/bosses/coldflame_scorekeeper.png'},
    {max:20,key:'thunderbone_announcer',src:'/assets/endless/bosses/thunderbone_announcer.png'},
    {max:9999,key:'abyss_hoop_lord',src:'/assets/endless/bosses/abyss_hoop_lord.png'}
  ];

  const pad2=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
  const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
  const pct=n=>Math.max(0,Math.min(100,Math.round((Number(n)||0)*100)));
  const clone=v=>{ try{return JSON.parse(JSON.stringify(v));}catch(e){return v;} };
  const dayCountdown=()=>{
    const now=new Date(), next=new Date(now);
    next.setHours(24,0,0,0);
    const total=Math.floor(Math.max(0,next-now)/1000);
    return pad2(total/3600)+':'+pad2((total%3600)/60)+':'+pad2(total%60);
  };
  const snapSave=row=>{
    const p=row&&row.profile_json;
    if(!p||typeof p!=='object') return {};
    return p.save&&typeof p.save==='object'?p.save:p;
  };
  const snapProfile=row=>{
    const p=row&&row.profile_json;
    if(!p||typeof p!=='object') return {};
    return p.profile&&typeof p.profile==='object'?p.profile:{};
  };
  const profileDayTotals=(profile,key)=>{
    const hd=profile&&profile.heroDay;
    const out={shots:0,makes:0,swishes:0,banks:0,luckies:0};
    if(!hd||hd.key!==key||!hd.stats) return out;
    for(const id of Object.keys(hd.stats)){
      const d=hd.stats[id]||{};
      out.shots+=Math.max(0,Number(d.shots)||0);
      out.makes+=Math.max(0,Number(d.makes)||0);
      out.swishes+=Math.max(0,Number(d.swishes)||0);
      out.banks+=Math.max(0,Number(d.banks)||0);
      out.luckies+=Math.max(0,Number(d.luckies)||0);
    }
    out.makes=Math.min(out.makes,out.shots);
    return out;
  };
  const stripOptionalStats=payload=>{
    const out=Object.assign({},payload||{});
    for(const k of ['today_swishes','today_banks','today_luckies','endless_best','endless_best_score','endless_best_bosses']) delete out[k];
    return out;
  };

  const prevPlayerDayTotals=Game.prototype._playerDayTotals;
  Game.prototype._playerDayTotals=function(){
    const p=this._loadProfile ? this._loadProfile() : null;
    const k=this._dayKey ? this._dayKey() : '';
    const base=prevPlayerDayTotals?prevPlayerDayTotals.call(this):{key:k,shots:0,makes:0};
    const out={key:base.key||k,shots:base.shots||0,makes:base.makes||0,swishes:0,banks:0,luckies:0};
    if(!p||!p.heroDay||p.heroDay.key!==out.key) return out;
    const stats=p.heroDay.stats||{};
    for(const id of Object.keys(stats)){
      const d=stats[id]||{};
      out.swishes+=Math.max(0,Number(d.swishes)||0);
      out.banks+=Math.max(0,Number(d.banks)||0);
      out.luckies+=Math.max(0,Number(d.luckies)||0);
    }
    return out;
  };

  const prevRecordShot=Game.prototype._recordShot;
  Game.prototype._recordShot=function(id,made,type){
    const before=this._playerDayTotals?this._playerDayTotals():null;
    const out=prevRecordShot?prevRecordShot.apply(this,arguments):undefined;
    if(!this.save||this.save.admin||!made) return out;
    const after=this._playerDayTotals?this._playerDayTotals():null;
    if(!after||!before||after.shots===before.shots) return out;
    const d=this._heroDay?this._heroDay(id):null;
    if(d){
      if(type==='swish') d.swishes=(d.swishes||0)+1;
      else if(type==='bank') d.banks=(d.banks||0)+1;
      else if(type==='lucky') d.luckies=(d.luckies||0)+1;
    }
    if(type==='lucky'&&this._heroProg){
      const h=this._heroProg(id);
      h.luckies=(h.luckies||0)+1;
    }
    this._saveProfile&&this._saveProfile();
    this._syncLeaderboardStats&&this._syncLeaderboardStats(false);
    return out;
  };

  const prevProgressSubset=Game.prototype._progressSaveSubset;
  Game.prototype._progressSaveSubset=function(){
    const out=prevProgressSubset?prevProgressSubset.call(this):{};
    const s=this.save||{};
    for(const k of ['endlessBestScore','endlessBestBosses','endlessBestKills','endlessBestCombo']) out[k]=clone(s[k]);
    return out;
  };

  const prevApplyCloud=Game.prototype._applyCloudProgressSnapshot;
  Game.prototype._applyCloudProgressSnapshot=function(remote){
    const changed0=prevApplyCloud?prevApplyCloud.call(this,remote):false;
    const rs=remote&&remote.save&&typeof remote.save==='object'?remote.save:null;
    let changed=!!changed0;
    if(rs&&this.save){
      for(const k of ['endlessBestScore','endlessBestBosses','endlessBestKills','endlessBestCombo']){
        if(rs[k]!=null){
          const nv=Math.max(Number(this.save[k])||0,Number(rs[k])||0);
          if(nv!==(Number(this.save[k])||0)){ this.save[k]=nv; changed=true; }
        }
      }
      if(changed) persist(this.save);
    }
    return changed;
  };

  const prevWriteCloud=Game.prototype._writeCloudAccount;
  Game.prototype._writeCloudAccount=async function(name,code,payload){
    if(!prevWriteCloud) return {ok:false,reason:'no-writer'};
    try{
      return await prevWriteCloud.call(this,name,code,payload);
    }catch(e){
      const msg=String((e&&(e.message||e))||'');
      if(/today_swishes|today_banks|today_luckies|endless_best/i.test(msg)){
        return await prevWriteCloud.call(this,name,code,stripOptionalStats(payload));
      }
      throw e;
    }
  };

  Game.prototype._dailyLeaderboardRow=function(row){
    if(!row) return null;
    const name=String(row.player_name||row.name||'').trim();
    if(!name) return null;
    const key=this._dayKey?this._dayKey():'';
    const profileTotals=profileDayTotals(snapProfile(row),key);
    const shots=Math.max(0,Number(row.today_shots!=null?row.today_shots:row.shots)||profileTotals.shots||0);
    const makes=clamp(Number(row.today_makes!=null?row.today_makes:row.makes)||profileTotals.makes||0,0,shots);
    const swishes=Math.max(0,Number(row.today_swishes)||profileTotals.swishes||0);
    const banks=Math.max(0,Number(row.today_banks)||profileTotals.banks||0);
    const luckies=Math.max(0,Number(row.today_luckies)||profileTotals.luckies||0);
    return {
      name,shots,makes,swishes,banks,luckies,local:!!row._local,
      updated:row.last_login_at||row.profile_updated_at||row.updated_at||'',
      qualified:shots>=MIN_DAILY_SHOTS,
      acc:shots?makes/shots:0,
      score:this._fairAccScore?this._fairAccScore(makes,shots):(shots?makes/shots:0)
    };
  };

  Game.prototype._leaderboardLocalRow=function(){
    const t=this._playerDayTotals?this._playerDayTotals():{key:this._dayKey?this._dayKey():'',shots:0,makes:0,swishes:0,banks:0,luckies:0};
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()||'本機玩家');
    return {player_name:name,today_key:t.key,today_shots:t.shots,today_makes:t.makes,today_swishes:t.swishes||0,today_banks:t.banks||0,today_luckies:t.luckies||0,profile_json:this._progressSnapshot?this._progressSnapshot():null,_local:true};
  };

  Game.prototype._normalLeaderboardRow=function(row){
    return this._dailyLeaderboardRow(row);
  };

  Game.prototype._leaderboardRows=function(){
    const rows=[];
    const add=row=>{
      const r=this._dailyLeaderboardRow(row);
      if(!r) return;
      const key=r.name.toLowerCase();
      const i=rows.findIndex(x=>x.name.toLowerCase()===key);
      if(i<0) rows.push(r);
      else {
        const cur=rows[i];
        const better=r.local||r.shots>cur.shots||(r.shots===cur.shots&&r.makes>cur.makes);
        if(better) rows[i]=Object.assign(cur,r,{local:cur.local||r.local});
      }
    };
    const cache=Array.isArray(this._leaderboardCache)?this._leaderboardCache:[];
    for(const r of cache) add(r);
    add(this._leaderboardLocalRow());
    rows.sort((a,b)=>{
      if(a.qualified!==b.qualified) return a.qualified?-1:1;
      if(b.score!==a.score) return b.score-a.score;
      if(b.makes!==a.makes) return b.makes-a.makes;
      if(b.swishes!==a.swishes) return b.swishes-a.swishes;
      if(b.luckies!==a.luckies) return b.luckies-a.luckies;
      if(b.shots!==a.shots) return b.shots-a.shots;
      return a.name.localeCompare(b.name,'zh-Hant');
    });
    let rank=1;
    for(const r of rows) r.rank=r.qualified?rank++:'觀察';
    return rows.slice(0,50);
  };

  Game.prototype._endlessLocalRow=function(){
    const L=this.save&&this.save.login?this.save.login:{};
    return {
      name:String((L.name||'').trim()||'本機玩家'),
      depth:Math.max(0,Number(this.save&&this.save.endlessBest)||0),
      score:Math.max(0,Number(this.save&&this.save.endlessBestScore)||0),
      bosses:Math.max(0,Number(this.save&&this.save.endlessBestBosses)||0),
      kills:Math.max(0,Number(this.save&&this.save.endlessBestKills)||0),
      combo:Math.max(0,Number(this.save&&this.save.endlessBestCombo)||0),
      local:true
    };
  };

  Game.prototype._endlessLeaderboardRow=function(row){
    if(!row) return null;
    const name=String(row.player_name||row.name||'').trim();
    if(!name) return null;
    const s=snapSave(row);
    const depth=Math.max(0,Number(row.endless_best)||Number(s.endlessBest)||0);
    const score=Math.max(0,Number(row.endless_best_score)||Number(s.endlessBestScore)||Number(s.stats&&s.stats.bestScore)||0);
    const bosses=Math.max(0,Number(row.endless_best_bosses)||Number(s.endlessBestBosses)||0);
    const kills=Math.max(0,Number(s.endlessBestKills)||0);
    const combo=Math.max(0,Number(s.endlessBestCombo)||Number(s.stats&&s.stats.bestCombo)||0);
    if(depth<=0&&!row._local) return null;
    return {name,depth,score,bosses,kills,combo,local:!!row._local,updated:row.last_login_at||row.profile_updated_at||''};
  };

  Game.prototype._endlessLeaderboardRows=function(){
    const rows=[];
    const add=row=>{
      const r=this._endlessLeaderboardRow(row);
      if(!r) return;
      const key=r.name.toLowerCase();
      const i=rows.findIndex(x=>x.name.toLowerCase()===key);
      if(i<0) rows.push(r);
      else {
        const cur=rows[i];
        if(r.local||r.depth>cur.depth||(r.depth===cur.depth&&r.score>cur.score)) rows[i]=Object.assign(cur,r,{local:cur.local||r.local});
      }
    };
    const cache=Array.isArray(this._leaderboardCache)?this._leaderboardCache:[];
    for(const r of cache) add(r);
    const local=this._endlessLocalRow();
    add(Object.assign({},local,{player_name:local.name,_local:true,profile_json:this._progressSnapshot?this._progressSnapshot():null}));
    rows.sort((a,b)=>{
      if(b.depth!==a.depth) return b.depth-a.depth;
      if(b.score!==a.score) return b.score-a.score;
      if(b.bosses!==a.bosses) return b.bosses-a.bosses;
      return a.name.localeCompare(b.name,'zh-Hant');
    });
    let rank=1;
    for(const r of rows) r.rank=r.depth>0?rank++:'觀察';
    return rows.slice(0,50);
  };

  Game.prototype._openLeaderboard=function(mode){
    this._leaderboardMode=mode==='endless'?'endless':'daily';
    this._leaderboardOpen=true;
    this._leaderboardLoading=true;
    this._leaderboardStatus='載入雲端排行榜...';
    this._syncLeaderboardStats&&this._syncLeaderboardStats(true);
    this._fetchLeaderboard&&this._fetchLeaderboard();
    this.render&&this.render();
  };

  Game.prototype._syncLeaderboardNow=async function(){
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()), code=String((L.code||'').trim());
    if(!name||!this._writeCloudAccount) return false;
    const t=this._playerDayTotals?this._playerDayTotals():{key:this._dayKey&&this._dayKey(),shots:0,makes:0};
    const snap=this._progressSnapshot?this._progressSnapshot():null;
    const payload={
      today_key:t.key,
      today_shots:t.shots,
      today_makes:t.makes,
      profile_json:snap,
      profile_updated_at:snap&&snap.updatedAt
    };
    await this._writeCloudAccount(name,code,payload);
    return true;
  };

  Game.prototype._fetchLeaderboard=async function(){
    const cfg=this._supabaseCfg ? this._supabaseCfg() : {};
    if(!cfg.url||!cfg.key){
      this._leaderboardLoading=false;
      this._leaderboardStatus='目前顯示本機成績';
      this.render&&this.render();
      return;
    }
    const base=cfg.url.replace(/\/+$/,'')+'/rest/v1/'+encodeURIComponent(cfg.table||'player_accounts');
    const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key};
    try{
      const select='player_name,today_key,today_shots,today_makes,last_login_at,profile_json,profile_updated_at';
      const q='?select='+encodeURIComponent(select)+'&order=last_login_at.desc&limit=150';
      const res=await fetch(base+q,{headers});
      if(!res.ok) throw new Error(await res.text());
      this._leaderboardCache=await res.json();
      this._leaderboardStatus=(this._leaderboardCache&&this._leaderboardCache.length)?'雲端排行榜已更新':'目前沒有雲端成績';
    }catch(e){
      try{
        const q='?select=player_name,today_key,today_shots,today_makes,last_login_at&today_key=eq.'+encodeURIComponent(this._dayKey&&this._dayKey())+'&order=today_shots.desc&limit=100';
        const res=await fetch(base+q,{headers});
        if(!res.ok) throw new Error(await res.text());
        this._leaderboardCache=await res.json();
        this._leaderboardStatus='雲端排行榜已更新（基本欄位）';
      }catch(e2){
        this._leaderboardCache=[];
        this._leaderboardStatus='雲端排行榜讀取失敗，先顯示本機成績';
        try{ console.warn('[HB leaderboard]',e,e2); }catch(_e){}
      }
    }finally{
      this._leaderboardLoading=false;
      this.render&&this.render();
    }
  };

  Game.prototype._hbLeaderTab=function(x,y,w,h,label,active,cb){
    const ctx=this.ctx;
    this.rr(x,y,w,h,12);
    const g=ctx.createLinearGradient(0,y,0,y+h);
    if(active){ g.addColorStop(0,'#d8ff44'); g.addColorStop(1,'#6b9d16'); }
    else { g.addColorStop(0,'rgba(39,28,18,0.96)'); g.addColorStop(1,'rgba(10,7,8,0.98)'); }
    ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=2.2; ctx.strokeStyle=active?'#ffe7a6':'rgba(215,169,69,0.44)';
    this.rr(x,y,w,h,12); ctx.stroke();
    this.text(label,x+w/2,y+h/2,24,active?'#111706':'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
    this.btn(x,y,w,h,'lb_tab_'+label,cb);
  };

  Game.prototype.drawLeaderboardModal=function(){
    const ctx=this.ctx;
    const IL=this.insL||0,IR=this.insR||0,IT=this.insT||0,IB=this.insB||0;
    const mode=this._leaderboardMode==='endless'?'endless':'daily';
    ctx.save();
    ctx.fillStyle='rgba(3,1,7,0.94)';
    ctx.fillRect(-4000,-4000,BW+8000,BH+8000);
    ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'leaderboard_scrim',()=>{});

    const x=IL+32,y=IT+20,w=BW-IL-IR-64,h=BH-IT-IB-42;
    this.rr(x,y,w,h,22);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(24,16,11,0.98)');
    bg.addColorStop(0.5,'rgba(9,7,10,0.99)');
    bg.addColorStop(1,'rgba(5,4,8,0.99)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22); ctx.stroke();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(185,255,47,0.34)'; this.rr(x+12,y+12,w-24,h-24,16); ctx.stroke();

    const title=mode==='endless'?'無盡深淵排行榜':'今日命中排行榜';
    this.text(title,x+w/2,y+52,44,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:14});
    const sub=mode==='endless'?'依最高層數排序；同層比最佳分數，再比 Boss 擊破數':'每日重置倒數 '+dayCountdown()+' · 空心與幸運球會列入今日命中分項';
    this.text(sub,x+w/2,y+91,22,mode==='endless'?'#c8b894':'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    this._hbLeaderTab(x+44,y+28,150,52,'今日命中',mode==='daily',()=>{this._leaderboardMode='daily';this.render();});
    this._hbLeaderTab(x+206,y+28,150,52,'無盡深淵',mode==='endless',()=>{this._leaderboardMode='endless';this.render();});
    this._hbDrawLeaderButton(x+w-158,y+28,116,52,'關閉','leaderboard_close',()=>this._closeLeaderboard(),false);
    this._hbDrawLeaderButton(x+w-292,y+28,116,52,'刷新','leaderboard_refresh',()=>{
      this._leaderboardLoading=true;
      this._leaderboardStatus='重新整理...';
      this._fetchLeaderboard&&this._fetchLeaderboard();
      this.render();
    },true);

    const tx=x+44,ty=y+134,tw=w-88,headerH=54,rowH=Math.max(72,Math.min(84,Math.floor((h-246)/7)));
    this.rr(tx,ty,tw,headerH,12);
    ctx.fillStyle='rgba(215,169,69,0.13)'; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(215,169,69,0.38)'; this.rr(tx,ty,tw,headerH,12); ctx.stroke();

    if(mode==='endless'){
      const cols={rank:tx+72,name:tx+190,depth:tx+tw*0.56,score:tx+tw*0.72,boss:tx+tw*0.86,kills:tx+tw-70};
      this.text('名次',cols.rank,ty+headerH/2,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('投手',cols.name,ty+headerH/2,24,'#d7a945',{baseline:'middle',weight:'900'});
      this.text('最高層',cols.depth,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('分數',cols.score,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('Boss',cols.boss,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('擊殺',cols.kills,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      const rows=this._endlessLeaderboardRows?this._endlessLeaderboardRows():[];
      const maxRows=Math.max(4,Math.floor((y+h-ty-headerH-72)/rowH));
      for(let i=0;i<Math.min(rows.length,maxRows);i++){
        const r=rows[i], ry=ty+headerH+10+i*rowH, mid=ry+(rowH-8)/2;
        this.rr(tx,ry,tw,rowH-8,12);
        ctx.fillStyle=r.local?'rgba(159,224,36,0.18)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.16)');
        ctx.fill();
        ctx.lineWidth=r.local?2.2:1.2;
        ctx.strokeStyle=r.local?'rgba(185,255,47,0.58)':'rgba(215,169,69,0.20)';
        this.rr(tx,ry,tw,rowH-8,12); ctx.stroke();
        const badgeW=110,badgeH=rowH-28,badgeX=tx+18,badgeY=ry+10;
        this.rr(badgeX,badgeY,badgeW,badgeH,14);
        ctx.fillStyle='rgba(215,169,69,0.16)'; ctx.fill();
        ctx.lineWidth=1.8; ctx.strokeStyle='rgba(255,231,166,0.48)'; this.rr(badgeX,badgeY,badgeW,badgeH,14); ctx.stroke();
        this.text(String(r.rank||'觀察'),badgeX+badgeW/2,mid,30,'#ffe7a6',{align:'center',baseline:'middle',weight:'900'});
        const name=(r.local?'你 · ':'')+String(r.name||'未命名投手');
        this.text(this._clip?this._clip(name,cols.depth-cols.name-36,28,'900'):name,cols.name,mid-10,28,r.local?'#d8ff44':'#efe3ca',{baseline:'middle',weight:'900'});
        this.text(r.depth>=25?'深層循環':'第 '+(r.depth||0)+' 層',cols.name,mid+21,16,r.depth>=25?'#c89bff':'#9e9178',{baseline:'middle',weight:'800'});
        this.text(String(r.depth||0),cols.depth,mid,32,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(r.score||0),cols.score,mid,27,'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(r.bosses||0),cols.boss,mid,27,'#e6c068',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(r.kills||0),cols.kills,mid,27,'#b8ad96',{align:'center',baseline:'middle',weight:'900'});
      }
      if(!rows.length) this.text('還沒有無盡紀錄',x+w/2,y+h/2+18,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }else{
      const cols={rank:tx+72,name:tx+194,shot:tx+tw*0.56,special:tx+tw*0.72,acc:tx+tw*0.86,score:tx+tw-70};
      this.text('名次',cols.rank,ty+headerH/2,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('投手',cols.name,ty+headerH/2,24,'#d7a945',{baseline:'middle',weight:'900'});
      this.text('出手 / 命中',cols.shot,ty+headerH/2,23,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('空心 / 幸運',cols.special,ty+headerH/2,23,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('命中率',cols.acc,ty+headerH/2,23,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('穩定',cols.score,ty+headerH/2,23,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      const rows=this._leaderboardRows?this._leaderboardRows():[];
      const maxRows=Math.max(4,Math.floor((y+h-ty-headerH-72)/rowH));
      for(let i=0;i<Math.min(rows.length,maxRows);i++){
        const r=rows[i], ry=ty+headerH+10+i*rowH, mid=ry+(rowH-8)/2;
        const shots=Math.max(0,Number(r.shots)||0), makes=Math.max(0,Number(r.makes)||0);
        const qualified=!!r.qualified, need=Math.max(0,MIN_DAILY_SHOTS-shots);
        this.rr(tx,ry,tw,rowH-8,12);
        ctx.fillStyle=r.local?'rgba(159,224,36,0.18)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.16)');
        ctx.fill();
        ctx.lineWidth=r.local?2.2:1.2;
        ctx.strokeStyle=r.local?'rgba(185,255,47,0.58)':'rgba(215,169,69,0.20)';
        this.rr(tx,ry,tw,rowH-8,12); ctx.stroke();
        const badgeW=110,badgeH=rowH-28,badgeX=tx+18,badgeY=ry+10;
        this.rr(badgeX,badgeY,badgeW,badgeH,14);
        ctx.fillStyle=qualified?'rgba(215,169,69,0.16)':'rgba(159,224,36,0.15)';
        ctx.fill();
        ctx.lineWidth=1.8; ctx.strokeStyle=qualified?'rgba(255,231,166,0.48)':'rgba(159,224,36,0.58)'; this.rr(badgeX,badgeY,badgeW,badgeH,14); ctx.stroke();
        this.text(qualified?String(r.rank):'觀察',badgeX+badgeW/2,mid-(qualified?0:9),qualified?30:24,qualified?'#ffe7a6':'#9fe024',{align:'center',baseline:'middle',weight:'900'});
        if(!qualified) this.text('差 '+need+' 球',badgeX+badgeW/2,mid+18,15,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
        const name=(r.local?'你 · ':'')+String(r.name||'未命名投手');
        this.text(this._clip?this._clip(name,cols.shot-cols.name-36,28,'900'):name,cols.name,mid-10,28,r.local?'#d8ff44':'#efe3ca',{baseline:'middle',weight:'900'});
        this.text(qualified?'已入榜 · 樣本 '+shots+' 球':'未滿 '+MIN_DAILY_SHOTS+' 球先觀察',cols.name,mid+21,16,qualified?'#a99a7a':'#9fe024',{baseline:'middle',weight:'800'});
        this.text(shots+' / '+makes,cols.shot,mid-5,27,'#efe3ca',{align:'center',baseline:'middle',weight:'900'});
        this.text('出手 / 命中',cols.shot,mid+22,15,'#8f8068',{align:'center',baseline:'middle',weight:'800'});
        this.text((r.swishes||0)+' / '+(r.luckies||0),cols.special,mid-5,27,'#ffe7a6',{align:'center',baseline:'middle',weight:'900'});
        this.text('空心 / 幸運',cols.special,mid+22,15,'#8f8068',{align:'center',baseline:'middle',weight:'800'});
        this.text(shots?Math.round((r.acc||0)*100)+'%':'0%',cols.acc,mid,29,qualified?'#ece0c4':'#b6aa90',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(pct(r.score!=null?r.score:r.acc)),cols.score,mid,28,qualified?'#ffe7a6':'#9e9178',{align:'center',baseline:'middle',weight:'900'});
      }
      if(!rows.length) this.text('今天還沒有命中紀錄',x+w/2,y+h/2+18,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }
    const status=this._leaderboardLoading?'載入中...':(this._leaderboardStatus||'');
    this.text(status,x+w/2,y+h-34,21,'#9e9178',{align:'center',baseline:'middle',weight:'800'});
  };

  Game.prototype._drawFbStatCards=function(LO){
    const U=LO.U,s=this.save||{},total=this._playerDayTotals?this._playerDayTotals():{shots:0,makes:0,swishes:0,luckies:0};
    const acc=total.shots?Math.round(total.makes/total.shots*100):0;
    this._gothCard(LO.statL,U);
    this._statIcon('target',LO.statL.x+18*U,LO.statL.y+LO.statL.h*0.62,7*U);
    this.text('今日命中', LO.statL.x+14*U, LO.statL.y+16*U, 11*U,'#a2926e');
    this.text(acc+'%', LO.statL.x+32*U, LO.statL.y+LO.statL.h*0.56, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this.text((total.shots||0)+' / '+(total.makes||0), LO.statL.x+LO.statL.w-16*U, LO.statL.y+LO.statL.h*0.54, 10*U,'#9fe024',{align:'right',baseline:'middle',weight:'800'});
    this.text('空 '+(total.swishes||0)+'  幸 '+(total.luckies||0), LO.statL.x+LO.statL.w-16*U, LO.statL.y+LO.statL.h*0.75, 9*U,'#c8b894',{align:'right',baseline:'middle',weight:'800'});
    this.text('排行榜 ›', LO.statL.x+LO.statL.w-14*U, LO.statL.y+18*U, 9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
    this.btn(LO.statL.x,LO.statL.y,LO.statL.w,Math.max(44*U,LO.statL.h),'fb_leaderboard_daily',()=>this._openLeaderboard&&this._openLeaderboard('daily'));

    this._gothCard(LO.statR,U);
    this._statIcon('crown',LO.statR.x+18*U,LO.statR.y+LO.statR.h*0.62,7*U);
    this.text('無盡最佳', LO.statR.x+14*U, LO.statR.y+16*U, 11*U,'#a2926e');
    this.text(String(s.endlessBest|0), LO.statR.x+32*U, LO.statR.y+LO.statR.h*0.56, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this.text('Boss '+(s.endlessBestBosses|0), LO.statR.x+LO.statR.w-16*U, LO.statR.y+LO.statR.h*0.54, 10*U,'#e6c068',{align:'right',baseline:'middle',weight:'800'});
    this.text('排行榜 ›', LO.statR.x+LO.statR.w-14*U, LO.statR.y+18*U, 9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
    this.btn(LO.statR.x,LO.statR.y,LO.statR.w,Math.max(44*U,LO.statR.h),'fb_leaderboard_endless',()=>this._openLeaderboard&&this._openLeaderboard('endless'));
  };

  Game.prototype._endlessEnemyInfo=function(g){
    if(!g) return ENDLESS_ENEMIES.crack_runner;
    return ENDLESS_ENEMIES[g.endlessEnemyId||'crack_runner']||ENDLESS_ENEMIES.crack_runner;
  };

  Game.prototype._endlessBossSprite=function(depth){
    depth=Math.max(1,Number(depth)||1);
    for(const b of BOSS_SPRITES) if(depth<=b.max) return b;
    return BOSS_SPRITES[BOSS_SPRITES.length-1];
  };

  const prevSpawnGuard=Game.prototype.spawnGuard;
  Game.prototype.spawnGuard=function(type){
    const g=prevSpawnGuard.apply(this,arguments);
    const run=this.run;
    if(!g||!run||!run.endless||g.sandbag) return g;
    const biome=run.endlessBiome||((this._endlessBiome&&this._endlessBiome(run.endlessDepth||1).id)||'rift');
    const map=ENEMY_BY_BIOME[biome]||ENEMY_BY_BIOME.rift;
    const id=map[type]||map.chain||'crack_runner';
    const info=ENDLESS_ENEMIES[id]||ENDLESS_ENEMIES.crack_runner;
    g.endlessEnemyId=id;
    g.endlessName=info.name;
    g.endlessSprite=info.src;
    g.endlessColor=info.color;
    g.drawScale=(g.drawScale||1)*(info.scale||1);
    const depth=Math.max(1,Number(run.endlessDepth)||1);
    const greed=Number(run.endlessGreedStacks)||0;
    if(greed>0){
      const mul=1+Math.min(0.45,greed*0.08);
      g.maxhp=Math.ceil((g.maxhp||g.hp||1)*mul);
      g.hp=Math.ceil((g.hp||g.maxhp)*mul);
    }
    if(id==='screen_idol') g.shieldUp=true;
    if(id==='iron_whistle') g.endlessMissTax=true;
    if(id==='cold_rim_guard') g.endlessFreezeHoop=true;
    if(id==='shattered_board_collector') g.endlessDebt=true;
    const affixChance=Math.min(0.56,0.12+Math.max(0,depth-4)*0.018+(g.elite?0.22:0));
    if(!g.endlessAffix&&Math.random()<affixChance){
      const aff=AFFIXES[Math.floor(Math.random()*AFFIXES.length)];
      g.endlessAffix=aff.id;
      g.endlessAffixName=aff.name;
      g.endlessAffixShort=aff.short;
      g.endlessAffixColor=aff.color;
      if(aff.id==='crown'){
        g.elite=true;
        g.maxhp=Math.ceil((g.maxhp||g.hp||1)*1.65);
        g.hp=Math.ceil((g.hp||g.maxhp)*1.65);
        g.r=(g.r||24)*1.08;
      }else if(aff.id==='mirror'){
        g.endlessMirror=1;
      }else if(aff.id==='countdown'){
        g.endlessCountdown=Math.max(7,15-Math.floor(depth/5));
      }else if(aff.id==='lockrim'){
        g.endlessLocksHoop=true;
      }else if(aff.id==='greed'){
        g.endlessGreed=true;
      }
    }
    return g;
  };

  const prevDrawGuard=Game.prototype.drawEndlessGuard;
  Game.prototype.drawEndlessGuard=function(g){
    const run=this.run;
    if(run&&run.stage&&run.stage.boss) return;
    const info=this._endlessEnemyInfo(g);
    const im=this._endlessImg?this._endlessImg('enemy_'+(g.endlessEnemyId||'crack_runner'),info.src):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return prevDrawGuard?prevDrawGuard.call(this,g):undefined;
    const ctx=this.ctx, base=g.r||28, bob=Math.sin((this.t||0)*2.4+(g.slot||0))*4;
    const scale=(g.drawScale||1)*(g.elite?1.08:1);
    let H=base*3.15*scale,W=H*im.naturalWidth/im.naturalHeight;
    const maxW=base*4.25*scale;
    if(W>maxW){ W=maxW; H=W*im.naturalHeight/im.naturalWidth; }
    const x=-W/2,y=bob+base*1.04-H;
    ctx.save();
    ctx.translate(g.x,g.y);
    ctx.globalAlpha=g.phased?0.48:1;
    this.shadow(0,base*0.92,base*1.1,0.25);
    const glow=ctx.createRadialGradient(0,bob-base*0.45,4,0,bob-base*0.45,base*2.6);
    glow.addColorStop(0,g.endlessAffix?'rgba(255,225,77,0.22)':'rgba(155,255,50,0.18)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.arc(0,bob-base*0.4,base*2.35,0,TAU);
    ctx.fill();
    ctx.drawImage(im,x,y,W,H);
    if(g.flash>0){
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(0.62,g.flash*0.7);
      ctx.drawImage(im,x,y,W,H);
      ctx.globalCompositeOperation='source-over';
      ctx.globalAlpha=1;
    }
    if(g.shieldUp){
      ctx.lineWidth=4;
      ctx.strokeStyle='rgba(215,169,69,0.88)';
      ctx.beginPath();
      ctx.ellipse(0,bob-base*0.45,W*0.48,H*0.45,0,0,TAU);
      ctx.stroke();
    }
    if(g.endlessAffix){
      const col=g.endlessAffixColor||'#ffe14d';
      ctx.save();
      ctx.translate(0,y-18);
      this.rr(-24,-16,48,32,10);
      ctx.fillStyle='rgba(9,6,5,0.88)';
      ctx.fill();
      ctx.lineWidth=2.4;
      ctx.strokeStyle=col;
      ctx.stroke();
      this.text(g.endlessAffixShort||'菁',0,2,20,col,{align:'center',baseline:'middle',weight:'900',glow:8});
      ctx.restore();
      if(g.endlessCountdown>0) this.text(Math.ceil(g.endlessCountdown),0,y+22,18,'#ff6a4a',{align:'center',baseline:'middle',weight:'900'});
    }
    ctx.restore();
    this.drawGuardTags&&this.drawGuardTags(g);
  };

  Game.prototype.drawEndlessBossArt=function(){
    const ctx=this.ctx,run=this.run;
    const boss=this._endlessBossSprite(run&&run.endlessDepth);
    const im=this._endlessImg?this._endlessImg('boss_'+boss.key,boss.src):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const nw=im.naturalWidth,nh=im.naturalHeight;
    let H=BH*0.72,W=H*nw/nh;
    const maxW=BW*0.62;
    if(W>maxW){ W=maxW; H=W*nh/nw; }
    const cx=BW*0.67,by=BH-18;
    ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,30,cx,by-H*0.48,W*0.66);
    glow.addColorStop(0,'rgba(160,255,48,0.22)');
    glow.addColorStop(0.58,'rgba(100,255,36,0.08)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.ellipse(cx,by-H*0.45,W*0.6,H*0.52,0,0,TAU);
    ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.42);
    sh.addColorStop(0,'rgba(0,0,0,0.58)');
    sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh;
    ctx.beginPath();
    ctx.ellipse(cx,by-8,W*0.42,H*0.08,0,0,TAU);
    ctx.fill();
    let lp=0;
    if(run&&run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(clamp(tt,0,1)*Math.PI); }
    if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.05,1+lp*0.05); ctx.translate(-cx-lp*54,-by); }
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run&&run._mobHitFlash>0){
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(0.45,run._mobHitFlash*0.65);
      ctx.drawImage(im,cx-W/2,by-H,W,H);
    }
    ctx.restore();
  };

  const prevHurtGuard=Game.prototype.hurtGuard;
  Game.prototype.hurtGuard=function(g,dmg,c,primary){
    const run=this.run;
    if(run&&run.endless&&g&&!g.dead){
      if(g.endlessMirror>0){
        g.endlessMirror=0;
        g.flash=1;
        this.floater(g.x,g.y-(g.r||24)-24,'鏡框反彈','#8fe8ff',22,{crit:true});
        this.shockFx&&this.shockFx(g.x,g.y,'#8fe8ff',220,0.34);
        this.audio&&this.audio.sfx&&this.audio.sfx('rim');
        return;
      }
      if(g.endlessFreezeHoop&&run.hoop){
        run.endlessHoopFreeze=Math.max(run.endlessHoopFreeze||0,1.05);
        this.floater(run.hoop.x,run.hoop.y-96,'寒框鎖定','#6fd8ff',20);
      }
      if(g.endlessLocksHoop&&run.hoop) run.endlessHoopLock=Math.max(run.endlessHoopLock||0,1.25);
    }
    return prevHurtGuard.apply(this,arguments);
  };

  const prevKillGuard=Game.prototype.killGuard;
  Game.prototype.killGuard=function(g){
    const run=this.run, wasDead=!!(g&&g.dead);
    const r=prevKillGuard.apply(this,arguments);
    if(run&&run.endless&&g&&!wasDead&&g.dead&&!g.sandbag){
      if(g.endlessAffix==='crown'&&!run.stage.boss) this._endlessAddProgress&&this._endlessAddProgress(12);
      if(g.endlessGreed){
        run.endlessGreedStacks=(run.endlessGreedStacks||0)+1;
        if(!run.stage.boss) this._endlessAddProgress&&this._endlessAddProgress(8);
        this.floater(g.x,g.y-(g.r||24)-26,'貪分 +難度','#c89bff',22,{crit:true});
      }
      if(g.endlessDebt){
        run.endlessDebtShots=Math.max(run.endlessDebtShots||0,1);
        this.floater(g.x,g.y-(g.r||24)-26,'碎板債','#ffb34d',22);
      }
    }
    return r;
  };

  const prevEndShot=Game.prototype.endShot;
  Game.prototype.endShot=function(scored){
    const run=this.run;
    const missTax=run&&run.endless&&!scored&&run.guards&&run.guards.some(g=>!g.dead&&g.endlessMissTax);
    const debt=run&&run.endless&&!scored&&run.endlessDebtShots>0;
    const r=prevEndShot.apply(this,arguments);
    if(run&&run.endless&&!scored){
      if(missTax){
        this.playerHurt&&this.playerHurt(4+Math.floor((run.endlessDepth||1)/5));
        this.floater(BW/2,BH*0.30,'鐵哨加罰','#ffe14d',26,{crit:true});
      }
      if(debt){
        run.endlessDebtShots=Math.max(0,(run.endlessDebtShots||0)-1);
        this.playerHurt&&this.playerHurt(5+Math.floor((run.endlessDepth||1)/4));
        this.floater(BW/2,BH*0.36,'碎板債討回','#ff6a4a',26,{crit:true});
      }
    }
    return r;
  };

  const prevPickHoop=Game.prototype.pickHoopPos;
  Game.prototype.pickHoopPos=function(force){
    const run=this.run;
    if(run&&run.endless&&run.hoop&&(run.endlessHoopLock>0||run.endlessHoopFreeze>0)){
      run.repos=0;
      if(run.host){ run.host.tx=run.host.x; run.host.ty=run.host.y; }
      run.hoop.tx=run.hoop.x; run.hoop.ty=run.hoop.y;
      return;
    }
    return prevPickHoop.apply(this,arguments);
  };

  const prevUpdateBattle=Game.prototype.updateBattle;
  Game.prototype.updateBattle=function(dt){
    const r=prevUpdateBattle.apply(this,arguments);
    const run=this.run;
    if(run&&run.endless&&!run.modal){
      if(run.endlessHoopLock>0) run.endlessHoopLock=Math.max(0,run.endlessHoopLock-dt);
      if(run.endlessHoopFreeze>0) run.endlessHoopFreeze=Math.max(0,run.endlessHoopFreeze-dt);
      for(const g of (run.guards||[])){
        if(!g||g.dead) continue;
        if(g.endlessCountdown>0){
          g.endlessCountdown-=dt;
          if(g.endlessCountdown<=0&&!g._endlessCountdownFired){
            g._endlessCountdownFired=true;
            if(run.stage&&run.stage.boss) run.endlessBossTime=Math.max(0,(run.endlessBossTime||0)-8);
            else run.endlessProgress=Math.max(0,(run.endlessProgress||0)-10);
            this.floater(g.x,g.y-(g.r||24)-26,'倒數懲罰','#ff6a4a',22,{crit:true});
            this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
          }
        }
      }
      if(run.stage&&run.stage.boss&&run.guards&&run.guards.some(g=>!g.dead&&g.endlessEnemyId==='war_drum_leader')){
        run.endlessBossTime=Math.max(0,(run.endlessBossTime||0)-dt*0.18);
      }
    }
    return r;
  };

  Game.prototype._recordEndlessCheckpoint=function(run){
    if(!run||!run.endless||!this.save||this.save.admin) return;
    const depth=Math.max(1,Number(run.endlessDepth)||1);
    const bosses=Math.max(Number(this.save.endlessBestBosses)||0,Number(run.endlessBosses||0)+(run.stage&&run.stage.boss?1:0));
    this.save.endless=true;
    this.save.endlessBest=Math.max(Number(this.save.endlessBest)||0,depth);
    this.save.endlessBestScore=Math.max(Number(this.save.endlessBestScore)||0,Number(run.score)||0);
    this.save.endlessBestKills=Math.max(Number(this.save.endlessBestKills)||0,Number(run.kills)||0);
    this.save.endlessBestCombo=Math.max(Number(this.save.endlessBestCombo)||0,Number(run.bestCombo)||0);
    this.save.endlessBestBosses=bosses;
    persist(this.save);
    this._scheduleCloudProgressSync&&this._scheduleCloudProgressSync(false);
  };

  const prevEndlessAdvance=Game.prototype._endlessAdvanceDepth;
  Game.prototype._endlessAdvanceDepth=function(){
    if(this.run&&this.run.endless) this._recordEndlessCheckpoint(this.run);
    return prevEndlessAdvance.apply(this,arguments);
  };

  const prevFinishEndless=Game.prototype.finishEndlessRun;
  Game.prototype.finishEndlessRun=function(won){
    if(this.run&&this.run.endless) this._recordEndlessCheckpoint(this.run);
    return prevFinishEndless.apply(this,arguments);
  };
})();

// === final activation v9: endless depth biomes and loop ===
(function(){
  if(typeof Game==='undefined') return;

  const ENDLESS_BIOMES=[
    {id:'rift',min:1,max:5,name:'裂縫球場',bg:'/assets/endless/endless_cracked_court.png',guards:['chain','bat','zombie','drummer'],count:12,waves:3},
    {id:'iron',min:6,max:10,name:'腐鐵看台',bg:'/assets/endless/bg_iron_cage_stands.png',guards:['shield','chain','drummer','zombie'],count:15,waves:3},
    {id:'cold',min:11,max:15,name:'冷焰禁區',bg:'/assets/endless/bg_coldflame_zone.png',guards:['frost','eye','bat','zombie'],count:17,waves:4},
    {id:'thunder',min:16,max:20,name:'雷骨穹頂',bg:'/assets/endless/bg_thunderbone_dome.png',guards:['drummer','chain','eye','frost'],count:19,waves:4},
    {id:'finale',min:21,max:9999,name:'終焉深籃堂',bg:'/assets/endless/bg_final_abyss_cathedral.png',guards:['shield','chain','drummer','frost','eye','zombie'],count:22,waves:4}
  ];
  const ENDLESS_BOSSES=[
    {depth:5,name:'罰球線執刑官',guards:['chain','bat','zombie'],count:20,waves:3,tag:'節奏門檻'},
    {depth:10,name:'破框縫合師',guards:['shield','chain','drummer'],count:24,waves:4,tag:'護盾擋拆'},
    {depth:15,name:'冷焰記分官',guards:['frost','eye','bat'],count:26,waves:4,tag:'冰霧短軌'},
    {depth:20,name:'雷骨播報王',guards:['drummer','chain','eye','frost'],count:28,waves:4,tag:'規則亂流'},
    {depth:25,name:'深淵籃君',guards:['shield','drummer','frost','eye','chain'],count:32,waves:5,tag:'終焉混成'}
  ];
  const DEEP_AFFIXES=['冷焰','戰鼓','鎖框','鏡框','貪分','深淵冠冕'];
  const cloneStage=(stage,extra)=>{
    const out=Object.assign({},stage||{},extra||{});
    out.guards=Array.isArray(out.guards)?out.guards.slice():['chain','bat'];
    return out;
  };

  Game.prototype._endlessBiome=function(depth){
    depth=Math.max(1,Number(depth)||1);
    return ENDLESS_BIOMES.find(b=>depth>=b.min&&depth<=b.max)||ENDLESS_BIOMES[0];
  };

  Game.prototype._endlessBossDef=function(depth){
    depth=Math.max(1,Number(depth)||1);
    const fixed=ENDLESS_BOSSES.find(b=>b.depth===depth);
    if(fixed) return fixed;
    if(depth>25){
      const base=ENDLESS_BOSSES[(Math.floor((depth-26)/5))%ENDLESS_BOSSES.length];
      const aff=DEEP_AFFIXES[Math.floor(depth/5)%DEEP_AFFIXES.length];
      const extra=Math.min(20,Math.floor((depth-21)/2));
      return Object.assign({},base,{name:base.name+' · '+aff,count:base.count+extra,waves:Math.min(6,base.waves+1),tag:aff});
    }
    return {depth,name:'深淵守衛',guards:null,count:null,waves:null,tag:'層間試煉'};
  };

  const oldEndlessPath=Game.prototype._endlessPath;
  Game.prototype._endlessPath=function(){
    const run=this.run||{};
    const depth=Math.max(1,run.endlessDepth||1);
    const biome=this._endlessBiome(depth);
    const bossDef=this._endlessBossDef(depth);
    const scale=1+Math.min(1.35,(depth-1)*0.055);
    const base=(typeof STAGES!=='undefined'&&STAGES[1]&&STAGES[1][0])||{};
    const bossSrc=(typeof STAGES!=='undefined'&&STAGES[1]&&(STAGES[1][4]||STAGES[1][0]))||base;
    const normal=cloneStage(base,{
      name:biome.name+' · 第 '+depth+' 層',
      host:'深淵記分員',
      body:'shade',
      guards:biome.guards,
      count:Math.round((biome.count||12)*scale),
      boss:false,
      tier:2+Math.min(4,Math.floor(depth/5)),
      tut:false
    });
    const isMilestone=depth%5===0||depth>25;
    const boss=cloneStage(bossSrc,{
      name:(isMilestone?bossDef.name:('深淵守衛 · '+biome.name)),
      host:(isMilestone?bossDef.name:'深淵守衛'),
      body:'worldking',
      guards:bossDef.guards||biome.guards,
      count:Math.round((bossDef.count||biome.count||18)*scale),
      boss:true,
      waves:bossDef.waves||biome.waves||3,
      tier:3+Math.min(5,Math.floor(depth/5)),
      endlessTag:bossDef.tag||biome.name,
      endlessMilestone:isMilestone
    });
    return [normal,boss];
  };

  const oldPrimeEndless=Game.prototype._primeEndlessRun;
  Game.prototype._primeEndlessRun=function(run){
    oldPrimeEndless&&oldPrimeEndless.call(this,run);
    if(!run||!run.endless) return;
    const biome=this._endlessBiome(run.endlessDepth||1);
    run.endlessBiome=biome.id;
    run.endlessBiomeName=biome.name;
    run.endlessProgressMax=100+Math.min(80,Math.floor(((run.endlessDepth||1)-1)/2)*10);
  };

  const oldEnsureBattleBg=Game.prototype._ensureBattleBg;
  Game.prototype._ensureBattleBg=function(act){
    if(this.run&&this.run.endless){
      const biome=this._endlessBiome(this.run.endlessDepth||1);
      return this._endlessImg('bg_'+biome.id,biome.bg);
    }
    return oldEnsureBattleBg.call(this,act);
  };

  Game.prototype._endlessAdvanceDepth=function(){
    const run=this.run;
    if(!run||!run.endless||run._stageClearing) return;
    run._stageClearing=true;
    const depth=run.endlessDepth||1;
    const fastClear=!run.endlessTimedOut;
    const jump=(fastClear&&depth%5===0)?2:1;
    const nextDepth=depth+jump;
    run.endlessBosses=(run.endlessBosses||0)+1;
    if(this.save&&!this.save.admin){
      this.save.endless=true;
      this.save.endlessBest=Math.max(this.save.endlessBest||0,nextDepth);
      persist(this.save);
    }
    run.banner={text:fastClear?'深淵突破':'深淵推進',sub:'進入第 '+nextDepth+' 層'+(jump>1?' · 限時擊破跳層':''),t:2.1};
    setTimeout(()=>{
      if(this.run!==run) return;
      run._stageClearing=false;
      run.endlessDepth=nextDepth;
      run.endlessProgress=0;
      run.endlessTimedOut=false;
      run.endlessBossActive=false;
      run.endlessBossTimeMax=Math.max(90,180-Math.min(70,Math.floor((nextDepth-1)/5)*12));
      run.endlessBossTime=run.endlessBossTimeMax;
      run.path=this._endlessPath();
      this._primeEndlessRun(run);
      this.enterStage(0);
      this._primeEndlessRun(this.run);
      if(this.run) this.run.banner={text:this.run.endlessBiomeName||'無盡深淵',sub:'第 '+nextDepth+' 層 · 集滿進度召喚 Boss',t:2.2};
    },820);
  };

  const oldEndlessStageClear=Game.prototype.onStageClear;
  Game.prototype.onStageClear=function(){
    const run=this.run;
    if(run&&run.endless){
      if(run._stageClearing) return;
      if(run.stage&&!run.stage.boss) return this._endlessSummonBoss();
      if(run.stage&&run.stage.boss){
        if(run.spawned<run.guardsTotal) return oldEndlessStageClear.apply(this,arguments);
        return this._endlessAdvanceDepth();
      }
    }
    return oldEndlessStageClear.apply(this,arguments);
  };
})();

// === final activation: branded loading splash wins last ===
(function(){
  if(typeof Game==='undefined') return;
  const LOADING_SPLASH='/assets/ui/loading_splash_hoopbreaker.png?v=20260628_loading_splash_v1';

  Game.prototype._ensureLoadingSplash=function(){
    if(this._loadingSplash!==undefined) return this._loadingSplash;
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._assetLoading&&this.render) this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=LOADING_SPLASH;
      this._loadingSplash=im;
    }catch(e){ this._loadingSplash=null; }
    return this._loadingSplash;
  };

  const oldPreloadEntryAssets=Game.prototype._preloadEntryAssets;
  Game.prototype._preloadEntryAssets=async function(){
    const st=this._assetLoading||{};
    try{
      if(this._preloadImage){
        st.label='載入入口畫面';
        st.detail='Hoopbreaker';
        st.progress=Math.max(st.progress||0,0.03);
        this.render&&this.render();
        await this._preloadImage(LOADING_SPLASH);
      }
      this._ensureLoadingSplash&&this._ensureLoadingSplash();
    }catch(e){ try{console.warn('[HB loading splash]',e);}catch(_e){} }
    if(oldPreloadEntryAssets) return oldPreloadEntryAssets.call(this);
  };

  Game.prototype._drawLoadingOverlay=function(){
    const st=this._assetLoading;
    if(!st||!st.active) return;
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;
    const p=Math.max(0,Math.min(1,st.progress||0));
    const rr=(x,y,w,h,r)=>{
      r=Math.max(0,Math.min(r,w/2,h/2));
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.lineTo(x+w-r,y);
      ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);
      ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);
      ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);
      ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    };
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#070407';
    ctx.fillRect(0,0,w,h);

    const img=this._ensureLoadingSplash&&this._ensureLoadingSplash();
    if(img&&img.complete&&img.naturalWidth&&!img._err){
      const iw=img.naturalWidth, ih=img.naturalHeight;
      const sc=Math.max(w/iw,h/ih);
      const dw=iw*sc, dh=ih*sc;
      ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
    }else{
      const g=ctx.createRadialGradient(w*0.5,h*0.42,10,w*0.5,h*0.42,Math.max(w,h)*0.68);
      g.addColorStop(0,'#2a1c10');
      g.addColorStop(0.58,'#0b0710');
      g.addColorStop(1,'#030205');
      ctx.fillStyle=g;
      ctx.fillRect(0,0,w,h);
    }

    const shadeH=Math.max(110,h*0.24);
    const shade=ctx.createLinearGradient(0,h-shadeH,0,h);
    shade.addColorStop(0,'rgba(0,0,0,0)');
    shade.addColorStop(0.52,'rgba(0,0,0,0.52)');
    shade.addColorStop(1,'rgba(0,0,0,0.88)');
    ctx.fillStyle=shade;
    ctx.fillRect(0,h-shadeH,w,shadeH);

    const bw=Math.min(w*0.64,760);
    const bh=Math.max(14,Math.min(24,h*0.022));
    const bottomPad=Math.max(34,h*0.058);
    const x=w/2-bw/2;
    const y=h-bottomPad-bh;
    const r=bh/2;

    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.font='800 '+Math.max(13,Math.min(20,w*0.014))+'px "Microsoft JhengHei","PingFang TC",sans-serif';
    ctx.shadowBlur=8;
    ctx.shadowColor='rgba(0,0,0,0.9)';
    ctx.fillStyle='rgba(250,236,196,0.88)';
    ctx.fillText((st.label||'載入資源')+'  '+Math.round(p*100)+'%',w/2,y-14);
    ctx.shadowBlur=0;

    rr(x,y,bw,bh,r);
    ctx.fillStyle='rgba(8,5,5,0.84)';
    ctx.fill();
    ctx.lineWidth=Math.max(2,bh*0.14);
    ctx.strokeStyle='rgba(220,140,54,0.76)';
    ctx.stroke();

    const fillW=Math.max(bh,bw*p);
    rr(x,y,fillW,bh,r);
    const fill=ctx.createLinearGradient(x,0,x+bw,0);
    fill.addColorStop(0,'#5d8b10');
    fill.addColorStop(0.48,'#bfff2d');
    fill.addColorStop(1,'#fff0a2');
    ctx.fillStyle=fill;
    ctx.shadowBlur=16;
    ctx.shadowColor='rgba(177,255,40,0.68)';
    ctx.fill();
    ctx.shadowBlur=0;

    ctx.globalAlpha=0.46;
    ctx.fillStyle='#fff6c2';
    ctx.fillRect(x+Math.min(fillW,bw)*0.78,y+2,Math.min(80,fillW*0.18),Math.max(2,bh*0.16));
    ctx.globalAlpha=1;
    ctx.restore();
  };
})();

// === final activation: branded loading splash ===
(function(){
  if(typeof Game==='undefined') return;
  const LOADING_SPLASH='/assets/ui/loading_splash_hoopbreaker.png?v=20260628_loading_splash_v1';

  Game.prototype._ensureLoadingSplash=function(){
    if(this._loadingSplash!==undefined) return this._loadingSplash;
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._assetLoading&&this.render) this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=LOADING_SPLASH;
      this._loadingSplash=im;
    }catch(e){ this._loadingSplash=null; }
    return this._loadingSplash;
  };

  const oldPreloadEntryAssets=Game.prototype._preloadEntryAssets;
  Game.prototype._preloadEntryAssets=async function(){
    const st=this._assetLoading||{};
    try{
      if(this._preloadImage){
        st.label='載入入口畫面';
        st.detail='Hoopbreaker';
        st.progress=Math.max(st.progress||0,0.03);
        this.render&&this.render();
        await this._preloadImage(LOADING_SPLASH);
      }
      this._ensureLoadingSplash&&this._ensureLoadingSplash();
    }catch(e){ try{console.warn('[HB loading splash]',e);}catch(_e){} }
    if(oldPreloadEntryAssets) return oldPreloadEntryAssets.call(this);
  };

  Game.prototype._drawLoadingOverlay=function(){
    const st=this._assetLoading;
    if(!st||!st.active) return;
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;
    const p=Math.max(0,Math.min(1,st.progress||0));
    const rr=(x,y,w,h,r)=>{
      r=Math.max(0,Math.min(r,w/2,h/2));
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.lineTo(x+w-r,y);
      ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);
      ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);
      ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);
      ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    };
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#070407';
    ctx.fillRect(0,0,w,h);

    const img=this._ensureLoadingSplash&&this._ensureLoadingSplash();
    if(img&&img.complete&&img.naturalWidth&&!img._err){
      const iw=img.naturalWidth, ih=img.naturalHeight;
      const sc=Math.max(w/iw,h/ih);
      const dw=iw*sc, dh=ih*sc;
      ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
    }else{
      const g=ctx.createRadialGradient(w*0.5,h*0.42,10,w*0.5,h*0.42,Math.max(w,h)*0.68);
      g.addColorStop(0,'#2a1c10');
      g.addColorStop(0.58,'#0b0710');
      g.addColorStop(1,'#030205');
      ctx.fillStyle=g;
      ctx.fillRect(0,0,w,h);
    }

    const shadeH=Math.max(110,h*0.24);
    const shade=ctx.createLinearGradient(0,h-shadeH,0,h);
    shade.addColorStop(0,'rgba(0,0,0,0)');
    shade.addColorStop(0.52,'rgba(0,0,0,0.52)');
    shade.addColorStop(1,'rgba(0,0,0,0.88)');
    ctx.fillStyle=shade;
    ctx.fillRect(0,h-shadeH,w,shadeH);

    const bw=Math.min(w*0.64,760);
    const bh=Math.max(14,Math.min(24,h*0.022));
    const bottomPad=Math.max(34,h*0.058);
    const x=w/2-bw/2;
    const y=h-bottomPad-bh;
    const r=bh/2;

    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.font='800 '+Math.max(13,Math.min(20,w*0.014))+'px "Microsoft JhengHei","PingFang TC",sans-serif';
    ctx.shadowBlur=8;
    ctx.shadowColor='rgba(0,0,0,0.9)';
    ctx.fillStyle='rgba(250,236,196,0.88)';
    ctx.fillText((st.label||'載入資源')+'  '+Math.round(p*100)+'%',w/2,y-14);
    ctx.shadowBlur=0;

    rr(x,y,bw,bh,r);
    ctx.fillStyle='rgba(8,5,5,0.84)';
    ctx.fill();
    ctx.lineWidth=Math.max(2,bh*0.14);
    ctx.strokeStyle='rgba(220,140,54,0.76)';
    ctx.stroke();

    const fillW=Math.max(bh,bw*p);
    rr(x,y,fillW,bh,r);
    const fill=ctx.createLinearGradient(x,0,x+bw,0);
    fill.addColorStop(0,'#5d8b10');
    fill.addColorStop(0.48,'#bfff2d');
    fill.addColorStop(1,'#fff0a2');
    ctx.fillStyle=fill;
    ctx.shadowBlur=16;
    ctx.shadowColor='rgba(177,255,40,0.68)';
    ctx.fill();
    ctx.shadowBlur=0;

    ctx.globalAlpha=0.46;
    ctx.fillStyle='#fff6c2';
    ctx.fillRect(x+Math.min(fillW,bw)*0.78,y+2,Math.min(80,fillW*0.18),Math.max(2,bh*0.16));
    ctx.globalAlpha=1;
    ctx.restore();
  };
})();

// === final activation: generated relic backpack UI wins over legacy backpack ===
(function(){
  const QUAL=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
  const RARITY=['普通','精良','稀有','史詩','傳說','詛咒傳說'];
  const TABS=['全部','核心','攻擊','防禦','特殊'];
  const state=Game.prototype;

  state._selectedEquipFor=function(item){
    const load=this.save.loadout||[null,null,null,null,null];
    if(item&&item.id&&load.includes(item.id)) return item.id;
    if(item){
      for(const id of load){
        if(!id) continue;
        const d=this._relicDisplay(id,true);
        if(d&&d.type===item.type) return id;
      }
    }
    if(load.includes(null)) return null;
    return load.find(Boolean)||null;
  };

  state._equipFromCompare=function(){
    const c=this._relicCompare; if(!c) return;
    const rid=c.rid, s=this.save; if(!s.loadout)s.loadout=[null,null,null,null,null];
    const have=s.loadout.indexOf(rid);
    if(have>=0){
      s.loadout[have]=null;
      persist(s);
      this._relicCompare=null;
      this.audio.sfx('ui');
      this.render();
      return;
    }
    const cur=c.current, curIdx=cur?s.loadout.indexOf(cur):-1;
    if(curIdx>=0) s.loadout[curIdx]=rid;
    else {
      const e=s.loadout.indexOf(null);
      if(e>=0) s.loadout[e]=rid;
      else s.loadout[0]=rid;
    }
    persist(s);
    this._relicCompare=null;
    this.audio.sfx('select');
    this.render();
  };

  state.drawRelics=function(){
    const ctx=this.ctx, s=this.save;
    if(!s.loadout)s.loadout=[null,null,null,null,null];
    if(!s.library)s.library=[];
    this.backdrop('hub');
    const bg=this._relicUiImg('backpack_bg.png');
    if(bg&&bg.complete&&bg.naturalWidth) ctx.drawImage(bg,0,0,BW,BH);
    else { ctx.fillStyle='#0b0710'; ctx.fillRect(0,0,BW,BH); }

    const safeL=this.insL||0,safeR=this.insR||0,safeT=this.insT||0,safeB=this.insB||0;
    this.text('聖物背包',safeL+58,safeT+62,48,'#ffe7a6',{weight:'900',glow:14});
    this.text('裝備 '+s.loadout.filter(Boolean).length+'/5  ·  庫存 '+s.library.length+'/40',safeL+260,safeT+64,24,'#c8b894',{baseline:'middle',weight:'900'});
    this.button(BW-safeR-132,safeT+32,82,58,'×','relic_back',()=>this.go('hub'),{size:36,color:'#f0c0b0'});

    const tab=this._relicTab||'全部';
    let tx=safeL+58,ty=safeT+104;
    for(const tb of TABS){
      const w=tb==='全部'?96:104;
      this.rr(tx,ty,w,42,12);
      ctx.fillStyle=tab===tb?'rgba(184,255,47,0.18)':'rgba(10,7,8,0.66)';
      ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle=tab===tb?'#bfff2f':'rgba(215,169,69,0.38)';
      ctx.stroke();
      this.text(tb,tx+w/2,ty+21,20,tab===tb?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      ((t,xx,ww)=>this.btn(xx,ty,ww,42,'relic_tab_'+t,()=>{this._relicTab=t;this.render();}))(tb,tx,w);
      tx+=w+12;
    }

    const eqY=safeT+160, eqX=safeL+315, eqW=214, eqH=138, gap=18;
    for(let i=0;i<5;i++){
      const rid=s.loadout[i], x=eqX+i*(eqW+gap);
      if(rid){
        const it=this._relicDisplay(rid,true);
        this._drawRelicCard(it,x,eqY,eqW,eqH,{equipped:true,selected:this._bagSel===rid});
        ((id,xx)=>this.btn(xx,eqY,eqW,eqH,'eq_'+i,()=>this._openRelicCompare(id)))(rid,x);
      } else {
        ctx.save();
        this.rr(x,eqY,eqW,eqH,14);
        ctx.fillStyle='rgba(8,6,8,0.68)';
        ctx.fill();
        ctx.setLineDash([8,8]);
        ctx.lineWidth=2;
        ctx.strokeStyle='rgba(215,169,69,0.34)';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this.text('+',x+eqW/2,eqY+eqH/2-8,52,'rgba(215,169,69,0.42)',{align:'center',baseline:'middle',weight:'700'});
        this.text('空槽',x+eqW/2,eqY+eqH/2+32,18,'rgba(200,190,170,0.45)',{align:'center',baseline:'middle',weight:'800'});
      }
    }

    const owned=[...new Set([...(s.loadout||[]).filter(Boolean),...(s.library||[])])]
      .filter(id=>RELICS[id])
      .map(id=>this._relicDisplay(id,true));
    let catalog=this._allRelicCatalog();
    if(tab!=='全部') catalog=catalog.filter(it=>it.tab===tab || (tab==='核心'&&it.type==='ball'));
    const ownedType=new Set(owned.map(it=>it.type+':'+it.idx));
    const locked=catalog.filter(it=>!ownedType.has(it.type+':'+it.idx));
    const gx=safeL+58, gy=safeT+330, cols=7, cellW=210, cellH=126, cg=14;
    const visible=owned.concat(locked).slice(0,28);
    for(let i=0;i<visible.length;i++){
      const it=visible[i], x=gx+(i%cols)*(cellW+cg), y=gy+((i/cols)|0)*(cellH+cg);
      const lockedItem=!!it.catalog;
      this._drawRelicCard(it,x,y,cellW,cellH,{compact:true,locked:lockedItem,selected:this._bagSel===it.id});
      if(!lockedItem) ((id,xx,yy)=>this.btn(xx,yy,cellW,cellH,'bag_'+id,()=>this._openRelicCompare(id)))(it.id,x,y);
    }

    const sel=(this._relicCompare&&this._relicCompare.rid)?this._relicDisplay(this._relicCompare.rid,true):(owned[0]||null);
    const py=BH-safeB-138, px=safeL+58, pw=BW-safeL-safeR-116, ph=104;
    this.rr(px,py,pw,ph,14);
    ctx.fillStyle='rgba(9,6,5,0.86)';
    ctx.fill();
    ctx.lineWidth=2;
    ctx.strokeStyle='rgba(215,169,69,0.46)';
    ctx.stroke();
    if(sel){
      this._drawRelicSheetIcon(sel.type,sel.idx,px+20,py+14,76,76,1);
      this.text(sel.name,px+116,py+38,30,QUAL[sel.tier]||'#e6c068',{weight:'900'});
      this.text((RARITY[sel.tier]||'普通')+' · '+sel.core+(sel.q?' · 強度 '+sel.q+'/50':''),px+116,py+70,20,'#c8b894',{weight:'800'});
      this.text(sel.desc?this._clip(sel.desc,pw-560,18,'700'):'尚未取得，通關與速投模式會逐步擴充收藏。',px+520,py+54,20,'#efe3ca',{baseline:'middle',weight:'700'});
    }
    if(this._relicCompare) this.drawRelicCompare();
  };

  state.drawRelicCompare=function(){
    const c=this._relicCompare; if(!c) return;
    const ctx=this.ctx, selected=this._relicDisplay(c.rid,true), current=c.current?this._relicDisplay(c.current,true):null;
    ctx.save();
    ctx.fillStyle='rgba(2,1,5,0.72)';
    ctx.fillRect(-4000,-4000,BW+8000,BH+8000);
    ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'cmp_scrim',()=>{});
    const im=this._relicUiImg('compare_modal.png'), w=1580,h=830,x=BW/2-w/2,y=BH/2-h/2+10;
    if(im&&im.complete&&im.naturalWidth) ctx.drawImage(im,x,y,w,h);
    else this.panel(x,y,w,h,{r:24,stroke:'#d7a945'});
    this.text('裝備比較',BW/2,y+64,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});

    const card=(it,rx,ry,rw,rh,title,col)=>{
      this.text(title,rx+rw/2,ry-26,28,col,{align:'center',baseline:'middle',weight:'900'});
      this.rr(rx,ry,rw,rh,18);
      ctx.fillStyle='rgba(5,4,8,0.54)';
      ctx.fill();
      ctx.lineWidth=3;
      ctx.strokeStyle=it?(QUAL[it.tier]||col):'rgba(160,150,130,0.35)';
      ctx.stroke();
      if(it){
        this._drawRelicSheetIcon(it.type,it.idx,rx+rw*0.14,ry+34,rw*0.72,rh*0.42,1);
        this.text(it.name,rx+rw/2,ry+rh*0.56,34,QUAL[it.tier]||'#e6c068',{align:'center',baseline:'middle',weight:'900'});
        this.text((RARITY[it.tier]||'普通')+' · '+it.core,rx+rw/2,ry+rh*0.64,22,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
        const af=(it.affixes||[]).slice(0,3);
        for(let i=0;i<3;i++){
          const yy=ry+rh*0.72+i*42;
          const txt=af[i]?('◆ '+af[i].label+' +'+(af[i].pct?Math.round(af[i].val*100)+'%':af[i].val)):(i===0?this._clip(it.desc,rw-90,19,'800'):'');
          if(txt)this.text(txt,rx+54,yy,21,'#efe3ca',{baseline:'middle',weight:'800'});
        }
      } else {
        this.text('空槽',rx+rw/2,ry+rh/2,34,'rgba(210,200,180,0.56)',{align:'center',baseline:'middle',weight:'900'});
      }
    };

    card(current,x+120,y+150,560,500,'裝備中','#bfff2f');
    card(selected,x+w-680,y+150,560,500,'選取聖物','#b980ff');
    this.text('VS',BW/2,y+390,54,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:10});
    const bw=300,bh=78,by=y+h-120;
    this.button(BW/2-bw-36,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
    this.button(BW/2+36,by,bw,bh,current&&current.id===selected.id?'卸下':'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:34,weight:'900'});
  };
  state._drawRelicsGenerated=state.drawRelics;
  state._drawRelicCompareGenerated=state.drawRelicCompare;
  state._selectedEquipForGenerated=state._selectedEquipFor;
  state._equipFromCompareGenerated=state._equipFromCompare;
})();
// === part 4 below ===
// ============================================================
// PART 4 — bean-art helpers, backdrop, character/guard/host art
// ============================================================
Object.assign(Game.prototype,{
  _rough(pts,fill,o){ const ctx=this.ctx; o=o||{}; let sd=o.seed||1; const wob=o.wob==null?2.2:o.wob; const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647-0.5;};
    const ps=pts.map(p=>[p[0]+rnd()*wob,p[1]+rnd()*wob]); ctx.beginPath(); for(let i=0;i<ps.length;i++){ const p=ps[i],n=ps[(i+1)%ps.length]; const mx=(p[0]+n[0])/2,my=(p[1]+n[1])/2; if(i===0)ctx.moveTo(mx,my); else ctx.quadraticCurveTo(p[0],p[1],mx,my);} ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();} if(o.stroke!==false){ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=o.lw||7;ctx.strokeStyle=o.sc||'#0e0d0c';ctx.stroke();} },
  _bean(x,y,w,h,fill,o){ const ctx=this.ctx; o=o||{}; ctx.save(); ctx.translate(x,y); ctx.rotate(o.rot||0); const lean=o.lean||0,pinch=o.pinch||0; ctx.beginPath();
    ctx.moveTo(-w*0.12+lean,-h*0.5); ctx.bezierCurveTo(w*0.33+lean,-h*0.57,w*0.55,-h*0.22,w*(0.46-pinch),h*0.17); ctx.bezierCurveTo(w*0.40,h*0.49,w*0.12,h*0.55,-w*0.11,h*0.5); ctx.bezierCurveTo(-w*0.45,h*0.48,-w*(0.52-pinch),h*0.12,-w*0.43,-h*0.18); ctx.bezierCurveTo(-w*0.37,-h*0.43,-w*0.18+lean,-h*0.49,-w*0.12+lean,-h*0.5); ctx.closePath();
    ctx.fillStyle=fill; ctx.fill(); ctx.lineWidth=o.lw||7; ctx.strokeStyle=o.sc||'#0e0d0c'; ctx.lineJoin='round'; ctx.stroke(); ctx.restore(); },
  _oval(x,y,rx,ry,fill,o){ const ctx=this.ctx; o=o||{}; ctx.save(); ctx.translate(x,y); ctx.rotate(o.rot||0); ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,TAU); if(fill){ctx.fillStyle=fill;ctx.fill();} if(o.stroke!==false){ctx.lineWidth=o.lw||7;ctx.strokeStyle=o.sc||'#0e0d0c';ctx.stroke();} ctx.restore(); },
  _cline(x1,y1,x2,y2,color,w,outline){ const ctx=this.ctx; ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round'; if(outline!==false){ctx.strokeStyle='#0e0d0c';ctx.lineWidth=w+7;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();} ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore(); },
  _cface(x,y,o){ const ctx=this.ctx; o=o||{}; const sep=o.sep||16; ctx.save(); ctx.translate(x,y); ctx.rotate(o.rot||0); ctx.fillStyle='#11100f';
    if(o.oneEye){ctx.beginPath();ctx.arc(0,0,o.er||3.5,0,TAU);ctx.fill();} else if(o.dead){ ctx.lineWidth=5;ctx.strokeStyle='#11100f';ctx.lineCap='round'; [[-sep/2,0],[sep/2,0]].forEach(([ex,ey])=>{ctx.beginPath();ctx.moveTo(ex-7,ey-7);ctx.lineTo(ex+7,ey+7);ctx.moveTo(ex+7,ey-7);ctx.lineTo(ex-7,ey+7);ctx.stroke();}); } else {ctx.beginPath();ctx.arc(-sep/2,0,o.er||3.5,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(sep/2,0,o.er||3.5,0,TAU);ctx.fill();}
    ctx.strokeStyle='#11100f';ctx.lineWidth=3.5;ctx.lineCap='round';ctx.beginPath(); const my=o.mouthY||17;
    if(o.mouth==='frown'){ctx.arc(0,my+8,8,Math.PI*1.12,Math.PI*1.88);} else if(o.mouth==='o'){ctx.ellipse(0,my,4,5,0,0,TAU);} else if(o.mouth==='smile'){ctx.arc(0,my-3,8,0.12*Math.PI,0.88*Math.PI);} else if(o.mouth==='none'){} else {ctx.moveTo(-6,my);ctx.quadraticCurveTo(0,my+2,6,my);}
    ctx.stroke(); ctx.restore(); },
  shadow(x,y,w,a){ const ctx=this.ctx; ctx.save(); ctx.globalAlpha=a||0.28; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(x,y,w,w*0.16,0,0,TAU); ctx.fill(); ctx.restore(); },
  cstar(r){ const ctx=this.ctx; ctx.beginPath(); for(let i=0;i<10;i++){ const a=i/10*TAU-Math.PI/2; const rr=i%2?r*0.45:r; ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);} ctx.closePath(); ctx.fill(); },
  _artStage(){ const sc=this.scale||Math.min((this.cw||BW)/BW,(this.ch||BH)/BH)||0.365;
    const baseW=852,baseH=393,ar=baseW/baseH,cw=this.cw||baseW,ch=this.ch||baseH;
    let cssW=cw,cssH=cssW/ar; if(cssH>ch){ cssH=ch; cssW=cssH*ar; }
    const cssX=(cw-cssW)/2,cssY=(ch-cssH)/2,U=(cssW/baseW)/sc;
    return {x:(cssX-(this.ox||0))/sc,y:(cssY-(this.oy||0))/sc,w:cssW/sc,h:cssH/sc,U,sc,cssX,cssY,cssW,cssH};
  },

  // ---- backdrop per act ----
  backdrop(actKey){ const ctx=this.ctx; const A=ACTS.find(a=>a.key===actKey)||ACTS[0];
    const ovx=Math.max(0,(this.ox||0)/(this.scale||1))+200, ovy=Math.max(0,(this.oy||0)/(this.scale||1))+200;
    const g=ctx.createLinearGradient(0,0,0,BH); g.addColorStop(0,A.sky[0]); g.addColorStop(1,A.sky[1]); ctx.fillStyle=g; ctx.fillRect(-ovx,-400-ovy,BW+2*ovx,BH+800+2*ovy);
    // moon
    ctx.save(); const mg=ctx.createRadialGradient(BW*0.8,150,20,BW*0.8,150,300); mg.addColorStop(0,'rgba(190,180,210,0.45)'); mg.addColorStop(1,'rgba(190,180,210,0)'); ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(BW*0.8,150,300,0,TAU); ctx.fill(); ctx.fillStyle='#cfc9dc'; ctx.beginPath(); ctx.arc(BW*0.8,150,58,0,TAU); ctx.fill(); ctx.restore();
    for(const s of this.stars){ const tw=0.5+0.5*Math.sin(this.t*2+s.tw); ctx.globalAlpha=s.a*tw*0.8; ctx.fillStyle=A.rune; ctx.beginPath(); ctx.arc(s.x,s.y*0.7,s.r,0,TAU); ctx.fill(); } ctx.globalAlpha=1;
    const fy=BH-90;
    // silhouettes per zone
    ctx.fillStyle='rgba(0,0,0,0.5)';
    if(actKey==='abbey'||actKey==='hub'){ for(const [tx,th] of [[120,360],[BW-220,330],[BW/2-380,300],[BW/2+260,320]]){ ctx.fillRect(tx,fy-th,120,th); for(let i=0;i<4;i++)ctx.fillRect(tx+i*32,fy-th-22,22,22); } ctx.fillRect(BW/2-320,fy-220,640,220); for(let i=0;i<15;i++)ctx.fillRect(BW/2-320+i*44,fy-242,30,26); }
    else if(actKey==='sand'){ for(let i=0;i<5;i++){ const x=i*440-100; ctx.beginPath(); ctx.moveTo(x,fy); ctx.quadraticCurveTo(x+220,fy-rand(180,320),x+440,fy); ctx.fill(); } }
    else if(actKey==='city'){ for(let i=0;i<7;i++){ const x=120+i*260,h=200+(i%3)*120; ctx.fillRect(x,fy-h,90,h); } }
    else if(actKey==='inferno'){ for(let i=0;i<6;i++){ const x=80+i*320; ctx.beginPath(); ctx.moveTo(x,fy); ctx.lineTo(x+90,fy-rand(260,420)); ctx.lineTo(x+200,fy); ctx.fill(); } }
    else { for(let i=0;i<6;i++){ const x=60+i*330; ctx.beginPath(); ctx.moveTo(x,fy); ctx.lineTo(x+110,fy-rand(320,520)); ctx.lineTo(x+260,fy); ctx.fill(); } }
    // ground
    const gg=ctx.createLinearGradient(0,fy,0,BH); gg.addColorStop(0,A.floor); gg.addColorStop(1,'#08060a'); ctx.fillStyle=gg; ctx.fillRect(-ovx,fy,BW+2*ovx,BH-fy+400+ovy);
    let sd=actKey.length*7; const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;}; ctx.fillStyle='rgba(0,0,0,0.32)'; for(let i=0;i<40;i++){ ctx.beginPath(); ctx.ellipse(rnd()*BW,fy+rnd()*(BH-fy),8+rnd()*34,3+rnd()*9,0,0,TAU); ctx.fill(); }
  },

  // ---- hero body: EXACT bean-proposal art (unchanged) ----
  _preloadHeroes(){ if(!this._heroImg) this._heroImg={}; if(!this._heroImgErr) this._heroImgErr={};
    try{ for(const hh of HEROES){ if(this._heroImg[hh.id]===undefined){ const im=new Image(); im.onerror=()=>{ this._heroImgErr[hh.id]=true; }; im.src='/hero_'+hh.id+'.png'; this._heroImg[hh.id]=im; } } }catch(e){} }
  ,drawHero(heroId, cx, by, sc){
    if(!this._heroImg) this._heroImg={}; if(!this._heroImgErr) this._heroImgErr={};
    let img=this._heroImg[heroId];
    if(img===undefined){ try{ img=new Image(); img.onerror=()=>{this._heroImgErr[heroId]=true;}; img.src='/hero_'+heroId+'.png'; }catch(e){ img=null; this._heroImgErr[heroId]=true; } this._heroImg[heroId]=img; }
    if(img && img.complete && img.naturalWidth>0){
      const ctx=this.ctx, t=this.t;
      const phase={shade:1.1,bone:2.2,archer:0.4,axer:0.8,whistle:3.1,elem:4.4,beast:5.5}[heroId]||0;
      const bob=Math.sin(t*1.55+phase)*2.6*sc/0.6;
      const H=246*sc, W=H*img.naturalWidth/img.naturalHeight;
      this.shadow(cx, by+4, Math.max(40,W*0.40));
      ctx.drawImage(img, cx-W/2, by-H+bob, W, H);
      return;
    }
    if(this._heroImgErr[heroId]){ const map={shade:'_hAssassin',bone:'_hNecro',archer:'_hAmazon',axer:'_hBarb',whistle:'_hPaladin',elem:'_hMage',beast:'_hDruid'}; const fn=map[heroId]||'_hMage'; this[fn](cx,by,sc); return; }
    this.shadow(cx, by+4, Math.max(40,120*sc));
  },
  _hAmazon(cx,by,s){ const ctx=this.ctx,t=this.t; ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.65+0.4)*2.2); this.shadow(0,5,78);
    this._rough([[-42,-168],[-86,-142],[-96,-72],[-80,-18],[-55,-65]],'#e8d94f',{seed:11,lw:6,wob:3});
    this._cline(-15,-38,-18,0,'#f0c799',18); this._cline(15,-38,18,0,'#f0c799',18);
    this._rough([[-42,-96],[42,-96],[60,-22],[-58,-22]],'#c9452f',{seed:12,lw:7,wob:3});
    this._bean(0,-142,74,126,'#f0c799',{lean:-5,pinch:0.05,lw:7});
    this._rough([[-38,-173],[-15,-203],[22,-198],[42,-164],[17,-176],[-15,-175]],'#e8d94f',{seed:13,lw:6,wob:2});
    this._oval(-55,-84,24,31,'#e0bc29',{lw:6}); this._cline(44,-114,66,-27,'#ddd5bd',5);
    ctx.fillStyle='#ddd5bd';ctx.beginPath();ctx.moveTo(64,-31);ctx.lineTo(75,-17);ctx.lineTo(60,-20);ctx.closePath();ctx.fill();ctx.strokeStyle='#0e0d0c';ctx.lineWidth=4;ctx.stroke();
    this._cface(2,-146,{sep:13,er:3,mouth:'frown',mouthY:17}); ctx.restore(); },
  _hAssassin(cx,by,s){ const ctx=this.ctx,t=this.t;ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.8+1.1)*2);this.shadow(0,5,72);
    this._cline(-18,-24,-20,0,'#d8d4ca',13);this._cline(18,-24,20,0,'#d8d4ca',13);
    this._rough([[-49,-143],[48,-143],[68,-30],[0,-8],[-68,-30]],'#17161b',{seed:21,lw:7,wob:3});
    this._rough([[-51,-137],[-27,-181],[16,-190],[51,-145],[30,-108],[-24,-108]],'#16151a',{seed:22,lw:7,wob:3});
    this._oval(1,-142,29,38,'#ddd7cb',{lw:6,rot:-0.12});
    ctx.fillStyle='#2b2830';ctx.beginPath();ctx.moveTo(-27,-148);ctx.lineTo(27,-169);ctx.lineTo(19,-111);ctx.closePath();ctx.fill();
    this._cline(-39,-94,-70,-74,'#d8d4ca',10);this._cline(39,-94,69,-72,'#d8d4ca',10);
    this._cline(-74,-77,-92,-91,'#cfd1d2',4);this._cline(73,-74,92,-91,'#cfd1d2',4);
    this._cface(-4,-141,{oneEye:true,er:3.2,mouth:'smile',mouthY:16,rot:-0.12});ctx.restore(); },
  _hNecro(cx,by,s){ const ctx=this.ctx,t=this.t;ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.5+2.2)*2.2);this.shadow(0,5,62);
    this._rough([[-24,-92],[24,-92],[36,-20],[19,2],[-20,2],[-35,-20]],'#29262c',{seed:31,lw:7,wob:2});
    ctx.fillStyle='#d8d2c6';ctx.fillRect(-25,-91,50,12);ctx.strokeStyle='#0e0d0c';ctx.lineWidth=5;ctx.strokeRect(-25,-91,50,12);
    ctx.fillStyle='#2d2a30';for(let i=-18;i<22;i+=13)ctx.fillRect(i,-91,6,12);
    this._rough([[-27,-218],[26,-218],[34,-116],[17,-91],[-17,-91],[-34,-116]],'#dfd9ca',{seed:32,lw:7,wob:3});
    this._cface(0,-154,{sep:15,er:2.8,mouth:'frown',mouthY:23});
    ctx.strokeStyle='#11100f';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(-11,-187);ctx.quadraticCurveTo(0,-194,12,-186);ctx.stroke();
    this._cline(31,-80,72,-111,'#8f7655',5);
    this._oval(74,-113,9,8,'#d9d2c5',{lw:4});ctx.fillStyle='#11100f';ctx.beginPath();ctx.arc(71,-114,2,0,TAU);ctx.arc(77,-114,2,0,TAU);ctx.fill(); ctx.restore(); },
  _hBarb(cx,by,s){ const ctx=this.ctx,t=this.t;ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.25+0.8)*1.7);this.shadow(0,7,126);
    this._cline(-39,-30,-43,2,'#c88f60',21);this._cline(38,-30,43,2,'#c88f60',21);
    this._bean(0,-118,210,230,'#e5b47f',{lean:9,pinch:-0.05,lw:8,rot:0.015});
    this._bean(-112,-99,60,150,'#e5b47f',{lean:-4,pinch:0.1,lw:8,rot:0.08});
    this._bean(112,-101,60,154,'#e5b47f',{lean:4,pinch:0.1,lw:8,rot:-0.08});
    ctx.save();ctx.rotate(-0.18);this._rough([[-23,-226],[22,-226],[55,-18],[10,-13]],'#d76718',{seed:42,lw:7,wob:2});ctx.restore();
    this._rough([[-47,-42],[47,-42],[58,-1],[-57,-1]],'#d76718',{seed:43,lw:7,wob:3});
    this._cface(4,-198,{sep:18,er:3.2,mouth:'frown',mouthY:18});
    ctx.strokeStyle='#25a4ce';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-22,-218);ctx.lineTo(-11,-194);ctx.stroke();
    this._cline(73,-181,96,-225,'#6f5238',8);
    ctx.fillStyle='#a6a4a0';ctx.beginPath();ctx.moveTo(91,-229);ctx.lineTo(113,-242);ctx.lineTo(105,-216);ctx.closePath();ctx.fill();ctx.strokeStyle='#0e0d0c';ctx.lineWidth=5;ctx.stroke(); ctx.restore(); },
  _hPaladin(cx,by,s){ const ctx=this.ctx,t=this.t;ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.55+3.1)*2);this.shadow(0,5,72);
    this._cline(-18,-45,-18,0,'#3d934d',20);this._cline(18,-45,18,0,'#3d934d',20);
    this._rough([[-42,-125],[41,-125],[50,-45],[35,-30],[-36,-30],[-50,-45]],'#aeb4b3',{seed:51,lw:7,wob:2});
    this._bean(0,-177,68,124,'#aa8058',{lean:2,pinch:0.08,lw:7});
    this._cface(0,-174,{sep:13,er:3,mouth:'none'});
    this._rough([[-51,-111],[-83,-96],[-78,-45],[-49,-28],[-24,-48],[-25,-91]],'#b6bec0',{seed:52,lw:7,wob:2});
    this._rough([[-55,-91],[-71,-82],[-68,-53],[-51,-43],[-39,-54],[-40,-80]],'#d6d9d7',{seed:53,lw:4,wob:1});
    this._cline(44,-95,79,-92,'#d9d5c8',4);this._rough([[76,-99],[101,-92],[77,-84]],'#d9d5c8',{seed:54,lw:4,wob:1}); ctx.restore(); },
  _hMage(cx,by,s){ const ctx=this.ctx,t=this.t;ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.75+4.4)*2.3);this.shadow(0,5,64);
    this._rough([[-35,-84],[35,-84],[47,-15],[21,2],[-20,2],[-46,-15]],'#3c954f',{seed:61,lw:7,wob:2});
    this._bean(0,-126,70,99,'#a97545',{lean:-2,pinch:0.08,lw:7});
    this._rough([[-35,-155],[-22,-183],[18,-181],[36,-153],[16,-159],[-16,-158]],'#e5c329',{seed:62,lw:6,wob:2});
    this._cface(1,-128,{sep:13,er:3,mouth:'frown',mouthY:17});
    this._cline(43,-105,61,-14,'#6f5133',7);
    ctx.save();ctx.shadowBlur=8;ctx.shadowColor='#7554d5';this._oval(42,-120,14,14,'#7650d8',{lw:5});ctx.restore(); ctx.restore(); },
  _hDruid(cx,by,s){ const ctx=this.ctx,t=this.t;ctx.save();ctx.translate(cx,by);ctx.scale(s,s); ctx.translate(0,Math.sin(t*1.42+5.5)*2);this.shadow(0,5,70);
    this._rough([[-42,-101],[41,-101],[55,-18],[24,2],[-23,2],[-55,-18]],'#c85e20',{seed:71,lw:7,wob:3});
    this._bean(0,-157,72,136,'#edbd89',{lean:8,pinch:0.11,lw:7});
    this._cface(5,-154,{sep:13,er:3,mouth:'none'});
    ctx.fillStyle='#11100f';ctx.beginPath();ctx.arc(-7,-124,2.2,0,TAU);ctx.arc(2,-122,2.2,0,TAU);ctx.arc(11,-124,2.2,0,TAU);ctx.fill();
    this._oval(39,-166,9,15,'#edbd89',{lw:5,rot:0.2});
    ctx.strokeStyle='#0e0d0c';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(14,-226);ctx.quadraticCurveTo(18,-244,33,-238);ctx.stroke();
    ctx.fillStyle='#d56b22';ctx.beginPath();ctx.ellipse(35,-240,8,4,-0.35,0,TAU);ctx.fill();ctx.strokeStyle='#0e0d0c';ctx.lineWidth=3;ctx.stroke();
    ctx.save();ctx.translate(-70,-16);this._oval(0,-22,25,19,'#e5dfd2',{lw:6});this._oval(19,-35,11,12,'#e5dfd2',{lw:5});
    ctx.fillStyle='#d96824';ctx.beginPath();ctx.moveTo(31,-36);ctx.lineTo(43,-31);ctx.lineTo(31,-28);ctx.closePath();ctx.fill();ctx.strokeStyle='#0e0d0c';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#11100f';ctx.beginPath();ctx.arc(22,-38,2.4,0,TAU);ctx.fill();
    this._cline(-10,-7,-13,2,'#d7a33c',3);this._cline(9,-7,7,2,'#d7a33c',3);ctx.restore(); ctx.restore(); },

  // ---- guard body ---- centered at 0,0
  drawGuard(g){ const ctx=this.ctx; const r=g.r,t=this.t,bob=Math.sin(g.wphase+t*3)*4; const def=GUARDS[g.type]; const body=def.body;
    ctx.save(); ctx.translate(g.x,g.y); const ph=g.phased?0.4:1; ctx.globalAlpha=ph; this.shadow(0,r*0.9,r*0.85,0.26*ph);
    if(g.frozen){ ctx.save(); ctx.globalAlpha=0.5*ph; ctx.fillStyle='#6fd8ff'; ctx.beginPath(); ctx.arc(0,0,r+5,0,TAU); ctx.fill(); ctx.restore(); }
    const c=def.color;
    if(body==='skel'||body==='shield'){ this._bean(0,-r*0.1+bob,r*1.0,r*1.6,c,{seed:33,lw:6,wob:2}); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-r*0.24,-r*0.5+bob,r*0.14,0,TAU); ctx.arc(r*0.24,-r*0.5+bob,r*0.14,0,TAU); ctx.fill(); ctx.save(); ctx.shadowBlur=6; ctx.shadowColor='#ff5a2a'; ctx.fillStyle='#ff7a3c'; ctx.beginPath(); ctx.arc(-r*0.24,-r*0.5+bob,r*0.05,0,TAU); ctx.arc(r*0.24,-r*0.5+bob,r*0.05,0,TAU); ctx.fill(); ctx.restore();
      if(body==='shield'&&g.shieldUp){ ctx.save(); ctx.translate(-r*0.9,bob); this._rough([[-12,-22],[12,-22],[14,16],[0,26],[-14,16]],'#b8b0a0',{seed:7,lw:5}); ctx.restore(); } }
    else if(body==='imp'||body==='zombie'||body==='drummer'){ this._bean(0,-r*0.1+bob,r*1.1,r*1.45,c,{seed:33,lw:6,wob:2}); ctx.fillStyle='#ffe9a0'; ctx.beginPath(); ctx.arc(-r*0.2,-r*0.18+bob,r*0.1,0,TAU); ctx.arc(r*0.2,-r*0.18+bob,r*0.1,0,TAU); ctx.fill(); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-r*0.2,-r*0.16+bob,r*0.04,0,TAU); ctx.arc(r*0.2,-r*0.16+bob,r*0.04,0,TAU); ctx.fill();
      if(body==='imp'){ ctx.fillStyle='#b8401e'; for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(s*r*0.36,-r*0.5+bob);ctx.lineTo(s*r*0.5,-r*0.85+bob);ctx.lineTo(s*r*0.14,-r*0.5+bob);ctx.closePath();ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#0e0d0c';ctx.stroke();} }
      if(body==='drummer'){ ctx.save(); ctx.translate(0,r*0.5+bob); this._oval(0,0,r*0.5,r*0.3,'#6a4326',{lw:5}); ctx.restore(); } }
    else if(body==='bat'){ ctx.fillStyle=c; for(const s of[-1,1]){ ctx.save(); ctx.scale(s,1); ctx.beginPath(); ctx.moveTo(r*0.2,bob); ctx.lineTo(r*1.1,-r*0.5+bob); ctx.lineTo(r*0.9,r*0.3+bob); ctx.closePath(); ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); ctx.restore(); } this._oval(0,bob,r*0.5,r*0.5,c,{lw:6}); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-r*0.15,bob,r*0.08,0,TAU); ctx.arc(r*0.15,bob,r*0.08,0,TAU); ctx.fill(); }
    else if(body==='wizard'){ this._bean(0,-r*0.1+bob,r*1.0,r*1.5,c,{seed:33,lw:6,wob:2}); ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(0,-r*1.3+bob); ctx.lineTo(r*0.4,-r*0.5+bob); ctx.lineTo(-r*0.4,-r*0.5+bob); ctx.closePath(); ctx.fill(); ctx.lineWidth=5; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-r*0.18,-r*0.15+bob,r*0.08,0,TAU); ctx.arc(r*0.18,-r*0.15+bob,r*0.08,0,TAU); ctx.fill(); }
    else if(body==='eye'){ this._oval(0,bob,r*0.9,r*0.9,c,{lw:6}); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,bob,r*0.5,0,TAU); ctx.fill(); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(Math.sin(t*2)*r*0.2,bob,r*0.22,0,TAU); ctx.fill(); }
    else if(body==='slime'){ this._rough([[-r*0.8,r*0.5+bob],[-r*0.7,-r*0.3+bob],[0,-r*0.6+bob],[r*0.7,-r*0.3+bob],[r*0.8,r*0.5+bob]],c,{seed:33,lw:6,wob:3}); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-r*0.2,-r*0.05+bob,r*0.08,0,TAU); ctx.arc(r*0.2,-r*0.05+bob,r*0.08,0,TAU); ctx.fill(); }
    else if(body==='mummy'){ this._bean(0,-r*0.1+bob,r*1.0,r*1.5,c,{seed:33,lw:6,wob:2}); ctx.strokeStyle='#0e0d0c'; ctx.lineWidth=2.5; for(let i=0;i<3;i++){ const yy=-r*0.3+i*r*0.35+bob; ctx.beginPath(); ctx.moveTo(-r*0.5,yy); ctx.lineTo(r*0.5,yy+4); ctx.stroke(); } ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-r*0.18,-r*0.2+bob,r*0.07,0,TAU); ctx.arc(r*0.18,-r*0.2+bob,r*0.07,0,TAU); ctx.fill(); }
    else if(body==='spider'){ ctx.strokeStyle='#0e0d0c'; ctx.lineWidth=4; for(let i=0;i<4;i++){ const a=0.5+i*0.4; for(const s of[-1,1]){ ctx.beginPath(); ctx.moveTo(0,bob); ctx.lineTo(s*Math.cos(a)*r*1.3,bob+Math.sin(a)*r*0.6+r*0.4); ctx.stroke(); } } this._oval(0,bob,r*0.7,r*0.6,c,{lw:6}); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-r*0.2,-r*0.1+bob,r*0.1,0,TAU); ctx.arc(r*0.2,-r*0.1+bob,r*0.1,0,TAU); ctx.fill(); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-r*0.2,-r*0.08+bob,r*0.04,0,TAU); ctx.arc(r*0.2,-r*0.08+bob,r*0.04,0,TAU); ctx.fill(); }
    // hit flash
    if(g.flash>0){ ctx.globalAlpha=g.flash*0.7*ph; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill(); }
    ctx.restore();
    // hp pip + cast countdown + intf icon
    this.drawGuardTags(g);
  },
  drawGuardTags(g){ const ctx=this.ctx; const w=g.r*1.6,x=g.x-w/2,y=g.y-g.r-16;
    ctx.globalAlpha=1; ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x-1,y-1,w+2,7); ctx.fillStyle='#c4342a'; ctx.fillRect(x,y,w*clamp(g.hp/g.maxhp,0,1),5);
    if(g.cast>0){ // countdown pips
      for(let i=0;i<g.castMax;i++){ ctx.fillStyle=i<g.cast?'#e6c068':'rgba(120,100,60,0.4)'; ctx.beginPath(); ctx.arc(g.x-(g.castMax-1)*7+i*14, y-14, 5,0,TAU); ctx.fill(); }
      const intf=INTERFERENCES[GUARDS[g.type].intf]; if(intf) this.text(intf.icon, g.x, y-26, 18, '#e6c068',{align:'center'});
    }
  },
});

// === final activation: daily leaderboard on the final bench screen ===
(function(){
  const baseRecordShot = Game.prototype._recordShot;
  Game.prototype._recordShot=function(id,made,type){
    const result = baseRecordShot ? baseRecordShot.apply(this,arguments) : undefined;
    if(this._syncLeaderboardStats) this._syncLeaderboardStats(false);
    return result;
  };
  Game.prototype._drawFbStatCards=function(LO){
    const U=LO.U,s=this.save,total=this._playerDayTotals?this._playerDayTotals():{shots:0,makes:0};
    const acc=total.shots?Math.round(total.makes/total.shots*100):0;
    this._gothCard(LO.statL,U);
    this._statIcon('target',LO.statL.x+18*U,LO.statL.y+LO.statL.h*0.62,7*U);
    this.text('今日命中', LO.statL.x+14*U, LO.statL.y+16*U, 11*U,'#a2926e');
    this.text(acc+'%', LO.statL.x+32*U, LO.statL.y+LO.statL.h*0.58, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this.text((total.shots||0)+' / '+(total.makes||0), LO.statL.x+LO.statL.w-16*U, LO.statL.y+LO.statL.h*0.58, 10*U,'#9fe024',{align:'right',baseline:'middle',weight:'800'});
    this.text('排行榜 ›', LO.statL.x+LO.statL.w-14*U, LO.statL.y+18*U, 9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
    this.btn(LO.statL.x,LO.statL.y,LO.statL.w,Math.max(44*U,LO.statL.h),'fb_leaderboard',()=>this._openLeaderboard&&this._openLeaderboard());

    this._gothCard(LO.statR,U);
    this._statIcon('crown',LO.statR.x+18*U,LO.statR.y+LO.statR.h*0.62,7*U);
    this.text('無盡最佳', LO.statR.x+14*U, LO.statR.y+16*U, 11*U,'#a2926e');
    this.text(String(s.endlessBest|0), LO.statR.x+32*U, LO.statR.y+LO.statR.h*0.62, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
  };
})();

// === generated relic backpack UI ===
(function(){
  const UI='/assets/relic_ui/';
  const SHEETS={
    ball:'icons_balls.png',
    wrist:'icons_wrist.png',
    shoes:'icons_shoes.png',
    charm:'icons_charms.png',
    mask:'icons_masks.png',
    hoop:'icons_hoops.png'
  };
  const TYPES=[
    {key:'ball',label:'籃球核心',tab:'核心',sheet:'ball',names:['煉獄火心球','霜網核心球','雷骨電核球','影步空心球','骨月籃魂球','毒沼黏液球','聖哨祈願球','碎鏡折射球','加時沙漏球','隕星扣殺球','鐵鏈囚籃球','幽魂穿網球','血月裁決球','速通霓虹球','重力虛空球','王冠終場球']},
    {key:'wrist',label:'護腕戒指',tab:'攻擊',sheet:'wrist',names:['雷骨指環','餘燼腕纏','霜鏈手環','裁判印戒','血誓腕帶','王衛金印','咒骨手鐲','重力籃環戒','毒沼腕輪','速通脈衝帶','玻璃裂戒','鐵租鎖鏈','朝聖骨環','影步袖扣','織網手環','加時金戒']},
    {key:'shoes',label:'球鞋',tab:'特殊',sheet:'shoes',names:['詛咒高筒鞋','餘燼衝刺鞋','霜滑戰靴','閃電快攻鞋','影步球鞋','骨踝短靴','裁判條紋鞋','毒沼黏鞋','速通霓虹跑鞋','重力虛空靴','碎玻璃鞋底','鐵鏈重靴','朝聖涼鞋','王庭球鞋','血月釘鞋','加時翼鞋']},
    {key:'charm',label:'護符哨子',tab:'防禦',sheet:'charm',names:['骷髏哨子','冰網護符','餘燼裁判哨','雷鳴哨','影縫護符','骨珠念串','毒沼小瓶','速通秒錶符','重力墜飾','玻璃碎符','鐵門鑰哨','朝聖念珠','王庭徽符','血月護身符','加時沙漏哨','詛咒入場券']},
    {key:'mask',label:'面具徽章',tab:'防禦',sheet:'mask',names:['裁判骷髏面','影射手面罩','骨製護目','霜裁判眼鏡','雷鳴徽章','餘燼面甲','毒笑面具','速通霓虹章','重力審判面','玻璃單眼鏡','鐵哨徽記','朝聖面紗','王庭紋章','血月面具','加時計分章','詛咒觀眾面']},
    {key:'hoop',label:'籃框碎片',tab:'特殊',sheet:'hoop',names:['裂框碎片','詛咒籃板片','黃金獎盃裂片','鐵網王冠','骷髏籃框角','霜籃板甲','雷計分碎片','餘燼鏈框','毒沼籃圈','速通秒錶盃','重力地板磚','玻璃哨盃','朝聖骨盃','王庭金盃','血月籃圈','加時沙漏框']}
  ];
  const TYPE_MAP=Object.fromEntries(TYPES.map(t=>[t.key,t]));
  const QUAL=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
  const RARITY=['普通','精良','稀有','史詩','傳說','詛咒傳說'];
  const RELIC_VISUAL={
    abbey_ember:['ball',0], sand_bow:['ball',13], citadel_battery:['ball',2], red_axe:['hoop',14], final_chill:['ball',1],
    ember_saint:['charm',2], iron_hook:['hoop',7], coldflame_tesla:['ball',1], thunderbone:['wrist',0], absolute_zero:['ball',1],
    broken_glass:['ball',7], deadeye_sigil:['mask',10], kings_seal:['mask',12], blood_chalice:['charm',13], hex_idol:['mask',15],
    pilgrim_bone:['charm',11], rift_feather:['shoes',15], champ_ball:['ball',15], bench_towel:['charm',6], ref_glasses:['mask',3],
    board_brace:['wrist',14]
  };
  const state=Game.prototype;

  state._relicUiImg=function(name){
    this._relicUi=this._relicUi||{};
    if(this._relicUi[name]!==undefined) return this._relicUi[name];
    try{
      const im=new Image();
      im.onload=()=>{try{if(this.screen==='relics'||this._bag||this._relicCompare)this.render();}catch(e){}};
      im.src=UI+name;
      this._relicUi[name]=im;
      return im;
    }catch(e){ this._relicUi[name]=null; return null; }
  };
  state._relicVisual=function(rid){
    const R=RELICS[rid]||{};
    if(RELIC_VISUAL[rid]) return {type:RELIC_VISUAL[rid][0],idx:RELIC_VISUAL[rid][1]};
    if(R.form) return {type:'ball',idx:({fire:0,ice:1,lightning:2,axe:10,arrow:13,normal:15}[R.form]||0)};
    if(R.cls==='oath') return {type:'charm',idx:11};
    if(R.cls==='feel') return {type:'wrist',idx:3};
    return {type:'hoop',idx:0};
  };
  state._relicBaseName=function(type,idx){ const t=TYPE_MAP[type]||TYPES[0]; return t.names[idx%t.names.length]; };
  state._drawRelicSheetIcon=function(type,idx,x,y,w,h,alpha){
    const t=TYPE_MAP[type]||TYPES[0], im=this._relicUiImg(SHEETS[t.sheet]);
    const ctx=this.ctx; alpha=alpha==null?1:alpha;
    if(im&&im.complete&&im.naturalWidth){
      const cols=4, rows=4, sw=im.naturalWidth/cols, sh=im.naturalHeight/rows, sx=(idx%cols)*sw, sy=((idx/cols)|0)*sh;
      ctx.save(); ctx.globalAlpha=alpha; ctx.drawImage(im,sx,sy,sw,sh,x,y,w,h); ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha=alpha; this.rr(x,y,w,h,12); ctx.fillStyle='rgba(20,14,9,0.9)'; ctx.fill(); ctx.strokeStyle='rgba(215,169,69,0.45)'; ctx.stroke(); ctx.restore();
    }
  };
  state._relicDisplay=function(rid,owned){
    const R=RELICS[rid]||{}, v=this._relicVisual(rid), meta=owned&&this._relicMeta?this._relicMeta(rid):null, tier=meta?meta.tier:0;
    return {id:rid,name:R.name||this._relicBaseName(v.type,v.idx),type:v.type,idx:v.idx,cls:R.cls||'core',core:TYPE_MAP[v.type].label,desc:R.desc||'',tier,q:meta?meta.q:0,affixes:meta&&meta.affixes?meta.affixes:[]};
  };
  state._allRelicCatalog=function(){
    const out=[];
    for(const t of TYPES) for(let i=0;i<t.names.length;i++) out.push({catalog:true,id:'cat_'+t.key+'_'+i,type:t.key,idx:i,name:t.names[i],core:t.label,tier:(i%5),tab:t.tab});
    return out;
  };
  state._drawRelicCard=function(item,x,y,w,h,o){
    o=o||{}; const ctx=this.ctx, col=QUAL[item.tier||0]||QUAL[0], pr=this._press({x,y,w,h});
    ctx.save();
    this.rr(x,y,w,h,14);
    const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,'rgba(30,23,18,0.95)'); g.addColorStop(1,'rgba(7,5,8,0.98)');
    ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=o.selected?4:2.4; ctx.strokeStyle=o.selected?'#fff7d0':(o.locked?'rgba(120,110,95,0.35)':col);
    if(o.selected||(!o.locked&&o.equipped)){ctx.shadowBlur=o.selected?18:10;ctx.shadowColor=col;}
    this.rr(x,y,w,h,14); ctx.stroke(); ctx.shadowBlur=0;
    if(pr){ ctx.globalAlpha=0.15; ctx.fillStyle='#fff'; this.rr(x+3,y+3,w-6,h-6,12); ctx.fill(); ctx.globalAlpha=1; }
    ctx.restore();
    const pad=Math.max(8,Math.min(14,w*0.08)), iconH=Math.min(h*0.62,w-pad*2);
    this._drawRelicSheetIcon(item.type,item.idx,x+pad,y+pad,w-pad*2,iconH,o.locked?0.35:1);
    if(o.locked){ ctx.save(); ctx.fillStyle='rgba(0,0,0,0.35)'; this.rr(x+pad,y+pad,w-pad*2,iconH,10); ctx.fill(); ctx.restore(); }
    const nm=o.compact?this._clip(item.name,w-12,15,'900'):this._clip(item.name,w-14,18,'900');
    this.text(nm,x+w/2,y+h-24,o.compact?14:17,o.locked?'rgba(210,200,180,0.48)':'#f4ead0',{align:'center',baseline:'middle',weight:'900'});
    this.text(item.core||'',x+w/2,y+h-8,o.compact?10:12,o.locked?'rgba(160,150,130,0.42)':col,{align:'center',baseline:'middle',weight:'800'});
  };
  state._relicEquipSlot=function(rid){ const load=this.save.loadout||[]; const i=load.indexOf(rid); return i>=0?i:-1; };
  state._selectedEquipFor=function(item){
    const load=this.save.loadout||[null,null,null,null,null];
    if(item&&item.id&&load.includes(item.id)) return item.id;
    if(item&&item.type==='ball'){
      for(const id of load){ if(id){ const d=this._relicDisplay(id,true); if(d.type==='ball') return id; } }
    }
    return load.find(Boolean)||null;
  };
  state._openRelicCompare=function(rid){
    const item=this._relicDisplay(rid,true), curId=this._selectedEquipFor(item);
    this._relicCompare={rid,current:curId};
    this.audio.sfx('ui'); this.render();
  };
  state._equipFromCompare=function(){
    const c=this._relicCompare; if(!c) return;
    const rid=c.rid, s=this.save; if(!s.loadout)s.loadout=[null,null,null,null,null];
    const have=s.loadout.indexOf(rid);
    if(have>=0){ s.loadout[have]=null; persist(s); this._relicCompare=null; this.audio.sfx('ui'); this.render(); return; }
    const cur=c.current, curIdx=cur?s.loadout.indexOf(cur):-1;
    if(curIdx>=0) s.loadout[curIdx]=rid;
    else {
      const e=s.loadout.indexOf(null);
      if(e>=0) s.loadout[e]=rid; else s.loadout[0]=rid;
    }
    persist(s); this._relicCompare=null; this.audio.sfx('select'); this.render();
  };
  state.drawRelics=function(){
    const ctx=this.ctx, s=this.save; if(!s.loadout)s.loadout=[null,null,null,null,null]; if(!s.library)s.library=[];
    this.backdrop('hub');
    const bg=this._relicUiImg('backpack_bg.png');
    if(bg&&bg.complete&&bg.naturalWidth) ctx.drawImage(bg,0,0,BW,BH); else { ctx.fillStyle='#0b0710'; ctx.fillRect(0,0,BW,BH); }
    const safeL=this.insL||0,safeR=this.insR||0,safeT=this.insT||0,safeB=this.insB||0;
    this.text('聖物背包',safeL+58,safeT+62,48,'#ffe7a6',{weight:'900',glow:14});
    this.text('裝備 '+s.loadout.filter(Boolean).length+'/5  ·  庫存 '+s.library.length+'/40',safeL+260,safeT+64,24,'#c8b894',{baseline:'middle',weight:'900'});
    this.button(BW-safeR-132,safeT+32,82,58,'×','relic_back',()=>this.go('hub'),{size:36,color:'#f0c0b0'});
    const tab=this._relicTab||'全部';
    const tabs=['全部','核心','攻擊','防禦','特殊'];
    let tx=safeL+58,ty=safeT+104;
    for(const tb of tabs){ const w=tb==='全部'?96:104; this.rr(tx,ty,w,42,12); ctx.fillStyle=tab===tb?'rgba(184,255,47,0.18)':'rgba(10,7,8,0.66)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=tab===tb?'#bfff2f':'rgba(215,169,69,0.38)'; ctx.stroke(); this.text(tb,tx+w/2,ty+21,20,tab===tb?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'}); ((t)=>this.btn(tx,ty,w,42,'relic_tab_'+t,()=>{this._relicTab=t;this.render();}))(tb); tx+=w+12; }

    const eqY=safeT+160, eqX=safeL+315, eqW=214, eqH=138, gap=18;
    for(let i=0;i<5;i++){ const rid=s.loadout[i], x=eqX+i*(eqW+gap); if(rid){ const it=this._relicDisplay(rid,true); this._drawRelicCard(it,x,eqY,eqW,eqH,{equipped:true,selected:this._bagSel===rid}); ((id)=>this.btn(x,eqY,eqW,eqH,'eq_'+i,()=>this._openRelicCompare(id)))(rid); } else { ctx.save(); this.rr(x,eqY,eqW,eqH,14); ctx.fillStyle='rgba(8,6,8,0.68)'; ctx.fill(); ctx.setLineDash([8,8]); ctx.lineWidth=2; ctx.strokeStyle='rgba(215,169,69,0.34)'; ctx.stroke(); ctx.setLineDash([]); ctx.restore(); this.text('+',x+eqW/2,eqY+eqH/2-8,52,'rgba(215,169,69,0.42)',{align:'center',baseline:'middle',weight:'700'}); this.text('空槽',x+eqW/2,eqY+eqH/2+32,18,'rgba(200,190,170,0.45)',{align:'center',baseline:'middle',weight:'800'}); } }

    const owned=[...new Set([...(s.loadout||[]).filter(Boolean),...(s.library||[])])].filter(id=>RELICS[id]).map(id=>this._relicDisplay(id,true));
    let catalog=this._allRelicCatalog();
    if(tab!=='全部') catalog=catalog.filter(it=>it.tab===tab || (tab==='核心'&&it.type==='ball'));
    const ownedType=new Set(owned.map(it=>it.type+':'+it.idx));
    const locked=catalog.filter(it=>!ownedType.has(it.type+':'+it.idx));
    const gx=safeL+58, gy=safeT+330, cols=7, cellW=210, cellH=126, cg=14;
    const visible=owned.concat(locked).slice(0,28);
    for(let i=0;i<visible.length;i++){
      const it=visible[i], x=gx+(i%cols)*(cellW+cg), y=gy+((i/cols)|0)*(cellH+cg);
      const lockedItem=!!it.catalog;
      this._drawRelicCard(it,x,y,cellW,cellH,{compact:true,locked:lockedItem,selected:this._bagSel===it.id});
      if(!lockedItem) ((id)=>this.btn(x,y,cellW,cellH,'bag_'+id,()=>this._openRelicCompare(id)))(it.id);
    }
    const sel=(this._relicCompare&&this._relicCompare.rid)?this._relicDisplay(this._relicCompare.rid,true):(owned[0]||null);
    const py=BH-safeB-138, px=safeL+58, pw=BW-safeL-safeR-116, ph=104;
    this.rr(px,py,pw,ph,14); ctx.fillStyle='rgba(9,6,5,0.86)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(215,169,69,0.46)'; ctx.stroke();
    if(sel){ this._drawRelicSheetIcon(sel.type,sel.idx,px+20,py+14,76,76,1); this.text(sel.name,px+116,py+38,30,QUAL[sel.tier]||'#e6c068',{weight:'900'}); this.text((RARITY[sel.tier]||'普通')+' · '+sel.core+(sel.q?' · 強度 '+sel.q+'/50':''),px+116,py+70,20,'#c8b894',{weight:'800'}); this.text(sel.desc?this._clip(sel.desc,pw-560,18,'700'):'點擊聖物可開啟左右比較',px+520,py+54,20,'#efe3ca',{baseline:'middle',weight:'700'}); }
    if(this._relicCompare) this.drawRelicCompare();
  };
  state.drawRelicCompare=function(){
    const c=this._relicCompare; if(!c) return; const ctx=this.ctx, selected=this._relicDisplay(c.rid,true), current=c.current?this._relicDisplay(c.current,true):null;
    ctx.save(); ctx.fillStyle='rgba(2,1,5,0.72)'; ctx.fillRect(-4000,-4000,BW+8000,BH+8000); ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'cmp_scrim',()=>{});
    const im=this._relicUiImg('compare_modal.png'), w=1580,h=830,x=BW/2-w/2,y=BH/2-h/2+10;
    if(im&&im.complete&&im.naturalWidth) ctx.drawImage(im,x,y,w,h); else { this.panel(x,y,w,h,{r:24,stroke:'#d7a945'}); }
    this.text('裝備比較',BW/2,y+64,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});
    const card=(it,rx,ry,rw,rh,title,col)=>{
      this.text(title,rx+rw/2,ry-26,28,col,{align:'center',baseline:'middle',weight:'900'});
      this.rr(rx,ry,rw,rh,18); ctx.fillStyle='rgba(5,4,8,0.54)'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=it?(QUAL[it.tier]||col):'rgba(160,150,130,0.35)'; ctx.stroke();
      if(it){ this._drawRelicSheetIcon(it.type,it.idx,rx+rw*0.14,ry+34,rw*0.72,rh*0.42,1); this.text(it.name,rx+rw/2,ry+rh*0.56,34,QUAL[it.tier]||'#e6c068',{align:'center',baseline:'middle',weight:'900'}); this.text((RARITY[it.tier]||'普通')+' · '+it.core,rx+rw/2,ry+rh*0.64,22,'#c8b894',{align:'center',baseline:'middle',weight:'800'}); const af=(it.affixes||[]).slice(0,3); for(let i=0;i<3;i++){ const yy=ry+rh*0.72+i*42; const txt=af[i]?('◆ '+af[i].label+' +'+(af[i].pct?Math.round(af[i].val*100)+'%':af[i].val)):(i===0?this._clip(it.desc,rw-90,19,'800'):''); if(txt)this.text(txt,rx+54,yy,21,'#efe3ca',{baseline:'middle',weight:'800'}); } }
      else { this.text('空槽',rx+rw/2,ry+rh/2,34,'rgba(210,200,180,0.56)',{align:'center',baseline:'middle',weight:'900'}); }
    };
    card(current,x+120,y+150,560,500,'裝備中','#bfff2f');
    card(selected,x+w-680,y+150,560,500,'選取聖物','#b980ff');
    this.text('VS',BW/2,y+390,54,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:10});
    const bw=300,bh=78,by=y+h-120;
    this.button(BW/2-bw-36,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
    this.button(BW/2+36,by,bw,bh,current&&current.id===selected.id?'卸下':'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:34,weight:'900'});
  };
})();

// === mobile login, entry preload, cloud progress, readable leaderboard, and tactile audio ===
(function(){
  const ENTRY_ASSETS=[
    '/assets/background/home_scene_flat_1704x786.webp',
    '/assets/background/home_bg_dark_1704x786.webp',
    '/assets/final_bench_menu/final_bench_menu_full_flat_1704x786.webp',
    '/assets/hero_select/bg_clean.webp',
    '/assets/host_guide/codex_bg_flat.webp',
    '/assets/atlas_base_clean_no_nodes_1704x786.webp',
    '/assets/stage1_route_base_1704x786.webp',
    '/assets/stage2_route_base_1704x786.webp',
    '/assets/stage3_route_base_1704x786.webp',
    '/assets/stage4_route_base_1704x786.webp',
    '/assets/stage5_route_base_1704x786.webp',
    '/assets/battle/act1_bg.webp',
    '/assets/battle/act2_bg.webp',
    '/assets/battle/act3_bg.webp',
    '/assets/battle/act4_bg.webp',
    '/assets/battle/act5_bg.webp',
    '/assets/endless/endless_cracked_court.png',
    '/assets/endless/bg_iron_cage_stands.png',
    '/assets/endless/bg_coldflame_zone.png',
    '/assets/endless/bg_thunderbone_dome.png',
    '/assets/endless/bg_final_abyss_cathedral.png',
    '/assets/endless/boss_hoop_guardian.png',
    '/assets/endless/enemies/crack_runner.png',
    '/assets/endless/enemies/screen_idol.png',
    '/assets/endless/enemies/iron_whistle.png',
    '/assets/endless/enemies/oil_monk.png',
    '/assets/endless/enemies/mist_librarian.png',
    '/assets/endless/enemies/cold_rim_guard.png',
    '/assets/endless/enemies/war_drum_leader.png',
    '/assets/endless/enemies/shattered_board_collector.png',
    '/assets/endless/bosses/free_throw_executioner.png',
    '/assets/endless/bosses/broken_rim_stitcher.png',
    '/assets/endless/bosses/coldflame_scorekeeper.png',
    '/assets/endless/bosses/thunderbone_announcer.png',
    '/assets/endless/bosses/abyss_hoop_lord.png',
    ...(()=>{ const out=[]; for(let act=1;act<=5;act++) for(let i=0;i<6;i++) out.push('/assets/mob/standard/act'+act+'/enemy_'+i+'.png?v=20260629_bean_mobs_v1'); return out; })(),
    '/assets/mob/speed/act1.webp',
    '/assets/mob/speed/act2.webp',
    '/assets/mob/speed/act3.webp',
    '/assets/mob/speed/act4.webp',
    '/assets/mob/speed/act5.webp',
    '/assets/ui/login_panel_user_trans.png',
    '/assets/relic_ui/backpack_bg.png',
    '/assets/relic_ui/compare_modal.png',
    '/assets/relic_ui/icons_balls.png',
    '/assets/relic_ui/icons_wrist.png',
    '/assets/relic_ui/icons_shoes.png',
    '/assets/relic_ui/icons_charms.png',
    '/assets/relic_ui/icons_masks.png',
    '/assets/relic_ui/icons_hoops.png',
    '/hero_shade.png',
    '/hero_axer.png',
    '/hero_elem.png',
    '/hero_bone.png',
    '/hero_archer.png',
    '/hero_beast.png',
    '/hero_whistle.png'
  ];
  const LOGIN_PANEL_CROP={x:52,y:18,w:1339,h:1057};
  const assetCache={};

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function deepClone(v){ try{return JSON.parse(JSON.stringify(v));}catch(e){return v;} }
  function unionArr(a,b){ const out=[]; for(const x of [].concat(a||[],b||[])){ if(x!=null && !out.includes(x)) out.push(x); } return out; }
  function maxNum(a,b){ return Math.max(Number(a)||0,Number(b)||0); }

  const priorOpenLogin=Game.prototype.openLogin;
  Game.prototype.openLogin=function(){
    const L=this.save.login||{};
    this._loginDraft={name:L.name||'',code:L.code||L.pass||'',busy:false,msg:''};
    this._loginOpen=true;
    this.render();
    if(!this._isMobileFx()){
      setTimeout(()=>{try{ const e=this._loginEls; (e&&(e.name.value?e.code:e.name)).focus(); }catch(_e){}},60);
    }
  };

  Game.prototype._placeInput=function(el,x,y,w,h,fs){
    const sc=this.scale||1;
    el.style.left=(this.ox+x*sc)+'px';
    el.style.top=(this.oy+y*sc)+'px';
    el.style.width=(w*sc)+'px';
    el.style.height=(h*sc)+'px';
    el.style.fontSize=Math.max(16,fs*sc)+'px';
    el.style.lineHeight=(h*sc)+'px';
    el.style.display='block';
    el.style.touchAction='manipulation';
    el.style.webkitTextSizeAdjust='100%';
    el.style.textSizeAdjust='100%';
  };

  const priorEnsureInputs=Game.prototype._ensureLoginInputs;
  Game.prototype._ensureLoginInputs=function(nameR,codeR,fs){
    priorEnsureInputs.call(this,nameR,codeR,fs);
    const e=this._loginEls;
    if(!e) return;
    for(const el of [e.name,e.code]){
      el.autocapitalize='off';
      el.autocorrect='off';
      el.spellcheck=false;
      el.style.fontSize=Math.max(16,parseFloat(el.style.fontSize)||16)+'px';
      el.style.webkitTextSizeAdjust='100%';
      el.style.textSizeAdjust='100%';
      el.style.touchAction='manipulation';
    }
    e.name.placeholder='輸入你的名字';
    e.code.placeholder='背號或代號';
  };

  const priorDrawLogin=Game.prototype.drawLoginModal;
  Game.prototype.drawLoginModal=function(){
    priorDrawLogin.call(this);
    const d=this._loginDraft||{};
    const src=LOGIN_PANEL_CROP;
    const sc=Math.min((BW*0.94)/src.w,(BH*0.96)/src.h);
    const dw=src.w*sc, dh=src.h*sc, dx=BW/2-dw/2, dy=BH/2-dh/2+2;
    const map=(x,y,w,h)=>({x:dx+x*sc,y:dy+y*sc,w:w*sc,h:h*sc});
    const okR=map(700,770,410,120);
    const hot=(d.busy || (this._loginPressUntil&&this.t<this._loginPressUntil));
    if(hot){
      const ctx=this.ctx, pulse=0.5+0.5*Math.sin(this.t*18);
      ctx.save();
      this.rr(okR.x+6,okR.y+8,okR.w-12,okR.h-16,20);
      const g=ctx.createLinearGradient(0,okR.y,0,okR.y+okR.h);
      g.addColorStop(0,'rgba(220,255,64,0.88)');
      g.addColorStop(1,'rgba(91,145,12,0.72)');
      ctx.fillStyle=g;
      ctx.shadowBlur=22+18*pulse;
      ctx.shadowColor='rgba(190,255,47,0.9)';
      ctx.fill();
      ctx.shadowBlur=0;
      ctx.globalAlpha=0.9;
      this.text(d.busy?'登入中...':'已按下',okR.x+okR.w/2,okR.y+okR.h/2+2,38,'#111706',{align:'center',baseline:'middle',weight:'900'});
      ctx.restore();
    }
  };

  Game.prototype._preloadImage=function(src){
    if(assetCache[src]) return assetCache[src];
    assetCache[src]=new Promise(resolve=>{
      try{
        const im=new Image();
        im.decoding='async';
        im.onload=async()=>{ try{ if(im.decode) await im.decode(); }catch(_e){} resolve(true); };
        im.onerror=()=>resolve(false);
        im.src=src;
      }catch(e){ resolve(false); }
    });
    return assetCache[src];
  };

  Game.prototype._preloadEntryAssets=async function(){
    const list=ENTRY_ASSETS.slice();
    const st=this._assetLoading||{};
    let done=0, idx=0;
    const total=list.length;
    const worker=async()=>{
      while(idx<total){
        const src=list[idx++];
        st.label='載入背景圖';
        st.detail=src.split('/').pop();
        await this._preloadImage(src);
        done++;
        st.progress=done/total;
        this.render();
      }
    };
    await Promise.all([worker(),worker(),worker()]);
  };

  Game.prototype._drawLoadingOverlay=function(){
    const st=this._assetLoading;
    if(!st||!st.active) return;
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,p=clamp(st.progress||0,0,1);
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='rgba(4,2,8,0.94)';
    ctx.fillRect(0,0,w,h);
    const cx=w/2, cy=h/2, bw=Math.min(w*0.62,720), bh=Math.max(16,h*0.024);
    const pulse=0.5+0.5*Math.sin(Date.now()/170);
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font='900 '+Math.max(26,Math.min(52,w*0.034))+'px "Microsoft JhengHei",serif';
    ctx.shadowBlur=22+12*pulse;
    ctx.shadowColor='rgba(190,255,47,0.72)';
    ctx.fillStyle='#f5edc9';
    ctx.fillText('召喚籃獄中',cx,cy-bh*5.8);
    ctx.shadowBlur=0;
    ctx.font='800 '+Math.max(14,Math.min(24,w*0.017))+'px "Microsoft JhengHei",sans-serif';
    ctx.fillStyle='#bfb29a';
    ctx.fillText((st.label||'載入資源')+' · '+Math.round(p*100)+'%',cx,cy-bh*2.8);
    ctx.fillStyle='rgba(20,15,10,0.92)';
    this.rr(cx-bw/2,cy-bh/2,bw,bh,Math.max(8,bh/2)); ctx.fill();
    ctx.lineWidth=Math.max(2,bh*0.16);
    ctx.strokeStyle='rgba(215,169,69,0.7)';
    this.rr(cx-bw/2,cy-bh/2,bw,bh,Math.max(8,bh/2)); ctx.stroke();
    const fillW=Math.max(bh,bw*p);
    const g=ctx.createLinearGradient(cx-bw/2,0,cx+bw/2,0);
    g.addColorStop(0,'#7fb516'); g.addColorStop(0.55,'#c8ff35'); g.addColorStop(1,'#fff1a3');
    ctx.fillStyle=g;
    this.rr(cx-bw/2,cy-bh/2,fillW,bh,Math.max(8,bh/2)); ctx.fill();
    ctx.font='700 '+Math.max(12,Math.min(18,w*0.013))+'px "Microsoft JhengHei",sans-serif';
    ctx.fillStyle='rgba(210,198,170,0.72)';
    ctx.fillText(st.detail||'準備板凳席與戰鬥背景',cx,cy+bh*3.5);
    ctx.restore();
  };

  const priorRender=Game.prototype.render;
  Game.prototype.render=function(){
    priorRender.call(this);
    this._drawLoadingOverlay&&this._drawLoadingOverlay();
  };
  const priorOnDown=Game.prototype.onDown;
  Game.prototype.onDown=function(x,y){ if(this._assetLoading&&this._assetLoading.active) return; return priorOnDown.call(this,x,y); };
  const priorOnUp=Game.prototype.onUp;
  Game.prototype.onUp=function(x,y){ if(this._assetLoading&&this._assetLoading.active) return; return priorOnUp.call(this,x,y); };

  Game.prototype._entryLoadingToHub=async function(status){
    this._assetLoading={active:true,progress:0,label:'載入全部圖片',detail:status||'準備進入板凳席'};
    this.render();
    try{ await this._preloadEntryAssets(); }catch(e){ try{console.warn('[HB preload]',e);}catch(_e){} }
    this._assetLoading.progress=1;
    this._assetLoading.label='載入完成';
    this._assetLoading.detail='進入最後板凳席';
    this.render();
    await sleep(280);
    this._assetLoading=null;
    this.go('hub');
  };

  Game.prototype._progressSaveSubset=function(){
    const s=this.save||{};
    const keys=['coins','tutorialDone','hero','relics','loadout','library','acts','marks','heat','memory','bossClears','nodeProg','modeProg','endless','endlessBest','deaths','deathsDay','deathsDayKey','stats'];
    const out={};
    for(const k of keys) out[k]=deepClone(s[k]);
    return out;
  };
  Game.prototype._progressSnapshot=function(){
    return {ver:1,updatedAt:new Date().toISOString(),save:this._progressSaveSubset(),profile:deepClone(this._loadProfile?this._loadProfile():{})};
  };
  Game.prototype._mergeProgressSnapshot=function(remote){
    if(!remote||typeof remote!=='object') return false;
    let changed=false;
    const rs=remote.save||{}, s=this.save||{};
    for(const k of ['coins','acts','endlessBest','deaths','deathsDay']){
      if(rs[k]!=null && maxNum(rs[k],s[k])!==s[k]){ s[k]=maxNum(rs[k],s[k]); changed=true; }
    }
    if(rs.hero && !s.hero){ s.hero=rs.hero; changed=true; }
    for(const k of ['relics','loadout']){
      if(Array.isArray(rs[k]) && (!Array.isArray(s[k]) || s[k].filter(Boolean).length===0)){ s[k]=rs[k].slice(); changed=true; }
    }
    if(Array.isArray(rs.library)){ const u=unionArr(s.library,rs.library); if(JSON.stringify(u)!==JSON.stringify(s.library||[])){ s.library=u; changed=true; } }
    for(const k of ['marks','heat','bossClears','nodeProg']){
      if(rs[k]&&typeof rs[k]==='object'){ s[k]=s[k]||{}; for(const id in rs[k]){ const nv=maxNum(s[k][id],rs[k][id]); if(nv!==s[k][id]){ s[k][id]=nv; changed=true; } } }
    }
    if(rs.stats&&typeof rs.stats==='object'){ s.stats=s.stats||{}; for(const k in rs.stats){ const nv=maxNum(s.stats[k],rs.stats[k]); if(nv!==s.stats[k]){ s.stats[k]=nv; changed=true; } } }
    if(rs.modeProg&&typeof rs.modeProg==='object'){
      s.modeProg=s.modeProg||{};
      for(const mode in rs.modeProg){
        const r=rs.modeProg[mode]||{}, m=s.modeProg[mode]||(s.modeProg[mode]={});
        if(r.acts!=null){ const nv=maxNum(m.acts,r.acts); if(nv!==m.acts){m.acts=nv; changed=true;} }
        for(const k of ['marks','heat','bossClears','nodeProg']){
          if(r[k]){ m[k]=m[k]||{}; for(const id in r[k]){ const nv=maxNum(m[k][id],r[k][id]); if(nv!==m[k][id]){m[k][id]=nv; changed=true;} } }
        }
      }
    }
    const rp=remote.profile||{};
    if(rp&&typeof rp==='object'){
      const lp=this._loadProfile();
      if(rp.heroes){ lp.heroes=lp.heroes||{}; for(const id in rp.heroes){ const rh=rp.heroes[id]||{}, lh=lp.heroes[id]||(lp.heroes[id]={level:1,xp:0,talents:{}}); for(const k of ['level','xp','shots','swishes','banks','misses']) lh[k]=maxNum(lh[k],rh[k]); lh.talents=Object.assign({},rh.talents||{},lh.talents||{}); changed=true; } }
      if(rp.relicMeta){ lp.relicMeta=Object.assign({},rp.relicMeta,lp.relicMeta||{}); changed=true; }
      if(rp.coins!=null){ lp.coins=maxNum(lp.coins,rp.coins); changed=true; }
      if(rp.heroDay&&rp.heroDay.key===this._dayKey()){ lp.heroDay=lp.heroDay||{key:rp.heroDay.key,stats:{}}; lp.heroDay.key=rp.heroDay.key; lp.heroDay.stats=lp.heroDay.stats||{}; const st=rp.heroDay.stats||{}; for(const id in st){ const rd=st[id]||{}, ld=lp.heroDay.stats[id]||(lp.heroDay.stats[id]={shots:0,makes:0}); ld.shots=maxNum(ld.shots,rd.shots); ld.makes=maxNum(ld.makes,rd.makes); changed=true; } }
      if(changed) this._saveProfile&&this._saveProfile();
    }
    if(changed) persist(s);
    return changed;
  };
  Game.prototype._cloudProgressUrl=function(){
    const cfg=this._supabaseCfg?this._supabaseCfg():{};
    if(!cfg.url||!cfg.key) return null;
    return {cfg,base:cfg.url.replace(/\/+$/,'')+'/rest/v1/'+encodeURIComponent(cfg.table||'player_accounts')};
  };
  Game.prototype._fetchCloudProgress=async function(name,code){
    const u=this._cloudProgressUrl();
    if(!u||!name) return {ok:false,reason:'no-config'};
    const q='?select=player_name,jersey_code,profile_json,profile_updated_at&player_name=eq.'+encodeURIComponent(name)+(code?'&jersey_code=eq.'+encodeURIComponent(code):'')+'&limit=1';
    const res=await fetch(u.base+q,{headers:{apikey:u.cfg.key,Authorization:'Bearer '+u.cfg.key}});
    if(!res.ok){ const t=await res.text(); if(/profile_json/i.test(t)){ this._cloudProgressMissing=true; return {ok:false,reason:'missing-column'}; } throw new Error(t); }
    const rows=await res.json();
    return {ok:true,row:rows&&rows[0]};
  };
  Game.prototype._pushCloudProgress=async function(name,code){
    const u=this._cloudProgressUrl();
    if(!u||!name||this._cloudProgressMissing) return false;
    const snap=this._progressSnapshot();
    const payload={player_name:name,jersey_code:code,remember:true,last_login_at:new Date().toISOString(),profile_json:snap,profile_updated_at:snap.updatedAt,today_key:this._dayKey()};
    const totals=this._playerDayTotals?this._playerDayTotals():null;
    if(totals){ payload.today_shots=totals.shots; payload.today_makes=totals.makes; }
    const res=await fetch(u.base+'?on_conflict=player_name',{method:'POST',headers:{apikey:u.cfg.key,Authorization:'Bearer '+u.cfg.key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
    if(!res.ok){ const t=await res.text(); if(/profile_json/i.test(t)){ this._cloudProgressMissing=true; return false; } throw new Error(t); }
    this._cloudProgressMissing=false;
    return true;
  };
  Game.prototype._scheduleCloudProgressSync=function(force){
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()), code=String((L.code||'').trim());
    if(!name||this._cloudProgressMissing) return;
    if(this._cloudProgressTimer){ clearTimeout(this._cloudProgressTimer); this._cloudProgressTimer=null; }
    const run=()=>this._pushCloudProgress(name,code).catch(e=>{try{console.warn('[HB cloud progress]',e);}catch(_e){}});
    if(force) run(); else this._cloudProgressTimer=setTimeout(run,1200);
  };
  const priorSaveProfile=Game.prototype._saveProfile;
  Game.prototype._saveProfile=function(){
    const r=priorSaveProfile.apply(this,arguments);
    this._scheduleCloudProgressSync(false);
    return r;
  };

  Game.prototype._submitLogin=async function(){
    if(this._loginDraft&&this._loginDraft.busy) return;
    this._syncLoginFields();
    const d=this._loginDraft||{}, name=String(d.name||'').trim(), code=String(d.code||'').trim();
    this._loginPressUntil=this.t+0.45;
    if(!name){ this.audio.sfx('hurt'); this.toast('請輸入名字','帳號請填你的名字'); this.render(); return; }
    if(!code){ this.audio.sfx('hurt'); this.toast('請輸入代號','代號可用背號，避免使用個人密碼'); this.render(); return; }
    d.busy=true; d.msg='登入中...'; this.render();
    if(this._loginEls){ try{this._loginEls.name.blur(); this._loginEls.code.blur();}catch(_e){} }
    this.save.login={name,code,remember:true,lastLoginAt:new Date().toISOString()};
    persist(this.save);
    let cloudMsg='本機登入';
    try{
      const remote=await this._fetchCloudProgress(name,code);
      if(remote.ok&&remote.row&&remote.row.profile_json){ this._mergeProgressSnapshot(remote.row.profile_json); cloudMsg='雲端進度已合併'; }
      else if(remote.reason==='missing-column'){ cloudMsg='雲端進度欄位尚未建立'; }
      const pushed=await this._pushCloudProgress(name,code);
      if(pushed) cloudMsg=remote.ok&&remote.row?'雲端進度已同步':'雲端帳號已建立';
    }catch(e){ cloudMsg='雲端同步暫時失敗'; try{console.warn('[HB login sync]',e);}catch(_e){} }
    d.busy=false;
    this._closeLogin(false);
    this.toast('登入成功',cloudMsg);
    await this._entryLoadingToHub(cloudMsg);
  };

  Game.prototype.drawLeaderboardModal=function(){
    const ctx=this.ctx;
    const IL=this.insL||0,IR=this.insR||0,IT=this.insT||0,IB=this.insB||0;
    ctx.save(); ctx.fillStyle='rgba(3,1,7,0.92)'; ctx.fillRect(-4000,-4000,BW+8000,BH+8000); ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'leaderboard_scrim',()=>{});
    const x=IL+42,y=IT+28,w=BW-IL-IR-84,h=BH-IT-IB-56;
    this.rr(x,y,w,h,22);
    const bg=ctx.createLinearGradient(0,y,0,y+h); bg.addColorStop(0,'rgba(23,16,12,0.98)'); bg.addColorStop(1,'rgba(6,4,9,0.99)');
    ctx.fillStyle=bg; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22); ctx.stroke();
    this.text('今日命中排行榜',x+w/2,y+64,50,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:14});
    this.text('滿 10 球才列正式名次，避免 1 投 1 中直接衝第一。',x+w/2,y+108,24,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
    this._drawLeaderboardButton(x+w-166,y+24,124,56,'關閉','leaderboard_close',()=>this._closeLeaderboard(),false);
    this._drawLeaderboardButton(x+42,y+24,124,56,'刷新','leaderboard_refresh',()=>{ this._leaderboardLoading=true; this._leaderboardStatus='重新整理...'; this._fetchLeaderboard(); this.render(); },true);
    const tx=x+56, ty=y+148, tw=w-112, rowH=74;
    const cols={rank:tx+54,name:tx+190,shot:tx+tw*0.63,acc:tx+tw-120};
    this.rr(tx,ty,tw,60,12); ctx.fillStyle='rgba(215,169,69,0.12)'; ctx.fill(); ctx.strokeStyle='rgba(215,169,69,0.35)'; ctx.lineWidth=1.5; this.rr(tx,ty,tw,60,12); ctx.stroke();
    this.text('排行',cols.rank,ty+30,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('玩家名稱',cols.name,ty+30,25,'#d7a945',{baseline:'middle',weight:'900'});
    this.text('投球 / 進球',cols.shot,ty+30,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('命中率',cols.acc,ty+30,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    const rows=this._leaderboardRows?this._leaderboardRows():[];
    const maxRows=Math.max(4,Math.floor((h-258)/rowH));
    for(let i=0;i<Math.min(rows.length,maxRows);i++){
      const r=rows[i], ry=ty+74+i*rowH;
      this.rr(tx,ry,tw,rowH-10,12);
      ctx.fillStyle=r.local?'rgba(159,224,36,0.16)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.16)');
      ctx.fill(); ctx.strokeStyle=r.local?'rgba(185,255,47,0.55)':'rgba(215,169,69,0.18)'; ctx.lineWidth=1.3; this.rr(tx,ry,tw,rowH-10,12); ctx.stroke();
      const muted=r.qualified?'#efe3ca':'#9e9178';
      this.text(String(r.rank),cols.rank,ry+31,28,r.qualified?'#ffe7a6':'#9fe024',{align:'center',baseline:'middle',weight:'900'});
      this.text(this._clip((r.local?'你 · ':'')+r.name,tw*0.34,28,'900'),cols.name,ry+31,30,r.local?'#d8ff44':muted,{baseline:'middle',weight:'900'});
      this.text((r.shots||0)+' / '+(r.makes||0),cols.shot,ry+31,29,muted,{align:'center',baseline:'middle',weight:'900'});
      this.text(r.shots?Math.round(r.acc*100)+'%':'0%',cols.acc,ry+31,30,r.qualified?'#ece0c4':'#b6aa90',{align:'center',baseline:'middle',weight:'900'});
      if(!r.qualified&&r.shots>0) this.text('未滿10球',cols.acc+92,ry+31,17,'#9fe024',{baseline:'middle',weight:'900'});
    }
    if(!rows.length) this.text('今天還沒有成績',x+w/2,y+h/2,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    this.text(this._leaderboardLoading?'載入中...':(this._leaderboardStatus||''),x+w/2,y+h-40,22,'#9e9178',{align:'center',baseline:'middle',weight:'800'});
  };

  if(typeof Audio!=='undefined'){
    Audio.prototype._swishNet=function(){
      this.ensure(); if(!this.ac||!this.enSfx) return;
      const ac=this.ac,t=ac.currentTime,dur=0.42,len=Math.floor(ac.sampleRate*dur),buf=ac.createBuffer(1,len,ac.sampleRate),data=buf.getChannelData(0);
      for(let i=0;i<len;i++){ const k=i/len; data[i]=(Math.random()*2-1)*(Math.sin(k*Math.PI))*0.9; }
      const src=ac.createBufferSource(); src.buffer=buf;
      const hp=ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1400;
      const bp=ac.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=4300; bp.Q.value=0.9;
      const g=ac.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.18*this.sVol,t+0.055); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.sfxGain); src.start(t); src.stop(t+dur+0.03);
    };
    Audio.prototype._rimClank=function(){
      this.ensure(); if(!this.ac||!this.enSfx) return;
      const ac=this.ac,t=ac.currentTime;
      const hit=(f,gain,delay,dur)=>{ const o=ac.createOscillator(),g=ac.createGain(); o.type='square'; o.frequency.setValueAtTime(f,t+delay); o.frequency.exponentialRampToValueAtTime(f*0.82,t+delay+dur); g.gain.setValueAtTime(0.0001,t+delay); g.gain.exponentialRampToValueAtTime(gain*this.sVol,t+delay+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t+delay+dur); o.connect(g); g.connect(this.sfxGain); o.start(t+delay); o.stop(t+delay+dur+0.02); };
      hit(520,0.22,0,0.22); hit(880,0.12,0.012,0.18); hit(1320,0.07,0.025,0.14);
      this.noise(0.055,0.09*this.sVol,5200,t,'highpass');
    };
    const oldSfx=Audio.prototype.sfx;
    Audio.prototype.sfx=function(n){
      if(n==='swish'){ this._swishNet(); return; }
      if(n==='rim'){ this._rimClank(); return; }
      return oldSfx.call(this,n);
    };
  }
})();

// === bench leaderboard: daily shooting ladder ===
(function(){
  const MIN_QUALIFIED_SHOTS = 10;
  const oldRecordShot = Game.prototype._recordShot;
  const oldSubmitLogin = Game.prototype._submitLogin;
  const oldRender = Game.prototype.render;

  function pct(makes, shots){
    return shots > 0 ? makes / shots : 0;
  }

  Object.assign(Game.prototype,{
    _playerDayTotals(){
      const p=this._loadProfile ? this._loadProfile() : null;
      const k=this._dayKey ? this._dayKey() : '';
      if(!p || !p.heroDay) return {key:k,shots:0,makes:0};
      if(p.heroDay.key!==k){ p.heroDay.key=k; p.heroDay.stats={}; if(this._saveProfile)this._saveProfile(); }
      const stats=p.heroDay.stats||{};
      let shots=0,makes=0;
      for(const id of Object.keys(stats)){
        const d=stats[id]||{};
        shots += Math.max(0, Number(d.shots)||0);
        makes += Math.max(0, Number(d.makes)||0);
      }
      makes=Math.min(makes,shots);
      return {key:k,shots,makes};
    },
    _fairAccScore(makes,shots){
      shots=Math.max(0,Number(shots)||0); makes=clamp(Number(makes)||0,0,shots);
      if(!shots) return 0;
      const p=makes/shots, z=1.64;
      const denom=1+z*z/shots;
      const center=p+z*z/(2*shots);
      const margin=z*Math.sqrt((p*(1-p)+z*z/(4*shots))/shots);
      return Math.max(0,(center-margin)/denom);
    },
    _leaderboardLocalRow(){
      const t=this._playerDayTotals();
      const L=this.save&&this.save.login?this.save.login:{};
      const name=String((L.name||'').trim()||'本機玩家');
      return {player_name:name,today_key:t.key,today_shots:t.shots,today_makes:t.makes,_local:true};
    },
    _normalLeaderboardRow(row){
      if(!row) return null;
      const name=String(row.player_name||row.name||'').trim();
      if(!name) return null;
      const shots=Math.max(0,Number(row.today_shots!=null?row.today_shots:row.shots)||0);
      const makes=clamp(Number(row.today_makes!=null?row.today_makes:row.makes)||0,0,shots);
      return {
        name,
        shots,
        makes,
        local:!!row._local,
        updated:row.last_login_at||row.updated_at||'',
        qualified:shots>=MIN_QUALIFIED_SHOTS,
        acc:pct(makes,shots),
        score:this._fairAccScore(makes,shots)
      };
    },
    _leaderboardRows(){
      const rows=[];
      const add=(row)=>{
        const r=this._normalLeaderboardRow(row);
        if(!r) return;
        const key=r.name.toLowerCase();
        const i=rows.findIndex(x=>x.name.toLowerCase()===key);
        if(i<0) rows.push(r);
        else {
          const cur=rows[i];
          if(r.local || r.shots>cur.shots || (r.shots===cur.shots && r.makes>cur.makes)) rows[i]=Object.assign(cur,r,{local:cur.local||r.local});
        }
      };
      const cache=Array.isArray(this._leaderboardCache)?this._leaderboardCache:[];
      for(const r of cache) add(r);
      add(this._leaderboardLocalRow());
      rows.sort((a,b)=>{
        if(a.qualified!==b.qualified) return a.qualified?-1:1;
        if(b.score!==a.score) return b.score-a.score;
        if(b.acc!==a.acc) return b.acc-a.acc;
        if(b.shots!==a.shots) return b.shots-a.shots;
        return a.name.localeCompare(b.name,'zh-Hant');
      });
      let rank=1;
      for(const r of rows){ r.rank=r.qualified?rank++:'觀察'; }
      return rows.slice(0,50);
    },
    _syncLeaderboardStats(force){
      if(this.save&&this.save.admin) return;
      if(this._leaderboardSyncTimer){ clearTimeout(this._leaderboardSyncTimer); this._leaderboardSyncTimer=null; }
      const run=()=>this._syncLeaderboardNow().catch(e=>{ this._leaderboardSyncError=e; });
      if(force) run(); else this._leaderboardSyncTimer=setTimeout(run,800);
    },
    async _syncLeaderboardNow(){
      const cfg=this._supabaseCfg ? this._supabaseCfg() : {};
      const L=this.save&&this.save.login?this.save.login:{};
      const name=String((L.name||'').trim());
      if(!cfg.url||!cfg.key||!name) return false;
      const t=this._playerDayTotals();
      const base=cfg.url.replace(/\/+$/,'')+'/rest/v1/'+encodeURIComponent(cfg.table||'player_accounts');
      const payload={
        player_name:name,
        today_key:t.key,
        today_shots:t.shots,
        today_makes:t.makes,
        last_login_at:new Date().toISOString()
      };
      const res=await fetch(base+'?on_conflict=player_name',{
        method:'POST',
        headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(payload)
      });
      if(!res.ok) throw new Error(await res.text());
      return true;
    },
    _openLeaderboard(){
      this._leaderboardOpen=true;
      this._leaderboardLoading=true;
      this._leaderboardStatus='載入雲端排行榜...';
      this._syncLeaderboardStats(true);
      this._fetchLeaderboard();
      this.render();
    },
    _closeLeaderboard(){
      this._leaderboardOpen=false;
      this.render();
    },
    async _fetchLeaderboard(){
      const cfg=this._supabaseCfg ? this._supabaseCfg() : {};
      if(!cfg.url||!cfg.key){
        this._leaderboardLoading=false;
        this._leaderboardStatus='目前顯示本機成績';
        this.render();
        return;
      }
      try{
        const base=cfg.url.replace(/\/+$/,'')+'/rest/v1/'+encodeURIComponent(cfg.table||'player_accounts');
        const q='?select=player_name,today_key,today_shots,today_makes,last_login_at&today_key=eq.'+encodeURIComponent(this._dayKey())+'&order=today_shots.desc&limit=100';
        const res=await fetch(base+q,{headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key}});
        if(!res.ok) throw new Error(await res.text());
        this._leaderboardCache=await res.json();
        this._leaderboardStatus=(this._leaderboardCache&&this._leaderboardCache.length)?'雲端排行榜已更新':'今天還沒有雲端成績';
      }catch(e){
        this._leaderboardCache=[];
        this._leaderboardStatus='雲端排行榜欄位未建立，先顯示本機成績';
        try{ console.warn('[HB leaderboard]',e); }catch(_e){}
      }finally{
        this._leaderboardLoading=false;
        this.render();
      }
    },
    _drawLeaderboardButton(x,y,w,h,label,id,cb,primary){
      const ctx=this.ctx;
      this.rr(x,y,w,h,12);
      const g=ctx.createLinearGradient(0,y,0,y+h);
      if(primary){ g.addColorStop(0,'#c7ff3a'); g.addColorStop(1,'#5d9416'); }
      else { g.addColorStop(0,'rgba(40,28,16,0.96)'); g.addColorStop(1,'rgba(14,9,6,0.98)'); }
      ctx.fillStyle=g; ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle=primary?'#d7a945':'rgba(215,169,69,0.62)';
      this.rr(x,y,w,h,12); ctx.stroke();
      this.text(label,x+w/2,y+h/2,26,primary?'#111706':'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
      this.btn(x,y,w,h,id,cb);
    },
    drawLeaderboardModal(){
      const ctx=this.ctx;
      const IL=this.insL||0,IR=this.insR||0,IT=this.insT||0,IB=this.insB||0;
      ctx.save();
      ctx.fillStyle='rgba(3,1,7,0.92)';
      ctx.fillRect(-4000,-4000,BW+8000,BH+8000);
      ctx.restore();
      this.btn(-4000,-4000,BW+8000,BH+8000,'leaderboard_scrim',()=>{});

      const x=IL+46,y=IT+34,w=BW-IL-IR-92,h=BH-IT-IB-68;
      ctx.save();
      this.rr(x,y,w,h,22);
      const bg=ctx.createLinearGradient(0,y,0,y+h);
      bg.addColorStop(0,'rgba(23,16,12,0.98)');
      bg.addColorStop(0.5,'rgba(10,8,11,0.99)');
      bg.addColorStop(1,'rgba(6,4,9,0.99)');
      ctx.fillStyle=bg; ctx.fill();
      ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22); ctx.stroke();
      ctx.lineWidth=1.5; ctx.strokeStyle='rgba(185,255,47,0.35)'; this.rr(x+12,y+12,w-24,h-24,16); ctx.stroke();
      ctx.restore();

      const titleY=y+74;
      this.text('今日命中排行榜',x+w/2,titleY,48,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:14});
      this.text('正式排名需滿 '+MIN_QUALIFIED_SHOTS+' 球；排名採保守命中率，避免 1/1 霸榜',x+w/2,titleY+46,22,'#c8b894',{align:'center',baseline:'middle',weight:'700'});
      this._drawLeaderboardButton(x+w-156,y+28,112,52,'關閉','leaderboard_close',()=>this._closeLeaderboard(),false);
      this._drawLeaderboardButton(x+44,y+28,112,52,'刷新','leaderboard_refresh',()=>{ this._leaderboardLoading=true; this._leaderboardStatus='重新整理...'; this._fetchLeaderboard(); this.render(); },true);

      const tx=x+60, ty=y+154, tw=w-120, rowH=58;
      const cols={rank:tx+46,name:tx+170,shot:tx+tw*0.62,acc:tx+tw-120};
      ctx.save();
      this.rr(tx,ty,tw,54,12); ctx.fillStyle='rgba(215,169,69,0.12)'; ctx.fill();
      ctx.strokeStyle='rgba(215,169,69,0.35)'; ctx.lineWidth=1.5; this.rr(tx,ty,tw,54,12); ctx.stroke();
      ctx.restore();
      this.text('排行',cols.rank,ty+28,22,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('玩家名稱',cols.name,ty+28,22,'#d7a945',{baseline:'middle',weight:'900'});
      this.text('投球/進球',cols.shot,ty+28,22,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
      this.text('命中率',cols.acc,ty+28,22,'#d7a945',{align:'center',baseline:'middle',weight:'900'});

      const rows=this._leaderboardRows();
      const maxRows=Math.max(5,Math.floor((h-260)/rowH));
      for(let i=0;i<Math.min(rows.length,maxRows);i++){
        const r=rows[i], ry=ty+66+i*rowH;
        ctx.save();
        this.rr(tx,ry,tw,rowH-8,10);
        if(r.local) ctx.fillStyle='rgba(159,224,36,0.16)';
        else ctx.fillStyle=i%2?'rgba(255,255,255,0.035)':'rgba(0,0,0,0.14)';
        ctx.fill();
        ctx.strokeStyle=r.local?'rgba(185,255,47,0.55)':'rgba(215,169,69,0.18)';
        ctx.lineWidth=1.2; this.rr(tx,ry,tw,rowH-8,10); ctx.stroke();
        ctx.restore();
        const rankText=String(r.rank);
        const accText=r.shots?Math.round(r.acc*100)+'%':'0%';
        const muted=r.qualified?'#efe3ca':'#9e9178';
        this.text(rankText,cols.rank,ry+25,22,r.qualified?'#ffe7a6':'#9fe024',{align:'center',baseline:'middle',weight:'900'});
        this.text(this._clip((r.local?'★ ':'')+r.name,tw*0.34,24,'900'),cols.name,ry+25,24,r.local?'#d8ff44':muted,{baseline:'middle',weight:'900'});
        this.text(r.shots+' / '+r.makes,cols.shot,ry+25,23,muted,{align:'center',baseline:'middle',weight:'800'});
        this.text(accText,cols.acc,ry+25,24,r.qualified?'#ece0c4':'#b6aa90',{align:'center',baseline:'middle',weight:'900'});
        if(!r.qualified && r.shots>0) this.text('未滿'+MIN_QUALIFIED_SHOTS+'球',cols.acc+88,ry+25,15,'#9fe024',{baseline:'middle',weight:'800'});
      }
      if(!rows.length){
        this.text('今天還沒有投球資料',x+w/2,y+h/2,34,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
      }
      const status=this._leaderboardLoading?'載入中...':(this._leaderboardStatus||'');
      this.text(status,x+w/2,y+h-44,20,'#9e9178',{align:'center',baseline:'middle',weight:'700'});
    },
    _drawFbStatCards(LO){
      const U=LO.U,s=this.save,total=this._playerDayTotals();
      const acc=total.shots?Math.round(total.makes/total.shots*100):0;
      this._gothCard(LO.statL,U); this._statIcon('target',LO.statL.x+18*U,LO.statL.y+LO.statL.h*0.62,7*U);
      this.text('今日命中', LO.statL.x+14*U, LO.statL.y+16*U, 11*U,'#a2926e');
      this.text(acc+'%', LO.statL.x+32*U, LO.statL.y+LO.statL.h*0.58, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
      this.text(total.shots+' / '+total.makes, LO.statL.x+LO.statL.w-16*U, LO.statL.y+LO.statL.h*0.58, 10*U,'#9fe024',{align:'right',baseline:'middle',weight:'800'});
      this.text('排行榜 ›', LO.statL.x+LO.statL.w-14*U, LO.statL.y+18*U, 9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
      this.btn(LO.statL.x,LO.statL.y,LO.statL.w,Math.max(44*U,LO.statL.h),'fb_leaderboard',()=>this._openLeaderboard());
      this._gothCard(LO.statR,U); this._statIcon('crown',LO.statR.x+18*U,LO.statR.y+LO.statR.h*0.62,7*U);
      this.text('無盡最佳', LO.statR.x+14*U, LO.statR.y+16*U, 11*U,'#a2926e');
      this.text(String(s.endlessBest|0), LO.statR.x+32*U, LO.statR.y+LO.statR.h*0.62, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    }
  });

  Game.prototype._recordShot=function(id,made,type){
    const r=oldRecordShot.apply(this,arguments);
    this._syncLeaderboardStats(false);
    return r;
  };
  if(oldSubmitLogin){
    Game.prototype._submitLogin=async function(){
      const r=await oldSubmitLogin.apply(this,arguments);
      this._syncLeaderboardStats(true);
      return r;
    };
  }
  Game.prototype.render=function(){
    oldRender.apply(this,arguments);
    if(this.portrait || !this._leaderboardOpen) return;
    const ctx=this.ctx,dpr=this.dpr;
    ctx.setTransform(this.scale*dpr,0,0,this.scale*dpr,this.ox*dpr,this.oy*dpr);
    this.drawLeaderboardModal();
    ctx.setTransform(1,0,0,1,0,0);
  };
})();
// === part 5 below ===
// ============================================================
// PART 5 — run lifecycle, host, guards, shot input + physics
// ============================================================
// hoop position pool tiers (relative to host anchor). x = host.x + dx, y = baseY + dy
const POS_POOL=[ // {dx,dy,label}  dx negative = closer to player(left)
  {dx:-40, dy:-40, label:'近低'}, {dx:-20, dy:-260, label:'近高'},
  {dx:80, dy:-80, label:'中低'}, {dx:120, dy:-220, label:'中標'}, {dx:90, dy:-360, label:'中高'},
  {dx:240, dy:-120, label:'遠低'}, {dx:300, dy:-300, label:'遠標'},
  {dx:340, dy:-520, label:'遠極高'}, {dx:-80, dy:-560, label:'近極高'},
  {dx:-400, dy:-120, label:'貼框低'}, {dx:-520, dy:-180, label:'貼框'},
];
// Phase 5-1b: in-run growth reward pool (12)
const REWARDS={
  heal:{id:'heal',name:'回血',type:'生存',desc:'恢復 25% 體力',instant:true},
  shield:{id:'shield',name:'護盾',type:'生存',desc:'獲得 20 護盾',instant:true},
  ironhide:{id:'ironhide',name:'鐵皮',type:'生存',desc:'本局受傷 -15%',mod:'damageReduce',delta:0.15,cap:0.45,maxStack:3},
  regen:{id:'regen',name:'續命',type:'生存',desc:'每場開始回 5% 體力',mod:'stageStartHeal',delta:0.05,cap:0.15,maxStack:3},
  nearfocus:{id:'nearfocus',name:'近框專注',type:'投籃',desc:'近框位傷害 +15%',mod:'nearMul',delta:0.15,maxStack:3},
  farfocus:{id:'farfocus',name:'遠框專注',type:'投籃',desc:'遠框位傷害 +15%',mod:'farMul',delta:0.15,maxStack:3},
  fireup:{id:'fireup',name:'火勢',type:'攻擊',desc:'fire 傷害 +15%',mod:'fireMul',delta:0.15,maxStack:3},
  frost:{id:'frost',name:'霜裂',type:'攻擊',desc:'ice 傷害 +15%',mod:'iceMul',delta:0.15,maxStack:3},
  thunder:{id:'thunder',name:'雷鳴',type:'攻擊',desc:'lightning 傷害 +15%',mod:'lightningMul',delta:0.15,maxStack:3},
  bankfaith:{id:'bankfaith',name:'擦板信仰',type:'攻擊',desc:'擦板進球傷害 +15%',mod:'bankMul',delta:0.15,maxStack:3},
  swishzeal:{id:'swishzeal',name:'空心狂熱',type:'攻擊',desc:'空心進球傷害 +15%',mod:'swishMul',delta:0.15,maxStack:3},
  luckydisc:{id:'luckydisc',name:'幸運球徒',type:'攻擊',desc:'幸運球傷害 +15%',mod:'luckyMul',delta:0.15,maxStack:3},
};
const REWARD_IDS=Object.keys(REWARDS);
Object.assign(Game.prototype,{
  // routeType: 'fast' | 'std' | 'corrupt' ; stone: id
  startRun(actId, routeType, stoneId, nodeIdx){
    const s=this.save; const heroId=s.hero;
    // build stage path for this act
    const all=STAGES[actId]; let path; const nodeMode=(nodeIdx!=null);
    if(nodeMode){ const ni=Math.max(0,Math.min(all.length-1,nodeIdx|0)); path=[all[ni]]; nodeIdx=ni; }   // 逐關模式：只打選定節點（模式/石板仍套用為修飾）
    else if(routeType==='fast'){ path=[all[0],all[2],all[4]]; }                    // 2 + boss(idx4)
    else if(routeType==='corrupt'){ path=[all[0],all[1],all[2],all[3],all[4]]; }
    else { path=[all[0],all[1],all[2],all[3],all[4]]; }                       // Phase 5-2 std: 4 normal + boss(idx4), all acts
    if(!nodeMode && stoneId==='nogate' && path.length>2){ path=[path[0],path[path.length-1]]; }
    // aggregate relic effects
    const relics=s.relics.filter(Boolean).map(id=>({id,...RELICS[id]}));
    // Phase 4-3: loadout = display + opening form ONLY (never feeds relicIds/old hooks)
    const _loSrc=(s.loadout&&s.loadout.some(Boolean))? s.loadout : s.relics;
    const loadout=[0,1,2,3,4].map(i=> (_loSrc&&_loSrc[i]!=null)? _loSrc[i] : null);
    const ballId=loadout[2];
    let startForm=(ballId&&RELICS[ballId]&&RELICS[ballId].form)?RELICS[ballId].form:'normal';
    const hero=HEROES.find(h=>h.id===heroId);
    this.run={ act:actId, route:routeType, stone:stoneId, path, pi:0, stage:null,
      heroId, hero, relics, relicIds:s.relics.filter(Boolean), loadout,
      hp:100, maxhp:100, shield:0,
      form:startForm, level:1, xp:0, xpNext:100, levelUpsPending:0, gold:0,
      abilities:{}, words:[], comboMax:10, combo:0,
      score:0, shots:0, makes:0, swishes:0, banks:0, kills:0, bestCombo:0,
      host:null, hoop:null, guards:[], ball:null, projectiles:[], fx:[],
      aiming:false, aimX:0, aimY:0, intf:[], shotCount:0,
      modal:null, banner:null, invuln:0, hitFlash:0, shake:0,
      firstMissUsed:false, riftUsed:false, hexN:0, siphonCd:0,
      tutorial:!s.tutorialDone && actId===1,
      corrupt: routeType==='corrupt', heat: this._mp(routeType).heat[actId+'-boss']||0,
      _acc:0, nextBall:0, _scoredBalls:0, _boardBuff:false, rewardPending:false, actCleared:false, nodeMode, nodeIdx:(nodeMode?nodeIdx:null),
      shopBought:{}, rewardLog:[], mut:{}, _firstElemDone:false, _stageMakes:0, _missStageShield:false,
      mods:{ fireMul:1, iceMul:1, lightningMul:1, swishMul:1, bankMul:1, luckyMul:1, nearMul:1, farMul:1, damageReduce:0, stageStartHeal:0,
        swishExtra:0, bankAoe:0, luckyExecute:0, extraChainChance:0, executeMul:0, stageStartShield:0, missShield:0,
        bonusGoldMul:0, killGoldBonus:0, xpMul:0, comboDmgPerStack:0, minPreviewBonus:0,
        allDmgMul:1, flatExtraHit:0, enchLightning:0, enchFire:0, enchIce:0 }, modStacks:{}, rewardChoices:[],
    };
    // Phase 6.1: 載入該英雄永久等級 (遊戲內等級 = 選單等級 = 同一個，不歸零)
    { const _pr=this._heroProg(heroId); this.run.level=_pr.level; this.run.xp=_pr.xp; this.run.xpNext=Math.min(180,Math.round(100*Math.pow(1.15,this.run.level-1))); }
    this._applyTalentEffectsToRun(this.run);
    // sessionStats: 跨幕遠征累計 (act1 重啟一段新遠征)
    if(actId===1 || !this.sessionStats) this.sessionStats={ score:0, kills:0, gold:0, coins:0, shots:0, makes:0, swishes:0, banks:0, bestCombo:0, acts:0 };
    // 幕間獎金 (天賦 m_gold)
    if(this.run.mut && this.run.mut.actGold>0) this.run.gold+=this.run.mut.actGold;
    // champion ball relic / hero passives applied at use-time
    this.screen='battle'; this._paused=false; this.cam={y:0,zoom:1,ty:0,tz:1};
    if(routeType==='fast'){
      this.run.speed=true; this.run.sandbag=true; this.run.nodeMode=false; this.run.nodeIdx=null;
      this.run.shotClockMax=10; this.run.shotClock=10; this.run.speedBaseDmg=15; this.run.speedScore=0; this.run.speedViolations=0;
      this.run.path=[{name:'速投生存',speed:true,tier:1,boss:false}];
      this.enterSpeedStage();
    } else {
      this.enterStage(0);
    }
  },

  enterSpeedStage(){ const run=this.run; run.pi=0; const stage=run.path[0]; run.stage=stage;
    run.guards=[]; run.projectiles=[]; run.fx=[]; run.intf=[]; run.shotCount=0; run.firstMissUsed=false; run.prevTraj=null;
    run.banner={ text:ACTS[run.act-1].name+' · 速投生存', sub:(SANDBAGS[run.act]?SANDBAGS[run.act].name:'沙包'), t:2.6 };
    const lefty=this.save.settings.lefty; const baseHostX = lefty? 560 : BW-560;
    run.host={ name:(SANDBAGS[run.act]?SANDBAGS[run.act].name:'沙包'), x:baseHostX, y:BH-300, baseY:BH-300, moving:0, mx:baseHostX, anim:0, boss:false, phase:1, posIdx:0, hop:0 };
    run.boss=null; run.hoop=this.makeHoop(run.host);
    // 沙包替身：隱形被動無敵 guard，定位在沙包身上，讓玩家攻擊/特效打在沙包上
    { const sgx=lefty? 360 : BW-360, sgy=BH-470;
      run.guards=[{ type:'sandbag', name:'沙包', hp:1e9, maxhp:1e9, r:150, color:'#caa27a', x:sgx, y:sgy, bx:sgx, by:sgy, ox:0, oy:0, wphase:0, slot:0, flash:0, dead:false, sandbag:true, _static:true, shieldUp:false, intf:null, cast:0, castMax:0, casting:false, burn:0, burnDps:0, slow:0, frozen:false, freeze:0, frostStk:0, phased:false, vx:0, vy:0 }]; }
    run.guardsTotal=0; run.spawned=0; run.bossWave=0; run.waveSize=0; run.repos=0;
    this._speedHoopPos(true); this.spawnBall(); this.audio.sfx('ui');
  },

  enterStage(pi){ const run=this.run; run.pi=pi; const stage=run.path[pi]; run.stage=stage;
    if(run.mods && run.mods.stageStartHeal>0) this.heal(Math.round(run.maxhp*Math.min(0.15,run.mods.stageStartHeal)));
    if(run.mods && run.mods.stageStartShield>0) run.shield=(run.shield||0)+run.mods.stageStartShield;
    run._stageMakes=0; run._missImmuneUsed=false; run._missStageShield=false;
    run.guards=[]; run.projectiles=[]; run.fx=[]; run.intf=[]; run.shotCount=0; run.firstMissUsed=false; run.prevTraj=null;
    run.banner={ text:`${ACTS[run.act-1].name} · ${stage.name}`, sub: stage.boss?'幕級 BOSS':'菁英宿主', t:2.6 };
    // host
    const lefty=this.save.settings.lefty; const baseHostX = lefty? 560 : BW-560;
    run.host={ name:stage.host, body:stage.body, x:baseHostX, y:BH-300, baseY:BH-300, moving:0, mx:baseHostX, anim:0,
      boss:!!stage.boss, phase:1, posIdx:0, hop:0 };
    run.boss = stage.boss ? {shots:0,bellCount:0,bellArmed:false,taxCount:0,missStreak:0,foulCount:0,foulType:null} : null;
    // hoop bound to host
    run.hoop=this.makeHoop(run.host);
    // guards: wave-based
    run.guardsTotal=stage.count; run.spawned=0; run.bossWave=0;
    run.waveSize = stage.boss? Math.ceil(stage.count/(stage.waves||3)) : stage.count;
    this.spawnWave(run.waveSize); run.spawned=Math.min(run.waveSize, stage.count);
    this.pickHoopPos(true);
    this.spawnBall();
    this.audio.sfx(stage.boss?'boss':'ui');
  },

  makeHoop(host){ return { x:host.x-120, y:host.baseY-200, rimR:64, rimThick:9, boardW:20, boardH:180, netH:84, glow:0, lit:0, net:0, sensorY:0, posIdx:3 }; },

  spawnWave(n){ const run=this.run; const stage=run.stage; const types=stage.guards;
    for(let i=0;i<n;i++){ this.spawnGuard(pick(types)); }
    // elite shield variants for act4 anvil
    if(stage.shieldElite){ for(let i=0;i<stage.shieldElite;i++){ const g=this.spawnGuard('shield'); g.elite=true; g.hp*=2; g.maxhp=g.hp; g.r*=1.2; } }
  },

  spawnGuard(type){ const run=this.run; const def=GUARDS[type]; const host=run.host;
    // orbit position around host
    const ang=rand(0,TAU), rad=rand(120,330);
    const g={ type, name:def.name, hp:def.hp, maxhp:def.hp, r:def.r, color:def.color,
      x: clamp(host.x+Math.cos(ang)*rad, 700, BW-60), y: clamp(host.baseY+Math.sin(ang)*rad*0.6, BH*0.42, BH-130),
      ox:0, oy:0, wphase:rand(0,TAU), flash:0, dead:false,
      shieldUp: def.shield||false, intf: def.intf||null,
      cast:0, castMax: def.intf?randi(2,3):0, casting:false,
      burn:0, burnDps:0, slow:0, frozen:false, freeze:0, frostStk:0, phased:false,
      vx:0, vy:0 };
    g.bx=g.x; g.by=g.y; run.guards.push(g); return g;
  },

  _pickHoopCard(excludeIdx){ const run=this.run; const a=run.act, pi=run.pi;
    // Phase 5-1a/5-2: per-act distance-tiered frame selection (keeps Phase 4-6 card architecture; only constrains eligible POS_POOL idx)
    const NEAR=[9,10,0,1], MID=[2,3,4], FAR=[5,6,7,8]; const isFar=(i)=>FAR.indexOf(i)>=0; const streak=(run._farStreak||0);
    let cand;
    if(a===1){
      if(pi<=1) cand=NEAR.concat(MID);                                              // 第1-2關:只近+中
      else if(pi<=3){ cand=NEAR.concat(MID); if(!run._lastWasFar) cand=cand.concat([5]); } // 第3-4關:近中+少量遠低,不連續
      else cand=(streak>=2)? NEAR.concat(MID) : MID.concat(FAR).concat(NEAR);        // Boss
    } else if(a===2){                                                               // 近/中為主+少量遠
      cand=NEAR.concat(MID); if(!run._lastWasFar) cand=cand.concat([5,6]);
    } else if(a===3){                                                               // 中為主,遠增加
      cand=(streak>=2)? NEAR.concat(MID) : MID.concat(MID).concat([5,6,7]).concat(NEAR);
    } else if(a===4){                                                               // 中/遠混合,遠不長連發
      cand=(streak>=2)? NEAR.concat(MID) : MID.concat(FAR).concat([5,6,7]);
    } else {                                                                        // act5:更難,但每隔幾球回近/中
      cand=(streak>=2)? NEAR.concat(MID) : MID.concat(FAR).concat(FAR).concat(NEAR);
    }
    let pool=cand.filter(i=>i!==excludeIdx); if(pool.length===0) pool=cand.slice();
    const idx=pool[randi(0,pool.length-1)];
    run._lastWasFar=isFar(idx); run._farStreak=isFar(idx)?(streak+1):0;
    return idx; },
  _speedHoopPos(force){ const run=this.run; const H=run.hoop; const host=run.host; const lefty=this.save.settings.lefty;
    const xMin = lefty? BW*0.40 : BW*0.20, xMax = lefty? BW*0.80 : BW*0.58;
    const tx = rand(xMin, xMax), ty = rand(BH*0.34, BH*0.56);
    H.tx=tx; H.ty=ty; host.tx=clamp(tx+(lefty?-150:150), 200, BW-200);
    if(force){ H.x=tx; H.y=ty; host.x=host.tx; run.repos=0; } else { run.repos=0.7; }
  },
  pickHoopPos(force){ const run=this.run; const host=run.host; const H=run.hoop;
    // Phase 4-6: on score-reposition apply telegraphed card (run.nextHoopAct); on force/init pick fresh. POS_POOL = position card deck.
    let idx;
    if(!force && run.nextHoopAct!=null) idx = run.nextHoopAct.idx;
    else idx = this._pickHoopCard(H.posIdx);
    H.posIdx=idx; const p=POS_POOL[idx]; const lefty=this.save.settings.lefty;
    // absolute positioning (fixed base + POS_POOL offset; never accumulates)
    host.tx = clamp(host.baseX!=null?host.baseX:host.x, lefty?480:BW-720, lefty?900:BW-360);
    H.ty = clamp(host.baseY + p.dy, BH*0.33, host.baseY);
    // 重力干擾(G×1.25)下、最大力道仍可投進的最遠 rim x（含空氣阻力，越高越近）；保證任何位置都投得到
    const reach = 1240 + 1.2*H.ty;
    if(lefty){ const txRaw=(BW-720)+(-p.dx); H.tx = clamp(Math.max(txRaw, BW-reach), 260, BW-760); }
    else     { const txRaw=(BW-560)+(p.dx);  H.tx = clamp(Math.min(txRaw, reach), 760, BW-260); }
    H.label = p.label;
    run.hoopAct = {idx, label:p.label};
    const ni=this._pickHoopCard(idx); const np=POS_POOL[ni];
    run.nextHoopAct = {idx:ni, label:np.label, dx:np.dx, dy:np.dy};
    if(force){ H.x=H.tx; H.y=H.ty; host.x=host.mx; }
    run.repos=force?0:0.7; // reposition timer (host moves) — only between shots
  },

  spawnBall(){ const run=this.run; if(!run) return; if(run.speed) run.shotClock=run.shotClockMax; const lefty=this.save.settings.lefty; const hx=lefty?BW-210:210;
    run.ball={ x:hx, y:BH-168, vx:0, vy:0, r:28, spin:0, angVel:0, live:false, held:true, scored:false, hitBoard:false, hitRim:false, rimBounces:0, _rimLatch:false, scoreType:null, lefty, settle:0, born:this.t, landed:false, _py:undefined };
    run.aiming=false;
  },

  // ----- battle pointer -----
  battleDown(x,y){ const run=this.run; if(run.modal) return;
    if(this._pauseHit && x>=this._pauseHit.x&&x<=this._pauseHit.x+this._pauseHit.w&&y>=this._pauseHit.y&&y<=this._pauseHit.y+this._pauseHit.h){ this._paused=true; return; }
    const b=run.ball; if(!b||!b.held||b.live||run.repos>0) return;
    if(dist(x,y,b.x,b.y)<170){ run.aiming=true; run.aimX=x; run.aimY=y; if(run.tutorial&&run.tutStep==null) run.tutStep=1; }
  },
  battleMove(x,y){ const run=this.run; if(run.aiming){ run.aimX=x; run.aimY=y; if(run.tutorial&&run.tutStep===1&&dist(x,y,run.ball.x,run.ball.y)>120) run.tutStep=2; } },
  battleUp(x,y){ const run=this.run; if(!run.aiming) return; run.aiming=false; const b=run.ball;
    const _ax=(run.aimStartX!=null?run.aimStartX:b.x), _ay=(run.aimStartY!=null?run.aimStartY:b.y); const dx=_ax-x, dy=_ay-y, pull=Math.hypot(dx,dy);
    if(pull<60) return; // cancel
    let maxPull=520; if(this._intfActive('maxPull')) maxPull*=0.85; if(this._intfActive('slowCharge')) maxPull*=1.15;
    const p=clamp(pull,0,maxPull)/maxPull; const power=lerp(820,2650,p); const ang=Math.atan2(dy,dx);
    b.vx=Math.cos(ang)*power; b.vy=Math.sin(ang)*power; b.angVel=(b.lefty?-1:1)*(-b.vx*0.004+6);
    b.live=true; b.held=false; b.scored=false; b.hitBoard=false; b.hitRim=false; b.landed=false; b.born=this.t; b.trail=[];
    run.shots++; this.save.stats.totalShots++; this.audio.sfx('release'); this.audio.sfx('whoosh'); this.vibrate(8);
    const fc=this._ballColor(run.form);
    this.ringFx(b.x,b.y,fc,0.24,{r0:8,r1:120,width:9});
    this.burst(b.x,b.y,14,fc,300,0.42,{kind:'streak',dir:ang,spread:0.7,glow:true,r:4,g:120,len:58});
    if(run.tutorial&&(run.tutStep||0)<3) run.tutStep=3;
    this._recordPrevTraj(b);
  },

  _intfActive(kind){ const run=this.run; return run.intf.some(i=>i.kind===kind&&i.shots>0); },
  _gravMul(){ return this._intfActive('gravity')? 1.25:1; },
  _mainIntf(){ const run=this.run; for(const i of run.intf){ if(i.shots>0)return i; } return null; },

  // ----- shot physics (no ceiling, land-through-net) -----
  stepBall(h){ const run=this.run; const b=run.ball; if(!b||!b.live) return;
    const G=2600*this._gravMul(), DRAG=0.0016;
    b.vy+=G*h; const sp=Math.hypot(b.vx,b.vy); b.vx-=b.vx*DRAG*sp*h*0.012; b.vy-=b.vy*DRAG*sp*h*0.012;
    b.x+=b.vx*h; b.y+=b.vy*h; b.spin+=b.angVel*h;
    if(!this.save.settings.reduceMotion){ const fb=this._fxBudget(), fc=this._ballColor(run.form), trailMul=run.form==='normal'?1:(fb.mobile?1.85:2.15), trailMax=Math.round(fb.trailMax*trailMul); if(!b.trail)b.trail=[]; b.trail.push([b.x,b.y]); if(b.trail.length>trailMax)b.trail.shift(); if(sp>520&&chance(run.form==='normal'?fb.trailChance:Math.min(0.45,fb.trailChance*1.75))) this.spawn(b.x,b.y,rand(-22,22),rand(-18,18),run.form==='normal'?0.24:0.36,rand(3,run.form==='normal'?6:8),fc,{kind:'streak',glow:true,g:90,drag:0.94,len:run.form==='normal'?24:42}); }
    const floorY=BH-92;
    if(b.y+b.r>floorY && b.vy>0){ b.y=floorY-b.r; b.vy*=-0.5; b.vx*=0.82; b.angVel*=0.6; if(Math.abs(b.vy)>120){ const fc=this._ballColor(run.form); this.audio.sfx('floor'); this.burst(b.x,floorY,8,'#6a5238',210,0.46,{kind:'smoke',r:8,g:-20,alpha:0.7}); this.burst(b.x,floorY,7,fc,210,0.34,{kind:'shard',glow:true,r:3,g:420}); this.ringFx(b.x,floorY,fc,0.22,{r0:10,r1:86,width:6,glow:false}); } if(!b.landed&&b.scored){ b.landed=true; this.landingFx(); } }
    if(b.x-b.r<0){ b.x=b.r; b.vx*=-0.5; } if(b.x+b.r>BW){ b.x=BW-b.r; b.vx*=-0.5; }
    // NO ceiling: allow negative y. camera follows high shots
    this.collideHoop(b);
    const speed=Math.hypot(b.vx,b.vy);
    if(speed<60 && b.y+b.r>=floorY-2){ b.settle+=h; if(b.settle>0.25){ if(!b.scored) this.endShot(false); else this.endShot(true); } } else b.settle=0;
    if(this.t-b.born>7){ if(!b.scored) this.endShot(false); else this.endShot(true); }
  },
  collideHoop(b){ const run=this.run; const H=run.hoop; if(!H) return;
    const boardX=H.x+H.rimR+8, bt=H.y-H.boardH*0.55, bb=H.y+H.boardH*0.45;
    if(b.x+b.r>boardX&&b.x-b.r<boardX+H.boardW&&b.y>bt&&b.y<bb&&b.vx>0){ b.x=boardX-b.r; b.vx*=-0.6; b.vy*=0.92; b.hitBoard=true; this.audio.sfx('board'); const rc=ACTS[run.act-1].rune; this.flashFx(boardX,b.y,rc,130,0.12); this.burst(boardX,b.y,11,rc,250,0.42,{kind:'shard',glow:true,r:4,g:180}); this.ringFx(boardX,b.y,rc,0.24,{r0:8,r1:150,width:8}); run.shake=Math.max(run.shake||0,6); H.glow=0.85; }
    const lx=H.x-H.rimR, rx=H.x+H.rimR;
    let _rimTouch=false,_rimX=H.x; for(const rxp of [lx,rx]){ const d=dist(b.x,b.y,rxp,H.y); if(d<b.r+H.rimThick){ const nx=(b.x-rxp)/(d||1),ny=(b.y-H.y)/(d||1); const ov=b.r+H.rimThick-d; b.x+=nx*ov; b.y+=ny*ov; const dot=b.vx*nx+b.vy*ny; b.vx-=1.6*dot*nx; b.vy-=1.6*dot*ny; b.vx*=0.78; b.vy*=0.78; b.hitRim=true; _rimTouch=true; _rimX=rxp; this.audio.sfx('rim'); H.glow=0.75; } } if(_rimTouch){ if(!b._rimLatch){ b.rimBounces=(b.rimBounces||0)+1; b._rimLatch=true; const rc=ACTS[run.act-1].rune; this.burst(_rimX,H.y,12,rc,310,0.34,{kind:'streak',glow:true,r:4,g:240,len:42}); this.ringFx(_rimX,H.y,rc,0.22,{r0:4,r1:118,width:7}); run.shake=Math.max(run.shake||0,7); } } else { b._rimLatch=false; }
    if(!b.scored && b.vy>0 && b._py!=null){ if(b._py<=H.y && b.y>=H.y && b.x>lx+6 && b.x<rx-6){ this.makeBasket(); H.net=18; } }
    b._py=b.y;
  },
  landingFx(){ const run=this.run; const b=run.ball; const f=run.form;
    if(f==='fire'){ this.elementImpactFx('fire',b.x,b.y,'#ff7a3c',0.52); }
    else if(f==='ice'){ this.elementImpactFx('ice',b.x,b.y,'#6fd8ff',0.54); }
    else if(f==='lightning'){ this.elementImpactFx('lightning',b.x,b.y,'#ffe14d',0.55); }
    else if(f==='axe'){ this.audio.sfx('axe'); this.shockFx(b.x,b.y,'#cdd2da',140,0.24); this.burst(b.x,b.y,10,'#cdd2da',220,0.42,{kind:'shard',r:4,g:180}); }
    else if(f==='arrow'){ this.burst(b.x,b.y,10,'#b9f06a',220,0.42,{kind:'streak',glow:true,r:3,g:130,len:42}); this.ringFx(b.x,b.y,'#b9f06a',0.22,{r1:120,width:7}); }
    else { this.burst(b.x,b.y,8,'#6a5238',190,0.42,{kind:'smoke',r:7,g:-18,alpha:0.65}); this.ringFx(b.x,b.y,'#e08a32',0.2,{r1:96,width:6,glow:false}); }
  },
});
// === part 6 below ===
// ============================================================
// PART 6 — battle update, scoring, ball forms, XP, interference, combat
// ============================================================
Object.assign(Game.prototype,{
  updateBattle(dt){ const run=this.run; if(run.modal) return;
    const ts=run.aiming?0.25:1; const sdt=dt*ts;
    run._acc+=sdt; let steps=0; while(run._acc>=FIXED&&steps<8){ this.stepBall(FIXED); run._acc-=FIXED; steps++; }
    if(run.invuln>0)run.invuln-=dt; if(run.hitFlash>0)run.hitFlash-=dt*2.5; if(run.shake>0)run.shake-=dt*60; if(run.siphonCd>0)run.siphonCd-=dt;
    if(run._mobLunge>0)run._mobLunge-=dt; if(run._mobHitFlash>0)run._mobHitFlash-=dt*3.5; if(run._scoreFlash>0)run._scoreFlash-=dt*2.2;
    const H=run.hoop; if(H){ H.glow=Math.max(0,H.glow-dt*2); H.lit=Math.max(0,H.lit-dt*2); H.net*=0.9; }
    if(run.banner){ run.banner.t-=dt; if(run.banner.t<=0)run.banner=null; }
    // host reposition (only between shots)
    if(run.repos>0){ run.repos-=dt; const host=run.host,Hp=run.hoop; host.x=lerp(host.x,host.tx!=null?host.tx:host.x,clamp(dt*5,0,1)); host.hop=Math.abs(Math.sin(this.t*16))*8; Hp.x=lerp(Hp.x,Hp.tx,clamp(dt*5,0,1)); Hp.y=lerp(Hp.y,Hp.ty,clamp(dt*5,0,1)); if(run.repos<=0){ host.hop=0; if(!run.ball||(!run.ball.live&&!run.ball.held)) this.spawnBall(); } }
    // camera follow ball on high shots
    const b=run.ball; let tz=1,ty=0; if(b&&b.live&&b.y<200){ const over=200-b.y; tz=clamp(1-over/2600,0.7,1); ty=clamp(-over*0.45,-260,0); } this.cam.tz=tz; this.cam.ty=ty;
    // next ball timer
    if(run.nextBall>0){ run.nextBall-=dt; if(run.nextBall<=0){ run.nextBall=0; if(run.repos<=0&&(!run.ball||(!run.ball.live&&!run.ball.held))) this.spawnBall(); } }
    // guards
    this.updateGuards(sdt);
    this.updateProjectiles(sdt);
    // wave / win check
    if(run.speed){
      if(!run._dead2 && run.ball && run.ball.held && !run.ball.live){ run.shotClock-=dt;
        if(run.shotClock<=0){ run.shotClock=run.shotClockMax; this.playerHurt(Math.ceil(run.maxhp/5)); this.floater(BW/2,BH*0.30,'⏱ 超時未出手','#ff4a3a',36,{crit:true}); run.shake=Math.max(run.shake||0,22); this.audio.sfx('boss'); }
      }
    } else {
      if(run.guards.length===0 && !run._stageClearing && !run.modal){ this.onStageClear(); }
    }
    if(run.hp<=0 && !run._dead2){ run._dead2=true; this.finishRun(false); }
  },

  // ----- basket -----
  makeBasket(){ const run=this.run; const b=run.ball; if(b.scored) return; b.scored=true;
    if(this.save.admin){ const r=run; setTimeout(()=>{ if(this.run!==r)return; for(const g of r.guards){ g.hp=0; g.dead=true; } r.guards=[]; r.modal=null; r.levelUpsPending=0; if(!r._stageClearing) this.onStageClear(); },240); }
    const _rb=b.rimBounces||0; let _st; if(!b.hitBoard&&_rb===0)_st='swish'; else if(b.hitBoard&&_rb===0)_st='bank'; else if(_rb>=2)_st='lucky'; else _st='normal'; b.scoreType=_st; const swish=_st==='swish', bank=_st==='bank', lucky=_st==='lucky'; const H=run.hoop; H.lit=1; H.glow=1;
    run.makes++; run.combo++; run.bestCombo=Math.max(run.bestCombo,run.combo); if(swish){run.swishes++;this.save.stats.swishes++;} if(bank){run.banks++;this.save.stats.banks++;}
    if(run.speed){ run.speedScore=(run.speedScore||0)+1; }
    this.audio.sfx(swish?'swish':bank?'bank':'score'); this.vibrate(swish?30:bank?20:12);
    this.basketImpactFx(H,b.scoreType,ACTS[run.act-1].rune); run.shake=Math.max(run.shake||0,swish?22:bank?16:11); run._scoreFlash=swish?0.58:0.36;
    // score + xp
    const base=swish?160:bank?130:100; const cMul=1+run.combo*0.1; const sc=Math.round(base*cMul); run.score+=sc;
    this.floater(H.x,H.y-50,'+'+sc,'#e6c068',32,{vy:-70}); if(swish)this.floater(H.x,H.y-100,'空心 SWISH','#fff0c0',28,{crit:true}); else if(bank)this.floater(H.x,H.y-100,'擦板 BANK','#e08a32',26); else if(lucky)this.floater(H.x,H.y-100,'幸運進球 LUCKY!','#c89bff',26,{crit:true}); else this.floater(H.x,H.y-100,'進球','#ece0c4',24);
    let xp=swish?15:bank?12:10; if(run.abilities.quicklearn)xp*=(1.2+run.abilities.quicklearn*0.1); if(run.stone==='hunter')xp*=1.2; if(run.heroId==='beast')xp*=1.1;
    // fire form attack
    const dmg=this.shotDamage(swish,bank); const ctx={hx:H.x,hy:H.y,swish,bank,dmg,combo:run.combo,firstScore:!run._scoredBalls,firstSwish:swish&&!run._firstSwishDone};
    if(swish)run._firstSwishDone=true; run._scoredBalls++;
    // Phase 4-4 Boardbarian: consume board buff on AoE form (fire/ice/lightning) BEFORE attack
    if(run._boardBuff && (run.form==='fire'||run.form==='ice'||run.form==='lightning')){ const bb=1.3+((run.mut&&run.mut.boardBuffBonus)||0); ctx.dmg=Math.round(ctx.dmg*bb); run._boardBuff=false; this.floater(H.x,H.y-150,'板魂爆發!','#ff8a5a',26,{crit:true}); }
    run._stageMakes=(run._stageMakes||0)+1; ctx.firstMake=(run._stageMakes===1);
    ctx.lucky=lucky; this._applyRewardDamageMods(ctx);
    BALL_FORMS[run.form].attack(this,ctx);
    this.heroSignatureFx(ctx);
    this._applySharedSkillEffects(ctx);
    // Phase 4-4 Boardbarian: set buff AFTER attack on axer bank (no self-boost; boolean = no stacking)
    if(run.heroId==='axer' && bank){ run._boardBuff=true; }
    // relic on-basket
    this.relicOnBasket(swish,bank,ctx);
    // ability on-basket (non-form)
    this.abilityOnBasket(swish,bank,dmg,ctx);
    this.bossOnScore(b.scoreType);
    // xp + kills tally afterwards (kills added in damage); add xp
    this.gainXP(Math.round(xp));
    this.audio.sfx('hit');
    run.nextBall=0.42;
    // advance interference one shot AFTER a scored shot too? interference advances per shot (made or miss) — handled in endShot
  },
  shotDamage(swish,bank){ const run=this.run; const a=run.abilities; let base=swish?18:bank?15:12;
    let mul=1; const layers=Math.min(run.combo, a.hothand?run.comboMax:run.comboMax); const per=0.08+(a.hothand?a.hothand*0.04:0); mul+=layers*per;
    if(swish&&a.deadeye)mul+=0.4+a.deadeye*0.1; if(bank&&a.boardmaster)mul+=0.3+a.boardmaster*0.1;
    if(a.lastshot&&run.hp<run.maxhp*0.3)mul+=0.25+a.lastshot*0.05;
    if(run.form==='normal'){ if(swish)mul+=0.4; if(bank)mul+=0.3; if(run.relicIds.includes('champ_ball')){ if(swish)mul+=0.25; if(bank)mul+=0.25; } }
    if(this.relicIds&&0){}
    return base*mul;
  },

  // ----- ball form attacks -----
  _nearestCluster(){ const run=this.run; if(run.guards.length===0)return null; // densest point ~ guard with most neighbors
    let best=run.guards[0],bc=-1; for(const g of run.guards){ let c=0; for(const o of run.guards) if(o!==g&&dist(g.x,g.y,o.x,o.y)<160)c++; if(c>bc){bc=c;best=g;} } return best; }
  ,
  formNormal(c){ const run=this.run; const g=this._nearestGuard(c.hx,c.hy); if(g) this.hurtGuard(g,c.dmg*1.25,c,true); this.beam(c.hx,c.hy,g,'#ff9a4a'); },
  formFire(c){ const run=this.run; const center=this._nearestCluster()||this._nearestGuard(c.hx,c.hy); if(!center){return;} this.beam(c.hx,c.hy,center,'#ff7a3c'); this.audio.sfx('fire'); this.elementImpactFx('fire',center.x,center.y,'#ff7a3c',c.swish?1.2:1); this.ringFx(center.x,center.y,'#ffb070',0.34,{r1:260,width:12});
    const burn=2+(run.abilities.ember||0); for(const g of run.guards){ if(dist(center.x,center.y,g.x,g.y)<170+g.r){ this.hurtGuard(g,c.dmg*(g===center?1:0.7),c); g.burn=Math.max(g.burn,burn); g.burnDps=Math.max(g.burnDps,c.dmg*0.25); this.burst(g.x,g.y,5,'#ff7a3c',160,0.5,{glow:true,r:3,g:-30}); } } },
  formIce(c){ const run=this.run; const list=[...run.guards].sort((a,b)=>(b.casting?1:0)-(a.casting?1:0)||dist(c.hx,c.hy,a.x,a.y)-dist(c.hx,c.hy,b.x,b.y)).slice(0,randi(3,5));
    this.audio.sfx('ice'); for(const g of list){ this.beam(c.hx,c.hy,g,'#6fd8ff'); this.hurtGuard(g,c.dmg,c); g.frozen=true; g.freeze=3+(run.abilities.deepfreeze?run.abilities.deepfreeze*0.6:0); g.cast=0; g.casting=false; this.elementImpactFx('ice',g.x,g.y,'#6fd8ff',0.72); } },
  formLightning(c){ const run=this.run; let n=4+(run.abilities.chain||0)+(c.swish?(run.abilities.overload?1+run.abilities.overload:1):0); this.audio.sfx('lightning');
    let cur={x:c.hx,y:c.hy}; const hit=new Set(); for(let i=0;i<n;i++){ let best=null,bd=1e9; for(const g of run.guards){ if(hit.has(g))continue; const d=dist(cur.x,cur.y,g.x,g.y); if(d<bd){bd=d;best=g;} } if(!best)break; this.arc(cur.x,cur.y,best.x,best.y); this.hurtGuard(best,c.dmg*(0.85-i*0.05),c); this.elementImpactFx('lightning',best.x,best.y,'#ffe14d',0.65); hit.add(best); cur=best; } },
  formAxe(c){ const run=this.run; this.audio.sfx('axe');
    // 技能傷害結算器: 進球必定掃到最近數名怪 (不依賴動畫碰撞)
    const n=3+(c.bank?1:0); const tg=this._pickSkillTargets('nearest',c,n); this._dealSkillDamage(tg,c.dmg,{ctx:c,primary:true});
    // 投射物自動飛向怪群（取命中目標平均位置；無目標退回群圖錨點）
    let tx=BW*0.66, ty=BH*0.52; if(tg.length){ tx=tg.reduce((s,g)=>s+g.x,0)/tg.length; ty=tg.reduce((s,g)=>s+g.y,0)/tg.length; }
    run.projectiles.push({kind:'axe',x:c.hx,y:c.hy,sx:c.hx,sy:c.hy,tx,ty,t:0,phase:'out',dmg:0,big:(c.bank?1:0)}); },
  formArrow(c){ const run=this.run; this.audio.sfx('arrow');
    // 技能傷害結算器: 點名施法者→否則最遠怪 (邏輯保證命中)
    const caster=run.guards.find(g=>g.casting&&!g.dead);
    if(caster){ this._dealSkillDamage([caster],c.dmg,{ctx:c,primary:true}); }
    else { this._skillSweep(c,{mode:'farthest',n:1,dmg:c.dmg,primary:true}); }
    const extra=(run.relicIds.includes('sand_bow')?1:0); if(extra>0) this._skillSweep(c,{mode:'lowhp',n:extra,dmg:Math.round(c.dmg*0.7)});
    let tg=caster||this._nearestGuard(c.hx,c.hy); if(tg){ const a=Math.atan2(tg.y-c.hy,tg.x-c.hx); run.projectiles.push({kind:'arrow',x:c.hx,y:c.hy,vx:Math.cos(a)*1400,vy:Math.sin(a)*1400,t:1.2,dmg:0,pierce:1,hit:new Set(),split:0}); } },
  _nearestGuard(x,y){ const run=this.run; let best=null,bd=1e9; for(const g of run.guards){ const d=dist(x,y,g.x,g.y); if(d<bd){bd=d;best=g;} } return best; },
  beam(x1,y1,g,color){ const run=this.run; if(g){ run.fx.push({kind:'beam',x1,y1,x2:g.x,y2:g.y,color,t:0.2,max:0.2}); this.burst(g.x,g.y,7,color,210,0.4,{glow:true,r:3}); } },
  arc(x1,y1,x2,y2){ this.run.fx.push({kind:'arc',x1,y1,x2,y2,t:0.18,max:0.18}); },
  _heroAnchor(){ const lefty=this.save.settings.lefty; return {x:lefty?BW-220:220, y:BH-180}; },
  heroSignatureFx(ctx){ const run=this.run; const sig=HERO_SIG[run.heroId]; if(!sig)return;
    if(this.save.settings.reduceMotion)return;
    const ha=this._heroAnchor();
    const tg=this._nearestGuard(ctx.hx,ctx.hy); const tx=tg?tg.x:ctx.hx, ty=tg?tg.y:ctx.hy;
    run.fx.push({kind:sig.kind, x1:ha.x, y1:ha.y, x2:tx, y2:ty, col:sig.col, t:sig.dur, max:sig.dur, trail:[], seed:Math.random()*99});
  },

  abilityOnBasket(swish,bank,dmg,c){ const run=this.run,a=run.abilities;
    if(a.triple){ run._tri=(run._tri||0)+1; if(run._tri%3===0){ const g=this._nearestCluster(); if(g) this.aoe(g.x,g.y,200,18+a.triple*8,'#ff7a3c'); } }
    if(a.overload&&swish&&run.form!=='lightning'){ const g=this._nearestGuard(c.hx,c.hy); if(g)this.aoe(g.x,g.y,150,16+a.overload*8,'#ffe14d'); }
  },
  aoe(x,y,rad,dmg,color){ const run=this.run; this.ringFx(x,y,color,0.5); this.ringFx(x,y,'#fff3df',0.3); this.burst(x,y,20,color,320,0.55,{glow:true,r:5,g:60}); this.burst(x,y,8,'#fff3df',380,0.3,{glow:true,r:4}); run.shake=Math.max(run.shake||0,8); for(const g of run.guards){ if(dist(x,y,g.x,g.y)<rad+g.r) this.hurtGuard(g,dmg,{}); } },

  hurtGuard(g,dmg,c,primary){ if(!g||g.dead)return; const run=this.run; c=c||{};
    if(c.swish&&g.eliteMove&&g.castMax>0&&g.cast>0){ g.cast=Math.max(0,g.cast-1); g.casting=g.cast>=g.castMax-1; this.floater(g.x,g.y-g.r-26,'打斷!','#6fd8ff',22); this.elementImpactFx('ice',g.x,g.y,'#6fd8ff',0.55); }
    if(g.shieldUp&&primary){ if(g.elite&&!(c.swish||c.bank)){ this.audio.sfx('rim'); this.burst(g.x,g.y,8,'#b8b0a0',210,0.42,{kind:'shard',r:4}); this.ringFx(g.x,g.y,'#b8b0a0',0.28,{r1:120,width:8}); this.floater(g.x,g.y-g.r-8,'需空心/擦板破甲','#b8b0a0',20); return; } g.shieldUp=false; this.audio.sfx('rim'); this.shockFx(g.x,g.y,'#d7c7aa',210,0.38); this.burst(g.x,g.y,18,'#d7c7aa',310,0.55,{kind:'shard',glow:true,r:5}); this.floater(g.x,g.y-g.r-8,g.elite?'破甲':'破盾','#b8b0a0',22); return; }
    const a=run.abilities; if(a.execute&&g.hp<g.maxhp*0.35)dmg*=1.4+a.execute*0.15; if(a.witchaim&&g.casting)dmg*=1.5+a.witchaim*0.15;
    if(run.mods&&run.mods.executeMul>0&&g.hp<g.maxhp*0.30)dmg*=(1+run.mods.executeMul);
    if(run.mut&&run.mut.bossDmg>0&&run.stage&&run.stage.boss)dmg*=(1+run.mut.bossDmg);
    dmg=Math.round(dmg); g.hp-=dmg; if(g.sandbag) g.hp=g.maxhp; g.flash=1; run._mobHitFlash=Math.min(0.7,(run._mobHitFlash||0)+0.4); run.score+=dmg; this.floater(g.x+rand(-10,10),g.y-g.r-10,''+dmg,c.swish?'#fff0c0':c.bank?'#e08a32':'#ece0c4',c.swish?30:24,{crit:c.swish}); this.burst(g.x,g.y,c.swish?10:7,c.swish?'#fff0c0':g.color,c.swish?260:190,0.38,{kind:c.swish?'streak':'shard',glow:c.swish,r:c.swish?4:3,g:80,len:42});
    if(g.hp<=0) this.killGuard(g);
  },
  killGuard(g){ const run=this.run; if(g.dead||g.sandbag)return; g.dead=true; this.audio.sfx('death'); this.flashFx(g.x,g.y,g.color,220,0.18); this.shockFx(g.x,g.y,g.color,g.elite?360:260,0.42); this.burst(g.x,g.y,g.elite?34:24,g.color,g.elite?390:300,0.68,{glow:true,r:g.elite?6:4,g:180,len:54}); this.burst(g.x,g.y,10,'#1b1210',140,0.9,{kind:'smoke',r:12,g:-20,alpha:0.65});
    run.kills++; run.score+=120;
    const elite=!!(g.elite||g.intf); let kxp=elite?20:10; if(run.mut&&run.mut.killXpMul) kxp=Math.round(kxp*(1+run.mut.killXpMul)); this.gainXP(kxp);
    this.addRunGold((elite?4:2)+(run.mods?run.mods.killGoldBonus:0));
    if(run.mut&&run.mut.killHeal>0) this.heal(run.mut.killHeal);
    if(run.abilities.shatter&&g.frozen) this.aoe(g.x,g.y,180,20+run.abilities.shatter*10,'#6fd8ff');
    if(run.heroId==='bone'&&chance(0.4)){ const t=this._nearestGuardExcept(g); if(t){ this.arc(g.x,g.y,t.x,t.y); this.hurtGuard(t,12,{}); } }
    const i=run.guards.indexOf(g); if(i>=0)run.guards.splice(i,1);
    this.floater(g.x,g.y-g.r,'+1','#a2926e',20,{vy:-40});
  },
  _nearestGuardExcept(ex){ const run=this.run; let best=null,bd=1e9; for(const g of run.guards){ if(g===ex)continue; const d=dist(ex.x,ex.y,g.x,g.y); if(d<bd){bd=d;best=g;} } return best; },

  // ----- XP / level -----
  gainXP(n){ const run=this.run; if(run.speed) return; n=Math.round(n*(1+(run.mods&&run.mods.xpMul?run.mods.xpMul:0))); run.xp+=n; let leveled=false;
    while(run.xp>=run.xpNext){ run.xp-=run.xpNext; run.level++; run.levelUpsPending++; leveled=true; run.xpNext=Math.min(180,Math.round(100*Math.pow(1.15,run.level-1))); }
    if(!this.save.admin){ const pr=this._heroProg(run.heroId); pr.level=run.level; pr.xp=run.xp; if(leveled) this._saveProfile(); }
    if(run.levelUpsPending>0 && !run.modal && !run._stageClearing && (!run.ball||!run.ball.live)) this.openLevelUp(); }
  ,
  // ----- end of shot / interference advance -----
  endShot(scored){ const run=this.run; const b=run.ball; if(!b)return; b.live=false;
    this._recordShot(run.heroId, scored, scored?b.scoreType:null); // 今日命中率 + 永久 per-hero 數據
    if(!scored){ // miss
      let dmg = run.stage.boss?15: run.stage.tier>=3?12:10; if(run.corrupt)dmg=Math.round(dmg*1.2);
      const a=run.abilities; let immune=false;
      if(run.speed){ this.playerHurt(Math.ceil(run.maxhp/5)); this.floater(BW/2,BH*0.30,'未進球 扣血','#ff6a4a',32,{crit:true}); immune=true; }
      if(run.stone==='seal'&&!run._sealUsed){ run._sealUsed=true; immune=true; }
      if(a.secondchance&&!run.firstMissUsed){ run.firstMissUsed=true; immune=true; this.floater(b.x,b.y-40,'第二次機會','#e6c068',24); }
      if(run.heroId==='whistle'&&!run.firstMissUsed){ run.firstMissUsed=true; dmg=Math.round(dmg/2); }
      if(run.mut&&run.mut.missImmune>0&&!run._missImmuneUsed){ run._missImmuneUsed=true; immune=true; this.floater(b.x,b.y-40,'聖騎免傷','#aeb4b3',24); }
      if(!immune) this._enemyStrike(dmg);
      if(run.mods&&run.mods.missShield>0) run.shield=(run.shield||0)+run.mods.missShield;
      if(run.mut&&run.mut.missShieldStage>0&&!run._missStageShield){ run._missStageShield=true; run.shield=(run.shield||0)+run.mut.missShieldStage; }
      run.combo=0;
    }
    // advance interference per shot
    this.advanceInterference();
    this.bossShotTick(scored, b);
    // host reposition only after a scored shot
    if(scored && run.speed){ this._speedHoopPos(false); } else if(scored && run.guards.length>0){ this.pickHoopPos(false); }
    else if(scored && run.guards.length===0){ /* clear handled */ }
    run.nextBall=Math.max(run.nextBall,0.3);
    // pending levels
    if(run.levelUpsPending>0&&!run.modal) this.openLevelUp();
  },
  playerHurt(dmg){ const run=this.run; if(run.mods&&run.mods.damageReduce>0) dmg=dmg*(1-Math.min(0.45,run.mods.damageReduce)); if(run.shield>0){ const a=Math.min(run.shield,dmg); run.shield-=a; dmg-=a; }
    if(dmg>0){ if(run.relicIds.includes('rift_feather')&&!run.riftUsed&&run.hp-dmg<=0){ run.riftUsed=true; run.hp=1; this.floater(220,BH-280,'裂隙羽骨!','#6fd8ff',30,{crit:true}); } else run.hp-=dmg; }
    run.invuln=0.4; run.hitFlash=1; run.shake=12; this.audio.sfx('hurt'); this.vibrate(40); this.floater(220,BH-300,'-'+(dmg||0),'#e6433c',30,{vy:-50}); }
  ,_enemyStrike(dmg){ const run=this.run; const live=run.guards.filter(g=>!g.dead);
    const hx=this.save.settings.lefty?BW-210:210, hy=BH-150;
    if(!live.length){ this.playerHurt(dmg); return; }
    run._mobLunge=0.34;                                  // 怪物群前撲
    let sx,sy;
    if(run.act>=1&&run.act<=5){ sx=BW*0.6; sy=BH*0.46; }
    else { const g=live.find(x=>x.casting)||live.slice().sort((a,b)=>b.r-a.r)[0]; sx=g.x; sy=g.y-g.r*0.4; g._lunge=0.3; }
    this.audio.sfx('hit'); this.vibrate(12);
    this.burst(sx,sy,12,'#e0533a',230,0.45,{r:5,glow:true});
    const a=Math.atan2(hy-sy,hx-sx), sp=1450;
    run.projectiles.push({kind:'enemyShot',x:sx,y:sy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:1.5,dmg,hx,hy,trail:[]}); }
  ,
  advanceInterference(){ const run=this.run; run.shotCount++;
    // tick down existing
    for(let i=run.intf.length-1;i>=0;i--){ run.intf[i].shots--; if(run.intf[i].shots<=0)run.intf.splice(i,1); }
    // guards: advance cast countdown by one
    let drummed=false;
    for(const g of run.guards){ if(g.dead||g.frozen)continue;
      if(g.eliteMove&&g.castMax>0){ if(g.cast<g.castMax){ g.cast++; g.casting=g.cast>=g.castMax-1; } if(g.cast>=g.castMax){ this.eliteCast(g); g.cast=0; g.casting=false; } }
      else if(g.intf&&g.castMax>0){ if(g.cast<g.castMax){ g.cast++; g.casting=g.cast>=g.castMax-1; } if(g.cast>=g.castMax){ this.guardCast(g); g.cast=0; g.casting=false; } } }
  },
  guardCast(g){ const run=this.run; const kind=g.intf; if(!kind)return; const def=INTERFERENCES[kind];
    if(kind==='drum'){ for(const o of run.guards){ if(o!==g&&o.intf&&o.cast<o.castMax){ o.cast++; } } this.floater(g.x,g.y-g.r-20,'催促!','#c46a3a',22); this.audio.sfx('hit'); return; }
    // limit one main + one secondary
    let shots=def.shots; if(run.relicIds.includes('broken_glass'))shots=Math.max(1,shots-1);
    if(kind==='shortTraj'&&run.relicIds.includes('ref_glasses'))shots=Math.max(1,Math.ceil(shots/2));
    run.intf=[{kind,shots,name:def.name}]; // Phase 4-5: at most 1 main interference (newest replaces)
    this.floater(g.x,g.y-g.r-20,def.name,'#e6c068',22); this.audio.sfx('ice');
  },
  eliteCast(g){ const run=this.run; const eff=g.eliteEff; const nm=g.eliteName||'蠻擊';
    this.floater(g.x,g.y-g.r-22,'▶'+nm,'#ff9a4a',26,{crit:true}); this.audio.sfx('hit'); run._mobLunge=0.3; g._lunge=0.3;
    const push=(kind,shots)=>{ run.intf=[{kind,shots,name:(INTERFERENCES[kind]?INTERFERENCES[kind].name:nm)}]; };
    if(eff==='grav') push('gravity',2);
    else if(eff==='fog') push('shortTraj',2);
    else if(eff==='grip') push('maxPull',2);
    else if(eff==='freeze') push('slowCharge',2);
    else if(eff==='gaze'){ push('hideLanding',1); this._eliteStrike(g, run.stage.boss?10:8); }
    else if(eff==='drum'){ for(const o of run.guards){ if(o!==g&&!o.dead&&(o.intf||o.eliteMove)&&o.castMax>0&&o.cast<o.castMax){ o.cast++; o.casting=o.cast>=o.castMax-1; } } this.floater(g.x,g.y-g.r-44,'催促!','#c46a3a',22); }
    else { this._eliteStrike(g, run.stage.boss?10:8); }
  },
  _eliteStrike(g,dmg){ const run=this.run; const hx=this.save.settings.lefty?BW-210:210, hy=BH-150;
    const sx=g.x, sy=g.y-g.r*0.3; this.burst(sx,sy,10,'#ff7a3c',220,0.45,{r:4,glow:true});
    const a=Math.atan2(hy-sy,hx-sx), sp=1450;
    run.projectiles.push({kind:'enemyShot',x:sx,y:sy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:1.5,dmg,hx,hy,trail:[]});
  },
  // ----- Boss 招牌機制 (每幕一招, 依 phase 升級) -----
  _bossSub(){ const run=this.run; const act=run.act; if(act!==5)return null; const ph=(run.host&&run.host.phase)||1; return ['bell','tax','board','foul'][(ph-1)%4]; },
  bossShotTick(scored,b){ const run=this.run; if(!run.stage||!run.stage.boss||!run.boss)return; const B=run.boss; const ph=(run.host&&run.host.phase)||1; const act=run.act; B.shots=(B.shots||0)+1;
    const sub=this._bossSub();
    const useBell=act===1||sub==='bell', useTax=act===2||sub==='tax', useBoard=act===3||sub==='board', useFoul=act===4||sub==='foul';
    const every=Math.max(2,4-(ph-1));
    if(useBell){
      if(B.bellArmed){ if(!scored){ this.floater(BW/2,BH*0.3,'🔔 漏接懲罰!','#ff7a3c',30,{crit:true}); this._bossStrike(10+ph*2); } B.bellArmed=false; B.bellCount=0; }
      else { B.bellCount=(B.bellCount||0)+1; if(B.bellCount>=every){ B.bellArmed=true; this.floater(BW/2,BH*0.28,'🔔 限時進球!','#ffd86a',28,{crit:true}); this.audio.sfx('boss'); } }
    }
    if(useTax){
      B.taxCount=(B.taxCount||0)+1;
      if(B.taxCount>=every){ B.taxCount=0;
        if(run.shield>0){ run.shield=0; this.floater(BW/2,BH*0.3,'💰 護盾被收!','#e0b030',26,{crit:true}); }
        else { run.combo=Math.max(0,run.combo-3); this.floater(BW/2,BH*0.3,'💰 連擊被收!','#e0b030',26,{crit:true}); }
        this.audio.sfx('hit');
      }
    }
    if(useBoard){
      if(scored){ B.missStreak=0; }
      else { B.missStreak=(B.missStreak||0)+1; if(B.missStreak>=every){ B.missStreak=0; this.floater(BW/2,BH*0.3,'📋 記分板爆發!','#9ac63f',30,{crit:true}); this._bossStrike(12+ph*3); } }
    }
    if(useFoul){
      if(B.foulType){ B.foulType=null; } // 本球已結算(進球在 bossOnScore 消耗, miss 則過期)
      else { B.foulCount=(B.foulCount||0)+1; if(B.foulCount>=every){ B.foulCount=0; B.foulType=chance(0.5)?'swish':'bank'; this.floater(BW/2,BH*0.28,'⚠ 禁'+(B.foulType==='swish'?'空心':'擦板'),'#ffe14d',26,{crit:true}); this.audio.sfx('boss'); } }
    }
  },
  bossOnScore(st){ const run=this.run; if(!run.stage||!run.stage.boss||!run.boss)return; const B=run.boss;
    if(B.foulType){ const t=B.foulType; B.foulType=null;
      if((t==='swish'&&st==='swish')||(t==='bank'&&st==='bank')){ this.floater(run.hoop.x,run.hoop.y-130,'⚠ 犯規!','#ff5a3a',28,{crit:true}); run.combo=Math.max(0,run.combo-2); this._bossStrike(8); }
      else { this.floater(run.hoop.x,run.hoop.y-130,'✓ 避規 +獎勵','#9fe024',24); run.score+=120; }
    }
    if(run.act===5 && chance(0.35)){ const ks=['gravity','shortTraj','slowCharge']; const k=pick(ks); run.intf=[{kind:k,shots:1,name:(INTERFERENCES[k]?INTERFERENCES[k].name:k)}]; this.floater(BW/2,BH*0.24,'狂暴干擾','#c4342a',20); }
  },
  _bossStrike(dmg){ const run=this.run; const hx=this.save.settings.lefty?BW-210:210, hy=BH-150;
    const H=run.host; const sx=(H&&H.x)||BW*0.6, sy=(H&&H.baseY)||BH*0.4; run.shake=Math.max(run.shake||0,14);
    this.burst(sx,sy,14,'#ff5a2a',260,0.5,{r:5,glow:true}); this.audio.sfx('boss');
    const a=Math.atan2(hy-sy,hx-sx), sp=1500;
    run.projectiles.push({kind:'enemyShot',x:sx,y:sy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:1.6,dmg,hx,hy,trail:[]});
  },
});
// === part 7 below ===
// ============================================================
// PART 7 — guards/projectiles update, level-up, words, clear/waves, finishRun
// ============================================================
Object.assign(Game.prototype,{
  updateGuards(dt){ const run=this.run; const host=run.host;
    for(const g of run.guards){ if(g.dead)continue;
      // status
      if(g.burn>0){ g.burn-=dt; g._bt=(g._bt||0)+dt; if(g._bt>=0.5){ g._bt=0; this.hurtGuard(g,Math.max(1,g.burnDps*0.5),{}); } }
      if(g.frozen){ g.freeze-=dt; if(g.freeze<=0)g.frozen=false; }
      if(g.flash>0)g.flash-=dt*3;
      if(g._static){ g.x=g.bx; g.y=g.by; continue; }
      // orbit host (NO advance toward player) — idle drift around anchor
      g.wphase+=dt*1.6; const tx=g.bx + Math.cos(g.wphase)*10, ty=g.by + Math.sin(g.wphase*1.3)*8;
      g.x=lerp(g.x, tx + (host.x-host.mx||0), clamp(dt*2,0,1)); g.y=lerp(g.y, ty, clamp(dt*2,0,1));
    }
  },
  updateProjectiles(dt){ const run=this.run;
    for(let i=run.projectiles.length-1;i>=0;i--){ const p=run.projectiles[i];
      if(p.kind==='axe'){ p.t+=dt; const speed=2600;
        if(p.phase==='out'){ const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy)||1; p.x+=dx/d*speed*dt; p.y+=dy/d*speed*dt; if(d<46||p.t>0.5){ p.phase='back'; } }
        else { const dx=p.sx-p.x,dy=p.sy-p.y,d=Math.hypot(dx,dy)||1; p.x+=dx/d*speed*dt; p.y+=dy/d*speed*dt; if(d<46||p.t>1.3){ run.projectiles.splice(i,1); continue; } }
        this.burst(p.x,p.y,1,'#cdd2da',60,0.2,{r:5}); }
      else if(p.kind==='arrow'){ p.t-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; if(p.dmg>0)for(const g of run.guards){ if(!p.hit.has(g)&&dist(p.x,p.y,g.x,g.y)<g.r+18){ this.hurtGuard(g,p.dmg,{}); p.hit.add(g); p.pierce--; if(p.split>0){ for(let s=0;s<p.split;s++){ const a=rand(0,TAU); run.projectiles.push({kind:'arrow',x:g.x,y:g.y,vx:Math.cos(a)*1100,vy:Math.sin(a)*1100,t:0.6,dmg:p.dmg*0.5,pierce:1,hit:new Set(),split:0}); } p.split=0; } if(p.pierce<=0){ p.t=0; } } } this.spawn(p.x,p.y,0,0,0.2,3,'#b9f06a',{glow:true}); if(p.t<=0||p.x<0||p.x>BW||p.y<-400||p.y>BH){ run.projectiles.splice(i,1); } }
      else if(p.kind==='enemyShot'){ p.t-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; if(!p.trail)p.trail=[]; p.trail.push([p.x,p.y]); if(p.trail.length>10)p.trail.shift(); this.spawn(p.x,p.y,rand(-40,40),rand(-40,40),0.3,4,'#ff6a3a',{glow:true});
        if(dist(p.x,p.y,p.hx,p.hy)<54 || p.t<=0){ this.playerHurt(p.dmg); this.burst(p.hx,p.hy,18,'#e6433c',300,0.55,{r:6,glow:true,g:120}); this.ringFx(p.hx,p.hy,'#e6433c',0.5); run.shake=Math.max(run.shake||0,18); run.projectiles.splice(i,1); continue; } }
    }
  },

  // ----- level up modal -----
  openLevelUp(){ const run=this.run; if(run.levelUpsPending<=0)return; run.levelUpsPending--;
    // Phase 6: 升級三選一 = 七英雄共用 BD 池 (form 由 loadout 決定，不再走球途盤)
    let extra=(run.relicIds.includes('bench_towel')||run.stone==='bench')?1:0;
    if(run.mut&&run.mut.rerollPlus) extra+=run.mut.rerollPlus;
    if(run._rewardRerollBonus){ extra+=run._rewardRerollBonus; run._rewardRerollBonus=0; }
    run.modal={kind:'upgrade', choices:this._rollUpgradePool(3), reroll:extra};
  },
  chooseForm(f){ const run=this.run; run.form=f; this.audio.sfx('select'); this.floater(BW/2,BH*0.4,BALL_FORMS[f].name+'!','#e6c068',44,{crit:true,vy:-30,t:1.4}); run.modal=null;
    // elem hero auto-level first element ability later; continue pending
    if(run.levelUpsPending>0) this.openLevelUp(); else this.afterModal(); },
  chooseAbility(a){ const run=this.run; run.abilities[a.id]=(run.abilities[a.id]||0)+1; this.audio.sfx('levelup');
    if(run.heroId==='elem'&&a.tree==='element'&&run.abilities[a.id]<3&&!run._elemBonus){ run._elemBonus=true; run.abilities[a.id]++; }
    run.modal=null; this.checkBallWords();
    if(run.levelUpsPending>0) this.openLevelUp(); else this.afterModal(); },
  rerollAbility(){ const run=this.run; if(!run.modal||run.modal.reroll<=0)return; run.modal.reroll--; const avail=ABILITIES.filter(a=>(run.abilities[a.id]||0)<3); const pool=avail.length>=3?avail:ABILITIES.slice(); const ch=[]; const used=new Set(); while(ch.length<3&&used.size<pool.length){ const a=pick(pool); if(used.has(a.id))continue; used.add(a.id); ch.push(a); } run.modal.choices=ch; this.audio.sfx('ui'); },
  afterModal(){ const run=this.run; if(run.guards.length===0) this.onStageClear(); },

  checkBallWords(){ const run=this.run; for(const w of BALL_WORDS){ if(run.words.includes(w.id))continue; if(w.form&&run.form!==w.form)continue; if(w.need.every(id=>run.abilities[id])){ run.words.push(w.id); this.audio.sfx('word'); this.audio.sfx('whistle'); run.banner={text:w.name,sub:w.en+' · 球語成立',t:2.6}; this.ringFx(BW/2,BH*0.4,'#e6c068',0.8); } } },

  // ----- relics on basket -----
  relicOnBasket(swish,bank,c){ const run=this.run; const ids=run.relicIds;
    if(ids.includes('abbey_ember')&&c.firstScore){ this.aoe(c.hx,c.hy,9999,c.dmg*0.6,'#ff7a3c'); }
    if(ids.includes('citadel_battery')&&swish&&!run._battUsed){ run._battUsed=true; this.ringFx(c.hx,c.hy,'#ffe14d',0.6); for(const g of run.guards){this.hurtGuard(g,c.dmg*0.6,{}); this.arc(c.hx,c.hy,g.x,g.y); this.burst(g.x,g.y,5,'#ffe14d',220,0.4,{glow:true,r:3});} this.audio.sfx('lightning'); }
    if(ids.includes('final_chill')&&!run._chillUsed){ run._chillUsed=true; const cg=run.guards.find(g=>g.casting); if(cg){cg.cast=0;cg.casting=false;cg.frozen=true;cg.freeze=2;} }
    if(ids.includes('kings_seal')&&bank){ run.shield+=6; }
    if(ids.includes('blood_chalice')&&run.combo>=5){ run._bcN=(run._bcN||0)+1; if(run._bcN%2===0)this.heal(2); }
    if(ids.includes('pilgrim_bone')){ /* on stage clear */ }
    if(ids.includes('hex_idol')){ run.hexN++; if(run.hexN%5===0){ const g=this._nearestGuard(c.hx,c.hy); if(g){ const fx=pick(['fire','ice','lightning']); if(fx==='fire'){g.burn=3;g.burnDps=c.dmg*0.3;} else if(fx==='ice'){g.frozen=true;g.freeze=2;} else this.aoe(g.x,g.y,140,16,'#ffe14d'); } } }
    if(ids.includes('ember_saint')&&swish){ const g=this._nearestCluster()||this._nearestGuard(c.hx,c.hy); if(g)this.aoe(g.x,g.y,200,c.dmg*0.7,'#ff7a3c'); }
    if(ids.includes('iron_hook')){ let far=null,fd=-1; for(const g of run.guards){const d=dist(c.hx,c.hy,g.x,g.y); if(d>fd){fd=d;far=g;}} if(far){ this.beam(c.hx,c.hy,far,'#ffb070'); this.hurtGuard(far,c.dmg*0.8,c); } }
    if(ids.includes('coldflame_tesla')&&swish){ let cur={x:c.hx,y:c.hy}; const hit=new Set(); for(let i=0;i<3;i++){ let best=null,bd=1e9; for(const g of run.guards){if(hit.has(g))continue; const d=dist(cur.x,cur.y,g.x,g.y); if(d<bd){bd=d;best=g;}} if(!best)break; this.arc(cur.x,cur.y,best.x,best.y); this.hurtGuard(best,c.dmg*0.5,c); best.slow=Math.max(best.slow||0,1.2); this.burst(best.x,best.y,5,'#6fd8ff',180,0.4,{glow:true,r:3}); hit.add(best); cur=best; } }
    if(ids.includes('thunderbone')){ let str=null,sh=-1; for(const g of run.guards){ if(g.hp>sh){sh=g.hp;str=g;} } if(str){ this.arc(c.hx,c.hy,str.x,str.y); this.hurtGuard(str,c.dmg*0.9,c); this.aoe(str.x,str.y,150,c.dmg*0.4,'#ff6a2a'); } }
    if(ids.includes('absolute_zero')){ run._azN=(run._azN||0)+1; if(run._azN%4===0){ const list=[...run.guards].slice(0,5); for(const g of list){ g.frozen=true; g.freeze=2; this.burst(g.x,g.y,6,'#6fd8ff',140,0.5,{r:3}); } this.ringFx(c.hx,c.hy,'#6fd8ff',0.5); } }
  },
  heal(n){ const run=this.run; run.hp=Math.min(run.maxhp,run.hp+n); this.floater(220,BH-260,'+'+n,'#6fae4a',24,{vy:-40}); },

  // ----- stage clear / waves / finish -----
  onStageClear(){ const run=this.run; if(run._stageClearing)return;
    // boss waves
    if(run.spawned<run.guardsTotal){ run.bossWave++; const n=Math.min(run.waveSize, run.guardsTotal-run.spawned); this.spawnWave(n); run.spawned+=n;
      run.host.phase=run.bossWave+1; run.banner={text:run.host.name,sub:'第'+(run.bossWave+1)+'階段',t:1.8}; this.audio.sfx('boss'); this.pickHoopPos(true); if(!run.ball||(!run.ball.live&&!run.ball.held))this.spawnBall(); return; }
    run._stageClearing=true; this.audio.sfx('levelup');
    { const _st=run.path[run.pi], _boss=!!(_st&&_st.boss); this.gainXP(_boss?100:40); this.addRunGold(this._clearGold(_boss)); }
    if(run.relicIds.includes('pilgrim_bone')) this.heal(Math.round(run.maxhp*0.08));
    if(run.tutorial){ run.tutorial=false; this.save.tutorialDone=true; persist(this.save); }
    setTimeout(()=>{ if(this.run!==run)return; run._stageClearing=false;
      if(run.pi+1>=run.path.length){ run.actCleared=true; this.finishRun(true); } // Phase 5: last/boss -> finish, NO reward (last-stage protection)
      else { run.rewardPending=true; run._rewardReroll=(run._rewardRerollBonus||0); run._rewardRerollBonus=0; this._rollRewards(); this.go('reward'); }      // Phase 5/5-1b/6: mid-run -> growth reward page
    }, 800);
  },

  finishRun(won){ const run=this.run; this._stageClearing=false; const s=this.save; const adm=!!s.admin;
    // stats
    const acc=run.shots? run.makes/run.shots:0;
    let loot=null, marks=0;
    if(!adm){
      s.stats.bestScore=Math.max(s.stats.bestScore,run.score); s.stats.bestCombo=Math.max(s.stats.bestCombo,run.bestCombo); s.stats.bestAcc=Math.max(s.stats.bestAcc,acc);
      s.coins = s.coins||0; // 碎金已退役(不再增加)
      if(won){
        const mp=this._mp(run.route);
        if(run.nodeMode){
          mp.nodeProg=mp.nodeProg||{};
          mp.nodeProg[run.act]=Math.max(mp.nodeProg[run.act]||0,(run.nodeIdx|0)+1);   // 永久開通該節點(該模式)
          const _isBoss=!!(run.stage&&run.stage.boss);
          if(_isBoss){
            const bossId=run.act+'-boss'; mp.bossClears[bossId]=(mp.bossClears[bossId]||0)+1;
            marks = run.route==='corrupt'?3: run.route==='std'?2:1; mp.marks[bossId]=(mp.marks[bossId]||0)+marks;
            if(run.act>=mp.acts && run.act<5){ mp.acts=run.act+1; }   // 只有王關解鎖下一幕(該模式)
            if(run.act===5 && (run.route==='std'||run.route==='corrupt')){ s.endless=true; }
            mp.heat[bossId]=Math.min(5,(mp.heat[bossId]||0)+1);
            mp.memory[bossId]='cleared';
          }
          loot=this.rollLoot(run, _isBoss?2:(1+(chance(0.5)?1:0)));   // 掉落 1-2 件
        } else {
        const bossId=run.act+'-boss'; mp.bossClears[bossId]=(mp.bossClears[bossId]||0)+1;
        marks = run.route==='corrupt'?3: run.route==='std'?2:1; mp.marks[bossId]=(mp.marks[bossId]||0)+marks;
        if(run.act>=mp.acts && run.act<5){ mp.acts=run.act+1; }
        if(run.act===5 && (run.route==='std'||run.route==='corrupt')){ s.endless=true; }
        loot=this.rollLoot(run);
        mp.heat[bossId]=Math.min(5,(mp.heat[bossId]||0)+1);
        mp.memory[bossId]='cleared';
        }
      }
      if(run.speed){ loot=this._rollSpeedCore(run); s.speedBest=s.speedBest||{}; s.speedBest[run.act]=Math.max(s.speedBest[run.act]||0, run.speedScore||0);
        const fmp=this._mp('fast'); if((run.speedScore||0)>=15 && run.act>=fmp.acts && run.act<5){ fmp.acts=run.act+1; } }
      persist(s);
      // Phase 6.1: 永久等級存檔
      { const pr=this._heroProg(run.heroId); pr.level=run.level; pr.xp=run.xp; this._saveProfile(); }
    }
    const _ptsAvail=this._talentPtsAvail(run.heroId), _ptsEarned=this._talentPtsEarned(run.heroId);
    // sessionStats 跨幕累計
    if(!adm && this.sessionStats){ const ss=this.sessionStats; ss.score+=run.score; ss.kills+=run.kills; ss.gold+=(run.gold||0); ss.shots+=run.shots; ss.makes+=run.makes; ss.swishes+=run.swishes; ss.banks+=run.banks; ss.bestCombo=Math.max(ss.bestCombo,run.bestCombo); if(won)ss.acts=run.act; }
    this._endStats={ won, act:run.act, route:run.route, speed:!!run.speed, speedScore:run.speedScore||0, stone:run.stone, nodeMode:!!run.nodeMode, node:(run.nodeIdx!=null?run.nodeIdx:null), boss:!!(run.stage&&run.stage.boss), stageName: run.path[run.pi]?.name||'', score:run.score, acc, swishes:run.swishes, banks:run.banks, bestCombo:run.bestCombo, kills:run.kills, level:run.level, talentPts:_ptsAvail, talentEarned:_ptsEarned, admin:adm, rewardLog:(run.rewardLog||[]).slice(), words:run.words.slice(), reached:run.pi+1, total:run.path.length, loot, marks, picked:false, session:(run.act===5&&won&&this.sessionStats)?Object.assign({},this.sessionStats):null };
    this.screen=won?'win':'lose'; this.audio.sfx(won?'win':'lose'); if(won)this.audio.sfx('whistle'); if(!won&&!adm)this._recordDeath();
    this.particles.length=0; this.floaters.length=0;
    this.run=null;
  },
  _rollSpeedCore(run){ const s=this.save; const score=run.speedScore||0; const ch=clamp(0.10+score*0.012, 0.10, 0.80);
    if(Math.random()>ch) return null;
    const owned=new Set([...(run.relicIds||[]), ...s.library, ...s.relics.filter(Boolean)]);
    let cores=Object.keys(RELICS).filter(id=>RELICS[id].cls==='core' && !owned.has(id));
    if(!cores.length) cores=Object.keys(RELICS).filter(id=>RELICS[id].cls==='core');
    if(!cores.length) return null;
    const actCores=cores.filter(id=>RELICS[id].act===run.act); const pool=actCores.length?actCores:cores;
    return [ pool[Math.floor(Math.random()*pool.length)] ];
  },
  rollLoot(run, maxN){ maxN=maxN||3; const owned=new Set([...run.relicIds, ...this.save.library]); const all=Object.keys(RELICS);
    const out=[]; // guarantee signature for this act sometimes
    const sig=ACTS[run.act-1].relic; if(out.length<maxN&&!owned.has(sig)&&chance(run.route==='corrupt'?0.8:0.5))out.push(sig);
    const pool=all.filter(id=>!owned.has(id)&&!out.includes(id));
    while(out.length<maxN&&pool.length){ const id=pick(pool); out.push(id); pool.splice(pool.indexOf(id),1); }
    while(out.length<maxN&&all.length){ out.push(pick(all)); }
    const res=out.slice(0,maxN);
    if(run.route==='corrupt'){ for(const id of res) this._setRelicMetaBiased(id,34,50); }      // 腐化：高品質特殊聖物
    else if(run.route==='std'){ for(const id of res) this._setRelicMetaBiased(id,5,28); }        // 標準：不會太強
    return res;
  },
});
// === part 8 below ===
// ============================================================
// PART 8 — menu screens
// ============================================================
Object.assign(Game.prototype,{
  drawHome(){ const ctx=this.ctx,s=this.save;
    const LO=this._homeLayout(); this._HOMEL=LO;
    this._ensureHomeAssets();
    const mode=this._homeMode||'flat';
    const im=this._homeImg.bgDark; const layeredReady=mode==='layered'&&im&&im.complete&&im.naturalWidth&&!this._homeErr.bgDark;
    if(layeredReady) this._drawHomeLayered(LO); else this._drawHomeFlat(LO);
    this._drawHomeScrim(LO);
    this._drawHomeStats(LO);
    this._drawHomeButtons(LO);
    this._drawDeathCounter(LO);
  },
  _toggleAdmin(){ const s=this.save;
    if(s.admin){ s.admin=false; s.layoutMode=false; persist(s); this.toast('開發者模式關閉','回復正常計分'); this.audio.sfx('ui'); this.render(); return; }
    this._adminPadOpen=true; this._adminPadVal=''; this._adminPadShake=0; this.audio.sfx('ui'); this.render();
  },
  _adminKey(k){ if(k==='close'){ this._adminPadOpen=false; this.audio.sfx('ui'); this.render(); return; }
    if(k==='del'){ this._adminPadVal=(this._adminPadVal||'').slice(0,-1); this.audio.sfx('ui'); this.render(); return; }
    this._adminPadVal=((this._adminPadVal||'')+k).slice(0,6); this.audio.sfx('ui');
    if(this._adminPadVal.length>=6){ if(this._adminPadVal==='071428'){ this.save.admin=true; this.save.layoutMode=true; persist(this.save); this._adminPadOpen=false; this.toast('開發者模式開啟','全地圖 · 無盡模式 · 一球秒節點 · 不計成績'); this.audio.sfx('levelup'); }
      else { this._adminPadVal=''; this._adminPadShake=1; this.toast('密碼錯誤'); this.audio.sfx('hurt'); } }
    this.render();
  },
  drawAdminPad(){ const ctx=this.ctx; ctx.save(); ctx.fillStyle='rgba(3,2,6,0.86)'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    this.btn(0,0,BW,BH,'apk_bg',()=>{}); // 擋住底層點擊
    const pw=720, ph=900, px=BW/2-pw/2, py=BH/2-ph/2;
    this.panel(px,py,pw,ph,{r:20,c0:'rgba(28,20,12,0.98)',c1:'rgba(14,9,6,0.99)',lw:2});
    this.text('開發者密碼',BW/2,py+78,40,'#e6c068',{align:'center',weight:'800',glow:8});
    this.text('輸入 6 位數密碼',BW/2,py+126,20,'#a99c80',{align:'center'});
    // 點點顯示
    const n=(this._adminPadVal||'').length, sh=(this._adminPadShake>0)?Math.sin(this.t*40)*8:0;
    for(let i=0;i<6;i++){ const dx=BW/2-150+i*60+sh, dy=py+186; ctx.beginPath(); ctx.arc(dx,dy,15,0,TAU); ctx.fillStyle= i<n?'#e6c068':'rgba(60,46,26,0.8)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(200,160,70,0.5)'; ctx.stroke(); }
    if(this._adminPadShake>0)this._adminPadShake=Math.max(0,this._adminPadShake-0.05);
    // 數字鍵盤 3x4
    const keys=[['1','2','3'],['4','5','6'],['7','8','9'],['del','0','close']]; const kw=180,kh=130,gap=20; const gw=3*kw+2*gap, gx=BW/2-gw/2, gy=py+250;
    for(let r=0;r<4;r++)for(let c=0;c<3;c++){ const k=keys[r][c]; const x=gx+c*(kw+gap),y=gy+r*(kh+gap);
      const lbl= k==='del'?'⌫': k==='close'?'✕': k; const danger=k==='close';
      this.rr(x,y,kw,kh,16); ctx.fillStyle= danger?'rgba(70,30,24,0.92)':'rgba(40,30,18,0.94)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle= danger?'rgba(220,120,90,0.7)':'rgba(200,160,70,0.55)'; ctx.stroke();
      this.text(lbl,x+kw/2,y+kh/2,k.length===1?52:40, danger?'#e8a890':'#f0e3c6',{align:'center',baseline:'middle',weight:'800'});
      ((kk)=>{ this.btn(x,y,kw,kh,'apk_'+kk,()=>this._adminKey(kk)); })(k);
    }
  },
  // shared layout: JSON(852x393 css)*U -> design units; interactive elems clamped to safe area
  _homeLayout(){
    const sc=this.scale||0.365;
    const baseW=852, baseH=393, ar=baseW/baseH;
    const cw=this.cw||baseW, ch=this.ch||baseH;
    let stageCssW=cw, stageCssH=stageCssW/ar;
    if(stageCssH>ch){ stageCssH=ch; stageCssW=stageCssH*ar; }
    const stageCssX=(cw-stageCssW)/2, stageCssY=(ch-stageCssH)/2;
    const stageScale=stageCssW/baseW;
    const U=stageScale/sc; this._U=U;
    const stage={x:(stageCssX-(this.ox||0))/sc,y:(stageCssY-(this.oy||0))/sc,w:stageCssW/sc,h:stageCssH/sc,cssX:stageCssX,cssY:stageCssY,cssW:stageCssW,cssH:stageCssH,scale:stageScale};
    const insL=this.insL||0,insR=this.insR||0,insT=this.insT||0,insB=this.insB||0;
    const safeTop=Math.max(insT,stage.y), safeBot=Math.min(BH-insB,stage.y+stage.h), safeL=Math.max(insL,stage.x), safeR=Math.min(BW-insR,stage.x+stage.w);
    let prim={x:stage.x+418*U,y:stage.y+230*U,w:270*U,h:58*U};
    const secGap=10*U, secCount=2, secBlock={x:stage.x+415*U,y:stage.y+296*U,w:280*U,h:55*U};
    // vertical clamp: keep secondary bottom + primary top inside safe area
    let dy=0; const blockBottom=secBlock.y+secBlock.h, maxBottom=safeBot-8*U;
    if(blockBottom>maxBottom) dy=blockBottom-maxBottom;
    prim.y-=dy; secBlock.y-=dy;
    if(prim.y<safeTop+8*U){ const d2=(safeTop+8*U)-prim.y; prim.y+=d2; secBlock.y+=d2; }
    const sw=(secBlock.w-secGap*(secCount-1))/secCount;
    const sec=[]; for(let i=0;i<secCount;i++) sec.push({x:secBlock.x+i*(sw+secGap),y:secBlock.y,w:sw,h:secBlock.h});
    let death={x:stage.x+8*U,y:stage.y+283*U,w:118*U,h:92*U};
    death.x=Math.max(death.x, safeL+8*U);
    death.y=Math.min(death.y, safeBot-8*U-death.h); death.y=Math.max(death.y, safeTop+8*U);
    return {U,sc,stage,insL,insR,insT,insB,safeTop,safeBot,safeL,safeR,prim,sec,secBlock,death};
  },
  _ensureHomeAssets(){ if(!this._homeImg){ this._homeImg={}; this._homeErr={}; }
    const A='/assets/';
    const need=(this._homeMode==='layered')
      ? {bgDark:A+'background/home_bg_dark_1704x786.webp',logoZh:A+'logo/logo_zh_lime.png',logoEn:A+'logo/logo_english_purple.png',hero:A+'character/hero_shadow_shooter.png',hoop:A+'decor/basketball_hoop_cluster.png',crowdL:A+'decor/skull_crowd_left.png',crowdR:A+'decor/skull_crowd_right.png',flame:A+'effects/flame_center.png'}
      : {flat:A+'background/home_scene_flat_1704x786.webp'};
    for(const k in need){ if(this._homeImg[k]===undefined){ try{ const img=new Image(); img.onerror=((kk)=>()=>{this._homeErr[kk]=true;})(k); img.src=need[k]; this._homeImg[k]=img; }catch(e){ this._homeErr[k]=true; } } }
  },
  _coverImg(img,dx,dy,dw,dh){ const ctx=this.ctx; const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height; if(!iw||!ih) return false; const s=Math.max(dw/iw,dh/ih),w=iw*s,h=ih*s; ctx.drawImage(img,dx+(dw-w)/2,dy+(dh-h)/2,w,h); return true; },
  _drawHomeFlat(LO){ const ctx=this.ctx; const im=this._homeImg.flat; let ok=false;
    ctx.save(); ctx.fillStyle='#150f22'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    if(im&&im.complete&&im.naturalWidth&&!this._homeErr.flat){ ctx.save(); const r=LO.stage; ctx.drawImage(im,r.x,r.y,r.w,r.h); ok=true; ctx.restore(); }
    if(!ok) this._drawHomeFallback(LO);
  },
  _drawHomeFallback(LO){ const ctx=this.ctx,U=LO.U;
    const r=LO.stage; const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,'#150b24'); g.addColorStop(0.5,'#0b0712'); g.addColorStop(1,'#06040a'); ctx.fillStyle=g; ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.save(); ctx.translate(r.x+r.w*0.6,r.y+r.h*0.32); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='800 '+(60*U)+'px "PingFang TC","Microsoft JhengHei",Georgia,serif'; ctx.lineJoin='round'; ctx.lineWidth=9*U; ctx.strokeStyle='rgba(8,12,4,0.85)'; ctx.strokeText('籃框破壞神',0,0); ctx.fillStyle='#A6D62E'; ctx.fillText('籃框破壞神',0,0);
    ctx.font='800 '+(28*U)+'px Georgia,serif'; ctx.fillStyle='#C47CEB'; ctx.fillText('HOOPBREAKER',0,44*U); ctx.restore();
  },
  _drawHomeLayered(LO){ const ctx=this.ctx,U=LO.U,t=this.t; const I=this._homeImg,E=this._homeErr; const px=(o)=>({x:LO.stage.x+o.x*U,y:LO.stage.y+o.y*U,w:o.w*U,h:o.h*U});
    // dark base
    ctx.save(); ctx.fillStyle='#150f22'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    if(I.bgDark&&I.bgDark.complete&&!E.bgDark){ ctx.save(); const r=LO.stage; ctx.drawImage(I.bgDark,r.x,r.y,r.w,r.h); ctx.restore(); } else { this._drawHomeFallback(LO); }
    const place=(img,o)=>{ if(img&&img.complete&&img.naturalWidth){ const r=px(o); ctx.drawImage(img,r.x,r.y,r.w,r.h); } };
    place(I.crowdL,{x:0,y:30,w:150,h:340}); place(I.crowdR,{x:715,y:45,w:137,h:310});
    place(I.hoop,{x:70,y:0,w:220,h:164}); place(I.graffiti,{x:10,y:8,w:100,h:92});
    // green flame behind hero (screen blend only for wisps)
    if(I.flame&&I.flame.complete){ ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.65+0.35*Math.sin(t*2.2); const f=px({x:225,y:150,w:120,h:170}); ctx.drawImage(I.flame,f.x,f.y,f.w,f.h); ctx.restore(); }
    // hero with breath
    if(I.hero&&I.hero.complete){ const bob=Math.sin(t/2.2*TAU)*2.5*U; const r=px({x:145,y:118,w:215,h:235}); ctx.drawImage(I.hero,r.x,r.y+bob,r.w,r.h); }
    // logos (normal blend, never screen)
    place(I.logoZh,{x:365,y:55,w:365,h:105}); place(I.logoEn,{x:425,y:145,w:280,h:45});
    this.text('籃獄圖譜 · ATLAS OF OVERTIME',LO.stage.x+568*U,LO.stage.y+193*U,13*U,'#A6D62E',{align:'center',weight:'700'});
    this.text('世界毀滅了，延長賽還沒結束。',LO.stage.x+568*U,LO.stage.y+210*U,12*U,'rgba(233,223,201,0.82)',{align:'center'});
  },
  _drawHomeScrim(LO){ const ctx=this.ctx,U=LO.U;
    const bx=Math.min(LO.prim.x,LO.secBlock.x), bx2=Math.max(LO.prim.x+LO.prim.w,LO.secBlock.x+LO.secBlock.w);
    const cx=(bx+bx2)/2, cy=(LO.prim.y+LO.sec[0].y+LO.sec[0].h)/2, rw=(bx2-bx)*0.95;
    const g=ctx.createRadialGradient(cx,cy,12*U,cx,cy,rw); g.addColorStop(0,'rgba(6,4,12,0.42)'); g.addColorStop(1,'rgba(6,4,12,0)');
    ctx.save(); ctx.fillStyle=g; ctx.fillRect(cx-rw,cy-rw,rw*2,rw*2); ctx.restore();
  },
  _drawHomeStats(LO){ const U=LO.U,st=this.save.stats||{};
    const txt='第 '+(this._unlockedActs()|0)+' 幕　·　最高分 '+(st.bestScore|0)+'　·　最高連擊 '+((st.bestCombo)||0);
    const x=LO.death.x+LO.death.w+18*U, y=LO.safeBot-12*U, maxW=LO.sec[0].x-x-14*U;
    this.text(this._clip(txt,maxW,11*U,'400'), x, y, 11*U,'rgba(224,214,198,0.5)',{align:'left',baseline:'middle'});
  },
  _drawHomeButtons(LO){ const U=LO.U;
    const pr=LO.prim; this._primaryBtn(pr,'進入板凳席',this._press(pr));
    this.btn(pr.x,pr.y-((Math.max(44*U,pr.h)-pr.h)/2),pr.w,Math.max(44*U,pr.h),'home_primary',()=>this.openLogin());
    const labels=['玩法','設定'], acts=[()=>{this._fromHome=true;this.go('codex');},()=>{this._fromHome=true;this.go('settings');}];
    for(let i=0;i<2;i++){ const r=LO.sec[i]; this._secondaryBtn(r,labels[i],this._press(r)); this.btn(r.x,r.y-((Math.max(44*U,r.h)-r.h)/2),r.w,Math.max(44*U,r.h),'home_sec'+i,acts[i]); }
  },
  _primaryBtn(r,label,pressed){ const ctx=this.ctx,U=this._U; const off=pressed?2*U:0; const x=r.x,y=r.y+off,w=r.w,h=r.h,rad=12*U;
    ctx.save();
    const pulse=0.5+0.5*Math.sin(this.t*2.2); ctx.shadowBlur=(pressed?5:13+pulse*6)*U; ctx.shadowColor='rgba(166,214,46,'+(pressed?0.4:0.6)+')';
    this.rr(x,y,w,h,rad); const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,pressed?'#bfe53f':'#d6ff54'); g.addColorStop(0.5,'#a6d62e'); g.addColorStop(1,'#7faf1f'); ctx.fillStyle=g; ctx.fill(); ctx.shadowBlur=0;
    ctx.save(); this.rr(x+3*U,y+3*U,w-6*U,h*0.46,rad*0.8); ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fill(); ctx.restore();
    ctx.lineWidth=3*U; ctx.strokeStyle='#101806'; this.rr(x,y,w,h,rad); ctx.stroke();
    ctx.lineWidth=1.4*U; ctx.strokeStyle='rgba(214,255,84,0.8)'; this.rr(x+2.6*U,y+2.6*U,w-5.2*U,h-5.2*U,rad-2*U); ctx.stroke();
    ctx.restore();
    ctx.save(); if(pressed)ctx.globalAlpha=0.92; this.text(label,x+w/2,y+h/2,21*U,'#0A0710',{align:'center',baseline:'middle',weight:'800'}); ctx.restore();
  },
  _secondaryBtn(r,label,pressed){ const ctx=this.ctx,U=this._U; const off=pressed?1.5*U:0; const x=r.x,y=r.y+off,w=r.w,h=r.h,rad=9*U;
    ctx.save();
    this.rr(x,y,w,h,rad); const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,'rgba(28,16,40,0.94)'); g.addColorStop(1,'rgba(14,8,22,0.96)'); ctx.fillStyle=g; ctx.fill();
    if(!pressed){ ctx.shadowBlur=6*U; ctx.shadowColor='rgba(143,76,178,0.4)'; }
    ctx.lineWidth=1.6*U; ctx.strokeStyle='rgba(196,124,235,0.72)'; this.rr(x,y,w,h,rad); ctx.stroke(); ctx.shadowBlur=0;
    ctx.restore();
    this.text(label,x+w/2,y+h/2,18*U,'#E9DFC9',{align:'center',baseline:'middle',weight:'700'});
  },
  _drawDeathCounter(LO){ const ctx=this.ctx,U=LO.U,s=this.save; const r=LO.death;
    ctx.save(); this.rr(r.x,r.y,r.w,r.h,10*U); const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,'rgba(18,10,26,0.9)'); g.addColorStop(1,'rgba(8,5,14,0.92)'); ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=1.6*U; ctx.strokeStyle='rgba(143,76,178,0.6)'; this.rr(r.x,r.y,r.w,r.h,10*U); ctx.stroke(); ctx.restore();
    this.text('今日死亡次數', r.x+r.w/2, r.y+18*U, 12*U,'#A6D62E',{align:'center',baseline:'middle',weight:'700'});
    const n=(s.deathsDay|0); const jit=Math.sin(this.t*3)*0.8*U;
    this.text(String(n), r.x+r.w/2, r.y+r.h*0.66+jit, 38*U,'#E9DFC9',{align:'center',baseline:'middle',weight:'800',glow:7*U});
  },
  _recordDeath(){ try{ const s=this.save; const k=new Date().toISOString().slice(0,10); if(s.deathsDayKey!==k){ s.deathsDayKey=k; s.deathsDay=0; } s.deathsDay=(s.deathsDay|0)+1; s.deaths=(s.deaths|0)+1; persist(s); }catch(e){} },

  drawHub(){ const ctx=this.ctx; this.backdrop('hub'); const s=this.save;
    this.text('最後板凳席',BW/2,96,56,'#ece0c4',{align:'center',weight:'800'});
    this.text('The Last Bench　·　七名投手圍著哨火，假裝沒人把球丟進火裡',BW/2,138,22,'#a2926e',{align:'center'});
    // campfire + heroes seated
    const fy=BH-220; this._campfire(BW/2,fy+120);
    for(let i=0;i<HEROES.length;i++){ const ang=Math.PI*(0.15+0.7*i/(HEROES.length-1)); const rx=560, x=BW/2-Math.cos(ang)*rx, y=fy+40-Math.sin(ang)*120;
      const sel=HEROES[i].id===s.hero; ctx.globalAlpha=sel?1:0.82; this.drawHero(HEROES[i].id,x,y,0.4,false); ctx.globalAlpha=1; if(sel){ this.text('▲',x,y+24,24,'#e6c068',{align:'center'}); } }
    // panels
    const hero=HEROES.find(h=>h.id===s.hero);
    this.panel(140,210,520,150,{r:14}); this.text('當前投手',164,250,22,'#e6c068',{weight:'700'}); this.text(hero.name+'　'+hero.en,164,294,30,'#ece0c4',{weight:'800'}); this.wrap('被動：'+hero.passive,164+170,330,330,26,'#cfc6b0',20,'left');
    // relic slots preview
    this.panel(BW-660,210,520,150,{r:14}); this.text('籃魂聖匣',BW-636,250,22,'#e6c068',{weight:'700'});
    for(let i=0;i<3;i++){ const rx=BW-636+i*168, ry=270; this.rr(rx,ry,150,70,10); ctx.fillStyle='rgba(20,14,9,0.9)'; ctx.fill(); ctx.strokeStyle='rgba(200,155,60,0.4)'; ctx.lineWidth=2; ctx.stroke(); const id=s.relics[i]; if(id){ this.text(RELICS[id].name,rx+75,ry+30,18,'#e6c068',{align:'center',weight:'700'}); this.text(RELIC_CLASS[RELICS[id].cls],rx+75,ry+52,14,'#a2926e',{align:'center'}); } else this.text('（空）',rx+75,ry+40,18,'rgba(160,150,130,0.6)',{align:'center'}); }
    // buttons
    const bw=300,bh=78,bx=BW/2-(bw*2+30)/2;
    this.button(bx,560,bw,bh,'進入籃獄圖譜','atlas',()=>this.go('atlas'),{primary:true,size:28});
    this.button(bx+bw+30,560,bw,bh,'選擇英雄','heroes',()=>this.go('heroes'),{size:26});
    this.button(bx,560+bh+24,bw,bh,'籃魂聖匣','relics',()=>this.go('relics'),{size:26});
    this.button(bx+bw+30,560+bh+24,bw,bh,'宿主圖鑑','codex',()=>this.go('codex'),{size:26});
    if(s.endless||s.admin) this.button(BW/2-200,560+bh*2+48,400,64,'∞ 無盡加時 (最佳 '+s.endlessBest+')','endless',()=>this.startEndless(),{size:24,color:'#e6c068'});
    this.button(70,144,176,74,'← 首頁','home',()=>this.go('home'),{size:22});
    this.text(this._heroProg(s.hero).level? ('Lv '+this._heroProg(s.hero).level) : 'Lv 1',BW-80,90,24,'#e6c068',{align:'right',weight:'700'});
  },
  _campfire(cx,cy){ const ctx=this.ctx,t=this.t; ctx.save(); ctx.translate(cx,cy); const gl=ctx.createRadialGradient(0,0,10,0,0,260); gl.addColorStop(0,'rgba(255,140,60,0.4)'); gl.addColorStop(1,'rgba(255,140,60,0)'); ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,260,0,TAU); ctx.fill();
    ctx.strokeStyle='#0d0c0b'; ctx.lineWidth=8; ctx.fillStyle='#4b3425'; ctx.save(); ctx.rotate(0.27); ctx.fillRect(-45,-9,90,18); ctx.strokeRect(-45,-9,90,18); ctx.restore(); ctx.save(); ctx.rotate(-0.27); ctx.fillRect(-45,-9,90,18); ctx.strokeRect(-45,-9,90,18); ctx.restore();
    const f=1+Math.sin(t*9)*0.08; ctx.save(); ctx.translate(0,-8); ctx.scale(f,1/f); this._rough([[-30,0],[-40,-30],[-22,-74],[-8,-40],[3,-100],[20,-54],[38,-72],[32,-18],[19,4]],'#e96116',{seed:81,lw:6,wob:2}); this._rough([[-18,0],[-23,-28],[-7,-60],[0,-34],[13,-70],[25,-25],[16,2]],'#ffc12a',{seed:82,lw:4,wob:1}); ctx.restore(); ctx.restore(); }

  ,_heroArrow(cx,cy,dir){ const ctx=this.ctx; const r=38; this.rr(cx-r,cy-r,r*2,r*2,r); ctx.fillStyle='rgba(48,36,22,0.97)'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle='rgba(240,205,120,0.9)'; ctx.stroke();
    ctx.save(); ctx.strokeStyle='#f6d27e'; ctx.lineWidth=6; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); if(dir<0){ ctx.moveTo(cx+11,cy-15); ctx.lineTo(cx-10,cy); ctx.lineTo(cx+11,cy+15); } else { ctx.moveTo(cx-11,cy-15); ctx.lineTo(cx+10,cy); ctx.lineTo(cx-11,cy+15); } ctx.stroke(); ctx.restore();
    this.btn(cx-r,cy-r,r*2,r*2,'arr'+dir,()=>{ this._heroView=(this._heroView+dir+HEROES.length)%HEROES.length; this.audio.sfx('ui'); }); }
  ,_ensureHsBg(){ if(this._hsBg===undefined){ try{ const im=new Image(); im.onerror=()=>{this._hsBgErr=true;}; im.src='/assets/hero_select/bg_clean.webp'; this._hsBg=im; }catch(e){ this._hsBgErr=true; } }
    if(this._hsSel===undefined){ try{ const im=new Image(); im.src='/assets/hero_select/sel_btn.webp'; this._hsSel=im; }catch(e){ this._hsSel=null; } } }
  ,drawHeroes(){ const s=this.save;
    if(this._heroView==null||this._heroView<0) this._heroView=Math.max(0,HEROES.findIndex(h=>h.id===s.hero));
    if(this._heroView>=HEROES.length) this._heroView=0;
    const LO=this._heroesLayout(); this._HL=LO;
    this._ensureHsBg(); const bg=this._hsBg;
    this.ctx.fillStyle='#150f22'; this.ctx.fillRect(0,0,BW,BH);
    if(bg&&bg.complete&&bg.naturalWidth&&!this._hsBgErr){ const r=LO.stage; this.ctx.drawImage(bg,r.x,r.y,r.w,r.h); }
    else { this.backdrop('hub'); this._hsFallback=true; }
    this.drawHeroesHeader(LO);
    this.drawHeroCard(LO);
    this.drawTalentPanel(LO);
    if(this._bag) this.drawRelicBag(LO); else if(this._heroSheet) this.drawHeroSheet(LO);
    if(this._relicSheet) this.drawRelicSheet(LO);
    if(this._talSheet) this.drawTalentSheetU(LO);
  }
  ,_press(r){ return !!(this.pointer&&this.pointer.down && this.pointer.x>=r.x&&this.pointer.x<=r.x+r.w&&this.pointer.y>=r.y&&this.pointer.y<=r.y+r.h); }
  ,_fade(hex,a){ const c=(hex||'#888').replace('#',''); const r=parseInt(c.slice(0,2),16)||120,g=parseInt(c.slice(2,4),16)||120,b=parseInt(c.slice(4,6),16)||120; return 'rgba('+r+','+g+','+b+','+a+')'; }
  ,_clip(str,maxW,size,weight){ const ctx=this.ctx; ctx.font=(weight||'600')+' '+size+'px Georgia,serif'; if(ctx.measureText(str).width<=maxW) return str; let r=str; while(r.length>1 && ctx.measureText(r+'…').width>maxW) r=r.slice(0,-1); return r+'…'; }
  ,_hdiv(x,y,w,U){ const ctx=this.ctx; ctx.save(); ctx.strokeStyle='rgba(230,192,104,0.16)'; ctx.lineWidth=Math.max(1,1*U); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y); ctx.stroke(); ctx.restore(); }
  // ===== shared layout (design units derived from CSS-px via U=1/scale) =====
  ,_heroesLayout(){
    const stage=this._artStage(), sc=stage.sc, U=stage.U; this._U=U;
    const insL=this.insL||0, insR=this.insR||0, insT=this.insT||0, insB=this.insB||0;
    const X=v=>stage.x+v*U, Y=v=>stage.y+v*U, D=v=>v*U;
    const safeTop=Math.max(insT,stage.y), safeBot=Math.min(BH-insB,stage.y+stage.h), safeL=Math.max(insL,stage.x), safeR=Math.min(BW-insR,stage.x+stage.w);
    const cx0=safeL+12*U, cx1=safeR-12*U, cy0=safeTop+6*U, ch=safeBot-safeTop-12*U, cw=cx1-cx0;
    const headerY=Y(8), headerH=D(50);
    // painted frame anchors measured from cleaned base (852 space)
    const backHit={x:Math.max(safeL+4*U,X(70)), y:Math.max(safeTop+4*U,Y(5)), w:Math.max(44*U,D(62)), h:Math.max(44*U,D(52))};
    const selW=D(117), selH=D(39); const selR={x:Math.min(safeR-selW-4*U,X(670)), y:Y(9), w:selW, h:selH};
    const card={x:X(84), y:Y(74), w:D(206), h:D(287), r:D(12)};
    const tal={x:X(300), y:Y(70), w:D(509), h:D(291), r:D(12)};
    return {U,sc,stage,insL,insR,insT,insB,safeTop,safeBot,safeL,safeR,cx0,cx1,cy0,ch,cw,headerY,headerH,backHit,selR,selW,selH,card,tal};
  }
  // ===== top nav =====
  ,drawHeroesHeader(LO){ const ctx=this.ctx,U=LO.U,s=this.save; const vi=this._heroView,h=HEROES[vi],equipped=s.hero===h.id;
    // back: frame + arrow are painted in base; only register hit (+press dim)
    const b=LO.backHit;
    if(this._press(b)){ ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='#000'; this.rr(b.x,b.y,b.w,b.h,10*U); ctx.fill(); ctx.restore(); }
    this.btn(b.x,b.y,b.w,b.h,'back',()=>{ this._heroSheet=null; this.go('hub'); });
    // title / pagination / dots — crisp over faint ghost, absolute css×U
    const mid=LO.stage.x+LO.stage.w/2;
    this.text('選擇英雄', mid, LO.stage.y+28*U, 22*U,'#f1e7cf',{align:'center',weight:'800',glow:7*U});
    this.text((vi+1)+' / '+HEROES.length, mid, LO.stage.y+46*U, 12*U,'#cdbb95',{align:'center'});
    const dN=HEROES.length, dy=LO.stage.y+57*U, dgap=11*U, dx0=mid-(dN-1)*dgap/2;
    for(let i=0;i<dN;i++){ ctx.beginPath(); ctx.arc(dx0+i*dgap,dy,(i===vi)?3*U:2*U,0,TAU); ctx.fillStyle=(i===vi)?'#e6c068':'rgba(180,160,120,0.4)'; ctx.fill(); }
    // select (right) — use the painted asset button on the (feather-)cleaned bg
    const r=LO.selR; const sel=this._hsSel;
    if(sel&&sel.complete&&sel.naturalWidth){ ctx.drawImage(sel,r.x,r.y,r.w,r.h); }
    if(this._press(r)){ ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle='#000'; this.rr(r.x,r.y,r.w,r.h,r.h*0.4); ctx.fill(); ctx.restore(); }
    this.btn(r.x,r.y,r.w,r.h,'ok',()=>{ s.hero=h.id; persist(s); this.audio.sfx('select'); this.toast('已選用 '+h.name); });
  }
  // ===== left hero card (single integrated panel) =====
  ,drawHeroCard(LO){ const ctx=this.ctx,U=LO.U,s=this.save; const vi=this._heroView,h=HEROES[vi],equipped=s.hero===h.id; const c=LO.card;
    // painted card frame is in base; no procedural panel bg. equipped -> glow the painted OUTER frame
    if(equipped){ ctx.save(); ctx.shadowBlur=18*U; ctx.shadowColor='rgba(240,212,120,0.9)'; ctx.lineWidth=3*U; ctx.strokeStyle='rgba(240,212,120,0.45)'; this.rr(LO.stage.x+76*U,LO.stage.y+59*U,221*U,310*U,16*U); ctx.stroke(); ctx.stroke(); ctx.restore(); }
    const pad=10*U, ix=c.x+pad, iw=c.w-2*pad, cxm=c.x+c.w/2;
    // bottom-up compact blocks (name sits under portrait, no separate block)
    const relicH=58*U, skillH=44*U, sumH=26*U, divG=5*U;
    const relicY=c.y+c.h-4*U-relicH;
    const skillY=relicY-divG-skillH;
    const sumY=skillY-9*U-sumH;
    const portBot=sumY-divG-2*U, portTop=c.y+pad+2*U;
    const nameBlockH=50*U, heroBot=portBot-nameBlockH, heroH=heroBot-portTop, pcx=cxm, pcy=portTop+heroH*0.5;
    // portrait glow
    const rg=ctx.createRadialGradient(pcx,pcy,16*U,pcx,pcy,heroH*0.62);
    rg.addColorStop(0,'rgba(255,200,112,0.26)'); rg.addColorStop(0.55,'rgba(255,150,60,0.07)'); rg.addColorStop(1,'rgba(255,150,60,0)');
    ctx.save(); ctx.fillStyle=rg; ctx.beginPath(); ctx.ellipse(pcx,pcy,heroH*0.6,heroH*0.58,0,0,TAU); ctx.fill(); ctx.restore();
    const feetY=heroBot-2*U, psc=Math.min(1.18,(heroH*0.94)/246);
    ctx.save(); ctx.fillStyle='rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(pcx,feetY+2*U,heroH*0.3,heroH*0.06,0,0,TAU); ctx.fill(); ctx.restore();
    this.drawHero(h.id, pcx, feetY, psc);
    // nav arrows flank the hero
    this._heroNav(ix+18*U, pcy, -1, U);
    this._heroNav(c.x+c.w-pad-18*U, pcy, +1, U);
    // name / en / role (under portrait)
    this.text(this._clip(h.name,iw,22*U,'800'), cxm, heroBot+22*U, 22*U,'#f1e7cf',{align:'center',weight:'800'});
    this.text(this._clip(h.en,iw,16*U,'700'), cxm, heroBot+39*U, 15*U, h.col,{align:'center',weight:'700'});
    this.text(this._clip(h.role,iw,12*U,'600'), cxm, heroBot+52*U, 12*U,'#e6c068',{align:'center'});
    // summary
    this._hdiv(ix, sumY-4*U, iw, U);
    this._summaryRow(ix, sumY, iw, sumH, U);
    // base skill
    this._hdiv(ix, skillY-4*U, iw, U);
    this._baseSkillRow(ix, skillY, iw, skillH, h, U);
    // relics
    this._hdiv(ix, relicY-4*U, iw, U);
    this._relicRow(ix, relicY, iw, relicH, U);
  }
  ,_heroNav(cx,cy,dir,U){ const ctx=this.ctx; const vr=17*U, hit=Math.max(44*U,vr*2);
    const r={x:cx-hit/2,y:cy-hit/2,w:hit,h:hit}; ctx.save(); if(this._press(r))ctx.globalAlpha=0.7;
    this.rr(cx-vr,cy-vr,vr*2,vr*2,vr); ctx.fillStyle='rgba(48,36,22,0.95)'; ctx.fill(); ctx.lineWidth=1.6*U; ctx.strokeStyle='rgba(240,205,120,0.85)'; ctx.stroke();
    ctx.strokeStyle='#f6d27e'; ctx.lineWidth=3*U; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath();
    if(dir<0){ ctx.moveTo(cx+5*U,cy-7*U); ctx.lineTo(cx-5*U,cy); ctx.lineTo(cx+5*U,cy+7*U); } else { ctx.moveTo(cx-5*U,cy-7*U); ctx.lineTo(cx+5*U,cy); ctx.lineTo(cx-5*U,cy+7*U); }
    ctx.stroke(); ctx.restore();
    this.btn(r.x,r.y,r.w,r.h,'nav'+dir,()=>{ this._heroView=(this._heroView+dir+HEROES.length)%HEROES.length; this._heroSheet=null; this._bag=null; this.audio.sfx('ui'); }); }
  ,_summaryRow(x,y,w,hh,U){ const ctx=this.ctx; const cy=y+hh/2;
    const hid=(HEROES[this._heroView]||{}).id||this.save.hero; const hp=this._heroProg(hid);
    const cells=[['Lv',String(hp.level||1)],['空心',String(hp.swishes||0)],['打板',String(hp.banks||0)],['Miss',String(hp.misses||0)]];
    const cw=w/cells.length;
    for(let i=0;i<cells.length;i++){ const cx=x+cw*i+cw/2;
      if(i>0){ ctx.save(); ctx.strokeStyle='rgba(230,192,104,0.14)'; ctx.lineWidth=1*U; ctx.beginPath(); ctx.moveTo(x+cw*i,y+3*U); ctx.lineTo(x+cw*i,y+hh-3*U); ctx.stroke(); ctx.restore(); }
      this.text(cells[i][0], cx, cy-1*U, 11*U,'#a99c80',{align:'center',baseline:'bottom'});
      this.text(cells[i][1], cx, cy+1*U, 13*U,'#ece0c4',{align:'center',baseline:'top',weight:'700'});
    }
  }
  ,_baseSkillRow(x,y,w,hh,h,U){ const ctx=this.ctx; const r={x:x,y:y,w:w,h:hh};
    // icon box
    const bs=Math.min(hh-6*U,40*U), by=y+(hh-bs)/2;
    this.rr(x,by,bs,bs,8*U); ctx.fillStyle='rgba(20,14,9,0.9)'; ctx.fill(); ctx.lineWidth=1.4*U; ctx.strokeStyle='rgba(230,192,104,0.45)'; ctx.stroke();
    this.text('★', x+bs/2, by+bs/2, 18*U,'#e6c068',{align:'center',baseline:'middle'});
    const tx=x+bs+10*U, tw=w-bs-10*U;
    this.text('基礎技能', tx, y+18*U, 13*U,'#e6c068',{weight:'700'});
    let ds=12*U; ctx.font='400 '+ds+'px Georgia,serif';
    while(ds>8*U && ctx.measureText(h.passive).width>tw){ ds-=0.5*U; ctx.font='400 '+ds+'px Georgia,serif'; }
    this.text(this._clip(h.passive,tw,ds,'400'), tx, y+38*U, ds,'#cfc6b0');
    this.btn(r.x,r.y,r.w,r.h,'skill',()=>{ this._bag=null; this._heroSheet={title:h.name+'｜'+h.en,accent:'#e6c068',rows:[['定位',h.role],['一句話',h.tag||'']],desc:h.passive}; this.audio.sfx('ui'); this.render(); });
  }
  ,_relicRow(x,y,w,hh,U){ const ctx=this.ctx, s=this.save; const load=s.loadout||[null,null,null,null,null]; const cnt=load.filter(Boolean).length;
    this.text('聖物 '+cnt+'/5', x, y+16*U, 13*U,'#e6c068',{weight:'700'});
    const tags=this._bdTags(load); let tx=x+58*U;
    for(const tg of tags.slice(0,4)){ ctx.font='700 '+(10*U)+'px Georgia,serif'; const tw=ctx.measureText(tg).width+9*U; if(tx+tw>x+w) break; this.rr(tx,y+5*U,tw,15*U,5*U); ctx.fillStyle='rgba(58,44,20,0.92)'; ctx.fill(); ctx.lineWidth=1*U; ctx.strokeStyle='rgba(200,160,70,0.5)'; ctx.stroke(); this.text(tg,tx+tw/2,y+12.5*U,10*U,'#f0d8a0',{align:'center',baseline:'middle',weight:'700'}); tx+=tw+5*U; }
    const slotN=5, sgap=7*U, bagW=58*U, bagH=Math.min(32*U,hh-26*U), gapToBag=12*U;
    let sw=23*U; let groupW=slotN*sw+(slotN-1)*sgap+gapToBag+bagW;
    if(groupW>w){ const avail=w-gapToBag-bagW-(slotN-1)*sgap; sw=Math.max(18*U,avail/slotN); groupW=slotN*sw+(slotN-1)*sgap+gapToBag+bagW; }
    const gx=x+(w-groupW)/2, sy=y+24*U;
    for(let i=0;i<slotN;i++){ const sx=gx+i*(sw+sgap); const rid=load[i]; const rel=rid&&RELICS[rid];
      this.rr(sx,sy,sw,sw,5*U); ctx.fillStyle= rel? this._fade(this._clsCol(rel.cls),0.5) : 'rgba(20,14,9,0.88)'; ctx.fill(); ctx.lineWidth=1.4*U; ctx.strokeStyle= rel? this._clsCol(rel.cls) : 'rgba(230,192,104,0.38)'; ctx.stroke();
      if(rel){ this.text(rel.name.slice(0,1), sx+sw/2, sy+sw/2, 14*U,'#f4ead2',{align:'center',baseline:'middle',weight:'800'}); }
      const hit=Math.max(44*U,sw); ((ii)=>{ this.btn(sx-(hit-sw)/2,sy-(hit-sw)/2,hit,hit,'relic'+ii,()=>{ const rid=(this.save.loadout||[])[ii]; if(rid){ this._openRelicSheet(rid); } else { this._bag=true; this._heroSheet=null; this.audio.sfx('ui'); this.render(); } }); })(i); }
    const bagX=gx+slotN*sw+(slotN-1)*sgap+gapToBag, bagY=sy+(sw-bagH)/2;
    const r={x:bagX,y:bagY,w:bagW,h:bagH}; ctx.save(); if(this._press(r))ctx.globalAlpha=0.84;
    this.rr(bagX,bagY,bagW,bagH,8*U); ctx.fillStyle='rgba(40,30,18,0.92)'; ctx.fill(); ctx.lineWidth=1.6*U; ctx.strokeStyle='rgba(200,155,60,0.5)'; ctx.stroke(); ctx.restore();
    this.text('背包 \u203a', bagX+bagW/2, bagY+bagH/2, 12*U,'#ece0c4',{align:'center',baseline:'middle',weight:'700'});
    this.btn(bagX,bagY-(44*U-bagH)/2,bagW,Math.max(44*U,bagH),'bag',()=>{ this._bag=true; this._bagSel=null; this._heroSheet=null; this.audio.sfx('ui'); this.render(); });
  }
  // ===== right talent tree =====
  ,_talentLanes(){ return [ {key:'break',name:'破框系',col:'#e88a5a',icon:'⚔'}, {key:'dirty',name:'髒球系',col:'#6fb0e8',icon:'❖'}, {key:'feel',name:'手感系',col:'#79c06a',icon:'❀'} ]; }
  ,drawTalentPanel(LO){ const ctx=this.ctx,U=LO.U; const t=LO.tal; const hid=(HEROES[this._heroView]||{}).id;
    const lanes=HERO_LANES[hid]||HERO_LANES.axer; const tree=TALENT_TREES[hid]||[];
    const avail=this._talentPtsAvail(hid), earned=this._talentPtsEarned(hid);
    const pad=16*U, hH=42*U, hY=t.y+pad;
    this.text('天賦樹', t.x+pad+8*U, hY+18*U, 16*U,'#f6d27e',{weight:'800'});
    this.text('點圈圈即可學習', t.x+pad+72*U, hY+18*U, 12*U,'#a99c80',{weight:'600'});
    this.text('天賦點 '+avail+'/10', t.x+t.w-pad-30*U, hY+17*U, 13*U, avail>0?'#9fe6ff':'#a99c80',{align:'right',weight:'800'});
    this._hdiv(t.x+pad+8*U, hY+hH, t.w-2*pad-8*U, U);
    // lanes (real tree: 3 lanes × 7 rows)
    const N=7;
    const areaTop=hY+hH+10*U, areaBot=t.y+t.h-pad, areaH=areaBot-areaTop;
    const labelW=96*U, nodeX0=t.x+pad+10*U+labelW, nodeX1=t.x+t.w-pad-46*U;
    const laneY=i=>areaTop+areaH*(i+0.5)/3;
    const NX=n=>nodeX0+(nodeX1-nodeX0)*n/(N-1);
    // 跨線虛線：每一列把三條流派連起來（可橫跨運用 10 點）
    ctx.save(); ctx.strokeStyle='rgba(200,170,110,0.3)'; ctx.lineWidth=2*U; ctx.setLineDash([3*U,5*U]); ctx.lineCap='round';
    for(let c=0;c<N;c++){ const x=NX(c); ctx.beginPath(); ctx.moveTo(x,laneY(0)); ctx.lineTo(x,laneY(2)); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
    for(let i=0;i<3;i++){ const L=lanes[i], ly=laneY(i);
      this.text(L.name+'線', t.x+pad+12*U, ly+0.5*U, 15*U, L.col,{align:'left',baseline:'middle',weight:'800'});
      ctx.save(); ctx.strokeStyle=this._fade(L.col,0.5); ctx.lineWidth=3*U; ctx.beginPath(); ctx.moveTo(NX(0),ly); ctx.lineTo(NX(N-1),ly); ctx.stroke(); ctx.restore();
      const nodes=tree.filter(n=>n.lane===i).sort((a,b)=>a.row-b.row);
      for(let n=0;n<N;n++){ const node=nodes[n]; if(!node)continue; const px=NX(n);
        const unlocked=this._talentUnlocked(hid,node.id); const prereq=this._talentPrereqLock(hid,node);
        const state= unlocked?'on':(!prereq?'sel':'off');
        this._talentNode(px,ly,state,L.col,U);
        if(node.tier==='big'){ this.text('★', px, ly+0.5*U, 10*U,'#fff',{align:'center',baseline:'middle'}); }
        const hit=Math.max(40*U,30*U); ((nd)=>{ this.btn(px-hit/2,ly-hit/2,hit,hit,'tn'+i+'_'+nd.row,()=>this._openTalentSheet(hid,nd)); })(node);
      }
    }
  }
  ,drawTalentSheetU(LO){ const ctx=this.ctx,U=LO.U; const sh=this._talSheet; if(!sh){ return; }
    const id=sh.heroId, tree=TALENT_TREES[id]||[]; const node=tree.find(n=>n.id===sh.nodeId); if(!node){ this._talSheet=null; return; }
    const lanes=HERO_LANES[id]||HERO_LANES.axer; const lane=lanes[node.lane]||{name:'',col:'#e6c068'};
    const unlocked=this._talentUnlocked(id,node.id); const prereq=this._talentPrereqLock(id,node); const avail=this._talentPtsAvail(id); const big=node.tier==='big';
    ctx.save(); ctx.fillStyle='rgba(2,1,4,0.64)'; ctx.fillRect(-3000,-3000,BW+6000,BH+6000); ctx.restore();
    this.btn(-3000,-3000,BW+6000,BH+6000,'talUscrim',()=>{ this._talSheet=null; this.render(); });
    const w=Math.min(LO.cw*0.74, 560*U), hh=212*U; const x=Math.max(LO.cx0,BW/2-w/2), y=LO.cy0+(LO.ch-hh)/2;
    this.panel(x,y,w,hh,{r:14*U,c0:'rgba(30,22,14,0.99)',c1:'rgba(15,10,6,0.99)',lw:2*U});
    ctx.save(); ctx.fillStyle=lane.col; this.rr(x,y,6*U,hh,3*U); ctx.fill(); ctx.restore();
    this.text((big?'★ ':'')+lane.name+'線 · '+node.name, x+22*U, y+28*U, 16*U, lane.col,{weight:'800'});
    this.text(unlocked?'✓ 已學':(prereq?prereq:(avail>0?'可學 -1點':'天賦點不足')), x+w-48*U, y+28*U, 12*U, unlocked?'#6fae4a':(prereq||avail<=0?'#c98b5c':'#9fe6ff'),{align:'right',weight:'700'});
    this._hdiv(x+22*U, y+44*U, w-44*U, U);
    this.wrap(node.desc, x+w/2, y+76*U, w-48*U, 18*U,'#cfc6b0', 13*U,'center');
    const bw=Math.min(150*U,(w-66*U)/2), bh=46*U, gap=14*U, by=y+hh-bh-14*U, bx0=x+w/2-bw-gap/2, bx1=x+w/2+gap/2;
    if(unlocked){
      this.button(bx0,by,bw,bh,'退回 +1','talrefundU',()=>{ this._refundTalent(id,node); },{size:15*U,color:'#e88a5a',weight:'800'});
      this.button(bx1,by,bw,bh,'關閉','talcloseU',()=>{ this._talSheet=null; this.render(); },{size:15*U});
    } else {
      const can=!prereq&&avail>0;
      if(can){ this.button(bx0,by,bw,bh,'確認','talconfirmU',()=>{ this._buyTalent(id,node); this._talSheet=null; this.render(); },{primary:true,size:15*U,weight:'800'}); }
      else { ctx.save(); ctx.globalAlpha=0.5; this.rr(bx0,by,bw,bh,12*U); ctx.fillStyle='rgba(60,46,26,0.6)'; ctx.fill(); ctx.lineWidth=2*U; ctx.strokeStyle='rgba(200,160,70,0.4)'; ctx.stroke(); ctx.restore(); this.text(prereq?'未解上一格':'點數不足', bx0+bw/2, by+bh/2, 13*U,'#a99c80',{align:'center',baseline:'middle',weight:'700'}); }
      this.button(bx1,by,bw,bh,'關閉','talcloseU',()=>{ this._talSheet=null; this.render(); },{size:15*U});
    }
    const cs=20*U,cxb=x+w-cs-12*U,cyb=y+12*U; ctx.save(); ctx.strokeStyle='#e6c068'; ctx.lineWidth=2.4*U; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(cxb,cyb); ctx.lineTo(cxb+cs,cyb+cs); ctx.moveTo(cxb+cs,cyb); ctx.lineTo(cxb,cyb+cs); ctx.stroke(); ctx.restore();
    const xh=Math.max(44*U,cs); this.btn(cxb+cs/2-xh/2,cyb+cs/2-xh/2,xh,xh,'talcloseXU',()=>{ this._talSheet=null; this.render(); });
  }
  ,_talentNode(px,ly,state,col,U){ const ctx=this.ctx,r=13*U; ctx.save();
    if(state==='on'){ ctx.beginPath(); ctx.arc(px,ly,r,0,TAU); ctx.fillStyle=col; ctx.shadowBlur=10*U; ctx.shadowColor=col; ctx.fill(); ctx.shadowBlur=0; ctx.lineWidth=2*U; ctx.globalAlpha=0.55; ctx.strokeStyle='#fff'; ctx.stroke(); ctx.globalAlpha=1; }
    else if(state==='sel'){ ctx.beginPath(); ctx.arc(px,ly,r,0,TAU); ctx.fillStyle='rgba(30,22,14,0.96)'; ctx.fill(); ctx.lineWidth=2.6*U; ctx.strokeStyle=col; ctx.shadowBlur=8*U; ctx.shadowColor=col; ctx.stroke(); ctx.shadowBlur=0; }
    else { ctx.beginPath(); ctx.arc(px,ly,r,0,TAU); ctx.fillStyle='rgba(26,20,14,0.9)'; ctx.fill(); ctx.lineWidth=1.8*U; ctx.strokeStyle=this._fade(col,0.4); ctx.stroke(); }
    ctx.restore(); }
  ,_openTalent(L,level,idx){ const h=HEROES[this._heroView]; const ln=(HERO_TALENTS[h.id]||{})[L.key]; const node=ln&&ln[idx]; this._bag=null;
      if(node){ this._heroSheet={ title:L.name+' · Lv'+level, accent:L.col, rows:[['英雄',h.name],['節點',node.name],['需求等級',String(level)]], desc:node.desc }; }
      else { this._heroSheet={ title:L.name+' · Lv'+level, accent:L.col, rows:[['英雄',h.name],['狀態','規劃中']], desc:'此英雄的天賦節點規劃中，下一階段實裝。' }; }
      this.audio.sfx('ui'); this.render(); }
  ,drawHeroSheet(LO){ const ctx=this.ctx,U=LO.U,sh=this._heroSheet;
    // scrim (also full-screen dismiss)
    ctx.save(); ctx.fillStyle='rgba(4,2,8,0.58)'; ctx.fillRect(-3000,-3000,BW+6000,BH+6000); ctx.restore();
    this.btn(-3000,-3000,BW+6000,BH+6000,'sheetscrim',()=>{ this._heroSheet=null; });
    const rows=sh.rows||[]; const w=Math.min(LO.cw*0.72, 620*U);
    const titleH=44*U, rowH=26*U, descH=sh.desc?44*U:0, hh=titleH+rows.length*rowH+descH+22*U;
    const x=Math.max(LO.cx0, BW/2-w/2), y=LO.cy0+(LO.ch-hh)/2;
    this.panel(x,y,w,hh,{r:14*U,c0:'rgba(30,22,14,0.98)',c1:'rgba(16,11,7,0.99)',lw:2*U});
    // accent bar
    ctx.save(); ctx.fillStyle=sh.accent||'#e6c068'; this.rr(x,y,6*U,hh,3*U); ctx.fill(); ctx.restore();
    this.text(sh.title, x+22*U, y+28*U, 16*U, sh.accent||'#f6d27e',{weight:'800'});
    let ry=y+titleH+8*U;
    for(const row of rows){ this.text(row[0], x+22*U, ry, 12*U,'#a99c80'); this.text(this._clip(row[1],w-150*U,12*U,'700'), x+w-22*U, ry, 12*U,'#ece0c4',{align:'right',weight:'700'}); ry+=rowH; }
    if(sh.desc){ this._hdiv(x+22*U, ry-6*U, w-44*U, U); this.wrap(sh.desc, x+w/2, ry+16*U, w-48*U, 18*U,'#cfc6b0', 12*U, 'center'); }
    // close X (top-right), hit >=44
    const cs=22*U, cxb=x+w-cs-12*U, cyb=y+12*U;
    ctx.save(); ctx.strokeStyle='#e6c068'; ctx.lineWidth=2.4*U; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(cxb,cyb); ctx.lineTo(cxb+cs,cyb+cs); ctx.moveTo(cxb+cs,cyb); ctx.lineTo(cxb,cyb+cs); ctx.stroke(); ctx.restore();
    const hit=Math.max(44*U,cs); this.btn(cxb+cs/2-hit/2,cyb+cs/2-hit/2,hit,hit,'sheetclose',()=>{ this._heroSheet=null; });
  }
  ,_clsCol(c){ return ({core:'#e0853c',feel:'#6fb0e8',oath:'#c060c0',gag:'#79c06a',job:'#d7a945'})[c]||'#e6c068'; }
  ,_clsName(c){ return ({core:'核心',feel:'手感',oath:'誓約',gag:'惡搞',job:'職業'})[c]||c; }
  ,_bdTags(load){ const out=[]; const add=t=>{ if(t&&out.indexOf(t)<0)out.push(t); }; const FT={fire:'火',ice:'冰',lightning:'雷',axe:'斧頭',arrow:'箭',normal:'皮球'};
    for(const rid of (load||[])){ if(!rid)continue; const r=RELICS[rid]; if(!r)continue; if(r.form)add(FT[r.form]); const d=r.desc||'';
      if(d.indexOf('護盾')>=0)add('護盾'); if(d.indexOf('擦板')>=0)add('擦板'); if(d.indexOf('連擊')>=0||d.indexOf('連續')>=0)add('連擊');
      if(d.indexOf('失手')>=0||d.indexOf('致命')>=0||d.indexOf('風險')>=0)add('高風險'); if(d.indexOf('XP')>=0||d.indexOf('升級')>=0)add('成長'); }
    return out; }
  ,_toggleRelic(rid){ const s=this.save; if(!s.loadout)s.loadout=[null,null,null,null,null]; const i=s.loadout.indexOf(rid);
    if(i>=0){ s.loadout[i]=null; }
    else {
      // Phase 6.1: 核心球(帶 form 的聖物)最多帶 1 顆——裝新的自動替換舊核心球
      const def=RELICS[rid];
      if(def&&def.form){ for(let k=0;k<s.loadout.length;k++){ const ex=s.loadout[k]; if(ex&&RELICS[ex]&&RELICS[ex].form){ s.loadout[k]=null; this.toast('核心球只能帶 1 顆','已替換為 '+def.name); } } }
      const e=s.loadout.indexOf(null); if(e<0){ this.toast('聖物已滿','先卸下一個再裝'); this.audio.sfx('ui'); return; } s.loadout[e]=rid;
    }
    persist(s); this.audio.sfx('ui'); this.render(); }
  ,_relicGlyph(rid,r){ const ctx=this.ctx, M={abbey_ember:'fire',sand_bow:'arrow',citadel_battery:'lightning',red_axe:'axe',final_chill:'ice',broken_glass:'hourglass',deadeye_sigil:'eye',kings_seal:'seal',blood_chalice:'cup',hex_idol:'idol',pilgrim_bone:'bone',rift_feather:'feather',champ_ball:'ball',bench_towel:'towel',ref_glasses:'glasses',board_brace:'brace'};
    const k=M[rid]||'dot'; const A=(x,y,rr)=>{ ctx.moveTo(x+rr,y); ctx.arc(x,y,rr,0,TAU); };
    ctx.beginPath();
    switch(k){
      case 'fire': ctx.moveTo(0,-r); ctx.bezierCurveTo(0.5*r,-0.4*r,0.5*r,0.2*r,0,0.62*r); ctx.bezierCurveTo(-0.5*r,0.2*r,-0.5*r,-0.4*r,0,-r); ctx.moveTo(0,0.05*r); ctx.bezierCurveTo(0.24*r,0.2*r,0.2*r,0.46*r,0,0.58*r); ctx.bezierCurveTo(-0.2*r,0.46*r,-0.24*r,0.2*r,0,0.05*r); break;
      case 'arrow': ctx.moveTo(-0.78*r,0); ctx.lineTo(0.78*r,0); ctx.moveTo(0.34*r,-0.34*r); ctx.lineTo(0.78*r,0); ctx.lineTo(0.34*r,0.34*r); break;
      case 'lightning': ctx.moveTo(0.2*r,-0.92*r); ctx.lineTo(-0.34*r,0.04*r); ctx.lineTo(0.06*r,0.04*r); ctx.lineTo(-0.2*r,0.92*r); ctx.lineTo(0.44*r,-0.16*r); ctx.lineTo(0.02*r,-0.16*r); ctx.closePath(); break;
      case 'axe': ctx.moveTo(-0.62*r,0.66*r); ctx.quadraticCurveTo(-0.1*r,-0.62*r,0.72*r,-0.52*r); ctx.quadraticCurveTo(0.22*r,0.22*r,-0.12*r,0.8*r); break;
      case 'ice': for(let i=0;i<3;i++){ const a=i*Math.PI/3, cx=Math.cos(a),sy=Math.sin(a); ctx.moveTo(-cx*0.9*r,-sy*0.9*r); ctx.lineTo(cx*0.9*r,sy*0.9*r); const ex=cx*0.9*r,ey=sy*0.9*r; ctx.moveTo(ex,ey); ctx.lineTo(ex-cx*0.28*r-sy*0.2*r,ey-sy*0.28*r+cx*0.2*r); ctx.moveTo(ex,ey); ctx.lineTo(ex-cx*0.28*r+sy*0.2*r,ey-sy*0.28*r-cx*0.2*r); ctx.moveTo(-ex,-ey); ctx.lineTo(-ex+cx*0.28*r-sy*0.2*r,-ey+sy*0.28*r+cx*0.2*r); ctx.moveTo(-ex,-ey); ctx.lineTo(-ex+cx*0.28*r+sy*0.2*r,-ey+sy*0.28*r-cx*0.2*r);} break;
      case 'eye': ctx.moveTo(-0.84*r,0); ctx.quadraticCurveTo(0,-0.52*r,0.84*r,0); ctx.quadraticCurveTo(0,0.52*r,-0.84*r,0); A(0,0,0.2*r); break;
      case 'glasses': A(-0.45*r,0,0.3*r); A(0.45*r,0,0.3*r); ctx.moveTo(-0.15*r,-0.04*r); ctx.lineTo(0.15*r,-0.04*r); ctx.moveTo(-0.75*r,-0.12*r); ctx.lineTo(-0.82*r,-0.28*r); ctx.moveTo(0.75*r,-0.12*r); ctx.lineTo(0.82*r,-0.28*r); break;
      case 'hourglass': ctx.moveTo(-0.5*r,-0.66*r); ctx.lineTo(0.5*r,-0.66*r); ctx.lineTo(-0.5*r,0.66*r); ctx.lineTo(0.5*r,0.66*r); ctx.closePath(); ctx.moveTo(-0.62*r,-0.66*r); ctx.lineTo(0.62*r,-0.66*r); ctx.moveTo(-0.62*r,0.66*r); ctx.lineTo(0.62*r,0.66*r); break;
      case 'seal': ctx.moveTo(-0.52*r,-0.52*r); ctx.lineTo(0.52*r,-0.52*r); ctx.lineTo(0.52*r,0.52*r); ctx.lineTo(-0.52*r,0.52*r); ctx.closePath(); ctx.moveTo(-0.22*r,0.18*r); ctx.lineTo(0.06*r,-0.1*r); ctx.lineTo(0.24*r,0.08*r); break;
      case 'cup': ctx.moveTo(-0.46*r,-0.56*r); ctx.lineTo(0.46*r,-0.56*r); ctx.bezierCurveTo(0.46*r,0.06*r,0.2*r,0.32*r,0,0.32*r); ctx.bezierCurveTo(-0.2*r,0.32*r,-0.46*r,0.06*r,-0.46*r,-0.56*r); ctx.moveTo(0,0.32*r); ctx.lineTo(0,0.64*r); ctx.moveTo(-0.3*r,0.7*r); ctx.lineTo(0.3*r,0.7*r); break;
      case 'idol': for(let i=0;i<6;i++){ const a=-Math.PI/2+i*Math.PI/3, x=Math.cos(a)*0.68*r,y=Math.sin(a)*0.68*r; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.closePath(); A(-0.18*r,-0.08*r,0.07*r); A(0.18*r,-0.08*r,0.07*r); ctx.moveTo(-0.16*r,0.28*r); ctx.lineTo(0.16*r,0.28*r); break;
      case 'bone': ctx.moveTo(-0.4*r,-0.4*r); ctx.lineTo(0.4*r,0.4*r); A(-0.54*r,-0.42*r,0.15*r); A(-0.42*r,-0.54*r,0.15*r); A(0.54*r,0.42*r,0.15*r); A(0.42*r,0.54*r,0.15*r); break;
      case 'feather': ctx.moveTo(0.46*r,-0.72*r); ctx.lineTo(-0.36*r,0.72*r); ctx.moveTo(0.46*r,-0.72*r); ctx.bezierCurveTo(-0.32*r,-0.28*r,-0.42*r,0.34*r,-0.36*r,0.72*r); ctx.moveTo(0.46*r,-0.72*r); ctx.bezierCurveTo(0.3*r,-0.06*r,0.04*r,0.42*r,-0.36*r,0.72*r); break;
      case 'ball': A(0,0,0.72*r); ctx.moveTo(-0.72*r,0); ctx.lineTo(0.72*r,0); ctx.moveTo(0,-0.72*r); ctx.lineTo(0,0.72*r); ctx.moveTo(-0.5*r,-0.5*r); ctx.quadraticCurveTo(0,-0.1*r,0.5*r,-0.5*r); ctx.moveTo(-0.5*r,0.5*r); ctx.quadraticCurveTo(0,0.1*r,0.5*r,0.5*r); break;
      case 'towel': ctx.moveTo(-0.45*r,-0.62*r); ctx.lineTo(0.45*r,-0.62*r); ctx.lineTo(0.45*r,0.46*r); ctx.quadraticCurveTo(0.15*r,0.64*r,-0.05*r,0.5*r); ctx.quadraticCurveTo(-0.26*r,0.38*r,-0.45*r,0.6*r); ctx.closePath(); ctx.moveTo(-0.45*r,-0.36*r); ctx.lineTo(0.45*r,-0.36*r); break;
      case 'brace': ctx.moveTo(-0.56*r,-0.54*r); ctx.lineTo(0.56*r,-0.54*r); ctx.lineTo(0.56*r,0.54*r); ctx.lineTo(-0.56*r,0.54*r); ctx.closePath(); ctx.moveTo(-0.22*r,-0.16*r); ctx.lineTo(0.22*r,-0.16*r); ctx.lineTo(0.22*r,0.12*r); ctx.lineTo(-0.22*r,0.12*r); ctx.closePath(); ctx.moveTo(-0.14*r,0.12*r); ctx.lineTo(-0.2*r,0.4*r); ctx.moveTo(0.14*r,0.12*r); ctx.lineTo(0.2*r,0.4*r); break;
      default: A(0,0,0.34*r);
    }
    ctx.stroke(); }
  ,_drawRelicIcon(cx,cy,r,rid,owned){ const ctx=this.ctx; const R=RELICS[rid]; if(!R)return;
    const meta=owned?this._relicMeta(rid):null;
    const ring=meta?QUAL_COL[meta.tier]:'rgba(150,140,122,0.85)';
    const gcol=owned?(R.form?BALL_FORMS[R.form].color:this._clsCol(R.cls)):'rgba(150,142,126,0.7)';
    ctx.save();
    // faint halo ring (rarity)
    ctx.beginPath(); ctx.arc(cx,cy,r*1.04,0,TAU); ctx.lineWidth=Math.max(1.2,r*0.05); ctx.strokeStyle=this._fade(ring, owned?0.4:0.25); ctx.stroke();
    // glowing line sigil
    ctx.translate(cx,cy);
    ctx.lineWidth=Math.max(2.6,r*0.14); ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle=gcol;
    if(owned){ ctx.shadowBlur=r*(meta&&meta.tier>=2?0.7:0.5); ctx.shadowColor=gcol; }
    this._relicGlyph(rid, r*0.6);
    if(owned){ this._relicGlyph(rid, r*0.6); } // second pass = stronger glow
    ctx.shadowBlur=0;
    ctx.restore(); }
  ,drawRelicBag(LO){ const ctx=this.ctx, s=this.save; const IT=this.insT||0,IL=this.insL||0,IR=this.insR||0,IB=this.insB||0;
    const load=s.loadout||[null,null,null,null,null]; const lib=s.library||[]; const h=HEROES[this._heroView]||{id:''};
    ctx.fillStyle='rgba(6,4,9,0.94)'; ctx.fillRect(0,0,BW,BH);
    const mx=IL+28,my=IT+16,mw=BW-IL-IR-56,mh=BH-IT-IB-28, pad=30, ix=mx+pad, iw=mw-pad*2;
    this.panel(mx,my,mw,mh,{r:20,c0:'rgba(20,14,9,0.98)',c1:'rgba(10,7,4,0.99)'});
    this.btn(-3000,-3000,BW+6000,BH+6000,'bagscrim',()=>{ /* 攔截背景點擊：不關閉，只有 ✕ 能關 */ });
    const cnt=load.filter(Boolean).length;
    this.text('聖物背包',mx+34,my+58,40,'#f6d27e',{weight:'800',glow:8});
    this.text('裝備 '+cnt+'/5　·　庫存 '+lib.length+'/40',mx+250,my+56,24,'#a99c80',{weight:'600'});
    { const cs=66,cxx=mx+mw-cs-22,cyy=my+16; this.rr(cxx,cyy,cs,cs,14); ctx.fillStyle='rgba(70,34,30,0.7)'; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle='#c46850'; ctx.stroke(); this.text('\u2715',cxx+cs/2,cyy+cs/2+2,38,'#f0c0b0',{align:'center',baseline:'middle',weight:'800'}); this.btn(cxx,cyy,cs,cs,'bagclose',()=>{ this._bag=null; this._bagSel=null; this.render(); }); }
    // ===== equip bar =====
    this.text('裝備中',ix,my+108,24,'#e6c068',{weight:'800'});
    const esy=my+118, sgap=16, sw=(iw-sgap*4)/5, shh=104;
    for(let i=0;i<5;i++){ const rid=load[i]; const sx=ix+i*(sw+sgap); const meta=rid?this._relicMeta(rid):null; const col=rid?QUAL_COL[meta.tier]:'rgba(120,90,60,0.5)';
      this.rr(sx,esy,sw,shh,14); ctx.fillStyle=rid?'rgba(40,30,16,0.8)':'rgba(20,14,9,0.5)'; ctx.fill(); ctx.lineWidth=rid?2.5:1.6; if(!rid)ctx.setLineDash([6,5]); ctx.strokeStyle=col; this.rr(sx,esy,sw,shh,14); ctx.stroke(); ctx.setLineDash([]);
      if(rid){ this._drawRelicIcon(sx+sw/2, esy+40, 30, rid, true); this.text(this._clip(RELICS[rid].name,sw-12,23,'700'),sx+sw/2,esy+shh-22,23,'#ece0c4',{align:'center',weight:'700'}); if(this._bagSel===rid){ ctx.lineWidth=3.5; ctx.strokeStyle='#fff'; this.rr(sx,esy,sw,shh,14); ctx.stroke(); }
        ((rr)=>this.btn(sx,esy,sw,shh,'eqs'+i,()=>{ this._bagSel=rr; this.audio.sfx('ui'); this.render(); }))(rid); }
      else { this.text('\uff0b',sx+sw/2,esy+shh/2-4,40,'rgba(180,160,120,0.4)',{align:'center',baseline:'middle'}); this.text('空欄',sx+sw/2,esy+shh-22,18,'rgba(160,150,130,0.4)',{align:'center'}); } }
    // ===== inventory by rarity =====
    const ownedSet={}; for(const id of lib) ownedSet[id]=1; for(const id of load) if(id) ownedSet[id]=1;
    const ownedByTier={0:[],1:[],2:[]}; const unowned=[];
    for(const id of Object.keys(RELICS)){ if(ownedSet[id]){ const t=this._relicMeta(id).tier; (ownedByTier[t]||ownedByTier[0]).push(id); } else unowned.push(id); }
    const detailH=140, invTop=esy+shh+20, invBottom=my+mh-detailH-16;
    const cg=14, cellH=112; const cols=Math.max(6,Math.min(10,Math.floor((iw+cg)/(200+cg)))); const cellW=(iw-cg*(cols-1))/cols;
    let yy=invTop;
    const drawSection=(title,col,ids,owned)=>{ if(!ids.length||yy+38>invBottom) return;
      this.text(title+'  ('+ids.length+')',ix,yy+18,24,col,{weight:'800'}); yy+=42;
      for(let k=0;k<ids.length;k++){ const id=ids[k]; const ci=k%cols, ri=(k/cols)|0; const cx=ix+ci*(cellW+cg), cy=yy+ri*(cellH+cg); if(cy+cellH>invBottom) break;
        const equipped=load.indexOf(id)>=0; const sel=this._bagSel===id;
        ctx.globalAlpha=owned?1:0.42; this.rr(cx,cy,cellW,cellH,12); ctx.fillStyle=equipped?'rgba(60,44,20,0.5)':'rgba(18,13,8,0.88)'; ctx.fill(); ctx.lineWidth=(equipped||sel)?2.6:1.4; ctx.strokeStyle=sel?'#fff':(equipped?'#e6c068':'rgba(120,90,60,0.4)'); this.rr(cx,cy,cellW,cellH,12); ctx.stroke();
        this._drawRelicIcon(cx+cellW/2, cy+cellH*0.36, cellH*0.28, id, owned);
        this.text(this._clip((RELICS[id].hero===h.id?'\u2605':'')+RELICS[id].name,cellW-6,21,'700'),cx+cellW/2,cy+cellH-13,21,owned?'#ece0c4':'#9a9080',{align:'center',weight:'700'});
        if(equipped) this.text('\u2713',cx+cellW-14,cy+18,18,'#e6c068',{align:'center',weight:'800'});
        ctx.globalAlpha=1;
        ((rid2)=>this.btn(cx,cy,cellW,cellH,'bgc'+rid2,()=>{ this._bagSel=rid2; this.audio.sfx('ui'); this.render(); }))(id); }
      const rows=Math.ceil(ids.length/cols); yy+=rows*(cellH+cg)+10; };
    drawSection('稀有',QUAL_COL[2],ownedByTier[2],true);
    drawSection('精良',QUAL_COL[1],ownedByTier[1],true);
    drawSection('普通',QUAL_COL[0],ownedByTier[0],true);
    drawSection('未擁有','#7a7268',unowned,false);
    // ===== detail bar =====
    const dby=my+mh-detailH-8; this.rr(ix,dby,iw,detailH,14); ctx.fillStyle='rgba(14,10,6,0.94)'; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(120,90,60,0.4)'; this.rr(ix,dby,iw,detailH,14); ctx.stroke();
    const selId=this._bagSel;
    if(!selId){ this.text('點選聖物查看詳情並裝備／卸下',ix+iw/2,dby+detailH/2,26,'rgba(180,170,150,0.5)',{align:'center',baseline:'middle'}); }
    else { const R=RELICS[selId]; const owned=!!ownedSet[selId]; const equipped=load.indexOf(selId)>=0; const meta=owned?this._relicMeta(selId):null; const col=meta?QUAL_COL[meta.tier]:this._clsCol(R.cls);
      this._drawRelicIcon(ix+66,dby+detailH/2,44,selId,owned);
      const tx=ix+134; this.text(R.name,tx,dby+44,32,col,{weight:'800'});
      this.text(owned?(QUAL_NAME[meta.tier]+' · '+this._clsName(R.cls)+(meta.q?(' · 強度 '+meta.q+'/50'):'')):('未擁有 · '+this._clsName(R.cls)),tx,dby+78,20,'#a99c80',{weight:'600'});
      let info=(owned&&meta.affixes&&meta.affixes.length)?meta.affixes.map(a=>'\u25c6 '+this._affixText(a)).join('\u3000'):'';
      if(info) this.text(this._clip(info,iw-380,22,'700'),tx,dby+108,22,'#9fe6ff',{weight:'700'});
      this.text(this._clip('— '+R.desc,iw-380,19,'500'),tx,dby+(info?134:108),19,'#cfc6b0');
      if(owned){ const bw=210,bh=66,bx=ix+iw-bw-24,byy=dby+detailH/2-bh/2; const label=equipped?'卸下':'裝備';
        this.rr(bx,byy,bw,bh,12); if(equipped){ ctx.fillStyle='rgba(70,52,24,0.92)'; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle='#e6c068'; this.rr(bx,byy,bw,bh,12); ctx.stroke(); } else { const gg2=ctx.createLinearGradient(0,byy,0,byy+bh); gg2.addColorStop(0,'#caa23a'); gg2.addColorStop(1,'#8a6a1e'); ctx.fillStyle=gg2; ctx.fill(); }
        this.text(label,bx+bw/2,byy+bh/2+2,30,equipped?'#e6c068':'#1a120a',{align:'center',baseline:'middle',weight:'800'});
        this.btn(bx,byy,bw,bh,'bageqbtn',()=>{ this._toggleRelic(selId); this.audio.sfx('select'); this.render(); }); } }
  }
  ,_openRelicSheet(rid){ this._relicSheet=rid; this.audio.sfx('ui'); this.render(); }
  ,_affixText(a){ return a.label+' '+(a.pct? ('+'+Math.round(a.val*100)+'%') : ('+'+a.val)); }
  ,drawRelicSheet(LO){ const ctx=this.ctx,U=LO.U,s=this.save; const rid=this._relicSheet, r=RELICS[rid]; if(!r){ this._relicSheet=null; return; }
    const load=s.loadout||[null,null,null,null,null]; const equipped=load.indexOf(rid)>=0;
    const owned=(s.library||[]).indexOf(rid)>=0 || equipped;
    const meta=owned?this._relicMeta(rid):null; const qcol=meta?QUAL_COL[meta.tier]:this._clsCol(r.cls);
    // scrim (dismiss)
    ctx.save(); ctx.fillStyle='rgba(4,2,8,0.62)'; ctx.fillRect(-3000,-3000,BW+6000,BH+6000); ctx.restore();
    this.btn(-3000,-3000,BW+6000,BH+6000,'relsheetscrim',()=>{ this._relicSheet=null; this.render(); });
    const affs=meta?meta.affixes:[]; const w=Math.min(LO.cw*0.78, 640*U);
    const titleH=46*U, metaH=owned?22*U:0, affH=(owned&&affs.length?affs.length*20*U+10*U:(owned?0:20*U)), descH=44*U, btnH=46*U;
    const hh=titleH+metaH+affH+descH+btnH+30*U;
    const x=Math.max(LO.cx0, BW/2-w/2), y=LO.cy0+(LO.ch-hh)/2;
    this.panel(x,y,w,hh,{r:14*U,c0:'rgba(30,22,14,0.99)',c1:'rgba(15,10,6,0.99)',lw:2*U});
    ctx.save(); ctx.fillStyle=qcol; this.rr(x,y,6*U,hh,3*U); ctx.fill(); ctx.restore();
    this.text((r.hero===((HEROES[this._heroView]||{}).id)?'\u2605 ':'')+r.name, x+22*U, y+26*U, 17*U, qcol,{weight:'800'});
    this.text(this._clsName(r.cls)+(r.form?' · 核心球':''), x+w-46*U, y+26*U, 12*U,'#a99c80',{align:'right',weight:'700'});
    let ry=y+titleH+6*U;
    if(owned){ this.text('品質', x+22*U, ry, 12*U,'#a99c80'); this.text(QUAL_NAME[meta.tier]+'　強度 '+meta.q+'/50', x+w-22*U, ry, 12*U, qcol,{align:'right',weight:'700'}); ry+=metaH; }
    this._hdiv(x+22*U, ry-2*U, w-44*U, U); ry+=8*U;
    if(owned){ if(affs.length){ for(const a of affs){ this.text('詞綴', x+22*U, ry, 11*U,'#8f846a'); this.text(this._affixText(a), x+w-22*U, ry, 13*U,'#cfe6a0',{align:'right',weight:'700'}); ry+=20*U; } ry+=10*U; } }
    else { this.text('未擁有 · 取得後鑑定詞綴', x+w/2, ry+4*U, 12*U,'#a99c80',{align:'center'}); ry+=20*U; }
    this._hdiv(x+22*U, ry-2*U, w-44*U, U);
    this.wrap(r.desc, x+w/2, ry+20*U, w-48*U, 18*U,'#cfc6b0', 12*U,'center'); ry+=descH;
    // action button: 裝備 / 卸載
    const bw=Math.min(220*U, w-44*U), bx=x+w/2-bw/2, by=y+hh-btnH-12*U;
    this.button(bx,by,bw,btnH-4*U, equipped?'卸載':'裝備', 'relsheetact', ()=>{ this._relicSheet=null; this._toggleRelic(rid); }, {primary:!equipped,size:16*U,color:equipped?'#e88a5a':undefined,weight:'800'});
    // close X
    const cs=20*U, cxb=x+w-cs-12*U, cyb=y+12*U; ctx.save(); ctx.strokeStyle='#e6c068'; ctx.lineWidth=2.4*U; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(cxb,cyb); ctx.lineTo(cxb+cs,cyb+cs); ctx.moveTo(cxb+cs,cyb); ctx.lineTo(cxb,cyb+cs); ctx.stroke(); ctx.restore();
    const xh=Math.max(44*U,cs); this.btn(cxb+cs/2-xh/2,cyb+cs/2-xh/2,xh,xh,'relsheetclose',()=>{ this._relicSheet=null; this.render(); });
  }
  ,drawHeroesFooter(LO){ const ctx=this.ctx,U=LO.U; const cx=(LO.cx0+LO.cx1)/2, y=LO.mainB+LO.footerGap+LO.footerH*0.5;
    const txt='點擊節點可預覽天賦效果'; ctx.font='600 '+(12*U)+'px Georgia,serif'; const tw=ctx.measureText(txt).width;
    const br=5*U, gap=8*U, total=br*2+gap+tw, sx=cx-total/2;
    // small bulb icon
    ctx.save(); ctx.fillStyle='#e6c068'; ctx.beginPath(); ctx.arc(sx+br,y-1*U,br,0,TAU); ctx.fill(); ctx.fillRect(sx+br-2*U,y+br-1*U,4*U,3*U); ctx.restore();
    this.text(txt, sx+br*2+gap, y, 12*U,'#9a8f76',{align:'left',baseline:'middle'});
  }

  ,_ensureAtlasBg(){ if(this._atBg===undefined){ try{ const im=new Image(); im.onerror=()=>{this._atBgErr=true;}; im.src='./assets/atlas_base_clean_no_nodes_1704x786.webp'; this._atBg=im; }catch(e){ this._atBgErr=true; } } }
  ,_atlasNodes(cx,y,lit){ const ctx=this.ctx, U=BW/1704, D=v=>v*U; const r=D(13), sp=D(48), n=4, total=(n-1)*sp, x0=D(cx)-total/2, yy=D(y);
    ctx.save(); ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.globalAlpha=1;
    ctx.strokeStyle='#7c6626'; ctx.lineWidth=Math.max(2,r*0.42); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x0,yy); ctx.lineTo(x0+total,yy); ctx.stroke();
    for(let i=0;i<n;i++){ const x=x0+i*sp, red=(i===n-1);
      ctx.beginPath(); ctx.arc(x,yy,r,0,Math.PI*2); ctx.fillStyle=red?'#c9382e':'#7a6a2b'; ctx.fill();
      ctx.beginPath(); ctx.arc(x,yy,r*0.42,0,Math.PI*2); ctx.fillStyle=red?'#2c1411':'#241f12'; ctx.fill();
      ctx.lineWidth=Math.max(1.5,r*0.12); ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(x,yy,r,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
  ,drawAtlas(){ const ctx=this.ctx; const U=BW/1704, D=v=>v*U;
    this._ensureAtlasBg();
    if(this._atBg&&this._atBg.complete&&this._atBg.naturalWidth&&!this._atBgErr){ ctx.drawImage(this._atBg,0,0,BW,BH); }
    else { this.backdrop('hub'); }
    if(!this._selAct||this._selAct>this._unlockedActs()) this._selAct=this._unlockedActs();
    // u=上半位移, nd=節點位移, lo=下半位移（各自獨立）
    const CARDS=[{x:222,y:150,w:290,h:520,cx:367,maxw:220,u:0,nd:0,lo:0},{x:498,y:178,w:255,h:470,cx:626,maxw:196,u:-30,nd:0,lo:0},{x:757,y:178,w:255,h:470,cx:884,maxw:196,u:-30,nd:0,lo:0},{x:1002,y:178,w:255,h:470,cx:1130,maxw:196,u:-30,nd:0,lo:0},{x:1253,y:178,w:255,h:470,cx:1381,maxw:196,u:-30,nd:0,lo:0}];
    const UP={no:115, zh:148, en:183}, LO={boss:468, stat:503, relic:536}, NODEY=396;
    const FONT=(s,w)=>`${w} ${D(s)}px "Noto Serif TC","Noto Serif CJK TC",Georgia,serif`;
    const sh=()=>{ ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=D(4); ctx.shadowOffsetX=D(2); ctx.shadowOffsetY=D(2); };
    const rs=()=>{ ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; };
    const cline=(s,cx,yy,size,weight,color,maxw)=>{ ctx.font=FONT(size,weight); const mb=D(maxw); let w=ctx.measureText(s).width; if(w>mb){ ctx.font=FONT(size*mb/w,weight); } ctx.fillStyle=color; ctx.fillText(s, D(cx), D(yy)); };
    for(let i=0;i<ACTS.length;i++){ const A=ACTS[i], C=CARDS[i]; this._atlasNodes(C.cx, NODEY+C.nd, A.id<=this._unlockedActs()); }
    ctx.save();
    ctx.textBaseline='middle'; ctx.textAlign='center';
    sh();
    cline('← 返回', 136, 119, 28, '800', '#f3ead3', 150);
    cline('籃獄圖譜', 888, 72, 56, '900', '#f4d47a', 300);
    cline('選擇要進攻的幕', 888, 125, 24, '800', '#e5c36f', 320);
    for(let i=0;i<ACTS.length;i++){ const A=ACTS[i], C=CARDS[i]; const lit=A.id<=this._unlockedActs(); const cx=C.cx, mw=C.maxw;
      ctx.globalAlpha=lit?1:0.52;
      cline('第 '+A.id+' 幕', cx, C.y+UP.no+C.u, 20, '800', lit?'#ffd45a':'#9f9387', mw);
      cline(A.name,           cx, C.y+UP.zh+C.u, 37, '900', lit?'#f8eddc':'#b9afa9', mw);
      cline(A.sub,            cx, C.y+UP.en+C.u, 18, '800', lit?'#e4c27e':'#91877e', mw);
      cline(lit?('Boss：'+A.boss):'未解鎖', cx, LO.boss+C.lo, 18, '800', lit?'#f2e1c1':'#a49a91', mw);
      const _amp=this._mp(this._selRoute||'std'); const mk=_amp.marks[A.id+'-boss']||0, cl=_amp.bossClears[A.id+'-boss']||0, ht=_amp.heat[A.id+'-boss']||0;
      cline('印記 '+mk+'    擊敗 '+cl+'    熟度 '+ht, cx, LO.stat+C.lo, 17, '800', lit?'#d7c09c':'#8d847b', mw);
      const owned=this.save.relics.includes(A.relic)||this.save.library.includes(A.relic);
      cline('精魄聖物：'+RELICS[A.relic].name, cx, LO.relic+C.lo, 17, '800', lit?(owned?'#9ee45f':'#cdb98f'):'#897f77', mw);
      ctx.globalAlpha=1;
    }
    // 選中的幕：發光邊框(左右收窄)
    { const sa=this._selAct, C=CARDS[sa-1]; if(C){ ctx.save(); const pulse=0.5+0.5*Math.sin(this.t*2.6);
      this.rr(D(C.x+5),D(C.y-7),D(C.w-10),D(C.h+14),D(16)); ctx.lineWidth=D(4); ctx.strokeStyle='rgba(255,212,110,'+(0.72+0.28*pulse)+')'; ctx.shadowBlur=D(18+12*pulse); ctx.shadowColor='rgba(255,180,70,0.95)'; ctx.stroke(); ctx.shadowBlur=0;
      ctx.restore(); } }
    this._drawAtlasAttackLabel(D,U,this._press({x:D(685),y:D(676),w:D(340),h:D(70)}));
    ctx.restore();
    this.btn(D(48),D(82),D(170),D(62),'back',()=>this.go('hub'));
    for(let i=0;i<ACTS.length;i++){ const A=ACTS[i], C=CARDS[i]; if(A.id<=this._unlockedActs()){ const aid=A.id; this.btn(D(C.x),D(C.y),D(C.w),D(C.h),'a'+aid,()=>{ this._selAct=aid; this.audio.sfx('ui'); }); } }
    this.btn(D(685),D(676),D(340),D(70),'route',()=>this.go('route'));
  }
  ,_drawAtlasAttackLabel(D,U,pressed){ const ctx=this.ctx, x=D(855), y=D(681)+(pressed?D(3):0), fs=(pressed?25:26)*U, pulse=0.5+0.5*Math.sin(this.t*2.8);
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.save();
    const pressGlow=ctx.createRadialGradient(x,y,D(12),x,y,D(pressed?190:150));
    pressGlow.addColorStop(0,pressed?'rgba(216,255,68,0.24)':'rgba(255,210,88,0.12)');
    pressGlow.addColorStop(0.58,pressed?'rgba(216,255,68,0.10)':'rgba(255,210,88,0.05)');
    pressGlow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=pressGlow;
    ctx.fillRect(x-D(230),y-D(52),D(460),D(104));
    ctx.restore();
    const halo=ctx.createRadialGradient(x,y,D(18),x,y,D(175)); halo.addColorStop(0,'rgba(255,210,88,'+(0.16+pulse*0.08)+')'); halo.addColorStop(0.55,'rgba(150,230,60,0.08)'); halo.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=halo; ctx.fillRect(x-D(200),y-D(48),D(400),D(96));
    ctx.save(); ctx.globalAlpha=0.9; const blade=ctx.createLinearGradient(0,y-D(18),0,y+D(18)); blade.addColorStop(0,'#fff0b8'); blade.addColorStop(0.55,'#e2aa31'); blade.addColorStop(1,'#7b4b12'); ctx.fillStyle=blade; ctx.shadowBlur=D(8); ctx.shadowColor='rgba(255,190,60,0.65)';
    for(const s of [-1,1]){ ctx.beginPath(); ctx.moveTo(x+s*D(110),y); ctx.lineTo(x+s*D(88),y-D(13)); ctx.lineTo(x+s*D(94),y); ctx.lineTo(x+s*D(88),y+D(13)); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.font="900 "+fs+"px 'Microsoft JhengHei','Noto Sans TC','Noto Serif TC',Georgia,serif"; try{ctx.letterSpacing='0px';}catch(e){}
    const label='進攻目標', g=ctx.createLinearGradient(0,y-fs*0.8,0,y+fs*0.85); g.addColorStop(0,'#fffdf1'); g.addColorStop(0.34,'#ffe37a'); g.addColorStop(0.66,pressed?'#d8ff44':'#f0a734'); g.addColorStop(1,pressed?'#5f8f18':'#7a3b0d');
    ctx.lineJoin='round'; ctx.miterLimit=2; ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=D(4); ctx.shadowOffsetY=D(3); ctx.lineWidth=D(9); ctx.strokeStyle='rgba(19,9,3,0.95)'; ctx.strokeText(label,x,y);
    ctx.shadowColor='rgba(130,20,10,0.75)'; ctx.shadowBlur=D(9); ctx.shadowOffsetY=0; ctx.lineWidth=D(3); ctx.strokeStyle='rgba(255,96,40,0.52)'; ctx.strokeText(label,x,y);
    ctx.shadowColor=pressed?'rgba(216,255,68,0.86)':'rgba(255,214,105,'+(0.55+pulse*0.25)+')'; ctx.shadowBlur=D(pressed?15:11); ctx.fillStyle=g; ctx.fillText(label,x,y);
    ctx.globalAlpha=0.95; ctx.strokeStyle=pressed?'rgba(216,255,68,0.92)':'rgba(255,238,174,0.78)'; ctx.lineWidth=D(1.4); ctx.beginPath(); ctx.moveTo(x-D(82),y+D(24)); ctx.lineTo(x+D(82),y+D(24)); ctx.stroke();
    try{ctx.letterSpacing='0px';}catch(e){} ctx.restore(); }

  ,_ensureRouteBg(act){ this._rtBgs=this._rtBgs||{}; if(this._rtBgs[act]===undefined){ try{ const im=new Image(); im.onerror=()=>{im._err=true;}; im.onload=()=>{ try{ if(this.screen==='route'&&this.render)this.render(); }catch(e){} }; im.src='./assets/stage'+act+'_route_base_1704x786.webp'; this._rtBgs[act]=im; }catch(e){ this._rtBgs[act]={complete:true,naturalWidth:0,_err:true}; } } this._rtBg=this._rtBgs[act]; return this._rtBgs[act]; }
  ,drawRoute(){ this._drawRouteArt(); }
  ,_drawRouteArt(){ const ctx=this.ctx, s=this.save; const U=BW/1704, D=v=>v*U; const A=ACTS[this._selAct-1];
    if(!this._selRoute)this._selRoute='std';
    const hi=Math.max(0,HEROES.findIndex(h=>h.id===s.hero)); const hero=HEROES[hi]; const load=s.loadout||[null,null,null,null,null]; const cnt=load.filter(Boolean).length;
    const T=(str,ax,ay,size,col,o)=>this.text(str,D(ax),D(ay),size*U,col,o);
    this._layScreen='rt'; const LD=(this._layDefs=this._layDefs||{});
    const RT_ACT={ 2:{ back:{x:123,y:50,s:24}, title:{x:877,y:54,s:30}, subtitle:{x:877,y:95,s:17}, portrait:{x:182,y:186,r:52}, changeBtn:{x:1513,y:233,s:18}, summary:{x:864,y:696,s:20}, r0name:{x:194,y:354,s:27}, r1name:{x:192,y:475,s:27}, r2name:{x:194,y:602,s:27}, r2desc:{x:193,y:635,s:20,w:303}, s0name:{x:1310,y:380,s:18}, s0desc:{x:1305,y:404,s:19}, s1name:{x:1516,y:380,s:18}, s1desc:{x:1520,y:408,s:19}, s2name:{x:1310,y:517,s:18}, s2desc:{x:1305,y:543,s:19}, s3name:{x:1515,y:517,s:18}, s3desc:{x:1520,y:544,s:19}, s4name:{x:1309,y:652,s:18}, s4desc:{x:1307,y:678,s:19}, s5name:{x:1520,y:652,s:18}, s5desc:{x:1520,y:676,s:19}, node0:{x:620,y:381}, node1:{x:600,y:550}, node2:{x:939,y:442}, node3:{x:1005,y:632}, node4:{x:972,y:537}, r0hi:{x:86,y:314,w:404,h:114}, r1hi:{x:85,y:442,w:405,h:108}, r2hi:{x:86,y:565,w:404,h:116}, s0hi:{x:1210,y:317,w:196,h:122}, s1hi:{x:1419,y:318,w:202,h:122}, s2hi:{x:1209,y:452,w:196,h:122}, s3hi:{x:1420,y:451,w:202,h:124}, s4hi:{x:1210,y:586,w:196,h:122}, s5hi:{x:1419,y:585,w:203,h:125} }, 3:{ back:{x:123,y:50,s:24}, title:{x:877,y:54,s:30}, subtitle:{x:877,y:95,s:17}, portrait:{x:195,y:186,r:52}, heroName:{x:278,y:150,s:27}, heroEn:{x:278,y:184,s:17}, heroRole:{x:278,y:214,s:15}, changeBtn:{x:1518,y:232,s:18}, summary:{x:871,y:702,s:20}, cta:{x:859,y:757,s:36}, relic0:{x:616,y:184,sz:52}, relic1:{x:678,y:184,sz:52}, relic2:{x:742,y:184,sz:52}, relic3:{x:805,y:184,sz:52}, relic4:{x:870,y:184,sz:52}, r0name:{x:195,y:354,s:27}, r0desc:{x:195,y:382,s:20,w:296}, r1name:{x:194,y:475,s:27}, r1desc:{x:194,y:503,s:20,w:285}, r2name:{x:196,y:602,s:27}, r2desc:{x:197,y:635,s:20,w:303}, s0name:{x:1310,y:380,s:18}, s0desc:{x:1305,y:404,s:19}, s1name:{x:1516,y:380,s:18}, s1desc:{x:1520,y:408,s:19}, s2name:{x:1310,y:517,s:18}, s2desc:{x:1305,y:543,s:19}, s3name:{x:1515,y:517,s:18}, s3desc:{x:1520,y:544,s:19}, s4name:{x:1309,y:652,s:18}, s4desc:{x:1307,y:678,s:19}, s5name:{x:1520,y:652,s:18}, s5desc:{x:1520,y:676,s:19}, node0:{x:613,y:452}, node1:{x:809,y:392}, node2:{x:712,y:581}, node3:{x:1017,y:479}, node4:{x:864,y:530}, r0hi:{x:86,y:314,w:409,h:114}, r1hi:{x:85,y:444,w:411,h:112}, r2hi:{x:86,y:570,w:410,h:116}, s0hi:{x:1203,y:317,w:199,h:126}, s1hi:{x:1415,y:316,w:204,h:127}, s2hi:{x:1202,y:452,w:200,h:128}, s3hi:{x:1415,y:451,w:204,h:129}, s4hi:{x:1202,y:589,w:200,h:127}, s5hi:{x:1415,y:586,w:204,h:129} }, 4:{ back:{x:123,y:50,s:24}, title:{x:877,y:54,s:30}, subtitle:{x:877,y:98,s:17}, portrait:{x:191,y:186,r:52}, heroName:{x:278,y:150,s:27}, heroEn:{x:278,y:184,s:17}, heroRole:{x:278,y:214,s:15}, changeBtn:{x:1518,y:232,s:18}, summary:{x:871,y:702,s:20}, cta:{x:859,y:757,s:36}, relic0:{x:616,y:184,sz:52}, relic1:{x:678,y:184,sz:52}, relic2:{x:742,y:184,sz:52}, relic3:{x:805,y:184,sz:52}, relic4:{x:870,y:184,sz:52}, r0name:{x:195,y:354,s:27}, r0desc:{x:195,y:382,s:20,w:296}, r1name:{x:194,y:475,s:27}, r1desc:{x:194,y:503,s:20,w:285}, r2name:{x:196,y:602,s:27}, r2desc:{x:197,y:635,s:20,w:303}, s0name:{x:1305,y:380,s:18}, s0desc:{x:1300,y:408,s:19}, s1name:{x:1510,y:380,s:18}, s1desc:{x:1511,y:408,s:19}, s2name:{x:1300,y:517,s:18}, s2desc:{x:1300,y:547,s:19}, s3name:{x:1511,y:517,s:18}, s3desc:{x:1512,y:544,s:19}, s4name:{x:1298,y:652,s:18}, s4desc:{x:1299,y:678,s:19}, s5name:{x:1510,y:652,s:18}, s5desc:{x:1511,y:676,s:19}, node0:{x:598,y:635}, node1:{x:803,y:586}, node2:{x:671,y:361}, node3:{x:1089,y:515}, node4:{x:880,y:438}, r0hi:{x:86,y:314,w:409,h:114}, r1hi:{x:85,y:444,w:411,h:112}, r2hi:{x:86,y:570,w:410,h:116}, s0hi:{x:1196,y:317,w:199,h:126}, s1hi:{x:1409,y:316,w:204,h:127}, s2hi:{x:1196,y:453,w:200,h:128}, s3hi:{x:1409,y:451,w:204,h:129}, s4hi:{x:1196,y:589,w:200,h:127}, s5hi:{x:1409,y:586,w:204,h:129} }, 5:{ back:{x:123,y:50,s:24}, title:{x:877,y:54,s:30}, subtitle:{x:877,y:98,s:17}, portrait:{x:194,y:185,r:52}, heroName:{x:278,y:150,s:27}, heroEn:{x:278,y:184,s:17}, heroRole:{x:278,y:214,s:15}, changeBtn:{x:1528,y:232,s:18}, summary:{x:871,y:705,s:20}, cta:{x:859,y:759,s:36}, relic0:{x:617,y:184,sz:52}, relic1:{x:681,y:184,sz:52}, relic2:{x:746,y:184,sz:52}, relic3:{x:809,y:184,sz:52}, relic4:{x:874,y:184,sz:52}, r0name:{x:195,y:354,s:27}, r0desc:{x:195,y:382,s:20,w:296}, r1name:{x:194,y:475,s:27}, r1desc:{x:194,y:503,s:20,w:285}, r2name:{x:196,y:602,s:27}, r2desc:{x:197,y:635,s:20,w:303}, s0name:{x:1314,y:380,s:18}, s0desc:{x:1309,y:410,s:19}, s1name:{x:1521,y:380,s:18}, s1desc:{x:1526,y:411,s:19}, s2name:{x:1310,y:517,s:18}, s2desc:{x:1309,y:547,s:19}, s3name:{x:1524,y:517,s:18}, s3desc:{x:1524,y:547,s:19}, s4name:{x:1309,y:652,s:18}, s4desc:{x:1307,y:682,s:19}, s5name:{x:1521,y:652,s:18}, s5desc:{x:1524,y:680,s:19}, node0:{x:598,y:635}, node1:{x:803,y:586}, node2:{x:671,y:361}, node3:{x:1089,y:515}, node4:{x:880,y:438}, r0hi:{x:88,y:314,w:415,h:114}, r1hi:{x:85,y:445,w:413,h:112}, r2hi:{x:87,y:573,w:413,h:116}, s0hi:{x:1206,y:317,w:203,h:126}, s1hi:{x:1419,y:316,w:208,h:129}, s2hi:{x:1205,y:453,w:204,h:128}, s3hi:{x:1421,y:452,w:206,h:131}, s4hi:{x:1206,y:593,w:203,h:127}, s5hi:{x:1419,y:591,w:209,h:129} } };
    const RT_DEF={ back:{x:123,y:52,s:24}, title:{x:852,y:54,s:30}, subtitle:{x:852,y:95,s:17}, portrait:{x:189,y:186,r:52}, heroName:{x:268,y:150,s:27}, heroEn:{x:268,y:184,s:17}, heroRole:{x:268,y:214,s:15}, relicLabel:{x:525,y:140,s:16}, bd:{x:528,y:237,s:14,tagX:566}, changeBtn:{x:1493,y:229,s:18}, routeHeader:{x:293,y:290,s:20}, stonesHeader:{x:1387,y:286,s:18}, summary:{x:852,y:696,s:20}, cta:{x:853,y:748,s:36}, relic0:{x:603,y:184,sz:52}, relic1:{x:665,y:184,sz:52}, relic2:{x:730,y:184,sz:52}, relic3:{x:794,y:184,sz:52}, relic4:{x:856,y:184,sz:52}, r0name:{x:196,y:353,s:27}, r0desc:{x:191,y:382,s:20,w:296}, r1name:{x:194,y:473,s:27}, r1desc:{x:191,y:501,s:20,w:285}, r2name:{x:194,y:597,s:27}, r2desc:{x:192,y:628,s:20,w:303}, s0name:{x:1285,y:380,s:18}, s0desc:{x:1280,y:404,s:19}, s1name:{x:1490,y:380,s:18}, s1desc:{x:1490,y:408,s:19}, s2name:{x:1285,y:517,s:18}, s2desc:{x:1285,y:542,s:19}, s3name:{x:1490,y:517,s:18}, s3desc:{x:1490,y:544,s:19}, s4name:{x:1285,y:652,s:18}, s4desc:{x:1285,y:676,s:19}, s5name:{x:1490,y:652,s:18}, s5desc:{x:1490,y:676,s:19}, node0:{x:614,y:529}, node1:{x:778,y:407}, node2:{x:904,y:600}, node3:{x:1059,y:452}, node4:{x:982,y:526}, r0hi:{x:88,y:315,w:400,h:118}, r1hi:{x:88,y:439,w:400,h:108}, r2hi:{x:88,y:563,w:400,h:113}, s0hi:{x:1180,y:314,w:196,h:122}, s1hi:{x:1386,y:314,w:202,h:122}, s2hi:{x:1179,y:449,w:196,h:122}, s3hi:{x:1386,y:449,w:202,h:124}, s4hi:{x:1179,y:583,w:196,h:122}, s5hi:{x:1385,y:583,w:203,h:125} };
    const lv=(key,fb)=>{ const ov=(RT_ACT[this._selAct]&&RT_ACT[this._selAct][key]); const def=ov||RT_DEF[key]||fb; LD['rt.'+key]=def; return this._lv('rt.'+key,def); }; const HH=(key,ax,ay)=>this._lh('rt.'+key,D(ax),D(ay),U);
    // ---- 底圖(逐幕；未提供的幕先用暗底，等補背景) ----
    { const _bg=this._ensureRouteBg(this._selAct);
      if(_bg&&_bg.complete&&_bg.naturalWidth&&!_bg._err){ ctx.drawImage(_bg,0,0,BW,BH); }
      else { ctx.save(); const g=ctx.createLinearGradient(0,0,0,BH); g.addColorStop(0,'#0d0a15'); g.addColorStop(1,'#060409'); ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH); ctx.restore(); }
    }
    // ---- 返回 ----
    { const v=lv('back',{x:131,y:57,s:19}); T('← 返回',v.x,v.y,v.s,'#e9d9ad',{align:'center',baseline:'middle',weight:'700'}); this.btn(D(32),D(28),D(198),D(58),'back',()=>this.go('atlas')); HH('back',v.x,v.y); }
    // ---- 標題 ----
    { const v=lv('title',{x:852,y:50,s:30}); T('第 '+A.id+' 幕 · '+A.name,v.x,v.y,v.s,'#f0e3c6',{align:'center',baseline:'middle',weight:'800',glow:8}); HH('title',v.x,v.y); }
    { const v=lv('subtitle',{x:852,y:86,s:15}); T('出戰準備，選擇遠征路線與球路石板',v.x,v.y,v.s,'#b6a888',{align:'center',baseline:'middle'}); HH('subtitle',v.x,v.y); }
    // ---- 英雄資訊框 ----
    { const p=lv('portrait',{x:165,y:177,r:73}); const pcx=p.x,pcy=p.y,pr=p.r;
      ctx.save(); const rg=ctx.createRadialGradient(D(pcx),D(pcy),D(8),D(pcx),D(pcy),D(pr)); rg.addColorStop(0,'rgba(255,200,112,0.22)'); rg.addColorStop(1,'rgba(255,150,60,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(D(pcx),D(pcy),D(pr),0,TAU); ctx.fill(); ctx.restore();
      this.drawHero(hero.id, D(pcx), D(pcy+pr*0.92), (D(pr)*2.0)/246); HH('portrait',pcx,pcy);
      const nm=lv('heroName',{x:252,y:150,s:27}); T(hero.name,nm.x,nm.y,nm.s,'#f1e7cf',{baseline:'middle',weight:'800'}); HH('heroName',nm.x,nm.y);
      const en=lv('heroEn',{x:252,y:184,s:17}); T(hero.en,en.x,en.y,en.s, hero.col,{baseline:'middle',weight:'700'}); HH('heroEn',en.x,en.y);
      const ro=lv('heroRole',{x:252,y:214,s:15}); T('定位 · '+hero.role,ro.x,ro.y,ro.s,'#cfc6b0',{baseline:'middle'}); HH('heroRole',ro.x,ro.y);
      const rl=lv('relicLabel',{x:525,y:140,s:16}); T('攜帶聖物 '+cnt+'/5',rl.x,rl.y,rl.s,'#e6c068',{baseline:'middle',weight:'700'}); HH('relicLabel',rl.x,rl.y);
      const rdef=[553,623,693,763,833];
      for(let i=0;i<5;i++){ const rv=lv('relic'+i,{x:rdef[i],y:184,sz:52}); const cx=rv.x, cy=rv.y, sz=rv.sz, rid=load[i], rel=rid&&RELICS[rid];
        this.rr(D(cx-sz/2),D(cy-sz/2),D(sz),D(sz),D(9)); ctx.fillStyle= rel? this._fade(this._clsCol(rel.cls),0.62):'rgba(18,13,8,0.7)'; ctx.fill(); ctx.lineWidth=D(1.6); ctx.strokeStyle= rel? this._clsCol(rel.cls):'rgba(230,192,104,0.32)'; ctx.stroke();
        if(rel){ T(rel.name.slice(0,1), cx, cy, 26,'#f7eed6',{align:'center',baseline:'middle',weight:'800'}); }
        HH('relic'+i,cx,cy); }
      const bd=lv('bd',{x:525,y:242,s:14,tagX:566}); T('BD',bd.x,bd.y,bd.s,'#a99c80',{baseline:'middle',weight:'700'});
      const tags=cnt?this._bdTags(load):[]; let tx=bd.tagX;
      for(const tg of tags.slice(0,4)){ ctx.font='700 '+(15*U)+'px Georgia,serif'; const tw=ctx.measureText(tg).width+D(18); this.rr(D(tx),D(bd.y-14),tw,D(28),D(7)); ctx.fillStyle='rgba(58,44,20,0.9)'; ctx.fill(); ctx.lineWidth=D(1.3); ctx.strokeStyle='rgba(200,160,70,0.5)'; ctx.stroke(); this.text(tg,D(tx)+tw/2,D(bd.y),15*U,'#f0d8a0',{align:'center',baseline:'middle',weight:'700'}); tx+=tw/U+12; }
      if(!cnt){ this.text('尚未配裝 · 點此回英雄頁配裝聖物',D(bd.tagX),D(bd.y),15*U,'#d98a6a',{baseline:'middle',weight:'700'}); }
      HH('bd',bd.x,bd.y);
      const cb=lv('changeBtn',{x:1490,y:226,s:15}); T('點此回英雄頁更換 ›',cb.x,cb.y,cb.s,'#d8b878',{align:'center',baseline:'middle',weight:'700'}); HH('changeBtn',cb.x,cb.y);
      this.btn(D(83),D(107),D(1538),D(141),'rt_summary',()=>{ this.go('heroes'); this.audio.sfx('ui'); });
    }
    // ---- 路線標題 ----
    { const v=lv('routeHeader',{x:293,y:290,s:20}); T('◆ 遠征路線 ◆',v.x,v.y,v.s,'#e6c068',{align:'center',baseline:'middle',weight:'800'}); HH('routeHeader',v.x,v.y); }
    // ---- 路線卡 (左) ----
    const routes=[['fast','速投線','單沙包計時生存 · 無盡｜投越多越強｜掉核心聖物'],['std','標準遠征','完整五幕遠征｜解鎖無盡模式｜一般掉落'],['corrupt','腐化加時','標準進階挑戰｜敵人更兇｜高品質特殊聖物']];
    { const rcX=93,rcY=[355,454,553],rcW=400,rcH=84; const rhd=[{x:88,y:340,w:400,h:108},{x:88,y:439,w:400,h:108},{x:88,y:538,w:400,h:108}];
      for(let i=0;i<3;i++){ const [id,nm,desc]=routes[i]; const x=rcX,y=rcY[i],w=rcW,h=rcH; const sel=this._selRoute===id; const rhi=lv('r'+i+'hi',rhd[i]);
        if(sel){ const hx=rhi.x,hy=rhi.y,hw=rhi.w,hh=rhi.h; ctx.save(); this.rr(D(hx),D(hy),D(hw),D(hh),D(12)); ctx.fillStyle='rgba(120,86,30,0.22)'; ctx.fill(); ctx.lineWidth=D(2.4); ctx.strokeStyle='rgba(240,200,110,0.95)'; ctx.shadowBlur=D(12); ctx.shadowColor='rgba(240,190,90,0.7)'; ctx.stroke(); ctx.shadowBlur=0; ctx.fillStyle='#f0c860'; this.rr(D(hx+4),D(hy+12),D(6),D(hh-24),D(3)); ctx.fill(); ctx.restore(); }
        const nv=lv('r'+i+'name',{x:189,y:y+34,s:22}); T(nm,nv.x,nv.y,nv.s,sel?'#f4d27a':'#ece0c4',{baseline:'middle',weight:'800'}); HH('r'+i+'name',nv.x,nv.y);
        if(this._modeActs(id)<this._selAct){ T('🔒',470,y+34,20,'#d98a6a',{baseline:'middle',align:'right',weight:'800'}); }
        const dv=lv('r'+i+'desc',{x:189,y:y+62,s:13,w:340}); ctx.textBaseline='middle'; this.wrap(desc,D(dv.x),D(dv.y),D(dv.w||340),D(dv.s*1.5),'#cabf9f',dv.s*U,'left'); HH('r'+i+'desc',dv.x,dv.y);
        this.btn(D(x),D(y),D(w),D(h),'r'+id,()=>{ this._selRoute=id; this.audio.sfx('ui'); }); HH('r'+i+'hi',rhi.x,rhi.y); } }
    // ---- 石板標題 ----
    { const v=lv('stonesHeader',{x:1387,y:286,s:18}); T('◆ 球路石板（可不選） ◆',v.x,v.y,v.s,'#e6c068',{align:'center',baseline:'middle',weight:'800'}); HH('stonesHeader',v.x,v.y); }
    // ---- 石板卡 (右 2×3) ----
    { const colCx=[1285,1490], rowTop=[308,445,580], cw=196, chh=122; const shd=[{x:1180,y:314},{x:1385,y:314},{x:1180,y:451},{x:1385,y:451},{x:1180,y:588},{x:1385,y:588}];
      for(let i=0;i<ROUTE_STONES.length;i++){ const st=ROUTE_STONES[i]; const col=i%2,row=(i/2)|0; const cx=colCx[col], top=rowTop[row]; const x=cx-cw/2, y=top; const sel=this._selStone===st.id; const shi=lv('s'+i+'hi',{x:shd[i].x,y:shd[i].y,w:196,h:122});
        if(sel){ const hx=shi.x,hy=shi.y,hw=shi.w,hh=shi.h; ctx.save(); this.rr(D(hx),D(hy),D(hw),D(hh),D(12)); ctx.fillStyle='rgba(120,86,30,0.20)'; ctx.fill(); ctx.lineWidth=D(2.4); ctx.strokeStyle='rgba(240,200,110,0.95)'; ctx.shadowBlur=D(10); ctx.shadowColor='rgba(240,190,90,0.7)'; ctx.stroke(); ctx.shadowBlur=0; ctx.strokeStyle='#f0c860'; ctx.lineWidth=D(2); ctx.beginPath(); ctx.arc(D(hx+hw-22),D(hy+20),D(8),0,TAU); ctx.stroke(); ctx.fillStyle='#f0c860'; ctx.beginPath(); ctx.arc(D(hx+hw-22),D(hy+20),D(3.5),0,TAU); ctx.fill(); ctx.restore(); }
        const nv=lv('s'+i+'name',{x:cx,y:top+62,s:18}); T(st.name,nv.x,nv.y,nv.s,sel?'#f4d27a':'#ece0c4',{align:'center',baseline:'middle',weight:'800'}); HH('s'+i+'name',nv.x,nv.y);
        const dv=lv('s'+i+'desc',{x:cx,y:top+86,s:14}); ctx.textBaseline='middle'; this.wrap(st.desc,D(dv.x),D(dv.y),D(cw-24),D(20),'#cabf9f',dv.s*U,'center'); HH('s'+i+'desc',dv.x,dv.y);
        this.btn(D(x),D(y),D(cw),D(chh),'s'+st.id,()=>{ this._selStone=this._selStone===st.id?null:st.id; this.audio.sfx('ui'); }); HH('s'+i+'hi',shi.x,shi.y); } }
    // ---- 中央關卡節點 (一幕5關：4普通 + 1 Boss) + 虛線路徑 ----
    { const isFast=this._selRoute==='fast'; const ns=[lv('node0',{x:648,y:516}),lv('node1',{x:772,y:612}),lv('node2',{x:904,y:600}),lv('node4',{x:982,y:526}),lv('node3',{x:1046,y:516})];
      const SPEED_NODES={1:{x:548,y:352},2:{x:544,y:335},3:{x:552,y:338},4:{x:552,y:335},5:{x:552,y:335}};
      const spd=lv('nodespeed',SPEED_NODES[this._selAct]||SPEED_NODES[1]);
      ctx.save(); ctx.strokeStyle=isFast?'rgba(130,122,104,0.32)':'rgba(232,202,120,0.65)'; ctx.lineWidth=D(3); ctx.setLineDash([D(3),D(11)]); ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(D(ns[0].x),D(ns[0].y)); for(let i=1;i<ns.length;i++)ctx.lineTo(D(ns[i].x),D(ns[i].y)); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      // 選中路線 → 第一個節點 連線
      { const si=['fast','std','corrupt'].indexOf(this._selRoute); if(si>=0){ const rhb=(RT_ACT[this._selAct]&&RT_ACT[this._selAct]['r'+si+'hi'])||RT_DEF['r'+si+'hi']||{x:88,y:340+si*99,w:400,h:108}; const rh=this._lv('rt.r'+si+'hi',rhb); const fx=rh.x+rh.w, fy=rh.y+rh.h/2; const target=si===0?spd:ns[0];
        ctx.save(); ctx.strokeStyle=si===0?'rgba(255,178,74,0.84)':'rgba(244,210,120,0.75)'; ctx.lineWidth=D(3.5); ctx.setLineDash([D(4),D(9)]); ctx.lineCap='round'; ctx.shadowBlur=D(6); ctx.shadowColor=si===0?'rgba(255,150,60,0.65)':'rgba(240,190,90,0.6)'; ctx.beginPath(); ctx.moveTo(D(fx),D(fy)); ctx.lineTo(D(target.x),D(target.y)); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(D(fx),D(fy),D(5),0,TAU); ctx.fillStyle=si===0?'#ffb24a':'#f4d27a'; ctx.fill(); ctx.restore(); } }
      const _npg=this._nodeProg(this._selAct); { const pmax=Math.min(ns.length-1,_npg); if(this._selNodeAct!==this._selAct){ this._selNodeAct=this._selAct; this._selNode=pmax; } else if(this._selNode==null||this._selNode>pmax){ this._selNode=pmax; } }
      for(let i=0;i<ns.length;i++){ const n=ns[i], boss=(i===ns.length-1), r=D(boss?30:24); const _playable=(i<=_npg)&&!isFast, _cleared=(i<_npg), _sel=(this._selNode===i)&&!isFast;
        ctx.save(); ctx.translate(D(n.x),D(n.y)); ctx.rotate(Math.PI/4);
        this.rr(-r,-r,r*2,r*2,D(6)); ctx.fillStyle=boss?'#5a1f18':'rgba(26,20,12,0.95)'; ctx.fill(); ctx.lineWidth=D(2.6); ctx.strokeStyle=boss?'#e0563a':'#caa23a'; ctx.shadowBlur=D(boss?12:7); ctx.shadowColor=boss?'rgba(224,86,58,0.8)':'rgba(202,162,58,0.5)'; ctx.stroke(); ctx.shadowBlur=0; ctx.restore();
        // 內部標記：boss=紅X，普通=金點
        ctx.save();
        if(boss){ ctx.strokeStyle='#ffcab8'; ctx.lineWidth=D(3.5); ctx.lineCap='round'; const q=D(9); ctx.beginPath(); ctx.moveTo(D(n.x)-q,D(n.y)-q); ctx.lineTo(D(n.x)+q,D(n.y)+q); ctx.moveTo(D(n.x)+q,D(n.y)-q); ctx.lineTo(D(n.x)-q,D(n.y)+q); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(D(n.x),D(n.y),D(6),0,TAU); ctx.fillStyle='#e6c068'; ctx.fill(); }
        ctx.restore();
        // 逐關狀態：鎖 / 已開通 / 選中（位置不變，只加標記）
        if(!_playable){ ctx.save(); ctx.translate(D(n.x),D(n.y)); ctx.rotate(Math.PI/4); this.rr(-r,-r,r*2,r*2,D(6)); ctx.fillStyle='rgba(8,6,4,0.66)'; ctx.fill(); ctx.restore();
          ctx.save(); ctx.strokeStyle='rgba(170,158,134,0.9)'; ctx.lineWidth=D(2.4); ctx.lineCap='round'; const lq=D(5); ctx.beginPath(); ctx.arc(D(n.x),D(n.y)-D(1),lq,Math.PI,0); ctx.stroke(); this.rr(D(n.x)-lq-D(1.5),D(n.y)-D(1),lq*2+D(3),lq+D(4),D(1.5)); ctx.fillStyle='rgba(170,158,134,0.9)'; ctx.fill(); ctx.restore(); }
        if(_cleared){ ctx.save(); ctx.strokeStyle='#8be08b'; ctx.lineWidth=D(3); ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(D(n.x)-D(8),D(n.y)+D(1)); ctx.lineTo(D(n.x)-D(2),D(n.y)+D(7)); ctx.lineTo(D(n.x)+D(9),D(n.y)-D(8)); ctx.stroke(); ctx.restore(); }
        if(_sel&&_playable){ ctx.save(); ctx.translate(D(n.x),D(n.y)); ctx.rotate(Math.PI/4); const rr2=r+D(7); this.rr(-rr2,-rr2,rr2*2,rr2*2,D(8)); ctx.lineWidth=D(3); ctx.strokeStyle='#ffe6a8'; ctx.shadowBlur=D(10); ctx.shadowColor='rgba(255,220,140,0.9)'; ctx.stroke(); ctx.restore(); }
        { const hit=Math.max(r,D(26)); ((idx,ok)=>{ this.btn(D(n.x)-hit,D(n.y)-hit,hit*2,hit*2,'rnode'+idx,()=>{ if(ok){ this._selNode=idx; this.audio.sfx('ui'); } else if(isFast){ this.toast('速投線為單沙包生存','改選標準/腐化才打一般關卡'); this.audio.sfx('hurt'); } else { this.toast('尚未開通','先清前一關'); this.audio.sfx('hurt'); } }); })(i,_playable); }
        HH('node'+i, n.x, n.y);
      }
      // ---- 速投 專屬節點（獨立，不連線；速投線亮，其他模式灰）----
      { const sx=spd.x, sy=spd.y, r=D(27); const active=isFast;
        ctx.save(); ctx.translate(D(sx),D(sy)); ctx.rotate(Math.PI/4);
        this.rr(-r,-r,r*2,r*2,D(7)); ctx.fillStyle=active?'#3c2510':'rgba(24,19,12,0.95)'; ctx.fill();
        ctx.lineWidth=D(2.8); ctx.strokeStyle=active?'#ffb24a':'rgba(120,112,96,0.7)'; ctx.shadowBlur=D(active?13:0); ctx.shadowColor='rgba(255,160,60,0.75)'; ctx.stroke(); ctx.shadowBlur=0; ctx.restore();
        if(active){ ctx.save(); ctx.translate(D(sx),D(sy)); ctx.rotate(Math.PI/4); const rr2=r+D(7); this.rr(-rr2,-rr2,rr2*2,rr2*2,D(9)); ctx.lineWidth=D(3); ctx.strokeStyle='#ffe6a8'; ctx.shadowBlur=D(11); ctx.shadowColor='rgba(255,220,140,0.9)'; ctx.stroke(); ctx.restore(); }
        else { ctx.save(); ctx.translate(D(sx),D(sy)); ctx.rotate(Math.PI/4); this.rr(-r,-r,r*2,r*2,D(7)); ctx.fillStyle='rgba(8,6,4,0.6)'; ctx.fill(); ctx.restore(); }
        T('速', sx, sy, active?24:21, active?'#ffe6b0':'#8f8674', {align:'center',baseline:'middle',weight:'900'});
        T('速投生存', sx, sy+44, 14, active?'#ffd27a':'#857c68', {align:'center',baseline:'middle',weight:'800'});
        const hit=Math.max(r,D(28)); this.btn(D(sx)-hit,D(sy)-hit,hit*2,hit*2,'rnodespeed',()=>{ this._selRoute='fast'; this.audio.sfx('ui'); }); HH('nodespeed', sx, sy); }
    }
    // ---- 出戰摘要 ----
    const rNm=({fast:'速投線',std:'標準遠征',corrupt:'腐化加時'})[this._selRoute]||'標準遠征';
    const stNm=this._selStone?((ROUTE_STONES.find(z=>z.id===this._selStone)||{}).name||'不帶石板'):'不帶石板';
    { const v=lv('summary',{x:852,y:686,s:15}); T('出戰摘要 ｜ '+hero.name+'　·　'+rNm+'　·　'+stNm,v.x,v.y,v.s,'#d8cba8',{align:'center',baseline:'middle',weight:'700'}); HH('summary',v.x,v.y); }
    // CTA frame is baked into the route art; use glow/text feedback without drawing a second box.
    { const ctaHit={x:D(560),y:D(705),w:D(586),h:D(62)}, pressed=this._press(ctaHit), v=lv('cta',{x:853,y:737,s:26}), pulse=0.5+0.5*Math.sin(this.t*2.4);
      ctx.save();
      const gx=D(v.x), gy=D(v.y)+(pressed?D(3):0);
      const shine=ctx.createRadialGradient(gx,gy,D(16),gx,gy,D(pressed?330:270));
      shine.addColorStop(0,pressed?'rgba(216,255,68,0.28)':'rgba(255,225,120,0.10)');
      shine.addColorStop(0.48,pressed?'rgba(216,255,68,0.11)':'rgba(255,225,120,0.05)');
      shine.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=shine;
      ctx.fillRect(ctaHit.x-D(30),ctaHit.y-D(24),ctaHit.w+D(60),ctaHit.h+D(48));
      ctx.restore();
      this.text('進入第 '+A.id+' 幕',D(v.x),D(v.y)+(pressed?D(3):0),v.s*U,pressed?'#f1ffbc':'#ffe6b0',{align:'center',baseline:'middle',weight:'900',glow:pressed?12:6});
      this.btn(ctaHit.x,ctaHit.y,ctaHit.w,ctaHit.h,'go',()=>{ if(this._modeActs(this._selRoute)<this._selAct){ this.toast('此模式尚未解鎖本幕','需先在此模式通關前一幕'); this.audio.sfx('hurt'); return; } this.startRun(this._selAct,this._selRoute,this._selStone,this._selNode); }); HH('cta',v.x,v.y); }
  }
  ,_drawRouteFlat(){ const ctx=this.ctx, s=this.save; this.backdrop('hub'); const A=ACTS[this._selAct-1];
    if(!this._selRoute)this._selRoute='std';
    const hi=Math.max(0,HEROES.findIndex(h=>h.id===s.hero)); const hero=HEROES[hi]; const load=s.loadout||[null,null,null,null,null]; const cnt=load.filter(Boolean).length;
    ctx.save(); ctx.fillStyle='rgba(6,3,10,0.42)'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    // title
    this.text('第 '+A.id+' 幕 · '+A.name, BW/2, 78, 46,'#ece0c4',{align:'center',weight:'800'});
    this.text('出戰準備 · 選擇遠征路線與球路', BW/2, 116, 20,'#a99c80',{align:'center'});
    this.button(60,40,156,66,'← 返回','back',()=>this.go('atlas'),{size:22});
    // ---- summary bar (hero + loadout + BD), read-only, tap -> heroes ----
    const bx=140, by=150, bw=BW-280, bh=152;
    this.panel(bx,by,bw,bh,{r:16,c0:'rgba(30,22,14,0.95)',c1:'rgba(16,11,7,0.97)',lw:2});
    const pcx=bx+98, feet=by+bh-18;
    ctx.save(); const rg=ctx.createRadialGradient(pcx,by+bh*0.46,12,pcx,by+bh*0.46,86); rg.addColorStop(0,'rgba(255,200,112,0.22)'); rg.addColorStop(1,'rgba(255,150,60,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.ellipse(pcx,by+bh*0.52,82,72,0,0,TAU); ctx.fill(); ctx.restore();
    this.drawHero(hero.id, pcx, feet, 0.46);
    this.text(hero.name, bx+196, by+54, 30,'#f1e7cf',{weight:'800'});
    this.text(hero.en, bx+196, by+86, 19, hero.col,{weight:'700'});
    this.text('定位 · '+hero.role, bx+196, by+116, 18,'#cfc6b0');
    ctx.save(); ctx.strokeStyle='rgba(230,192,104,0.18)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(bx+560,by+22); ctx.lineTo(bx+560,by+bh-22); ctx.stroke(); ctx.restore();
    const slx=bx+600, sly=by+28;
    this.text('攜帶聖物 '+cnt+'/5', slx, sly+10, 20,'#e6c068',{weight:'700'});
    if(cnt===0){
      this.text('尚未攜帶聖物', slx, sly+62, 24,'#d98a6a',{weight:'800'});
      this.text('點此回英雄頁配裝聖物 \u203a', slx, sly+96, 18,'#a99c80');
    } else {
      const ss=58, sg=12;
      for(let i=0;i<5;i++){ const sx=slx+i*(ss+sg), sy=sly+26; const rid=load[i], rel=rid&&RELICS[rid];
        this.rr(sx,sy,ss,ss,8); ctx.fillStyle= rel? this._fade(this._clsCol(rel.cls),0.5):'rgba(20,14,9,0.9)'; ctx.fill(); ctx.lineWidth=1.6; ctx.strokeStyle= rel? this._clsCol(rel.cls):'rgba(230,192,104,0.3)'; ctx.stroke();
        if(rel){ this.text(rel.name.slice(0,1), sx+ss/2, sy+ss/2, 26,'#f4ead2',{align:'center',baseline:'middle',weight:'800'}); }
        else { this.text('\u2014', sx+ss/2, sy+ss/2, 22,'#6a5f4c',{align:'center',baseline:'middle'}); } }
      const tags=this._bdTags(load); const ty=sly+26+ss+14;
      this.text('BD', slx, ty+13, 14,'#a99c80',{weight:'700'}); let tx=slx+40;
      for(const tg of tags.slice(0,6)){ ctx.font='700 16px Georgia,serif'; const tw=ctx.measureText(tg).width+18; this.rr(tx,ty,tw,26,7); ctx.fillStyle='rgba(58,44,20,0.92)'; ctx.fill(); ctx.lineWidth=1.4; ctx.strokeStyle='rgba(200,160,70,0.5)'; ctx.stroke(); this.text(tg,tx+tw/2,ty+13,16,'#f0d8a0',{align:'center',baseline:'middle',weight:'700'}); tx+=tw+10; }
    }
    this.text('點此回英雄頁更換 \u203a', bx+bw-28, by+bh-24, 17,'#c9a86a',{align:'right',weight:'700'});
    this.btn(bx,by,bw,bh,'rt_summary',()=>{ this.go('heroes'); this.audio.sfx('ui'); });
    // ---- routes (left) ----
    this.text('遠征路線', 410, 354, 30,'#e6c068',{align:'center',weight:'800'});
    const routes=[['fast','速投線','單沙包計時生存 · 無盡｜投越多越強｜掉核心聖物'],['std','標準遠征','完整五幕遠征｜解鎖無盡模式｜一般掉落'],['corrupt','腐化加時','標準進階挑戰｜敵人更兇｜高品質特殊聖物']];
    for(let i=0;i<3;i++){ const [id,nm,desc]=routes[i]; const y=388+i*132,x=140,w=540,h=116; const sel=this._selRoute===id;
      this.rr(x,y,w,h,12); ctx.fillStyle=sel?'rgba(60,44,20,0.95)':'rgba(26,19,11,0.92)'; ctx.fill(); ctx.lineWidth=sel?3:2; ctx.strokeStyle=sel?'#e6c068':'rgba(200,155,60,0.32)'; ctx.stroke();
      if(sel){ ctx.save(); ctx.fillStyle='#e6c068'; this.rr(x,y,7,h,4); ctx.fill(); ctx.restore(); }
      this.text(nm,x+30,y+46,30,sel?'#e6c068':'#ece0c4',{weight:'800'}); this.text(desc,x+30,y+84,17,'#cfc6b0');
      this.btn(x,y,w,h,'r'+id,()=>{ this._selRoute=id; this.audio.sfx('ui'); }); }
    // ---- stones (right) 2x3 ----
    this.text('球路石板（可不選）', BW-518, 354, 28,'#e6c068',{align:'center',weight:'800'});
    for(let i=0;i<ROUTE_STONES.length;i++){ const st=ROUTE_STONES[i]; const col=i%2,row=(i/2)|0; const x=(BW-896)+col*388,y=388+row*132,w=368,h=116; const sel=this._selStone===st.id;
      this.rr(x,y,w,h,12); ctx.fillStyle=sel?'rgba(60,44,20,0.95)':'rgba(26,19,11,0.92)'; ctx.fill(); ctx.lineWidth=sel?3:2; ctx.strokeStyle=sel?'#e6c068':'rgba(200,155,60,0.28)'; ctx.stroke();
      if(sel){ ctx.save(); ctx.strokeStyle='#e6c068'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x+w-26,y+24,9,0,TAU); ctx.stroke(); ctx.fillStyle='#e6c068'; ctx.beginPath(); ctx.arc(x+w-26,y+24,4,0,TAU); ctx.fill(); ctx.restore(); }
      this.text(st.name,x+20,y+38,22,sel?'#e6c068':'#ece0c4',{weight:'700'}); this.wrap(st.desc,x+20,y+64,w-36,22,'#cfc6b0',15,'left');
      this.btn(x,y,w,h,'s'+st.id,()=>{ this._selStone=this._selStone===st.id?null:st.id; this.audio.sfx('ui'); }); }
    // ---- bottom: 出戰摘要 + enter ----
    const rNm=({fast:'速投線',std:'標準遠征',corrupt:'腐化加時'})[this._selRoute]||'標準遠征';
    const stNm=this._selStone?((ROUTE_STONES.find(z=>z.id===this._selStone)||{}).name||'不帶石板'):'不帶石板';
    this.text('出戰摘要 ｜ '+hero.name+'　·　'+rNm+'　·　'+stNm, BW/2, 902, 20,'#cfc6b0',{align:'center'});
    this.button(BW/2-230,930,460,86,'進入第 '+A.id+' 幕','go',()=>{ if(this._modeActs(this._selRoute)<this._selAct){ this.toast('此模式尚未解鎖本幕','需先在此模式通關前一幕'); this.audio.sfx('hurt'); return; } this.startRun(this._selAct,this._selRoute,this._selStone,this._selNode); },{primary:true,size:32});
  }

  ,startEndless(){ this.save.endless=true; this._selRoute='std'; this._selStone=null; this.startRun(1,'std',null); this.run.endless=true; this.toast('無盡加時','串接五幕菁英宿主'); }

  ,drawSettings(){ const ctx=this.ctx; const st=this.save.settings; const IT=this.insT||0, IL=this.insL||0;
    // ===== 靜態背景（不閃）=====
    const bg=ctx.createLinearGradient(0,0,0,BH); bg.addColorStop(0,'#241b32'); bg.addColorStop(0.6,'#140f1e'); bg.addColorStop(1,'#0b0810'); ctx.fillStyle=bg; ctx.fillRect(0,0,BW,BH);
    { const mg=ctx.createRadialGradient(BW*0.84,BH*0.18,20,BW*0.84,BH*0.18,360); mg.addColorStop(0,'rgba(200,192,224,0.30)'); mg.addColorStop(1,'rgba(200,192,224,0)'); ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(BW*0.84,BH*0.18,360,0,TAU); ctx.fill(); ctx.fillStyle='rgba(207,200,224,0.5)'; ctx.beginPath(); ctx.arc(BW*0.84,BH*0.18,58,0,TAU); ctx.fill(); }
    { const vg=ctx.createRadialGradient(BW/2,BH*0.5,BH*0.34,BW/2,BH*0.5,BW*0.64); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.62)'); ctx.fillStyle=vg; ctx.fillRect(0,0,BW,BH); }
    this.text('設定',BW/2,IT+96,60,'#ece0c4',{align:'center',weight:'800',glow:14});
    this._sliders={};
    const drawTog=(rx,ry,rw,rh,label,key,cb)=>{ this.rr(rx,ry,rw,rh,14); ctx.fillStyle='rgba(26,18,10,0.82)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#5a4326'; this.rr(rx,ry,rw,rh,14); ctx.stroke();
      this.text(label,rx+30,ry+rh/2,32,'#ece0c4',{baseline:'middle'}); const on=st[key],tw=120,th=54,tx=rx+rw-tw-26,ty=ry+rh/2-th/2; this.rr(tx,ty,tw,th,th/2); ctx.fillStyle=on?'#caa23a':'rgba(40,30,18,0.9)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=on?'#e6c068':'rgba(200,155,60,0.4)'; this.rr(tx,ty,tw,th,th/2); ctx.stroke(); ctx.beginPath(); ctx.arc(on?tx+tw-th/2:tx+th/2,ty+th/2,th/2-6,0,TAU); ctx.fillStyle='#ece0c4'; ctx.fill();
      this.btn(rx,ry,rw,rh,'t'+key,()=>{ st[key]=!st[key]; cb&&cb(st[key]); persist(this.save); this.audio.sfx('ui'); }); };
    const drawSld=(rx,ry,rw,rh,label,key,cb)=>{ this.rr(rx,ry,rw,rh,14); ctx.fillStyle='rgba(26,18,10,0.82)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#5a4326'; this.rr(rx,ry,rw,rh,14); ctx.stroke();
      this.text(label,rx+30,ry+rh/2,30,'#ece0c4',{baseline:'middle'}); const sx=rx+rw*0.42, sw=rw*0.42, sy=ry+rh/2, v=st[key]; ctx.lineWidth=8; ctx.strokeStyle='rgba(200,155,60,0.4)'; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+sw,sy); ctx.stroke(); ctx.strokeStyle='#caa23a'; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+sw*v,sy); ctx.stroke(); ctx.beginPath(); ctx.arc(sx+sw*v,sy,18,0,TAU); ctx.fillStyle='#ece0c4'; ctx.fill();
      this._sliders[key]={x:sx,w:sw,y:ry,h:rh,cb}; this.btn(sx-12,ry,sw+24,rh,'sl'+key,()=>{}); };
    const drawShot=(rx,ry,rw,rh)=>{ if(typeof st.shotPush!=='boolean') st.shotPush=false; const active=!!st.shotPush; this.rr(rx,ry,rw,rh,14); ctx.fillStyle='rgba(26,18,10,0.82)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#5a4326'; this.rr(rx,ry,rw,rh,14); ctx.stroke();
      this.text('投籃手感',rx+30,ry+rh/2-12,30,'#ece0c4',{baseline:'middle',weight:'800'}); this.text(active?'手指往前推':'往後拉弓',rx+30,ry+rh/2+22,18,'#a99c80',{baseline:'middle',weight:'700'});
      const gap=12,bw=118,bh=Math.min(58,rh-30),by=ry+rh/2-bh/2,bx=rx+rw-(bw*2+gap)-26;
      this.button(bx,by,bw,bh,'拉弓','shot_setting_pull',()=>{ if(this._hbSetShotMode) this._hbSetShotMode(false); else { st.shotPush=false; persist(this.save); this.render(); } },{primary:!active,size:21,weight:'900'});
      this.button(bx+bw+gap,by,bw,bh,'推投','shot_setting_push',()=>{ if(this._hbSetShotMode) this._hbSetShotMode(true); else { st.shotPush=true; persist(this.save); this.render(); } },{primary:active,size:21,weight:'900'}); };
    const sw=Math.min(BW*0.9,1720), cgap=40, cardW=(sw-cgap)/2, sx0=BW/2-sw/2;
    const cy=IT+168, devH=104, devY=BH-devH-54, cardH=devY-30-cy;
    const cards=[ {hdr:'音訊', sx:sx0, rows:[['t','音樂','music',v=>this.audio.setMusic(v)],['t','音效','sfx',v=>this.audio.setSfx(v)],['s','音樂音量','musicVol',v=>this.audio.setMVol(v)],['s','音效音量','sfxVol',v=>this.audio.setSVol(v)]] },
                  {hdr:'遊戲', sx:sx0+cardW+cgap, rows:[['t','震動','vibrate'],['t','左手模式','lefty'],['shot','投籃手感'],['t','減少動態','reduceMotion'],['t','低效能模式','lowPerf']] } ];
    for(const c of cards){ this.rr(c.sx,cy,cardW,cardH,18); ctx.fillStyle='rgba(18,13,8,0.66)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#5a4326'; this.rr(c.sx,cy,cardW,cardH,18); ctx.stroke();
      this.text(c.hdr, c.sx+34, cy+56, 34, '#e6c068', {weight:'800'});
      const innerTop=cy+86, innerH=cardH-86-22, n=c.rows.length, slot=innerH/n, rh=slot-16, rw=cardW-48, rx=c.sx+24;
      for(let i=0;i<n;i++){ const ry=innerTop+i*slot+8; const r=c.rows[i]; if(r[0]==='t') drawTog(rx,ry,rw,rh,r[1],r[2],r[3]); else if(r[0]==='shot') drawShot(rx,ry,rw,rh); else drawSld(rx,ry,rw,rh,r[1],r[2],r[3]); } }
    { const adm=this.save.admin, dx=sx0, dw=sw; this.rr(dx,devY,dw,devH,16); const dg=ctx.createLinearGradient(dx,devY,dx,devY+devH); dg.addColorStop(0,'rgba(40,30,14,0.92)'); dg.addColorStop(1,'rgba(22,16,8,0.92)'); ctx.fillStyle=dg; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle=adm?'#39ff88':'#e6c068'; this.rr(dx,devY,dw,devH,16); ctx.stroke();
      this.text(adm?'🛠 開發者模式：開啟中（點此關閉）':'🛠 開發者模式', dx+40, devY+devH/2-8, 30, adm?'#39ff88':'#e6c068', {weight:'800',baseline:'middle'});
      this.text(adm?'全地圖 · 一球秒節點 · 排版調整 · 不計成績':'輸入密碼啟用 · 全地圖 / 一球秒節點 / 排版調整 / 不計成績', dx+40, devY+devH/2+28, 20, '#a99c80', {baseline:'middle'});
      this.btn(dx,devY,dw,devH,'devbtn',()=>this._toggleAdmin()); }
    this.button(IL+40,IT+62,176,74,'← 返回','back',()=>this.go(this.screen==='settings'&&this._fromHome?'home':'hub'),{size:24});
  }

  ,drawCodex(){
    const LO=this._hgLayout(); this._HGL=LO;
    this._ensureHgAssets();
    const im=this._hgImg.bg;
    if(im&&im.complete&&im.naturalWidth&&!this._hgErr.bg){ this._drawHgFlat(LO,im); }
    else { this._drawHgBg(LO); this._drawHgBoard(LO); this._drawHgRows(LO); this._drawHgDemon(LO); this._drawHgGraffiti(LO); this._drawHgBack(LO); }
  },
  _guideRows(){ return [
    ['單指投籃','按住籃球向後拖曳調整角度與力道，放手出手；軌跡只輔助不改物理。','ball'],
    ['籃框宿主','籃框跟著宿主移動；清光小怪或 Boss 波次就前往下一節點。','hoop'],
    ['進球攻擊','球穿框後才攻擊敵人；空心、擦板、連擊會提高分數、XP 與傷害。','flame'],
    ['空心 / 擦板','空心、擦板、普通進球有不同分數、XP、傷害與流派加成。','swish'],
    ['投失扣血','投失會扣血，速投線投失扣更多；血量歸零遠征結束。','blood'],
    ['每球升級','得 XP 後升級選球語，和英雄天賦、聖物詞綴一起堆出流派。','up'],
    ['聖物','戰後掉聖物，裝進三格聖匣；路線與石板會影響獎勵品質。','gem'],
    ['五幕二十關','進圖譜選第 1 到第 5 幕；標準或腐化通第 5 幕後開無盡加時。','flag'] ];
  },
  _hgLayout(){
    const sc=this.scale||0.365, U=1/sc; this._U=U;
    const insL=this.insL||0,insR=this.insR||0,insT=this.insT||0,insB=this.insB||0;
    const safeTop=insT,safeBot=BH-insB,safeL=insL,safeR=BW-insR;
    const back={x:Math.max(24*U,safeL+8*U),y:Math.max(18*U,safeTop+6*U),w:76*U,h:36*U};
    const boardX=Math.max(150*U,safeL+10*U), boardR=Math.min((150+600)*U,safeR-10*U);
    const boardY=Math.max(60*U,safeTop+46*U), boardB=Math.min((58+305)*U,safeBot-6*U);
    const board={x:boardX,y:boardY,w:boardR-boardX,h:boardB-boardY};
    const titleY=Math.max(34*U,safeTop+24*U);
    const pad=13*U, rowsTop=board.y+pad+4*U, rowsBot=board.y+board.h-pad, rowH=(rowsBot-rowsTop)/8;
    const innerX=board.x+pad+6*U, innerR=board.x+board.w-pad;
    const iconW=22*U, labelX=innerX+iconW;
    const labelW=Math.min(150*U,(innerR-labelX)*0.34), gap=12*U;
    const descX=labelX+labelW+gap, descW=innerR-descX-16*U;
    const demonX=Math.max(8*U,safeL+2*U), demonRight=board.x-6*U; const demonW=Math.max(70*U,demonRight-demonX);
    const demonBottom=safeBot-4*U, demonH=Math.min(186*U, demonBottom-(boardY-2*U)), demonY=demonBottom-demonH;
    return {U,sc,insL,insR,insT,insB,safeTop,safeBot,safeL,safeR,back,board,titleY,rowsTop,rowH,innerX,innerR,iconW,labelX,labelW,descX,descW,demonX,demonY,demonW,demonH};
  },
  _ensureHgAssets(){ if(!this._hgImg){ this._hgImg={}; this._hgErr={}; }
    if(this._hgImg.bg===undefined){ try{ const im=new Image(); im.onerror=()=>{this._hgErr.bg=true;}; im.src='/assets/host_guide/codex_bg_flat.webp'; this._hgImg.bg=im; }catch(e){ this._hgErr.bg=true; } }
    if(this._hgImg.demon===undefined){ this._hgImg.demon=null; this._hgErr.demon=true; } /* fallback bean demon drawn as vector (_hgBean) */
  },
  _drawHgFlat(LO,im){ const ctx=this.ctx,U=LO.U; const sx=BW/1846, sy=BH/852;
    ctx.drawImage(im,0,0,BW,BH); // full-bleed painted handbook (frame+demon+all decor baked)
    const rows=this._guideRows();
    const lines=[176,247,323,398,474,549,624,700,771]; // row dividers in 1846×852 art space
    const descX=Math.round(550*sx), descR=1505*sx, descFs=Math.max(13,27*sx);
    for(let i=0;i<8;i++){ const cy=((lines[i]+lines[i+1])/2+1)*sy;
      this.text(this._clip(rows[i][1],descR-descX,descFs,'700'), descX, Math.round(cy), descFs,'#fff0d2',{baseline:'middle',weight:'700',font:'"Microsoft JhengHei","PingFang TC",sans-serif'}); }
    // invisible back hit over painted 返回 (clamped into safe area)
    const bx=Math.max(LO.safeL+2*U,52*sx), by=36*sy, bw=132*sx, bh=80*sy;
    this.btn(bx-6*U, by, Math.max(96*U,bw+12*U), Math.max(44*U,bh),'hg_back',()=>this.go(this._fromHome?'home':'hub'));
  },
  _drawHgBg(LO){ const ctx=this.ctx,U=LO.U,t=this.t;
    const g=ctx.createLinearGradient(0,0,0,BH); g.addColorStop(0,'#2a1340'); g.addColorStop(0.5,'#160a26'); g.addColorStop(1,'#090410'); ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH);
    // distant castle spires
    ctx.save(); ctx.fillStyle='rgba(10,6,20,0.7)'; const hz=BH*0.42; for(let i=0;i<14;i++){ const x=i*(BW/13), w=BW/16, h=(40+((i*53)%70))*U; ctx.beginPath(); ctx.moveTo(x-w/2,hz); ctx.lineTo(x,hz-h); ctx.lineTo(x+w/2,hz); ctx.closePath(); ctx.fill(); } ctx.restore();
    // moon top-right
    const mx=BW-78*U,my=64*U,mr=44*U; ctx.save(); const mg=ctx.createRadialGradient(mx,my,4*U,mx,my,mr*1.9); mg.addColorStop(0,'rgba(200,170,120,0.5)'); mg.addColorStop(1,'rgba(200,170,120,0)'); ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(mx,my,mr*1.9,0,TAU); ctx.fill(); ctx.fillStyle='rgba(226,212,172,0.55)'; ctx.beginPath(); ctx.arc(mx,my,mr,0,TAU); ctx.fill(); ctx.fillStyle='rgba(150,135,100,0.4)'; ctx.beginPath(); ctx.arc(mx-12*U,my-8*U,7*U,0,TAU); ctx.arc(mx+10*U,my+9*U,5*U,0,TAU); ctx.fill(); ctx.restore();
    // green court glow behind board
    const cx=LO.board.x+LO.board.w/2, cy=LO.board.y+LO.board.h/2; const cgr=ctx.createRadialGradient(cx,cy,20*U,cx,cy,LO.board.w*0.6); cgr.addColorStop(0,'rgba(120,210,40,0.12)'); cgr.addColorStop(1,'rgba(120,210,40,0)'); ctx.save(); ctx.fillStyle=cgr; ctx.fillRect(0,0,BW,BH); ctx.restore();
    // bottom skull crowd silhouette
    ctx.save(); const cyb=BH-6*U; for(let i=0;i<22;i++){ const x=8*U+i*(BW-16*U)/21, rr=(13+((i*37)%9))*U; ctx.fillStyle='rgba(6,4,12,0.85)'; ctx.beginPath(); ctx.arc(x,cyb,rr,Math.PI,TAU); ctx.fill(); if(i%3===0){ ctx.fillStyle='rgba(150,220,60,0.5)'; ctx.beginPath(); ctx.arc(x-rr*0.3,cyb-rr*0.4,1.4*U,0,TAU); ctx.arc(x+rr*0.3,cyb-rr*0.4,1.4*U,0,TAU); ctx.fill(); } } ctx.restore();
    // vignette
    const vg=ctx.createRadialGradient(BW/2,BH/2,BH*0.32,BW/2,BH/2,BH*0.82); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.5)'); ctx.fillStyle=vg; ctx.fillRect(0,0,BW,BH);
  },
  _drawHgBoard(LO){ const ctx=this.ctx,U=LO.U,b=LO.board,t=this.t;
    // hanging chains from top to board corners
    ctx.save(); ctx.strokeStyle='rgba(120,110,120,0.5)'; ctx.lineWidth=2.4*U; for(const cxp of [b.x+18*U,b.x+b.w-18*U]){ for(let y=0;y<b.y-6*U;y+=8*U){ ctx.beginPath(); ctx.ellipse(cxp,y+4*U,3*U,4.5*U,0,0,TAU); ctx.stroke(); } } ctx.restore();
    ctx.save();
    // outer wood frame
    this.rr(b.x-7*U,b.y-7*U,b.w+14*U,b.h+14*U,16*U); const wg=ctx.createLinearGradient(0,b.y,0,b.y+b.h); wg.addColorStop(0,'#33240f'); wg.addColorStop(0.5,'#241809'); wg.addColorStop(1,'#140d06'); ctx.fillStyle=wg; ctx.fill(); ctx.lineWidth=2*U; ctx.strokeStyle='#6a4a24'; ctx.stroke();
    // green slime drips on top frame
    ctx.fillStyle='rgba(150,220,50,0.5)'; for(const dx of [b.x+b.w*0.28,b.x+b.w*0.55,b.x+b.w*0.8]){ const dl=(10+((dx*7)%14))*U; ctx.beginPath(); ctx.moveTo(dx-2.5*U,b.y-5*U); ctx.lineTo(dx+2.5*U,b.y-5*U); ctx.lineTo(dx+1.5*U,b.y-5*U+dl); ctx.arc(dx,b.y-5*U+dl,1.7*U,0,Math.PI); ctx.lineTo(dx-1.5*U,b.y-5*U+dl); ctx.closePath(); ctx.fill(); }
    // inner panel
    this.rr(b.x,b.y,b.w,b.h,12*U); const pg=ctx.createLinearGradient(0,b.y,0,b.y+b.h); pg.addColorStop(0,'rgba(17,10,22,0.97)'); pg.addColorStop(1,'rgba(8,5,13,0.98)'); ctx.fillStyle=pg; ctx.fill();
    ctx.lineWidth=1.4*U; ctx.strokeStyle='rgba(214,169,69,0.5)'; this.rr(b.x+3*U,b.y+3*U,b.w-6*U,b.h-6*U,10*U); ctx.stroke();
    ctx.restore();
    // skull corners
    for(const p of [[b.x+2*U,b.y+2*U],[b.x+b.w-2*U,b.y+2*U],[b.x+2*U,b.y+b.h-2*U],[b.x+b.w-2*U,b.y+b.h-2*U]]) this._hgSkull(p[0],p[1],7*U);
    // footer doodle
    this.text('HOOP OR DIE', b.x+b.w/2, b.y+b.h-9*U, 9*U,'rgba(160,130,175,0.45)',{align:'center',baseline:'middle',weight:'700'});
    // ---- title plaque ----
    const tcx=BW/2, ty=LO.titleY, tw=Math.min(272*U,b.w*0.66), th=42*U, tx=tcx-tw/2;
    // crossed bones behind plaque ends
    this._hgBone(tx-2*U,ty,11*U); this._hgBone(tx+tw+2*U,ty,11*U);
    ctx.save(); this.rr(tx,ty-th/2,tw,th,10*U); const tg=ctx.createLinearGradient(0,ty-th/2,0,ty+th/2); tg.addColorStop(0,'#402d16'); tg.addColorStop(1,'#1c1208'); ctx.fillStyle=tg; ctx.fill(); ctx.lineWidth=2.2*U; ctx.strokeStyle='#d7a945'; this.rr(tx,ty-th/2,tw,th,10*U); ctx.stroke(); ctx.restore();
    // horned skull emblem on top of plaque
    this._hgHornSkull(tcx, ty-th/2-3*U, 9*U);
    this.text('宿主圖鑑 / 玩法', tcx, ty, 19*U,'#f0d98a',{align:'center',baseline:'middle',weight:'800',glow:7*U});
  },
  _drawHgRows(LO){ const ctx=this.ctx,U=LO.U; const rows=this._guideRows();
    for(let i=0;i<8;i++){ const ry=LO.rowsTop+i*LO.rowH, cy=ry+LO.rowH/2;
      // alternating row tint
      if(i%2===1){ ctx.save(); ctx.fillStyle='rgba(120,210,40,0.04)'; this.rr(LO.innerX-4*U,ry+2*U,LO.innerR-LO.innerX+8*U,LO.rowH-4*U,5*U); ctx.fill(); ctx.restore(); }
      if(i>0){ ctx.save(); ctx.strokeStyle='rgba(214,169,69,0.12)'; ctx.lineWidth=1*U; ctx.beginPath(); ctx.moveTo(LO.innerX,ry); ctx.lineTo(LO.innerR,ry); ctx.stroke(); ctx.restore(); }
      // row icon
      this._hgRowIcon(rows[i][2], LO.innerX+8*U, cy, 7*U);
      // label tab
      const tabH=Math.min(LO.rowH-6*U,24*U), tabY=cy-tabH/2;
      ctx.save(); this.rr(LO.labelX,tabY,LO.labelW,tabH,6*U); const g=ctx.createLinearGradient(0,tabY,0,tabY+tabH); g.addColorStop(0,'rgba(46,32,15,0.96)'); g.addColorStop(1,'rgba(24,16,8,0.97)'); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=1.2*U; ctx.strokeStyle='rgba(214,169,69,0.45)'; this.rr(LO.labelX,tabY,LO.labelW,tabH,6*U); ctx.stroke(); ctx.restore();
      this.text(this._clip(rows[i][0],LO.labelW-14*U,12*U,'700'), LO.labelX+8*U, cy, 12*U,'#f0d98a',{baseline:'middle',weight:'700'});
      // desc 1-line
      this.text(this._clip(rows[i][1],LO.descW,11.5*U,'400'), LO.descX, cy, 11.5*U,'#dcd3c2',{baseline:'middle'});
      // skull bullet far right
      this._hgSkull(LO.innerR-6*U, cy, 5*U);
    }
  },
  _drawHgDemon(LO){ const ctx=this.ctx,U=LO.U; const im=this._hgImg.demon, dx=LO.demonX,dy=LO.demonY,dw=LO.demonW,dh=LO.demonH;
    // comedic wood sign above demon (editable text)
    const sw=Math.min(dw+8*U,118*U), sx=dx+(dw-sw)/2, sy=dy-4*U, sh=22*U;
    ctx.save(); ctx.translate(sx+sw/2, sy-sh/2); ctx.rotate(-0.04);
    this.rr(-sw/2,-sh/2,sw,sh,5*U); const sg=ctx.createLinearGradient(0,-sh/2,0,sh/2); sg.addColorStop(0,'#3a2814'); sg.addColorStop(1,'#1d1308'); ctx.fillStyle=sg; ctx.fill(); ctx.lineWidth=1.4*U; ctx.strokeStyle='#9fe024'; ctx.stroke();
    this.text('規則我訂的', 0, 0, 11*U,'#cdec9a',{align:'center',baseline:'middle',weight:'700'}); ctx.restore();
    // ground shadow
    ctx.save(); ctx.fillStyle='rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(dx+dw/2,dy+dh-4*U,dw*0.4,7*U,0,0,TAU); ctx.fill(); ctx.restore();
    // purple glow behind demon
    const gx=dx+dw/2,gy=dy+dh*0.55; const pgl=ctx.createRadialGradient(gx,gy,6*U,gx,gy,dw*0.7); pgl.addColorStop(0,'rgba(143,76,178,0.28)'); pgl.addColorStop(1,'rgba(143,76,178,0)'); ctx.save(); ctx.fillStyle=pgl; ctx.fillRect(dx-dw*0.3,dy,dw*1.6,dh); ctx.restore();
    // ---- authoritative bean demon, rebuilt as editable vector (matches reference art) ----
    const cMinX=-106,cMaxX=150,cMinY=-250,cMaxY=14, cwid=cMaxX-cMinX, chei=cMaxY-cMinY, cmid=(cMinX+cMaxX)/2;
    const bs=Math.min(dw/cwid, dh/chei)*0.98;
    const bcx=dx+dw/2-cmid*bs, bfeetY=dy+dh-cMaxY*bs;
    this._hgBean(bcx,bfeetY,bs);
  },
  _hgBean(cx,feetY,s){ const ctx=this.ctx; ctx.save(); ctx.translate(cx,feetY); ctx.scale(s,s);
    const OUT='#1b1026',OUTW=8; ctx.lineJoin='round'; ctx.lineCap='round';
    // pole in raised right hand (behind body)
    ctx.save(); ctx.strokeStyle='#3a2412'; ctx.lineWidth=11; ctx.beginPath(); ctx.moveTo(150,-250); ctx.lineTo(120,-92); ctx.stroke();
    ctx.strokeStyle='#b78a4e'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(150,-250); ctx.lineTo(120,-92); ctx.stroke();
    ctx.strokeStyle='#d8b070'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(149,-247); ctx.lineTo(121,-96); ctx.stroke(); ctx.restore();
    // feet
    for(const fx of [-40,40]){ ctx.save(); ctx.beginPath(); ctx.ellipse(fx,-6,30,20,0,0,TAU); ctx.fillStyle='#3f2a5c'; ctx.fill(); ctx.lineWidth=OUTW; ctx.strokeStyle=OUT; ctx.stroke(); ctx.restore(); }
    // body (egg/bean)
    ctx.beginPath(); ctx.moveTo(0,-200);
    ctx.bezierCurveTo(48,-200,86,-156,96,-86); ctx.bezierCurveTo(106,-14,88,-2,50,4);
    ctx.bezierCurveTo(20,8,-20,8,-50,4); ctx.bezierCurveTo(-88,-2,-106,-14,-96,-86);
    ctx.bezierCurveTo(-86,-156,-48,-200,0,-200); ctx.closePath();
    const bg=ctx.createLinearGradient(0,-200,0,10); bg.addColorStop(0,'#6f5388'); bg.addColorStop(0.55,'#553a72'); bg.addColorStop(1,'#3a2353'); ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=OUTW; ctx.strokeStyle=OUT; ctx.stroke();
    ctx.save(); ctx.clip();
    const shg=ctx.createRadialGradient(-34,-150,10,-10,-60,170); shg.addColorStop(0,'rgba(255,225,255,0.16)'); shg.addColorStop(0.5,'rgba(255,225,255,0)'); ctx.fillStyle=shg; ctx.fillRect(-110,-210,220,230);
    const shg2=ctx.createLinearGradient(0,-40,0,8); shg2.addColorStop(0,'rgba(20,8,30,0)'); shg2.addColorStop(1,'rgba(20,8,30,0.4)'); ctx.fillStyle=shg2; ctx.fillRect(-110,-50,220,60); ctx.restore();
    // horns
    const horn=(dir)=>{ ctx.save(); ctx.beginPath(); ctx.moveTo(dir*18,-178); ctx.bezierCurveTo(dir*26,-214,dir*54,-238,dir*76,-244); ctx.bezierCurveTo(dir*62,-216,dir*58,-196,dir*56,-178); ctx.bezierCurveTo(dir*44,-175,dir*30,-175,dir*18,-178); ctx.closePath(); const hg=ctx.createLinearGradient(0,-238,0,-176); hg.addColorStop(0,'#3a2550'); hg.addColorStop(1,'#241338'); ctx.fillStyle=hg; ctx.fill(); ctx.lineWidth=OUTW-1; ctx.strokeStyle=OUT; ctx.stroke(); ctx.restore(); };
    horn(-1); horn(1);
    ctx.save(); ctx.fillStyle='rgba(150,110,190,0.5)'; ctx.beginPath(); ctx.ellipse(2,-168,20,12,0.2,0,TAU); ctx.fill(); ctx.restore();
    // angry V brows
    ctx.save(); ctx.strokeStyle=OUT; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(-58,-112); ctx.lineTo(-14,-96); ctx.stroke(); ctx.beginPath(); ctx.moveTo(58,-112); ctx.lineTo(14,-96); ctx.stroke(); ctx.restore();
    // eyes
    const eye=(ex,pdx)=>{ ctx.save(); ctx.beginPath(); ctx.ellipse(ex,-78,25,29,0,0,TAU); ctx.fillStyle='#f4f0ea'; ctx.fill(); ctx.lineWidth=4.5; ctx.strokeStyle='#1b1026'; ctx.stroke(); ctx.beginPath(); ctx.arc(ex+pdx,-84,8.5,0,TAU); ctx.fillStyle='#160a1e'; ctx.fill(); ctx.restore(); };
    eye(-26,5); eye(26,-5);
    // evil grin + tongue
    ctx.save(); ctx.beginPath(); ctx.moveTo(-46,-44); ctx.bezierCurveTo(-30,-30,30,-30,46,-46); ctx.bezierCurveTo(40,-6,18,12,0,12); ctx.bezierCurveTo(-20,12,-40,-8,-46,-44); ctx.closePath(); ctx.fillStyle='#2c0e1a'; ctx.fill(); ctx.lineWidth=6; ctx.strokeStyle=OUT; ctx.stroke(); ctx.clip(); ctx.beginPath(); ctx.ellipse(2,6,18,12,0,0,TAU); ctx.fillStyle='#c4424e'; ctx.fill(); ctx.restore();
    // fangs
    ctx.save(); ctx.fillStyle='#f4f0ea'; ctx.strokeStyle='#1b1026'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(-34,-42); ctx.lineTo(-18,-42); ctx.lineTo(-26,-14); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(20,-40); ctx.lineTo(32,-40); ctx.lineTo(26,-22); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // left arm akimbo
    ctx.save(); ctx.strokeStyle=OUT; ctx.lineWidth=OUTW+20; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(-78,-56); ctx.quadraticCurveTo(-116,-50,-104,-20); ctx.stroke(); ctx.strokeStyle='#523671'; ctx.lineWidth=OUTW+9; ctx.beginPath(); ctx.moveTo(-78,-56); ctx.quadraticCurveTo(-116,-50,-104,-20); ctx.stroke(); ctx.beginPath(); ctx.arc(-104,-20,15,0,TAU); ctx.fillStyle='#523671'; ctx.fill(); ctx.lineWidth=OUTW; ctx.strokeStyle=OUT; ctx.stroke(); ctx.restore();
    // right arm raised holding pole
    ctx.save(); ctx.strokeStyle=OUT; ctx.lineWidth=OUTW+22; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(86,-66); ctx.lineTo(120,-92); ctx.stroke(); ctx.strokeStyle='#5d3f82'; ctx.lineWidth=OUTW+10; ctx.beginPath(); ctx.moveTo(86,-66); ctx.lineTo(120,-92); ctx.stroke(); ctx.beginPath(); ctx.arc(122,-94,17,0,TAU); ctx.fillStyle='#5d3f82'; ctx.fill(); ctx.lineWidth=OUTW; ctx.strokeStyle=OUT; ctx.stroke(); ctx.restore();
    ctx.restore();
  },
  _drawHgGraffiti(LO){ const ctx=this.ctx,U=LO.U;
    const gx0=Math.max(6*U,LO.safeL+4*U), gx1=LO.board.x-6*U, gcx=(gx0+gx1)/2;
    const top=LO.back.y+LO.back.h+10*U;
    // broken hoop + green net in left gutter, below back button
    const hx=gcx, hy=top+14*U;
    ctx.save(); ctx.strokeStyle='rgba(230,120,40,0.9)'; ctx.lineWidth=3*U; ctx.beginPath(); ctx.ellipse(hx,hy,17*U,6*U,0,0,Math.PI); ctx.stroke();
    ctx.strokeStyle='rgba(150,220,50,0.6)'; ctx.lineWidth=1.4*U; for(let i=0;i<5;i++){ const nx=hx-14*U+i*7*U; ctx.beginPath(); ctx.moveTo(nx,hy+1*U); ctx.lineTo(hx-7*U+i*3.5*U,hy+13*U); ctx.stroke(); } ctx.restore();
    // DUNK OR DIE graffiti
    ctx.save(); ctx.translate(gcx, hy+34*U); ctx.rotate(-0.12); ctx.textAlign='center'; ctx.font='800 '+(13*U)+'px Georgia,serif';
    ctx.fillStyle='rgba(185,125,225,0.82)'; ctx.fillText('DUNK',0,0); ctx.fillStyle='rgba(150,220,60,0.82)'; ctx.fillText('OR DIE',0,15*U); ctx.restore();
  },
  _drawHgBack(LO){ const ctx=this.ctx,U=LO.U,r=LO.back; const pr=this._press(r);
    ctx.save(); if(pr)ctx.globalAlpha=0.8; this.rr(r.x,r.y,r.w,r.h,8*U); const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,'rgba(58,40,20,0.96)'); g.addColorStop(1,'rgba(28,18,10,0.97)'); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=1.8*U; ctx.strokeStyle='#d7a945'; this.rr(r.x,r.y,r.w,r.h,8*U); ctx.stroke(); ctx.restore();
    this.text('← 返回', r.x+r.w/2, r.y+r.h/2, 13*U,'#f0d98a',{align:'center',baseline:'middle',weight:'700'});
    this.btn(r.x-6*U, r.y-((44*U-r.h)/2), Math.max(88*U,r.w+12*U), 44*U, 'hg_back', ()=>this.go(this._fromHome?'home':'hub'));
  },
  _hgRowIcon(type,cx,cy,r){ const ctx=this.ctx,U=this._U; ctx.save(); ctx.lineWidth=1.6*U; ctx.lineCap='round'; ctx.lineJoin='round';
    if(type==='ball'){ ctx.fillStyle='#9fe024'; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.fill(); ctx.strokeStyle='#16320a'; ctx.lineWidth=1.2*U; ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r); ctx.stroke(); }
    else if(type==='hoop'){ ctx.strokeStyle='#e07a2a'; ctx.beginPath(); ctx.ellipse(cx,cy-r*0.2,r,r*0.55,0,0,TAU); ctx.stroke(); ctx.strokeStyle='rgba(216,200,160,0.7)'; ctx.lineWidth=1*U; for(let i=-1;i<2;i++){ ctx.beginPath(); ctx.moveTo(cx+i*r*0.6,cy); ctx.lineTo(cx+i*r*0.3,cy+r*0.9); ctx.stroke(); } }
    else if(type==='flame'){ ctx.fillStyle='#9fe024'; ctx.beginPath(); ctx.moveTo(cx,cy-r*1.1); ctx.quadraticCurveTo(cx+r,cy,cx,cy+r); ctx.quadraticCurveTo(cx-r,cy,cx,cy-r*1.1); ctx.fill(); }
    else if(type==='swish'){ ctx.strokeStyle='#d7a945'; ctx.beginPath(); ctx.ellipse(cx,cy-r*0.4,r*0.9,r*0.4,0,0,TAU); ctx.stroke(); ctx.strokeStyle='#9fe024'; ctx.beginPath(); ctx.moveTo(cx,cy-r*0.2); ctx.lineTo(cx,cy+r); ctx.moveTo(cx-r*0.4,cy+r*0.5); ctx.lineTo(cx,cy+r); ctx.lineTo(cx+r*0.4,cy+r*0.5); ctx.stroke(); }
    else if(type==='blood'){ ctx.fillStyle='#b83030'; ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.quadraticCurveTo(cx+r,cy+r*0.3,cx,cy+r); ctx.quadraticCurveTo(cx-r,cy+r*0.3,cx,cy-r); ctx.fill(); }
    else if(type==='up'){ ctx.strokeStyle='#9fe024'; ctx.lineWidth=2.2*U; ctx.beginPath(); ctx.moveTo(cx-r*0.7,cy+r*0.2); ctx.lineTo(cx,cy-r*0.6); ctx.lineTo(cx+r*0.7,cy+r*0.2); ctx.moveTo(cx-r*0.7,cy+r*0.7); ctx.lineTo(cx,cy-r*0.1); ctx.lineTo(cx+r*0.7,cy+r*0.7); ctx.stroke(); }
    else if(type==='gem'){ ctx.fillStyle='#b06fe0'; ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r*0.8,cy); ctx.lineTo(cx,cy+r); ctx.lineTo(cx-r*0.8,cy); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1*U; ctx.beginPath(); ctx.moveTo(cx-r*0.8,cy); ctx.lineTo(cx+r*0.8,cy); ctx.stroke(); }
    else if(type==='flag'){ this._hgSkull(cx,cy,r); }
    ctx.restore();
  },
  _hgHornSkull(cx,cy,r){ const ctx=this.ctx,U=this._U; ctx.save();
    ctx.fillStyle='#d7a945'; // horns
    ctx.beginPath(); ctx.moveTo(cx-r*0.7,cy-r*0.3); ctx.quadraticCurveTo(cx-r*1.6,cy-r*1.4,cx-r*1.1,cy-r*1.7); ctx.quadraticCurveTo(cx-r*1.0,cy-r*0.9,cx-r*0.3,cy-r*0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+r*0.7,cy-r*0.3); ctx.quadraticCurveTo(cx+r*1.6,cy-r*1.4,cx+r*1.1,cy-r*1.7); ctx.quadraticCurveTo(cx+r*1.0,cy-r*0.9,cx+r*0.3,cy-r*0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#e8e0cc'; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.fill(); ctx.fillRect(cx-r*0.55,cy,r*1.1,r*0.95);
    ctx.fillStyle='#160a12'; ctx.beginPath(); ctx.arc(cx-r*0.4,cy,r*0.26,0,TAU); ctx.arc(cx+r*0.4,cy,r*0.26,0,TAU); ctx.fill(); ctx.fillStyle='#9fe024'; ctx.beginPath(); ctx.arc(cx-r*0.4,cy,r*0.1,0,TAU); ctx.arc(cx+r*0.4,cy,r*0.1,0,TAU); ctx.fill(); ctx.restore();
  },
  _hgBone(cx,cy,r){ const ctx=this.ctx,U=this._U; ctx.save(); ctx.strokeStyle='rgba(224,212,180,0.55)'; ctx.lineWidth=2.4*U; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(cx-r,cy-r*0.5); ctx.lineTo(cx+r,cy+r*0.5); ctx.stroke(); ctx.fillStyle='rgba(224,212,180,0.55)'; ctx.beginPath(); ctx.arc(cx-r,cy-r*0.5,r*0.42,0,TAU); ctx.arc(cx+r,cy+r*0.5,r*0.42,0,TAU); ctx.fill(); ctx.restore(); },
  _hgSkull(cx,cy,r){ const ctx=this.ctx; ctx.save(); ctx.fillStyle='rgba(224,212,180,0.6)'; ctx.beginPath(); ctx.arc(cx,cy-r*0.15,r,0,TAU); ctx.fill(); ctx.fillRect(cx-r*0.5,cy-r*0.15,r,r*0.85); ctx.fillStyle='rgba(18,10,8,0.92)'; ctx.beginPath(); ctx.arc(cx-r*0.36,cy-r*0.15,r*0.24,0,TAU); ctx.arc(cx+r*0.36,cy-r*0.15,r*0.24,0,TAU); ctx.fill(); ctx.restore(); }
});
// settings slider drag
(function(){ const dOnDown=Game.prototype.onDown,dOnMove=Game.prototype.onMove,dOnUp=Game.prototype.onUp;
  Game.prototype.onDown=function(x,y){ if(this.screen==='settings'&&this._sliders){ for(const k in this._sliders){ const s=this._sliders[k]; if(x>=s.x-20&&x<=s.x+s.w+20&&y>=s.y&&y<=s.y+s.h){ this._drag=k; this._applySl(x); return; } } } dOnDown.call(this,x,y); };
  Game.prototype.onMove=function(x,y){ if(this._drag){ this._applySl(x); return; } dOnMove.call(this,x,y); };
  Game.prototype.onUp=function(x,y){ if(this._drag){ this._drag=null; persist(this.save); this.render(); return; } dOnUp.call(this,x,y); };
  Game.prototype._applySl=function(x){ const s=this._sliders[this._drag]; const v=clamp((x-s.x)/s.w,0,1); this.save.settings[this._drag]=v; s.cb&&s.cb(v); };
})();
// === part 9 below ===
// ============================================================
// PART 9 — relic匣 screen, library, explicit replace, loot claim
// ============================================================
Object.assign(Game.prototype,{
  drawRelics(){ const ctx=this.ctx; this.backdrop('hub'); const s=this.save;
    this.text('籃魂聖匣',BW/2,90,52,'#ece0c4',{align:'center',weight:'800'}); this.text('三個通用欄位　·　任一聖物可裝入任一欄',BW/2,130,22,'#a2926e',{align:'center'});
    // 3 slots
    const sw=380,sh=150,x0=BW/2-(sw*3+48)/2,y=180;
    for(let i=0;i<3;i++){ const x=x0+i*(sw+24),id=s.relics[i]; this.panel(x,y,sw,sh,{r:14}); this.text('聖物欄 '+(i+1),x+20,y+34,20,'#e6c068',{weight:'700'});
      if(id){ const R=RELICS[id]; this.text(R.name,x+20,y+72,26,'#ece0c4',{weight:'800'}); this.text(RELIC_CLASS[R.cls]+(R.form?'（'+BALL_FORMS[R.form].name+'）':''),x+20,y+98,16,'#a2926e'); this.wrap(R.desc,x+20+150,y+128,sw-40,22,'#cfc6b0',16,'left');
        this._sb(x+sw-130,y+sh-46,110,34,'卸下',()=>{ s.library.push(id); s.relics[i]=null; persist(s); this.audio.sfx('ui'); }); }
      else this.text('（空）',x+20,y+78,22,'rgba(160,150,130,0.6)'); }
    // library
    this.text('聖物庫 '+s.library.length+'/30',BW/2,y+sh+50,30,'#ece0c4',{align:'center',weight:'700'});
    const gx=120,gy=y+sh+80,cols=5,cw=(BW-240)/cols-16,ch=126;
    if(s.library.length===0) this.text('完成遠征以取得更多聖物',BW/2,gy+70,24,'rgba(200,190,170,0.5)',{align:'center'});
    for(let i=0;i<s.library.length&&i<10;i++){ const id=s.library[i],R=RELICS[id],x=gx+(i%cols)*(cw+16),cy=gy+((i/cols)|0)*(ch+16);
      this.rr(x,cy,cw,ch,10); ctx.fillStyle='rgba(20,14,9,0.92)'; ctx.fill(); ctx.strokeStyle= R.cls==='core'?'#e6c068':R.cls==='feel'?'#6b86e8':'#39ad39'; ctx.lineWidth=2; ctx.stroke();
      this.text(RELIC_CLASS[R.cls],x+12,cy+26,15,'#a2926e'); this.text(R.name,x+12,cy+52,20,'#ece0c4',{weight:'700'}); this.wrap(R.desc,x+cw/2,cy+76,cw-20,18,'#cfc6b0',14,'left');
      // equip: into first empty slot, else prompt replace
      this._sb(x+10,cy+ch-34,(cw-30)/2,26,'裝備',()=>{ const empty=s.relics.indexOf(null); if(empty>=0){ s.relics[empty]=id; s.library.splice(i,1); persist(s); this.audio.sfx('select'); } else { this._replaceTarget={id,from:'library',idx:i}; } });
      this._sb(x+10+(cw-30)/2+10,cy+ch-34,(cw-30)/2,26,'分解',()=>{ s.library.splice(i,1); persist(s); this.audio.sfx('coin'); });
    }
    this.button(70,144,176,74,'← 返回','back',()=>this.go('hub'),{size:22});
    if(this._replaceTarget) this.drawReplace();
  },
  _sb(x,y,w,h,label,cb,o){ o=o||{}; const ctx=this.ctx; this.rr(x,y,w,h,o.r||8); if(o.primary){ const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,'#caa23a'); g.addColorStop(1,'#8a6a1e'); ctx.fillStyle=g; } else { ctx.fillStyle='rgba(70,52,24,0.95)'; } ctx.fill(); ctx.strokeStyle=o.primary?'#e6c068':'rgba(200,155,60,0.45)'; ctx.lineWidth=2; ctx.stroke(); this.text(label,x+w/2,y+h/2,o.size||18,o.primary?'#1a120a':'#ece0c4',{align:'center',baseline:'middle',weight:o.weight||'700'}); this.btn(x,y,w,h,'sb'+label+x+y,cb); },

  // explicit "取代「X」" UI — used both in library equip-when-full and loot
  drawReplace(){ const ctx=this.ctx; const s=this.save; const rt=this._replaceTarget; const R=RELICS[rt.id];
    ctx.fillStyle='rgba(2,1,4,0.82)'; ctx.fillRect(0,0,BW,BH);
    this.text('三格已滿 · 選擇取代哪一件',BW/2,180,40,'#e6c068',{align:'center',weight:'800'});
    // new relic card center-top
    this.panel(BW/2-260,230,520,140,{r:14,stroke:'#e6c068'}); this.text('新聖物：'+R.name,BW/2-236,272,26,'#ece0c4',{weight:'800'}); this.text(RELIC_CLASS[R.cls],BW/2-236,300,18,'#a2926e'); this.wrap(R.desc,BW/2,344,460,22,'#cfc6b0',18);
    const cw=400,gap=40,x0=BW/2-(cw*3+gap*2)/2,y=420;
    for(let i=0;i<3;i++){ const id=s.relics[i],O=RELICS[id],x=x0+i*(cw+gap); this.rr(x,y,cw,300,16); ctx.fillStyle='rgba(28,20,12,0.96)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(200,155,60,0.4)'; ctx.stroke();
      this.text('聖物欄 '+(i+1),x+cw/2,y+40,20,'#a2926e',{align:'center'}); this.text(O?O.name:'（空）',x+cw/2,y+86,26,'#ece0c4',{align:'center',weight:'800'}); if(O){ this.text(RELIC_CLASS[O.cls],x+cw/2,y+114,16,'#a2926e',{align:'center'}); this.wrap(O.desc,x+cw/2,y+150,cw-40,22,'#cfc6b0',17); }
      this.button(x+40,y+300-66,cw-80,52, O?('取代「'+O.name+'」'):'裝入此欄','rep'+i,()=>{ const old=s.relics[i]; s.relics[i]=rt.id;
        if(rt.from==='library'){ s.library.splice(rt.idx,1); } if(rt.from==='loot'){ this._endStats.picked=true; }
        if(old) s.library.push(old); persist(s); this.audio.sfx('select'); this._replaceTarget=null; },{size:20,primary:true}); }
    this.button(BW/2-110,y+330,220,56,'取消','cancel',()=>{ this._replaceTarget=null; },{size:24});
  },

  // loot claim from win screen
  claimLoot(id,how){ const s=this.save; const R=RELICS[id];
    if(how==='dismantle'){ this._endStats.picked=true; persist(s); this.audio.sfx('coin'); return; }
    if(how==='library'){ if(s.library.length>=30){ this.toast('聖物庫已滿','請先分解'); return; } s.library.push(id); this._endStats.picked=true; persist(s); this.audio.sfx('select'); return; }
    // equip
    const empty=s.relics.indexOf(null); if(empty>=0){ s.relics[empty]=id; this._endStats.picked=true; persist(s); this.audio.sfx('select'); }
    else { this._replaceTarget={id,from:'loot'}; }
  },
});
// === part 10 below ===
// ============================================================
// PART 10 — battle render, HUD, modals, end screen
// ============================================================
Object.assign(Game.prototype,{
  drawBattle(){ const ctx=this.ctx; const run=this.run; if(!run){ this.go('hub'); return; }
    ctx.save();
    // camera: zoom about center-bottom, pan y
    const cz=this.cam.zoom; ctx.translate(BW/2,BH); ctx.scale(cz,cz); ctx.translate(-BW/2,-BH+this.cam.y);
    if(run.shake>0&&!this.save.settings.reduceMotion) ctx.translate(rand(-run.shake,run.shake),rand(-run.shake,run.shake));
    this.backdrop(ACTS[run.act-1].key);
    this.drawCourt();
    this.drawHostAndHoop();
    for(const g of run.guards) if(!g.dead) this.drawGuard(g);
    this.drawBattleFx();
    this.drawHeroPlayer();
    this.drawBall(); this.drawAim();
    ctx.restore();
    this.drawFx();
    // off-screen ball indicator
    this.drawBallIndicator();
    // vignette on hurt
    if(run.hitFlash>0){ const a=clamp(run.hitFlash,0,1)*0.5; const g=ctx.createRadialGradient(BW/2,BH/2,BH*0.3,BW/2,BH/2,BW*0.7); g.addColorStop(0,'rgba(196,52,42,0)'); g.addColorStop(1,'rgba(196,52,42,'+a+')'); ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH); }
    this.drawHUD();
    if(run.banner) this.drawBanner();
    if(run.tutorial) this.drawTutorial();
    if(run.modal) this.drawModal();
    if(this._detailOpen) this.drawHeroDetail(); if(this._paused) this.drawPause();
  },
  drawCourt(){ const ctx=this.ctx; const run=this.run; const A=ACTS[run.act-1]; const fy=BH-90;
    ctx.save(); ctx.globalAlpha=0.4; ctx.strokeStyle=A.rune; ctx.lineWidth=3; ctx.shadowBlur=8; ctx.shadowColor=A.rune; ctx.beginPath(); ctx.moveTo(0,fy); ctx.lineTo(BW,fy); ctx.stroke();
    for(let i=0;i<3;i++){ ctx.globalAlpha=0.2; ctx.beginPath(); ctx.ellipse(BW*0.5,fy,280+i*180,56+i*18,0,Math.PI,TAU); ctx.stroke(); } ctx.shadowBlur=0; ctx.restore();
    if(chance(this._fxBudget().ambient)){ const c=run.act===4?'#ff7a3c':run.act===5?'#6fd8ff':A.rune; this.spawn(rand(0,BW),fy-rand(0,200),rand(-8,8),rand(-30,-8),rand(1.3,2.5),rand(1,3),c,{glow:true,g:-6,drag:0.999}); }
  },
  drawHostAndHoop(){ const ctx=this.ctx; const run=this.run; const host=run.host; const H=run.hoop; const A=ACTS[run.act-1];
    // host bean carrying the hoop on a pole
    ctx.save(); ctx.translate(host.x, host.baseY - (host.hop||0));
    this.shadow(0,90,host.boss?150:110,0.3);
    const col=host.boss?'#7a1612':'#3a2c19';
    this._bean(0,0,host.boss?220:150,host.boss?240:170,host.boss?'#9d3b30':'#6a4a6a',{seed:5,lw:9,lean:6});
    // simple face
    ctx.fillStyle='#ffd24a'; ctx.beginPath(); ctx.arc(-30,-40,9,0,TAU); ctx.arc(30,-40,9,0,TAU); ctx.fill(); ctx.fillStyle='#0e0d0c'; ctx.beginPath(); ctx.arc(-30,-38,4,0,TAU); ctx.arc(30,-38,4,0,TAU); ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='#0e0d0c'; ctx.beginPath(); ctx.moveTo(-20,30); ctx.quadraticCurveTo(0,18,20,30); ctx.stroke();
    ctx.restore();
    // pole from host to hoop
    ctx.save(); ctx.strokeStyle='#3a2c19'; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(host.x, host.baseY-(host.hop||0)-60); ctx.lineTo(H.x+H.rimR+18, H.y); ctx.stroke(); ctx.restore();
    // backboard
    const boardX=H.x+H.rimR+8, bt=H.y-H.boardH*0.55;
    this._rough([[boardX,bt],[boardX+H.boardW+10,bt-6],[boardX+H.boardW+14,bt+H.boardH*0.5],[boardX+H.boardW+4,bt+H.boardH],[boardX-4,bt+H.boardH-8],[boardX-2,bt+10]],'#3a3450',{seed:60,wob:3,lw:8});
    ctx.save(); ctx.globalAlpha=0.5+H.glow*0.5; ctx.strokeStyle=A.rune; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(boardX+H.boardW/2+4,H.y-30,12,0,TAU); ctx.stroke(); ctx.restore();
    // portal glow
    const pr=H.rimR+24+Math.sin(this.t*2)*4; const rg=ctx.createRadialGradient(H.x,H.y,8,H.x,H.y,pr*1.7); rg.addColorStop(0,`rgba(255,122,46,${0.5+H.lit*0.4})`); rg.addColorStop(0.6,'rgba(120,40,40,0.2)'); rg.addColorStop(1,'rgba(20,10,10,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(H.x,H.y+6,pr*1.7,0,TAU); ctx.fill();
    // net (sways on score)
    const sway=H.net*Math.sin(this.t*20); ctx.strokeStyle=`rgba(255,200,140,${0.6+H.lit*0.3})`; ctx.lineWidth=3; ctx.lineCap='round';
    for(let i=0;i<=7;i++){ const tt=i/7,x0=H.x-H.rimR+8+tt*(H.rimR*2-16),xb=lerp(x0,H.x,0.55)+Math.sin(this.t*3+i)*4+sway; ctx.beginPath(); ctx.moveTo(x0,H.y); ctx.quadraticCurveTo((x0+xb)/2,H.y+H.netH*0.6,xb,H.y+H.netH); ctx.stroke(); }
    // rim
    ctx.lineWidth=H.rimThick*2+6; ctx.strokeStyle='#15110d'; ctx.beginPath(); ctx.moveTo(H.x-H.rimR,H.y); ctx.lineTo(H.x+H.rimR,H.y); ctx.stroke();
    ctx.lineWidth=H.rimThick*2; ctx.strokeStyle=H.lit>0.3?'#ffe1a0':'#ff7a3c'; ctx.shadowBlur=16+H.glow*22; ctx.shadowColor='#ff7a3c'; ctx.beginPath(); ctx.moveTo(H.x-H.rimR,H.y); ctx.lineTo(H.x+H.rimR,H.y); ctx.stroke(); ctx.shadowBlur=0;
    for(const rx of [H.x-H.rimR,H.x+H.rimR]){ ctx.beginPath(); ctx.arc(rx,H.y,H.rimThick+3,0,TAU); ctx.fillStyle='#ffcaa0'; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); }
    // distance label (tutorial/codex)
    if(run.tutorial||this.save.settings.lowPerf===false&&run.shots<3){ this.text(H.label||'',H.x,H.y-H.boardH*0.55-14,18,'#a2926e',{align:'center'}); }
  },
  drawHeroPlayer(){ const lefty=this.save.settings.lefty; this.drawHero(this.run.heroId, lefty?BW-200:200, BH-92, 0.62, this.run.aiming); },
  drawBall(){ const ctx=this.ctx; const run=this.run; const b=run.ball; if(!b)return; const fc=this._ballColor(run.form);
    if(b.live&&b.trail&&b.trail.length>1&&!this.save.settings.reduceMotion){ const fb=this._fxBudget(); ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
      for(let i=1;i<b.trail.length;i++){ const p0=b.trail[i-1],p1=b.trail[i],t=i/(b.trail.length-1); ctx.globalAlpha=t*(fb.mobile?0.24:0.36); ctx.strokeStyle=fc; ctx.lineWidth=lerp(4,fb.mobile?14:22,t); if(fb.glow){ctx.shadowBlur=18;ctx.shadowColor=fc;} ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.stroke(); }
      ctx.restore(); }
    ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.spin); ctx.shadowBlur=16; ctx.shadowColor=fc;
    const g=ctx.createRadialGradient(-8,-8,4,0,0,b.r); g.addColorStop(0,'#ffce9a'); g.addColorStop(0.55,fc); g.addColorStop(1,'#5a2410'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,b.r,0,TAU); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(20,8,4,0.7)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(0,0,b.r,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-b.r,0); ctx.lineTo(b.r,0); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0,0,b.r*0.4,b.r,0,0,TAU); ctx.stroke();
    ctx.restore();
    if(b.live&&!this.save.settings.reduceMotion&&chance(this._fxBudget().mobile?0.18:0.6)) this.spawn(b.x,b.y,rand(-10,10),rand(-10,10),0.24,rand(2,4),fc,{glow:true});
  },
  _recordPrevTraj(b){ const run=this.run; const G=2600*this._gravMul(),hh=1/60; let vx=b.vx,vy=b.vy,x=b.x,y=b.y; const pts=[]; for(let i=0;i<70;i++){ vy+=G*hh; x+=vx*hh; y+=vy*hh; pts.push([x,y]); if(y>BH-92||x<0||x>BW)break; } run.prevTraj=pts.slice(0,Math.max(2,Math.round(pts.length*0.5))); },
  _getAimPreviewPct(){ const run=this.run; if(!run) return 1; if(run.endless) return 0.6; if(run.speed){ return clamp(1 - (run.speedScore||0)*0.025, 0.5, 1); } const base=[1.0,0.78,0.62,0.50,0.42][clamp(run.act-1,0,4)]; const taper=(run.pi||0)*0.012; const bonus=(run.mods&&run.mods.minPreviewBonus)||0; return clamp(base - taper + bonus, 0.3, 1); },
  drawAim(){ const ctx=this.ctx; const run=this.run; if(!run.aiming)return; const b=run.ball; const _ax=(run.aimStartX!=null?run.aimStartX:b.x), _ay=(run.aimStartY!=null?run.aimStartY:b.y); const dx=_ax-run.aimX,dy=_ay-run.aimY,pull=Math.hypot(dx,dy);
    if(run.prevTraj&&run.prevTraj.length>1){ ctx.save(); ctx.globalAlpha=0.3; ctx.strokeStyle='#c8c8c8'; ctx.lineWidth=2.5; ctx.setLineDash([6,7]); ctx.beginPath(); ctx.moveTo(run.prevTraj[0][0],run.prevTraj[0][1]); for(let _i=1;_i<run.prevTraj.length;_i++)ctx.lineTo(run.prevTraj[_i][0],run.prevTraj[_i][1]); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
    if(pull<60){ this.text('放開取消',b.x,b.y-60,24,'#e6433c',{align:'center'}); return; }
    let maxPull=520; if(this._intfActive('maxPull'))maxPull*=0.85; if(this._intfActive('slowCharge'))maxPull*=1.15; const p=clamp(pull,0,maxPull)/maxPull,power=lerp(820,2650,p),ang=Math.atan2(dy,dx);
    let vx=Math.cos(ang)*power,vy=Math.sin(ang)*power,x=b.x,y=b.y; const G=2600*this._gravMul(),hh=1/60;
    let dots=70+Math.round((run.relicIds.includes('deadeye_sigil')?8:0)); if(run.heroId==='shade'&&run._shadeBonus)dots+=6;
    if(run.relicIds.includes('deadeye_sigil')) dots=Math.round(dots*1.2);
    dots=Math.round(dots*this._getAimPreviewPct());                 // Phase 5-2: aim-preview difficulty curve (visible length only)
    if(this._intfActive('shortTraj')) dots=Math.round(dots*0.5);    // shortTraj stacks
    dots=Math.max(7,dots);                                          // readable minimum
    ctx.save(); let _lx=x,_ly=y; for(let i=0;i<dots;i++){ vy+=G*hh; x+=vx*hh; y+=vy*hh; _lx=x; _ly=y; if(y>BH-92||x<0||x>BW)break; const tt=i/dots; ctx.globalAlpha=(1-tt)*0.9; const r=lerp(8,2,tt); ctx.fillStyle=i%2?'#ffe14d':this._ballColor(run.form); ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); } ctx.globalAlpha=1;
    // Phase 4-5: landing ring at predicted end (hidden by hideLanding)
    if(!this._intfActive('hideLanding')){ const _lc=this._ballColor(run.form); ctx.beginPath(); ctx.arc(_lx,_ly,13,0,TAU); ctx.globalAlpha=0.22; ctx.fillStyle=_lc; ctx.fill(); ctx.globalAlpha=0.95; ctx.lineWidth=3; ctx.strokeStyle=_lc; ctx.stroke(); ctx.globalAlpha=1; }
    ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(_ax,_ay); ctx.lineTo(run.aimX,run.aimY); ctx.stroke();
    // Phase 4-5b: aiming assist (power% + arc type), aiming only
    { const _pp=Math.round(p*100); const _elev=Math.atan2(-Math.sin(ang),Math.abs(Math.cos(ang)))*180/Math.PI; const _arc=_elev<30?'平射':(_elev<55?'標準':'高拋'); const _ap=Math.round(this._getAimPreviewPct()*100); this.text('力道 '+_pp+'%　弧線 '+_arc+'　軌跡 '+_ap+'%', BW/2, BH-70, 26, '#ffe2a8', {align:'center',weight:'800',glow:true}); }
  },
  drawBattleFx(){ const ctx=this.ctx; const run=this.run, fb=this._fxBudget();
    for(let i=run.fx.length-1;i>=0;i--){ const m=run.fx[i]; m.t-=1/60; if(m.t<=0){run.fx.splice(i,1);continue;} const k=clamp(m.t/m.max,0,1);
      if(m.kind==='beam'){ ctx.save(); ctx.lineCap='round'; ctx.globalCompositeOperation='lighter'; if(fb.mobile){ ctx.globalAlpha=k*0.9; ctx.strokeStyle=m.color; ctx.lineWidth=8*k+4; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); ctx.lineTo(m.x2,m.y2); ctx.stroke(); ctx.globalAlpha=k*0.85; ctx.lineWidth=3*k+2; ctx.strokeStyle='#fff3df'; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); ctx.lineTo(m.x2,m.y2); ctx.stroke(); } else { ctx.globalAlpha=k*0.34; ctx.strokeStyle=m.color; ctx.lineWidth=30*k+8; ctx.shadowBlur=28; ctx.shadowColor=m.color; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); ctx.lineTo(m.x2,m.y2); ctx.stroke(); ctx.globalAlpha=k; ctx.lineWidth=8*k+3; ctx.strokeStyle='#fff3df'; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); ctx.lineTo(m.x2,m.y2); ctx.stroke(); ctx.globalAlpha=k*0.95; ctx.lineWidth=13*k+3; ctx.strokeStyle=m.color; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); ctx.lineTo(m.x2,m.y2); ctx.stroke(); } ctx.restore(); }
      else if(m.kind==='arc'){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round'; const layers=fb.mobile?1:3; for(let z=0;z<layers;z++){ ctx.globalAlpha=k*(fb.mobile?0.82:(z===0?0.34:0.82)); ctx.strokeStyle=z===0?'#fff8aa':'#ffe14d'; ctx.lineWidth=fb.mobile?4:(z===0?18:5); if(!fb.mobile){ctx.shadowBlur=z===0?24:14; ctx.shadowColor='#ffe14d';} ctx.beginPath(); ctx.moveTo(m.x1,m.y1); const steps=fb.mobile?3:4; for(let s=1;s<steps;s++){ const t=s/steps, bx=lerp(m.x1,m.x2,t), by=lerp(m.y1,m.y2,t), off=fb.mobile?18:(z===0?18:34); ctx.lineTo(bx+rand(-off,off),by+rand(-off,off)); } ctx.lineTo(m.x2,m.y2); ctx.stroke(); } ctx.restore(); }
      else if(m.kind&&m.kind.indexOf('sig')===0){ this._drawSig(m); } }
    ctx.globalAlpha=1; ctx.shadowBlur=0;
    // projectiles
    for(const p of run.projectiles){ if(p.kind==='axe'){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(this.t*20); ctx.fillStyle='#cdd2da'; ctx.beginPath(); ctx.moveTo(-6,-30-p.big*8); ctx.lineTo(30+p.big*8,-10); ctx.lineTo(0,10); ctx.lineTo(-30-p.big*8,-10); ctx.closePath(); ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); ctx.restore(); }
      else if(p.kind==='arrow'){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(p.vy,p.vx)); ctx.fillStyle='#b9f06a'; if(fb.glow){ctx.shadowBlur=12;ctx.shadowColor='#b9f06a';} ctx.fillRect(-18,-3,36,6); ctx.beginPath(); ctx.moveTo(18,-7); ctx.lineTo(30,0); ctx.lineTo(18,7); ctx.closePath(); ctx.fill(); ctx.shadowBlur=0; ctx.restore(); }
      else if(p.kind==='enemyShot'){ ctx.save(); if(p.trail)for(let k=Math.max(0,p.trail.length-(fb.mobile?5:10));k<p.trail.length;k++){ const tt=k/p.trail.length; ctx.globalAlpha=tt*(fb.mobile?0.28:0.5); ctx.fillStyle='#ff5a2a'; ctx.beginPath(); ctx.arc(p.trail[k][0],p.trail[k][1],4+tt*(fb.mobile?4:7),0,TAU); ctx.fill(); } ctx.globalAlpha=1; if(fb.mobile){ ctx.fillStyle='#ff5a2a'; ctx.beginPath(); ctx.arc(p.x,p.y,13,0,TAU); ctx.fill(); ctx.fillStyle='#ffe6c0'; ctx.beginPath(); ctx.arc(p.x-3,p.y-3,5,0,TAU); ctx.fill(); } else { ctx.shadowBlur=22; ctx.shadowColor='#ff3a1a'; const eg=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,18); eg.addColorStop(0,'#ffe6c0'); eg.addColorStop(0.4,'#ff5a2a'); eg.addColorStop(1,'#7a1810'); ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(p.x,p.y,16,0,TAU); ctx.fill(); } ctx.shadowBlur=0; ctx.restore(); } }
  },
  _sigShape(col,a,build){ const ctx=this.ctx, fb=this._fxBudget(); ctx.save(); ctx.globalAlpha=a; ctx.shadowColor=col; ctx.shadowBlur=fb.mobile?0:24; ctx.fillStyle='#0b0a12'; ctx.beginPath(); build(ctx); ctx.fill(); ctx.shadowBlur=fb.mobile?0:12; ctx.lineWidth=fb.mobile?2.5:3; ctx.strokeStyle=col; ctx.stroke(); ctx.restore(); }
  ,_sigRing(x,y,r,col,a,w){ const ctx=this.ctx, fb=this._fxBudget(); ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle=col; ctx.lineWidth=(w||5)*(fb.mobile?0.75:1); ctx.shadowColor=col; ctx.shadowBlur=fb.mobile?0:18; ctx.beginPath(); ctx.arc(x,y,r*(fb.mobile?0.9:1),0,TAU); ctx.stroke(); ctx.restore(); }
  ,_sigSpark(x,y,n,len,col,a,seed){ const ctx=this.ctx, fb=this._fxBudget(); if(fb.mobile)n=Math.max(3,Math.ceil(n*0.55)); ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle=col; ctx.lineWidth=fb.mobile?2:3; ctx.lineCap='round'; ctx.shadowColor=col; ctx.shadowBlur=fb.mobile?0:12; for(let i=0;i<n;i++){ const ang=i/n*TAU+(seed||0); ctx.beginPath(); ctx.moveTo(x+Math.cos(ang)*len*0.4,y+Math.sin(ang)*len*0.4); ctx.lineTo(x+Math.cos(ang)*len,y+Math.sin(ang)*len); ctx.stroke(); } ctx.restore(); }
  ,_sigFist(x,y,ang,r,a,col){ const ctx=this.ctx; ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
    this._sigShape(col,a,(c)=>{ c.ellipse(0,0,r*0.95,r*0.8,0,0,TAU);
      for(let i=0;i<4;i++){ const kx=r*0.72,ky=-r*0.5+i*r*0.34; c.moveTo(kx+r*0.2,ky); c.arc(kx,ky,r*0.2,0,TAU); }
      c.moveTo(-r*0.9,-r*0.4); c.lineTo(-r*1.7,-r*0.28); c.lineTo(-r*1.7,r*0.28); c.lineTo(-r*0.9,r*0.4); });
    ctx.restore(); }
  ,_sigSpear(x,y,ang,len,a,col){ const ctx=this.ctx; ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
    this._sigShape(col,a,(c)=>{ c.moveTo(0,-len*0.16); c.lineTo(len*0.46,0); c.lineTo(0,len*0.16); c.closePath();
      c.moveTo(-len*0.02,-len*0.05); c.lineTo(-len*1.4,-len*0.045); c.lineTo(-len*1.4,len*0.045); c.lineTo(-len*0.02,len*0.05); });
    ctx.restore(); }
  ,_sigAxe(x,y,rot,len,a,col){ const ctx=this.ctx; ctx.save(); ctx.translate(x,y); ctx.rotate(rot);
    this._sigShape(col,a,(c)=>{ c.moveTo(-len*0.06,0); c.lineTo(-len*0.06,len*1.5); c.lineTo(len*0.06,len*1.5); c.lineTo(len*0.06,0);
      c.moveTo(0,-len*0.1); c.quadraticCurveTo(len*0.95,-len*0.55,len*0.85,len*0.18); c.quadraticCurveTo(len*0.55,len*0.02,0,len*0.22); });
    ctx.restore(); }
  ,_drawSig(m){ const ctx=this.ctx; const p=1-m.t/m.max; const ang=Math.atan2(m.y2-m.y1,m.x2-m.x1); const col=m.col;
    if(m.kind==='sigFist'){ const tp=0.6;
      if(p<tp){ const e=_ez(p/tp); const x=_lp(m.x1,m.x2,e),y=_lp(m.y1,m.y2,e)-Math.sin(p/tp*Math.PI)*60;
        m.trail.push([x,y]); if(m.trail.length>8)m.trail.shift();
        for(let j=0;j<m.trail.length-1;j++) this._sigFist(m.trail[j][0],m.trail[j][1],ang,70*(0.6+0.4*j/m.trail.length),(j/m.trail.length)*0.45,col);
        this._sigFist(x,y,ang,84,1,col);
      } else { const q=(p-tp)/(1-tp); this._sigRing(m.x2,m.y2,50+q*260,col,(1-q)*0.9,8); this._sigRing(m.x2,m.y2,30+q*180,'#fff3df',(1-q)*0.7,4); this._sigSpark(m.x2,m.y2,11,60+q*200,col,(1-q),m.seed); if(q<0.4)this._sigFist(m.x2,m.y2,ang,90*(1-q),(1-q*2),'#fff3df'); }
    }
    else if(m.kind==='sigSpears'){ const angs=[-0.17,0,0.18], dl=[0,0.12,0.24]; const D=Math.hypot(m.x2-m.x1,m.y2-m.y1)*1.05;
      for(let i=0;i<3;i++){ const t=p-dl[i]; if(t<0)continue; const pp=Math.min(t/0.5,1); const e=_ez(pp);
        const a2=ang+angs[i]; const d=D*e; const x=m.x1+Math.cos(a2)*d, y=m.y1+Math.sin(a2)*d;
        ctx.save(); ctx.globalAlpha=(1-pp)*0.5+0.2; ctx.strokeStyle=col; ctx.lineWidth=3; ctx.lineCap='round'; ctx.shadowColor=col; ctx.shadowBlur=12; ctx.beginPath(); ctx.moveTo(x-Math.cos(a2)*160,y-Math.sin(a2)*160); ctx.lineTo(x,y); ctx.stroke(); ctx.restore();
        if(pp<1) this._sigSpear(x,y,a2,95,1,col); else this._sigSpark(x,y,6,46,col,(1-Math.min((t-0.5)/0.3,1))*0.8,m.seed+i); }
    }
    else if(m.kind==='sigAxe'){ const cx=(m.x1+m.x2)/2, cy=Math.min(m.y1,m.y2)-180, R=Math.max(240,Math.hypot(m.x2-m.x1,m.y2-m.y1)*0.6); const tp=0.55; const a0=-Math.PI*0.92, a1=Math.atan2(m.y2-cy,m.x2-cx);
      if(p<tp){ const e=_ez(p/tp); const aa=_lp(a0,a1,e);
        ctx.save(); ctx.globalAlpha=0.5; ctx.strokeStyle=col; ctx.lineWidth=46; ctx.lineCap='round'; ctx.shadowColor=col; ctx.shadowBlur=24; ctx.beginPath(); ctx.arc(cx,cy,R,Math.max(a0,aa-1.1),aa); ctx.stroke(); ctx.restore();
        const ax=cx+Math.cos(aa)*R, ay=cy+Math.sin(aa)*R; this._sigAxe(ax,ay,aa+1.6,120,1,col);
      } else { const q=(p-tp)/(1-tp); this._sigSpark(m.x2,m.y2,9,80+q*130,col,(1-q)*0.85,m.seed); this._sigRing(m.x2,m.y2,40+q*180,col,(1-q)*0.7,6); }
    }
    else if(m.kind==='sigDash'){ const N=5;
      for(let i=0;i<N;i++){ const t=p-i*0.06; if(t<0)continue; const pp=Math.min(t/0.5,1); const e=_ez(pp);
        const x=_lp(m.x1,m.x2,e), y=_lp(m.y1,m.y2,e); const a=(1-pp)*0.5*(1-i/N)+0.05;
        ctx.save(); ctx.globalAlpha=a; ctx.shadowColor=col; ctx.shadowBlur=18; ctx.fillStyle='#0a0a14'; const r=58; ctx.beginPath(); ctx.ellipse(x,y,r*0.8,r,0,0,TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x,y-r,r*0.55,r*0.58,0,0,TAU); ctx.fill(); ctx.lineWidth=2.4; ctx.strokeStyle=col; ctx.shadowBlur=10; ctx.stroke(); ctx.restore(); }
      if(p>0.55){ const q=(p-0.55)/0.45; this._sigRing(m.x2,m.y2,30+q*130,col,(1-q)*0.8,4); this._sigSpark(m.x2,m.y2,8,50+q*90,'#fff3df',(1-q)*0.8,m.seed); }
    }
    else if(m.kind==='sigElem'){ const cols=['#ff7a3c','#6fd8ff','#ffe14d'];
      for(let i=0;i<3;i++){ const t=p-i*0.07; if(t<0)continue; const pp=Math.min(t/0.6,1); const e=_ez(pp);
        const base=i/3*TAU+m.seed; const sp=base+(1-e)*5; const rad=(1-e)*140;
        const x=_lp(m.x1,m.x2,e)+Math.cos(sp)*rad, y=_lp(m.y1,m.y2,e)+Math.sin(sp)*rad;
        if(pp<1){ ctx.save(); ctx.fillStyle=cols[i]; ctx.shadowColor=cols[i]; ctx.shadowBlur=24; ctx.beginPath(); ctx.arc(x,y,26,0,TAU); ctx.fill(); ctx.restore(); }
        else { const q=Math.min((t-0.6)/0.3,1); this._sigRing(m.x2,m.y2,30+q*160,cols[i],(1-q)*0.7,5); } }
    }
    else if(m.kind==='sigClaw'){ const cx=m.x2, cy=m.y2;
      for(let i=0;i<3;i++){ const t=p-i*0.06; if(t<0)continue; const pp=Math.min(t/0.32,1); const e=_ez(pp); const off=(i-1)*70;
        const x1=cx-160,y1=cy-160+off, x2=cx+160,y2=cy+160+off; const xx=_lp(x1,x2,e),yy=_lp(y1,y2,e);
        ctx.save(); ctx.globalAlpha=pp<1?0.95:(1-Math.min((t-0.32)/0.4,1))*0.95; ctx.strokeStyle=col; ctx.lineWidth=15; ctx.lineCap='round'; ctx.shadowColor=col; ctx.shadowBlur=16; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(xx,yy); ctx.stroke(); ctx.restore(); }
    }
    else if(m.kind==='sigBone'){ const cx=m.x2,cy=m.y2,N=8;
      for(let i=0;i<N;i++){ const a2=i/N*TAU+0.3+m.seed; const pp=Math.min(p/0.6,1); const e=_ez(pp); const d=(180+(i%3)*45)*e;
        const x=cx+Math.cos(a2)*d, y=cy+Math.sin(a2)*d+e*e*120; const a=1-p;
        ctx.save(); ctx.translate(x,y); ctx.rotate(a2+p*5);
        this._sigShape(col,a,(c)=>{ const l=52; c.moveTo(0,-l); c.lineTo(l*0.22,0); c.lineTo(0,l); c.lineTo(-l*0.22,0); });
        ctx.restore(); }
      if(p<0.4) this._sigRing(cx,cy,30+p*200,col,(1-p*2.5),5);
    }
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }
  ,drawBallIndicator(){ const ctx=this.ctx; const run=this.run; const b=run.ball; if(!b||!b.live)return;
    // ball position in screen space (after cam): approximate using cam transform
    const sy=(b.y-this.cam.y); if(sy>-20)return; // only when above view top
    const sx=clamp(b.x,40,BW-40); ctx.save(); ctx.fillStyle='#ffd24a'; ctx.beginPath(); ctx.moveTo(sx,30); ctx.lineTo(sx-16,60); ctx.lineTo(sx+16,60); ctx.closePath(); ctx.fill(); ctx.restore();
  },

  drawHUD(){ const ctx=this.ctx; const run=this.run;
    const IL=this.insL||0, IR=this.insR||0, IT=this.insT||0, IB=this.insB||0;
    const hero=HEROES.find(h=>h.id===run.heroId)||{name:'英雄',col:'#e6c068'};
    // ===== top-left: integrated hero panel =====
    const px=IL+24, py=IT+22, pw=486, ph=152;
    ctx.save(); { const _hudS=1.28; ctx.translate(px,py); ctx.scale(_hudS,_hudS); ctx.translate(-px,-py); }
    this.panel(px,py,pw,ph,{r:18,c0:'rgba(20,14,9,0.84)',c1:'rgba(10,7,4,0.9)'});
    // portrait medallion (reuse drawHero, clipped to circle)
    const ax=px+70, ay=py+76, ar=52;
    ctx.save(); ctx.beginPath(); ctx.arc(ax,ay,ar,0,TAU); ctx.clip();
    const pg=ctx.createRadialGradient(ax,ay-12,6,ax,ay,ar*1.5); pg.addColorStop(0,this._fade(hero.col,0.55)); pg.addColorStop(1,'rgba(8,6,4,0.95)'); ctx.fillStyle=pg; ctx.fillRect(ax-ar,ay-ar,ar*2,ar*2);
    try{ this.drawHero(run.heroId, ax, ay+ar*2.1, 0.52); }catch(e){}
    ctx.restore();
    ctx.lineWidth=4; ctx.strokeStyle=hero.col; ctx.shadowBlur=10; ctx.shadowColor=hero.col; ctx.beginPath(); ctx.arc(ax,ay,ar,0,TAU); ctx.stroke(); ctx.shadowBlur=0;
    // name + level
    const cx0=px+138, cw=pw-138-24;
    this.text(this._clip(hero.name,cw-72,30,'800'),cx0,py+44,30,'#ece0c4',{weight:'800'});
    this.text('Lv'+run.level,px+pw-24,py+42,20,'#e6c068',{align:'right',weight:'700'});
    // hp bar (enlarged + number)
    const bx=cx0, bw=cw, hy=py+58;
    ctx.fillStyle='rgba(0,0,0,0.5)'; this.rr(bx,hy,bw,26,8); ctx.fill(); ctx.fillStyle='#c4342a'; this.rr(bx,hy,bw*clamp(run.hp/run.maxhp,0,1),26,8); ctx.fill();
    this.text(Math.max(0,Math.round(run.hp))+' / '+run.maxhp,bx+bw/2,hy+19,18,'#fff',{align:'center',weight:'800'});
    let yy=hy+34;
    if(run.shield>0){ ctx.fillStyle='rgba(0,0,0,0.5)'; this.rr(bx,yy,bw,17,6); ctx.fill(); ctx.fillStyle='#6fae4a'; this.rr(bx,yy,bw*clamp(run.shield/30,0,1),17,6); ctx.fill(); this.text('護盾 '+Math.round(run.shield),bx+bw/2,yy+13,13,'#0a2014',{align:'center',weight:'800'}); yy+=23; }
    // xp bar (number)
    ctx.fillStyle='rgba(0,0,0,0.5)'; this.rr(bx,yy,bw,17,6); ctx.fill(); ctx.fillStyle='#6b86e8'; this.rr(bx,yy,bw*clamp(run.xp/run.xpNext,0,1),17,6); ctx.fill();
    this.text('經驗 '+Math.round(run.xp)+' / '+run.xpNext,bx+bw/2,yy+13,12,'#eef0ff',{align:'center',weight:'800'});
    ctx.restore();
    // 暫停鍵 + 詳細資訊鍵（角色卡下方）
    { const pb=84, pbx=IL+24, pby=IT+22+Math.round(152*1.28)+12;
      this.panel(pbx,pby,pb,pb,{r:16}); this.text('II',pbx+pb/2,pby+pb/2+2,32,'#ece0c4',{align:'center',baseline:'middle',weight:'800'}); this._pauseHit={x:pbx,y:pby,w:pb,h:pb};
      const dbx=pbx+pb+12, dbw=px+Math.round(pw*1.28)-dbx, dbh=pb;
      this.rr(dbx,pby,dbw,dbh,16); ctx.fillStyle='rgba(230,192,104,0.16)'; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle='#e6c068'; ctx.shadowBlur=8; ctx.shadowColor='rgba(230,192,104,0.4)'; ctx.stroke(); ctx.shadowBlur=0;
      this.text('\u2295 詳細資訊', dbx+dbw/2, pby+dbh/2+2, 26, '#e6c068', {align:'center',baseline:'middle',weight:'800'});
      this.btn(dbx,pby,dbw,dbh,'herodetail',()=>{ this._detailOpen=true; this.audio.sfx('ui'); this.render(); }); this._detailHit={x:dbx,y:pby,w:dbw,h:dbh}; }
    // ===== top-center: stage bar =====
    const sw=560, sx=BW/2-sw/2, syy=IT+18, sh=92;
    this.panel(sx,syy,sw,sh,{r:16,c0:'rgba(18,12,8,0.82)',c1:'rgba(10,7,4,0.88)'});
    const A=ACTS[run.act-1]; const boss=!!run.stage.boss;
    this.text(A.name,BW/2,syy+30,18,A.rune,{align:'center',weight:'700'});
    this.text(this._clip(run.stage.name,sw-60,30,'800'),BW/2,syy+58,30,boss?'#ff6a4a':'#ece0c4',{align:'center',weight:'800',glow:boss?8:0});
    const waves=boss?(run.stage.waves||3):1, curW=boss?Math.min(run.bossWave+1,waves):1;
    const rem=run.guards.length+(run.guardsTotal-run.spawned);
    this.text('第 '+curW+'/'+waves+' 波　·　剩餘護衛 '+rem+'/'+run.guardsTotal,BW/2,syy+82,18,'#e6c068',{align:'center'});
    // combo (transient, single focused element below stage bar)
    if(run.combo>1){ const cc=run.combo>=10?'#ff5a2a':run.combo>=5?'#ffe14d':'#e08a32'; this.text('連擊 x'+run.combo,BW/2,syy+sh+34,30,cc,{align:'center',weight:'800',glow:run.combo>=5?12:0}); }
    // ===== 暫停鍵已移至角色卡左下方 =====
    // ===== bottom: minimal — ball form + reserved next-hoop-behavior =====
    const by2=BH-IB-26;
    this.text('進球後框位：'+((run.nextHoopAct&&run.nextHoopAct.label)||'—'),BW-IR-30,by2,20,'#8c7a5c',{align:'right',weight:'700'});
  },
  drawBanner(){ const run=this.run,ctx=this.ctx,b=run.banner; ctx.globalAlpha=clamp(b.t,0,1); this.text(b.text,BW/2,BH*0.3,54,'#ece0c4',{align:'center',weight:'800',glow:14}); if(b.sub)this.text(b.sub,BW/2,BH*0.3+50,30,b.sub.indexOf('BOSS')>=0?'#c4342a':'#e6c068',{align:'center',weight:'700'}); ctx.globalAlpha=1; },
  drawTutorial(){ const run=this.run,ctx=this.ctx; const lefty=this.save.settings.lefty,bx=lefty?BW-200:200,by=BH-168; let msg=''; const st=run.tutStep||0;
    if(st===0)msg='① 按住籃球'; else if(st===1)msg='② 向後拖曳調整角度與力量'; else if(st===2)msg='② 放手投出'; else if(st===3)msg='③ 進球會從籃框攻擊小怪！'; else return;
    if(st<=1){ ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=3; ctx.setLineDash([10,8]); ctx.beginPath(); ctx.arc(bx,by,90+Math.sin(this.t*4)*6,0,TAU); ctx.stroke(); ctx.setLineDash([]); }
    this.text(msg,BW/2,BH*0.7,38,'#fff',{align:'center',weight:'800',glow:12});
  },

  drawModal(){ const ctx=this.ctx; const run=this.run; const m=run.modal; ctx.fillStyle='rgba(3,2,4,0.82)'; ctx.fillRect(0,0,BW,BH);
    if(m.kind==='form'){ this.text('選擇球形態',BW/2,150,52,'#ece0c4',{align:'center',weight:'800'}); this.text('第一次升級 · 決定你的攻擊流派',BW/2,196,22,'#a2926e',{align:'center'});
      const cw=320,gap=28,total=m.choices.length*cw+(m.choices.length-1)*gap,x0=BW/2-total/2,y=260;
      for(let i=0;i<m.choices.length;i++){ const f=BALL_FORMS[m.choices[i]],x=x0+i*(cw+gap); this.rr(x,y,cw,440,16); ctx.fillStyle='rgba(28,20,12,0.97)'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=f.color; ctx.shadowBlur=14; ctx.shadowColor=f.color; ctx.stroke(); ctx.shadowBlur=0;
        ctx.save(); ctx.translate(x+cw/2,y+150); ctx.shadowBlur=20; ctx.shadowColor=f.color; ctx.fillStyle=f.color; this._formIcon(m.choices[i],56); ctx.restore();
        this.text(f.name,x+cw/2,y+250,34,'#ece0c4',{align:'center',weight:'800'}); this.text(f.en,x+cw/2,y+280,16,f.color,{align:'center'}); this.wrap(f.desc,x+cw/2,y+326,cw-50,26,'#cfc6b0',20);
        this.btn(x,y,cw,440,'f'+i,()=>this.chooseForm(m.choices[i])); }
      // normal option
      this.button(BW/2-220,y+460,440,64,'維持老派皮球（拒絕轉化）','keep',()=>this.chooseForm('normal'),{size:24});
    } else if(m.kind==='ability'){ this.text('球途盤 · 三選一',BW/2,150,52,'#ece0c4',{align:'center',weight:'800'}); this.text('Lv'+run.level+' 升級',BW/2,196,22,'#e6c068',{align:'center'});
      const cw=380,gap=40,total=m.choices.length*cw+(m.choices.length-1)*gap,x0=BW/2-total/2,y=250;
      const tc={element:'#ff7a3c',weapon:'#cdd2da',sharp:'#e6c068'};
      for(let i=0;i<m.choices.length;i++){ const a=m.choices[i],x=x0+i*(cw+gap),lv=run.abilities[a.id]||0,col=tc[a.tree]; this.rr(x,y,cw,420,18); const g=ctx.createLinearGradient(0,y,0,y+420); g.addColorStop(0,'rgba(30,22,14,0.97)'); g.addColorStop(1,'rgba(18,12,8,0.98)'); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=col; ctx.shadowBlur=14; ctx.shadowColor=col; ctx.stroke(); ctx.shadowBlur=0;
        this.text(TREE_NAME[a.tree],x+cw/2,y+56,20,col,{align:'center',weight:'700'}); this.text(a.name,x+cw/2,y+150,40,'#ece0c4',{align:'center',weight:'800'}); this.wrap(a.desc(lv+1),x+cw/2,y+230,cw-50,28,'#cfc6b0',24); this.text(lv>0?`Lv${lv} → Lv${lv+1}`:'新能力',x+cw/2,y+420-40,22,lv>0?'#6fae4a':'#e6c068',{align:'center',weight:'700'});
        this.btn(x,y,cw,420,'ab'+i,()=>this.chooseAbility(a)); }
      if(m.reroll>0) this.button(BW/2-150,y+440,300,56,'重抽 ('+m.reroll+')','rr',()=>this.rerollAbility(),{size:24});
    } else if(m.kind==='upgrade'){ this.text('升級 · 三選一',BW/2,150,52,'#ece0c4',{align:'center',weight:'800'}); this.text('Lv'+run.level+'　·　共用成長',BW/2,196,22,'#e6c068',{align:'center'});
      const TC={'生存':'#39ad39','投籃':'#6b86e8','攻擊':'#e0853c','經濟':'#d7a945'};
      const cw=380,gap=40,total=m.choices.length*cw+(m.choices.length-1)*gap,x0=BW/2-total/2,y=250;
      for(let i=0;i<m.choices.length;i++){ const def=UPMAP[m.choices[i]]; if(!def)continue; const x=x0+i*(cw+gap),col=TC[def.type]||'#e6c068',lv=def.instant?0:(run.modStacks[def.id]||0);
        this.rr(x,y,cw,420,18); const g=ctx.createLinearGradient(0,y,0,y+420); g.addColorStop(0,'rgba(30,22,14,0.97)'); g.addColorStop(1,'rgba(18,12,8,0.98)'); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=col; ctx.shadowBlur=14; ctx.shadowColor=col; ctx.stroke(); ctx.shadowBlur=0;
        this.text(def.type,x+cw/2,y+56,20,col,{align:'center',weight:'700'}); this.text(def.name,x+cw/2,y+150,38,'#ece0c4',{align:'center',weight:'800'}); this.wrap(def.desc,x+cw/2,y+230,cw-50,28,'#cfc6b0',24);
        this.text(def.instant?'立即生效':(lv>0?('Lv'+lv+' → Lv'+(lv+1)):'新成長'),x+cw/2,y+420-40,22,lv>0?'#6fae4a':'#e6c068',{align:'center',weight:'700'});
        ((id)=>{ this.btn(x,y,cw,420,'up'+i,()=>this.chooseUpgrade(id)); })(m.choices[i]); }
      if(m.reroll>0) this.button(BW/2-150,y+440,300,56,'重抽 ('+m.reroll+')','rru',()=>this.rerollUpgrade(),{size:24});
    }
  },
  _formIcon(f,s){ const ctx=this.ctx; ctx.beginPath();
    if(f==='fire'){ for(let i=0;i<8;i++){ const a=i/8*TAU,r=i%2?s:s*0.5; ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r-10);} ctx.closePath(); ctx.fill(); }
    else if(f==='ice'){ for(let i=0;i<6;i++){ const a=i/6*TAU; ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*s,Math.sin(a)*s);} ctx.lineWidth=6; ctx.strokeStyle=ctx.fillStyle; ctx.stroke(); }
    else if(f==='lightning'){ ctx.moveTo(-s*0.3,-s); ctx.lineTo(s*0.2,-s*0.2); ctx.lineTo(-s*0.1,-s*0.2); ctx.lineTo(s*0.3,s); ctx.lineTo(-s*0.2,s*0.1); ctx.lineTo(s*0.1,s*0.1); ctx.closePath(); ctx.fill(); }
    else if(f==='axe'){ ctx.moveTo(-6,-s); ctx.lineTo(s,-s*0.3); ctx.lineTo(0,s*0.3); ctx.lineTo(-s,-s*0.3); ctx.closePath(); ctx.fill(); }
    else if(f==='arrow'){ ctx.fillRect(-s*0.7,-4,s*1.4,8); ctx.beginPath(); ctx.moveTo(s*0.6,-14); ctx.lineTo(s,0); ctx.lineTo(s*0.6,14); ctx.closePath(); ctx.fill(); }
    else { ctx.arc(0,0,s*0.8,0,TAU); ctx.fill(); }
  },
  drawPause(){ const ctx=this.ctx; ctx.fillStyle='rgba(3,2,4,0.86)'; ctx.fillRect(0,0,BW,BH); const IT=this.insT||0; this.text('暫停',BW/2,IT+218,84,'#ece0c4',{align:'center',weight:'800',glow:14});
    const bw=560,bh=104,gap=26,x=BW/2-bw/2; let y=IT+318;
    this.button(x,y,bw,bh,'繼續','res',()=>{ this._paused=false; },{primary:true,size:42}); y+=bh+gap;
    this.button(x,y,bw,bh,'放棄遠征','quit',()=>{ this.confirm('放棄本次遠征返回板凳席？',()=>{ this._paused=false; this.run=null; this.screen='hub'; }); },{size:38}); y+=bh+gap;
    const st=this.save.settings,tw=(bw-20)/2;
    this.button(x,y,tw,92,st.music?'音樂 開':'音樂 關','pm',()=>{ st.music=!st.music; this.audio.setMusic(st.music); persist(this.save); },{size:32});
    this.button(x+tw+20,y,tw,92,st.sfx?'音效 開':'音效 關','ps',()=>{ st.sfx=!st.sfx; this.audio.setSfx(st.sfx); persist(this.save); },{size:32});
  },
  _closeDetail(){ this._detailOpen=false; this._detailIntf=null; this._peek=null; this._peekFromChip=false; this.audio.sfx('ui'); this.render(); },
  _chipAt(x,y){ const a=this._detailChips||[]; for(let i=a.length-1;i>=0;i--){ const c=a[i]; if(x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h) return c; } return null; },
  _buffSummary(){ const run=this.run, st=run.modStacks||{};
    const CAT={ power:'atk',sweep:'atk',reap:'atk',chainb:'atk',swishhunt:'atk',bankwave:'atk',luckyfin:'atk',
      ench_lt:'ele',ench_fr:'ele',ench_ic:'ele',
      swishzeal:'shot',bankfaith:'shot',luckydisc:'shot',nearfocus:'shot',farfocus:'shot',combo:'shot',memory:'shot',
      ironhide:'surv',entrysh:'surv',regen:'surv',missbuf:'surv',learner:'surv' };
    const NUM={ power:s=>'+'+Math.round(s*12)+'%', sweep:s=>'+'+s+' 擊', reap:s=>'殘血+'+Math.round(s*20)+'%', chainb:s=>Math.round(Math.min(60,s*20))+'% 彈',
      swishhunt:s=>'空心+'+s, bankwave:s=>'AoE×'+s, luckyfin:s=>'補刀×'+s,
      ench_lt:s=>'鏈 '+(1+s), ench_fr:s=>'燒 '+(4*s)+'/s', ench_ic:s=>'凍 '+(1+s),
      swishzeal:s=>'空心+'+Math.round(s*12)+'%', bankfaith:s=>'擦板+'+Math.round(s*12)+'%', luckydisc:s=>'幸運+'+Math.round(s*12)+'%',
      nearfocus:s=>'近框+'+Math.round(s*12)+'%', farfocus:s=>'遠框+'+Math.round(s*12)+'%', combo:s=>'連+5%/層', memory:s=>'預測+'+Math.round(s*5)+'%',
      ironhide:s=>'-'+Math.round(Math.min(45,s*8))+'%', entrysh:s=>'+'+(s*10)+' 盾', regen:s=>'回'+Math.round(s*4)+'%', missbuf:s=>'失誤+'+(s*5)+'盾', learner:s=>'XP+'+Math.round(s*10)+'%' };
    const DESC={ power:s=>'每次進球：投籃傷害 +'+Math.round(s*12)+'%（通用，所有英雄生效）', sweep:s=>'每次進球額外波及最近 '+s+' 名怪',
      reap:s=>'對殘血怪造成的傷害 +'+Math.round(s*20)+'%', chainb:s=>Math.round(Math.min(60,s*20))+'% 機率額外彈打 1 名怪',
      swishhunt:s=>'空心進球時額外打 '+s+' 名怪', bankwave:s=>'擦板進球追加範圍傷害 ×'+s, luckyfin:s=>'幸運進球追加補刀 ×'+s,
      ench_lt:s=>'進球後閃電鏈擊最近 '+(1+s)+' 隻，每隻 10 傷害', ench_fr:s=>'進球後使命中的怪燃燒，每秒 '+(4*s)+' 傷害（持續 3 秒）', ench_ic:s=>'進球後對最近 '+(1+s)+' 隻追加冰傷並凍結 1.5 秒',
      swishzeal:s=>'空心進球傷害 +'+Math.round(s*12)+'%', bankfaith:s=>'擦板進球傷害 +'+Math.round(s*12)+'%', luckydisc:s=>'幸運進球傷害 +'+Math.round(s*12)+'%',
      nearfocus:s=>'近框／貼框進球傷害 +'+Math.round(s*12)+'%', farfocus:s=>'遠框進球傷害 +'+Math.round(s*12)+'%', combo:s=>'連續進球每層 +5% 傷害（最多 5 層）', memory:s=>'投籃軌跡預測長度 +'+Math.round(s*5)+'%',
      ironhide:s=>'受到傷害 -'+Math.round(Math.min(45,s*8))+'%', entrysh:s=>'每關開始時 +'+(s*10)+' 護盾', regen:s=>'每關開始回復 '+Math.round(s*4)+'% 生命', missbuf:s=>'投失時 +'+(s*5)+' 護盾', learner:s=>'獲得經驗值 +'+Math.round(s*10)+'%' };
    const out={atk:[],ele:[],shot:[],surv:[]};
    for(const u of COMMON_UPGRADES){ const s=st[u.id]||0; if(s<=0)continue; const cat=CAT[u.id]; if(!cat)continue; out[cat].push({name:u.name,stk:s,num:NUM[u.id]?NUM[u.id](s):'',desc:DESC[u.id]?DESC[u.id](s):u.desc}); }
    return out; },
  drawHeroDetail(){ const ctx=this.ctx,run=this.run; if(!run)return; const IT=this.insT||0,IL=this.insL||0,IR=this.insR||0,IB=this.insB||0;
    ctx.fillStyle='rgba(6,4,9,0.93)'; ctx.fillRect(0,0,BW,BH);
    const hero=HEROES.find(h=>h.id===run.heroId)||{name:'英雄',col:'#e6c068',role:'',passive:''};
    const mx=IL+28, my=IT+16, mw=BW-IL-IR-56, pad=28, ix=mx+pad, iw=mw-pad*2;
    const sy=my+92, sh=152;
    // ===== build groups =====
    const sum=this._buffSummary(); const groups=[];
    const push=(title,col,items)=>{ if(items.length) groups.push({title,col,items}); };
    const bcat=(arr,col,cn)=>arr.map(it=>({label:it.name+(it.num?(' '+it.num):''), peek:{title:it.name+(it.stk>1?' ×'+it.stk:''),sub:cn,lines:[it.desc],col}}));
    push('攻擊加成','#ffb878',bcat(sum.atk,'#ffb878','攻擊加成'));
    push('元素附魔','#ffe14d',bcat(sum.ele,'#ffe14d','元素附魔'));
    push('投籃手感','#bcd6ff',bcat(sum.shot,'#bcd6ff','投籃手感'));
    push('生存加成','#a7e08a',bcat(sum.surv,'#a7e08a','生存加成'));
    { const lo=run.loadout||[]; const arr=[]; for(const id of lo){ if(!id)continue; const R=RELICS[id]; if(!R)continue; const meta=this._relicMeta(id); const col=this._clsCol(R.cls); arr.push({label:R.name, peek:{title:R.name,sub:(QUAL_NAME[meta.tier]||'')+' · 強度 '+meta.q+'/50',lines:(meta.affixes||[]).map(a=>'\u25c6 '+a.label+' +'+(a.pct?Math.round(a.val*100)+'%':a.val)).concat(R.desc?['— '+R.desc]:[]),col}}); } push('聖物攜帶','#e6c068',arr); }
    { const kinds=[],seen={}; run.intf.forEach(i=>{if(!seen[i.kind]){seen[i.kind]=1;kinds.push(i.kind);}}); run.guards.forEach(g=>{if(g.intf&&!seen[g.intf]){seen[g.intf]=1;kinds.push(g.intf);}}); const arr=kinds.filter(k=>INTERFERENCES[k]).map(k=>{const d=INTERFERENCES[k]; const act=run.intf.filter(i=>i.kind===k).reduce((a,b)=>a+b.shots,0); return {label:(d.icon||'')+' '+d.name, peek:{title:d.name,sub:'本場干擾',lines:[d.desc,act>0?('生效中 · 剩 '+act+' 球'):'本關小怪可施放'],col:'#e0726a'}};}); push('本場干擾','#e0726a',arr); }
    // ===== layout pass =====
    const chipH=64, cg=12, rg=22, labelSize=27, chipFont=27;
    this._detailChips=[]; const gl=[]; let y=sy+sh+24;
    for(const G of groups){ ctx.font='800 '+labelSize+'px Georgia,serif'; const lw=ctx.measureText(G.title).width+28;
      let chipX=ix+lw, chipY=y, rowMax=ix+iw, used=false; const chips=[];
      for(const it of G.items){ ctx.font='700 '+chipFont+'px Georgia,serif'; const w=Math.min(iw, ctx.measureText(it.label).width+44);
        if(used && chipX+w>rowMax){ chipX=ix+lw; chipY+=chipH+cg; }
        chips.push({x:chipX,y:chipY,w,h:chipH,label:it.label,col:G.col,peek:it.peek}); chipX+=w+cg; used=true; }
      gl.push({title:G.title,col:G.col,lx:ix,ly:y+chipH/2,chips}); y=chipY+chipH+rg; }
    let mh=(y-my)+8; const maxMH=BH-IT-IB-24; if(mh>maxMH)mh=maxMH; if(mh<sy+sh+60-my) mh=sy+sh+60-my;
    // ===== draw =====
    this.panel(mx,my,mw,mh,{r:20,c0:'rgba(16,11,18,0.97)',c1:'rgba(8,5,10,0.99)'});
    this.text('英雄詳細資訊',mx+34,my+58,42,'#e6c068',{weight:'800',glow:10});
    { const cs=70,cxx=mx+mw-cs-22,cyy=my+16; this.rr(cxx,cyy,cs,cs,14); ctx.fillStyle='rgba(70,34,30,0.7)'; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle='#c46850'; ctx.stroke(); this.text('\u2715',cxx+cs/2,cyy+cs/2+2,40,'#f0c0b0',{align:'center',baseline:'middle',weight:'800'}); }
    // hero strip
    this.rr(ix,sy,iw,sh,16); ctx.fillStyle='rgba(30,22,12,0.6)'; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(120,90,60,0.4)'; ctx.stroke();
    const ar=60, ax=ix+36+ar, ay=sy+sh/2;
    ctx.save(); ctx.beginPath(); ctx.arc(ax,ay,ar,0,TAU); ctx.clip(); const pg=ctx.createRadialGradient(ax,ay-12,6,ax,ay,ar*1.5); pg.addColorStop(0,this._fade(hero.col,0.55)); pg.addColorStop(1,'rgba(8,6,4,0.95)'); ctx.fillStyle=pg; ctx.fillRect(ax-ar,ay-ar,ar*2,ar*2); try{this.drawHero(run.heroId,ax,ay+ar*2.1,0.6);}catch(e){} ctx.restore();
    ctx.lineWidth=3.5; ctx.strokeStyle=hero.col; ctx.beginPath(); ctx.arc(ax,ay,ar,0,TAU); ctx.stroke();
    const F=BALL_FORMS[run.form]; const fw=352,fh=66,fx=ix+iw-fw-26,fy=sy+sh/2-fh/2; const htx=ax+ar+32;
    this.text(this._clip(hero.name,(fx-htx)-26,44,'800'),htx,sy+64,44,'#ece0c4',{weight:'800'});
    this.text(this._clip('Lv '+run.level+'\u3000'+(hero.role||'')+(hero.passive?('\u3000\u00b7\u3000'+hero.passive):''),(fx-htx)-26,27,'600'),htx,sy+110,27,'#b6a98c',{weight:'600'});
    this.rr(fx,fy,fw,fh,14); ctx.fillStyle=this._fade(F.color,0.16); ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle=this._fade(F.color,0.7); ctx.stroke(); this.text('球形態 '+F.name,fx+fw/2,fy+fh/2+2,29,F.color,{align:'center',baseline:'middle',weight:'800'});
    this._detailChips.push({x:fx,y:fy,w:fw,h:fh,peek:{title:F.name,sub:'球形態'+(F.en?(' · '+F.en):''),lines:['進球攻擊：'+F.desc],col:F.color}});
    // groups (labels + chips)
    for(const g of gl){ this.text(g.title,g.lx,g.ly,labelSize,g.col,{weight:'800',baseline:'middle'});
      for(const c of g.chips){ this.rr(c.x,c.y,c.w,c.h,12); ctx.fillStyle='rgba(42,31,18,0.88)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=this._fade(c.col,0.6); ctx.stroke(); this.text(this._clip(c.label,c.w-22,chipFont,'700'),c.x+c.w/2,c.y+c.h/2+2,chipFont,'#f3ead2',{align:'center',baseline:'middle',weight:'700'}); this._detailChips.push({x:c.x,y:c.y,w:c.w,h:c.h,peek:c.peek}); } }
    this.text('按住晶片看詳情 \u00b7 點空白處或 \u2715 關閉',mx+mw/2,my+mh-22,22,'rgba(180,170,150,0.5)',{align:'center'});
    // ===== peek overlay =====
    if(this._peek){ const pk=this._peek; ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(0,0,BW,BH);
      const lines=pk.lines||[]; const pw2=Math.min(1180,BW*0.64), phh=196+lines.length*56, ppx=BW/2-pw2/2, ppy=BH/2-phh/2;
      this.panel(ppx,ppy,pw2,phh,{r:22,c0:'rgba(24,17,10,0.99)',c1:'rgba(12,8,5,1)'}); ctx.shadowBlur=22; ctx.shadowColor=pk.col; ctx.lineWidth=3; ctx.strokeStyle=this._fade(pk.col,0.85); this.rr(ppx,ppy,pw2,phh,22); ctx.stroke(); ctx.shadowBlur=0;
      this.text(this._clip(pk.title,pw2-88,48,'800'),ppx+46,ppy+78,48,pk.col,{weight:'800'});
      if(pk.sub) this.text(pk.sub,ppx+46,ppy+120,28,'#b6a98c',{weight:'600'});
      let ly=ppy+(pk.sub?176:140); for(const ln of lines){ this.text(this._clip(ln,pw2-92,33,'600'),ppx+46,ly,33,'#ece0c4',{weight:'600'}); ly+=56; } }
  },

  // ----- end screen -----
  drawReward(){ const ctx=this.ctx; const run=this.run; if(!run){ this.go('hub'); return; } this.backdrop('abbey');
    if(!run.rewardChoices||run.rewardChoices.length===0) this._rollRewards();
    this.text('選擇一項成長',BW/2,150,60,'#e6c068',{align:'center',weight:'800',glow:16});
    this.text(ACTS[run.act-1].name+' · 第 '+(run.pi+1)+'/'+run.path.length+' 關',BW/2,212,26,'#a2926e',{align:'center'});
    const TC={'生存':'#39ad39','投籃':'#6b86e8','攻擊':'#e0853c','經濟':'#d7a945'};
    const ids=run.rewardChoices; const cw=320,ch=300,gap=44,tot=ids.length*cw+(ids.length-1)*gap,x0=BW/2-tot/2,y0=300;
    for(let i=0;i<ids.length;i++){ const r=UPMAP[ids[i]]; if(!r) continue; const x=x0+i*(cw+gap), col=TC[r.type]||'#e6c068';
      this.panel(x,y0,cw,ch,{r:16});
      this.rr(x+24,y0+24,104,40,10); ctx.fillStyle=this._fade(col,0.20); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=col; this.rr(x+24,y0+24,104,40,10); ctx.stroke();
      this.text(r.type,x+24+52,y0+44,22,col,{align:'center',baseline:'middle',weight:'800'});
      this.text(r.name,x+cw/2,y0+132,40,col,{align:'center',weight:'800'});
      this.wrap(r.desc,x+cw/2,y0+178,cw-44,26,'#cfc6b0',21);
      if(!r.instant){ const lv=run.modStacks[r.id]||0; this.text('Lv '+lv+'/'+(r.maxStack||3),x+cw-28,y0+ch-98,20,'#a2926e',{align:'right',weight:'700'}); }
      this.button(x+30,y0+ch-82,cw-60,62,'選擇','rw_'+r.id,()=>this._pickReward(r.id),{primary:true,size:28});
    }
    if(run._rewardReroll>0) this.button(BW/2-160,y0+ch+40,320,60,'重抽成長 ('+run._rewardReroll+')','rwroll',()=>{ run._rewardReroll--; this._rollRewards(); this.render(); },{size:26});
  },
  _rollRewards(){ const run=this.run; run.rewardChoices=this._rollUpgradePool(3); },
  _applyRewardDamageMods(ctx){ const run=this.run, m=run.mods; if(!m) return;
    if(run.form==='fire') ctx.dmg*=m.fireMul; else if(run.form==='ice') ctx.dmg*=m.iceMul; else if(run.form==='lightning') ctx.dmg*=m.lightningMul;
    if(ctx.swish) ctx.dmg*=m.swishMul; else if(ctx.bank) ctx.dmg*=m.bankMul; else if(ctx.lucky) ctx.dmg*=m.luckyMul;
    const lab=(run.hoopAct&&run.hoopAct.label)||'', c0=lab.charAt(0);
    if(c0==='近'||c0==='貼') ctx.dmg*=m.nearMul; else if(c0==='遠') ctx.dmg*=m.farMul;
    if(m.comboDmgPerStack>0) ctx.dmg*=(1+Math.min(5,run.combo)*m.comboDmgPerStack);
    if(ctx.firstMake && run.mut && run.mut.firstMakeDmg>0) ctx.dmg*=(1+run.mut.firstMakeDmg);
    ctx.dmg*=(m.allDmgMul||1);
  },
  _pickReward(id){ const run=this.run; if(!run||!run.rewardPending) return; const r=UPMAP[id]; if(!r) return; // anti double-click
    run.rewardPending=false; // consume immediately
    this._applyUpgrade(r);
    this.audio.sfx('levelup');
    this._continueAfterReward();
  },
  drawEnd(){ const ctx=this.ctx; const s=this._endStats; if(!s){ this.go('hub'); return; } const won=s.won; const IT=this.insT||0;
    // ===== 靜態背景（不脈動、不閃）=====
    const bg=ctx.createLinearGradient(0,0,0,BH); bg.addColorStop(0,'#241710'); bg.addColorStop(0.55,'#160e08'); bg.addColorStop(1,'#0b0704'); ctx.fillStyle=bg; ctx.fillRect(0,0,BW,BH);
    { const rg=ctx.createRadialGradient(BW/2,BH*0.14,40,BW/2,BH*0.14,BW*0.62); rg.addColorStop(0,won?'rgba(120,72,34,0.5)':'rgba(120,40,34,0.42)'); rg.addColorStop(0.6,'rgba(50,28,16,0.1)'); rg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=rg; ctx.fillRect(0,0,BW,BH); }
    { const mg=ctx.createRadialGradient(BW*0.84,140,18,BW*0.84,140,230); mg.addColorStop(0,'rgba(200,190,215,0.28)'); mg.addColorStop(1,'rgba(200,190,215,0)'); ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(BW*0.84,140,230,0,TAU); ctx.fill(); ctx.fillStyle='rgba(218,210,230,0.4)'; ctx.beginPath(); ctx.arc(BW*0.84,140,52,0,TAU); ctx.fill(); }
    { const vg=ctx.createRadialGradient(BW/2,BH*0.52,BH*0.34,BW/2,BH*0.52,BW*0.64); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.72)'); ctx.fillStyle=vg; ctx.fillRect(0,0,BW,BH); }
    // ===== 標題 =====
    this.text(won?'終場哨響起':(s.speed?'計時結束':'你被吹下場'), BW/2, IT+126, 84, won?'#e6c068':(s.speed?'#ffd86a':'#e6433c'), {align:'center',weight:'800',glow:22});
    const subTxt = s.speed ? ((ACTS[s.act-1]?ACTS[s.act-1].name:'')+' · 速投生存 · 投進 '+s.speedScore+' 球') : (won ? ((s.act>=5?'★ ':'')+(ACTS[s.act-1]?ACTS[s.act-1].name:'')+'-'+s.stageName+(s.act>=5?' 通關 ★':' 通關')) : ('止步於 '+(ACTS[s.act-1]?ACTS[s.act-1].name+'-':'')+s.stageName));
    this.text(subTxt, BW/2, IT+208, 36, won?'#ffe2a8':'#c89a86', {align:'center',weight:'700'});
    // ===== 戰績橫排（放大）=====
    const stats= s.speed ? [['投進球數',s.speedScore],['得分',s.score],['命中率',Math.round(s.acc*100)+'%'],['空心球',s.swishes],['擦板球',s.banks],['最高連擊',s.bestCombo]] : [['得分',s.score],['命中率',Math.round(s.acc*100)+'%'],['空心球',s.swishes],['擦板球',s.banks],['最高連擊',s.bestCombo],['擊殺',s.kills]];
    const N=stats.length, sw=Math.min(BW*0.93,1740), cgap=20, cw=(sw-(N-1)*cgap)/N, ch=168, sx=BW/2-sw/2, sy=IT+282;
    for(let i=0;i<N;i++){ const cx=sx+i*(cw+cgap); this.rr(cx,sy,cw,ch,16); const cg=ctx.createLinearGradient(cx,sy,cx,sy+ch); cg.addColorStop(0,'rgba(48,33,20,0.95)'); cg.addColorStop(1,'rgba(22,15,9,0.92)'); ctx.fillStyle=cg; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle='#5e4628'; this.rr(cx,sy,cw,ch,16); ctx.stroke();
      this.text(stats[i][0], cx+cw/2, sy+56, 30, '#e6c068', {align:'center',weight:'700'});
      this.text(''+stats[i][1], cx+cw/2, sy+132, 66, '#fff', {align:'center',weight:'800'}); }
    let cy2=sy+ch+58;
    if(s.words.length){ this.text('球語：'+s.words.map(id=>BALL_WORDS.find(w=>w.id===id).name).join('　·　'), BW/2, cy2, 28, '#ffe2a8', {align:'center',weight:'700'}); cy2+=50; }
    if(s.speed && (!s.loot || !s.loot.length)){ this.text('這次沒掉到核心聖物 — 投進越多球，機率越高', BW/2, cy2+6, 30, '#b8a888', {align:'center',weight:'700'}); cy2+=48; }
    if((won||s.speed) && s.loot && s.loot.length){ const ly=cy2+6; this.text('\u27e1 '+(s.speed?'核心聖物掉落':'戰利品')+' · 逐件決定（收下入倉庫 / 丟棄）', BW/2, ly, 40, '#ffe2a8', {align:'center',weight:'800'});
      const lw=448,lg=44, lyy=ly+50, lh=clamp(BH-lyy-46,380,480), tot=s.loot.length*lw+(s.loot.length-1)*lg, lx0=BW/2-tot/2;
      for(let i=0;i<s.loot.length;i++){ const id=s.loot[i],R=RELICS[id],x=lx0+i*(lw+lg); const meta=this._relicMeta(id); const col=QUAL_COL[meta.tier];
        this.rr(x,lyy,lw,lh,18); ctx.fillStyle='rgba(16,11,6,0.96)'; ctx.fill(); ctx.lineWidth=3.5; ctx.strokeStyle=col; ctx.shadowBlur=18; ctx.shadowColor=col; this.rr(x,lyy,lw,lh,18); ctx.stroke(); ctx.shadowBlur=0;
        this.text(QUAL_NAME[meta.tier]+'　強度 '+meta.q+'/50', x+lw/2, lyy+50, 26, col, {align:'center',weight:'700'});
        this.text(R.name, x+lw/2, lyy+106, 40, col, {align:'center',weight:'800'});
        this.wrap(R.desc, x+lw/2, lyy+156, lw-52, 34, '#cfc6b0', 24);
        const by=lyy+lh-92, bw2=(lw-40)/2;
        { let ay=by-26-meta.affixes.length*36; for(const a of meta.affixes){ this.text('◆ '+a.label+' +'+(a.pct?Math.round(a.val*100)+'%':a.val), x+lw/2, ay, 24, '#9fe6ff', {align:'center',weight:'700'}); ay+=36; } }
        ((id2,idx)=>{
          this._sb(x+14,by,bw2-6,76,'收下',()=>{ const sv=this.save; if((sv.library||[]).length>=30){ this.toast('聖物庫已滿','請先整理倉庫'); return; } sv.library.push(id2); persist(sv); this.audio.sfx('select'); s.loot.splice(idx,1); this.render(); },{size:32,primary:true});
          this._sb(x+14+bw2+12,by,bw2-6,76,'丟棄',()=>{ s.loot.splice(idx,1); this.audio.sfx('ui'); this.render(); },{size:32});
        })(id,i); }
    } else {
      const bw=460,bh=104,gap2=40,bx=BW/2-(bw*2+gap2)/2, byy=Math.min(cy2+90, BH-bh-70);
      if(s.nodeMode){
        this.button(bx,byy,bw,bh,won?'收手 · 返回路線':'返回路線','tonode',()=>{ this._endStats=null; this.go('route'); },{primary:true,size:34});
        this.button(bx+bw+gap2,byy,bw,bh,'返回板凳席','hub',()=>{ this._endStats=null; this.go('hub'); },{size:34});
      } else {
        this.button(bx,byy,bw,bh,won?'返回圖譜':'立即重試','retry',()=>{ this._endStats=null; this.go('atlas'); },{primary:true,size:34});
        this.button(bx+bw+gap2,byy,bw,bh,'返回板凳席','hub',()=>{ this._endStats=null; this.go('hub'); },{size:34});
      }
    }
    if(this._replaceTarget) this.drawReplace();
  },
});



// ============================================================
// UI/UX + grouped-enemy aesthetic overhaul patch (direct edit)
// ============================================================
Object.assign(Game.prototype, {
  fitText(label, maxW, maxSize, minSize, weight, font){
    const ctx=this.ctx; font=font||'Georgia,serif'; weight=weight||'700';
    let size=maxSize;
    while(size>minSize){ ctx.font=`${weight} ${size}px ${font}`; if(ctx.measureText(label).width<=maxW) break; size-=1; }
    return size;
  },
  button(x,y,w,h,label,id,cb,o){
    o=o||{}; const ctx=this.ctx; const radius=o.r||14;
    this.rr(x,y,w,h,radius);
    if(o.primary){ const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#f6d27e'); g.addColorStop(1,'#cf8f29'); ctx.fillStyle=g; }
    else if(o.danger){ const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#9c2f28'); g.addColorStop(1,'#6a1a15'); ctx.fillStyle=g; }
    else { const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'rgba(64,49,32,0.98)'); g.addColorStop(1,'rgba(42,32,20,0.99)'); ctx.fillStyle=g; }
    ctx.fill();
    ctx.strokeStyle=o.primary?'rgba(255,240,190,0.95)':(o.danger?'rgba(255,150,130,0.6)':'rgba(235,198,112,0.7)');
    ctx.lineWidth=o.primary?3:2.5; ctx.stroke();
    const size=this.fitText(label, w-24, o.size||26, 20, o.weight||'800');
    const col=o.primary?'#241405':(o.color||'#fff4dc');
    if(!o.primary){ ctx.save(); ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=5; ctx.shadowOffsetY=2;
      this.text(label,x+w/2,y+h/2,size,col,{align:'center',baseline:'middle',weight:o.weight||'800'}); ctx.restore(); }
    else this.text(label,x+w/2,y+h/2,size,col,{align:'center',baseline:'middle',weight:o.weight||'800'});
    this.btn(x,y,w,h,id,cb,o);
  },
  _glowingBasketShrine(cx,cy){
    const ctx=this.ctx, t=this.t;
    // glow
    const rg=ctx.createRadialGradient(cx,cy,18,cx,cy,220);
    rg.addColorStop(0,'rgba(255,220,120,0.55)'); rg.addColorStop(0.5,'rgba(255,170,70,0.18)'); rg.addColorStop(1,'rgba(255,170,70,0)');
    ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(cx,cy,220,0,TAU); ctx.fill();
    // base sigil
    ctx.save(); ctx.strokeStyle='rgba(230,192,104,0.35)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(cx,cy,146,0,TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,112,0,TAU); ctx.stroke(); ctx.restore();
    // basketball relic
    ctx.save(); ctx.translate(cx,cy+Math.sin(t*2)*5);
    ctx.shadowBlur=28; ctx.shadowColor='#ff9a44';
    const g=ctx.createRadialGradient(-16,-16,6,0,0,78); g.addColorStop(0,'#ffd6a3'); g.addColorStop(0.5,'#ef8b2d'); g.addColorStop(1,'#7a3112');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,78,0,TAU); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(20,10,4,0.75)'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(0,0,78,0,TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-78,0); ctx.lineTo(78,0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,0,34,78,0,0,TAU); ctx.stroke();
    ctx.restore();
  },
  drawHub(){ const s=this.save;
    const LO=this._fbLayout(); this._FBL=LO;
    this._ensureFbAssets();
    const flatOk=this._drawFbBg(LO);
    if(!flatOk) this._drawFbTitleFallback(LO);
    this._drawFbSidebar(LO);
    this._drawFbPlayerCard(LO);
    this._drawFbStatCards(LO);
    this._drawFbButtons(LO);
    this._drawFbBack(LO);
  },
  _fbLayout(){
    const stage=this._artStage(), sc=stage.sc, U=stage.U; this._U=U;
    const insL=this.insL||0,insR=this.insR||0,insT=this.insT||0,insB=this.insB||0;
    const safeTop=Math.max(insT,stage.y), safeBot=Math.min(BH-insB,stage.y+stage.h), safeL=Math.max(insL,stage.x), safeR=Math.min(BW-insR,stage.x+stage.w);
    const J=(o)=>({x:stage.x+o.x*U,y:stage.y+o.y*U,w:o.w*U,h:o.h*U});
    let back=J({x:18,y:18,w:78,h:34}); back.x=Math.max(back.x,safeL+8*U); back.y=Math.max(back.y,safeTop+6*U);
    let player=J({x:552,y:48,w:282,h:98});
    let statL=J({x:552,y:154,w:135,h:52}), statR=J({x:699,y:154,w:135,h:52});
    let prim=J({x:552,y:214,w:282,h:52});
    let sel=J({x:552,y:276,w:282,h:42});
    let bL=J({x:552,y:328,w:136,h:44}), bR=J({x:698,y:328,w:136,h:44});
    let endless=null;
    // horizontal clamp: keep right column inside right safe edge
    const colRight=Math.max(player.x+player.w, bR.x+bR.w), maxR=safeR-6*U;
    let dx=0; if(colRight>maxR) dx=colRight-maxR;
    // vertical clamp: keep bottom row (or endless) above safe bottom
    const colBottom=(endless?endless.y+endless.h:bL.y+bL.h), maxB=safeBot-6*U;
    let dy=0; if(colBottom>maxB) dy=colBottom-maxB;
    for(const r of [player,statL,statR,prim,sel,bL,bR].concat(endless?[endless]:[])){ r.x-=dx; r.y-=dy; }
    const sidebarX=Math.max(stage.x+418*U,Math.min(player.x,statL.x,bL.x)-118*U);
    return {U,sc,stage,insL,insR,insT,insB,safeTop,safeBot,safeL,safeR,back,player,statL,statR,prim,sel,bL,bR,endless,sidebarX};
  },
  _ensureFbAssets(){ if(!this._fbImg){ this._fbImg={}; this._fbErr={}; }
    if(this._fbImg.flat===undefined){ try{ const im=new Image(); im.onerror=()=>{this._fbErr.flat=true;}; im.src='/assets/final_bench_menu/final_bench_menu_full_flat_1704x786.webp'; this._fbImg.flat=im; }catch(e){ this._fbErr.flat=true; } }
  },
  _drawFbBg(LO){ const ctx=this.ctx,U=LO.U; const im=this._fbImg.flat; let ok=false;
    ctx.save(); ctx.fillStyle='#150f22'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    if(im&&im.complete&&im.naturalWidth&&!this._fbErr.flat){ ctx.save(); const r=LO.stage; ctx.drawImage(im,r.x,r.y,r.w,r.h); ok=true; ctx.restore(); }
    if(!ok){ const r=LO.stage; const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,'#1a0f2a'); g.addColorStop(0.55,'#0c0816'); g.addColorStop(1,'#06040a'); ctx.fillStyle=g; ctx.fillRect(r.x,r.y,r.w,r.h);
      // subtle green court glow so it's not flat black while art loads
      const rg=ctx.createRadialGradient(r.x+r.w*0.3,r.y+r.h*0.62,30*U,r.x+r.w*0.3,r.y+r.h*0.62,r.w*0.4); rg.addColorStop(0,'rgba(150,230,60,0.16)'); rg.addColorStop(1,'rgba(150,230,60,0)'); ctx.save(); ctx.fillStyle=rg; ctx.fillRect(r.x,r.y,r.w,r.h); ctx.restore(); }
    return ok;
  },
  _drawFbTitleFallback(LO){ const ctx=this.ctx,U=LO.U;
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.translate(LO.stage.x+LO.stage.w*0.34,LO.stage.y+34*U);
    ctx.font='800 '+(30*U)+'px "PingFang TC","Microsoft JhengHei",Georgia,serif'; ctx.lineJoin='round'; ctx.lineWidth=8*U; ctx.strokeStyle='rgba(10,6,2,0.85)'; ctx.strokeText('最後板凳席',0,0);
    const tg=ctx.createLinearGradient(0,-16*U,0,16*U); tg.addColorStop(0,'#f6e7b0'); tg.addColorStop(1,'#d7a945'); ctx.fillStyle=tg; ctx.fillText('最後板凳席',0,0); ctx.restore();
    this.text('守護發光聖球，準備投進籃獄', LO.stage.x+LO.stage.w*0.34, LO.stage.y+54*U, 12*U,'#cfc6b0',{align:'center'});
  },
  _drawFbSidebar(LO){ const ctx=this.ctx,U=LO.U;
    // Local cleanup masks: cover the baked poster UI only behind live controls,
    // leaving the bench illustration and title visible.
    ctx.save();
    const colX=Math.min(LO.player.x,LO.statL.x,LO.statR.x,LO.prim.x,LO.sel.x,LO.bL.x,LO.bR.x)-22*U;
    const colY=LO.player.y-20*U;
    const colR=Math.max(LO.player.x+LO.player.w,LO.statR.x+LO.statR.w,LO.prim.x+LO.prim.w,LO.sel.x+LO.sel.w,LO.bR.x+LO.bR.w)+70*U;
    const colB=Math.max(LO.bL.y+LO.bL.h,LO.bR.y+LO.bR.h,LO.sel.y+LO.sel.h)+30*U;
    const strip=ctx.createLinearGradient(colX-56*U,0,colX+50*U,0);
    strip.addColorStop(0,'rgba(7,5,12,0)');
    strip.addColorStop(0.45,'rgba(7,5,12,0.82)');
    strip.addColorStop(1,'rgba(7,5,12,0.96)');
    ctx.fillStyle=strip;
    ctx.fillRect(colX-56*U,colY,Math.max(0,colR-colX+56*U),Math.max(0,colB-colY));
    const core=ctx.createLinearGradient(0,colY,0,colB);
    core.addColorStop(0,'rgba(9,6,12,0.94)');
    core.addColorStop(0.52,'rgba(7,5,10,0.98)');
    core.addColorStop(1,'rgba(5,4,8,0.95)');
    ctx.fillStyle=core;
    this.rr(colX,colY,Math.max(0,colR-colX),Math.max(0,colB-colY),18*U);
    ctx.fill();
    const clean=(r,p=8*U)=>{ this.rr(r.x-p,r.y-p,r.w+p*2,r.h+p*2,14*U); ctx.fillStyle='rgba(7,5,12,0.92)'; ctx.fill(); };
    for(const r of [LO.player,LO.statL,LO.statR,LO.prim,LO.sel,LO.bL,LO.bR].concat(LO.endless?[LO.endless]:[])) clean(r);
    const eg=ctx.createRadialGradient(LO.prim.x+LO.prim.w*0.82,LO.prim.y+LO.prim.h/2,20*U,LO.prim.x+LO.prim.w*0.82,LO.prim.y+LO.prim.h/2,180*U);
    eg.addColorStop(0,'rgba(150,230,60,0.08)'); eg.addColorStop(1,'rgba(150,230,60,0)');
    ctx.fillStyle=eg; ctx.fillRect(LO.prim.x-24*U,LO.player.y-18*U,LO.prim.w+48*U,(LO.bL.y+LO.bL.h)-(LO.player.y)+36*U);
    ctx.restore();
  },
  _drawFbPlayerCard(LO){ const ctx=this.ctx,U=LO.U,s=this.save; const r=LO.player; const hero=HEROES.find(h=>h.id===s.hero)||HEROES[0];
    this._gothCard(r,U);
    const pad=14*U, tx=r.x+pad;
    this.text('當前投手', tx, r.y+16*U, 11*U,'#d7a945',{weight:'700'});
    this.text(this._clip(hero.name,r.w-92*U,21*U,'800'), tx, r.y+38*U, 21*U,'#ece0c4',{weight:'800'});
    this.text(this._clip(hero.en,r.w-92*U,13*U,'600'), tx, r.y+56*U, 13*U,'#a2926e',{weight:'600'});
    // passive line w/ small flame bullet
    ctx.save(); ctx.fillStyle='#8eea18'; ctx.beginPath(); ctx.arc(tx+4*U,r.y+78*U,4*U,0,TAU); ctx.fill(); ctx.restore();
    this.text(this._clip('被動：'+hero.passive, r.w-pad*2-14*U, 11*U,'400'), tx+14*U, r.y+78*U, 11*U,'#cfc6b0');
    // circular hero portrait top-right
    const cr=30*U, ccx=r.x+r.w-pad-cr, ccy=r.y+r.h/2;
    ctx.save(); ctx.beginPath(); ctx.arc(ccx,ccy,cr,0,TAU); const pg=ctx.createRadialGradient(ccx,ccy,4*U,ccx,ccy,cr); pg.addColorStop(0,'rgba(60,46,30,0.95)'); pg.addColorStop(1,'rgba(14,10,6,0.96)'); ctx.fillStyle=pg; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(ccx,ccy,cr-2*U,0,TAU); ctx.clip(); this.drawHero(hero.id, ccx, ccy+cr*0.95, (cr*2.1)/246); ctx.restore();
    ctx.lineWidth=1.6*U; ctx.strokeStyle='rgba(215,169,69,0.7)'; ctx.beginPath(); ctx.arc(ccx,ccy,cr,0,TAU); ctx.stroke(); ctx.restore();
  },
  _drawFbStatCards(LO){ const U=LO.U,s=this.save;
    this._gothCard(LO.statL,U); this._statIcon('target',LO.statL.x+18*U,LO.statL.y+LO.statL.h*0.62,7*U);
    this.text('今日命中', LO.statL.x+14*U, LO.statL.y+16*U, 11*U,'#a2926e');
    this.text(Math.round(this._heroDayAcc(s.hero)*100)+'%', LO.statL.x+32*U, LO.statL.y+LO.statL.h*0.62, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this._gothCard(LO.statR,U); this._statIcon('crown',LO.statR.x+18*U,LO.statR.y+LO.statR.h*0.62,7*U);
    this.text('無盡最佳', LO.statR.x+14*U, LO.statR.y+16*U, 11*U,'#a2926e');
    this.text(String(s.endlessBest|0), LO.statR.x+32*U, LO.statR.y+LO.statR.h*0.62, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
  },
  _drawFbButtons(LO){ const U=LO.U;
    const pr=LO.prim; this._fbPrimary(pr,'進入籃獄圖譜',this._press(pr)); this.btn(pr.x,pr.y,pr.w,Math.max(44*U,pr.h),'fb_atlas',()=>this.go('atlas'));
    const se=LO.sel; this._fbBtn(se,'選擇英雄',this._press(se),'helmet'); this.btn(se.x,se.y-((Math.max(44*U,se.h)-se.h)/2),se.w,Math.max(44*U,se.h),'fb_heroes',()=>this.go('heroes'));
    const a=LO.bL, endlessReady=!!(this.save&&(this.save.endless||this.save.admin));
    this._fbBtn(a,'無盡模式',this._press(a),'inf',!endlessReady);
    this.btn(a.x,a.y,a.w,Math.max(44*U,a.h),'fb_endless_entry',()=>{
      if(!endlessReady){ this.toast('無盡模式','標準或腐化第 5 幕通關後解鎖'); return; }
      this._toast=null; this._endlessIntro=true; this.render();
    });
    const b=LO.bR; this._fbBtn(b,'天梯榜',false,'crown',true); this.btn(b.x,b.y,b.w,Math.max(44*U,b.h),'fb_ladder_locked',()=>this.toast('天梯榜','即將開放'));
    if(LO.endless){ const e=LO.endless; this._fbBtn(e,'∞ 無盡加時 (最佳 '+(this.save.endlessBest|0)+')',this._press(e),null); this.btn(e.x,e.y,e.w,Math.max(44*U,e.h),'fb_endless',()=>this.startEndless()); }
  },
  _drawEndlessIntroPanel(){
    const ctx=this.ctx,U=this._U||1;
    ctx.save();
    const veil=ctx.createLinearGradient(0,0,0,BH);
    veil.addColorStop(0,'rgba(2,1,5,0.88)');
    veil.addColorStop(0.52,'rgba(6,4,8,0.94)');
    veil.addColorStop(1,'rgba(2,1,5,0.90)');
    ctx.fillStyle=veil;
    ctx.fillRect(0,0,BW,BH);
    ctx.fillStyle='rgba(159,224,36,0.05)';
    ctx.fillRect(0,BH*0.56,BW,BH*0.44);
    ctx.restore();
    this.btn(0,0,BW,BH,'endless_intro_scrim',()=>{ this._endlessIntro=false; this.render(); });

    const IL=this.insL||0,IR=this.insR||0,IT=this.insT||0,IB=this.insB||0;
    const x=IL+24*U, y=IT+18*U, w=BW-IL-IR-48*U, h=BH-IT-IB-36*U;
    this.rr(x,y,w,h,24*U);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(22,15,10,0.88)');
    bg.addColorStop(0.48,'rgba(8,6,10,0.82)');
    bg.addColorStop(1,'rgba(6,4,8,0.90)');
    ctx.fillStyle=bg;
    ctx.fill();
    ctx.lineWidth=3*U;
    ctx.strokeStyle='rgba(215,169,69,0.78)';
    this.rr(x,y,w,h,24*U);
    ctx.stroke();
    ctx.lineWidth=1.4*U;
    ctx.strokeStyle='rgba(159,224,36,0.34)';
    this.rr(x+12*U,y+12*U,w-24*U,h-24*U,18*U);
    ctx.stroke();

    const ix=x+56*U, iy=y+58*U;
    ctx.save();
    ctx.shadowBlur=22*U;
    ctx.shadowColor='rgba(159,224,36,0.7)';
    this.rr(ix-28*U,iy-28*U,56*U,56*U,16*U);
    ctx.fillStyle='rgba(15,24,8,0.96)';
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.lineWidth=2*U;
    ctx.strokeStyle='rgba(159,224,36,0.78)';
    this.rr(ix-28*U,iy-28*U,56*U,56*U,16*U);
    ctx.stroke();
    ctx.restore();
    this._statIcon('inf',ix,iy,15*U);

    this.text('無盡深淵',x+w/2,y+50*U,36*U,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12*U});
    this.text('連續推進模式 · 第一階段入口',x+w/2,y+83*U,18*U,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});

    const rows=[
      ['深淵進度','集滿進度，Boss 降臨'],
      ['限時擊破','擊破 Boss，升級並跳層'],
      ['雲端紀錄','深度、Boss 數與獎勵']
    ];
    const rx=x+54*U, rw=w-108*U, gap=16*U;
    const buttonH=48*U, buttonY=y+h-66*U, statusH=38*U, statusY=buttonY-54*U;
    const topY=y+124*U, rh=Math.max(72*U,Math.min(92*U,statusY-topY-18*U));
    const cw=(rw-gap*2)/3;
    for(let i=0;i<rows.length;i++){
      const cx=rx+i*(cw+gap), ry=topY;
      this.rr(cx,ry,cw,rh,16*U);
      ctx.fillStyle=i%2?'rgba(255,255,255,0.035)':'rgba(159,224,36,0.06)';
      ctx.fill();
      ctx.lineWidth=1.2*U;
      ctx.strokeStyle='rgba(215,169,69,0.22)';
      this.rr(cx,ry,cw,rh,16*U);
      ctx.stroke();
      this.text(rows[i][0],cx+24*U,ry+26*U,20*U,'#e6c068',{baseline:'middle',weight:'900'});
      this.text(this._clip(rows[i][1],cw-48*U,15*U,'800'),cx+24*U,ry+58*U,15*U,'#ece0c4',{baseline:'middle',weight:'800'});
    }

    const sy=statusY;
    this.rr(rx,sy,rw,statusH,14*U);
    ctx.fillStyle='rgba(159,224,36,0.10)';
    ctx.fill();
    ctx.lineWidth=1.4*U;
    ctx.strokeStyle='rgba(159,224,36,0.42)';
    this.rr(rx,sy,rw,statusH,14*U);
    ctx.stroke();
    this.text('目前狀態：入口已接上，下一階段接正式戰鬥流程',x+w/2,sy+statusH/2,17*U,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});

    const bw=190*U,bh=buttonH,by=buttonY;
    this.button(x+w/2-bw-22*U,by,bw,bh,'返回','endless_intro_close',()=>{ this._endlessIntro=false; this.render(); },{size:24*U});
    this.button(x+w/2+22*U,by,bw,bh,'下一階段開放','endless_intro_next',()=>this.toast('無盡深淵','下一步接入正式戰鬥流程'),{primary:true,size:22*U,weight:'900'});
  },
  _drawFbBack(LO){ const ctx=this.ctx,U=LO.U; const r=LO.back; const pr=this._press(r);
    // hide the baked "back" button from the flat art with a soft dark halo (corner is already dark scene)
    ctx.save(); const bcx=LO.stage.x+57*U, bcy=LO.stage.y+35*U, br=Math.max(150*U, r.x+r.w+34*U); const rg=ctx.createRadialGradient(bcx,bcy,8*U,bcx,bcy,br); rg.addColorStop(0,'rgba(7,5,12,0.96)'); rg.addColorStop(0.6,'rgba(7,5,12,0.82)'); rg.addColorStop(1,'rgba(7,5,12,0)'); ctx.fillStyle=rg; ctx.fillRect(LO.stage.x,LO.stage.y,br*2,br*2); ctx.restore();
    ctx.save(); if(pr)ctx.globalAlpha=0.8; this.rr(r.x,r.y,r.w,r.h,8*U); const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,'rgba(40,30,16,0.92)'); g.addColorStop(1,'rgba(20,14,8,0.94)'); ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=1.6*U; ctx.strokeStyle='rgba(215,169,69,0.7)'; this.rr(r.x,r.y,r.w,r.h,8*U); ctx.stroke(); ctx.restore();
    this.text('← 首頁', r.x+r.w/2, r.y+r.h/2, 12*U,'#e6c068',{align:'center',baseline:'middle',weight:'700'});
    this.btn(r.x-5*U,r.y-((44*U-r.h)/2),Math.max(88*U,r.w+10*U),44*U,'fb_back',()=>this.go('home'));
  },
  _gothCard(r,U){ const ctx=this.ctx; ctx.save();
    this.rr(r.x,r.y,r.w,r.h,12*U); const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h); g.addColorStop(0,'rgba(22,15,11,0.95)'); g.addColorStop(1,'rgba(11,8,6,0.97)'); ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=1.4*U; ctx.strokeStyle='rgba(155,120,55,0.55)'; this.rr(r.x,r.y,r.w,r.h,12*U); ctx.stroke(); ctx.restore();
  },
  _fbPrimary(r,label,pressed){ const ctx=this.ctx,U=this._U; const off=pressed?2*U:0; const x=r.x,y=r.y+off,w=r.w,h=r.h,rad=11*U;
    ctx.save();
    const pulse=0.5+0.5*Math.sin(this.t*2.2); ctx.shadowBlur=(pressed?6:14+pulse*7)*U; ctx.shadowColor='rgba(150,230,60,'+(pressed?0.45:0.7)+')';
    this.rr(x,y,w,h,rad); const g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,pressed?'#7fb81e':'#9fe024'); g.addColorStop(0.5,'#6fae16'); g.addColorStop(1,'#3f6a10'); ctx.fillStyle=g; ctx.fill(); ctx.shadowBlur=0;
    ctx.save(); this.rr(x+3*U,y+3*U,w-6*U,h*0.42,rad*0.8); ctx.fillStyle='rgba(220,255,140,0.18)'; ctx.fill(); ctx.restore();
    ctx.lineWidth=2.4*U; ctx.strokeStyle='#d7a945'; this.rr(x,y,w,h,rad); ctx.stroke();
    ctx.restore();
    // basketball icon
    this._statIcon('ball', x+24*U, y+h/2, 9*U);
    this.text(label, x+w/2+12*U, y+h/2, 18*U,'#0d1406',{align:'center',baseline:'middle',weight:'800'});
  },
  _fbBtn(r,label,pressed,icon,disabled){ const ctx=this.ctx,U=this._U; const off=(pressed&&!disabled)?1.5*U:0; const x=r.x,y=r.y+off,w=r.w,h=r.h,rad=9*U;
    ctx.save();
    this.rr(x,y,w,h,rad); const g=ctx.createLinearGradient(0,y,0,y+h);
    if(disabled){ g.addColorStop(0,'rgba(22,22,24,0.85)'); g.addColorStop(1,'rgba(13,13,15,0.9)'); } else { g.addColorStop(0,'rgba(26,18,12,0.95)'); g.addColorStop(1,'rgba(13,9,6,0.97)'); }
    ctx.fillStyle=g; ctx.fill();
    if(!pressed&&!disabled){ ctx.shadowBlur=5*U; ctx.shadowColor='rgba(215,169,69,0.3)'; }
    ctx.lineWidth=1.5*U; ctx.strokeStyle=disabled?'rgba(132,130,126,0.4)':'rgba(190,150,70,0.65)'; this.rr(x,y,w,h,rad); ctx.stroke(); ctx.shadowBlur=0; ctx.restore();
    let tcx=x+w/2;
    if(icon){ ctx.save(); if(disabled)ctx.globalAlpha=0.42; this._statIcon(icon, x+20*U, y+h/2, 8*U); ctx.restore(); tcx=x+w/2+10*U; }
    this.text(this._clip(label,w-(icon?40*U:20*U),16*U,'700'), tcx, y+h/2, 16*U, disabled?'rgba(192,190,186,0.5)':'#ece0c4',{align:'center',baseline:'middle',weight:'700'});
  },
  _statIcon(type,cx,cy,r){ const ctx=this.ctx,U=this._U; ctx.save(); ctx.lineWidth=1.5*U; ctx.lineCap='round';
    if(type==='coin'){ ctx.fillStyle='#d7a945'; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.fill(); ctx.fillStyle='#7a5a18'; ctx.font='800 '+(r*1.3)+'px Georgia'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('$',cx,cy+0.5*U); }
    else if(type==='crown'){ ctx.fillStyle='#d7a945'; ctx.beginPath(); ctx.moveTo(cx-r,cy+r*0.6); ctx.lineTo(cx-r,cy-r*0.5); ctx.lineTo(cx-r*0.45,cy+r*0.1); ctx.lineTo(cx,cy-r*0.7); ctx.lineTo(cx+r*0.45,cy+r*0.1); ctx.lineTo(cx+r,cy-r*0.5); ctx.lineTo(cx+r,cy+r*0.6); ctx.closePath(); ctx.fill(); }
    else if(type==='ball'){ ctx.fillStyle='#9fe024'; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.fill(); ctx.strokeStyle='#16320a'; ctx.lineWidth=1.2*U; ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r); ctx.arc(cx,cy,r,0,TAU); ctx.stroke(); }
    else if(type==='helmet'){ ctx.strokeStyle='#d7a945'; ctx.beginPath(); ctx.arc(cx,cy-r*0.1,r,Math.PI*1.05,Math.PI*1.95); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,cy-r*0.1); ctx.lineTo(cx,cy+r*0.7); ctx.stroke(); }
    else if(type==='chest'){ ctx.strokeStyle='#d7a945'; ctx.strokeRect(cx-r,cy-r*0.5,r*2,r*1.3); ctx.beginPath(); ctx.moveTo(cx-r,cy-r*0.1); ctx.lineTo(cx+r,cy-r*0.1); ctx.stroke(); ctx.fillStyle='#d7a945'; ctx.fillRect(cx-r*0.18,cy-r*0.25,r*0.36,r*0.5); }
    else if(type==='book'){ ctx.strokeStyle='#d7a945'; ctx.strokeRect(cx-r,cy-r*0.7,r*2,r*1.4); ctx.beginPath(); ctx.moveTo(cx,cy-r*0.7); ctx.lineTo(cx,cy+r*0.7); ctx.stroke(); }
    else if(type==='inf'){ ctx.strokeStyle='#b6b4b0'; ctx.lineWidth=1.7*U; ctx.beginPath(); ctx.arc(cx-r*0.52,cy,r*0.52,0,TAU); ctx.moveTo(cx+r*1.04,cy); ctx.arc(cx+r*0.52,cy,r*0.52,0,TAU); ctx.stroke(); }
    else if(type==='target'){ ctx.strokeStyle='#d7a945'; ctx.lineWidth=1.5*U; ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cx,cy,r*0.58,0,TAU); ctx.stroke(); ctx.fillStyle='#d7a945'; ctx.beginPath(); ctx.arc(cx,cy,r*0.2,0,TAU); ctx.fill(); }
    ctx.restore();
  },
  battleDown(x,y){
    const run=this.run; if(run.modal) return;
    if(this._pauseHit && x>=this._pauseHit.x&&x<=this._pauseHit.x+this._pauseHit.w&&y>=this._pauseHit.y&&y<=this._pauseHit.y+this._pauseHit.h){ this._paused=true; return; }
    if(this._detailHit && x>=this._detailHit.x&&x<=this._detailHit.x+this._detailHit.w&&y>=this._detailHit.y&&y<=this._detailHit.y+this._detailHit.h){ this._detailOpen=true; this._detailJustOpened=true; this._detailIntf=null; this._peek=null; this._peekFromChip=false; this.audio.sfx('ui'); this.render(); return; }
    const b=run.ball; if(!b||!b.held||b.live||run.repos>0) return;
    // drag from anywhere in the field; anchor = press point (not the ball). exclude HUD regions.
    const _IL=this.insL||0,_IR=this.insR||0,_IT=this.insT||0,_IB=this.insB||0;
    if(x>=_IL+24&&x<=_IL+24+486&&y>=_IT+22&&y<=_IT+22+210) return; // hero panel
    if(x>=BW/2-350&&x<=BW/2+350&&y>=_IT+18&&y<=_IT+18+128) return; // stage bar
    if(x>=BW-_IR-108&&y<=_IT+106) return; // pause (top-right)
    if(y>=BH-_IB-44) return; // bottom info bar
    run.aiming=true; run.aimStartX=x; run.aimStartY=y; run.aimX=x; run.aimY=y; if(run.tutorial&&run.tutStep==null) run.tutStep=1;
  },
  spawnGuard(type){
    const run=this.run, def=GUARDS[type], host=run.host;
    const idx = (run._spawnSeq||0); run._spawnSeq=idx+1;
    const L=[
      {x:-260,y:70,s:1.12,layer:2},{x:-150,y:36,s:1.02,layer:1},{x:-46,y:82,s:1.15,layer:2},
      {x:-330,y:-10,s:0.92,layer:0},{x:-210,y:-46,s:0.88,layer:0},{x:-88,y:-20,s:0.92,layer:0},
      {x:36,y:-8,s:0.86,layer:0},{x:124,y:34,s:0.94,layer:1},{x:164,y:96,s:1.05,layer:2},
      {x:-360,y:116,s:1.06,layer:2},{x:54,y:136,s:1.0,layer:2},{x:-10,y:28,s:0.98,layer:1},
    ];
    const slot = L[idx % L.length];
    const elite = (!run.stage.boss && idx>0 && idx%5===0) || (run.stage.boss && idx>0 && idx%4===0);
    const r = def.r * (elite?1.22:1);
    const hp = def.hp * (elite?1.8:1);
    const g={
      id:Math.random().toString(36).slice(2), type, x:host.x+slot.x, y:host.baseY+slot.y, bx:slot.x, by:slot.y, layer:slot.layer,
      slot:idx, drawScale:slot.s*(elite?1.08:1), maxhp:hp, hp, r, flash:0, dead:false, wphase:Math.random()*TAU,
      intf:def.intf||null, cast:0, castMax:def.intf?randi(2,4):0, casting:false, burn:0, burnDps:0, frozen:false, freeze:0,
      shieldUp:!!def.shield, elite, ph:1,
    };
    if(elite){ const mv=_eliteMoveFor(type); g.eliteMove=mv.id; g.eliteEff=mv.eff; g.eliteName=mv.name; g.eliteCounter=mv.counter; if(mv.charge>0){ g.castMax=mv.charge; g.cast=0; g.casting=false; } else { g.castMax=0; } if(mv.eff==='armor'){ g.shieldUp=true; } }
    run.guards.push(g); return g;
  },
  updateGuards(dt){
    const run=this.run; const host=run.host;
    for(const g of run.guards){ if(g.dead) continue;
      g.flash=Math.max(0,g.flash-dt*5);
      if(g.frozen){ g.freeze-=dt; if(g.freeze<=0){ g.frozen=false; g.freeze=0; } }
      if(g.burn>0){ g.burn-=dt; g._bt=(g._bt||0)+dt; if(g._bt>=0.5){ g._bt=0; this.hurtGuard(g, Math.max(1, Math.round(g.burnDps*0.5)), {}); } }
      if(g._static){ g.x=g.bx; g.y=g.by; continue; }
      const wobX=Math.sin(this.t*1.6+g.slot)*10, wobY=Math.sin(this.t*2.2+g.slot*0.7)*6;
      const tx=host.x + g.bx + wobX, ty=host.baseY + g.by + wobY;
      g.x=lerp(g.x, tx, clamp(dt*(g.elite?4.2:3.2),0,1));
      g.y=lerp(g.y, ty, clamp(dt*(g.elite?4.2:3.2),0,1));
      g.phased = host.phase>1 && g.layer===0 ? 0.92 : false;
    }
  },
  _guardPalette(type){
    const c={skel:['#efe7d4','#d8cebd'],shield:['#ddd4c5','#b3a897'],slime:['#9bd44e','#6ca12d'],mummy:['#d5c096','#b79e73'],spider:['#8c6bc6','#5a4097'],imp:['#d97e44','#b94f25'],zombie:['#8ea96e','#65824b'],drummer:['#c96f39','#93481d'],bat:['#7b6dff','#5145aa'],wizard:['#6fd8ff','#3298bf'],eye:['#e07247','#a53d1f']};
    return c[type]||['#d8d0c0','#a39b8d'];
  },
  drawGuard(g){
    const ctx=this.ctx; const def=GUARDS[g.type]||{}; const sc=g.drawScale||1;
    if(this.run.act>=1&&this.run.act<=5) return; // act1-5：怪物以整張大圖呈現，本體為隱形判定點
    const img=this._mobSpriteFor(g);
    if(img){ const nw=img.naturalWidth,nh=img.naturalHeight; const Hh=g.r*3.6*sc, Ww=Hh*nw/nh; const bob=Math.sin(this.t*2.0+(g.slot||0))*3; const foot=g.y+g.r*0.5;
      ctx.save(); ctx.globalAlpha=g.phased?0.5:1;
      if(g.elite){ const rg=ctx.createRadialGradient(g.x,g.y,8,g.x,g.y,Ww*0.7); rg.addColorStop(0,'rgba(255,204,110,0.22)'); rg.addColorStop(1,'rgba(255,204,110,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(g.x,g.y,Ww*0.7,0,TAU); ctx.fill(); }
      this.shadow(g.x,foot,Ww*0.32,0.26);
      if(g.frozen){ ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle='#6fd8ff'; ctx.beginPath(); ctx.ellipse(g.x,foot-Hh*0.45,Ww*0.5,Hh*0.5,0,0,TAU); ctx.fill(); ctx.restore(); }
      ctx.drawImage(img, g.x-Ww/2, foot+bob-Hh, Ww, Hh);
      if(g.flash>0){ ctx.globalAlpha=g.flash*0.6; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(g.x,foot-Hh*0.4,Ww*0.4,Hh*0.4,0,0,TAU); ctx.fill(); }
      ctx.restore(); this.drawGuardTags(g); return; }
    // fallback procedural (其他幕 / sprite 未載入)
    const bob=Math.sin(this.t*2.4+(g.slot||0))*4; const pal=this._guardPalette(def.body); const base=g.r;
    ctx.save(); ctx.translate(g.x,g.y); ctx.scale(sc,sc); ctx.globalAlpha=g.phased?0.45:1; this.shadow(0,base*0.95,base*0.95,0.22);
    this._bean(0,-base*0.06+bob,base*1.08,base*(g.elite?1.72:1.58),pal[0],{lw:6,seed:21,wob:2,lean:2});
    ctx.fillStyle='#11100f'; ctx.beginPath(); ctx.arc(-base*0.22,-base*0.24+bob,base*0.08,0,TAU); ctx.arc(base*0.22,-base*0.24+bob,base*0.08,0,TAU); ctx.fill();
    if(g.flash>0){ ctx.globalAlpha=g.flash*0.65; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,base*1.05,0,TAU); ctx.fill(); }
    ctx.restore(); this.drawGuardTags(g);
  },
  drawGuardTags(g){ /* 場上不再畫浮動血量/預告，改右上角 drawMobBars() */ },
  drawEnemyTableauBackdrop(){
    const ctx=this.ctx; const host=this.run.host; const gy=host.baseY-10;
    const rg=ctx.createRadialGradient(host.x-80,gy-120,50,host.x-80,gy-120,420);
    rg.addColorStop(0,'rgba(30,22,18,0.0)'); rg.addColorStop(0.6,'rgba(22,14,10,0.18)'); rg.addColorStop(1,'rgba(8,6,5,0.0)');
    ctx.fillStyle=rg; ctx.beginPath(); ctx.ellipse(host.x-120,gy-60,480,280,0,0,TAU); ctx.fill();
  },
  _ensureBattleBg(act){ this._battleBg=this._battleBg||{}; if(this._battleBg[act]===undefined){ try{ if(act>=1&&act<=5){ const im=new Image(); im.onerror=()=>{im._err=true;}; im.onload=()=>{try{if(this.screen==='battle'&&this.render)this.render();}catch(e){}}; im.src='/assets/battle/act'+act+'_bg.webp'; this._battleBg[act]=im; } else this._battleBg[act]=null; }catch(e){ this._battleBg[act]=null; } } return this._battleBg[act]; }
  ,_MOB_COUNTS:{1:10,2:12,3:18,4:15,5:22}
  ,_ensureMobSprites(){ return []; }
  ,_mobSpriteFor(){ return null; }
  ,_ensureMobGroup(){ return null; }
  ,_ensureSandbag(act){ const sb=SANDBAGS[act]; if(!sb) return null; this._sbImg=this._sbImg||{}; if(this._sbImg[act]===undefined){ try{ const im=new Image(); im.onerror=()=>{im._err=true;}; im.onload=()=>{try{if(this.screen==='battle'&&this.render)this.render();}catch(e){}}; im.src=sb.file; this._sbImg[act]=im; }catch(e){ this._sbImg[act]=null; } } return this._sbImg[act]; }
  ,drawSandbag(){ const ctx=this.ctx; const run=this.run; const im=this._ensureSandbag(run.act); if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const nw=im.naturalWidth, nh=im.naturalHeight; let H=BH*0.82, W=H*nw/nh; const maxW=BW*0.5; if(W>maxW){ W=maxW; H=W*nh/nw; }
    const cx=(this.save.settings.lefty? (36+W/2) : (BW-36-W/2)), by=BH-18;
    { const sg=run.guards&&run.guards.find&&run.guards.find(g=>g.sandbag); if(sg){ sg.x=sg.bx=cx; sg.y=sg.by=by-H*0.46; sg.r=W*0.32; } }
    ctx.save();
    const sh=ctx.createRadialGradient(cx,by-8,24,cx,by-8,W*0.5); sh.addColorStop(0,'rgba(0,0,0,0.55)'); sh.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.5,H*0.08,0,0,TAU); ctx.fill();
    let lp=0; if(run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(clamp(tt,0,1)*Math.PI); }
    if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.05,1+lp*0.05); ctx.translate(-cx-lp*48,-by); }
    ctx.drawImage(im, cx-W/2, by-H, W, H);
    if(run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.5,run._mobHitFlash*0.7); ctx.drawImage(im, cx-W/2, by-H, W, H); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; }
    ctx.restore();
  }
  ,drawMobGroup(){ const ctx=this.ctx; const run=this.run; const im=this._ensureMobGroup(); if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const nw=im.naturalWidth, nh=im.naturalHeight; const maxH=BH*0.6, maxW=BW*0.6; let H=maxH, W=H*nw/nh; if(W>maxW){ W=maxW; H=W*nh/nw; }
    const cx=BW*0.66, by=BH-26; // 右下角、與英雄同一水平（腳底貼底）
    ctx.save();
    // 接地陰影：讓大圖不再像貼上去的
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.46); sh.addColorStop(0,'rgba(0,0,0,0.5)'); sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.46,H*0.085,0,0,TAU); ctx.fill();
    let lp=0; if(run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(clamp(tt,0,1)*Math.PI); }
    if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.07,1+lp*0.07); ctx.translate(-cx-lp*70,-by); } // 往左（主角方向）前撲＋脹大
    if(run.corrupt){ const cp=0.6+0.4*Math.sin((this.t||0)*4); const ag=ctx.createRadialGradient(cx,by-H*0.52,W*0.06,cx,by-H*0.52,W*0.62); ag.addColorStop(0,'rgba(225,40,32,'+(0.5*cp).toFixed(3)+')'); ag.addColorStop(0.5,'rgba(150,22,24,'+(0.24*cp).toFixed(3)+')'); ag.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=ag; ctx.beginPath(); ctx.ellipse(cx,by-H*0.52,W*0.62,H*0.64,0,0,TAU); ctx.fill(); }
    ctx.drawImage(im, cx-W/2, by-H, W, H);
    if(run.corrupt){ const cp=0.6+0.4*Math.sin((this.t||0)*4); ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.16+0.16*cp; ctx.shadowColor='#ff2a22'; ctx.shadowBlur=48; ctx.drawImage(im, cx-W/2, by-H, W, H); ctx.shadowBlur=20; ctx.globalAlpha=0.10+0.10*cp; ctx.drawImage(im, cx-W/2, by-H, W, H); ctx.restore();
      if(!this.save.settings.reduceMotion && (this.t|0)!==(this._corrEmberT|0)){ this._corrEmberT=this.t; for(let e=0;e<3;e++){ this.spawn(cx+rand(-W*0.4,W*0.4), by-rand(10,H*0.5), rand(-12,12), rand(-90,-150), rand(0.7,1.3), rand(2,4), chance(0.5)?'#ff5a2a':'#ffae5a', {glow:true,g:-30,drag:0.99}); } } }
    if(run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.55,run._mobHitFlash*0.7); ctx.drawImage(im, cx-W/2, by-H, W, H); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; } ctx.restore(); }
  ,drawSpeedHUD(){ const ctx=this.ctx; const run=this.run; const IT=this.insT||0; const cx=BW/2; const y=IT+14;
    const mx=run.shotClockMax||10; const frac=clamp((run.shotClock||0)/mx,0,1); const low=(run.shotClock||0)<3;
    this.text('投進 '+(run.speedScore||0)+' 球', cx, y+34, 36, '#ffe7b0', {align:'center',weight:'900'});
    const bw=440, bx=cx-bw/2, by=y+50, bh=22;
    this.rr(bx,by,bw,bh,11); ctx.fillStyle='rgba(8,5,3,0.72)'; ctx.fill();
    if(frac>0){ this.rr(bx,by,bw*frac,bh,11); ctx.fillStyle=low?'#ff3322':(frac<0.5?'#e0a032':'#39ad39'); ctx.fill(); }
    ctx.lineWidth=2.4; ctx.strokeStyle=low?'rgba(255,80,60,0.9)':'rgba(230,192,104,0.45)'; this.rr(bx,by,bw,bh,11); ctx.stroke();
    const _chance=Math.max(0,Math.ceil(run.hp/Math.max(1,Math.ceil(run.maxhp/5))));
    this.text('出手倒數 '+(run.shotClock>0?run.shotClock.toFixed(1):'0.0')+'s　·　機會 '+_chance, cx, by+bh+30, 26, (low||_chance<=1)?'#ff6a4a':'#ecdfc4', {align:'center',weight:'800'});
  }
  ,drawMobBars(){ const ctx=this.ctx; const run=this.run; const live=run.guards.filter(g=>!g.dead); if(!live.length) return;
    const IR=this.insR||0, IT=this.insT||0;
    const pw=300, x=BW-IR-pw-14; let y=IT+14;
    const elites=live.filter(g=>g.elite).sort((a,b)=>(a.hp/a.maxhp)-(b.hp/b.maxhp));
    const fodder=live.filter(g=>!g.elite);
    // 精英：各一條大金條（蓄招時邊框轉橙＋⚠）
    const eH=48;
    for(const g of elites){ const def=GUARDS[g.type]||{}; const frac=clamp(g.hp/g.maxhp,0,1); const warn=(g.casting||g.cast>0);
      this.rr(x,y,pw,eH,11); ctx.fillStyle='rgba(8,5,3,0.82)'; ctx.fill();
      if(frac>0){ this.rr(x,y,pw*frac,eH,11); ctx.fillStyle='#e0b030'; ctx.fill(); }
      ctx.lineWidth=warn?3.6:2.8; ctx.strokeStyle=warn?'rgba(255,140,70,0.97)':'rgba(255,210,110,0.95)'; this.rr(x,y,pw,eH,11); ctx.stroke();
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1;
      const nm=(warn?'⚠ ':'★ ')+(def.name||'精英'); this.text(this._clip?this._clip(nm,pw-120,29,'900'):nm, x+16, y+eH-16, 29,'#fff3df',{weight:'900'});
      this.text(Math.max(0,Math.ceil(g.hp))+'/'+Math.ceil(g.maxhp), x+pw-15, y+eH-16, 26,'#fff',{align:'right',weight:'900'});
      ctx.restore(); y+=eH+9;
    }
    // 雜魚：聚合成一條
    if(fodder.length){ const hp=fodder.reduce((a,b)=>a+Math.max(0,b.hp),0), mhp=fodder.reduce((a,b)=>a+b.maxhp,0)||1; const frac=clamp(hp/mhp,0,1); const fH=44;
      this.rr(x,y,pw,fH,11); ctx.fillStyle='rgba(8,5,3,0.7)'; ctx.fill();
      if(frac>0){ this.rr(x,y,pw*frac,fH,11); ctx.fillStyle='rgba(155,120,72,0.82)'; ctx.fill(); }
      ctx.lineWidth=2.2; ctx.strokeStyle='rgba(180,150,90,0.55)'; this.rr(x,y,pw,fH,11); ctx.stroke();
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=3;
      this.text('雜魚 ×'+fodder.length, x+16, y+fH-15, 27,'#ecdfc2',{weight:'800'});
      this.text(Math.ceil(hp), x+pw-15, y+fH-15, 24,'#d4c49a',{align:'right',weight:'800'});
      ctx.restore(); y+=fH+9;
    }
    // Boss 波數
    if(run.stage&&run.stage.boss){ const ph=(run.host&&run.host.phase)||1; const tot=(run.stage.waves||3)+1;
      this.text('第 '+Math.min(ph,tot)+'／'+tot+' 波', x+pw, y+8, 22,'#caa840',{align:'right',weight:'800'}); }
  }
  ,drawEliteTelegraphs(){ const run=this.run; if(!run||!run.guards)return;
    for(const g of run.guards){ if(g.dead||!g.elite)continue; const footY=g.y+g.r*0.5;
      if(g.eliteEff==='armor'){ if(g.shieldUp) this._footTele(g.x, footY, '🛡 鐵壁', '#cdbfa0', g.eliteCounter||'空心或擦板破甲', -1, null); continue; }
      if(!g.eliteMove||!g.castMax||g.castMax<=0||g.frozen)continue;
      if(!(g.cast>0||g.casting))continue;
      const frac=clamp((g.cast||0)/g.castMax,0,1);
      const title=(g.casting?'⚠ ':'▶ ')+(g.eliteName||'蠻擊')+' '+(g.cast||0)+'/'+g.castMax;
      this._footTele(g.x, footY, title, g.casting?'#ff7a3c':'#ffc266', g.eliteCounter||'空心打斷', frac, g.casting?'#ff5a2a':'#ffc266');
    }
  }
  ,_footTele(x,footY,title,titleCol,sub,frac,fracCol){ const ctx=this.ctx;
    const chars=Math.max(title.length, sub?(sub.length+3):0);
    const w=Math.max(210, chars*23+54), h=sub?80:54; let bx=clamp(x-w/2,8,BW-w-8); const by=footY+8;
    this.rr(bx,by,w,h,12); ctx.fillStyle='rgba(12,7,4,0.84)'; ctx.fill(); ctx.lineWidth=2.6; ctx.strokeStyle=titleCol; this.rr(bx,by,w,h,12); ctx.stroke();
    this.text(title, bx+w/2, by+30, 31, titleCol, {align:'center',weight:'800'});
    if(sub) this.text('破解：'+sub, bx+w/2, by+58, 23, '#bfe6ff', {align:'center',weight:'700'});
    if(frac>=0){ const yb=by+h-7; this.rr(bx+9,yb,(w-18)*clamp(frac,0,1),5,3); ctx.fillStyle=fracCol||titleCol; ctx.fill(); }
  }
  ,drawBossThreat(){ const run=this.run; if(!run||!run.stage||!run.stage.boss||!run.boss)return; const B=run.boss; const ph=(run.host&&run.host.phase)||1; const act=run.act;
    const sub=this._bossSub();
    const useBell=act===1||sub==='bell', useTax=act===2||sub==='tax', useBoard=act===3||sub==='board', useFoul=act===4||sub==='foul';
    const every=Math.max(2,4-(ph-1));
    let title='',col='#ffc266',frac=-1,counter='';
    if(useFoul && B.foulType){ title='⚠ 禁'+(B.foulType==='swish'?'空心':'擦板')+'（本球）'; col='#ffe14d'; counter='改用另一種投法進球'; }
    else if(useBell){ if(B.bellArmed){ title='🔔 限時進球!'; col='#ffd86a'; counter='這一球必須進'; } else { title='🔔 鐘響倒數'; col='#ffd86a'; frac=(B.bellCount||0)/every; counter='保持進球節奏'; } }
    else if(useTax){ title='💰 收租倒數'; col='#e0b030'; frac=(B.taxCount||0)/every; counter='先補滿護盾'; }
    else if(useBoard){ const th=every; title='📋 失誤 '+(B.missStreak||0)+'/'+th; col='#9ac63f'; frac=(B.missStreak||0)/th; counter='別連續失手'; }
    else if(useFoul){ title='⚠ 判罰倒數'; col='#ffe14d'; frac=(B.foulCount||0)/every; counter='待會看預告換投法'; }
    if(!title)return;
    const H=run.host; const fx=(H&&H.x)||BW/2, fy=(H&&H.baseY)||BH*0.5;
    this._footTele(fx, fy+30, (act===5?'【狂暴】':'')+title, col, counter, frac, col);
  }
  ,drawBattle(){
    const ctx=this.ctx; const run=this.run; if(!run){ this.go('hub'); return; }
    const _bg=this._ensureBattleBg(run.act); const _hasBg=!!(_bg&&_bg.complete&&_bg.naturalWidth&&!_bg._err);
    if(_hasBg){ this._coverImg(_bg,0,0,BW,BH); }
    ctx.save(); const cz=this.cam.zoom; ctx.translate(BW/2,BH); ctx.scale(cz,cz); ctx.translate(-BW/2,-BH+this.cam.y);
    if(run.shake>0&&!this.save.settings.reduceMotion) ctx.translate(rand(-run.shake,run.shake),rand(-run.shake,run.shake));
    if(!_hasBg) this.backdrop(ACTS[run.act-1].key);
    this.drawCourt(); this.drawEnemyTableauBackdrop(); if(this.run.sandbag) this.drawSandbag(); else this.drawMobGroup();
    const ordered=[...run.guards].filter(g=>!g.dead).sort((a,b)=>(a.layer||0)-(b.layer||0)||a.y-b.y);
    for(const g of ordered){ if((g.layer||0)<=0) this.drawGuard(g); }
    this.drawHostAndHoop();
    for(const g of ordered){ if((g.layer||0)>0) this.drawGuard(g); }
    this.drawEliteTelegraphs();
    this.drawBossThreat();
    this.drawBattleFx(); this.drawHeroPlayer(); this.drawBall(); this.drawAim(); ctx.restore();
    this.drawFx();
    this.drawBallIndicator();
    if(run.hitFlash>0){ const a=clamp(run.hitFlash,0,1)*0.5; const g=ctx.createRadialGradient(BW/2,BH/2,BH*0.3,BW/2,BH/2,BW*0.7); g.addColorStop(0,'rgba(196,52,42,0)'); g.addColorStop(1,'rgba(196,52,42,'+a+')'); ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH); }
    if(run._scoreFlash>0){ const a=clamp(run._scoreFlash,0,1)*0.4; ctx.save(); ctx.globalCompositeOperation='lighter'; const gf=ctx.createRadialGradient(BW/2,BH*0.4,BH*0.1,BW/2,BH*0.4,BW*0.6); gf.addColorStop(0,'rgba(255,220,140,'+a+')'); gf.addColorStop(1,'rgba(255,200,100,0)'); ctx.fillStyle=gf; ctx.fillRect(0,0,BW,BH); ctx.restore(); }
    this.drawHUD(); if(run.speed) this.drawSpeedHUD(); else this.drawMobBars(); if(run.banner) this.drawBanner(); if(run.tutorial) this.drawTutorial(); if(run.modal) this.drawModal(); if(this._detailOpen) this.drawHeroDetail(); if(this._paused) this.drawPause();
  },
  drawHostAndHoop(){
    const ctx=this.ctx; const run=this.run; const host=run.host; const H=run.hoop; const A=ACTS[run.act-1];
    // 無宿主：籃框自由漂浮、不掛任何人、不畫手臂
    const rx=H.rimR, lit=H.lit||0, glow=H.glow||0, rt=H.rimThick;
    // 籃板（右側掛板）
    const bw=Math.max(H.boardW+22,30), bh=H.boardH+18, bx=H.x+rx+4, by=H.y-bh*0.5;
    ctx.save();
    this.rr(bx,by,bw,bh,11); const bgr=ctx.createLinearGradient(bx,by,bx+bw,by+bh); bgr.addColorStop(0,'#2b2436'); bgr.addColorStop(1,'#1d1828'); ctx.fillStyle=bgr; ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='#5a4d68'; this.rr(bx,by,bw,bh,11); ctx.stroke();
    this.rr(bx+6,by+6,bw-12,bh-12,7); ctx.lineWidth=2; ctx.strokeStyle='rgba(255,214,150,'+(0.22+glow*0.5)+')'; ctx.stroke();
    ctx.globalAlpha=0.5+glow*0.5; ctx.strokeStyle=A.rune; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(bx+bw/2,H.y,11,0,TAU); ctx.stroke();
    ctx.restore();
    // 光暈
    const pr=rx+24+Math.sin(this.t*2)*4; const rg=ctx.createRadialGradient(H.x,H.y,8,H.x,H.y,pr*1.6); rg.addColorStop(0,`rgba(255,160,70,${0.34+lit*0.4})`); rg.addColorStop(0.6,'rgba(120,40,40,0.12)'); rg.addColorStop(1,'rgba(120,40,40,0)'); ctx.save(); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(H.x,H.y,pr*1.6,0,TAU); ctx.fill(); ctx.restore();
    // 網子（2D 梯形＋菱形網格）
    const topL=H.x-rx, topR=H.x+rx, netH=H.netH, botHalf=rx*0.5, sway=(H.net||0)*Math.sin(this.t*16);
    const botL=H.x-botHalf+sway, botR=H.x+botHalf+sway, botY=H.y+netH;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(topL,H.y); ctx.lineTo(topR,H.y); ctx.lineTo(botR,botY); ctx.lineTo(botL,botY); ctx.closePath(); ctx.clip();
    ctx.strokeStyle=`rgba(244,236,218,${0.66+lit*0.26})`; ctx.lineWidth=2;
    const step=20;
    for(let xx=topL-netH; xx<topR+netH; xx+=step){ ctx.beginPath(); ctx.moveTo(xx,H.y-6); ctx.lineTo(xx+netH,botY+6); ctx.stroke(); }
    for(let xx=topL-netH; xx<topR+netH; xx+=step){ ctx.beginPath(); ctx.moveTo(xx,H.y-6); ctx.lineTo(xx-netH,botY+6); ctx.stroke(); }
    ctx.restore();
    // 網邊（兩側斜邊收口）
    ctx.save(); ctx.strokeStyle=`rgba(255,246,228,${0.7+lit*0.22})`; ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(topL,H.y); ctx.lineTo(botL,botY); ctx.moveTo(topR,H.y); ctx.lineTo(botR,botY); ctx.moveTo(botL,botY); ctx.lineTo(botR,botY); ctx.stroke();
    ctx.restore();
    // 籃圈（2D 平面橘桿）
    ctx.save(); ctx.lineCap='round';
    ctx.lineWidth=rt*2+5; ctx.strokeStyle='#160f0a'; ctx.beginPath(); ctx.moveTo(topL,H.y); ctx.lineTo(topR,H.y); ctx.stroke();
    ctx.lineWidth=rt*2; ctx.strokeStyle=lit>0.3?'#ffd980':'#ff8a36'; ctx.shadowBlur=14+glow*22; ctx.shadowColor='#ff7a3c'; ctx.beginPath(); ctx.moveTo(topL,H.y); ctx.lineTo(topR,H.y); ctx.stroke(); ctx.shadowBlur=0;
    ctx.lineWidth=2.4; ctx.strokeStyle=`rgba(255,245,210,${0.5+lit*0.4})`; ctx.beginPath(); ctx.moveTo(topL+6,H.y-rt*0.55); ctx.lineTo(topR-6,H.y-rt*0.55); ctx.stroke();
    for(const ex of [topL,topR]){ ctx.beginPath(); ctx.arc(ex,H.y,rt+3,0,TAU); ctx.fillStyle='#ffcaa0'; ctx.fill(); ctx.lineWidth=3.5; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); }
    ctx.restore();
    if(run.tutorial||(!this.save.settings.lowPerf&&run.shots<3)){ this.text(H.label||'',H.x,H.y-bh*0.5-16,18,'#a2926e',{align:'center'}); }
  },
});

// ============================================================
// PHASE 6 — 完整架構迴路 (等級/金幣/商店/天賦/共用BD池/技能結算器)
// ============================================================

// ---- 共用 BD 池 (七英雄共用，無職業綁定) ----
const COMMON_UPGRADES=[
  // 攻擊（通用，所有英雄每次進球皆生效）
  {id:'power',   name:'重砲出手', type:'攻擊', desc:'投籃傷害 +12%（通用）', mod:'allDmgMul', delta:0.12, maxStack:5},
  {id:'sweep',   name:'掃堂腿',   type:'攻擊', desc:'每次進球額外波及 1 名怪（通用）', mod:'flatExtraHit', delta:1, maxStack:2},
  {id:'ench_lt', name:'雷殛附魔', type:'攻擊', desc:'進球後閃電鏈擊最近數隻怪，每隻 10 傷害', mod:'enchLightning', delta:1, maxStack:3},
  {id:'ench_fr', name:'焚化附魔', type:'攻擊', desc:'進球後使命中的怪燃燒（每秒傷害 3 秒）', mod:'enchFire', delta:1, maxStack:3},
  {id:'ench_ic', name:'凜霜附魔', type:'攻擊', desc:'進球後追加冰傷並凍結最近數隻怪', mod:'enchIce', delta:1, maxStack:3},
  {id:'swishzeal',name:'空心狂熱', type:'攻擊', desc:'空心進球傷害 +12%', mod:'swishMul', delta:0.12, maxStack:3},
  {id:'bankfaith',name:'擦板信仰', type:'攻擊', desc:'擦板進球傷害 +12%', mod:'bankMul', delta:0.12, maxStack:3},
  {id:'luckydisc',name:'幸運球徒', type:'攻擊', desc:'幸運球傷害 +12%', mod:'luckyMul', delta:0.12, maxStack:3},
  {id:'swishhunt',name:'空心追擊', type:'攻擊', desc:'空心進球額外打 1 名怪', mod:'swishExtra', delta:1, maxStack:2},
  {id:'bankwave', name:'擦板震波', type:'攻擊', desc:'擦板進球追加小範圍 AoE', mod:'bankAoe', delta:1, maxStack:2},
  {id:'luckyfin', name:'幸運補刀', type:'攻擊', desc:'幸運球對低血怪追加傷害', mod:'luckyExecute', delta:1, maxStack:2},
  {id:'chainb',   name:'連鎖彈跳', type:'攻擊', desc:'每次進球 20% 機率額外打 1 名怪', mod:'extraChainChance', delta:0.20, cap:0.6, maxStack:3},
  {id:'reap',     name:'殘血收割', type:'攻擊', desc:'對 30% 血量以下的怪 +20% 傷害', mod:'executeMul', delta:0.20, cap:0.6, maxStack:3},
  // 投籃
  {id:'nearfocus',name:'近框壓制', type:'投籃', desc:'近/貼框傷害 +12%', mod:'nearMul', delta:0.12, maxStack:3},
  {id:'farfocus', name:'遠框狙擊', type:'投籃', desc:'遠框傷害 +12%', mod:'farMul', delta:0.12, maxStack:3},
  {id:'combo',    name:'連進節奏', type:'投籃', desc:'連續進球傷害 +5%，最多 5 層', mod:'comboDmgPerStack', delta:0.05, cap:0.05, maxStack:1},
  {id:'memory',   name:'球路記憶', type:'投籃', desc:'預測軌跡最低值 +5%（不改物理）', mod:'minPreviewBonus', delta:0.05, cap:0.20, maxStack:3},
  // 生存
  {id:'heal',     name:'熱血回填', type:'生存', desc:'立即恢復 25% 體力', instant:true},
  {id:'shield',   name:'臨場護盾', type:'生存', desc:'立即獲得 20 護盾', instant:true},
  {id:'ironhide', name:'厚皮球衣', type:'生存', desc:'本局受傷 -8%', mod:'damageReduce', delta:0.08, cap:0.45, maxStack:3},
  {id:'entrysh',  name:'入場護盾', type:'生存', desc:'每關開始 +10 護盾', mod:'stageStartShield', delta:10, maxStack:3},
  {id:'regen',    name:'回血板凳', type:'生存', desc:'每關開始回 4% 體力', mod:'stageStartHeal', delta:0.04, cap:0.15, maxStack:3},
  {id:'missbuf',  name:'失誤緩衝', type:'生存', desc:'投失後獲得 5 護盾', mod:'missShield', delta:5, maxStack:3},
  // 經濟
  {id:'learner',  name:'學習曲線', type:'成長', desc:'XP +10%', mod:'xpMul', delta:0.10, maxStack:3},
];
const UPMAP=Object.fromEntries(COMMON_UPGRADES.map(u=>[u.id,u]));
const COMMON_RELICS=RELICS; // 聖物已全部共通化、無 hero 綁定 (見 §五)

// ---- 商店品項 (局內金幣) ----
const SHOP_ITEMS=[
  {id:'towel', name:'熱血毛巾', cost:30, desc:'回復 25% 最大生命'},
  {id:'tshield',name:'臨時護盾', cost:25, desc:'獲得 20 護盾'},
  {id:'reroll', name:'重抽獎勵券', cost:40, desc:'下一次成長可重抽一次'},
  {id:'secret', name:'共用秘寶', cost:60, desc:'隨機獲得一個共用 BD 效果'},
  {id:'soul',   name:'籃魂兌換', cost:50, desc:'換 10 永久籃魂幣'},
];

// ---- 天賦樹資料 (方案A：每英雄 3 條主題線 × 7 格，暗黑式逐格爬) ----
// 一條線 7 格 row0..6；tier: row 2/4=mid、row6=big(英雄異變壓頂)、其餘 small。逐格需先解上一格。
const _KS={fireMul:'火球',iceMul:'冰球',lightningMul:'閃電',swishMul:'空心',bankMul:'擦板',luckyMul:'幸運',nearMul:'近框',farMul:'遠框',maxhp:'生命',startShield:'護盾',goldMul:'金幣',xpMul:'XP',damageReduce:'減傷',stageStartHeal:'回血'};
function _laneNodes(hid, li, lane){ // lane: {name,col,key,step,mid,big}
  const out=[]; const labelKey=_KS[lane.key]||lane.name; const isPct=lane.step<1;
  const fmt=(v)=> isPct? (lane.key==='damageReduce'||lane.key==='stageStartHeal'? '受傷/回血 +'+Math.round(v*100)+'%' : labelKey+' +'+Math.round(v*100)+'%') : (lane.key==='maxhp'?'最大生命 +'+v:(lane.key==='startShield'?'初始護盾 +'+v:labelKey+' +'+v));
  const rows=[ {t:'small',v:lane.step},{t:'small',v:lane.step},{t:'mid',v:lane.mid},{t:'small',alt:1},{t:'mid',v:lane.mid},{t:'small',v:lane.step},{t:'big'} ];
  for(let r=0;r<7;r++){ const row=rows[r]; const id=hid+'_'+li+'_'+r;
    if(row.t==='big'){ out.push({id, lane:li, row:r, tier:'big', name:lane.big.name, desc:lane.big.desc, eff:lane.big.eff, col:lane.col, laneName:lane.name}); }
    else if(row.alt){ out.push({id, lane:li, row:r, tier:'small', name:lane.name+'·韌', desc:'最大生命 +8', eff:{maxhp:8}, col:lane.col, laneName:lane.name}); }
    else { const eff={}; eff[lane.key]=row.v; out.push({id, lane:li, row:r, tier:row.t, name:lane.name+(row.t==='mid'?'·精':'·基'), desc:fmt(row.v), eff, col:lane.col, laneName:lane.name}); }
  }
  return out;
}
const HERO_LANES={
  shade:[ {name:'空心',col:'#6b86e8',key:'swishMul',step:0.05,mid:0.10,big:{name:'影步空心',desc:'空心傷害 +20%',eff:{swishMul:0.20}}},
          {name:'影步',col:'#9a7fe0',key:'nearMul',step:0.05,mid:0.10,big:{name:'鬼影追擊',desc:'空心進球額外打 1 名怪',eff:{swishExtra:1}}},
          {name:'連擊',col:'#c08ad0',key:'luckyMul',step:0.05,mid:0.10,big:{name:'連影',desc:'連進節奏上限 +5%',eff:{comboDmgPerStack:0.05}}} ],
  bone:[  {name:'擊殺',col:'#79c06a',key:'lightningMul',step:0.05,mid:0.10,big:{name:'亡者學費',desc:'擊殺 XP +50%',eff:{killXpMul:0.5}}},
          {name:'骨鏈',col:'#e0853c',key:'fireMul',step:0.05,mid:0.10,big:{name:'骨鏈增幅',desc:'連鎖彈跳 +20%',eff:{extraChainChance:0.20}}},
          {name:'屍噬',col:'#9aa86a',key:'damageReduce',step:0.03,mid:0.05,big:{name:'屍噬回血',desc:'擊殺回 1 生命',eff:{killHeal:1}}} ],
  archer:[{name:'遠射',col:'#2f8a78',key:'farMul',step:0.05,mid:0.10,big:{name:'荒原視野',desc:'遠框傷害 +15%',eff:{farMul:0.15}}},
          {name:'穿透',col:'#6fb0a0',key:'swishMul',step:0.05,mid:0.10,big:{name:'貫穿瞄準',desc:'空心進球額外打 1 名怪',eff:{swishExtra:1}}},
          {name:'獵殺',col:'#d7a945',key:'luckyMul',step:0.05,mid:0.10,big:{name:'精準致命',desc:'幸運進球傷害 +25%',eff:{luckyMul:0.25}}} ],
  axer:[  {name:'板魂',col:'#b5483f',key:'bankMul',step:0.05,mid:0.10,big:{name:'板魂狂暴',desc:'板魂爆發 +30%→+45%',eff:{boardBuffBonus:0.15}}},
          {name:'蠻力',col:'#d06a3a',key:'nearMul',step:0.05,mid:0.10,big:{name:'雙重板魂',desc:'擦板進球額外小範圍斧爆',eff:{bankAoe:1}}},
          {name:'羞辱',col:'#c0705a',key:'damageReduce',step:0.03,mid:0.05,big:{name:'鐵框護體',desc:'擦板進球獲得 6 護盾',eff:{bankShield:6}}} ],
  whistle:[{name:'護盾',col:'#aeb4b3',key:'startShield',step:5,mid:8,big:{name:'開場聖盾',desc:'開局 +15 護盾',eff:{startShield:15}}},
          {name:'減傷',col:'#8fa0b0',key:'damageReduce',step:0.03,mid:0.05,big:{name:'聖盾庇護',desc:'本局受傷 -10%',eff:{damageReduce:0.10}}},
          {name:'容錯',col:'#9aa0a8',key:'maxhp',step:8,mid:12,big:{name:'再裝一次死',desc:'每關首次投失免傷',eff:{missImmune:1}}} ],
  elem:[  {name:'火',col:'#ff7a3c',key:'fireMul',step:0.05,mid:0.10,big:{name:'焚盡',desc:'火球傷害 +15%',eff:{fireMul:0.15}}},
          {name:'冰',col:'#6fd8ff',key:'iceMul',step:0.05,mid:0.10,big:{name:'凝霜',desc:'冰球傷害 +15%',eff:{iceMul:0.15}}},
          {name:'雷',col:'#ffe14d',key:'lightningMul',step:0.05,mid:0.10,big:{name:'元素溢散',desc:'首球元素必觸發爆裂',eff:{firstElemBurst:1}}} ],
  beast:[ {name:'回復',col:'#c85e20',key:'stageStartHeal',step:0.03,mid:0.04,big:{name:'每場回神',desc:'每關開始回 5% 體力',eff:{stageStartHeal:0.05}}},
          {name:'近框',col:'#d8843a',key:'nearMul',step:0.05,mid:0.10,big:{name:'貼框直覺',desc:'近框傷害 +15%',eff:{nearMul:0.15}}},
          {name:'撿板',col:'#e0a050',key:'xpMul',step:0.05,mid:0.08,big:{name:'撿板狂熱',desc:'XP +15%',eff:{xpMul:0.15}}} ],
};
const TALENT_TREES={}; HEROES.forEach(h=>{ const lanes=HERO_LANES[h.id]||HERO_LANES.axer; const nodes=[]; lanes.forEach((lane,li)=>{ _laneNodes(h.id,li,lane).forEach(n=>nodes.push(n)); }); TALENT_TREES[h.id]=nodes; });

// ---- 聖物隨機素質 (Phase 6.2) ----
const RELIC_AFFIXES=[
  {key:'fireMul',label:'火球',pct:1,min:0.04,max:0.18},{key:'iceMul',label:'冰球',pct:1,min:0.04,max:0.18},
  {key:'lightningMul',label:'閃電',pct:1,min:0.04,max:0.18},{key:'swishMul',label:'空心',pct:1,min:0.04,max:0.18},
  {key:'bankMul',label:'擦板',pct:1,min:0.04,max:0.18},{key:'luckyMul',label:'幸運',pct:1,min:0.04,max:0.18},
  {key:'nearMul',label:'近框',pct:1,min:0.04,max:0.18},{key:'farMul',label:'遠框',pct:1,min:0.04,max:0.18},
  {key:'allDmgMul',label:'全傷害',pct:1,min:0.03,max:0.12},{key:'xpMul',label:'XP',pct:1,min:0.05,max:0.20},
  {key:'damageReduce',label:'減傷',pct:1,min:0.03,max:0.10},
  {key:'maxhp',label:'生命',pct:0,min:5,max:18},{key:'startShield',label:'護盾',pct:0,min:4,max:14},
];
function _qualTier(q){ return q>=33?2:(q>=16?1:0); } // 0普通(白) 1精良(藍) 2稀有(金)
const QUAL_NAME=['普通','精良','稀有'], QUAL_COL=['#cfc6b0','#6b9fe8','#e6b94a'];

// ---- profile (永久存檔, localStorage) ----
const PROFILE_KEY='hb_profile_v2';
function defaultProfile(){ return { heroes:{}, relicMeta:{}, heroDay:{key:'',stats:{}} }; }
function loadProfileRaw(){ try{ const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null'); if(p&&typeof p==='object'){ if(!p.heroes)p.heroes={}; if(!p.relicMeta)p.relicMeta={}; if(!p.heroDay||typeof p.heroDay!=='object')p.heroDay={key:'',stats:{}}; if(!p.heroDay.stats)p.heroDay.stats={}; return p; } }catch(e){} return defaultProfile(); }
function saveProfileRaw(p){ try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }catch(e){} }

Object.assign(Game.prototype,{
  // ===== profile =====
  _dbg(){ return { COMMON_UPGRADES, COMMON_RELICS, UPMAP, TALENT_TREES, HERO_LANES, HEROES, INTERFERENCES, POS_POOL, SHOP_ITEMS, RELIC_AFFIXES }; },
  _loadProfile(){ if(!this.profile) this.profile=loadProfileRaw(); return this.profile; },
  _saveProfile(){ if(this.profile) saveProfileRaw(this.profile); },
  _mp(mode){ const s=this.save; mode=mode||'std'; if(!s.modeProg)s.modeProg={}; if(!s.modeProg[mode])s.modeProg[mode]={acts:1,marks:{},bossClears:{},heat:{},memory:{},nodeProg:{}}; return s.modeProg[mode]; },
  _unlockedActs(){ if(this.save.admin) return ACTS.length; return Math.max(this._mp('fast').acts||1, this._mp('std').acts||1, this._mp('corrupt').acts||1); },
  _modeActs(mode){ if(this.save.admin) return ACTS.length; return this._mp(mode).acts||1; },
  _nodeProg(act){ if(this.save.admin) return 4; const mp=this._mp(this._selRoute||'std'); return (mp.nodeProg&&mp.nodeProg[act])|0; },
  // ===== 遊戲內排版模式 (layout tuner) =====
  _layout(){ if(!this._lay){ try{ this._lay=JSON.parse(localStorage.getItem('hb_layout_v1')||'{}')||{}; }catch(e){ this._lay={}; } } return this._lay; },
  _saveLayout(){ try{ localStorage.setItem('hb_layout_v1', JSON.stringify(this._layout())); }catch(e){} },
  _lv(id, def){ const v=Object.assign({},def); const o=this._layout()[id]; if(o)Object.assign(v,o); return v; },
  // 在排版模式下：畫手把 + 註冊點選；dx,dy=設計空間錨點，U=art->design 倍率
  _lh(id, dx, dy, U){ if(!this.save.layoutMode)return; (this._layIds=this._layIds||[]).push(id); const ctx=this.ctx; const seld=this._laySel===id;
    ctx.save(); ctx.beginPath(); ctx.arc(dx,dy,11*U,0,TAU); ctx.fillStyle= seld?'#39ff88':'rgba(57,255,136,0.55)'; ctx.fill(); ctx.lineWidth=2*U; ctx.strokeStyle='#0b3'; ctx.stroke();
    if(seld){ ctx.beginPath(); ctx.arc(dx,dy,18*U,0,TAU); ctx.strokeStyle='#39ff88'; ctx.lineWidth=2*U; ctx.stroke(); } ctx.restore();
    this.btn(dx-24*U,dy-24*U,48*U,48*U,'lh_'+id,()=>{ this._laySel=id; this.audio.sfx('ui'); this.render(); }); },
  _layCycle(d){ const ids=this._layIds||[]; if(!ids.length)return; let i=ids.indexOf(this._laySel); i=(i+d+ids.length)%ids.length; this._laySel=ids[i]; this.audio.sfx('ui'); this.render(); },
  _layNudge(dx,dy){ const id=this._laySel; if(!id)return; const lay=this._layout(); const cur=lay[id]||{}; lay[id]=Object.assign({},cur); if(dx)lay[id].x=(lay[id].x!=null?lay[id].x:(this._layDef(id).x||0))+dx; if(dy)lay[id].y=(lay[id].y!=null?lay[id].y:(this._layDef(id).y||0))+dy; this._saveLayout(); this.render(); },
  _laySize(d){ const id=this._laySel; if(!id)return; const lay=this._layout(); const def=this._layDef(id); const cur=lay[id]||{}; lay[id]=Object.assign({},cur); const base=(lay[id].s!=null?lay[id].s:(def.s||20)); lay[id].s=Math.max(8,base+d); this._saveLayout(); this.render(); },
  _layDef(id){ return (this._layDefs&&this._layDefs[id])||{}; },
  _layReset(){ const lay=this._layout(); const pre=(this._layScreen||'')+'.'; let n=0; for(const k of Object.keys(lay)){ if(k.indexOf(pre)===0){ delete lay[k]; n++; } } this._saveLayout(); this.toast('已重設本頁版位','('+n+' 項)'); this.render(); },
  _layExport(){ const json=JSON.stringify(this._layout(),null,1); try{ navigator.clipboard&&navigator.clipboard.writeText(json); }catch(e){}
    try{ let ta=document.getElementById('hb_layout_export'); if(!ta){ const wrap=document.createElement('div'); wrap.id='hb_layout_export_wrap'; wrap.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.8);display:flex;flex-direction:column;padding:18px;gap:10px';
      ta=document.createElement('textarea'); ta.id='hb_layout_export'; ta.readOnly=true; ta.style.cssText='flex:1;width:100%;background:#0d0a14;color:#bfe;font:12px ui-monospace,monospace;border:1px solid #2e2740;border-radius:8px;padding:10px';
      const bar=document.createElement('div'); bar.style.cssText='display:flex;gap:10px';
      const cp=document.createElement('button'); cp.textContent='全選複製'; cp.style.cssText='flex:1;padding:14px;font-size:16px;font-weight:800;border-radius:8px;border:0;background:#9ac63f;color:#15210a';
      const cl=document.createElement('button'); cl.textContent='關閉'; cl.style.cssText='flex:1;padding:14px;font-size:16px;font-weight:800;border-radius:8px;border:0;background:#3a2d1c;color:#e9dfc9';
      cp.onclick=()=>{ ta.select(); try{document.execCommand('copy');}catch(e){} try{navigator.clipboard.writeText(ta.value);}catch(e){} };
      cl.onclick=()=>{ wrap.remove(); }; bar.appendChild(cp); bar.appendChild(cl); wrap.appendChild(ta); wrap.appendChild(bar); document.body.appendChild(wrap); }
      else { document.getElementById('hb_layout_export_wrap').style.display='flex'; }
      ta.value=json; ta.focus(); ta.select();
    }catch(e){ this.toast('匯出失敗', String(e&&e.message||e)); } },
  drawLayoutBar(){ const ctx=this.ctx; const barH=176, y0=BH-barH;
    ctx.save(); ctx.fillStyle='rgba(8,16,8,0.94)'; ctx.fillRect(0,y0,BW,barH); ctx.strokeStyle='rgba(57,255,136,0.55)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,y0); ctx.lineTo(BW,y0); ctx.stroke(); ctx.restore();
    const id=this._laySel, def=this._layDef(id)||{}, cur=Object.assign({},def,this._layout()[id]||{});
    this.text('🎯 排版模式', 24, y0+34, 30,'#9fffb0',{weight:'800'});
    this.text(id? id : '點綠點或用下方循環選元件', 200, y0+34, 24, id?'#dfffe0':'#bfe6c8',{weight:'700',baseline:'alphabetic'});
    if(id) this.text('x '+Math.round(cur.x||0)+'   y '+Math.round(cur.y||0)+(def.s!=null?'   字級 '+Math.round(cur.s||0):''), 24, y0+72, 22,'#bfe6c8',{baseline:'alphabetic'});
    // 元件循環
    const cyW=70, cyy=y0+92; const cyc=(lx,lbl,fn,bid)=>{ this.rr(lx,cyy,cyW,52,9); ctx.fillStyle='rgba(40,50,30,0.95)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(120,200,100,0.6)'; ctx.stroke(); this.text(lbl,lx+cyW/2,cyy+26,26,'#dfffd0',{align:'center',baseline:'middle',weight:'800'}); this.btn(lx,cyy,cyW,52,bid,fn); };
    cyc(24,'‹',()=>this._layCycle(-1),'lcyL'); cyc(24+cyW+8,'›',()=>this._layCycle(1),'lcyR');
    // 步進
    const steps=[1,5,10]; this._layStep=this._layStep||5;
    for(let i=0;i<3;i++){ const bx=200+i*78, by=y0+92; this.rr(bx,by,70,52,9); ctx.fillStyle=this._layStep===steps[i]?'#9ac63f':'rgba(40,40,30,0.9)'; ctx.fill(); this.text(steps[i]+'',bx+35,by+26,22,this._layStep===steps[i]?'#15210a':'#cfe0b8',{align:'center',baseline:'middle',weight:'800'}); ((s)=>this.btn(bx,by,70,52,'lstep'+s,()=>{this._layStep=s;this.render();}))(steps[i]); }
    // 十字鍵
    const padX=470, padY=y0+44, k=52, g=8; const mk=(lx,ly,lbl,fn,bid)=>{ this.rr(lx,ly,k,k,9); ctx.fillStyle='rgba(40,50,30,0.95)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(120,200,100,0.6)'; ctx.stroke(); this.text(lbl,lx+k/2,ly+k/2,26,'#dfffd0',{align:'center',baseline:'middle',weight:'800'}); this.btn(lx,ly,k,k,bid,fn); };
    mk(padX+k+g,padY,'▲',()=>this._layNudge(0,-this._layStep),'lU'); mk(padX,padY+k+g,'◀',()=>this._layNudge(-this._layStep,0),'lL'); mk(padX+(k+g)*2,padY+k+g,'▶',()=>this._layNudge(this._layStep,0),'lR'); mk(padX+k+g,padY+(k+g)*2,'▼',()=>this._layNudge(0,this._layStep),'lD');
    // 字級 +/-
    const szX=padX+(k+g)*3+30, szY=padY+k+g; mk(szX,szY,'A-',()=>this._laySize(-this._layStep),'lSm'); mk(szX+k+g,szY,'A+',()=>this._laySize(this._layStep),'lSp');
    // 右側功能鈕
    const fns=[['匯出版位','#9ac63f','#15210a',()=>this._layExport()],['重設本頁','#3a2d1c','#e9dfc9',()=>this._layReset()],['離開','#5a2418','#f0d0c0',()=>{ this.save.layoutMode=false; persist(this.save); this._laySel=null; this.toast('已離開排版模式'); this.render(); }]];
    const fw=190; for(let i=0;i<3;i++){ const fx=BW-fw-20, fy=y0+16+i*50; const [lbl,bg,fg,fn]=fns[i]; this.rr(fx,fy,fw,44,9); ctx.fillStyle=bg; ctx.fill(); this.text(lbl,fx+fw/2,fy+22,22,fg,{align:'center',baseline:'middle',weight:'800'}); this.btn(fx,fy,fw,44,'lfn'+i,fn); }
  },
  _heroProg(id){ const p=this._loadProfile(); if(!p.heroes[id]) p.heroes[id]={level:1,xp:0,talents:{}}; const h=p.heroes[id]; if(typeof h.level!=='number')h.level=1; if(typeof h.xp!=='number')h.xp=0; if(!h.talents)h.talents={}; if(typeof h.shots!=='number')h.shots=0; if(typeof h.swishes!=='number')h.swishes=0; if(typeof h.banks!=='number')h.banks=0; if(typeof h.misses!=='number')h.misses=0; return h; },
  // ----- 天賦點 (每 10 等 1 點) -----
  _talentPtsEarned(id){ return Math.min(10, Math.floor(this._heroProg(id).level/10)); },
  _talentPtsSpent(id){ const t=this._heroProg(id).talents; return Object.keys(t).filter(k=>t[k]).length; },
  _talentPtsAvail(id){ return this._talentPtsEarned(id)-this._talentPtsSpent(id); },
  _talentUnlocked(id,nodeId){ return !!this._heroProg(id).talents[nodeId]; },
  _talentNodeLocked(id,node){
    const pr=this._talentPrereqLock(id,node); if(pr) return pr;
    if(this._talentPtsAvail(id)<=0) return '天賦點不足'; return null; },
  _buyTalent(id,node){ if(this._talentUnlocked(id,node.id)){ return; }
    const lk=this._talentNodeLocked(id,node); if(lk){ this.toast(lk); this.audio.sfx('hurt'); return; }
    const prog=this._heroProg(id); prog.talents[node.id]=true; this._saveProfile(); this.audio.sfx('levelup'); this.render(); },
  _talentPrereqLock(id,node){ if(node.row===0) return null; const tree=TALENT_TREES[id]||[]; const prevCol=tree.some(n=>n.row===node.row-1&&this._talentUnlocked(id,n.id)); return prevCol? null : '需先解前一列'; },
  _refundTalent(id,node){ if(!this._talentUnlocked(id,node.id)){ return; }
    const tree=TALENT_TREES[id]||[];
    const nextColUnlocked=tree.some(n=>n.row===node.row+1&&this._talentUnlocked(id,n.id));
    const otherSameCol=tree.some(n=>n.row===node.row&&n.id!==node.id&&this._talentUnlocked(id,n.id));
    if(nextColUnlocked&&!otherSameCol){ this.toast('需先退回後面的節點'); this.audio.sfx('hurt'); return; }
    const prog=this._heroProg(id); delete prog.talents[node.id]; this._saveProfile(); this.audio.sfx('ui'); this.render(); },
  _openTalentSheet(id,node){ this._talSheet={heroId:id,nodeId:node.id}; this.audio.sfx('ui'); this.render(); },
  drawTalentSheet(){ const ctx=this.ctx; const sh=this._talSheet; if(!sh){ return; }
    const id=sh.heroId, tree=TALENT_TREES[id]||[]; const node=tree.find(n=>n.id===sh.nodeId); if(!node){ this._talSheet=null; return; }
    const lanes=HERO_LANES[id]||HERO_LANES.axer; const lane=lanes[node.lane]||{name:'',col:'#e6c068'};
    const unlocked=this._talentUnlocked(id,node.id); const prereq=this._talentPrereqLock(id,node); const avail=this._talentPtsAvail(id);
    const big=node.tier==='big';
    // scrim
    ctx.save(); ctx.fillStyle='rgba(2,1,4,0.66)'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    this.btn(0,0,BW,BH,'talsheetscrim',()=>{ this._talSheet=null; this.render(); });
    const w=720, x=BW/2-w/2; const hh=300, y=BH/2-hh/2;
    this.panel(x,y,w,hh,{r:18,c0:'rgba(30,22,14,0.99)',c1:'rgba(15,10,6,0.99)',lw:2});
    ctx.save(); ctx.fillStyle=lane.col; this.rr(x,y,7,hh,4); ctx.fill(); ctx.restore();
    this.text((big?'★ ':'')+lane.name+'線 · '+node.name, x+30, y+44, 28, lane.col,{weight:'800'});
    this.text(unlocked?'✓ 已學':(prereq?prereq:(avail>0?'可學（消耗 1 點）':'天賦點不足')), x+w-58, y+44, 20, unlocked?'#6fae4a':(prereq||avail<=0?'#c98b5c':'#9fe6ff'),{align:'right',weight:'700'});
    this.wrap(node.desc, BW/2, y+104, w-80, 34, '#cfc6b0', 24,'center');
    // buttons
    const bw=260, bh=72, gap=28, by=y+hh-bh-26, bx0=BW/2-bw-gap/2, bx1=BW/2+gap/2;
    if(unlocked){
      this.button(bx0,by,bw,bh,'退回 +1 點','talrefund',()=>{ this._refundTalent(id,node); },{size:26,color:'#e88a5a',weight:'800'});
      this.button(bx1,by,bw,bh,'關閉','talsheetclose',()=>{ this._talSheet=null; this.render(); },{size:26});
    } else {
      const can=!prereq&&avail>0;
      if(can){ this.button(bx0,by,bw,bh,'確認學習','talconfirm',()=>{ this._buyTalent(id,node); this._talSheet=null; this.render(); },{primary:true,size:26,weight:'800'}); }
      else { ctx.save(); ctx.globalAlpha=0.5; this.rr(bx0,by,bw,bh,12); ctx.fillStyle='rgba(60,46,26,0.6)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(200,160,70,0.4)'; ctx.stroke(); ctx.restore(); this.text(prereq?prereq:'天賦點不足', bx0+bw/2, by+bh/2, 22,'#a99c80',{align:'center',baseline:'middle',weight:'700'}); }
      this.button(bx1,by,bw,bh,'關閉','talsheetclose',()=>{ this._talSheet=null; this.render(); },{size:26});
    }
    // close X
    const cs=24,cxb=x+w-cs-16,cyb=y+16; ctx.save(); ctx.strokeStyle='#e6c068'; ctx.lineWidth=3; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(cxb,cyb); ctx.lineTo(cxb+cs,cyb+cs); ctx.moveTo(cxb+cs,cyb); ctx.lineTo(cxb,cyb+cs); ctx.stroke(); ctx.restore();
    this.btn(cxb-12,cyb-12,cs+24,cs+24,'talsheetx',()=>{ this._talSheet=null; this.render(); });
  },
  // ----- 今日命中率 (per-hero, 每日重置) -----
  _dayKey(){ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); },
  _heroDay(id){ const p=this._loadProfile(); const k=this._dayKey(); if(p.heroDay.key!==k){ p.heroDay.key=k; p.heroDay.stats={}; } if(!p.heroDay.stats[id]) p.heroDay.stats[id]={shots:0,makes:0}; return p.heroDay.stats[id]; },
  _recordShot(id,made,type){ if(this.save.admin)return; const d=this._heroDay(id); d.shots++; if(made)d.makes++;
    const h=this._heroProg(id); h.shots=(h.shots||0)+1; if(!made)h.misses=(h.misses||0)+1; else if(type==='swish')h.swishes=(h.swishes||0)+1; else if(type==='bank')h.banks=(h.banks||0)+1;
    this._saveProfile(); },
  _heroDayAcc(id){ const d=this._heroDay(id); return d.shots>0? d.makes/d.shots : 0; },
  // ----- 聖物隨機素質 -----
  _rollRelicMeta(id, qMin, qMax){ const q=randi(qMin||5, qMax||50); const tier=_qualTier(q); const nAff=tier+1; const pool=RELIC_AFFIXES.slice(); const aff=[];
    for(let i=0;i<nAff&&pool.length;i++){ const a=pool.splice(randi(0,pool.length-1),1)[0]; const t=(q/50); const v=a.min+(a.max-a.min)*t*(0.7+Math.random()*0.3); aff.push({key:a.key,label:a.label,pct:a.pct,val:a.pct?Math.round(v*100)/100:Math.round(v)}); }
    return {q,tier,affixes:aff}; },
  _setRelicMetaBiased(id,qMin,qMax){ const p=this._loadProfile(); p.relicMeta[id]=this._rollRelicMeta(id,qMin,qMax); this._saveProfile(); return p.relicMeta[id]; },
  _relicMeta(id){ const p=this._loadProfile(); if(!p.relicMeta[id]){ p.relicMeta[id]=this._rollRelicMeta(id); this._saveProfile(); } return p.relicMeta[id]; },
  _rerollRelicMeta(id){ const p=this._loadProfile(); p.relicMeta[id]=this._rollRelicMeta(id); this._saveProfile(); return p.relicMeta[id]; },
  _applyRelicAffixesToRun(run){ const m=run.mods; const seen={}; for(const id of (run.loadout||[])){ if(!id||seen[id])continue; seen[id]=1; const meta=this._relicMeta(id); for(const a of meta.affixes){ if(a.key==='maxhp'){ run.maxhp+=a.val; run.hp=run.maxhp; } else if(a.key==='startShield'){ run.shield+=a.val; } else if(a.key==='goldMul'){ m.bonusGoldMul+=a.val; } else if(a.key==='damageReduce'){ m.damageReduce=Math.min(0.6,m.damageReduce+a.val); } else if(m[a.key]!=null){ m[a.key]+=a.val; } } } },
  // ----- 天賦效果彙整 + 套用 (含等級/天賦/聖物素質) -----
  _getHeroTalentEffects(id){ const eff={maxhp:0,startShield:0,goldMul:0,xpMul:0,fireMul:0,iceMul:0,lightningMul:0,swishMul:0,bankMul:0,luckyMul:0,nearMul:0,farMul:0,
      swishExtra:0,bankAoe:0,extraChainChance:0,comboDmgPerStack:0,killGoldBonus:0,stageStartHeal:0,damageReduce:0,
      boardBuffBonus:0,bankShield:0,killHeal:0,killXpMul:0,missImmune:0,firstElemBurst:0,bossDmg:0,firstMakeDmg:0,actGold:0,shopDisc:0,rerollPlus:0,missShieldStage:0 };
    const tree=TALENT_TREES[id]||[]; const t=this._heroProg(id).talents;
    for(const node of tree){ if(t[node.id]){ for(const k in node.eff){ eff[k]=(eff[k]||0)+node.eff[k]; } } }
    return eff; },
  _applyTalentEffectsToRun(run){ const eff=this._getHeroTalentEffects(run.heroId); run._talentEff=eff; const m=run.mods;
    run.maxhp+=eff.maxhp||0; run.hp=run.maxhp; run.shield+=(eff.startShield||0);
    m.fireMul+=eff.fireMul; m.iceMul+=eff.iceMul; m.lightningMul+=eff.lightningMul;
    m.swishMul+=eff.swishMul; m.bankMul+=eff.bankMul; m.luckyMul+=eff.luckyMul;
    m.nearMul+=eff.nearMul; m.farMul+=eff.farMul;
    m.bonusGoldMul+=eff.goldMul; m.xpMul+=eff.xpMul;
    m.swishExtra+=eff.swishExtra; m.bankAoe+=eff.bankAoe; m.extraChainChance+=eff.extraChainChance;
    m.comboDmgPerStack=Math.max(m.comboDmgPerStack,eff.comboDmgPerStack); m.killGoldBonus+=eff.killGoldBonus;
    m.stageStartHeal+=eff.stageStartHeal; m.damageReduce=Math.min(0.6,m.damageReduce+eff.damageReduce);
    run.mut={ boardBuffBonus:eff.boardBuffBonus, bankShield:eff.bankShield, killHeal:eff.killHeal, killXpMul:eff.killXpMul,
      missImmune:eff.missImmune, firstElemBurst:eff.firstElemBurst, bossDmg:eff.bossDmg, firstMakeDmg:eff.firstMakeDmg,
      actGold:eff.actGold, shopDisc:eff.shopDisc, rerollPlus:eff.rerollPlus, missShieldStage:eff.missShieldStage };
    // 聖物隨機素質一併套用
    this._applyRelicAffixesToRun(run);
  },

  // ===== 技能傷害結算器 (進球技能必定打到怪) =====
  _getAliveGuards(){ const run=this.run; return run?run.guards.filter(g=>g&&!g.dead):[]; },
  _pickSkillTargets(mode,ctx,n){ const g=this._getAliveGuards(); if(g.length===0) return []; n=n||1; ctx=ctx||{}; const hx=(ctx.hx!=null?ctx.hx:BW/2), hy=(ctx.hy!=null?ctx.hy:BH/2);
    if(mode==='all') return g.slice();
    if(mode==='nearest'){ return g.slice().sort((a,b)=>dist(hx,hy,a.x,a.y)-dist(hx,hy,b.x,b.y)).slice(0,n); }
    if(mode==='farthest'){ return g.slice().sort((a,b)=>dist(hx,hy,b.x,b.y)-dist(hx,hy,a.x,a.y)).slice(0,n); }
    if(mode==='lowhp'){ return g.slice().sort((a,b)=>a.hp-b.hp).slice(0,n); }
    if(mode==='random'){ const c=g.slice(); const out=[]; while(out.length<n&&c.length){ out.push(c.splice(randi(0,c.length-1),1)[0]); } return out; }
    if(mode==='aoe'){ const cx=ctx.cx!=null?ctx.cx:hx, cy=ctx.cy!=null?ctx.cy:hy, rad=ctx.rad||180; return g.filter(x=>dist(cx,cy,x.x,x.y)<rad+x.r); }
    return g.slice(0,n); },
  _dealSkillDamage(targets,dmg,opts){ opts=opts||{}; if(!targets||!targets.length) return 0; let hits=0;
    for(const g of targets){ if(!g||g.dead)continue; this.hurtGuard(g,dmg,opts.ctx||{},!!opts.primary); hits++; }
    return hits; },
  _skillSweep(ctx,spec){ const tg=this._pickSkillTargets(spec.mode,ctx,spec.n); return this._dealSkillDamage(tg,spec.dmg!=null?spec.dmg:ctx.dmg,{ctx,primary:spec.primary}); },

  // ===== shared post-form BD effects (run after BALL_FORMS attack) =====
  _applySharedSkillEffects(ctx){ const run=this.run, m=run.mods; if(!m) return;
    const swish=ctx.swish, bank=ctx.bank, lucky=ctx.lucky;
    // 空心追擊
    if(swish && m.swishExtra>0){ this._skillSweep(ctx,{mode:'nearest',n:m.swishExtra,dmg:ctx.dmg}); }
    // 擦板震波
    if(bank && m.bankAoe>0){ this.aoe(ctx.hx,ctx.hy,160,Math.round(ctx.dmg*0.6),'#e0853c'); }
    // 板魂護腕/異變: 擦板護盾
    if(bank && run.mut && run.mut.bankShield>0){ run.shield+=run.mut.bankShield; }
    // 幸運補刀
    if(lucky && m.luckyExecute>0){ this._skillSweep(ctx,{mode:'lowhp',n:m.luckyExecute,dmg:Math.round(ctx.dmg*0.6)}); }
    // 連鎖彈跳
    if(m.extraChainChance>0 && chance(Math.min(0.6,m.extraChainChance))){ this._skillSweep(ctx,{mode:'random',n:1,dmg:Math.round(ctx.dmg*0.8)}); }
    // 掃堂腿：通用額外波及（不分球種/進球方式）
    if(m.flatExtraHit>0){ this._skillSweep(ctx,{mode:'nearest',n:m.flatExtraHit,dmg:Math.round(ctx.dmg*0.8)}); }
    // 元素附魔（通用，與球種無關，每次進球後觸發）
    if(m.enchLightning>0){ const tg=this._pickSkillTargets('nearest',ctx,1+m.enchLightning); let prev={x:ctx.hx,y:ctx.hy}; for(const g of tg){ this.beam(prev.x,prev.y,g,'#ffe14d'); this.hurtGuard(g,10,ctx); prev=g; } }
    if(m.enchFire>0){ const tg=this._pickSkillTargets('nearest',ctx,2); for(const g of tg){ if(!g||g.dead)continue; g.burn=Math.max(g.burn||0,3); g.burnDps=Math.max(g.burnDps||0,4*m.enchFire); this.burst(g.x,g.y,5,'#ff7a3c',150,0.5,{glow:true,r:3,g:-30}); } }
    if(m.enchIce>0){ const tg=this._pickSkillTargets('nearest',ctx,1+m.enchIce); for(const g of tg){ if(!g||g.dead)continue; this.beam(ctx.hx,ctx.hy,g,'#6fd8ff'); this.hurtGuard(g,8,ctx); g.frozen=true; g.freeze=Math.max(g.freeze||0,1.5); } }
    // 元素溢散 (首球元素必爆)
    if(run.mut && run.mut.firstElemBurst>0 && !run._firstElemDone && (run.form==='fire'||run.form==='ice'||run.form==='lightning')){ run._firstElemDone=true; this.aoe(ctx.hx,ctx.hy,200,Math.round(ctx.dmg*0.5),'#ffb070'); }
  },

  // ===== 共用升級套用 (reward / levelup / shop 共用) =====
  _applyUpgrade(def){ const run=this.run; if(!def) return;
    if(def.instant){ if(def.id==='heal') this.heal(Math.round(run.maxhp*0.25)); else if(def.id==='shield') run.shield=(run.shield||0)+20; return; }
    const max=def.maxStack||3, cur=run.modStacks[def.id]||0; if(cur>=max) return;
    run.modStacks[def.id]=cur+1; run.mods[def.mod]+=def.delta;
    const cap=(def.cap!=null)?def.cap:(def.mod==='fireMul'||def.mod==='iceMul'||def.mod==='lightningMul'||def.mod==='swishMul'||def.mod==='bankMul'||def.mod==='luckyMul'||def.mod==='nearMul'||def.mod==='farMul'||def.mod==='allDmgMul')?(1+max*def.delta):undefined;
    if(cap!=null) run.mods[def.mod]=Math.min(cap,run.mods[def.mod]);
    if(run.rewardLog) run.rewardLog.push(def.name);
  },
  _rollUpgradePool(n){ n=n||3; const run=this.run; const elig=COMMON_UPGRADES.filter(u=>{ if(u.instant) return true; return (run.modStacks[u.id]||0)<(u.maxStack||3); });
    const pool=elig.slice(), out=[]; while(out.length<n && pool.length){ out.push(pool.splice(randi(0,pool.length-1),1)[0].id); }
    while(out.length<n) out.push('heal'); return out; },

  // ===== level-up (共用 BD 池, modal) =====
  chooseUpgrade(id){ const run=this.run; const def=UPMAP[id]; this._applyUpgrade(def); this.audio.sfx('levelup'); run.modal=null;
    if(run.levelUpsPending>0) this.openLevelUp(); else this.afterModal(); },
  rerollUpgrade(){ const run=this.run; if(!run.modal||run.modal.reroll<=0) return; run.modal.reroll--; run.modal.choices=this._rollUpgradePool(3); this.audio.sfx('ui'); },

  // ===== 金幣 =====
  addRunGold(n){ const run=this.run; if(!run)return; run.gold=(run.gold||0)+n; },
  _clearGold(boss){ const run=this.run; const base=boss?60:20; const mul=1+(run.mods?run.mods.bonusGoldMul:0); return Math.round(base*mul); },

  // ===== 流程: reward 之後 → 商店 or 下一關 =====
  _shouldOpenShop(){ return false; }, // Phase 6.1: 商店先封存，reward 後直接下一關
  _continueAfterReward(){ const run=this.run; if(!run)return;
    if(this._shouldOpenShop()){ run.shopBought={}; this.screen='battle'; this.go('shop'); return; }
    this.screen='battle'; this.enterStage(run.pi+1); },

  // ===== 商店 =====
  drawShop(){ const ctx=this.ctx; const run=this.run; if(!run){ this.go('hub'); return; } this.backdrop('abbey');
    const disc=(run.mut&&run.mut.shopDisc)?run.mut.shopDisc:0;
    this.text('幕間補給站',BW/2,150,60,'#e6c068',{align:'center',weight:'800',glow:16});
    this.text('籃魂的籃框旁，有人擺起了攤子。',BW/2,212,24,'#a2926e',{align:'center'});
    this.text('💰 局內金幣：'+(run.gold||0),BW/2,262,30,'#ffd86a',{align:'center',weight:'800'});
    const items=SHOP_ITEMS; const cw=300,ch=250,gap=28,per=items.length,tw=per*cw+(per-1)*gap,x0=BW/2-tw/2,y0=320;
    for(let i=0;i<items.length;i++){ const it=items[i],x=x0+i*(cw+gap); const cost=Math.max(1,Math.round(it.cost*(1-disc)));
      const bought=run.shopBought&&run.shopBought[it.id]; const afford=(run.gold||0)>=cost && !bought;
      this.panel(x,y0,cw,ch,{r:16});
      this.text(it.name,x+cw/2,y0+58,32,'#ece0c4',{align:'center',weight:'800'});
      this.wrap(it.desc,x+cw/2,y0+102,cw-44,24,'#cfc6b0',20);
      this.text('💰 '+cost,x+cw/2,y0+ch-92,28,afford?'#ffd86a':'#7a6a4a',{align:'center',weight:'800'});
      if(bought){ this.text('已購買',x+cw/2,y0+ch-52,24,'#6fae4a',{align:'center',weight:'700'}); }
      else { this.button(x+28,y0+ch-72,cw-56,54,afford?'購買':'金幣不足','shop_'+it.id,()=>{ if(afford)this._pickShopItem(it.id,cost); else { this.toast('金幣不足'); this.audio.sfx('hurt'); } },afford?{primary:true,size:26}:{size:24}); }
    }
    this.button(BW/2-220,y0+ch+50,440,76,'離開商店 · 下一關','shopnext',()=>{ this.screen='battle'; this.enterStage(run.pi+1); },{primary:true,size:30});
  },
  _pickShopItem(id,cost){ const run=this.run; if(!run||(run.gold||0)<cost) return; const it=SHOP_ITEMS.find(s=>s.id===id); if(!it) return;
    if(run.shopBought&&run.shopBought[id]&&id!=='towel'&&id!=='tshield') return;
    run.gold-=cost; if(!run.shopBought)run.shopBought={}; run.shopBought[id]=true; this.audio.sfx('coin');
    if(id==='towel'){ this.heal(Math.round(run.maxhp*0.25)); run.shopBought.towel=false; }
    else if(id==='tshield'){ run.shield=(run.shield||0)+20; run.shopBought.tshield=false; }
    else if(id==='reroll'){ run._rewardRerollBonus=(run._rewardRerollBonus||0)+1; this.toast('下次成長可重抽'); }
    else if(id==='secret'){ const ids=this._rollUpgradePool(1); this._applyUpgrade(UPMAP[ids[0]]); this.toast('獲得：'+UPMAP[ids[0]].name); }
    else if(id==='soul'){ const p=this._loadProfile(); p.coins+=10; this._saveProfile(); this.toast('+10 籃魂幣'); }
    this.render(); },

  // ===== 天賦樹畫面 =====
  drawTalents(){ const ctx=this.ctx; const hero=HEROES[this._talentHeroIdx!=null?this._talentHeroIdx:Math.max(0,HEROES.findIndex(h=>h.id===this.save.hero))]; if(!hero){ this.go('heroes'); return; }
    this.backdrop('abbey');
    const prog=this._heroProg(hero.id); const avail=this._talentPtsAvail(hero.id), earned=this._talentPtsEarned(hero.id);
    this.text('天賦樹',BW/2,76,52,'#e6c068',{align:'center',weight:'800',glow:14});
    this.text(hero.name+'　·　Lv '+prog.level,BW/2,124,26,hero.col,{align:'center',weight:'700'});
    this.text('天賦點 '+avail+' / '+earned+'　（每 10 等 +1 點，目前 '+(prog.xp|0)+' XP）',BW/2,162,22,avail>0?'#9fe6ff':'#a2926e',{align:'center',weight:'700'});
    this.button(BW/2-380,108,56,52,'‹','tprev',()=>{ this._talSheet=null; this._talentHeroIdx=((this._talentHeroIdx!=null?this._talentHeroIdx:0)-1+HEROES.length)%HEROES.length; this.audio.sfx('ui'); this.render(); },{size:30});
    this.button(BW/2+324,108,56,52,'›','tnext',()=>{ this._talSheet=null; this._talentHeroIdx=((this._talentHeroIdx!=null?this._talentHeroIdx:0)+1)%HEROES.length; this.audio.sfx('ui'); this.render(); },{size:30});
    // 3 lanes
    const lanes=HERO_LANES[hero.id]||HERO_LANES.axer; const tree=TALENT_TREES[hero.id];
    const laneW=300, laneGap=40, totW=3*laneW+2*laneGap, x0=BW/2-totW/2, topY=210;
    const nodeH=68, nodeGap=14;
    for(let li=0;li<3;li++){ const lane=lanes[li]; const lx=x0+li*(laneW+laneGap);
      this.rr(lx,topY-44,laneW,38,10); ctx.fillStyle=this._fade(lane.col,0.18); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=lane.col; ctx.stroke();
      this.text(lane.name+'線',lx+laneW/2,topY-19,24,lane.col,{align:'center',baseline:'middle',weight:'800'});
      const nodes=tree.filter(n=>n.lane===li).sort((a,b)=>a.row-b.row);
      for(let r=0;r<nodes.length;r++){ const node=nodes[r]; const y=topY+r*(nodeH+nodeGap);
        // connector
        if(r>0){ ctx.strokeStyle=this._talentUnlocked(hero.id,node.id)?lane.col:'rgba(120,100,70,0.35)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(lx+laneW/2,y-nodeGap); ctx.lineTo(lx+laneW/2,y); ctx.stroke(); }
        const unlocked=this._talentUnlocked(hero.id,node.id); const lock=this._talentNodeLocked(hero.id,node);
        const big=node.tier==='big', col=lane.col;
        this.rr(lx,y,laneW,nodeH,10); ctx.fillStyle= unlocked?this._fade(col,0.32):(lock?'rgba(16,12,8,0.92)':'rgba(28,20,12,0.96)'); ctx.fill();
        ctx.lineWidth= big?3:2; ctx.strokeStyle= unlocked?col:(lock?'rgba(110,85,55,0.4)':this._fade(col,0.7)); if(unlocked){ctx.shadowBlur=10;ctx.shadowColor=col;} ctx.stroke(); ctx.shadowBlur=0;
        this.text((big?'★ ':'')+node.name,lx+16,y+26,big?21:19,unlocked?col:'#ece0c4',{weight:'800'});
        this.text(node.desc,lx+16,y+50,15,'#cfc6b0');
        const st= unlocked?'✓ 已學':(lock?lock:'可學');
        this.text(st,lx+laneW-16,y+nodeH/2,15, unlocked?'#6fae4a':(lock?'#8c7a5c':'#9fe6ff'),{align:'right',baseline:'middle',weight:'700'});
        ((nd)=>{ this.btn(lx,y,laneW,nodeH,'tal_'+nd.id,()=>this._openTalentSheet(hero.id,nd)); })(node);
      }
    }
    if(this._talSheet) this.drawTalentSheet();
    this.button(BW/2-160,BH-86,320,64,'返回英雄頁','talback',()=>{ this.go('heroes'); },{size:28});
  },
});

// === final activation: daily leaderboard on the final bench screen ===
(function(){
  const baseRecordShot = Game.prototype._recordShot;
  Game.prototype._recordShot=function(id,made,type){
    const result = baseRecordShot ? baseRecordShot.apply(this,arguments) : undefined;
    if(this._syncLeaderboardStats) this._syncLeaderboardStats(false);
    return result;
  };
  Game.prototype._drawFbStatCards=function(LO){
    const U=LO.U,s=this.save,total=this._playerDayTotals?this._playerDayTotals():{shots:0,makes:0};
    const acc=total.shots?Math.round(total.makes/total.shots*100):0;
    this._gothCard(LO.statL,U);
    this._statIcon('target',LO.statL.x+18*U,LO.statL.y+LO.statL.h*0.62,7*U);
    this.text('今日命中', LO.statL.x+14*U, LO.statL.y+16*U, 11*U,'#a2926e');
    this.text(acc+'%', LO.statL.x+32*U, LO.statL.y+LO.statL.h*0.58, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this.text((total.shots||0)+' / '+(total.makes||0), LO.statL.x+LO.statL.w-16*U, LO.statL.y+LO.statL.h*0.58, 10*U,'#9fe024',{align:'right',baseline:'middle',weight:'800'});
    this.text('排行榜 ›', LO.statL.x+LO.statL.w-14*U, LO.statL.y+18*U, 9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
    this.btn(LO.statL.x,LO.statL.y,LO.statL.w,Math.max(44*U,LO.statL.h),'fb_leaderboard',()=>this._openLeaderboard&&this._openLeaderboard());

    this._gothCard(LO.statR,U);
    this._statIcon('crown',LO.statR.x+18*U,LO.statR.y+LO.statR.h*0.62,7*U);
    this.text('無盡最佳', LO.statR.x+14*U, LO.statR.y+16*U, 11*U,'#a2926e');
    this.text(String(s.endlessBest|0), LO.statR.x+32*U, LO.statR.y+LO.statR.h*0.62, 22*U,'#ece0c4',{baseline:'middle',weight:'800'});
  };
})();

// === final activation: restore generated relic backpack after all legacy overrides ===
(function(){
  const state=Game.prototype;
  if(state._drawRelicsGenerated){
    state.drawRelics=state._drawRelicsGenerated;
    state.drawRelicCompare=state._drawRelicCompareGenerated;
    state._selectedEquipFor=state._selectedEquipForGenerated;
    state._equipFromCompare=state._equipFromCompareGenerated;
  }
})();

// === final activation: compact generated relic backpack cards ===
(function(){
  const QUAL=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
  const RARITY=['普通','精良','稀有','史詩','傳說','詛咒傳說'];
  const TABS=['全部','核心','攻擊','防禦','特殊'];
  const SHEETS={
    ball:'icons_balls.png',
    wrist:'icons_wrist.png',
    shoes:'icons_shoes.png',
    charm:'icons_charms.png',
    mask:'icons_masks.png',
    hoop:'icons_hoops.png'
  };
  const state=Game.prototype;

  state._drawRelicSheetIcon=function(type,idx,x,y,w,h,alpha){
    const im=this._relicUiImg(SHEETS[type]||SHEETS.ball);
    const ctx=this.ctx; alpha=alpha==null?1:alpha;
    const side=Math.min(w,h);
    const dx=x+(w-side)/2, dy=y+(h-side)/2;
    if(im&&im.complete&&im.naturalWidth){
      const cols=4, rows=4, sw=im.naturalWidth/cols, sh=im.naturalHeight/rows;
      const sx=(idx%cols)*sw, sy=((idx/cols)|0)*sh;
      ctx.save();
      ctx.globalAlpha=alpha;
      ctx.beginPath();
      this.rr(x,y,w,h,10);
      ctx.clip();
      ctx.drawImage(im,sx,sy,sw,sh,dx,dy,side,side);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha=alpha;
      this.rr(dx,dy,side,side,10);
      ctx.fillStyle='rgba(20,14,9,0.9)';
      ctx.fill();
      ctx.strokeStyle='rgba(215,169,69,0.45)';
      ctx.stroke();
      ctx.restore();
    }
  };

  state._drawRelicCard=function(item,x,y,w,h,o){
    o=o||{};
    const ctx=this.ctx, col=QUAL[item.tier||0]||QUAL[0], pr=this._press({x,y,w,h});
    ctx.save();
    this.rr(x,y,w,h,12);
    const g=ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,'rgba(22,16,12,0.9)');
    g.addColorStop(1,'rgba(4,3,6,0.96)');
    ctx.fillStyle=g;
    ctx.fill();
    ctx.lineWidth=o.selected?4:2.6;
    ctx.strokeStyle=o.selected?'#fff4c2':(o.locked?'rgba(145,130,105,0.28)':col);
    if(o.selected||(!o.locked&&o.equipped)){ ctx.shadowBlur=o.selected?18:10; ctx.shadowColor=col; }
    this.rr(x,y,w,h,12);
    ctx.stroke();
    ctx.shadowBlur=0;
    if(pr){
      ctx.globalAlpha=0.16;
      ctx.fillStyle='#fff';
      this.rr(x+3,y+3,w-6,h-6,10);
      ctx.fill();
      ctx.globalAlpha=1;
    }
    ctx.restore();
    const pad=Math.max(4,Math.min(8,Math.min(w,h)*0.045));
    const side=Math.min(w-pad*2,h-pad*2);
    const ix=x+(w-side)/2, iy=y+(h-side)/2;
    this._drawRelicSheetIcon(item.type,item.idx,ix,iy,side,side,o.locked?0.36:1);
  };

  state._drawRelicLoadoutIcon=function(item,x,y,w,h,o){
    o=o||{};
    const ctx=this.ctx, col=QUAL[item.tier||0]||QUAL[0];
    const side=Math.min(w,h)*0.70;
    const ix=x+w/2-side/2, iy=y+h/2-side/2+2;
    ctx.save();
    ctx.shadowBlur=o.selected?18:10;
    ctx.shadowColor=col;
    this.rr(ix-6,iy-6,side+12,side+12,10);
    ctx.lineWidth=o.selected?4:2.5;
    ctx.strokeStyle=o.selected?'#fff4c2':col;
    ctx.stroke();
    ctx.restore();
    this._drawRelicSheetIcon(item.type,item.idx,ix,iy,side,side,1);
  };

  state.drawRelics=function(){
    const ctx=this.ctx, s=this.save;
    if(!s.loadout)s.loadout=[null,null,null,null,null];
    if(!s.library)s.library=[];
    this.backdrop('hub');
    const bg=this._relicUiImg('backpack_bg.png');
    if(bg&&bg.complete&&bg.naturalWidth) ctx.drawImage(bg,0,0,BW,BH);
    else { ctx.fillStyle='#0b0710'; ctx.fillRect(0,0,BW,BH); }

    const safeL=this.insL||0,safeR=this.insR||0,safeT=this.insT||0;
    this.text('聖物背包',safeL+58,safeT+58,46,'#ffe7a6',{weight:'900',glow:14});
    this.text('裝備 '+s.loadout.filter(Boolean).length+'/5  ·  庫存 '+s.library.length+'/40',safeL+248,safeT+60,22,'#c8b894',{baseline:'middle',weight:'900'});
    this.button(BW-safeR-132,safeT+32,82,58,'×','relic_back',()=>this.go('hub'),{size:36,color:'#f0c0b0'});

    const tab=this._relicTab||'全部';
    const tabW=118, tabH=42, tabGap=8, tabX=safeL+28, tabY=safeT+78;
    for(let ti=0;ti<TABS.length;ti++){
      const tb=TABS[ti], tx=tabX, ty=tabY+ti*(tabH+tabGap), w=tabW;
      this.rr(tx,ty,w,tabH,11);
      ctx.fillStyle=tab===tb?'rgba(184,255,47,0.18)':'rgba(10,7,8,0.66)';
      ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle=tab===tb?'#bfff2f':'rgba(215,169,69,0.38)';
      ctx.stroke();
      this.text(tb,tx+w/2,ty+tabH/2,21,tab===tb?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      ((t,xx,yy,ww)=>this.btn(xx,yy,ww,tabH,'relic_tab_'+t,()=>{this._relicTab=t;this.render();}))(tb,tx,ty,w);
    }

    const tpl=(ax,ay,aw,ah)=>({x:ax*BW/1672,y:ay*BH/941,w:aw*BW/1672,h:ah*BH/941});
    const slots=[
      tpl(353,105,142,126),
      tpl(562,105,142,126),
      tpl(772,105,142,126),
      tpl(977,105,142,126),
      tpl(1181,105,142,126)
    ];
    for(let i=0;i<5;i++){
      const rid=s.loadout[i], r=slots[i], x=r.x, y=r.y, w=r.w, h=r.h;
      if(rid){
        const it=this._relicDisplay(rid,true);
        this._drawRelicLoadoutIcon(it,x,y,w,h,{selected:this._bagSel===rid});
        ((id,rr)=>this.btn(rr.x,rr.y,rr.w,rr.h,'eq_'+i,()=>this._openRelicCompare(id)))(rid,r);
      } else {
        this.text('+',x+w/2,y+h/2-2,46,'rgba(215,169,69,0.48)',{align:'center',baseline:'middle',weight:'700'});
      }
    }

    const owned=[...new Set([...(s.loadout||[]).filter(Boolean),...(s.library||[])])]
      .filter(id=>RELICS[id])
      .map(id=>this._relicDisplay(id,true));
    let catalog=this._allRelicCatalog();
    if(tab!=='全部') catalog=catalog.filter(it=>it.tab===tab || (tab==='核心'&&it.type==='ball'));
    const ownedType=new Set(owned.map(it=>it.type+':'+it.idx));
    const locked=catalog.filter(it=>!ownedType.has(it.type+':'+it.idx));
    const grid=tpl(285,302,1100,392);
    const cols=12, rows=4, cg=8*BW/1672, rg=8*BH/941;
    const cellW=(grid.w-cg*(cols-1))/cols, cellH=(grid.h-rg*(rows-1))/rows;
    const gx=grid.x, gy=grid.y;
    const visible=owned.concat(locked).slice(0,cols*rows);
    for(let i=0;i<visible.length;i++){
      const it=visible[i], x=gx+(i%cols)*(cellW+cg), y=gy+((i/cols)|0)*(cellH+cg);
      const lockedItem=!!it.catalog;
      this._drawRelicCard(it,x,y,cellW,cellH,{locked:lockedItem,selected:this._bagSel===it.id});
      if(!lockedItem) ((id,xx,yy)=>this.btn(xx,yy,cellW,cellH,'bag_'+id,()=>this._openRelicCompare(id)))(it.id,x,y);
    }
    if(this._relicCompare) this.drawRelicCompare();
  };

  state.drawRelicCompare=function(){
    const c=this._relicCompare; if(!c) return;
    const ctx=this.ctx, selected=this._relicDisplay(c.rid,true), current=c.current?this._relicDisplay(c.current,true):null;
    ctx.save();
    ctx.fillStyle='rgba(2,1,5,0.72)';
    ctx.fillRect(-4000,-4000,BW+8000,BH+8000);
    ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'cmp_scrim',()=>{});
    const im=this._relicUiImg('compare_modal.png'), w=1580,h=830,x=BW/2-w/2,y=BH/2-h/2+10;
    if(im&&im.complete&&im.naturalWidth) ctx.drawImage(im,x,y,w,h);
    else this.panel(x,y,w,h,{r:24,stroke:'#d7a945'});
    this.text('裝備比較',BW/2,y+64,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});

    const card=(it,rx,ry,rw,rh,title,col)=>{
      this.text(title,rx+rw/2,ry-26,28,col,{align:'center',baseline:'middle',weight:'900'});
      this.rr(rx,ry,rw,rh,18);
      ctx.fillStyle='rgba(5,4,8,0.54)';
      ctx.fill();
      ctx.lineWidth=3;
      ctx.strokeStyle=it?(QUAL[it.tier]||col):'rgba(160,150,130,0.35)';
      ctx.stroke();
      if(it){
        const side=Math.min(rw*0.5,rh*0.42);
        this._drawRelicSheetIcon(it.type,it.idx,rx+rw/2-side/2,ry+34,side,side,1);
        this.text(it.name,rx+rw/2,ry+rh*0.56,34,QUAL[it.tier]||'#e6c068',{align:'center',baseline:'middle',weight:'900'});
        this.text((RARITY[it.tier]||'普通')+' · '+it.core,rx+rw/2,ry+rh*0.64,22,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
        const af=(it.affixes||[]).slice(0,3);
        for(let i=0;i<3;i++){
          const yy=ry+rh*0.72+i*42;
          const txt=af[i]?('◆ '+af[i].label+' +'+(af[i].pct?Math.round(af[i].val*100)+'%':af[i].val)):(i===0?this._clip(it.desc,rw-90,19,'800'):'');
          if(txt)this.text(txt,rx+54,yy,21,'#efe3ca',{baseline:'middle',weight:'800'});
        }
      } else {
        this.text('空槽',rx+rw/2,ry+rh/2,34,'rgba(210,200,180,0.56)',{align:'center',baseline:'middle',weight:'900'});
      }
    };

    card(current,x+120,y+150,560,500,'裝備中','#bfff2f');
    card(selected,x+w-680,y+150,560,500,'選取聖物','#b980ff');
    this.text('VS',BW/2,y+390,54,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:10});
    const bw=300,bh=78,by=y+h-120;
    this.button(BW/2-bw-36,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
    this.button(BW/2+36,by,bw,bh,current&&current.id===selected.id?'卸下':'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:34,weight:'900'});
  };
})();

// === final activation: mode progression rules and corruption difficulty ===
(function(){
  if(typeof Game==='undefined') return;
  const clampAct=n=>Math.max(0,Math.min(ACTS.length,Number(n)||0));
  const oldModeActs=Game.prototype._modeActs;
  const oldUnlockedActs=Game.prototype._unlockedActs;
  const oldStartRun=Game.prototype.startRun;
  const oldFinishRun=Game.prototype.finishRun;
  const oldSpawnWave=Game.prototype.spawnWave;
  const oldSpawnGuard=Game.prototype.spawnGuard;
  const oldPlayerHurt=Game.prototype.playerHurt;

  Game.prototype._stdClearedActs=function(){
    const mp=this._mp('std'), legacy=Number((this.save&&this.save.acts)||1)||1;
    let n=0;
    for(let a=1;a<=ACTS.length;a++){
      const boss=a+'-boss';
      if((mp.bossClears&&mp.bossClears[boss]>0) || (a<ACTS.length && (mp.acts||1)>a) || (a<ACTS.length && legacy>a)) n=a;
    }
    return clampAct(n);
  };

  Game.prototype._fastUnlockedActs=function(){
    return this._stdClearedActs();
  };

  Game.prototype._corruptUnlockedActs=function(){
    if(this._stdClearedActs()<ACTS.length) return 0;
    const mp=this._mp('corrupt');
    let n=1;
    for(let a=1;a<ACTS.length;a++){
      const boss=a+'-boss';
      if(mp.bossClears&&mp.bossClears[boss]>0) n=Math.max(n,a+1);
    }
    if(mp.bossClears&&mp.bossClears[ACTS.length+'-boss']>0) n=ACTS.length;
    return clampAct(n);
  };

  Game.prototype._normalizeModeProgression=function(){
    if(!this.save||this.save.admin) return;
    const std=this._mp('std'), fast=this._mp('fast'), corrupt=this._mp('corrupt');
    const stdCleared=this._stdClearedActs();
    std.acts=Math.max(1, Math.min(ACTS.length, Math.max(Number(std.acts)||1, Math.min(ACTS.length,stdCleared+1))));
    fast.acts=this._fastUnlockedActs();
    corrupt.acts=this._corruptUnlockedActs();
  };

  Game.prototype._modeActs=function(mode){
    if(this.save&&this.save.admin) return ACTS.length;
    mode=mode||'std';
    if(mode==='fast') return this._fastUnlockedActs();
    if(mode==='corrupt') return this._corruptUnlockedActs();
    if(mode==='std'){
      const mp=this._mp('std');
      const byClear=Math.min(ACTS.length,this._stdClearedActs()+1);
      return Math.max(1,Math.min(ACTS.length,Math.max(Number(mp.acts)||1,byClear)));
    }
    return oldModeActs?oldModeActs.call(this,mode):(this._mp(mode).acts||1);
  };

  Game.prototype._unlockedActs=function(){
    if(this.save&&this.save.admin) return ACTS.length;
    return Math.max(1,this._modeActs('std'),this._modeActs('fast'),this._modeActs('corrupt'));
  };

  Game.prototype.startRun=function(actId,routeType,stoneId,nodeIdx){
    routeType=routeType||'std';
    if(!(this.save&&this.save.admin) && this._modeActs(routeType)<actId){
      const name=routeType==='fast'?'速投線':routeType==='corrupt'?'腐化加時':'標準遠征';
      this.toast('尚未解鎖 '+name,'先完成前置模式通關');
      this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
      this.render&&this.render();
      return;
    }
    return oldStartRun.call(this,actId,routeType,stoneId,nodeIdx);
  };

  Game.prototype.finishRun=function(won){
    const run=this.run;
    const snapshot=run?{
      route:run.route, act:run.act, speed:!!run.speed, admin:!!(this.save&&this.save.admin),
      fastBossClears:Object.assign({},(this._mp('fast').bossClears)||{}),
      fastMarks:Object.assign({},(this._mp('fast').marks)||{}),
      fastHeat:Object.assign({},(this._mp('fast').heat)||{}),
      fastMemory:Object.assign({},(this._mp('fast').memory)||{})
    }:null;
    const r=oldFinishRun.call(this,won);
    if(snapshot&&!snapshot.admin){
      const fast=this._mp('fast'), corrupt=this._mp('corrupt');
      if(snapshot.speed||snapshot.route==='fast'){
        fast.bossClears=snapshot.fastBossClears;
        fast.marks=snapshot.fastMarks;
        fast.heat=snapshot.fastHeat;
        fast.memory=snapshot.fastMemory;
        if(this._endStats) this._endStats.marks=0;
      }
      this._normalizeModeProgression();
      fast.acts=this._fastUnlockedActs();
      corrupt.acts=this._corruptUnlockedActs();
      persist(this.save);
      this._scheduleCloudProgressSync&&this._scheduleCloudProgressSync(false);
    }
    return r;
  };

  Game.prototype.spawnWave=function(n){
    const run=this.run;
    const r=oldSpawnWave.call(this,n);
    if(run&&run.corrupt&&!run.speed&&run.stage&&Array.isArray(run.stage.guards)){
      const extra=Math.max(1,Math.ceil(n*(run.stage.boss?0.35:0.25)));
      for(let i=0;i<extra;i++) this.spawnGuard(pick(run.stage.guards));
    }
    return r;
  };

  Game.prototype.spawnGuard=function(type){
    const g=oldSpawnGuard.call(this,type);
    const run=this.run;
    if(g&&run&&run.corrupt&&!g.sandbag){
      const act=Number(run.act)||1;
      const stageTier=run.stage&&run.stage.boss?1.22:1;
      const hpMul=(1.58+Math.max(0,act-1)*0.08)*stageTier;
      g.maxhp=Math.ceil((g.maxhp||g.hp||1)*hpMul);
      g.hp=Math.ceil((g.hp||g.maxhp)*hpMul);
      g.r=(g.r||20)*1.06;
      g.drawScale=(g.drawScale||1)*1.06;
      if(g.castMax>0) g.castMax=Math.max(1,Math.floor(g.castMax*0.72));
      if(!g.elite && !g.eliteMove && Math.random()<0.26){
        const mv=_eliteMoveFor(type);
        g.elite=true;
        g.eliteMove=mv.id;
        g.eliteEff=mv.eff;
        g.eliteName=mv.name;
        g.eliteCounter=mv.counter;
        g.castMax=mv.charge>0?Math.max(1,mv.charge-1):0;
        if(mv.eff==='armor') g.shieldUp=true;
        g.maxhp=Math.ceil(g.maxhp*1.28);
        g.hp=Math.ceil(g.hp*1.28);
      }
    }
    return g;
  };

  Game.prototype.playerHurt=function(dmg){
    if(this.run&&this.run.corrupt) dmg=Math.ceil((Number(dmg)||0)*1.25);
    return oldPlayerHurt.call(this,dmg);
  };
})();

// === final activation: sampled basketball audio and persistent BGM ===
(function(){
  if(typeof Audio==='undefined') return;
  const SAMPLE_SRC={
    swish:'/assets/audio/sfx_swish.wav',
    floor:'/assets/audio/sfx_ball_floor.wav',
    rim:'/assets/audio/sfx_rim_clank.wav'
  };
  const SAMPLE_VOL={
    swish:0.92,
    score:0.78,
    floor:0.72,
    rim:0.88,
    bank:0.66,
    board:0.46
  };
  const SAMPLE_THROTTLE={rim:70,floor:90,swish:35};
  const clamp01=v=>v<0?0:v>1?1:v;
  const oldSfx=Audio.prototype.sfx;
  const oldStartTheme=Audio.prototype.startTheme;
  const oldResume=Audio.prototype.resume;

  Audio.prototype._sampleName=function(n){
    if(n==='swish'||n==='score') return 'swish';
    if(n==='rim'||n==='bank'||n==='board') return 'rim';
    if(n==='floor') return 'floor';
    return '';
  };
  Audio.prototype._ensureSamples=function(){
    if(this._samplePools) return;
    this._samplePools={};
    this._sampleLast={};
    for(const k in SAMPLE_SRC){
      this._samplePools[k]=[];
      try{
        const a=new window.Audio(SAMPLE_SRC[k]);
        a.preload='auto';
        a.load&&a.load();
        this._samplePools[k].push(a);
      }catch(e){}
    }
  };
  Audio.prototype._playSample=function(n,vol){
    if(!this.enSfx) return false;
    this._ensureSamples();
    const key=this._sampleName(n);
    const pool=this._samplePools&&this._samplePools[key];
    if(!key||!pool||!pool.length) return false;
    const now=(typeof performance!=='undefined'?performance.now():Date.now());
    const last=this._sampleLast[key]||0;
    if(SAMPLE_THROTTLE[key]&&now-last<SAMPLE_THROTTLE[key]) return true;
    this._sampleLast[key]=now;
    let a=pool.find(x=>x.paused||x.ended);
    if(!a&&pool.length<5){
      try{ a=pool[0].cloneNode(true); a.preload='auto'; pool.push(a); }catch(e){}
    }
    if(!a) a=pool[0];
    try{
      a.pause();
      a.currentTime=0;
      a.volume=clamp01((this.enSfx?this.sVol:0)*(vol==null?1:vol));
      const p=a.play();
      if(p&&p.catch)p.catch(()=>{});
      return true;
    }catch(e){ return false; }
  };
  Audio.prototype.sfx=function(n){
    const sample=this._sampleName(n);
    if(sample&&this._playSample(n,SAMPLE_VOL[n]||1)) return;
    return oldSfx.call(this,n);
  };
  Audio.prototype.startTheme=function(key,intense){
    this.ensure();
    const id='song:'+(key||'hub')+(intense?'!':'');
    if(this._theme===id){
      if(this._song&&this._song.paused&&this.enMusic){
        const p=this._song.play();
        if(p&&p.catch)p.catch(()=>{});
      }
      return;
    }
    this.stopTheme();
    this._theme=id;
    if(!this.enMusic) return;
    if(this._startSong()) return;
    this._theme=null;
    return oldStartTheme.call(this,key,intense);
  };
  Audio.prototype.resume=function(){
    const r=oldResume.call(this);
    this._ensureSamples();
    if(this.enMusic&&this._theme&&this._song&&this._song.paused){
      const p=this._song.play();
      if(p&&p.catch)p.catch(()=>{});
    }
    return r;
  };
})();

// === final activation: cloud sync, relic backpack, and contact audio fixes ===
(function(){
  if(typeof Game==='undefined') return;

  const deepClone=v=>{ try{return JSON.parse(JSON.stringify(v));}catch(e){return v;} };
  const ACCOUNT_SELECT='id,player_name,jersey_code,profile_json,profile_updated_at,today_key,today_shots,today_makes,last_login_at';
  const shortErr=e=>{
    const s=String((e&&(e.message||e))||'unknown');
    if(/row-level security|42501/i.test(s)) return 'Supabase RLS policy blocked writes';
    if(/duplicate key|23505/i.test(s)) return 'duplicate account row';
    if(/profile_json/i.test(s)) return 'profile_json column missing';
    return s.slice(0,160);
  };
  const uuid=()=>('10000000-1000-4000-8000-100000000000').replace(/[018]/g,c=>
    (Number(c) ^ ((crypto.getRandomValues(new Uint8Array(1))[0]) & (15 >> (Number(c)/4)))).toString(16)
  );
  const accountFilter=(name,code)=>'?player_name=eq.'+encodeURIComponent(name)+'&jersey_code=eq.'+encodeURIComponent(code||'');

  Game.prototype._cloudHeaders=function(extra){
    const u=this._cloudProgressUrl&&this._cloudProgressUrl();
    const h={apikey:u.cfg.key,Authorization:'Bearer '+u.cfg.key};
    if(extra) for(const k in extra) h[k]=extra[k];
    return h;
  };

  Game.prototype._fetchCloudProgress=async function(name,code){
    const u=this._cloudProgressUrl&&this._cloudProgressUrl();
    if(!u||!name) return {ok:false,reason:'no-config'};
    const q='?select='+ACCOUNT_SELECT+'&player_name=eq.'+encodeURIComponent(name)+'&jersey_code=eq.'+encodeURIComponent(code||'')+'&limit=1';
    const res=await fetch(u.base+q,{headers:this._cloudHeaders()});
    if(!res.ok) throw new Error(await res.text());
    const rows=await res.json();
    return {ok:true,row:rows&&rows[0]||null};
  };

  Game.prototype._writeCloudAccount=async function(name,code,payload){
    const u=this._cloudProgressUrl&&this._cloudProgressUrl();
    if(!u||!name) return {ok:false,reason:'no-config'};
    const rowPayload=Object.assign({},payload||{},{
      player_name:name,
      jersey_code:code||'',
      remember:true,
      last_login_at:new Date().toISOString()
    });
    const existing=await this._fetchCloudProgress(name,code);
    let res;
    if(existing.ok&&existing.row&&existing.row.id){
      res=await fetch(u.base+'?id=eq.'+encodeURIComponent(existing.row.id),{
        method:'PATCH',
        headers:this._cloudHeaders({'Content-Type':'application/json',Prefer:'return=minimal'}),
        body:JSON.stringify(rowPayload)
      });
    } else {
      if(!rowPayload.id) rowPayload.id=(crypto&&crypto.randomUUID)?crypto.randomUUID():uuid();
      res=await fetch(u.base,{
        method:'POST',
        headers:this._cloudHeaders({'Content-Type':'application/json',Prefer:'return=minimal'}),
        body:JSON.stringify(rowPayload)
      });
    }
    if(!res.ok) throw new Error(await res.text());
    this._cloudProgressMissing=false;
    return {ok:true};
  };

  Game.prototype._applyCloudProgressSnapshot=function(remote){
    if(!remote||typeof remote!=='object') return false;
    const rs=remote.save&&typeof remote.save==='object'?remote.save:null;
    let changed=false;
    if(rs){
      const keepLogin=this.save&&this.save.login?deepClone(this.save.login):{name:'',code:'',remember:true};
      const keepSettings=this.save&&this.save.settings?deepClone(this.save.settings):null;
      const keepAdmin=!!(this.save&&this.save.admin);
      const keys=['coins','tutorialDone','hero','relics','loadout','library','acts','marks','heat','memory','bossClears','nodeProg','modeProg','endless','endlessBest','deaths','deathsDay','deathsDayKey','stats'];
      for(const k of keys){
        if(k in rs){ this.save[k]=deepClone(rs[k]); changed=true; }
      }
      this.save.login=keepLogin;
      if(keepSettings) this.save.settings=keepSettings;
      this.save.admin=keepAdmin;
      if(!Array.isArray(this.save.loadout)) this.save.loadout=[null,null,null,null,null];
      if(!Array.isArray(this.save.library)) this.save.library=[];
      persist(this.save);
    }
    if(remote.profile&&typeof remote.profile==='object'){
      this.profile=deepClone(remote.profile);
      try{ saveProfileRaw(this.profile); }catch(e){}
      changed=true;
    }
    return changed;
  };

  Game.prototype._pushCloudProgress=async function(name,code){
    if(!name) return false;
    const snap=this._progressSnapshot();
    const payload={
      profile_json:snap,
      profile_updated_at:snap.updatedAt,
      today_key:this._dayKey&&this._dayKey()
    };
    const totals=this._playerDayTotals?this._playerDayTotals():null;
    if(totals){ payload.today_shots=totals.shots; payload.today_makes=totals.makes; }
    await this._writeCloudAccount(name,code,payload);
    return true;
  };

  Game.prototype._scheduleCloudProgressSync=function(force){
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()), code=String((L.code||'').trim());
    if(!name||this._cloudProgressApplying) return;
    if(this._cloudProgressTimer){ clearTimeout(this._cloudProgressTimer); this._cloudProgressTimer=null; }
    const run=()=>this._pushCloudProgress(name,code).catch(e=>{try{console.warn('[HB cloud progress]',e);}catch(_e){}});
    if(force) run(); else this._cloudProgressTimer=setTimeout(run,900);
  };

  try{
    const oldPersist=persist;
    persist=function(s){
      const r=oldPersist(s);
      try{
        const g=(typeof window!=='undefined'&&window.__HB)||null;
        if(g&&g.save===s&&g._scheduleCloudProgressSync&&!g._cloudProgressApplying) g._scheduleCloudProgressSync(false);
      }catch(e){}
      return r;
    };
  }catch(e){}

  Game.prototype._syncLeaderboardNow=async function(){
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()), code=String((L.code||'').trim());
    if(!name) return false;
    const t=this._playerDayTotals();
    await this._writeCloudAccount(name,code,{
      today_key:t.key,
      today_shots:t.shots,
      today_makes:t.makes
    });
    return true;
  };

  Game.prototype._submitLogin=async function(){
    if(this._loginDraft&&this._loginDraft.busy) return;
    this._syncLoginFields&&this._syncLoginFields();
    const d=this._loginDraft||{}, name=String(d.name||'').trim(), code=String(d.code||'').trim();
    this._loginPressUntil=this.t+0.45;
    if(!name){ this.audio.sfx('hurt'); this.toast('請輸入名字','帳號請填你的名字'); this.render(); return; }
    if(!code){ this.audio.sfx('hurt'); this.toast('請輸入代號','代號可用背號，避免使用個人密碼'); this.render(); return; }
    d.busy=true; d.msg='同步中...'; this.render();
    if(this._loginEls){ try{this._loginEls.name.blur(); this._loginEls.code.blur();}catch(_e){} }
    this.save.login={name,code,remember:true,lastLoginAt:new Date().toISOString()};
    persist(this.save);
    let cloudOk=false, cloudMsg='本機已記住';
    try{
      const remote=await this._fetchCloudProgress(name,code);
      let loaded=false;
      if(remote.ok&&remote.row&&remote.row.profile_json){
        this._cloudProgressApplying=true;
        loaded=this._applyCloudProgressSnapshot(remote.row.profile_json);
        this._cloudProgressApplying=false;
      }
      cloudOk=await this._pushCloudProgress(name,code);
      cloudMsg=loaded?'已載入雲端進度並同步':'已建立/更新雲端存檔';
    }catch(e){
      this._cloudProgressApplying=false;
      cloudMsg='雲端同步失敗：'+shortErr(e);
      try{console.warn('[HB login sync]',e);}catch(_e){}
    }
    d.busy=false;
    this._closeLogin&&this._closeLogin(false);
    this.toast(cloudOk?'登入成功':'已登入，本機保存',cloudMsg);
    if(this._entryLoadingToHub) await this._entryLoadingToHub(cloudMsg);
    else this.go('hub');
  };

  const RELIC_UI='/assets/relic_ui/';
  const RELIC_VER='20260628_relic_fix_v1';
  const RELIC_ASSETS=['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png'];
  const TYPE_LABEL={ball:'籃球',wrist:'護腕',shoes:'鞋靴',charm:'護符',mask:'面具',hoop:'籃框'};
  const QUAL_COL=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
  const QUAL_NAME=['普通','精良','稀有','史詩','傳說','神話'];
  const oldGo=Game.prototype.go;

  Game.prototype._relicUiImg=function(name){
    this._relicUi=this._relicUi||{};
    const key=name+'?v='+RELIC_VER;
    if(this._relicUi[key]!==undefined) return this._relicUi[key];
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{try{ if(this.screen==='relics'||this._bag||this._relicCompare) this.render(); }catch(_e){}};
      im.onerror=()=>{ im._err=true; try{ if(this.screen==='relics'||this._bag) this.render(); }catch(_e){} };
      im.src=RELIC_UI+name+'?v='+RELIC_VER;
      this._relicUi[key]=im;
      return im;
    }catch(e){ this._relicUi[key]=null; return null; }
  };

  Game.prototype._preloadRelicUiAssets=function(){
    for(const a of RELIC_ASSETS) this._relicUiImg(a);
  };

  Game.prototype.go=function(s){
    const r=oldGo.call(this,s);
    if(s==='relics') this._preloadRelicUiAssets();
    return r;
  };

  Game.prototype._drawRelicBackpackFallback=function(){
    const ctx=this.ctx;
    ctx.save();
    ctx.fillStyle='#08050c'; ctx.fillRect(0,0,BW,BH);
    const rg=ctx.createRadialGradient(BW*0.78,BH*0.08,30,BW*0.78,BH*0.08,BW*0.55);
    rg.addColorStop(0,'rgba(126,60,190,0.24)');
    rg.addColorStop(0.45,'rgba(40,14,72,0.18)');
    rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=rg; ctx.fillRect(0,0,BW,BH);
    const panel=(x,y,w,h,r)=>{
      this.rr(x,y,w,h,r||18);
      ctx.fillStyle='rgba(7,5,8,0.72)'; ctx.fill();
      ctx.lineWidth=3; ctx.strokeStyle='rgba(121,82,150,0.72)'; ctx.stroke();
      ctx.lineWidth=1.2; ctx.strokeStyle='rgba(190,255,47,0.26)'; this.rr(x+8,y+8,w-16,h-16,Math.max(4,(r||18)-6)); ctx.stroke();
    };
    panel(220,80,1320,176,20);
    panel(220,292,1320,560,18);
    panel(1600,80,210,770,22);
    ctx.restore();
  };

  Game.prototype.drawRelics=function(){
    const ctx=this.ctx, s=this.save;
    if(!s.loadout)s.loadout=[null,null,null,null,null];
    if(!s.library)s.library=[];
    this.backdrop('hub');
    const bg=this._relicUiImg('backpack_bg.png');
    if(bg&&bg.complete&&bg.naturalWidth&&!bg._err) ctx.drawImage(bg,0,0,BW,BH);
    else this._drawRelicBackpackFallback();
    const safeL=this.insL||0,safeR=this.insR||0,safeT=this.insT||0;
    this.text('聖物背包',safeL+50,safeT+60,46,'#ffe7a6',{weight:'900',glow:14});
    this.text('裝備 '+s.loadout.filter(Boolean).length+'/5  ·  庫存 '+s.library.length+'/40',safeL+250,safeT+62,22,'#c8b894',{baseline:'middle',weight:'900'});
    this.button(BW-safeR-126,safeT+30,78,56,'×','relic_back',()=>this.go('hub'),{size:36,color:'#f0c0b0'});

    const tabs=[['全部',''],['籃球','ball'],['護腕','wrist'],['鞋靴','shoes'],['護符','charm'],['面具','mask'],['籃框','hoop']];
    const cur=this._relicTab2||'';
    let tx=safeL+48, ty=safeT+112;
    for(const [label,type] of tabs){
      const w=label==='全部'?96:102;
      this.rr(tx,ty,w,44,12);
      ctx.fillStyle=cur===type?'rgba(184,255,47,0.2)':'rgba(10,7,8,0.72)';
      ctx.fill(); ctx.lineWidth=2;
      ctx.strokeStyle=cur===type?'#bfff2f':'rgba(215,169,69,0.42)';
      ctx.stroke();
      this.text(label,tx+w/2,ty+22,20,cur===type?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      ((t,x0)=>this.btn(x0,ty,w,44,'relic_tab2_'+label,()=>{this._relicTab2=t;this.render();}))(type,tx);
      tx+=w+12;
    }

    const eqY=safeT+178, eqX=safeL+244, eqW=218, eqH=138, gap=26;
    for(let i=0;i<5;i++){
      const rid=s.loadout[i], x=eqX+i*(eqW+gap), y=eqY;
      if(rid){
        const it=this._relicDisplay(rid,true);
        it.core=TYPE_LABEL[it.type]||it.core;
        this._drawRelicCard(it,x,y,eqW,eqH,{equipped:true,selected:this._bagSel===rid});
        ((id,xx,yy)=>this.btn(xx,yy,eqW,eqH,'eq_'+i,()=>this._openRelicCompare(id)))(rid,x,y);
      } else {
        ctx.save(); this.rr(x,y,eqW,eqH,16); ctx.fillStyle='rgba(7,5,9,0.62)'; ctx.fill();
        ctx.setLineDash([9,9]); ctx.lineWidth=2; ctx.strokeStyle='rgba(215,169,69,0.34)'; ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        this.text('+',x+eqW/2,y+eqH/2-8,52,'rgba(215,169,69,0.42)',{align:'center',baseline:'middle',weight:'700'});
        this.text('空槽',x+eqW/2,y+eqH/2+34,18,'rgba(200,190,170,0.45)',{align:'center',baseline:'middle',weight:'800'});
      }
    }

    const owned=[...new Set([...(s.loadout||[]).filter(Boolean),...(s.library||[])])].filter(id=>RELICS[id]).map(id=>{const it=this._relicDisplay(id,true); it.core=TYPE_LABEL[it.type]||it.core; return it;});
    let catalog=this._allRelicCatalog().map(it=>Object.assign({},it,{core:TYPE_LABEL[it.type]||it.core}));
    if(cur) catalog=catalog.filter(it=>it.type===cur);
    const ownedType=new Set(owned.map(it=>it.type+':'+it.idx));
    const locked=catalog.filter(it=>!ownedType.has(it.type+':'+it.idx));
    const gridX=safeL+198, gridY=safeT+358, cols=8, rows=4, cellW=150, cellH=116, cg=18, rg=18;
    const visible=owned.concat(locked).slice(0,cols*rows);
    for(let i=0;i<visible.length;i++){
      const it=visible[i], x=gridX+(i%cols)*(cellW+cg), y=gridY+((i/cols)|0)*(cellH+rg), lockedItem=!!it.catalog;
      this._drawRelicCard(it,x,y,cellW,cellH,{compact:true,locked:lockedItem,selected:this._bagSel===it.id});
      if(!lockedItem) ((id,xx,yy)=>this.btn(xx,yy,cellW,cellH,'bag_'+id,()=>this._openRelicCompare(id)))(it.id,x,y);
    }
    if(!visible.length){
      this.text('尚未取得聖物',BW/2,BH/2,40,'rgba(240,226,190,0.62)',{align:'center',baseline:'middle',weight:'900'});
    }
    if(this._relicCompare) this.drawRelicCompare();
  };

  Game.prototype.drawRelicCompare=function(){
    const c=this._relicCompare; if(!c) return;
    const ctx=this.ctx;
    const selected=this._relicDisplay(c.rid,true);
    const current=c.current?this._relicDisplay(c.current,true):null;
    if(selected) selected.core=TYPE_LABEL[selected.type]||selected.core;
    if(current) current.core=TYPE_LABEL[current.type]||current.core;
    ctx.save(); ctx.fillStyle='rgba(2,1,5,0.74)'; ctx.fillRect(-4000,-4000,BW+8000,BH+8000); ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'cmp_scrim',()=>{});
    const im=this._relicUiImg('compare_modal.png'), w=1580,h=830,x=BW/2-w/2,y=BH/2-h/2+10;
    if(im&&im.complete&&im.naturalWidth&&!im._err) ctx.drawImage(im,x,y,w,h);
    else { ctx.save(); this.rr(x,y,w,h,24); ctx.fillStyle='rgba(8,5,10,0.96)'; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.78)'; ctx.stroke(); ctx.restore(); }
    this.text('裝備比較',BW/2,y+64,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});
    const card=(it,rx,ry,rw,rh,title,col)=>{
      this.text(title,rx+rw/2,ry-26,28,col,{align:'center',baseline:'middle',weight:'900'});
      this.rr(rx,ry,rw,rh,18); ctx.fillStyle='rgba(5,4,8,0.58)'; ctx.fill();
      ctx.lineWidth=3; ctx.strokeStyle=it?(QUAL_COL[it.tier]||col):'rgba(160,150,130,0.35)'; ctx.stroke();
      if(it){
        const side=Math.min(rw*0.52,rh*0.44);
        this._drawRelicSheetIcon(it.type,it.idx,rx+rw/2-side/2,ry+34,side,side,1);
        this.text(it.name,rx+rw/2,ry+rh*0.57,34,QUAL_COL[it.tier]||'#e6c068',{align:'center',baseline:'middle',weight:'900'});
        this.text((QUAL_NAME[it.tier]||'普通')+' · '+it.core,rx+rw/2,ry+rh*0.65,22,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
        const af=(it.affixes||[]).slice(0,3);
        for(let i=0;i<3;i++){
          const yy=ry+rh*0.73+i*42;
          const txt=af[i]?('◆ '+af[i].label+' +'+(af[i].pct?Math.round(af[i].val*100)+'%':af[i].val)):(i===0?this._clip(it.desc,rw-90,19,'800'):'');
          if(txt)this.text(txt,rx+54,yy,21,'#efe3ca',{baseline:'middle',weight:'800'});
        }
      } else {
        this.text('空槽',rx+rw/2,ry+rh/2,34,'rgba(210,200,180,0.56)',{align:'center',baseline:'middle',weight:'900'});
      }
    };
    card(current,x+120,y+150,560,500,'裝備中','#bfff2f');
    card(selected,x+w-680,y+150,560,500,'選取聖物','#b980ff');
    this.text('VS',BW/2,y+390,54,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:10});
    const bw=300,bh=78,by=y+h-120;
    this.button(BW/2-bw-36,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
    this.button(BW/2+36,by,bw,bh,current&&current.id===selected.id?'卸下':'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:34,weight:'900'});
  };

  if(typeof Audio!=='undefined'){
    const prevSfx=Audio.prototype.sfx;
    Audio.prototype._hbStopBallContactSamples=function(){
      this._ensureSamples&&this._ensureSamples();
      const pools=this._samplePools||{};
      for(const key of ['rim','floor']){
        const pool=pools[key]||[];
        for(const a of pool){ try{ a.pause(); a.currentTime=0; }catch(_e){} }
      }
    };
    Audio.prototype.sfx=function(n){
      const now=(typeof performance!=='undefined'?performance.now():Date.now());
      if(n==='hit' && this._hbSuppressHitUntil && now<this._hbSuppressHitUntil) return;
      if(n==='rim'){ this._hbSuppressHitUntil=now+220; if(this._playSample&&this._playSample('rim',1.25)) return; }
      if(n==='board'){ this._hbSuppressHitUntil=now+180; if(this._playSample&&this._playSample('rim',0.85)) return; }
      if(n==='bank'||n==='score'){ this._hbSuppressHitUntil=now+260; if(this._playSample&&this._playSample('score',0.78)) return; }
      if(n==='swish'){ this._hbSuppressHitUntil=now+300; if(this._playSample&&this._playSample('swish',1.0)) return; }
      if(n==='floor'){ if(this._playSample&&this._playSample('floor',0.78)) return; }
      return prevSfx.call(this,n);
    };
  }

  const oldSpawnBall=Game.prototype.spawnBall;
  Game.prototype.spawnBall=function(){
    if(this.audio&&this.audio._hbStopBallContactSamples) this.audio._hbStopBallContactSamples();
    return oldSpawnBall.apply(this,arguments);
  };
  const oldEndShot=Game.prototype.endShot;
  Game.prototype.endShot=function(scored){
    if(this.audio&&this.audio._hbStopBallContactSamples) this.audio._hbStopBallContactSamples();
    return oldEndShot.call(this,scored);
  };

  Game.prototype.collideHoop=function(b){
    const run=this.run, H=run&&run.hoop; if(!H||!b||!b.live) return;
    const boardX=H.x+H.rimR+8, bt=H.y-H.boardH*0.55, bb=H.y+H.boardH*0.45;
    let boardTouch=false;
    if(b.x+b.r>boardX&&b.x-b.r<boardX+H.boardW&&b.y>bt&&b.y<bb&&b.vx>0){
      b.x=boardX-b.r; b.vx*=-0.6; b.vy*=0.92; b.hitBoard=true; boardTouch=true;
      if(!b._boardLatch){
        b._boardLatch=true;
        this.audio.sfx('board');
        const rc=ACTS[run.act-1].rune;
        this.flashFx(boardX,b.y,rc,130,0.12);
        this.burst(boardX,b.y,11,rc,250,0.42,{kind:'shard',glow:true,r:4,g:180});
        this.ringFx(boardX,b.y,rc,0.24,{r0:8,r1:150,width:8});
        run.shake=Math.max(run.shake||0,6); H.glow=0.85;
      }
    }
    if(!boardTouch) b._boardLatch=false;
    const lx=H.x-H.rimR, rx=H.x+H.rimR;
    let rimTouch=false, rimX=H.x;
    for(const rxp of [lx,rx]){
      const d=dist(b.x,b.y,rxp,H.y);
      if(d<b.r+H.rimThick){
        const nx=(b.x-rxp)/(d||1), ny=(b.y-H.y)/(d||1), ov=b.r+H.rimThick-d;
        b.x+=nx*ov; b.y+=ny*ov;
        const dot=b.vx*nx+b.vy*ny;
        b.vx-=1.6*dot*nx; b.vy-=1.6*dot*ny; b.vx*=0.78; b.vy*=0.78;
        b.hitRim=true; rimTouch=true; rimX=rxp; H.glow=0.75;
      }
    }
    if(rimTouch){
      if(!b._rimLatch){
        b.rimBounces=(b.rimBounces||0)+1; b._rimLatch=true;
        this.audio.sfx('rim');
        const rc=ACTS[run.act-1].rune;
        this.burst(rimX,H.y,12,rc,310,0.34,{kind:'streak',glow:true,r:4,g:240,len:42});
        this.ringFx(rimX,H.y,rc,0.22,{r0:4,r1:118,width:7});
        run.shake=Math.max(run.shake||0,7);
      }
    } else b._rimLatch=false;
    if(!b.scored && b.vy>0 && b._py!=null){
      if(b._py<=H.y && b.y>=H.y && b.x>lx+6 && b.x<rx-6){ this.makeBasket(); H.net=18; }
    }
    b._py=b.y;
  };
})();


// === final activation: hero-page relic backpack uses generated backpack art ===
(function(){
  if(typeof Game==='undefined') return;
  const QUAL={common:'#d8d1bd',rare:'#7fd8ff',epic:'#c88cff',legend:'#ffe071'};
  const TABS=[['全部',''],['籃球','ball'],['護腕','wrist'],['球鞋','shoes'],['護符','charm'],['面具','mask'],['籃框','hoop']];

  Game.prototype._closeHeroRelicBag=function(){
    this._bag=false;
    this._bagSel=null;
    this._relicCompare=null;
    this._relicTabHero='';
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    this.render();
  };

  Game.prototype.drawRelicBag=function(){
    const ctx=this.ctx, s=this.save;
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    if(!s.library) s.library=[];

    const bg=this._relicUiImg&&this._relicUiImg('backpack_bg.png');
    if(bg&&bg.complete&&bg.naturalWidth&&!bg._err) ctx.drawImage(bg,0,0,BW,BH);
    else {
      ctx.save();
      ctx.fillStyle='#08050c';
      ctx.fillRect(0,0,BW,BH);
      const rg=ctx.createRadialGradient(BW*0.76,BH*0.1,20,BW*0.76,BH*0.1,BW*0.62);
      rg.addColorStop(0,'rgba(126,60,190,0.24)');
      rg.addColorStop(0.54,'rgba(40,14,72,0.18)');
      rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=rg;
      ctx.fillRect(0,0,BW,BH);
      ctx.restore();
    }

    const safeL=this.insL||0, safeR=this.insR||0, safeT=this.insT||0, safeB=this.insB||0;
    const ownedIds=[...new Set([...(s.loadout||[]).filter(Boolean),...(s.library||[])])].filter(id=>RELICS[id]);
    const owned=ownedIds.map(id=>this._relicDisplay(id,true));
    const ownedType=new Set(owned.map(it=>it.type+':'+it.idx));
    const tab=this._relicTabHero||'';

    let catalog=this._allRelicCatalog?this._allRelicCatalog():[];
    if(tab) catalog=catalog.filter(it=>it.type===tab);
    const locked=catalog.filter(it=>!ownedType.has(it.type+':'+it.idx));
    const visible=owned.concat(locked).filter(it=>!tab||it.type===tab).slice(0,32);

    this.text('聖物背包',safeL+58,safeT+62,48,'#ffe7a6',{weight:'900',glow:14});
    this.text('已裝備 '+s.loadout.filter(Boolean).length+'/5  ·  庫存 '+s.library.length+'/40',safeL+286,safeT+64,24,'#c8b894',{baseline:'middle',weight:'900'});
    this.button(BW-safeR-176,safeT+32,126,58,'返回','hero_bag_close',()=>this._closeHeroRelicBag(),{size:28,color:'#f0c0b0'});

    let tx=safeL+58, ty=safeT+106;
    for(const [label,type] of TABS){
      const w=type?106:96;
      this.rr(tx,ty,w,42,12);
      ctx.fillStyle=tab===type?'rgba(184,255,47,0.18)':'rgba(10,7,8,0.66)';
      ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle=tab===type?'#bfff2f':'rgba(215,169,69,0.38)';
      ctx.stroke();
      this.text(label,tx+w/2,ty+21,20,tab===type?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      ((t,x0,ww)=>this.btn(x0,ty,ww,42,'hero_relic_tab_'+t,()=>{this._relicTabHero=t;this.render();}))(type,tx,w);
      tx+=w+12;
    }

    const tpl=(ax,ay,aw,ah)=>({x:ax*BW/1672,y:ay*BH/941,w:aw*BW/1672,h:ah*BH/941});
    const slots=[
      tpl(353,105,142,126),
      tpl(562,105,142,126),
      tpl(772,105,142,126),
      tpl(977,105,142,126),
      tpl(1181,105,142,126)
    ];
    for(let i=0;i<5;i++){
      const rid=s.loadout[i], r=slots[i];
      if(rid){
        const it=this._relicDisplay(rid,true);
        if(it.core==null) it.core='';
        this._drawRelicLoadoutIcon?this._drawRelicLoadoutIcon(it,r.x,r.y,r.w,r.h,{selected:this._bagSel===rid}):this._drawRelicCard(it,r.x,r.y,r.w,r.h,{equipped:true,selected:this._bagSel===rid});
        ((id,rr)=>this.btn(rr.x,rr.y,rr.w,rr.h,'hero_bag_eq_'+i,()=>this._openRelicCompare(id)))(rid,r);
      } else {
        this.text('+',r.x+r.w/2,r.y+r.h/2-2,46,'rgba(215,169,69,0.48)',{align:'center',baseline:'middle',weight:'700'});
        this.btn(r.x,r.y,r.w,r.h,'hero_bag_empty_'+i,()=>{this._bagSel=null;this.audio.sfx('ui');this.render();});
      }
    }

    const grid=tpl(285,302,1100,392);
    const cols=8, rows=4, cg=12*BW/1672, rg=10*BH/941;
    const cellW=(grid.w-cg*(cols-1))/cols, cellH=(grid.h-rg*(rows-1))/rows;
    for(let i=0;i<visible.length&&i<cols*rows;i++){
      const it=visible[i], x=grid.x+(i%cols)*(cellW+cg), y=grid.y+((i/cols)|0)*(cellH+rg), lockedItem=!!it.catalog;
      this._drawRelicCard(it,x,y,cellW,cellH,{compact:true,locked:lockedItem,selected:this._bagSel===it.id});
      if(!lockedItem) ((id,xx,yy)=>this.btn(xx,yy,cellW,cellH,'hero_bag_item_'+id,()=>this._openRelicCompare(id)))(it.id,x,y);
    }

    const detail=tpl(302,724,1068,130);
    this.rr(detail.x,detail.y,detail.w,detail.h,16);
    ctx.fillStyle='rgba(7,5,8,0.72)';
    ctx.fill();
    ctx.lineWidth=2;
    ctx.strokeStyle='rgba(215,169,69,0.44)';
    ctx.stroke();
    const sel=(this._relicCompare&&this._relicCompare.rid)?this._relicDisplay(this._relicCompare.rid,true):(owned[0]||null);
    if(sel){
      this._drawRelicSheetIcon(sel.type,sel.idx,detail.x+24,detail.y+18,92,92,1);
      this.text(sel.name,detail.x+142,detail.y+44,31,QUAL[sel.tier]||'#e6c068',{weight:'900'});
      this.text((sel.core||'聖物')+(sel.q?('  ·  純度 '+sel.q+'/50'):'')+(s.loadout.includes(sel.id)?'  ·  已裝備':''),detail.x+142,detail.y+78,20,'#c8b894',{weight:'800'});
      if(sel.desc) this.text(this._clip(sel.desc,detail.w-500,20,'800'),detail.x+500,detail.y+65,21,'#efe3ca',{baseline:'middle',weight:'800'});
    } else {
      this.text('尚未取得聖物，先在籃獄裡打出傳說。',detail.x+detail.w/2,detail.y+detail.h/2,28,'rgba(240,226,190,0.62)',{align:'center',baseline:'middle',weight:'900'});
    }

    if(this._relicCompare) this.drawRelicCompare();
  };
})();

// === final activation: branded loading splash absolute last ===
(function(){
  if(typeof Game==='undefined') return;
  const LOADING_SPLASH='/assets/ui/loading_splash_hoopbreaker.png?v=20260628_loading_splash_v1';

  Game.prototype._ensureLoadingSplash=function(){
    if(this._loadingSplash!==undefined) return this._loadingSplash;
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._assetLoading&&this.render) this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=LOADING_SPLASH;
      this._loadingSplash=im;
    }catch(e){ this._loadingSplash=null; }
    return this._loadingSplash;
  };

  const oldPreloadEntryAssets=Game.prototype._preloadEntryAssets;
  Game.prototype._preloadEntryAssets=async function(){
    const st=this._assetLoading||{};
    try{
      if(this._preloadImage){
        st.label='載入入口畫面';
        st.detail='Hoopbreaker';
        st.progress=Math.max(st.progress||0,0.03);
        this.render&&this.render();
        await this._preloadImage(LOADING_SPLASH);
      }
      this._ensureLoadingSplash&&this._ensureLoadingSplash();
    }catch(e){ try{console.warn('[HB loading splash]',e);}catch(_e){} }
    if(oldPreloadEntryAssets) return oldPreloadEntryAssets.call(this);
  };

  Game.prototype._drawLoadingOverlay=function(){
    const st=this._assetLoading;
    if(!st||!st.active) return;
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;
    const p=Math.max(0,Math.min(1,st.progress||0));
    const rr=(x,y,w,h,r)=>{
      r=Math.max(0,Math.min(r,w/2,h/2));
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.lineTo(x+w-r,y);
      ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);
      ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);
      ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);
      ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    };
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#070407';
    ctx.fillRect(0,0,w,h);

    const img=this._ensureLoadingSplash&&this._ensureLoadingSplash();
    if(img&&img.complete&&img.naturalWidth&&!img._err){
      const iw=img.naturalWidth, ih=img.naturalHeight;
      const sc=Math.max(w/iw,h/ih);
      const dw=iw*sc, dh=ih*sc;
      ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
    }else{
      const g=ctx.createRadialGradient(w*0.5,h*0.42,10,w*0.5,h*0.42,Math.max(w,h)*0.68);
      g.addColorStop(0,'#2a1c10');
      g.addColorStop(0.58,'#0b0710');
      g.addColorStop(1,'#030205');
      ctx.fillStyle=g;
      ctx.fillRect(0,0,w,h);
    }

    const shadeH=Math.max(110,h*0.24);
    const shade=ctx.createLinearGradient(0,h-shadeH,0,h);
    shade.addColorStop(0,'rgba(0,0,0,0)');
    shade.addColorStop(0.52,'rgba(0,0,0,0.52)');
    shade.addColorStop(1,'rgba(0,0,0,0.88)');
    ctx.fillStyle=shade;
    ctx.fillRect(0,h-shadeH,w,shadeH);

    const bw=Math.min(w*0.64,760);
    const bh=Math.max(14,Math.min(24,h*0.022));
    const bottomPad=Math.max(34,h*0.058);
    const x=w/2-bw/2;
    const y=h-bottomPad-bh;
    const r=bh/2;

    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.font='800 '+Math.max(13,Math.min(20,w*0.014))+'px "Microsoft JhengHei","PingFang TC",sans-serif';
    ctx.shadowBlur=8;
    ctx.shadowColor='rgba(0,0,0,0.9)';
    ctx.fillStyle='rgba(250,236,196,0.88)';
    ctx.fillText((st.label||'載入資源')+'  '+Math.round(p*100)+'%',w/2,y-14);
    ctx.shadowBlur=0;

    rr(x,y,bw,bh,r);
    ctx.fillStyle='rgba(8,5,5,0.84)';
    ctx.fill();
    ctx.lineWidth=Math.max(2,bh*0.14);
    ctx.strokeStyle='rgba(220,140,54,0.76)';
    ctx.stroke();

    const fillW=Math.max(bh,bw*p);
    rr(x,y,fillW,bh,r);
    const fill=ctx.createLinearGradient(x,0,x+bw,0);
    fill.addColorStop(0,'#5d8b10');
    fill.addColorStop(0.48,'#bfff2d');
    fill.addColorStop(1,'#fff0a2');
    ctx.fillStyle=fill;
    ctx.shadowBlur=16;
    ctx.shadowColor='rgba(177,255,40,0.68)';
    ctx.fill();
    ctx.shadowBlur=0;

    ctx.globalAlpha=0.46;
    ctx.fillStyle='#fff6c2';
    ctx.fillRect(x+Math.min(fillW,bw)*0.78,y+2,Math.min(80,fillW*0.18),Math.max(2,bh*0.16));
    ctx.globalAlpha=1;
    ctx.restore();
  };
})();

// === final activation: hero relic backpack interaction polish ===
(function(){
  if(typeof Game==='undefined') return;

  const RELIC_UI_VER='20260628_relic_fix_v1';
  const RELIC_UI_PATH='/assets/relic_ui/';
  const RELIC_UI_NAMES=['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png'];
  const LOADING_SPLASH='/assets/ui/loading_splash_hoopbreaker.png?v=20260628_loading_splash_v1';
  const TYPE_LABEL={ball:'籃球',wrist:'護腕',shoes:'球鞋',charm:'護符',mask:'面具',hoop:'籃框'};
  const TABS=[['全部',''],['籃球','ball'],['護腕','wrist'],['球鞋','shoes'],['護符','charm'],['面具','mask'],['籃框','hoop']];
  const TIER_COL=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
  const TIER_NAME=['普通','精良','稀有','史詩','傳說','神話'];

  function uniqIds(ids){
    const out=[];
    for(const id of ids||[]){
      if(id&&RELICS[id]&&!out.includes(id)) out.push(id);
    }
    return out;
  }
  function tierCol(it){ return TIER_COL[(it&&it.tier)|0]||'#e6c068'; }
  function tierName(it){ return TIER_NAME[(it&&it.tier)|0]||'普通'; }
  function validSlot(i){ return Number.isInteger(i)&&i>=0&&i<5; }
  const BALL_SLOT=2;
  const SIDE_SLOTS=[0,1,3,4];

  Game.prototype._hbRelicUiUrl=function(name){ return RELIC_UI_PATH+name+'?v='+RELIC_UI_VER; };
  Game.prototype._relicUiImg=function(name){
    this._relicUi=this._relicUi||{};
    const key=name+'?v='+RELIC_UI_VER;
    if(this._relicUi[key]!==undefined) return this._relicUi[key];
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._bag||this._relicCompare||this.screen==='relics') this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=this._hbRelicUiUrl(name);
      this._relicUi[key]=im;
      return im;
    }catch(e){
      this._relicUi[key]=null;
      return null;
    }
  };
  Game.prototype._preloadRelicUiAssets=function(){
    for(const name of RELIC_UI_NAMES) this._relicUiImg(name);
  };

  Game.prototype._hbOwnedRelicIds=function(includeEquipped){
    const s=this.save||{};
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    if(!s.library) s.library=[];
    const base=includeEquipped?[...s.loadout.filter(Boolean),...s.library]:[...s.library];
    return uniqIds(base);
  };
  Game.prototype._hbRelicDisplay=function(id){
    const it=this._relicDisplay?this._relicDisplay(id,true):null;
    if(it&&TYPE_LABEL[it.type]) it.core=TYPE_LABEL[it.type];
    return it;
  };
  Game.prototype._hbIsBallRelic=function(id){
    const it=this._hbRelicDisplay(id);
    return !!(it&&it.type==='ball');
  };
  Game.prototype._hbSlotAccepts=function(slot,idOrItem){
    if(!validSlot(slot)) return false;
    const item=typeof idOrItem==='string'?this._hbRelicDisplay(idOrItem):idOrItem;
    if(!item) return false;
    return item.type==='ball'?slot===BALL_SLOT:slot!==BALL_SLOT;
  };
  Game.prototype._hbFirstOpenSlotFor=function(item){
    const load=(this.save&&this.save.loadout)||[];
    if(item&&item.type==='ball') return BALL_SLOT;
    for(const slot of SIDE_SLOTS) if(!load[slot]) return slot;
    return -1;
  };
  Game.prototype._hbKeepOwned=function(id){
    const s=this.save||{};
    if(!id||!RELICS[id]) return;
    if(!Array.isArray(s.library)) s.library=[];
    if(!(s.loadout||[]).includes(id)&&!s.library.includes(id)&&s.library.length<40) s.library.push(id);
  };
  Game.prototype._hbNormalizeLoadoutSlots=function(){
    const s=this.save||{};
    if(!Array.isArray(s.loadout)) s.loadout=[null,null,null,null,null];
    if(!Array.isArray(s.library)) s.library=[];
    while(s.loadout.length<5) s.loadout.push(null);
    if(s.loadout.length>5) s.loadout=s.loadout.slice(0,5);
    let changed=false;
    const load=s.loadout;
    const overflow=[];

    for(let i=0;i<5;i++){
      const id=load[i];
      if(!id||!RELICS[id]){
        if(id){ load[i]=null; changed=true; }
        continue;
      }
      const isBall=this._hbIsBallRelic(id);
      if((isBall&&i!==BALL_SLOT)||(!isBall&&i===BALL_SLOT)){
        overflow.push(id);
        load[i]=null;
        changed=true;
      }
    }

    for(const id of overflow){
      const item=this._hbRelicDisplay(id);
      if(!item){ this._hbKeepOwned(id); continue; }
      const targets=item.type==='ball'?[BALL_SLOT]:SIDE_SLOTS;
      let placed=false;
      for(const slot of targets){
        if(!load[slot]){
          load[slot]=id;
          placed=true;
          break;
        }
      }
      if(!placed) this._hbKeepOwned(id);
    }

    let seenBall=false;
    for(let i=0;i<5;i++){
      const id=load[i];
      if(!id) continue;
      const isBall=this._hbIsBallRelic(id);
      if(isBall){
        if(i!==BALL_SLOT||seenBall){
          load[i]=null;
          this._hbKeepOwned(id);
          changed=true;
        }else{
          seenBall=true;
        }
      }else if(i===BALL_SLOT){
        load[i]=null;
        this._hbKeepOwned(id);
        changed=true;
      }
    }
    if(changed) persist(s);
    return load;
  };
  Game.prototype._hbSlotCandidates=function(slot){
    const load=this._hbNormalizeLoadoutSlots();
    return this._hbOwnedRelicIds(false).filter(id=>!load.includes(id)&&this._hbSlotAccepts(slot,id));
  };
  Game.prototype._hbCompareTargetFor=function(item){
    if(!item) return null;
    if(item.type!=='ball') return null;
    const load=this._hbNormalizeLoadoutSlots();
    const id=load[BALL_SLOT];
    if(id&&id!==item.id) return id;
    return null;
  };
  Game.prototype._selectedEquipFor=function(item){
    return this._hbCompareTargetFor(item);
  };
  Game.prototype._openRelicCompare=function(rid,opts){
    opts=opts||{};
    const s=this.save||{};
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    const load=this._hbNormalizeLoadoutSlots();
    const item=this._hbRelicDisplay(rid);
    if(!item) return;
    this._bagSel=rid;
    const equippedSlot=load.indexOf(rid);
    if(equippedSlot>=0){
      this._relicCompare={rid,current:null,slot:equippedSlot,inspect:true,equipped:true};
    }else{
      let slot=-1;
      if(validSlot(opts.slot)&&this._hbSlotAccepts(opts.slot,item)) slot=opts.slot;
      else if(validSlot(this._relicSlotTarget)&&this._hbSlotAccepts(this._relicSlotTarget,item)) slot=this._relicSlotTarget;
      else if(item.type==='ball') slot=BALL_SLOT;
      const current=opts.current!==undefined?opts.current:(item.type==='ball'?this._hbCompareTargetFor(item):null);
      this._relicCompare={rid,current:current||null,slot,inspect:!current,equipped:false};
    }
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    this.render();
  };
  Game.prototype._hbUnequipRelic=function(rid){
    const s=this.save;
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    if(!s.library) s.library=[];
    const i=s.loadout.indexOf(rid);
    if(i<0) return;
    if(!s.library.includes(rid) && s.library.length<40) s.library.push(rid);
    s.loadout[i]=null;
    persist(s);
    this._relicCompare=null;
    this._relicSlotTarget=null;
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    this.render();
  };
  Game.prototype._hbDiscardRelic=function(rid){
    const s=this.save;
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    if(!s.library) s.library=[];
    if(!rid||!RELICS[rid]) return;
    if(s.loadout.includes(rid)){
      this.toast&&this.toast('先卸下再丟棄','已裝備聖物不會直接刪除');
      this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
      this.render();
      return;
    }
    const before=s.library.length;
    s.library=s.library.filter(id=>id!==rid);
    if(before===s.library.length){
      this.toast&&this.toast('庫存沒有此聖物');
      this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
      this.render();
      return;
    }
    persist(s);
    this._relicCompare=null;
    this._bagSel=null;
    this.audio&&this.audio.sfx&&this.audio.sfx('coin');
    this.toast&&this.toast('已丟棄聖物');
    this.render();
  };
  Game.prototype._hbConfirmDiscardRelic=function(rid){
    const it=this._hbRelicDisplay(rid);
    if(!it) return;
    const s=this.save||{};
    const load=s.loadout||[];
    if(load.includes(rid)){
      this.toast&&this.toast('先卸下再丟棄','已裝備聖物不會直接刪除');
      this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
      this.render();
      return;
    }
    this.confirm('確定丟棄「'+it.name+'」？此動作無法復原。',()=>this._hbDiscardRelic(rid));
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    this.render();
  };
  Game.prototype._hbEquipRelic=function(rid,opts){
    opts=opts||{};
    const s=this.save;
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    if(!s.library) s.library=[];
    if(!rid||!RELICS[rid]) return;
    const load=this._hbNormalizeLoadoutSlots();
    const item=this._hbRelicDisplay(rid);
    if(!item) return;
    const have=load.indexOf(rid);
    if(have>=0){
      this._relicCompare=null;
      this._relicSlotTarget=null;
      this.audio&&this.audio.sfx&&this.audio.sfx('ui');
      this.render();
      return;
    }

    let slot=(validSlot(opts.slot)&&this._hbSlotAccepts(opts.slot,item))?opts.slot:-1;
    if(opts.current&&load.includes(opts.current)) slot=load.indexOf(opts.current);
    if(!this._hbSlotAccepts(slot,item)) slot=-1;
    if(item.type==='ball') slot=BALL_SLOT;
    if(!validSlot(slot)) slot=this._hbFirstOpenSlotFor(item);
    if(!validSlot(slot)||!this._hbSlotAccepts(slot,item)){
      this.toast&&this.toast('聖物已滿','先點已裝備聖物卸下；籃球會自動替換唯一核心');
      this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
      this._relicCompare=null;
      this.render();
      return;
    }

    if(item.type==='ball'){
      for(let k=0;k<load.length;k++){
        const ex=load[k];
        if(k!==slot&&ex&&this._hbIsBallRelic(ex)){
          load[k]=null;
          this._hbKeepOwned(ex);
        }
      }
    }

    load[slot]=rid;
    this._hbNormalizeLoadoutSlots();
    persist(s);
    this._relicCompare=null;
    this._relicSlotTarget=null;
    this._bagSel=rid;
    this.audio&&this.audio.sfx&&this.audio.sfx('select');
    this.render();
  };
  Game.prototype._equipFromCompare=function(){
    const c=this._relicCompare;
    if(!c) return;
    this._hbEquipRelic(c.rid,{slot:c.slot,current:c.current});
  };

  Game.prototype.drawRelicBag=function(){
    const ctx=this.ctx, s=this.save;
    if(!s.loadout) s.loadout=[null,null,null,null,null];
    if(!s.library) s.library=[];
    this._hbNormalizeLoadoutSlots();
    this.btn(0,0,BW,BH,'hero_bag_blocker',()=>{});

    const bg=this._relicUiImg&&this._relicUiImg('backpack_bg.png');
    if(bg&&bg.complete&&bg.naturalWidth&&!bg._err) ctx.drawImage(bg,0,0,BW,BH);
    else {
      ctx.save();
      ctx.fillStyle='#08050c';
      ctx.fillRect(0,0,BW,BH);
      const rg=ctx.createRadialGradient(BW*0.75,BH*0.14,20,BW*0.75,BH*0.14,BW*0.65);
      rg.addColorStop(0,'rgba(126,60,190,0.24)');
      rg.addColorStop(0.6,'rgba(40,14,72,0.18)');
      rg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=rg;
      ctx.fillRect(0,0,BW,BH);
      ctx.restore();
    }

    const safeL=this.insL||0, safeR=this.insR||0, safeT=this.insT||0;
    this.text('聖物背包',safeL+58,safeT+62,48,'#ffe7a6',{weight:'900',glow:14});
    this.text('已裝備 '+s.loadout.filter(Boolean).length+'/5  ·  庫存 '+s.library.length+'/40',safeL+250,safeT+64,24,'#c8b894',{baseline:'middle',weight:'900'});
    this.button(BW-safeR-176,safeT+32,126,58,'返回','hero_bag_close',()=>this._closeHeroRelicBag(),{size:28,color:'#f0c0b0'});

    const tab=this._relicTabHero||'';
    const tabX=safeL+42, tabY=safeT+112, tabW=132, tabH=42, tabGap=11;
    for(let i=0;i<TABS.length;i++){
      const label=TABS[i][0], type=TABS[i][1], y=tabY+i*(tabH+tabGap), on=tab===type;
      this.rr(tabX,y,tabW,tabH,12);
      ctx.fillStyle=on?'rgba(184,255,47,0.20)':'rgba(10,7,8,0.70)';
      ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle=on?'#bfff2f':'rgba(215,169,69,0.42)';
      ctx.stroke();
      this.text(label,tabX+tabW/2,y+tabH/2+1,19,on?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      ((t)=>this.btn(tabX,y,tabW,tabH,'hero_relic_tab_'+(t||'all'),()=>{ this._relicTabHero=t; this._relicSlotTarget=null; this.audio&&this.audio.sfx&&this.audio.sfx('ui'); this.render(); }))(type);
    }

    const tpl=(ax,ay,aw,ah)=>({x:ax*BW/1672,y:ay*BH/941,w:aw*BW/1672,h:ah*BH/941});
    const slots=[
      tpl(353,105,142,126),
      tpl(562,105,142,126),
      tpl(772,105,142,126),
      tpl(977,105,142,126),
      tpl(1181,105,142,126)
    ];
    for(let i=0;i<5;i++){
      const rid=s.loadout[i], r=slots[i], target=this._relicSlotTarget===i;
      if(rid){
        const it=this._hbRelicDisplay(rid);
        this._drawRelicLoadoutIcon?this._drawRelicLoadoutIcon(it,r.x,r.y,r.w,r.h,{selected:this._bagSel===rid||target}):this._drawRelicCard(it,r.x,r.y,r.w,r.h,{equipped:true,selected:this._bagSel===rid||target});
        ((id,slot,rr)=>this.btn(rr.x,rr.y,rr.w,rr.h,'hero_bag_eq_'+slot,()=>this._openRelicCompare(id,{slot,inspect:true})))(rid,i,r);
      }else{
        ctx.save();
        if(target){
          this.rr(r.x,r.y,r.w,r.h,14);
          ctx.fillStyle='rgba(184,255,47,0.10)';
          ctx.fill();
          ctx.lineWidth=3;
          ctx.strokeStyle='#bfff2f';
          ctx.stroke();
        }
        ctx.restore();
        this.text('+',r.x+r.w/2,r.y+r.h/2-8,48,target?'#d8ff44':'rgba(215,169,69,0.56)',{align:'center',baseline:'middle',weight:'800'});
        this.text(target?'選擇中':'空欄',r.x+r.w/2,r.y+r.h/2+33,18,target?'#d8ff44':'rgba(200,190,170,0.48)',{align:'center',baseline:'middle',weight:'900'});
        const slotLabel=i===BALL_SLOT?'籃球槽':(target?'選此欄':'空欄');
        ctx.save();
        ctx.fillStyle='rgba(7,5,8,0.76)';
        ctx.fillRect(r.x+12,r.y+r.h/2+17,r.w-24,28);
        ctx.restore();
        this.text(slotLabel,r.x+r.w/2,r.y+r.h/2+33,18,i===BALL_SLOT?'#ffe7a6':(target?'#d8ff44':'rgba(200,190,170,0.62)'),{align:'center',baseline:'middle',weight:'900'});
        ((slot,rr)=>this.btn(rr.x,rr.y,rr.w,rr.h,'hero_bag_empty_'+slot,()=>{ this._relicSlotTarget=slot; if(slot===BALL_SLOT) this._relicTabHero='ball'; else if(this._relicTabHero==='ball') this._relicTabHero=''; this._bagSel=null; this._relicCompare=null; this.audio&&this.audio.sfx&&this.audio.sfx('ui'); this.render(); }))(i,r);
      }
    }

    const load=s.loadout||[];
    let ids=validSlot(this._relicSlotTarget)?this._hbSlotCandidates(this._relicSlotTarget):this._hbOwnedRelicIds(true);
    if(tab) ids=ids.filter(id=>{ const it=this._hbRelicDisplay(id); return it&&it.type===tab; });
    const visible=ids.map(id=>this._hbRelicDisplay(id)).filter(Boolean).slice(0,32);

    const grid=tpl(285,302,1100,392);
    const cols=8, rows=4, cg=12*BW/1672, rg=10*BH/941;
    const cellW=(grid.w-cg*(cols-1))/cols, cellH=(grid.h-rg*(rows-1))/rows;
    for(let i=0;i<visible.length&&i<cols*rows;i++){
      const it=visible[i], x=grid.x+(i%cols)*(cellW+cg), y=grid.y+((i/cols)|0)*(cellH+rg);
      this._drawRelicCard(it,x,y,cellW,cellH,{compact:true,equipped:load.includes(it.id),selected:this._bagSel===it.id});
      ((id,slot,xx,yy)=>this.btn(xx,yy,cellW,cellH,'hero_bag_item_'+id,()=>this._openRelicCompare(id,{slot})))(it.id,this._relicSlotTarget,x,y);
    }
    if(!visible.length){
      const msg=validSlot(this._relicSlotTarget)?'此分類沒有可裝入的庫存聖物':'尚未取得此分類聖物';
      this.text(msg,grid.x+grid.w/2,grid.y+grid.h/2,30,'rgba(240,226,190,0.58)',{align:'center',baseline:'middle',weight:'900'});
    }

    const detail=tpl(302,724,1068,130);
    this.rr(detail.x,detail.y,detail.w,detail.h,16);
    ctx.fillStyle='rgba(7,5,8,0.72)';
    ctx.fill();
    ctx.lineWidth=2;
    ctx.strokeStyle='rgba(215,169,69,0.44)';
    ctx.stroke();
    const selIds=new Set(ids);
    if(this._bagSel&&!selIds.has(this._bagSel)) this._bagSel=null;
    const sel=(this._bagSel&&selIds.has(this._bagSel)?this._hbRelicDisplay(this._bagSel):null)||(visible[0]||null);
    if(sel){
      this._drawRelicSheetIcon(sel.type,sel.idx,detail.x+24,detail.y+18,92,92,1);
      this.text(sel.name,detail.x+142,detail.y+44,31,tierCol(sel),{weight:'900'});
      this.text(this._hbRelicSummary(sel)+(load.includes(sel.id)?'  ·  已裝備':''),detail.x+142,detail.y+78,20,'#c8b894',{weight:'800'});
      if(sel.desc) this.text(this._clip(sel.desc,detail.w-520,20,'800'),detail.x+515,detail.y+66,21,'#efe3ca',{baseline:'middle',weight:'800'});
    }else{
      this.text('完成遠征或速投挑戰後，已取得的聖物才會出現在背包。',detail.x+detail.w/2,detail.y+detail.h/2,26,'rgba(240,226,190,0.62)',{align:'center',baseline:'middle',weight:'900'});
    }

    if(this._relicCompare) this.drawRelicCompare();
  };

  Game.prototype._hbRelicSummary=function(it){
    return tierName(it)+' · '+(TYPE_LABEL[it&&it.type]||it.core||'聖物')+(it&&it.q?(' · 強度 '+it.q+'/50'):'');
  };
  Game.prototype._hbDrawModalCard=function(it,x,y,w,h,title,col){
    const ctx=this.ctx;
    this.text(title,x+w/2,y-24,26,col,{align:'center',baseline:'middle',weight:'900'});
    this.rr(x,y,w,h,18);
    ctx.fillStyle='rgba(5,4,8,0.62)';
    ctx.fill();
    ctx.lineWidth=3;
    ctx.strokeStyle=it?tierCol(it):'rgba(160,150,130,0.35)';
    ctx.stroke();
    if(!it){
      this.text('空欄',x+w/2,y+h/2,34,'rgba(210,200,180,0.56)',{align:'center',baseline:'middle',weight:'900'});
      return;
    }
    const side=Math.min(w*0.5,h*0.42);
    this._drawRelicSheetIcon(it.type,it.idx,x+w/2-side/2,y+34,side,side,1);
    this.text(this._clip(it.name,w-68,32,'900'),x+w/2,y+h*0.56,32,tierCol(it),{align:'center',baseline:'middle',weight:'900'});
    this.text(this._hbRelicSummary(it),x+w/2,y+h*0.65,21,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
    const lines=(it.affixes||[]).slice(0,3).map(a=>'◆ '+a.label+' +'+(a.pct?Math.round(a.val*100)+'%':a.val));
    if(!lines.length&&it.desc) lines.push(this._clip(it.desc,w-92,19,'800'));
    for(let i=0;i<Math.min(3,lines.length);i++) this.text(lines[i],x+48,y+h*0.74+i*38,20,'#efe3ca',{baseline:'middle',weight:'800'});
  };
  Game.prototype.drawRelicCompare=function(){
    const c=this._relicCompare;
    if(!c) return;
    const ctx=this.ctx;
    const selected=this._hbRelicDisplay(c.rid);
    if(!selected) return;
    const current=c.current?this._hbRelicDisplay(c.current):null;
    const single=c.inspect||!current||current.id===selected.id;

    ctx.save();
    ctx.fillStyle='rgba(2,1,5,0.74)';
    ctx.fillRect(0,0,BW,BH);
    ctx.restore();
    this.btn(0,0,BW,BH,'cmp_scrim',()=>{});

    if(single){
      const w=Math.min(850,BW-220), h=Math.min(700,BH-170), x=BW/2-w/2, y=BH/2-h/2+8;
      this.rr(x,y,w,h,24);
      ctx.fillStyle='rgba(8,5,10,0.96)';
      ctx.fill();
      ctx.lineWidth=4;
      ctx.strokeStyle='rgba(215,169,69,0.78)';
      ctx.stroke();
      this.text(c.equipped?'已裝備聖物':'聖物詳情',x+w/2,y+58,42,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});
      const icon=Math.min(220,w*0.34);
      this._drawRelicSheetIcon(selected.type,selected.idx,x+w/2-icon/2,y+96,icon,icon,1);
      this.text(this._clip(selected.name,w-120,38,'900'),x+w/2,y+346,38,tierCol(selected),{align:'center',baseline:'middle',weight:'900'});
      this.text(this._hbRelicSummary(selected),x+w/2,y+390,23,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
      const lines=(selected.affixes||[]).slice(0,4).map(a=>'◆ '+a.label+' +'+(a.pct?Math.round(a.val*100)+'%':a.val));
      if(selected.desc) lines.push(this._clip(selected.desc,w-150,20,'800'));
      for(let i=0;i<Math.min(5,lines.length);i++) this.text(lines[i],x+82,y+442+i*36,21,'#efe3ca',{baseline:'middle',weight:'800'});
      const bw=240,bh=70,by=y+h-98;
      if(c.equipped){
        this.button(x+w/2-bw-24,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:28});
        this.button(x+w/2+24,by,bw,bh,'卸下','cmp_unequip',()=>this._hbUnequipRelic(selected.id),{size:30,color:'#f0c0b0',weight:'900'});
      }else{
        const canDiscard=(this.save.library||[]).includes(selected.id);
        if(canDiscard){
          const sbw=205,gap=18,total=sbw*3+gap*2,sx=x+w/2-total/2;
          this.button(sx,by,sbw,bh,'丟棄','cmp_discard',()=>this._hbConfirmDiscardRelic(selected.id),{danger:true,size:27,color:'#fff0e8',weight:'900'});
          this.button(sx+sbw+gap,by,sbw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:27});
          this.button(sx+(sbw+gap)*2,by,sbw,bh,validSlot(c.slot)?('裝入第 '+(c.slot+1)+' 欄'):'裝備','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:26,weight:'900'});
        }else{
          this.button(x+w/2-bw-24,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:28});
          this.button(x+w/2+24,by,bw,bh,validSlot(c.slot)?('裝入第 '+(c.slot+1)+' 欄'):'裝備','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:29,weight:'900'});
        }
      }
      return;
    }

    const w=Math.min(1320,BW-180), h=Math.min(740,BH-160), x=BW/2-w/2, y=BH/2-h/2+8;
    const im=this._relicUiImg('compare_modal.png');
    if(im&&im.complete&&im.naturalWidth&&!im._err) ctx.drawImage(im,x,y,w,h);
    else {
      this.rr(x,y,w,h,24);
      ctx.fillStyle='rgba(8,5,10,0.96)';
      ctx.fill();
      ctx.lineWidth=4;
      ctx.strokeStyle='rgba(215,169,69,0.78)';
      ctx.stroke();
    }
    this.text('裝備比較',x+w/2,y+58,42,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});
    const cardW=Math.min(500,(w-260)/2), cardH=Math.min(470,h-245);
    this._hbDrawModalCard(current,x+96,y+145,cardW,cardH,'目前裝備','#bfff2f');
    this._hbDrawModalCard(selected,x+w-96-cardW,y+145,cardW,cardH,'準備裝備','#b980ff');
    this.text('VS',x+w/2,y+360,52,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:10});
    const bw=280,bh=74,by=y+h-108;
    const canDiscard=(this.save.library||[]).includes(selected.id)&&!((this.save.loadout||[]).includes(selected.id));
    if(canDiscard){
      const sbw=240,gap=24,total=sbw*3+gap*2,sx=x+w/2-total/2;
      this.button(sx,by,sbw,bh,'丟棄','cmp_discard',()=>this._hbConfirmDiscardRelic(selected.id),{danger:true,size:30,color:'#fff0e8',weight:'900'});
      this.button(sx+sbw+gap,by,sbw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
      this.button(sx+(sbw+gap)*2,by,sbw,bh,'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:32,weight:'900'});
    }else{
      this.button(x+w/2-bw-34,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
      this.button(x+w/2+34,by,bw,bh,'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:34,weight:'900'});
    }
  };

  const ENTRY_PRELOAD_ASSETS=[
    LOADING_SPLASH,
    '/assets/background/home_scene_flat_1704x786.webp',
    '/assets/home/home_logo_clean.png',
    '/assets/home/home_primary_start.png',
    '/assets/home/home_primary_start_pressed.png',
    '/assets/home/home_primary_start_hover.png',
    '/assets/home/home_secondary_panel.png',
    '/assets/home/home_secondary_panel_pressed.png',
    '/assets/home/home_secondary_panel_hover.png',
    '/assets/home/home_status_panel.png',
    '/assets/background/hub_scene_flat.webp',
    '/assets/background/hero_page_bg.webp',
    '/assets/background/atlas_screen_flat.webp',
    '/assets/background/route_screen_flat.webp',
    '/assets/background/settings_screen_flat.webp',
    '/assets/background/gameover_scene_flat.webp',
    '/assets/battle/act1_bg.webp',
    '/assets/battle/act2_bg.webp',
    '/assets/battle/act3_bg.webp',
    '/assets/battle/act4_bg.webp',
    '/assets/battle/act5_bg.webp',
    '/assets/endless/endless_cracked_court.png',
    '/assets/endless/bg_iron_cage_stands.png',
    '/assets/endless/bg_coldflame_zone.png',
    '/assets/endless/bg_thunderbone_dome.png',
    '/assets/endless/bg_final_abyss_cathedral.png',
    '/assets/endless/boss_hoop_guardian.png',
    '/assets/endless/enemies/crack_runner.png',
    '/assets/endless/enemies/screen_idol.png',
    '/assets/endless/enemies/iron_whistle.png',
    '/assets/endless/enemies/oil_monk.png',
    '/assets/endless/enemies/mist_librarian.png',
    '/assets/endless/enemies/cold_rim_guard.png',
    '/assets/endless/enemies/war_drum_leader.png',
    '/assets/endless/enemies/shattered_board_collector.png',
    '/assets/endless/bosses/free_throw_executioner.png',
    '/assets/endless/bosses/broken_rim_stitcher.png',
    '/assets/endless/bosses/coldflame_scorekeeper.png',
    '/assets/endless/bosses/thunderbone_announcer.png',
    '/assets/endless/bosses/abyss_hoop_lord.png',
    ...(()=>{ const out=[]; for(let act=1;act<=5;act++) for(let i=0;i<6;i++) out.push('/assets/mob/standard/act'+act+'/enemy_'+i+'.png?v=20260629_bean_mobs_v1'); return out; })(),
    '/assets/mob/speed/act1.webp',
    '/assets/mob/speed/act2.webp',
    '/assets/mob/speed/act3.webp',
    '/assets/mob/speed/act4.webp',
    '/assets/mob/speed/act5.webp',
    '/assets/ui/login_panel_user_trans.png',
    '/hero_shade.png',
    '/hero_axer.png',
    '/hero_elem.png',
    '/hero_bone.png',
    '/hero_archer.png',
    '/hero_beast.png',
    '/hero_whistle.png',
    ...RELIC_UI_NAMES.map(name=>RELIC_UI_PATH+name+'?v='+RELIC_UI_VER)
  ];

  Game.prototype._preloadEntryAssets=async function(){
    if(!this._preloadImage) return;
    const st=this._assetLoading||{};
    const total=ENTRY_PRELOAD_ASSETS.length;
    let done=0;
    const loadOne=async(src)=>{
      st.label=src.includes('/relic_ui/')?'載入聖物背包':(src.includes('loading_splash')?'載入啟動畫面':'載入場景資源');
      st.detail=(src.split('/').pop()||src).split('?')[0];
      st.progress=Math.min(0.985,done/total);
      this.render&&this.render();
      try{ await this._preloadImage(src); }
      catch(e){ try{ console.warn('[HB preload asset]',src,e); }catch(_e){} }
      done++;
      st.progress=Math.min(0.995,done/total);
      this.render&&this.render();
    };
    let idx=0;
    const worker=async()=>{
      while(idx<ENTRY_PRELOAD_ASSETS.length){
        const src=ENTRY_PRELOAD_ASSETS[idx++];
        await loadOne(src);
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    this._ensureLoadingSplash&&this._ensureLoadingSplash();
    this._preloadRelicUiAssets&&this._preloadRelicUiAssets();
    st.label='準備開球';
    st.detail='Hoopbreaker';
    st.progress=1;
    this.render&&this.render();
  };
})();

// === final activation v3: daily leaderboard countdown, speed HUD and confirm safety ===
(function(){
  if(typeof Game==='undefined') return;

  const MIN_LEADERBOARD_SHOTS=10;
  const pad2=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
  const clamp01=v=>Math.max(0,Math.min(1,v));
  const dailyResetCountdown=()=>{
    const now=new Date();
    const next=new Date(now);
    next.setHours(24,0,0,0);
    const total=Math.floor(Math.max(0,next-now)/1000);
    const h=Math.floor(total/3600);
    const m=Math.floor((total%3600)/60);
    const s=total%60;
    return pad2(h)+':'+pad2(m)+':'+pad2(s);
  };

  Game.prototype._hbDrawLeaderButton=function(x,y,w,h,label,id,cb,primary){
    const ctx=this.ctx;
    this.rr(x,y,w,h,12);
    const g=ctx.createLinearGradient(0,y,0,y+h);
    if(primary){ g.addColorStop(0,'#c7ff3a'); g.addColorStop(1,'#5d9416'); }
    else { g.addColorStop(0,'rgba(40,28,16,0.96)'); g.addColorStop(1,'rgba(14,9,6,0.98)'); }
    ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=2.4;
    ctx.strokeStyle=primary?'#d7a945':'rgba(215,169,69,0.66)';
    this.rr(x,y,w,h,12); ctx.stroke();
    this.text(label,x+w/2,y+h/2,26,primary?'#111706':'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
    this.btn(x,y,w,h,id,cb);
  };

  Game.prototype.drawConfirm=function(){
    const c=this._confirm;
    if(!c) return;
    const ctx=this.ctx;
    ctx.save();
    ctx.fillStyle='rgba(2,1,4,0.76)';
    ctx.fillRect(0,0,BW,BH);
    ctx.restore();
    this.btn(0,0,BW,BH,'confirm_scrim',()=>{});
    const w=Math.min(860,BW-180),h=320,x=BW/2-w/2,y=BH/2-h/2;
    this.panel(x,y,w,h,{r:22,stroke:'rgba(215,169,69,0.66)'});
    this.wrap(String(c.m||''),BW/2,y+98,w-120,42,'#ece0c4',30);
    const bw=260,bh=76,by=y+h-112;
    this.rr(BW/2-bw-22,by,bw,bh,14);
    ctx.fillStyle='rgba(124,32,30,0.94)'; ctx.fill();
    ctx.lineWidth=2.5; ctx.strokeStyle='#e6433c'; ctx.stroke();
    this.text('確認',BW/2-bw-22+bw/2,by+bh/2,29,'#fff',{align:'center',baseline:'middle',weight:'900'});
    this.buttons.push({x:BW/2-bw-22,y:by,w:bw,h:bh,id:'confirm_yes',opts:{_confirm:true},cb:()=>{
      const cur=this._confirm;
      this._confirm=null;
      const fn=cur&&cur.onYes;
      if(typeof fn==='function') fn();
      this.render&&this.render();
    }});
    this.rr(BW/2+22,by,bw,bh,14);
    ctx.fillStyle='rgba(40,30,18,0.94)'; ctx.fill();
    ctx.lineWidth=2.2; ctx.strokeStyle='rgba(200,155,60,0.48)'; ctx.stroke();
    this.text('取消',BW/2+22+bw/2,by+bh/2,29,'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
    this.buttons.push({x:BW/2+22,y:by,w:bw,h:bh,id:'confirm_no',opts:{_confirm:true},cb:()=>{
      this._confirm=null;
      this.render&&this.render();
    }});
  };

  Game.prototype.drawLeaderboardModal=function(){
    const ctx=this.ctx;
    const IL=this.insL||0,IR=this.insR||0,IT=this.insT||0,IB=this.insB||0;
    ctx.save();
    ctx.fillStyle='rgba(3,1,7,0.93)';
    ctx.fillRect(-4000,-4000,BW+8000,BH+8000);
    ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'leaderboard_scrim',()=>{});

    const x=IL+34,y=IT+24,w=BW-IL-IR-68,h=BH-IT-IB-48;
    this.rr(x,y,w,h,22);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(23,16,12,0.98)');
    bg.addColorStop(0.52,'rgba(10,8,11,0.99)');
    bg.addColorStop(1,'rgba(6,4,9,0.99)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22); ctx.stroke();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(185,255,47,0.34)'; this.rr(x+12,y+12,w-24,h-24,16); ctx.stroke();

    this.text('今日命中排行榜',x+w/2,y+62,48,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:14});
    this.text('每日重置倒數 '+dailyResetCountdown()+'  ·  本機午夜刷新',x+w/2,y+106,25,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    this.text('至少 '+MIN_LEADERBOARD_SHOTS+' 球列入名次；未滿 '+MIN_LEADERBOARD_SHOTS+' 球列入觀察',x+w/2,y+138,20,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
    this._hbDrawLeaderButton(x+w-158,y+30,116,54,'關閉','leaderboard_close',()=>this._closeLeaderboard(),false);
    this._hbDrawLeaderButton(x+42,y+30,116,54,'刷新','leaderboard_refresh',()=>{
      this._leaderboardLoading=true;
      this._leaderboardStatus='重新整理...';
      this._fetchLeaderboard&&this._fetchLeaderboard();
      this.render();
    },true);

    const tx=x+44, ty=y+174, tw=w-88;
    const rowH=Math.max(68,Math.min(82,Math.floor((h-286)/8)));
    const headerH=58;
    const cols={rank:tx+58,name:tx+205,shot:tx+tw*0.66,acc:tx+tw-120};
    this.rr(tx,ty,tw,headerH,12);
    ctx.fillStyle='rgba(215,169,69,0.13)'; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(215,169,69,0.38)'; this.rr(tx,ty,tw,headerH,12); ctx.stroke();
    this.text('名次',cols.rank,ty+headerH/2,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('投手',cols.name,ty+headerH/2,25,'#d7a945',{baseline:'middle',weight:'900'});
    this.text('出手 / 命中',cols.shot,ty+headerH/2,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('命中率',cols.acc,ty+headerH/2,25,'#d7a945',{align:'center',baseline:'middle',weight:'900'});

    const rows=(this._leaderboardRows?this._leaderboardRows():[]);
    const maxRows=Math.max(4,Math.floor((y+h-ty-headerH-78)/rowH));
    for(let i=0;i<Math.min(rows.length,maxRows);i++){
      const r=rows[i], ry=ty+headerH+12+i*rowH, mid=ry+(rowH-8)/2;
      this.rr(tx,ry,tw,rowH-8,12);
      ctx.fillStyle=r.local?'rgba(159,224,36,0.18)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.15)');
      ctx.fill();
      ctx.lineWidth=r.local?2.2:1.2;
      ctx.strokeStyle=r.local?'rgba(185,255,47,0.58)':'rgba(215,169,69,0.20)';
      this.rr(tx,ry,tw,rowH-8,12); ctx.stroke();
      const qualified=!!r.qualified;
      const rankText=qualified?String(r.rank):'觀察';
      const muted=qualified?'#efe3ca':'#b8ad96';
      const name=(r.local?'你 · ':'')+String(r.name||'未命名投手');
      const accText=r.shots?Math.round((r.acc||0)*100)+'%':'0%';
      this.text(rankText,cols.rank,mid,qualified?28:23,qualified?'#ffe7a6':'#9fe024',{align:'center',baseline:'middle',weight:'900'});
      this.text(this._clip?this._clip(name,tw*0.36,29,'900'):name,cols.name,mid,29,r.local?'#d8ff44':muted,{baseline:'middle',weight:'900'});
      this.text((r.shots||0)+' / '+(r.makes||0),cols.shot,mid,28,muted,{align:'center',baseline:'middle',weight:'900'});
      this.text(accText,cols.acc,mid,29,qualified?'#ece0c4':'#b6aa90',{align:'center',baseline:'middle',weight:'900'});
      if(!qualified && (r.shots||0)>0) this.text('未滿'+MIN_LEADERBOARD_SHOTS+'球',cols.acc+78,mid,16,'#9fe024',{baseline:'middle',weight:'800'});
    }
    if(!rows.length){
      this.text('今天還沒有命中紀錄',x+w/2,y+h/2+18,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }
    const status=this._leaderboardLoading?'載入中...':(this._leaderboardStatus||'');
    this.text(status,x+w/2,y+h-38,22,'#9e9178',{align:'center',baseline:'middle',weight:'800'});
  };

  Game.prototype.drawSpeedHUD=function(){
    const ctx=this.ctx, run=this.run;
    if(!run) return;
    const IT=this.insT||0, cx=BW/2, y=IT+16;
    const mx=run.shotClockMax||10;
    const left=Math.max(0,Number(run.shotClock)||0);
    const frac=clamp01(left/mx);
    const low=left<3;
    const chance=Math.max(0,Math.ceil((run.hp||0)/Math.max(1,Math.ceil((run.maxhp||1)/5))));
    this.text('速投 '+(run.speedScore||0)+' 球',cx,y+28,34,'#ffe7b0',{align:'center',baseline:'middle',weight:'900'});
    const bw=460,bx=cx-bw/2,by=y+50,bh=22;
    this.rr(bx,by,bw,bh,11); ctx.fillStyle='rgba(8,5,3,0.74)'; ctx.fill();
    if(frac>0){ this.rr(bx,by,bw*frac,bh,11); ctx.fillStyle=low?'#ff3322':(frac<0.5?'#e0a032':'#39ad39'); ctx.fill(); }
    ctx.lineWidth=2.6; ctx.strokeStyle=low?'rgba(255,80,60,0.95)':'rgba(230,192,104,0.52)'; this.rr(bx,by,bw,bh,11); ctx.stroke();
    this.text('倒數 '+left.toFixed(1)+'s',cx,by+bh+30,27,low?'#ff6a4a':'#ecdfc4',{align:'center',baseline:'middle',weight:'900'});
    this.text('剩餘失誤容錯 '+chance,cx,by+bh+64,22,chance<=1?'#ff6a4a':'#c8b894',{align:'center',baseline:'middle',weight:'800'});
  };

  Game.prototype._speedHoopPos=function(force){
    const run=this.run;
    if(!run||!run.hoop||!run.host) return;
    const H=run.hoop, host=run.host;
    const lefty=this.save&&this.save.settings&&this.save.settings.lefty;
    const score=Math.max(0,Number(run.speedScore)||0);
    const spread=clamp01(score/14);
    const near=0.38-0.11*spread;
    const far=0.68+0.18*spread;
    const throwX=lefty?BW-210:210;
    let tx=H.x||BW*0.55, ty=H.y||BH*0.42;
    for(let tries=0;tries<12;tries++){
      const raw=rand(BW*near,BW*far);
      const candidateX=lefty?BW-raw:raw;
      const dx=Math.abs(candidateX-throwX);
      const farT=clamp01((dx-BW*0.48)/(BW*0.34));
      const yMax=(BH*0.62)*(1-farT)+(BH*0.49)*farT;
      const candidateY=rand(BH*0.27,yMax);
      if(!H.x||Math.hypot(candidateX-H.x,candidateY-H.y)>210||tries>6){
        tx=candidateX; ty=candidateY; break;
      }
    }
    H.tx=clamp(tx,BW*0.14,BW*0.86);
    H.ty=clamp(ty,BH*0.27,BH*0.62);
    host.tx=clamp(H.tx+(lefty?-150:150),200,BW-200);
    host.ty=H.ty;
    H.label='速投框';
    if(force){
      H.x=H.tx; H.y=H.ty;
      host.x=host.tx; host.y=host.ty;
      run.repos=0;
    } else {
      run.repos=0.68;
    }
  };
})();

// === final activation v4: leaderboard data density and observer badge layout ===
(function(){
  if(typeof Game==='undefined') return;

  const MIN_LEADERBOARD_SHOTS=10;
  const pad2=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
  const countdown=()=>{
    const now=new Date(), next=new Date(now);
    next.setHours(24,0,0,0);
    const total=Math.floor(Math.max(0,next-now)/1000);
    return pad2(total/3600)+':'+pad2((total%3600)/60)+':'+pad2(total%60);
  };
  const pct=n=>Math.max(0,Math.min(100,Math.round((Number(n)||0)*100)));

  Game.prototype.drawLeaderboardModal=function(){
    const ctx=this.ctx;
    const IL=this.insL||0,IR=this.insR||0,IT=this.insT||0,IB=this.insB||0;
    ctx.save();
    ctx.fillStyle='rgba(3,1,7,0.93)';
    ctx.fillRect(-4000,-4000,BW+8000,BH+8000);
    ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'leaderboard_scrim',()=>{});

    const x=IL+34,y=IT+24,w=BW-IL-IR-68,h=BH-IT-IB-48;
    this.rr(x,y,w,h,22);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(23,16,12,0.98)');
    bg.addColorStop(0.52,'rgba(10,8,11,0.99)');
    bg.addColorStop(1,'rgba(6,4,9,0.99)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22); ctx.stroke();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(185,255,47,0.34)'; this.rr(x+12,y+12,w-24,h-24,16); ctx.stroke();

    this.text('今日命中排行榜',x+w/2,y+56,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:14});
    this.text('每日重置倒數 '+countdown()+'  ·  本機午夜刷新',x+w/2,y+96,24,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    this.text('滿 '+MIN_LEADERBOARD_SHOTS+' 球才列入名次；穩定分用保守命中率計算，避免小樣本霸榜',x+w/2,y+126,20,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
    this._hbDrawLeaderButton(x+w-158,y+30,116,54,'關閉','leaderboard_close',()=>this._closeLeaderboard(),false);
    this._hbDrawLeaderButton(x+42,y+30,116,54,'刷新','leaderboard_refresh',()=>{
      this._leaderboardLoading=true;
      this._leaderboardStatus='重新整理...';
      this._fetchLeaderboard&&this._fetchLeaderboard();
      this.render();
    },true);

    const tx=x+44, ty=y+154, tw=w-88;
    const headerH=56;
    const rowH=Math.max(76,Math.min(88,Math.floor((h-268)/7)));
    const cols={
      rankX:tx+72,
      nameX:tx+190,
      shotX:tx+tw*0.61,
      accX:tx+tw*0.78,
      scoreX:tx+tw-92
    };

    this.rr(tx,ty,tw,headerH,12);
    ctx.fillStyle='rgba(215,169,69,0.13)'; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(215,169,69,0.38)'; this.rr(tx,ty,tw,headerH,12); ctx.stroke();
    this.text('名次',cols.rankX,ty+headerH/2,26,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('投手',cols.nameX,ty+headerH/2,25,'#d7a945',{baseline:'middle',weight:'900'});
    this.text('出手 / 命中',cols.shotX,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('命中率',cols.accX,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});
    this.text('穩定分',cols.scoreX,ty+headerH/2,24,'#d7a945',{align:'center',baseline:'middle',weight:'900'});

    const rows=(this._leaderboardRows?this._leaderboardRows():[]);
    const maxRows=Math.max(4,Math.floor((y+h-ty-headerH-76)/rowH));
    for(let i=0;i<Math.min(rows.length,maxRows);i++){
      const r=rows[i], ry=ty+headerH+12+i*rowH, mid=ry+(rowH-8)/2;
      const shots=Math.max(0,Number(r.shots)||0);
      const makes=Math.max(0,Number(r.makes)||0);
      const qualified=!!r.qualified;
      const need=Math.max(0,MIN_LEADERBOARD_SHOTS-shots);
      const muted=qualified?'#efe3ca':'#b8ad96';
      const score=pct(r.score!=null?r.score:r.acc);

      this.rr(tx,ry,tw,rowH-8,12);
      ctx.fillStyle=r.local?'rgba(159,224,36,0.18)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.15)');
      ctx.fill();
      ctx.lineWidth=r.local?2.2:1.2;
      ctx.strokeStyle=r.local?'rgba(185,255,47,0.58)':'rgba(215,169,69,0.20)';
      this.rr(tx,ry,tw,rowH-8,12); ctx.stroke();

      const badgeX=tx+18, badgeY=ry+12, badgeW=108, badgeH=rowH-32;
      this.rr(badgeX,badgeY,badgeW,badgeH,14);
      ctx.fillStyle=qualified?'rgba(215,169,69,0.16)':'rgba(159,224,36,0.15)';
      ctx.fill();
      ctx.lineWidth=1.8;
      ctx.strokeStyle=qualified?'rgba(255,231,166,0.48)':'rgba(159,224,36,0.58)';
      this.rr(badgeX,badgeY,badgeW,badgeH,14); ctx.stroke();
      this.text(qualified?String(r.rank):'觀察',badgeX+badgeW/2,badgeY+badgeH/2-(qualified?0:9),qualified?31:25,qualified?'#ffe7a6':'#9fe024',{align:'center',baseline:'middle',weight:'900'});
      if(!qualified) this.text('差 '+need+' 球',badgeX+badgeW/2,badgeY+badgeH/2+18,15,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});

      const name=(r.local?'你 · ':'')+String(r.name||'未命名投手');
      const nameW=Math.max(260,cols.shotX-cols.nameX-40);
      this.text(this._clip?this._clip(name,nameW,29,'900'):name,cols.nameX,mid-10,29,r.local?'#d8ff44':muted,{baseline:'middle',weight:'900'});
      this.text(qualified?('已入榜 · 樣本 '+shots+' 球'):('還差 '+need+' 球列入名次'),cols.nameX,mid+22,17,qualified?'#a99a7a':'#9fe024',{baseline:'middle',weight:'800'});

      this.text(shots+' / '+makes,cols.shotX,mid-4,28,muted,{align:'center',baseline:'middle',weight:'900'});
      this.text(qualified?'正式樣本':('進度 '+shots+'/'+MIN_LEADERBOARD_SHOTS),cols.shotX,mid+24,16,qualified?'#8f8068':'#9fe024',{align:'center',baseline:'middle',weight:'800'});
      this.text(shots?Math.round((r.acc||0)*100)+'%':'0%',cols.accX,mid,30,qualified?'#ece0c4':'#b6aa90',{align:'center',baseline:'middle',weight:'900'});
      this.text(String(score),cols.scoreX,mid-4,29,qualified?'#ffe7a6':'#9e9178',{align:'center',baseline:'middle',weight:'900'});
      this.text('保守',cols.scoreX,mid+24,15,'#8f8068',{align:'center',baseline:'middle',weight:'800'});
    }
    if(!rows.length){
      this.text('今天還沒有命中紀錄',x+w/2,y+h/2+18,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }
    const status=this._leaderboardLoading?'載入中...':(this._leaderboardStatus||'');
    this.text(status,x+w/2,y+h-38,22,'#9e9178',{align:'center',baseline:'middle',weight:'800'});
  };
})();

// === final activation v8: endless abyss gameplay and dedicated art ===
(function(){
  if(typeof Game==='undefined') return;

  const ENDLESS_BG='/assets/endless/endless_cracked_court.png';
  const ENDLESS_BOSS='/assets/endless/boss_hoop_guardian.png';
  const cloneStage=(stage,extra)=>{
    const src=stage||{};
    const out=Object.assign({},src,extra||{});
    out.guards=Array.isArray(src.guards)?src.guards.slice():(Array.isArray(out.guards)?out.guards.slice():['chain','skel']);
    return out;
  };
  const mmss=t=>{
    t=Math.max(0,Math.ceil(Number(t)||0));
    const m=Math.floor(t/60),s=t%60;
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  };

  const oldButton=Game.prototype.button;
  Game.prototype.button=function(x,y,w,h,label,id,cb,o){
    if(id==='endless_intro_next'){
      label='開始挑戰';
      cb=()=>this.startEndless();
    }
    return oldButton.call(this,x,y,w,h,label,id,cb,o);
  };

  Game.prototype._endlessPath=function(){
    const act1=(typeof STAGES!=='undefined'&&STAGES[1])||[];
    const normal=cloneStage(act1[0],{
      name:'裂隙前哨',
      host:'深淵記分員',
      body:'shade',
      guards:['chain','bat','zombie','drummer'],
      count:12,
      boss:false,
      tier:2,
      tut:false
    });
    const bossSrc=act1[4]||act1[act1.length-1]||act1[0];
    const boss=cloneStage(bossSrc,{
      name:'深淵 Boss：籃框守衛',
      host:'籃框守衛',
      body:'worldking',
      guards:['chain','shield','drummer','eye'],
      count:18,
      boss:true,
      waves:3,
      tier:3
    });
    return [normal,boss];
  };

  Game.prototype._primeEndlessRun=function(run){
    if(!run) return;
    run.endless=true;
    run.route='endless';
    run.speed=false;
    run.sandbag=false;
    run.nodeMode=false;
    run.nodeIdx=null;
    run.tutorial=false;
    run.endlessDepth=run.endlessDepth||1;
    run.endlessBosses=run.endlessBosses||0;
    run.endlessProgress=run.endlessProgress||0;
    run.endlessProgressMax=run.endlessProgressMax||100;
    run.endlessBossTimeMax=run.endlessBossTimeMax||180;
    run.endlessBossTime=run.endlessBossTime==null?run.endlessBossTimeMax:run.endlessBossTime;
    run.endlessBossActive=!!(run.stage&&run.stage.boss);
    run.endlessTimedOut=!!run.endlessTimedOut;
  };

  Game.prototype.startEndless=function(){
    if(!(this.save&&this.save.admin)) this.save.endless=true;
    this._endlessIntro=false;
    this._selRoute='std';
    this._selStone=null;
    this.startRun(1,'std',null);
    const run=this.run;
    if(!run) return;
    run.path=this._endlessPath();
    run.endlessDepth=1;
    run.endlessBosses=0;
    run.endlessProgress=0;
    run.endlessProgressMax=100;
    run.endlessBossTimeMax=180;
    run.endlessBossTime=180;
    run.endlessTimedOut=false;
    run.endlessBossActive=false;
    this._primeEndlessRun(run);
    this.enterStage(0);
    this._primeEndlessRun(this.run);
    if(this.run) this.run.banner={text:'無盡深淵',sub:'第 1 層 · 集滿進度召喚 Boss',t:2.8};
    this.toast('無盡深淵','命中與擊殺會推進深淵進度');
    this.render();
  };

  Game.prototype._endlessAddProgress=function(amount){
    const run=this.run;
    if(!run||!run.endless||!run.stage||run.stage.boss||run._stageClearing||run._endlessSummoning) return;
    const max=run.endlessProgressMax||100;
    run.endlessProgress=clamp((run.endlessProgress||0)+amount,0,max);
    if(run.endlessProgress>=max) this._endlessSummonBoss();
  };

  Game.prototype._endlessSummonBoss=function(){
    const run=this.run;
    if(!run||!run.endless||run._endlessSummoning) return;
    run._endlessSummoning=true;
    run._stageClearing=true;
    run.endlessProgress=run.endlessProgressMax||100;
    run.projectiles=[];
    run.intf=[];
    run.guards=[];
    run.modal=null;
    run.banner={text:'深淵 Boss 降臨',sub:'場上護衛已清空 · 3 分鐘擊破挑戰開始',t:1.8};
    this.floater(BW/2,BH*0.24,'深淵裂口開啟','#d8ff44',34,{crit:true,t:1.2});
    this.audio&&this.audio.sfx&&this.audio.sfx('boss');
    setTimeout(()=>{
      if(this.run!==run) return;
      run._endlessSummoning=false;
      run._stageClearing=false;
      const bossIndex=Math.min(1,run.path.length-1);
      this.enterStage(bossIndex);
      this._primeEndlessRun(this.run);
      if(this.run){
        this.run.endlessBossActive=true;
        this.run.endlessBossTime=this.run.endlessBossTimeMax||180;
        this.run.endlessTimedOut=false;
        this.run.banner={text:'深淵 Boss',sub:'限時擊破可獲得高階升級機會',t:2.4};
      }
    },520);
  };

  Game.prototype.finishEndlessRun=function(won){
    const run=this.run;
    if(!run){ this.go('hub'); return; }
    this._stageClearing=false;
    const s=this.save,adm=!!s.admin;
    const acc=run.shots?run.makes/run.shots:0;
    const depth=run.endlessDepth||1;
    const fastClear=won&&!run.endlessTimedOut;
    if(!adm){
      s.endless=true;
      s.endlessBest=Math.max(s.endlessBest||0,depth);
      if(s.stats){
        s.stats.bestScore=Math.max(s.stats.bestScore||0,run.score||0);
        s.stats.bestCombo=Math.max(s.stats.bestCombo||0,run.bestCombo||0);
        s.stats.bestAcc=Math.max(s.stats.bestAcc||0,acc);
      }
      persist(s);
      const pr=this._heroProg&&this._heroProg(run.heroId);
      if(pr){
        pr.level=run.level;
        pr.xp=run.xp;
        this._saveProfile&&this._saveProfile();
      }
    }
    const _ptsAvail=this._talentPtsAvail?this._talentPtsAvail(run.heroId):0;
    const _ptsEarned=this._talentPtsEarned?this._talentPtsEarned(run.heroId):0;
    this._endStats={won,endless:true,act:run.act,route:'endless',speed:false,speedScore:0,stone:null,nodeMode:false,node:null,boss:true,stageName:'無盡深淵 第 '+depth+' 層',score:run.score,acc,swishes:run.swishes,banks:run.banks,bestCombo:run.bestCombo,kills:run.kills,level:run.level,talentPts:_ptsAvail,talentEarned:_ptsEarned,admin:adm,rewardLog:(run.rewardLog||[]).slice(),words:run.words.slice(),reached:depth,total:depth,loot:null,marks:fastClear?2:1,picked:false,session:null};
    this.screen=won?'win':'lose';
    this.audio.sfx(won?'win':'lose');
    if(won) this.audio.sfx('whistle');
    if(!won&&!adm) this._recordDeath&&this._recordDeath();
    this.particles.length=0;
    this.floaters.length=0;
    this.run=null;
  };

  Game.prototype._endlessImg=function(key,src){
    this._endlessImgs=this._endlessImgs||{};
    if(this._endlessImgs[key]===undefined){
      try{
        const im=new Image();
        im.onerror=()=>{im._err=true;};
        im.onload=()=>{try{if(this.screen==='battle'&&this.render)this.render();}catch(e){}};
        im.src=src;
        this._endlessImgs[key]=im;
      }catch(e){ this._endlessImgs[key]=null; }
    }
    return this._endlessImgs[key];
  };

  const oldEnsureBattleBg=Game.prototype._ensureBattleBg;
  Game.prototype._ensureBattleBg=function(act){
    if(this.run&&this.run.endless) return this._endlessImg('bg',ENDLESS_BG);
    return oldEnsureBattleBg.call(this,act);
  };

  const oldDrawMobGroup=Game.prototype.drawMobGroup;
  Game.prototype.drawMobGroup=function(){
    const run=this.run;
    if(run&&run.endless){
      if(run.stage&&run.stage.boss) return this.drawEndlessBossArt();
      return;
    }
    return oldDrawMobGroup.apply(this,arguments);
  };

  Game.prototype.drawEndlessBossArt=function(){
    const ctx=this.ctx,run=this.run,im=this._endlessImg('boss',ENDLESS_BOSS);
    if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const nw=im.naturalWidth,nh=im.naturalHeight;
    let H=BH*0.68,W=H*nw/nh;
    const maxW=BW*0.58;
    if(W>maxW){ W=maxW; H=W*nh/nw; }
    const cx=BW*0.69,by=BH-28;
    ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.45,30,cx,by-H*0.45,W*0.62);
    glow.addColorStop(0,'rgba(160,255,48,0.20)');
    glow.addColorStop(0.62,'rgba(100,255,36,0.08)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.ellipse(cx,by-H*0.45,W*0.58,H*0.52,0,0,TAU);
    ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.42);
    sh.addColorStop(0,'rgba(0,0,0,0.58)');
    sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh;
    ctx.beginPath();
    ctx.ellipse(cx,by-8,W*0.42,H*0.08,0,0,TAU);
    ctx.fill();
    let lp=0;
    if(run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(clamp(tt,0,1)*Math.PI); }
    if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.05,1+lp*0.05); ctx.translate(-cx-lp*54,-by); }
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run._mobHitFlash>0){
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(0.45,run._mobHitFlash*0.65);
      ctx.drawImage(im,cx-W/2,by-H,W,H);
    }
    ctx.restore();
  };

  const oldDrawGuard=Game.prototype.drawGuard;
  Game.prototype.drawGuard=function(g){
    if(this.run&&this.run.endless) return this.drawEndlessGuard(g);
    return oldDrawGuard.apply(this,arguments);
  };

  Game.prototype.drawEndlessGuard=function(g){
    if(this.run&&this.run.stage&&this.run.stage.boss) return;
    const ctx=this.ctx,base=g.r||30,bob=Math.sin((this.t||0)*2.4+(g.slot||0))*4;
    const col=g.elite?'#d7a945':'#8f62c8',glow=g.elite?'rgba(255,215,110,0.35)':'rgba(155,255,50,0.28)';
    ctx.save();
    ctx.translate(g.x,g.y);
    ctx.globalAlpha=g.phased?0.48:1;
    this.shadow(0,base*0.92,base*0.95,0.24);
    const rg=ctx.createRadialGradient(0,bob,4,0,bob,base*2.2);
    rg.addColorStop(0,glow);
    rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=rg;
    ctx.beginPath();
    ctx.arc(0,bob,base*2.2,0,TAU);
    ctx.fill();
    this._bean(0,bob-base*0.1,base*1.0,base*(g.elite?1.75:1.55),col,{lw:6,seed:37,wob:2,lean:g.elite?-1.5:2});
    ctx.fillStyle='#100914';
    ctx.beginPath();
    ctx.arc(-base*0.22,bob-base*0.28,base*0.09,0,TAU);
    ctx.arc(base*0.22,bob-base*0.28,base*0.09,0,TAU);
    ctx.fill();
    ctx.strokeStyle='#9fe024';
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(-base*0.44,bob-base*0.55);
    ctx.lineTo(base*0.44,bob-base*0.55);
    ctx.stroke();
    if(g.shieldUp){
      ctx.strokeStyle='rgba(215,169,69,0.86)';
      ctx.lineWidth=5;
      this.rr(base*0.35,bob-base*0.75,base*0.82,base*1.28,8);
      ctx.stroke();
    }
    if(g.flash>0){
      ctx.globalAlpha=g.flash*0.62;
      ctx.fillStyle='#fff';
      ctx.beginPath();
      ctx.arc(0,bob,base*1.1,0,TAU);
      ctx.fill();
    }
    ctx.restore();
    this.drawGuardTags&&this.drawGuardTags(g);
  };

  const oldDrawEliteTelegraphs=Game.prototype.drawEliteTelegraphs;
  Game.prototype.drawEliteTelegraphs=function(){
    if(this.run&&this.run.endless&&this.run.stage&&this.run.stage.boss) return;
    return oldDrawEliteTelegraphs.apply(this,arguments);
  };

  Game.prototype.drawEndlessHUD=function(){
    return;
  };

  const oldMakeBasket=Game.prototype.makeBasket;
  Game.prototype.makeBasket=function(){
    const beforeRun=this.run,beforeMakes=beforeRun?beforeRun.makes:0;
    const r=oldMakeBasket.apply(this,arguments);
    const run=this.run;
    if(run&&run===beforeRun&&run.endless&&run.makes>beforeMakes&&!(run.stage&&run.stage.boss)) this._endlessAddProgress(12);
    return r;
  };

  const oldKillGuard=Game.prototype.killGuard;
  Game.prototype.killGuard=function(g){
    const wasDead=!!(g&&g.dead);
    const r=oldKillGuard.apply(this,arguments);
    const run=this.run;
    if(run&&run.endless&&g&&!wasDead&&g.dead&&!g.sandbag&&!(run.stage&&run.stage.boss)) this._endlessAddProgress(g.elite?18:10);
    return r;
  };

  const oldUpdateBattle=Game.prototype.updateBattle;
  Game.prototype.updateBattle=function(dt){
    const r=oldUpdateBattle.apply(this,arguments);
    const run=this.run;
    if(run&&run.endless&&run.stage&&run.stage.boss&&!run.modal&&!run._stageClearing){
      run.endlessBossActive=true;
      run.endlessBossTime=Math.max(0,(run.endlessBossTime==null?run.endlessBossTimeMax||180:run.endlessBossTime)-dt);
      if(run.endlessBossTime<=0&&!run.endlessTimedOut){
        run.endlessTimedOut=true;
        this.floater(BW/2,BH*0.26,'限時獎勵失效','#ff6a4a',32,{crit:true,t:1.2});
        this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
      }
    }
    return r;
  };

  const oldOnStageClear=Game.prototype.onStageClear;
  Game.prototype.onStageClear=function(){
    const run=this.run;
    if(run&&run.endless){
      if(run._stageClearing) return;
      if(run.stage&&run.stage.boss&&run.spawned<run.guardsTotal) return oldOnStageClear.apply(this,arguments);
      if(run.stage&&!run.stage.boss) return this._endlessSummonBoss();
      if(run.stage&&run.stage.boss){
        run._stageClearing=true;
        run.endlessBosses=(run.endlessBosses||0)+1;
        run.banner={text:'Boss 擊破',sub:run.endlessTimedOut?'獲得基本獎勵':'限時擊破 · 高階升級機會',t:2.2};
        setTimeout(()=>{ if(this.run===run){ run._stageClearing=false; this.finishRun(true); } },780);
        return;
      }
    }
    return oldOnStageClear.apply(this,arguments);
  };

  const oldFinishRun=Game.prototype.finishRun;
  Game.prototype.finishRun=function(won){
    if(this.run&&this.run.endless) return this.finishEndlessRun(won);
    return oldFinishRun.apply(this,arguments);
  };

  const oldDrawHUD=Game.prototype.drawHUD;
  Game.prototype.drawHUD=function(){
    const r=oldDrawHUD.apply(this,arguments);
    const run=this.run;
    if(run&&run.endless&&!run.speed){
      const IT=this.insT||0;
      const ctx=this.ctx;
      const sw=Math.min(720,Math.max(620,BW*0.38)),sx=BW/2-sw/2,syy=IT+18,sh=128;
      this.panel(sx,syy,sw,sh,{r:16,c0:'rgba(18,12,8,0.9)',c1:'rgba(6,5,7,0.94)'});
      const boss=!!(run.stage&&run.stage.boss);
      const waves=boss?(run.stage.waves||3):1;
      const curW=boss?Math.min((run.bossWave||0)+1,waves):1;
      const total=run.guardsTotal||0;
      const rem=(run.guards?run.guards.length:0)+Math.max(0,total-(run.spawned||0));
      const stageName=(run.stage&&run.stage.name)||'深淵裂隙';
      const max=boss?(run.endlessBossTimeMax||180):(run.endlessProgressMax||100);
      const val=boss?(run.endlessBossTime||0):(run.endlessProgress||0);
      const ratio=boss?clamp(val/max,0,1):clamp(val/max,0,1);
      const stat=boss?mmss(val):(Math.round(val)+'/'+max);
      const mode=boss?'Boss 限時':'深淵進度';
      const sub=boss?('第 '+curW+'/'+waves+' 波 · 剩餘護衛 '+rem+'/'+total):('剩餘護衛 '+rem+'/'+total);
      this.text('第 '+(run.endlessDepth||1)+' 層',sx+34,syy+32,34,'#d8ff44',{baseline:'middle',weight:'900',glow:8});
      this.text('無盡深淵',sx+sw-34,syy+31,22,'#ffe7a6',{align:'right',baseline:'middle',weight:'900'});
      this.text(this._clip(stageName,sw-84,33,'900'),BW/2,syy+66,33,boss?'#ff6a4a':'#ece0c4',{align:'center',baseline:'middle',weight:'900',glow:boss?8:0});
      this.text(sub,sx+32,syy+92,19,'#e6c068',{baseline:'middle',weight:'800'});
      this.text(mode+' '+stat,sx+sw-32,syy+92,19,boss?'#ffcf69':'#d8ff44',{align:'right',baseline:'middle',weight:'900'});
      const bx=sx+32,by=syy+107,bw=sw-64,bh=14;
      this.rr(bx,by,bw,bh,7);
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.fill();
      if(ratio>0){
        this.rr(bx,by,bw*ratio,bh,7);
        const fg=ctx.createLinearGradient(bx,by,bx+bw,by);
        fg.addColorStop(0,boss?'#ff5c37':'#9fe024');
        fg.addColorStop(1,boss?'#ffe14d':'#d8ff44');
        ctx.fillStyle=fg;
        ctx.fill();
      }
      ctx.lineWidth=1.4;
      ctx.strokeStyle='rgba(255,231,166,0.42)';
      this.rr(bx,by,bw,bh,7);
      ctx.stroke();
    }
    return r;
  };

  const oldDrawBattle=Game.prototype.drawBattle;
  Game.prototype.drawBattle=function(){
    return oldDrawBattle.apply(this,arguments);
  };
})();

// === final activation v10: endless depth biomes and loop, active after Game definition ===
(function(){
  if(typeof Game==='undefined') return;

  const ENDLESS_BIOMES=[
    {id:'rift',min:1,max:5,name:'裂縫球場',bg:'/assets/endless/endless_cracked_court.png',guards:['chain','bat','zombie','drummer'],count:12,waves:3},
    {id:'iron',min:6,max:10,name:'腐鐵看台',bg:'/assets/endless/bg_iron_cage_stands.png',guards:['shield','chain','drummer','zombie'],count:15,waves:3},
    {id:'cold',min:11,max:15,name:'冷焰禁區',bg:'/assets/endless/bg_coldflame_zone.png',guards:['frost','eye','bat','zombie'],count:17,waves:4},
    {id:'thunder',min:16,max:20,name:'雷骨穹頂',bg:'/assets/endless/bg_thunderbone_dome.png',guards:['drummer','chain','eye','frost'],count:19,waves:4},
    {id:'finale',min:21,max:9999,name:'終焉深籃堂',bg:'/assets/endless/bg_final_abyss_cathedral.png',guards:['shield','chain','drummer','frost','eye','zombie'],count:22,waves:4}
  ];
  const ENDLESS_BOSSES=[
    {depth:5,name:'罰球線執刑官',guards:['chain','bat','zombie'],count:20,waves:3,tag:'節奏門檻'},
    {depth:10,name:'破框縫合師',guards:['shield','chain','drummer'],count:24,waves:4,tag:'護盾擋拆'},
    {depth:15,name:'冷焰記分官',guards:['frost','eye','bat'],count:26,waves:4,tag:'冰霧短軌'},
    {depth:20,name:'雷骨播報王',guards:['drummer','chain','eye','frost'],count:28,waves:4,tag:'規則亂流'},
    {depth:25,name:'深淵籃君',guards:['shield','drummer','frost','eye','chain'],count:32,waves:5,tag:'終焉混成'}
  ];
  const DEEP_AFFIXES=['冷焰','戰鼓','鎖框','鏡框','貪分','深淵冠冕'];
  const cloneStage=(stage,extra)=>{
    const out=Object.assign({},stage||{},extra||{});
    out.guards=Array.isArray(out.guards)?out.guards.slice():['chain','bat'];
    return out;
  };

  Game.prototype._endlessBiome=function(depth){
    depth=Math.max(1,Number(depth)||1);
    return ENDLESS_BIOMES.find(b=>depth>=b.min&&depth<=b.max)||ENDLESS_BIOMES[0];
  };

  Game.prototype._endlessBossDef=function(depth){
    depth=Math.max(1,Number(depth)||1);
    const fixed=ENDLESS_BOSSES.find(b=>b.depth===depth);
    if(fixed) return fixed;
    if(depth>25){
      const base=ENDLESS_BOSSES[Math.floor((depth-26)/5)%ENDLESS_BOSSES.length];
      const aff=DEEP_AFFIXES[Math.floor(depth/5)%DEEP_AFFIXES.length];
      const extra=Math.min(20,Math.floor((depth-21)/2));
      return Object.assign({},base,{name:base.name+' · '+aff,count:base.count+extra,waves:Math.min(6,base.waves+1),tag:aff});
    }
    return {depth,name:'深淵守衛',guards:null,count:null,waves:null,tag:'層間試煉'};
  };

  Game.prototype._endlessPath=function(){
    const run=this.run||{};
    const depth=Math.max(1,run.endlessDepth||1);
    const biome=this._endlessBiome(depth);
    const bossDef=this._endlessBossDef(depth);
    const scale=1+Math.min(1.35,(depth-1)*0.055);
    const base=(typeof STAGES!=='undefined'&&STAGES[1]&&STAGES[1][0])||{};
    const bossSrc=(typeof STAGES!=='undefined'&&STAGES[1]&&(STAGES[1][4]||STAGES[1][0]))||base;
    const normal=cloneStage(base,{
      name:biome.name+' · 第 '+depth+' 層',
      host:'深淵記分員',
      body:'shade',
      guards:biome.guards,
      count:Math.round((biome.count||12)*scale),
      boss:false,
      tier:2+Math.min(4,Math.floor(depth/5)),
      tut:false
    });
    const isMilestone=depth%5===0||depth>25;
    const boss=cloneStage(bossSrc,{
      name:(isMilestone?bossDef.name:('深淵守衛 · '+biome.name)),
      host:(isMilestone?bossDef.name:'深淵守衛'),
      body:'worldking',
      guards:bossDef.guards||biome.guards,
      count:Math.round((bossDef.count||biome.count||18)*scale),
      boss:true,
      waves:bossDef.waves||biome.waves||3,
      tier:3+Math.min(5,Math.floor(depth/5)),
      endlessTag:bossDef.tag||biome.name,
      endlessMilestone:isMilestone
    });
    return [normal,boss];
  };

  const prevPrimeEndless=Game.prototype._primeEndlessRun;
  Game.prototype._primeEndlessRun=function(run){
    prevPrimeEndless&&prevPrimeEndless.call(this,run);
    if(!run||!run.endless) return;
    const biome=this._endlessBiome(run.endlessDepth||1);
    run.endlessBiome=biome.id;
    run.endlessBiomeName=biome.name;
    run.endlessProgressMax=100+Math.min(80,Math.floor(((run.endlessDepth||1)-1)/2)*10);
  };

  const prevEnsureBattleBg=Game.prototype._ensureBattleBg;
  Game.prototype._ensureBattleBg=function(act){
    if(this.run&&this.run.endless){
      const biome=this._endlessBiome(this.run.endlessDepth||1);
      return this._endlessImg('bg_'+biome.id,biome.bg);
    }
    return prevEnsureBattleBg.call(this,act);
  };

  Game.prototype._endlessAdvanceDepth=function(){
    const run=this.run;
    if(!run||!run.endless||run._stageClearing) return;
    run._stageClearing=true;
    const depth=run.endlessDepth||1;
    const fastClear=!run.endlessTimedOut;
    const jump=(fastClear&&depth%5===0)?2:1;
    const nextDepth=depth+jump;
    run.endlessBosses=(run.endlessBosses||0)+1;
    if(this.save&&!this.save.admin){
      this.save.endless=true;
      this.save.endlessBest=Math.max(this.save.endlessBest||0,nextDepth);
      persist(this.save);
    }
    run.banner={text:fastClear?'深淵突破':'深淵推進',sub:'進入第 '+nextDepth+' 層'+(jump>1?' · 限時擊破跳層':''),t:2.1};
    setTimeout(()=>{
      if(this.run!==run) return;
      run._stageClearing=false;
      run.endlessDepth=nextDepth;
      run.endlessProgress=0;
      run.endlessTimedOut=false;
      run.endlessBossActive=false;
      run.endlessBossTimeMax=Math.max(90,180-Math.min(70,Math.floor((nextDepth-1)/5)*12));
      run.endlessBossTime=run.endlessBossTimeMax;
      run.path=this._endlessPath();
      this._primeEndlessRun(run);
      this.enterStage(0);
      this._primeEndlessRun(this.run);
      if(this.run) this.run.banner={text:this.run.endlessBiomeName||'無盡深淵',sub:'第 '+nextDepth+' 層 · 集滿進度召喚 Boss',t:2.2};
    },820);
  };

  const prevStageClear=Game.prototype.onStageClear;
  Game.prototype.onStageClear=function(){
    const run=this.run;
    if(run&&run.endless){
      if(run._stageClearing) return;
      if(run.stage&&!run.stage.boss) return this._endlessSummonBoss();
      if(run.stage&&run.stage.boss){
        if(run.spawned<run.guardsTotal) return prevStageClear.apply(this,arguments);
        return this._endlessAdvanceDepth();
      }
    }
    return prevStageClear.apply(this,arguments);
  };
})();

// === final activation v12: endless stage banners do not inherit act names, active ===
(function(){
  if(typeof Game==='undefined') return;
  const prevEnterStage=Game.prototype.enterStage;
  Game.prototype.enterStage=function(pi){
    const out=prevEnterStage.apply(this,arguments);
    const run=this.run;
    if(run&&run.endless&&run.stage){
      this._primeEndlessRun&&this._primeEndlessRun(run);
      const depth=run.endlessDepth||1;
      const biome=run.endlessBiomeName||'無盡深淵';
      if(run.stage.boss){
        run.banner={text:run.stage.name,sub:'第 '+depth+' 層 · '+(run.stage.endlessTag||'Boss 降臨'),t:2.2};
      }else{
        run.banner={text:biome,sub:'第 '+depth+' 層 · 集滿進度召喚 Boss',t:2.2};
      }
    }
    return out;
  };
})();

// === final activation v14: active endless sprites, affixes, and dual leaderboards ===
(function(){
  if(typeof Game==='undefined') return;

  const MIN_DAILY_SHOTS=10;
  const E={
    crack_runner:{n:'裂縫跑位者',s:'/assets/endless/enemies/crack_runner.png',c:'#9fe024',z:1.18},
    screen_idol:{n:'擋拆石像',s:'/assets/endless/enemies/screen_idol.png',c:'#d7a945',z:1.34},
    iron_whistle:{n:'鐵哨裁判',s:'/assets/endless/enemies/iron_whistle.png',c:'#ffe14d',z:1.12},
    oil_monk:{n:'黏油球僧',s:'/assets/endless/enemies/oil_monk.png',c:'#6fbe30',z:1.24},
    mist_librarian:{n:'霧線司書',s:'/assets/endless/enemies/mist_librarian.png',c:'#b980ff',z:1.18},
    cold_rim_guard:{n:'寒框守衛',s:'/assets/endless/enemies/cold_rim_guard.png',c:'#6fd8ff',z:1.25},
    war_drum_leader:{n:'戰鼓看台長',s:'/assets/endless/enemies/war_drum_leader.png',c:'#ffb34d',z:1.25},
    shattered_board_collector:{n:'碎板收債人',s:'/assets/endless/enemies/shattered_board_collector.png',c:'#d8ff44',z:1.20}
  };
  const EM={
    rift:{chain:'crack_runner',bat:'mist_librarian',zombie:'oil_monk',drummer:'war_drum_leader',shield:'screen_idol',eye:'iron_whistle',frost:'cold_rim_guard'},
    iron:{shield:'screen_idol',chain:'iron_whistle',drummer:'war_drum_leader',zombie:'oil_monk',bat:'crack_runner',eye:'shattered_board_collector',frost:'cold_rim_guard'},
    cold:{frost:'cold_rim_guard',eye:'mist_librarian',bat:'mist_librarian',zombie:'oil_monk',chain:'crack_runner',shield:'screen_idol',drummer:'war_drum_leader'},
    thunder:{drummer:'war_drum_leader',chain:'shattered_board_collector',eye:'iron_whistle',frost:'cold_rim_guard',shield:'screen_idol',zombie:'oil_monk',bat:'mist_librarian'},
    finale:{shield:'screen_idol',chain:'crack_runner',drummer:'war_drum_leader',frost:'cold_rim_guard',eye:'shattered_board_collector',zombie:'oil_monk',bat:'mist_librarian'}
  };
  const AF=[
    ['crown','深淵冠冕','冠','#ffe14d'],
    ['mirror','鏡框','鏡','#8fe8ff'],
    ['countdown','倒數','倒','#ff6a4a'],
    ['lockrim','鎖框','鎖','#d8ff44'],
    ['greed','貪分','貪','#c89bff']
  ];
  const BS=[
    [5,'free_throw_executioner','/assets/endless/bosses/free_throw_executioner.png'],
    [10,'broken_rim_stitcher','/assets/endless/bosses/broken_rim_stitcher.png'],
    [15,'coldflame_scorekeeper','/assets/endless/bosses/coldflame_scorekeeper.png'],
    [20,'thunderbone_announcer','/assets/endless/bosses/thunderbone_announcer.png'],
    [9999,'abyss_hoop_lord','/assets/endless/bosses/abyss_hoop_lord.png']
  ];
  const pad2=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
  const copy=v=>{ try{return JSON.parse(JSON.stringify(v));}catch(e){return v;} };
  const p100=n=>Math.max(0,Math.min(100,Math.round((Number(n)||0)*100)));
  const resetCountdown=()=>{
    const now=new Date(), next=new Date(now);
    next.setHours(24,0,0,0);
    const t=Math.floor(Math.max(0,next-now)/1000);
    return pad2(t/3600)+':'+pad2((t%3600)/60)+':'+pad2(t%60);
  };
  const snapSave=row=>{
    const p=row&&row.profile_json;
    return p&&typeof p==='object'?(p.save&&typeof p.save==='object'?p.save:p):{};
  };
  const snapProfile=row=>{
    const p=row&&row.profile_json;
    return p&&typeof p==='object'&&p.profile&&typeof p.profile==='object'?p.profile:{};
  };
  const profileDay=(profile,key)=>{
    const out={shots:0,makes:0,swishes:0,banks:0,luckies:0};
    const hd=profile&&profile.heroDay;
    if(!hd||hd.key!==key||!hd.stats) return out;
    for(const id of Object.keys(hd.stats)){
      const d=hd.stats[id]||{};
      out.shots+=Math.max(0,Number(d.shots)||0);
      out.makes+=Math.max(0,Number(d.makes)||0);
      out.swishes+=Math.max(0,Number(d.swishes)||0);
      out.banks+=Math.max(0,Number(d.banks)||0);
      out.luckies+=Math.max(0,Number(d.luckies)||0);
    }
    out.makes=Math.min(out.makes,out.shots);
    return out;
  };

  const oldTotals=Game.prototype._playerDayTotals;
  Game.prototype._playerDayTotals=function(){
    const base=oldTotals?oldTotals.call(this):{key:this._dayKey?this._dayKey():'',shots:0,makes:0};
    const out={key:base.key,shots:base.shots||0,makes:base.makes||0,swishes:0,banks:0,luckies:0};
    const p=this._loadProfile&&this._loadProfile();
    if(!p||!p.heroDay||p.heroDay.key!==out.key) return out;
    const stats=p.heroDay.stats||{};
    for(const id of Object.keys(stats)){
      const d=stats[id]||{};
      out.swishes+=Math.max(0,Number(d.swishes)||0);
      out.banks+=Math.max(0,Number(d.banks)||0);
      out.luckies+=Math.max(0,Number(d.luckies)||0);
    }
    return out;
  };

  const oldRecord=Game.prototype._recordShot;
  Game.prototype._recordShot=function(id,made,type){
    const before=this._playerDayTotals?this._playerDayTotals():null;
    const ret=oldRecord?oldRecord.apply(this,arguments):undefined;
    if(!this.save||this.save.admin||!made) return ret;
    const after=this._playerDayTotals?this._playerDayTotals():null;
    if(!before||!after||after.shots===before.shots) return ret;
    const d=this._heroDay&&this._heroDay(id);
    if(d){
      if(type==='swish') d.swishes=(d.swishes||0)+1;
      else if(type==='bank') d.banks=(d.banks||0)+1;
      else if(type==='lucky') d.luckies=(d.luckies||0)+1;
    }
    if(type==='lucky'&&this._heroProg){
      const h=this._heroProg(id);
      h.luckies=(h.luckies||0)+1;
    }
    this._saveProfile&&this._saveProfile();
    this._syncLeaderboardStats&&this._syncLeaderboardStats(false);
    return ret;
  };

  const oldSubset=Game.prototype._progressSaveSubset;
  Game.prototype._progressSaveSubset=function(){
    const out=oldSubset?oldSubset.call(this):{};
    const s=this.save||{};
    for(const k of ['endlessBestScore','endlessBestBosses','endlessBestKills','endlessBestCombo']) out[k]=copy(s[k]);
    return out;
  };

  const oldApply=Game.prototype._applyCloudProgressSnapshot;
  Game.prototype._applyCloudProgressSnapshot=function(remote){
    let changed=oldApply?!!oldApply.call(this,remote):false;
    const rs=remote&&remote.save&&typeof remote.save==='object'?remote.save:null;
    if(rs&&this.save){
      for(const k of ['endlessBestScore','endlessBestBosses','endlessBestKills','endlessBestCombo']){
        if(rs[k]!=null){
          const nv=Math.max(Number(this.save[k])||0,Number(rs[k])||0);
          if(nv!==(Number(this.save[k])||0)){ this.save[k]=nv; changed=true; }
        }
      }
      if(changed) persist(this.save);
    }
    return changed;
  };

  Game.prototype._leaderboardLocalRow=function(){
    const t=this._playerDayTotals?this._playerDayTotals():{key:this._dayKey&&this._dayKey(),shots:0,makes:0};
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()||'本機玩家');
    return {player_name:name,today_key:t.key,today_shots:t.shots,today_makes:t.makes,today_swishes:t.swishes||0,today_banks:t.banks||0,today_luckies:t.luckies||0,profile_json:this._progressSnapshot?this._progressSnapshot():null,_local:true};
  };

  Game.prototype._normalLeaderboardRow=function(row){
    if(!row) return null;
    const name=String(row.player_name||row.name||'').trim();
    if(!name) return null;
    const day=profileDay(snapProfile(row),this._dayKey?this._dayKey():'');
    const shots=Math.max(0,Number(row.today_shots!=null?row.today_shots:row.shots)||day.shots||0);
    const makes=clamp(Number(row.today_makes!=null?row.today_makes:row.makes)||day.makes||0,0,shots);
    const swishes=Math.max(0,Number(row.today_swishes)||day.swishes||0);
    const banks=Math.max(0,Number(row.today_banks)||day.banks||0);
    const luckies=Math.max(0,Number(row.today_luckies)||day.luckies||0);
    return {name,shots,makes,swishes,banks,luckies,local:!!row._local,qualified:shots>=MIN_DAILY_SHOTS,acc:shots?makes/shots:0,score:this._fairAccScore?this._fairAccScore(makes,shots):(shots?makes/shots:0),updated:row.last_login_at||row.profile_updated_at||''};
  };

  Game.prototype._leaderboardRows=function(){
    const rows=[], add=row=>{
      const r=this._normalLeaderboardRow(row);
      if(!r) return;
      const key=r.name.toLowerCase();
      const i=rows.findIndex(x=>x.name.toLowerCase()===key);
      if(i<0) rows.push(r);
      else {
        const c=rows[i];
        if(r.local||r.shots>c.shots||(r.shots===c.shots&&r.makes>c.makes)) rows[i]=Object.assign(c,r,{local:c.local||r.local});
      }
    };
    for(const r of (Array.isArray(this._leaderboardCache)?this._leaderboardCache:[])) add(r);
    add(this._leaderboardLocalRow());
    rows.sort((a,b)=>a.qualified!==b.qualified?(a.qualified?-1:1):(b.score-a.score)||(b.makes-a.makes)||(b.swishes-a.swishes)||(b.luckies-a.luckies)||(b.shots-a.shots)||a.name.localeCompare(b.name,'zh-Hant'));
    let rank=1;
    for(const r of rows) r.rank=r.qualified?rank++:'觀察';
    return rows.slice(0,50);
  };

  Game.prototype._endlessLeaderboardRows=function(){
    const rows=[], add=row=>{
      if(!row) return;
      const name=String(row.player_name||row.name||'').trim();
      if(!name) return;
      const s=snapSave(row);
      const depth=Math.max(0,Number(row.endless_best)||Number(s.endlessBest)||0);
      if(depth<=0&&!row._local) return;
      const r={name,depth,score:Math.max(0,Number(row.endless_best_score)||Number(s.endlessBestScore)||Number(s.stats&&s.stats.bestScore)||0),bosses:Math.max(0,Number(row.endless_best_bosses)||Number(s.endlessBestBosses)||0),kills:Math.max(0,Number(s.endlessBestKills)||0),combo:Math.max(0,Number(s.endlessBestCombo)||Number(s.stats&&s.stats.bestCombo)||0),local:!!row._local,updated:row.last_login_at||row.profile_updated_at||''};
      const key=name.toLowerCase();
      const i=rows.findIndex(x=>x.name.toLowerCase()===key);
      if(i<0) rows.push(r);
      else {
        const c=rows[i];
        if(r.local||r.depth>c.depth||(r.depth===c.depth&&r.score>c.score)) rows[i]=Object.assign(c,r,{local:c.local||r.local});
      }
    };
    for(const r of (Array.isArray(this._leaderboardCache)?this._leaderboardCache:[])) add(r);
    const L=this.save&&this.save.login?this.save.login:{};
    add({player_name:String((L.name||'').trim()||'本機玩家'),_local:true,profile_json:this._progressSnapshot?this._progressSnapshot():{save:this.save||{}}});
    rows.sort((a,b)=>(b.depth-a.depth)||(b.score-a.score)||(b.bosses-a.bosses)||a.name.localeCompare(b.name,'zh-Hant'));
    let rank=1;
    for(const r of rows) r.rank=r.depth>0?rank++:'觀察';
    return rows.slice(0,50);
  };

  Game.prototype._openLeaderboard=function(mode){
    this._leaderboardMode=mode==='endless'?'endless':'daily';
    this._leaderboardOpen=true;
    this._leaderboardLoading=true;
    this._leaderboardStatus='載入雲端排行榜...';
    this._syncLeaderboardStats&&this._syncLeaderboardStats(true);
    this._fetchLeaderboard&&this._fetchLeaderboard();
    this.render&&this.render();
  };

  Game.prototype._syncLeaderboardNow=async function(){
    const L=this.save&&this.save.login?this.save.login:{};
    const name=String((L.name||'').trim()), code=String((L.code||'').trim());
    if(!name||!this._writeCloudAccount) return false;
    const t=this._playerDayTotals?this._playerDayTotals():{key:this._dayKey&&this._dayKey(),shots:0,makes:0};
    const snap=this._progressSnapshot?this._progressSnapshot():null;
    await this._writeCloudAccount(name,code,{today_key:t.key,today_shots:t.shots,today_makes:t.makes,profile_json:snap,profile_updated_at:snap&&snap.updatedAt});
    return true;
  };

  Game.prototype._fetchLeaderboard=async function(){
    const cfg=this._supabaseCfg?this._supabaseCfg():{};
    if(!cfg.url||!cfg.key){ this._leaderboardLoading=false; this._leaderboardStatus='目前顯示本機成績'; this.render&&this.render(); return; }
    const base=cfg.url.replace(/\/+$/,'')+'/rest/v1/'+encodeURIComponent(cfg.table||'player_accounts');
    const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key};
    try{
      const q='?select='+encodeURIComponent('player_name,today_key,today_shots,today_makes,last_login_at,profile_json,profile_updated_at')+'&order=last_login_at.desc&limit=150';
      const res=await fetch(base+q,{headers});
      if(!res.ok) throw new Error(await res.text());
      this._leaderboardCache=await res.json();
      this._leaderboardStatus=(this._leaderboardCache&&this._leaderboardCache.length)?'雲端排行榜已更新':'目前沒有雲端成績';
    }catch(e){
      try{
        const q='?select=player_name,today_key,today_shots,today_makes,last_login_at&today_key=eq.'+encodeURIComponent(this._dayKey&&this._dayKey())+'&order=today_shots.desc&limit=100';
        const res=await fetch(base+q,{headers});
        if(!res.ok) throw new Error(await res.text());
        this._leaderboardCache=await res.json();
        this._leaderboardStatus='雲端排行榜已更新（基本欄位）';
      }catch(e2){
        this._leaderboardCache=[];
        this._leaderboardStatus='雲端排行榜讀取失敗，先顯示本機成績';
        try{ console.warn('[HB leaderboard]',e,e2); }catch(_e){}
      }
    }finally{
      this._leaderboardLoading=false;
      this.render&&this.render();
    }
  };

  Game.prototype._hbLeaderTab=function(x,y,w,h,label,active,cb){
    const ctx=this.ctx;
    this.rr(x,y,w,h,12);
    const g=ctx.createLinearGradient(0,y,0,y+h);
    if(active){ g.addColorStop(0,'#d8ff44'); g.addColorStop(1,'#6b9d16'); }
    else { g.addColorStop(0,'rgba(39,28,18,0.96)'); g.addColorStop(1,'rgba(10,7,8,0.98)'); }
    ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=2.2; ctx.strokeStyle=active?'#ffe7a6':'rgba(215,169,69,0.44)';
    this.rr(x,y,w,h,12); ctx.stroke();
    this.text(label,x+w/2,y+h/2,24,active?'#111706':'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
    this.btn(x,y,w,h,'lb_tab_'+label,cb);
  };

  Game.prototype.drawLeaderboardModal=function(){
    const ctx=this.ctx, IL=this.insL||0, IR=this.insR||0, IT=this.insT||0, IB=this.insB||0;
    const mode=this._leaderboardMode==='endless'?'endless':'daily';
    ctx.save(); ctx.fillStyle='rgba(3,1,7,0.94)'; ctx.fillRect(-4000,-4000,BW+8000,BH+8000); ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'leaderboard_scrim',()=>{});
    const x=IL+32,y=IT+20,w=BW-IL-IR-64,h=BH-IT-IB-42;
    this.rr(x,y,w,h,22);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(24,16,11,0.98)'); bg.addColorStop(0.5,'rgba(9,7,10,0.99)'); bg.addColorStop(1,'rgba(5,4,8,0.99)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22); ctx.stroke();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(185,255,47,0.34)'; this.rr(x+12,y+12,w-24,h-24,16); ctx.stroke();
    this.text(mode==='endless'?'無盡深淵排行榜':'今日命中排行榜',x+w/2,y+52,44,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:14});
    this.text(mode==='endless'?'依最高層數排序；同層比最佳分數，再比 Boss 擊破數':'每日重置倒數 '+resetCountdown()+' · 空心與幸運球會列入今日命中分項',x+w/2,y+91,22,mode==='endless'?'#c8b894':'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    this._hbLeaderTab(x+44,y+28,150,52,'今日命中',mode==='daily',()=>{this._leaderboardMode='daily';this.render();});
    this._hbLeaderTab(x+206,y+28,150,52,'無盡深淵',mode==='endless',()=>{this._leaderboardMode='endless';this.render();});
    this._hbDrawLeaderButton(x+w-158,y+28,116,52,'關閉','leaderboard_close',()=>this._closeLeaderboard(),false);
    this._hbDrawLeaderButton(x+w-292,y+28,116,52,'刷新','leaderboard_refresh',()=>{ this._leaderboardLoading=true; this._leaderboardStatus='重新整理...'; this._fetchLeaderboard&&this._fetchLeaderboard(); this.render(); },true);
    const tx=x+44,ty=y+134,tw=w-88,headerH=54,rowH=Math.max(72,Math.min(84,Math.floor((h-246)/7)));
    this.rr(tx,ty,tw,headerH,12); ctx.fillStyle='rgba(215,169,69,0.13)'; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(215,169,69,0.38)'; this.rr(tx,ty,tw,headerH,12); ctx.stroke();
    if(mode==='endless'){
      const cols={rank:tx+72,name:tx+190,depth:tx+tw*0.56,score:tx+tw*0.72,boss:tx+tw*0.86,kills:tx+tw-70};
      [['名次',cols.rank,1],['投手',cols.name,0],['最高層',cols.depth,1],['分數',cols.score,1],['Boss',cols.boss,1],['擊殺',cols.kills,1]].forEach(c=>this.text(c[0],c[1],ty+headerH/2,c[0]==='投手'?24:25,'#d7a945',c[2]?{align:'center',baseline:'middle',weight:'900'}:{baseline:'middle',weight:'900'}));
      const rows=this._endlessLeaderboardRows?this._endlessLeaderboardRows():[], maxRows=Math.max(4,Math.floor((y+h-ty-headerH-72)/rowH));
      for(let i=0;i<Math.min(rows.length,maxRows);i++){
        const r=rows[i], ry=ty+headerH+10+i*rowH, mid=ry+(rowH-8)/2;
        this.rr(tx,ry,tw,rowH-8,12); ctx.fillStyle=r.local?'rgba(159,224,36,0.18)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.16)'); ctx.fill();
        ctx.lineWidth=r.local?2.2:1.2; ctx.strokeStyle=r.local?'rgba(185,255,47,0.58)':'rgba(215,169,69,0.20)'; this.rr(tx,ry,tw,rowH-8,12); ctx.stroke();
        const bx=tx+18,by=ry+10,bw=110,bh=rowH-28; this.rr(bx,by,bw,bh,14); ctx.fillStyle='rgba(215,169,69,0.16)'; ctx.fill(); ctx.lineWidth=1.8; ctx.strokeStyle='rgba(255,231,166,0.48)'; this.rr(bx,by,bw,bh,14); ctx.stroke();
        this.text(String(r.rank||'觀察'),bx+bw/2,mid,30,'#ffe7a6',{align:'center',baseline:'middle',weight:'900'});
        const name=(r.local?'你 · ':'')+String(r.name||'未命名投手');
        this.text(this._clip?this._clip(name,cols.depth-cols.name-36,28,'900'):name,cols.name,mid-10,28,r.local?'#d8ff44':'#efe3ca',{baseline:'middle',weight:'900'});
        this.text(r.depth>=25?'深層循環':'第 '+(r.depth||0)+' 層',cols.name,mid+21,16,r.depth>=25?'#c89bff':'#9e9178',{baseline:'middle',weight:'800'});
        this.text(String(r.depth||0),cols.depth,mid,32,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(r.score||0),cols.score,mid,27,'#ece0c4',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(r.bosses||0),cols.boss,mid,27,'#e6c068',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(r.kills||0),cols.kills,mid,27,'#b8ad96',{align:'center',baseline:'middle',weight:'900'});
      }
      if(!rows.length) this.text('還沒有無盡紀錄',x+w/2,y+h/2+18,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }else{
      const cols={rank:tx+72,name:tx+194,shot:tx+tw*0.56,special:tx+tw*0.72,acc:tx+tw*0.86,score:tx+tw-70};
      [['名次',cols.rank],['出手 / 命中',cols.shot],['空心 / 幸運',cols.special],['命中率',cols.acc],['穩定',cols.score]].forEach(c=>this.text(c[0],c[1],ty+headerH/2,23,'#d7a945',{align:'center',baseline:'middle',weight:'900'}));
      this.text('投手',cols.name,ty+headerH/2,24,'#d7a945',{baseline:'middle',weight:'900'});
      const rows=this._leaderboardRows?this._leaderboardRows():[], maxRows=Math.max(4,Math.floor((y+h-ty-headerH-72)/rowH));
      for(let i=0;i<Math.min(rows.length,maxRows);i++){
        const r=rows[i], ry=ty+headerH+10+i*rowH, mid=ry+(rowH-8)/2, shots=Math.max(0,Number(r.shots)||0), makes=Math.max(0,Number(r.makes)||0), q=!!r.qualified, need=Math.max(0,MIN_DAILY_SHOTS-shots);
        this.rr(tx,ry,tw,rowH-8,12); ctx.fillStyle=r.local?'rgba(159,224,36,0.18)':(i%2?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.16)'); ctx.fill();
        ctx.lineWidth=r.local?2.2:1.2; ctx.strokeStyle=r.local?'rgba(185,255,47,0.58)':'rgba(215,169,69,0.20)'; this.rr(tx,ry,tw,rowH-8,12); ctx.stroke();
        const bx=tx+18,by=ry+10,bw=110,bh=rowH-28; this.rr(bx,by,bw,bh,14); ctx.fillStyle=q?'rgba(215,169,69,0.16)':'rgba(159,224,36,0.15)'; ctx.fill(); ctx.lineWidth=1.8; ctx.strokeStyle=q?'rgba(255,231,166,0.48)':'rgba(159,224,36,0.58)'; this.rr(bx,by,bw,bh,14); ctx.stroke();
        this.text(q?String(r.rank):'觀察',bx+bw/2,mid-(q?0:9),q?30:24,q?'#ffe7a6':'#9fe024',{align:'center',baseline:'middle',weight:'900'});
        if(!q) this.text('差 '+need+' 球',bx+bw/2,mid+18,15,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
        const name=(r.local?'你 · ':'')+String(r.name||'未命名投手');
        this.text(this._clip?this._clip(name,cols.shot-cols.name-36,28,'900'):name,cols.name,mid-10,28,r.local?'#d8ff44':'#efe3ca',{baseline:'middle',weight:'900'});
        this.text(q?'已入榜 · 樣本 '+shots+' 球':'未滿 '+MIN_DAILY_SHOTS+' 球先觀察',cols.name,mid+21,16,q?'#a99a7a':'#9fe024',{baseline:'middle',weight:'800'});
        this.text(shots+' / '+makes,cols.shot,mid-5,27,'#efe3ca',{align:'center',baseline:'middle',weight:'900'});
        this.text('出手 / 命中',cols.shot,mid+22,15,'#8f8068',{align:'center',baseline:'middle',weight:'800'});
        this.text((r.swishes||0)+' / '+(r.luckies||0),cols.special,mid-5,27,'#ffe7a6',{align:'center',baseline:'middle',weight:'900'});
        this.text('空心 / 幸運',cols.special,mid+22,15,'#8f8068',{align:'center',baseline:'middle',weight:'800'});
        this.text(shots?Math.round((r.acc||0)*100)+'%':'0%',cols.acc,mid,29,q?'#ece0c4':'#b6aa90',{align:'center',baseline:'middle',weight:'900'});
        this.text(String(p100(r.score!=null?r.score:r.acc)),cols.score,mid,28,q?'#ffe7a6':'#9e9178',{align:'center',baseline:'middle',weight:'900'});
      }
      if(!rows.length) this.text('今天還沒有命中紀錄',x+w/2,y+h/2+18,36,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }
    this.text(this._leaderboardLoading?'載入中...':(this._leaderboardStatus||''),x+w/2,y+h-34,21,'#9e9178',{align:'center',baseline:'middle',weight:'800'});
  };

  Game.prototype._drawFbStatCards=function(LO){
    const U=LO.U, s=this.save||{}, t=this._playerDayTotals?this._playerDayTotals():{shots:0,makes:0,swishes:0,luckies:0};
    const acc=t.shots?Math.round(t.makes/t.shots*100):0;
    this._gothCard(LO.statL,U); this._statIcon('target',LO.statL.x+18*U,LO.statL.y+LO.statL.h*0.62,7*U);
    this.text('今日命中',LO.statL.x+14*U,LO.statL.y+16*U,11*U,'#a2926e');
    this.text(acc+'%',LO.statL.x+32*U,LO.statL.y+LO.statL.h*0.56,22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this.text((t.shots||0)+' / '+(t.makes||0),LO.statL.x+LO.statL.w-16*U,LO.statL.y+LO.statL.h*0.54,10*U,'#9fe024',{align:'right',baseline:'middle',weight:'800'});
    this.text('空 '+(t.swishes||0)+'  幸 '+(t.luckies||0),LO.statL.x+LO.statL.w-16*U,LO.statL.y+LO.statL.h*0.75,9*U,'#c8b894',{align:'right',baseline:'middle',weight:'800'});
    this.text('排行榜 ›',LO.statL.x+LO.statL.w-14*U,LO.statL.y+18*U,9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
    this.btn(LO.statL.x,LO.statL.y,LO.statL.w,Math.max(44*U,LO.statL.h),'fb_leaderboard_daily',()=>this._openLeaderboard&&this._openLeaderboard('daily'));
    this._gothCard(LO.statR,U); this._statIcon('crown',LO.statR.x+18*U,LO.statR.y+LO.statR.h*0.62,7*U);
    this.text('無盡最佳',LO.statR.x+14*U,LO.statR.y+16*U,11*U,'#a2926e');
    this.text(String(s.endlessBest|0),LO.statR.x+32*U,LO.statR.y+LO.statR.h*0.56,22*U,'#ece0c4',{baseline:'middle',weight:'800'});
    this.text('Boss '+(s.endlessBestBosses|0),LO.statR.x+LO.statR.w-16*U,LO.statR.y+LO.statR.h*0.54,10*U,'#e6c068',{align:'right',baseline:'middle',weight:'800'});
    this.text('排行榜 ›',LO.statR.x+LO.statR.w-14*U,LO.statR.y+18*U,9*U,'#d7a945',{align:'right',baseline:'middle',weight:'900'});
    this.btn(LO.statR.x,LO.statR.y,LO.statR.w,Math.max(44*U,LO.statR.h),'fb_leaderboard_endless',()=>this._openLeaderboard&&this._openLeaderboard('endless'));
  };

  const oldSpawn=Game.prototype.spawnGuard;
  Game.prototype.spawnGuard=function(type){
    const g=oldSpawn.apply(this,arguments), run=this.run;
    if(!g||!run||!run.endless||g.sandbag) return g;
    const biome=run.endlessBiome||((this._endlessBiome&&this._endlessBiome(run.endlessDepth||1).id)||'rift');
    const id=(EM[biome]&&EM[biome][type])||(EM.rift[type])||'crack_runner', info=E[id]||E.crack_runner;
    g.endlessEnemyId=id; g.endlessName=info.n; g.endlessSprite=info.s; g.endlessColor=info.c; g.drawScale=(g.drawScale||1)*(info.z||1);
    const depth=Math.max(1,Number(run.endlessDepth)||1), greed=Number(run.endlessGreedStacks)||0;
    if(greed>0){ const mul=1+Math.min(0.45,greed*0.08); g.maxhp=Math.ceil((g.maxhp||g.hp||1)*mul); g.hp=Math.ceil((g.hp||g.maxhp)*mul); }
    if(id==='screen_idol') g.shieldUp=true;
    if(id==='iron_whistle') g.endlessMissTax=true;
    if(id==='cold_rim_guard') g.endlessFreezeHoop=true;
    if(id==='shattered_board_collector') g.endlessDebt=true;
    if(!g.endlessAffix&&Math.random()<Math.min(0.56,0.12+Math.max(0,depth-4)*0.018+(g.elite?0.22:0))){
      const a=AF[Math.floor(Math.random()*AF.length)];
      g.endlessAffix=a[0]; g.endlessAffixName=a[1]; g.endlessAffixShort=a[2]; g.endlessAffixColor=a[3];
      if(a[0]==='crown'){ g.elite=true; g.maxhp=Math.ceil((g.maxhp||g.hp||1)*1.65); g.hp=Math.ceil((g.hp||g.maxhp)*1.65); g.r=(g.r||24)*1.08; }
      else if(a[0]==='mirror') g.endlessMirror=1;
      else if(a[0]==='countdown') g.endlessCountdown=Math.max(7,15-Math.floor(depth/5));
      else if(a[0]==='lockrim') g.endlessLocksHoop=true;
      else if(a[0]==='greed') g.endlessGreed=true;
    }
    return g;
  };

  const oldEndlessGuard=Game.prototype.drawEndlessGuard;
  Game.prototype.drawEndlessGuard=function(g){
    const run=this.run;
    if(run&&run.stage&&run.stage.boss) return;
    const info=E[(g&&g.endlessEnemyId)||'crack_runner']||E.crack_runner;
    const im=this._endlessImg?this._endlessImg('enemy_'+((g&&g.endlessEnemyId)||'crack_runner'),info.s):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return oldEndlessGuard?oldEndlessGuard.call(this,g):undefined;
    const ctx=this.ctx, base=g.r||28, bob=Math.sin((this.t||0)*2.4+(g.slot||0))*4, scale=(g.drawScale||1)*(g.elite?1.08:1);
    let H=base*3.15*scale, W=H*im.naturalWidth/im.naturalHeight;
    const maxW=base*4.25*scale;
    if(W>maxW){ W=maxW; H=W*im.naturalHeight/im.naturalWidth; }
    const x=-W/2, y=bob+base*1.04-H;
    ctx.save(); ctx.translate(g.x,g.y); ctx.globalAlpha=g.phased?0.48:1; this.shadow(0,base*0.92,base*1.1,0.25);
    const glow=ctx.createRadialGradient(0,bob-base*0.45,4,0,bob-base*0.45,base*2.6);
    glow.addColorStop(0,g.endlessAffix?'rgba(255,225,77,0.22)':'rgba(155,255,50,0.18)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,bob-base*0.4,base*2.35,0,TAU); ctx.fill();
    const rimCol=g.endlessAffixColor||g.endlessColor||info.c||'#9fe024';
    ctx.save();
    ctx.globalAlpha=g.phased?0.28:0.52;
    ctx.filter='brightness(0) opacity(0.95)';
    const outline=Math.max(2.5,base*0.12);
    ctx.drawImage(im,x-outline,y,W,H);
    ctx.drawImage(im,x+outline,y,W,H);
    ctx.drawImage(im,x,y-outline,W,H);
    ctx.drawImage(im,x,y+outline,W,H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha=g.phased?0.32:0.82;
    ctx.shadowColor=rimCol;
    ctx.shadowBlur=base*(g.elite?0.95:0.72);
    ctx.drawImage(im,x,y,W,H);
    ctx.shadowColor='rgba(255,238,166,0.72)';
    ctx.shadowBlur=base*0.28;
    ctx.drawImage(im,x,y,W,H);
    ctx.restore();
    ctx.drawImage(im,x,y,W,H);
    if(g.flash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.62,g.flash*0.7); ctx.drawImage(im,x,y,W,H); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; }
    if(g.shieldUp){ ctx.lineWidth=4; ctx.strokeStyle='rgba(215,169,69,0.88)'; ctx.beginPath(); ctx.ellipse(0,bob-base*0.45,W*0.48,H*0.45,0,0,TAU); ctx.stroke(); }
    if(g.endlessAffix){
      const col=g.endlessAffixColor||'#ffe14d';
      ctx.save(); ctx.translate(0,y-18); this.rr(-24,-16,48,32,10); ctx.fillStyle='rgba(9,6,5,0.88)'; ctx.fill(); ctx.lineWidth=2.4; ctx.strokeStyle=col; ctx.stroke(); this.text(g.endlessAffixShort||'菁',0,2,20,col,{align:'center',baseline:'middle',weight:'900',glow:8}); ctx.restore();
      if(g.endlessCountdown>0) this.text(Math.ceil(g.endlessCountdown),0,y+22,18,'#ff6a4a',{align:'center',baseline:'middle',weight:'900'});
    }
    ctx.restore(); this.drawGuardTags&&this.drawGuardTags(g);
  };

  Game.prototype._endlessBossSprite=function(depth){
    depth=Math.max(1,Number(depth)||1);
    const b=BS.find(x=>depth<=x[0])||BS[BS.length-1];
    return {key:b[1],src:b[2]};
  };

  Game.prototype.drawEndlessBossArt=function(){
    const ctx=this.ctx, run=this.run, boss=this._endlessBossSprite(run&&run.endlessDepth), im=this._endlessImg?this._endlessImg('boss_'+boss.key,boss.src):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const nw=im.naturalWidth,nh=im.naturalHeight; let H=BH*0.72,W=H*nw/nh; if(W>BW*0.62){ W=BW*0.62; H=W*nh/nw; }
    const cx=BW*0.67,by=BH-18; ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,30,cx,by-H*0.48,W*0.66); glow.addColorStop(0,'rgba(160,255,48,0.22)'); glow.addColorStop(0.58,'rgba(100,255,36,0.08)'); glow.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=glow; ctx.beginPath(); ctx.ellipse(cx,by-H*0.45,W*0.6,H*0.52,0,0,TAU); ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.42); sh.addColorStop(0,'rgba(0,0,0,0.58)'); sh.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(cx,by-8,W*0.42,H*0.08,0,0,TAU); ctx.fill();
    let lp=0; if(run&&run._mobLunge>0){ const tt=1-run._mobLunge/0.34; lp=Math.sin(clamp(tt,0,1)*Math.PI); } if(lp>0){ ctx.translate(cx,by); ctx.scale(1+lp*0.05,1+lp*0.05); ctx.translate(-cx-lp*54,-by); }
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run&&run._mobHitFlash>0){ ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.min(0.45,run._mobHitFlash*0.65); ctx.drawImage(im,cx-W/2,by-H,W,H); }
    ctx.restore();
  };

  const oldHurt=Game.prototype.hurtGuard;
  Game.prototype.hurtGuard=function(g,dmg,c,primary){
    const run=this.run;
    if(run&&run.endless&&g&&!g.dead){
      if(g.endlessMirror>0){ g.endlessMirror=0; g.flash=1; this.floater(g.x,g.y-(g.r||24)-24,'鏡框反彈','#8fe8ff',22,{crit:true}); this.shockFx&&this.shockFx(g.x,g.y,'#8fe8ff',220,0.34); this.audio&&this.audio.sfx&&this.audio.sfx('rim'); return; }
      if(g.endlessFreezeHoop&&run.hoop){ run.endlessHoopFreeze=Math.max(run.endlessHoopFreeze||0,1.05); this.floater(run.hoop.x,run.hoop.y-96,'寒框鎖定','#6fd8ff',20); }
      if(g.endlessLocksHoop&&run.hoop) run.endlessHoopLock=Math.max(run.endlessHoopLock||0,1.25);
    }
    return oldHurt.apply(this,arguments);
  };

  const oldKill=Game.prototype.killGuard;
  Game.prototype.killGuard=function(g){
    const run=this.run, dead=!!(g&&g.dead), r=oldKill.apply(this,arguments);
    if(run&&run.endless&&g&&!dead&&g.dead&&!g.sandbag){
      if(g.endlessAffix==='crown'&&!run.stage.boss) this._endlessAddProgress&&this._endlessAddProgress(12);
      if(g.endlessGreed){ run.endlessGreedStacks=(run.endlessGreedStacks||0)+1; if(!run.stage.boss) this._endlessAddProgress&&this._endlessAddProgress(8); this.floater(g.x,g.y-(g.r||24)-26,'貪分 +難度','#c89bff',22,{crit:true}); }
      if(g.endlessDebt){ run.endlessDebtShots=Math.max(run.endlessDebtShots||0,1); this.floater(g.x,g.y-(g.r||24)-26,'碎板債','#ffb34d',22); }
    }
    return r;
  };

  const oldEndShot=Game.prototype.endShot;
  Game.prototype.endShot=function(scored){
    const run=this.run, missTax=run&&run.endless&&!scored&&run.guards&&run.guards.some(g=>!g.dead&&g.endlessMissTax), debt=run&&run.endless&&!scored&&run.endlessDebtShots>0;
    const r=oldEndShot.apply(this,arguments);
    if(run&&run.endless&&!scored){
      if(missTax){ this.playerHurt&&this.playerHurt(4+Math.floor((run.endlessDepth||1)/5)); this.floater(BW/2,BH*0.30,'鐵哨加罰','#ffe14d',26,{crit:true}); }
      if(debt){ run.endlessDebtShots=Math.max(0,(run.endlessDebtShots||0)-1); this.playerHurt&&this.playerHurt(5+Math.floor((run.endlessDepth||1)/4)); this.floater(BW/2,BH*0.36,'碎板債討回','#ff6a4a',26,{crit:true}); }
    }
    return r;
  };

  const oldPick=Game.prototype.pickHoopPos;
  Game.prototype.pickHoopPos=function(force){
    const run=this.run;
    if(run&&run.endless&&run.hoop&&(run.endlessHoopLock>0||run.endlessHoopFreeze>0)){ run.repos=0; if(run.host){ run.host.tx=run.host.x; run.host.ty=run.host.y; } run.hoop.tx=run.hoop.x; run.hoop.ty=run.hoop.y; return; }
    return oldPick.apply(this,arguments);
  };

  const oldUpdate=Game.prototype.updateBattle;
  Game.prototype.updateBattle=function(dt){
    const r=oldUpdate.apply(this,arguments), run=this.run;
    if(run&&run.endless&&!run.modal){
      if(run.endlessHoopLock>0) run.endlessHoopLock=Math.max(0,run.endlessHoopLock-dt);
      if(run.endlessHoopFreeze>0) run.endlessHoopFreeze=Math.max(0,run.endlessHoopFreeze-dt);
      for(const g of (run.guards||[])){
        if(!g||g.dead||!(g.endlessCountdown>0)) continue;
        g.endlessCountdown-=dt;
        if(g.endlessCountdown<=0&&!g._endlessCountdownFired){
          g._endlessCountdownFired=true;
          if(run.stage&&run.stage.boss) run.endlessBossTime=Math.max(0,(run.endlessBossTime||0)-8);
          else run.endlessProgress=Math.max(0,(run.endlessProgress||0)-10);
          this.floater(g.x,g.y-(g.r||24)-26,'倒數懲罰','#ff6a4a',22,{crit:true});
          this.audio&&this.audio.sfx&&this.audio.sfx('hurt');
        }
      }
      if(run.stage&&run.stage.boss&&run.guards&&run.guards.some(g=>!g.dead&&g.endlessEnemyId==='war_drum_leader')) run.endlessBossTime=Math.max(0,(run.endlessBossTime||0)-dt*0.18);
    }
    return r;
  };

  Game.prototype._recordEndlessCheckpoint=function(run){
    if(!run||!run.endless||!this.save||this.save.admin) return;
    const depth=Math.max(1,Number(run.endlessDepth)||1), bosses=Math.max(Number(this.save.endlessBestBosses)||0,Number(run.endlessBosses||0)+(run.stage&&run.stage.boss?1:0));
    this.save.endless=true; this.save.endlessBest=Math.max(Number(this.save.endlessBest)||0,depth); this.save.endlessBestScore=Math.max(Number(this.save.endlessBestScore)||0,Number(run.score)||0); this.save.endlessBestKills=Math.max(Number(this.save.endlessBestKills)||0,Number(run.kills)||0); this.save.endlessBestCombo=Math.max(Number(this.save.endlessBestCombo)||0,Number(run.bestCombo)||0); this.save.endlessBestBosses=bosses;
    persist(this.save); this._scheduleCloudProgressSync&&this._scheduleCloudProgressSync(false);
  };

  const oldAdvance=Game.prototype._endlessAdvanceDepth;
  Game.prototype._endlessAdvanceDepth=function(){ if(this.run&&this.run.endless) this._recordEndlessCheckpoint(this.run); return oldAdvance.apply(this,arguments); };
  const oldFinishEndless=Game.prototype.finishEndlessRun;
  Game.prototype.finishEndlessRun=function(won){ if(this.run&&this.run.endless) this._recordEndlessCheckpoint(this.run); return oldFinishEndless.apply(this,arguments); };
})();

// === final activation v15: endless gear milestone rewards ===
(function(){
  if(typeof Game==='undefined') return;
  const MAX_FORGED_AFFIXES=5;
  const affixPool=()=> (typeof RELIC_AFFIXES!=='undefined'&&Array.isArray(RELIC_AFFIXES))?RELIC_AFFIXES:[];
  const affixText=a=>'◆ '+(a.forged?'鑄造·':'')+String(a.label||a.key).replace(/^鑄造·/,'')+' +'+(a.pct?Math.round((a.val||0)*100)+'%':Math.round(a.val||0));
  const affixInc=a=> a.pct?0.02:(a.key==='maxhp'?3:2);
  const roundAffix=(a,v)=> a.pct?Math.round(v*100)/100:Math.round(v);

  const prevRelicDisplay=Game.prototype._relicDisplay;
  Game.prototype._relicDisplay=function(rid,owned){
    const it=prevRelicDisplay?prevRelicDisplay.call(this,rid,owned):null;
    if(it&&owned&&this._relicMeta){
      const meta=this._relicMeta(rid);
      it.lvl=Math.max(0,Number(meta&&meta.lvl)||0);
      it.forgeCount=Math.max(0,Number(meta&&meta.forgeCount)||0);
      if(Array.isArray(it.affixes)) it.affixes=it.affixes.map(a=>a&&a.forged?Object.assign({},a,{label:'鑄造·'+a.label}):a);
    }
    return it;
  };

  const prevRelicSummary=Game.prototype._hbRelicSummary;
  Game.prototype._hbRelicSummary=function(it){
    const base=prevRelicSummary?prevRelicSummary.call(this,it):((it&&it.core)||'聖物');
    return it&&it.lvl?base+' · Lv '+it.lvl:base;
  };

  Game.prototype._hbEndlessEquippedRelics=function(){
    const load=(this.save&&this.save.loadout)||[];
    const seen={}, out=[];
    for(const id of load){ if(id&&RELICS[id]&&!seen[id]){ seen[id]=1; out.push(id); } }
    return out;
  };

  Game.prototype._hbApplyRelicAffixDelta=function(run,a,delta){
    if(!run||!run.mods||!a||!delta) return;
    if(a.key==='maxhp'){ run.maxhp+=delta; run.hp=Math.min(run.maxhp,(run.hp||0)+delta); }
    else if(a.key==='startShield') run.shield=(run.shield||0)+delta;
    else if(a.key==='goldMul') run.mods.bonusGoldMul=(run.mods.bonusGoldMul||0)+delta;
    else if(a.key==='damageReduce') run.mods.damageReduce=Math.min(0.6,(run.mods.damageReduce||0)+delta);
    else if(run.mods[a.key]!=null) run.mods[a.key]+=delta;
  };

  Game.prototype._hbUpgradeEquippedRelic=function(rid){
    const meta=this._relicMeta(rid);
    if(!meta.affixes) meta.affixes=[];
    meta.lvl=Math.max(0,Number(meta.lvl)||0)+1;
    meta.q=Math.min(50,Math.max(1,Number(meta.q)||5)+2);
    meta.tier=(typeof _qualTier==='function')?_qualTier(meta.q):(meta.tier||0);
    const deltas=[];
    for(const a of meta.affixes){
      const old=Number(a.val)||0, inc=affixInc(a);
      a.val=roundAffix(a,old+inc);
      deltas.push(Object.assign({},a,{val:a.val-old,label:String(a.label||'').replace(/^鑄造·/,'')}));
    }
    this._saveProfile&&this._saveProfile();
    const run=this.run;
    for(const d of deltas) this._hbApplyRelicAffixDelta(run,d,d.val);
    return {lvl:meta.lvl,deltas};
  };

  Game.prototype._hbForgeRelicAffix=function(rid,depth){
    const meta=this._relicMeta(rid);
    if(!meta.affixes) meta.affixes=[];
    const used=new Set(meta.affixes.map(a=>a&&a.key).filter(Boolean));
    const pool=affixPool().filter(a=>a&&!used.has(a.key));
    let made=null;
    if(pool.length&&meta.affixes.length<MAX_FORGED_AFFIXES){
      const src=pool[Math.floor(Math.random()*pool.length)];
      const power=clamp(0.58+Math.random()*0.28+Math.max(0,(depth||31)-30)*0.012,0,1.15);
      const val=roundAffix(src,src.min+(src.max-src.min)*power);
      made={key:src.key,label:src.label,pct:src.pct,val,forged:true};
      meta.affixes.push(made);
      meta.forgeCount=Math.max(0,Number(meta.forgeCount)||0)+1;
      this._hbApplyRelicAffixDelta(this.run,made,made.val);
    }else if(meta.affixes.length){
      const a=meta.affixes[Math.floor(Math.random()*meta.affixes.length)];
      const old=Number(a.val)||0, inc=affixInc(a)*1.5;
      a.val=roundAffix(a,old+inc);
      made=Object.assign({},a,{label:'鍛升·'+(a.label||a.key),val:a.val-old,forged:true});
      this._hbApplyRelicAffixDelta(this.run,made,made.val);
    }
    this._saveProfile&&this._saveProfile();
    return made;
  };

  const prevAdvanceDepth=Game.prototype._endlessAdvanceDepth;
  Game.prototype._endlessAdvanceDepth=function(){
    const run=this.run;
    if(run&&run.endless&&!run.modal){
      const depth=Math.max(1,Number(run.endlessDepth)||1);
      run._endlessGearRewards=run._endlessGearRewards||{};
      if(depth%5===0&&!run._endlessGearRewards[depth]){
        const choices=this._hbEndlessEquippedRelics();
        if(choices.length){
          run.modal={kind:'endlessGearReward',depth,choices,forge:depth>30};
          run.banner={text:'深淵鍛造',sub:'第 '+depth+' 層 · 選擇一件已裝備聖物升級',t:1.8};
          this.audio&&this.audio.sfx&&this.audio.sfx('levelup');
          this.render&&this.render();
          return;
        }
        run._endlessGearRewards[depth]=true;
      }
    }
    return prevAdvanceDepth.apply(this,arguments);
  };

  Game.prototype._hbChooseEndlessGearReward=function(rid){
    const run=this.run, m=run&&run.modal;
    if(!run||!m||m.kind!=='endlessGearReward'||!m.choices.includes(rid)) return;
    run._endlessGearRewards=run._endlessGearRewards||{};
    run._endlessGearRewards[m.depth]=true;
    const up=this._hbUpgradeEquippedRelic(rid);
    const forge=m.forge?this._hbForgeRelicAffix(rid,m.depth):null;
    const item=this._hbRelicDisplay?this._hbRelicDisplay(rid):this._relicDisplay(rid,true);
    const name=item?item.name:'聖物';
    if(run.rewardLog) run.rewardLog.push('深淵鍛造：'+name+' Lv '+up.lvl+(forge?(' · '+(forge.label||'鑄造詞綴')):''));
    run.modal=null;
    this.toast&&this.toast('深淵鍛造完成',name+' Lv '+up.lvl+(forge?(' · '+(forge.label||'鑄造詞綴')):''));
    this.floater&&this.floater(BW/2,BH*0.30,'裝備升級','#d8ff44',38,{crit:true,t:1.2});
    this.audio&&this.audio.sfx&&this.audio.sfx('levelup');
    return prevAdvanceDepth.call(this);
  };

  const prevDrawModal=Game.prototype.drawModal;
  Game.prototype.drawModal=function(){
    const run=this.run, m=run&&run.modal;
    if(!m||m.kind!=='endlessGearReward') return prevDrawModal.apply(this,arguments);
    const ctx=this.ctx;
    ctx.save(); ctx.fillStyle='rgba(2,1,5,0.84)'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    this.btn(0,0,BW,BH,'endless_gear_scrim',()=>{});
    this.text('深淵鍛造',BW/2,118,58,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:16});
    this.text('第 '+m.depth+' 層獎勵 · 選擇身上一件裝備升級 1 等'+(m.forge?' · 追加隨機鑄造詞綴':''),BW/2,168,25,m.forge?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    const items=m.choices.map(id=>this._hbRelicDisplay?this._hbRelicDisplay(id):this._relicDisplay(id,true)).filter(Boolean);
    const n=items.length, cw=Math.min(320,(BW-220-(n-1)*24)/Math.max(1,n)), ch=500, gap=24, total=n*cw+(n-1)*gap, x0=BW/2-total/2, y=230;
    for(let i=0;i<n;i++){
      const it=items[i], x=x0+i*(cw+gap), col=(typeof QUAL_COL!=='undefined'?QUAL_COL[it.tier]:'#e6c068')||'#e6c068';
      this.rr(x,y,cw,ch,18); const bg=ctx.createLinearGradient(0,y,0,y+ch); bg.addColorStop(0,'rgba(30,23,18,0.97)'); bg.addColorStop(1,'rgba(6,5,9,0.98)'); ctx.fillStyle=bg; ctx.fill();
      ctx.lineWidth=3; ctx.strokeStyle=col; ctx.shadowBlur=14; ctx.shadowColor=col; this.rr(x,y,cw,ch,18); ctx.stroke(); ctx.shadowBlur=0;
      this._drawRelicSheetIcon(it.type,it.idx,x+cw/2-78,y+36,156,156,1);
      this.text(this._clip(it.name,cw-42,29,'900'),x+cw/2,y+224,29,col,{align:'center',baseline:'middle',weight:'900'});
      this.text((it.core||'聖物')+' · Lv '+((it.lvl||0)+1),x+cw/2,y+260,21,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      const lines=(it.affixes||[]).slice(0,3).map(affixText);
      if(!lines.length&&it.desc) lines.push(this._clip(it.desc,cw-58,18,'800'));
      for(let k=0;k<Math.min(3,lines.length);k++) this.text(this._clip(lines[k],cw-44,19,'800'),x+24,y+310+k*34,19,'#efe3ca',{baseline:'middle',weight:'800'});
      const by=y+ch-82;
      this.button(x+28,by,cw-56,58,m.forge?'升級並鑄造':'升級','endless_gear_'+it.id,()=>this._hbChooseEndlessGearReward(it.id),{primary:true,size:25,weight:'900'});
    }
  };
})();

// === final activation v16c: endless save-and-resume, active last ===
(function(){
  if(typeof Game==='undefined') return;
  const clone=o=>{ try{return o==null?o:JSON.parse(JSON.stringify(o));}catch(e){return o;} };
  const num=(v,d)=>Number.isFinite(Number(v))?Number(v):(d||0);

  Game.prototype._hbHasEndlessResume=function(){
    const r=this.save&&this.save.endlessResume;
    return !!(r&&r.v===1&&r.run&&num(r.run.endlessDepth,0)>0);
  };

  Game.prototype._hbEndlessResumeTitle=function(){
    const r=this.save&&this.save.endlessResume;
    if(!r||!r.run) return '沒有可繼續的無盡存檔';
    return '第 '+(r.run.endlessDepth||1)+' 層 · 分數 '+(r.run.score||0)+' · Boss '+(r.run.endlessBosses||0);
  };

  Game.prototype._hbCanSaveEndlessRun=function(){
    const run=this.run, b=run&&run.ball;
    if(!run||!run.endless) return {ok:false,msg:'目前不是無盡模式'};
    if(this.screen!=='battle') return {ok:false,msg:'只能在戰鬥中保存'};
    if(run.modal||this._detailOpen) return {ok:false,msg:'請先關閉目前視窗'};
    if(run._stageClearing||run._endlessSummoning) return {ok:false,msg:'深淵正在結算，稍等一下'};
    if(run.levelUpsPending>0) return {ok:false,msg:'請先完成升級選擇'};
    if(!b||b.live||!b.held||run.aiming||run.repos>0||run.nextBall>0) return {ok:false,msg:'請等球回到手上再保存'};
    if(run.guards&&run.guards.length===0) return {ok:false,msg:'場上正在切換階段'};
    return {ok:true,msg:'可保存'};
  };

  Game.prototype._hbEndlessResumeSnapshot=function(run){
    const keys=['act','route','stone','pi','heroId','hp','maxhp','shield','form','level','xp','xpNext','levelUpsPending','gold','abilities','words','comboMax','combo','score','shots','makes','swishes','banks','kills','bestCombo','shotCount','firstMissUsed','riftUsed','hexN','siphonCd','corrupt','heat','nextBall','_scoredBalls','_boardBuff','rewardLog','mut','_firstElemDone','_stageMakes','_missStageShield','mods','modStacks','loadout','relicIds','endlessDepth','endlessBosses','endlessProgress','endlessProgressMax','endlessBossTimeMax','endlessBossTime','endlessBossActive','endlessTimedOut','endlessBiome','endlessBiomeName','endlessGreedStacks','endlessDebtShots','endlessHoopFreeze','endlessHoopLock','_endlessGearRewards'];
    const data={};
    for(const k of keys) if(k in run) data[k]=clone(run[k]);
    data.stageBoss=!!(run.stage&&run.stage.boss);
    data.stageName=(run.stage&&run.stage.name)||'無盡深淵';
    data.guardsTotal=run.guardsTotal||0;
    data.spawned=run.spawned||0;
    data.bossWave=run.bossWave||0;
    data.waveSize=run.waveSize||0;
    data.repos=0;
    data.hoopAct=clone(run.hoopAct||null);
    data.nextHoopAct=clone(run.nextHoopAct||null);
    data.host=clone(run.host||null);
    data.hoop=clone(run.hoop||null);
    data.boss=clone(run.boss||null);
    data.ball=clone(run.ball||null);
    data.guards=clone(run.guards||[]);
    data.intf=clone(run.intf||[]);
    data.projectiles=[];
    data.fx=[];
    return {v:1,savedAt:new Date().toISOString(),run:data};
  };

  Game.prototype._hbStoreEndlessResume=function(){
    const can=this._hbCanSaveEndlessRun();
    if(!can.ok){ this.toast&&this.toast('暫時不能保存',can.msg); this.audio&&this.audio.sfx&&this.audio.sfx('hurt'); return false; }
    const snap=this._hbEndlessResumeSnapshot(this.run);
    this.save.endlessResume=snap;
    this.save.endless=true;
    this._recordEndlessCheckpoint&&this._recordEndlessCheckpoint(this.run);
    persist(this.save);
    this._scheduleCloudProgressSync&&this._scheduleCloudProgressSync(true);
    return true;
  };

  Game.prototype._hbClearEndlessResume=function(sync){
    if(this.save&&this.save.endlessResume){
      this.save.endlessResume=null;
      persist(this.save);
      if(sync!==false) this._scheduleCloudProgressSync&&this._scheduleCloudProgressSync(true);
    }
  };

  Game.prototype._hbSaveAndExitEndless=function(){
    if(!this._hbStoreEndlessResume()) return;
    this._paused=false;
    this.run=null;
    this.particles.length=0;
    this.floaters.length=0;
    this.screen='hub';
    this.toast&&this.toast('無盡已保存','下次可選擇繼續或重開');
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    this.render&&this.render();
  };

  const prevStartEndless=Game.prototype.startEndless;
  Game.prototype._hbStartFreshEndless=function(){
    this._endlessResumePrompt=false;
    this._hbClearEndlessResume(true);
    return prevStartEndless.apply(this,arguments);
  };

  Game.prototype._hbResumeEndlessRun=function(){
    const snap=this.save&&this.save.endlessResume;
    if(!snap||!snap.run){ this._endlessResumePrompt=false; return prevStartEndless.call(this); }
    const data=clone(snap.run), title=this._hbEndlessResumeTitle();
    this._endlessResumePrompt=false;
    this._hbClearEndlessResume(true);
    prevStartEndless.call(this);
    let run=this.run;
    if(!run) return;
    run.endless=true;
    run.endlessDepth=Math.max(1,num(data.endlessDepth,1));
    run.path=this._endlessPath?this._endlessPath():run.path;
    this._primeEndlessRun&&this._primeEndlessRun(run);
    this.enterStage(data.stageBoss?1:0);
    run=this.run;
    if(!run) return;
    run.path=this._endlessPath?this._endlessPath():run.path;
    run.pi=data.stageBoss?1:0;
    run.stage=run.path[run.pi]||run.stage;
    for(const k of Object.keys(data)){
      if(['stageBoss','stageName','host','hoop','boss','ball','guards','intf','projectiles','fx'].includes(k)) continue;
      run[k]=clone(data[k]);
    }
    run.host=clone(data.host||run.host);
    run.hoop=clone(data.hoop||run.hoop);
    run.boss=clone(data.boss||run.boss);
    run.ball=clone(data.ball||run.ball);
    run.guards=Array.isArray(data.guards)?clone(data.guards):run.guards;
    run.intf=Array.isArray(data.intf)?clone(data.intf):[];
    run.projectiles=[];
    run.fx=[];
    run.modal=null;
    run.banner={text:'無盡續戰',sub:'讀取 '+title,t:2.4};
    run._stageClearing=false;
    run._endlessSummoning=false;
    run.aiming=false;
    run.repos=0;
    if(!run.ball||run.ball.live||!run.ball.held) this.spawnBall&&this.spawnBall();
    this.screen='battle';
    this._paused=false;
    this.toast&&this.toast('已繼續無盡深淵','續戰存檔已消耗，避免重複讀檔洗分');
    this.render&&this.render();
  };

  Game.prototype.startEndless=function(opts){
    if(opts&&opts.resume) return this._hbResumeEndlessRun();
    if(opts&&opts.fresh) return this._hbStartFreshEndless();
    if(this._hbHasEndlessResume()){
      this._endlessIntro=false;
      this._endlessResumePrompt=true;
      this.audio&&this.audio.sfx&&this.audio.sfx('ui');
      this.render&&this.render();
      return;
    }
    return prevStartEndless.apply(this,arguments);
  };

  const prevDrawPause=Game.prototype.drawPause;
  Game.prototype.drawPause=function(){
    const run=this.run;
    if(!run||!run.endless) return prevDrawPause.apply(this,arguments);
    const ctx=this.ctx, IT=this.insT||0;
    const can=this._hbCanSaveEndlessRun();
    ctx.fillStyle='rgba(3,2,4,0.88)';
    ctx.fillRect(0,0,BW,BH);
    this.text('無盡暫停',BW/2,IT+176,72,'#ece0c4',{align:'center',weight:'800',glow:14});
    this.text('第 '+(run.endlessDepth||1)+' 層 · 分數 '+(run.score||0)+' · '+can.msg,BW/2,IT+232,26,can.ok?'#d8ff44':'#e6c068',{align:'center',baseline:'middle',weight:'900'});
    const bw=560,bh=88,gap=18,x=BW/2-bw/2; let y=IT+278;
    this.button(x,y,bw,bh,'繼續','res',()=>{ this._paused=false; },{primary:true,size:38}); y+=bh+gap;
    this.button(x,y,bw,bh,'保存後退出','endless_save_exit',()=>this._hbSaveAndExitEndless(),{size:36,color:can.ok?'#d8ff44':'#a99c80',weight:'900'}); y+=bh+gap;
    this.button(x,y,bw,bh,'放棄本局','quit',()=>{ this.confirm('放棄本次無盡挑戰？不會保留續戰存檔。',()=>{ this._hbClearEndlessResume(true); this._paused=false; this.run=null; this.screen='hub'; this.render&&this.render(); }); },{size:34,color:'#f0c0b0'}); y+=bh+gap;
    const st=this.save.settings,tw=(bw-20)/2;
    this.button(x,y,tw,76,st.music?'音樂 開':'音樂 關','pm',()=>{ st.music=!st.music; this.audio.setMusic(st.music); persist(this.save); },{size:28});
    this.button(x+tw+20,y,tw,76,st.sfx?'音效 開':'音效 關','ps',()=>{ st.sfx=!st.sfx; this.audio.setSfx(st.sfx); persist(this.save); },{size:28});
  };

  Game.prototype._drawEndlessResumePrompt=function(){
    if(!this._endlessResumePrompt) return;
    const ctx=this.ctx, U=this._U||1, IL=this.insL||0, IR=this.insR||0, IT=this.insT||0;
    ctx.save(); ctx.fillStyle='rgba(2,1,5,0.82)'; ctx.fillRect(-4000,-4000,BW+8000,BH+8000); ctx.restore();
    this.btn(-4000,-4000,BW+8000,BH+8000,'endless_resume_scrim',()=>{});
    const w=Math.min(760,BW-IL-IR-72*U), h=430*U, x=BW/2-w/2, y=IT+Math.max(72*U,(BH-IT-h)/2);
    this.rr(x,y,w,h,22*U);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(24,16,10,0.98)');
    bg.addColorStop(1,'rgba(7,5,9,0.99)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=3*U; ctx.strokeStyle='rgba(215,169,69,0.86)'; this.rr(x,y,w,h,22*U); ctx.stroke();
    ctx.lineWidth=1.4*U; ctx.strokeStyle='rgba(185,255,47,0.34)'; this.rr(x+12*U,y+12*U,w-24*U,h-24*U,16*U); ctx.stroke();
    this.text('偵測到無盡存檔',x+w/2,y+70*U,42*U,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12*U});
    this.text(this._hbEndlessResumeTitle(),x+w/2,y+122*U,25*U,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    this.wrap('繼續會消耗這份續戰存檔；重新開始會刪除它，避免重複讀檔洗分。',x+w/2,y+184*U,w-120*U,30*U,'#c8b894',22*U,'center');
    const bw=220*U,bh=66*U,gap=24*U,by=y+h-104*U;
    this.button(x+w/2-bw-gap/2,by,bw,bh,'繼續深淵','endless_resume_continue',()=>this.startEndless({resume:true}),{primary:true,size:25*U,weight:'900'});
    this.button(x+w/2+gap/2,by,bw,bh,'重新開始','endless_resume_fresh',()=>this.startEndless({fresh:true}),{size:25*U,color:'#f0c0b0',weight:'900'});
    this.button(x+w-112*U,y+24*U,72*U,50*U,'×','endless_resume_close',()=>{ this._endlessResumePrompt=false; this.render&&this.render(); },{size:32*U,color:'#f0c0b0'});
  };

  const prevRender=Game.prototype.render;
  Game.prototype.render=function(){
    const r=prevRender.apply(this,arguments);
    if(this._endlessResumePrompt) this._drawEndlessResumePrompt();
    return r;
  };

  const prevFinishEndless=Game.prototype.finishEndlessRun;
  Game.prototype.finishEndlessRun=function(won){
    this._hbClearEndlessResume(true);
    return prevFinishEndless.apply(this,arguments);
  };

  const prevSubset=Game.prototype._progressSaveSubset;
  Game.prototype._progressSaveSubset=function(){
    const out=prevSubset?prevSubset.call(this):{};
    out.endlessResume=this.save&&this.save.endlessResume?clone(this.save.endlessResume):null;
    return out;
  };

  const prevApply=Game.prototype._applyCloudProgressSnapshot;
  Game.prototype._applyCloudProgressSnapshot=function(remote){
    const changed=prevApply?!!prevApply.call(this,remote):false;
    const rs=remote&&remote.save&&typeof remote.save==='object'?remote.save:null;
    if(rs&&this.save&&Object.prototype.hasOwnProperty.call(rs,'endlessResume')){
      this.save.endlessResume=rs.endlessResume&&rs.endlessResume.v===1?clone(rs.endlessResume):null;
      persist(this.save);
      return true;
    }
    return changed;
  };
})();

// === final activation v17: optional endless socket affixes ===
(function(){
  if(typeof Game==='undefined') return;
  const MAX_SOCKET_AFFIXES=5;
  const RARITY_META={
    common:{name:'普通',col:'#d8d1bd',glow:'rgba(216,209,189,0.32)'},
    magic:{name:'魔法',col:'#7fd8ff',glow:'rgba(127,216,255,0.42)'},
    rare:{name:'稀有',col:'#e6b94a',glow:'rgba(230,185,74,0.44)'},
    epic:{name:'史詩',col:'#c88cff',glow:'rgba(200,140,255,0.48)'},
    legendary:{name:'傳說',col:'#ff9f43',glow:'rgba(255,159,67,0.52)'},
    abyss:{name:'深淵',col:'#d8ff44',glow:'rgba(216,255,68,0.58)'}
  };
  const KEY_LABEL={
    fireMul:'火球傷害',iceMul:'冰球傷害',lightningMul:'閃電傷害',
    swishMul:'空心球傷害',bankMul:'擦板球傷害',luckyMul:'幸運球傷害',
    nearMul:'近框傷害',farMul:'遠框傷害',allDmgMul:'通用傷害',
    xpMul:'經驗獲得',goldMul:'金幣獲得',killGoldBonus:'擊殺金幣',
    damageReduce:'受傷減免',maxhp:'最大生命',startShield:'立即護盾',
    stageStartShield:'每層護盾',stageStartHeal:'每層回血',
    comboDmgPerStack:'連進傷害',minPreviewBonus:'預覽軌跡'
  };
  const SOCKET_AFFIXES=[
    {id:'c_steady_wrist',rarity:'common',name:'穩腕刻痕',key:'minPreviewBonus',pct:1,val:0.03,desc:'投籃預覽保留更多尾段。'},
    {id:'c_low_arc',rarity:'common',name:'低弧修正',key:'nearMul',pct:1,val:0.04,desc:'近框與貼框命中更有殺傷。'},
    {id:'c_high_arc',rarity:'common',name:'高弧修正',key:'farMul',pct:1,val:0.04,desc:'遠框投射傷害小幅提高。'},
    {id:'c_soft_net',rarity:'common',name:'柔網粉塵',key:'swishMul',pct:1,val:0.04,desc:'空心球額外造成傷害。'},
    {id:'c_board_tick',rarity:'common',name:'板角感應',key:'bankMul',pct:1,val:0.04,desc:'擦板球額外造成傷害。'},
    {id:'c_lucky_knuckle',rarity:'common',name:'幸運指節',key:'luckyMul',pct:1,val:0.04,desc:'幸運球額外造成傷害。'},
    {id:'c_ember_lace',rarity:'common',name:'火紋鞋帶',key:'fireMul',pct:1,val:0.04,desc:'火球傷害小幅提高。'},
    {id:'c_frost_lace',rarity:'common',name:'霜紋鞋帶',key:'iceMul',pct:1,val:0.04,desc:'冰球傷害小幅提高。'},
    {id:'c_spark_lace',rarity:'common',name:'電紋鞋帶',key:'lightningMul',pct:1,val:0.04,desc:'閃電球傷害小幅提高。'},
    {id:'c_hide_patch',rarity:'common',name:'硬皮補丁',key:'damageReduce',pct:1,val:0.02,desc:'受到的傷害略微降低。'},
    {id:'c_bone_padding',rarity:'common',name:'骨棉內襯',key:'maxhp',pct:0,val:6,desc:'提高最大生命值。'},
    {id:'c_pocket_charm',rarity:'common',name:'零錢護符',key:'goldMul',pct:1,val:0.04,desc:'本局金幣收益略微提高。'},
    {id:'m_silver_sight',rarity:'magic',name:'銀線瞄準',key:'minPreviewBonus',pct:1,val:0.05,desc:'預覽軌跡更穩定。'},
    {id:'m_rim_press',rarity:'magic',name:'籃下壓迫',key:'nearMul',pct:1,val:0.07,desc:'靠近籃框時傷害提高。'},
    {id:'m_deep_release',rarity:'magic',name:'深域出手',key:'farMul',pct:1,val:0.07,desc:'遠距離命中更痛。'},
    {id:'m_net_needle',rarity:'magic',name:'破網銀針',key:'swishMul',pct:1,val:0.07,desc:'空心球傷害提高。'},
    {id:'m_glass_ritual',rarity:'magic',name:'板魂儀式',key:'bankMul',pct:1,val:0.07,desc:'擦板球傷害提高。'},
    {id:'m_loaded_luck',rarity:'magic',name:'灌鉛骰骨',key:'luckyMul',pct:1,val:0.07,desc:'幸運球傷害提高。'},
    {id:'m_fire_sigil',rarity:'magic',name:'赤焰槽印',key:'fireMul',pct:1,val:0.08,desc:'火球傷害提高。'},
    {id:'m_ice_sigil',rarity:'magic',name:'冷霜槽印',key:'iceMul',pct:1,val:0.08,desc:'冰球傷害提高。'},
    {id:'m_storm_sigil',rarity:'magic',name:'雷鳴槽印',key:'lightningMul',pct:1,val:0.08,desc:'閃電球傷害提高。'},
    {id:'m_marrow_guard',rarity:'magic',name:'髓甲縫線',key:'damageReduce',pct:1,val:0.04,desc:'受到的傷害降低。'},
    {id:'m_vault_breath',rarity:'magic',name:'墓窖呼吸',key:'maxhp',pct:0,val:10,desc:'提高最大生命值。'},
    {id:'m_shrine_shield',rarity:'magic',name:'聖壇護膜',key:'startShield',pct:0,val:8,desc:'立即獲得護盾。'},
    {id:'m_soul_interest',rarity:'magic',name:'魂息利錢',key:'goldMul',pct:1,val:0.08,desc:'本局金幣收益提高。'},
    {id:'m_coach_notes',rarity:'magic',name:'戰術殘頁',key:'xpMul',pct:1,val:0.08,desc:'本局經驗收益提高。'},
    {id:'r_flawless_crease',rarity:'rare',name:'無瑕折線',key:'allDmgMul',pct:1,val:0.06,desc:'所有進球傷害提高。'},
    {id:'r_close_execution',rarity:'rare',name:'籃下處刑',key:'nearMul',pct:1,val:0.10,desc:'近框與貼框傷害大幅提高。'},
    {id:'r_outer_orbit',rarity:'rare',name:'外圈軌道',key:'farMul',pct:1,val:0.10,desc:'遠框傷害大幅提高。'},
    {id:'r_white_net_oath',rarity:'rare',name:'白網誓約',key:'swishMul',pct:1,val:0.10,desc:'空心球傷害大幅提高。'},
    {id:'r_backboard_contract',rarity:'rare',name:'籃板契書',key:'bankMul',pct:1,val:0.10,desc:'擦板球傷害大幅提高。'},
    {id:'r_loaded_coin',rarity:'rare',name:'偏心金幣',key:'luckyMul',pct:1,val:0.10,desc:'幸運球傷害大幅提高。'},
    {id:'r_cinder_core',rarity:'rare',name:'燼核鑲片',key:'fireMul',pct:1,val:0.12,desc:'火球傷害大幅提高。'},
    {id:'r_rime_core',rarity:'rare',name:'霧凇鑲片',key:'iceMul',pct:1,val:0.12,desc:'冰球傷害大幅提高。'},
    {id:'r_thunder_core',rarity:'rare',name:'雷核鑲片',key:'lightningMul',pct:1,val:0.12,desc:'閃電球傷害大幅提高。'},
    {id:'r_abyss_hide',rarity:'rare',name:'深淵硬皮',key:'damageReduce',pct:1,val:0.06,desc:'受到的傷害明顯降低。'},
    {id:'r_iron_lungs',rarity:'rare',name:'鐵肺氣囊',key:'maxhp',pct:0,val:16,desc:'提高最大生命值。'},
    {id:'r_green_room',rarity:'rare',name:'綠火休息室',key:'stageStartHeal',pct:1,val:0.03,desc:'每層開始時回復生命。'},
    {id:'r_entry_totem',rarity:'rare',name:'入場圖騰',key:'stageStartShield',pct:0,val:10,desc:'每層開始時獲得護盾。'},
    {id:'r_grave_tithe',rarity:'rare',name:'墓稅袋',key:'goldMul',pct:1,val:0.12,desc:'本局金幣收益大幅提高。'},
    {id:'r_kill_toll',rarity:'rare',name:'收債鈴',key:'killGoldBonus',pct:0,val:3,desc:'擊殺怪物時額外獲得金幣。'},
    {id:'r_muscle_memory',rarity:'rare',name:'肌肉記憶',key:'comboDmgPerStack',pct:1,val:0.03,desc:'連進層數提供更多傷害。'},
    {id:'e_net_execution',rarity:'epic',name:'網心處刑',key:'allDmgMul',pct:1,val:0.10,desc:'所有進球傷害大幅提高。'},
    {id:'e_first_gap',rarity:'epic',name:'第一縫隙',key:'minPreviewBonus',pct:1,val:0.08,desc:'預覽軌跡顯著延長。'},
    {id:'e_slaughter_layup',rarity:'epic',name:'屠籃切入',key:'nearMul',pct:1,val:0.14,desc:'近框與貼框傷害顯著提高。'},
    {id:'e_eclipse_range',rarity:'epic',name:'月蝕遠射',key:'farMul',pct:1,val:0.14,desc:'遠框傷害顯著提高。'},
    {id:'e_pure_silence',rarity:'epic',name:'靜默空心',key:'swishMul',pct:1,val:0.14,desc:'空心球傷害顯著提高。'},
    {id:'e_skull_bank',rarity:'epic',name:'骷髏擦板',key:'bankMul',pct:1,val:0.14,desc:'擦板球傷害顯著提高。'},
    {id:'e_rigged_miracle',rarity:'epic',name:'作弊奇蹟',key:'luckyMul',pct:1,val:0.14,desc:'幸運球傷害顯著提高。'},
    {id:'e_saint_ember',rarity:'epic',name:'聖焰環槽',key:'fireMul',pct:1,val:0.16,desc:'火球傷害顯著提高。'},
    {id:'e_cold_altar',rarity:'epic',name:'冷壇環槽',key:'iceMul',pct:1,val:0.16,desc:'冰球傷害顯著提高。'},
    {id:'e_chain_thunder',rarity:'epic',name:'鏈雷環槽',key:'lightningMul',pct:1,val:0.16,desc:'閃電球傷害顯著提高。'},
    {id:'e_black_parry',rarity:'epic',name:'黑鐵格擋',key:'damageReduce',pct:1,val:0.08,desc:'受到的傷害大幅降低。'},
    {id:'e_giant_heart',rarity:'epic',name:'巨人心瓣',key:'maxhp',pct:0,val:24,desc:'大幅提高最大生命值。'},
    {id:'e_blood_interest',rarity:'epic',name:'血息學費',key:'xpMul',pct:1,val:0.16,desc:'本局經驗收益顯著提高。'},
    {id:'e_soul_mint',rarity:'epic',name:'魂幣鑄模',key:'goldMul',pct:1,val:0.16,desc:'本局金幣收益顯著提高。'},
    {id:'l_hoopbreaker_seal',rarity:'legendary',name:'破框者聖印',key:'allDmgMul',pct:1,val:0.14,desc:'所有進球傷害極大提高。'},
    {id:'l_linebreaker',rarity:'legendary',name:'禁區破線',key:'nearMul',pct:1,val:0.18,desc:'近框與貼框傷害極大提高。'},
    {id:'l_moonshot',rarity:'legendary',name:'月面遠投',key:'farMul',pct:1,val:0.18,desc:'遠框傷害極大提高。'},
    {id:'l_no_sound',rarity:'legendary',name:'無聲破網',key:'swishMul',pct:1,val:0.18,desc:'空心球傷害極大提高。'},
    {id:'l_shattered_glass',rarity:'legendary',name:'碎界擦板',key:'bankMul',pct:1,val:0.18,desc:'擦板球傷害極大提高。'},
    {id:'l_loaded_prophecy',rarity:'legendary',name:'命定幸運',key:'luckyMul',pct:1,val:0.18,desc:'幸運球傷害極大提高。'},
    {id:'l_furnace_orbit',rarity:'legendary',name:'熔爐軌道',key:'fireMul',pct:1,val:0.20,desc:'火球傷害極大提高。'},
    {id:'l_frozen_comet',rarity:'legendary',name:'凍星彗尾',key:'iceMul',pct:1,val:0.20,desc:'冰球傷害極大提高。'},
    {id:'l_thunder_court',rarity:'legendary',name:'雷骨全場',key:'lightningMul',pct:1,val:0.20,desc:'閃電球傷害極大提高。'},
    {id:'l_black_gold',rarity:'legendary',name:'黑金契約',key:'goldMul',pct:1,val:0.22,desc:'本局金幣收益極大提高。'},
    {id:'l_deathless_wrap',rarity:'legendary',name:'不死繃帶',key:'damageReduce',pct:1,val:0.10,desc:'受到的傷害極大降低。'},
    {id:'l_giant_wall',rarity:'legendary',name:'巨牆骨板',key:'maxhp',pct:0,val:32,desc:'極大提高最大生命值。'},
    {id:'a_abyss_king',rarity:'abyss',name:'深籃君王印',key:'allDmgMul',pct:1,val:0.18,desc:'深淵規則承認你的破壞力。'},
    {id:'a_void_swish',rarity:'abyss',name:'虛無空心',key:'swishMul',pct:1,val:0.22,desc:'空心球像裂縫一樣撕開敵人。'},
    {id:'a_debt_bank',rarity:'abyss',name:'收債擦板',key:'bankMul',pct:1,val:0.22,desc:'每次擦板都像在討回欠款。'},
    {id:'a_crooked_fate',rarity:'abyss',name:'歪斜命運',key:'luckyMul',pct:1,val:0.22,desc:'幸運球受到深淵偏袒。'},
    {id:'a_black_flame',rarity:'abyss',name:'黑焰球心',key:'fireMul',pct:1,val:0.24,desc:'火球帶著深淵燃燒。'},
    {id:'a_null_frost',rarity:'abyss',name:'零度裂冰',key:'iceMul',pct:1,val:0.24,desc:'冰球把籃框周圍凍成刑場。'},
    {id:'a_bone_lightning',rarity:'abyss',name:'骨雷天幕',key:'lightningMul',pct:1,val:0.24,desc:'閃電球引來骨穹雷鳴。'},
    {id:'a_blind_spot',rarity:'abyss',name:'盲點視界',key:'minPreviewBonus',pct:1,val:0.12,desc:'即使深淵遮眼，球路仍留下痕跡。'},
    {id:'a_shielded_void',rarity:'abyss',name:'虛空硬殼',key:'damageReduce',pct:1,val:0.12,desc:'深淵替你吞掉一部分傷害。'},
    {id:'a_endless_chest',rarity:'abyss',name:'無盡胸骨',key:'maxhp',pct:0,val:44,desc:'最大生命值獲得深層增幅。'}
  ];

  const clone=o=>{ try{return JSON.parse(JSON.stringify(o));}catch(e){return o;} };
  const cleanLabel=a=>String((a&&a.label)||(a&&a.name)||(a&&a.key)||'詞綴').replace(/^鑲嵌·/,'').replace(/^鑄造·/,'').replace(/^精煉·/,'');
  const roundAffix=(a,v)=>a&&a.pct?Math.round(v*100)/100:Math.round(v);
  const refineInc=a=>a&&a.pct?0.03:(a&&a.key==='maxhp'?5:4);
  const valueText=a=>{
    const v=Number(a&&a.val)||0;
    return (v>=0?'+':'')+(a&&a.pct?Math.round(v*100)+'%':Math.round(v));
  };
  const effectText=a=>(KEY_LABEL[a&&a.key]||cleanLabel(a))+' '+valueText(a);
  const rollRarity=depth=>{
    const d=Math.max(0,(Number(depth)||35)-30);
    const table=[
      ['common',Math.max(4,22-d*0.65)],
      ['magic',Math.max(12,36-d*0.35)],
      ['rare',28+d*0.15],
      ['epic',10+d*0.28],
      ['legendary',3+d*0.16],
      ['abyss',Math.max(0.5,d*0.05)]
    ];
    const total=table.reduce((s,x)=>s+x[1],0);
    let r=Math.random()*total;
    for(const row of table){ r-=row[1]; if(r<=0) return row[0]; }
    return 'rare';
  };
  const pickSocketAffix=(depth,usedIds,usedKeys)=>{
    for(let tries=0;tries<18;tries++){
      const rarity=rollRarity(depth);
      const pool=SOCKET_AFFIXES.filter(a=>a.rarity===rarity&&!usedIds[a.id]&&!usedKeys[a.key]);
      if(pool.length) return clone(pool[Math.floor(Math.random()*pool.length)]);
    }
    const fallback=SOCKET_AFFIXES.filter(a=>!usedIds[a.id]&&!usedKeys[a.key]);
    return fallback.length?clone(fallback[Math.floor(Math.random()*fallback.length)]):clone(SOCKET_AFFIXES[Math.floor(Math.random()*SOCKET_AFFIXES.length)]);
  };

  Game.prototype._hbSocketAffixPool=function(){ return SOCKET_AFFIXES.slice(); };

  Game.prototype._hbSocketAffixChoices=function(depth,rid){
    const meta=this._relicMeta(rid);
    if(!meta.affixes) meta.affixes=[];
    if(meta.affixes.length>=MAX_SOCKET_AFFIXES){
      return meta.affixes.map((a,i)=>Object.assign({},a,{
        id:'refine_'+i,mode:'refine',refIndex:i,name:'精煉·'+cleanLabel(a),
        rarity:a.rarity||(a.forged?'rare':'magic'),val:refineInc(a),
        desc:'詞綴槽已滿，改為精煉這條現有詞綴。'
      })).slice(0,3);
    }
    const usedIds={}, usedKeys={};
    for(const a of meta.affixes){ if(a&&a.sourceId) usedIds[a.sourceId]=1; if(a&&a.key) usedKeys[a.key]=1; }
    const out=[];
    while(out.length<3&&out.length<SOCKET_AFFIXES.length){
      const a=pickSocketAffix(depth,usedIds,usedKeys);
      if(!a) break;
      usedIds[a.id]=1; usedKeys[a.key]=1;
      out.push(a);
    }
    return out;
  };

  Game.prototype._hbApplySocketAffixChoice=function(rid,choice){
    const meta=this._relicMeta(rid);
    if(!meta.affixes) meta.affixes=[];
    let made=null;
    if(choice&&choice.mode==='refine'){
      const idx=Math.max(0,Math.min(meta.affixes.length-1,Number(choice.refIndex)||0));
      const target=meta.affixes[idx];
      if(target){
        const inc=refineInc(target), old=Number(target.val)||0;
        target.val=roundAffix(target,old+inc);
        made=Object.assign({},target,{label:'精煉·'+cleanLabel(target),val:target.val-old,refined:true});
        this._hbApplyRelicAffixDelta&&this._hbApplyRelicAffixDelta(this.run,made,made.val);
      }
    }else if(choice){
      made={key:choice.key,label:'鑲嵌·'+choice.name,pct:!!choice.pct,val:roundAffix(choice,choice.val),rarity:choice.rarity,sourceId:choice.id,socketed:true};
      if(meta.affixes.length<MAX_SOCKET_AFFIXES){
        meta.affixes.push(made);
        meta.socketCount=Math.max(0,Number(meta.socketCount)||0)+1;
        this._hbApplyRelicAffixDelta&&this._hbApplyRelicAffixDelta(this.run,made,made.val);
      }else{
        const idx=Math.floor(Math.random()*meta.affixes.length), target=meta.affixes[idx];
        const inc=refineInc(target), old=Number(target.val)||0;
        target.val=roundAffix(target,old+inc);
        made=Object.assign({},target,{label:'精煉·'+cleanLabel(target),val:target.val-old,refined:true});
        this._hbApplyRelicAffixDelta&&this._hbApplyRelicAffixDelta(this.run,made,made.val);
      }
    }
    this._saveProfile&&this._saveProfile();
    return made;
  };

  const prevChooseGear=Game.prototype._hbChooseEndlessGearReward;
  Game.prototype._hbChooseEndlessGearReward=function(rid){
    const run=this.run, m=run&&run.modal;
    if(!run||!m||m.kind!=='endlessGearReward'||!Array.isArray(m.choices)||!m.choices.includes(rid)) return;
    run._endlessGearRewards=run._endlessGearRewards||{};
    run._endlessGearRewards[m.depth]=true;
    const up=this._hbUpgradeEquippedRelic?this._hbUpgradeEquippedRelic(rid):{lvl:0};
    const item=this._hbRelicDisplay?this._hbRelicDisplay(rid):this._relicDisplay(rid,true);
    const name=item?item.name:'聖物';
    if(run.rewardLog) run.rewardLog.push('深淵鍛造：'+name+' Lv '+up.lvl);
    if(m.forge){
      const choices=this._hbSocketAffixChoices(m.depth,rid);
      run.modal={kind:'endlessSocketAffixReward',depth:m.depth,rid,itemName:name,upLevel:up.lvl,choices};
      this.toast&&this.toast('裝備升級完成','選擇鑲嵌詞綴，或放棄這次鑲嵌');
      this.floater&&this.floater(BW/2,BH*0.30,'裝備升級','#d8ff44',38,{crit:true,t:1.2});
      this.audio&&this.audio.sfx&&this.audio.sfx('levelup');
      this.render&&this.render();
      return;
    }
    run.modal=null;
    this.toast&&this.toast('深淵鍛造完成',name+' Lv '+up.lvl);
    this.floater&&this.floater(BW/2,BH*0.30,'裝備升級','#d8ff44',38,{crit:true,t:1.2});
    this.audio&&this.audio.sfx&&this.audio.sfx('levelup');
    return this._endlessAdvanceDepth&&this._endlessAdvanceDepth();
  };

  Game.prototype._hbChooseSocketAffix=function(idx){
    const run=this.run, m=run&&run.modal;
    if(!run||!m||m.kind!=='endlessSocketAffixReward') return;
    const choice=m.choices&&m.choices[idx];
    if(!choice) return;
    const made=this._hbApplySocketAffixChoice(m.rid,choice);
    if(run.rewardLog) run.rewardLog.push((made&&made.refined?'深淵精煉：':'深淵鑲嵌：')+m.itemName+' · '+(made?cleanLabel(made):cleanLabel(choice)));
    run.modal=null;
    this.toast&&this.toast(made&&made.refined?'深淵精煉完成':'深淵鑲嵌完成',(made?cleanLabel(made):cleanLabel(choice))+' '+(made?valueText(made):valueText(choice)));
    this.floater&&this.floater(BW/2,BH*0.30,made&&made.refined?'詞綴精煉':'詞綴鑲嵌',made&&made.rarity&&RARITY_META[made.rarity]?RARITY_META[made.rarity].col:'#d8ff44',34,{crit:true,t:1.2});
    this.audio&&this.audio.sfx&&this.audio.sfx('levelup');
    return this._endlessAdvanceDepth&&this._endlessAdvanceDepth();
  };

  Game.prototype._hbSkipSocketAffix=function(){
    const run=this.run, m=run&&run.modal;
    if(!run||!m||m.kind!=='endlessSocketAffixReward') return;
    if(run.rewardLog) run.rewardLog.push('放棄鑲嵌：'+(m.itemName||'聖物'));
    run.modal=null;
    this.toast&&this.toast('已放棄鑲嵌','裝備升級保留，未新增詞綴');
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    return this._endlessAdvanceDepth&&this._endlessAdvanceDepth();
  };

  const prevDrawModal=Game.prototype.drawModal;
  Game.prototype.drawModal=function(){
    const run=this.run, m=run&&run.modal;
    if(!m||m.kind!=='endlessSocketAffixReward') return prevDrawModal.apply(this,arguments);
    const ctx=this.ctx;
    ctx.save(); ctx.fillStyle='rgba(2,1,5,0.86)'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    this.btn(0,0,BW,BH,'endless_socket_scrim',()=>{});
    this.text('深淵鑲嵌',BW/2,104,58,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:16});
    this.text('第 '+m.depth+' 層 · '+(m.itemName||'聖物')+' Lv '+(m.upLevel||'')+' · 可選擇一個詞綴，也可以放棄',BW/2,154,24,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    const choices=Array.isArray(m.choices)?m.choices:[], n=Math.max(1,choices.length);
    const cw=Math.min(420,(BW-240-(n-1)*34)/n), ch=510, gap=34, total=n*cw+(n-1)*gap, x0=BW/2-total/2, y=226;
    for(let i=0;i<choices.length;i++){
      const a=choices[i], rm=RARITY_META[a.rarity]||RARITY_META.magic, x=x0+i*(cw+gap);
      this.rr(x,y,cw,ch,18);
      const bg=ctx.createLinearGradient(0,y,0,y+ch);
      bg.addColorStop(0,'rgba(28,20,18,0.98)');
      bg.addColorStop(1,'rgba(6,5,9,0.99)');
      ctx.fillStyle=bg; ctx.fill();
      ctx.lineWidth=3; ctx.strokeStyle=rm.col; ctx.shadowBlur=18; ctx.shadowColor=rm.col; this.rr(x,y,cw,ch,18); ctx.stroke(); ctx.shadowBlur=0;
      ctx.save(); ctx.fillStyle=rm.glow; ctx.beginPath(); ctx.arc(x+cw/2,y+94,78,0,TAU); ctx.fill(); ctx.restore();
      this.text(rm.name,x+cw/2,y+42,21,rm.col,{align:'center',baseline:'middle',weight:'900'});
      this.text(a.mode==='refine'?'精煉現有詞綴':'鑲嵌詞綴',x+cw/2,y+76,18,'#a2926e',{align:'center',baseline:'middle',weight:'800'});
      this.text(this._clip(cleanLabel(a),cw-50,34,'900'),x+cw/2,y+136,34,'#fff4dc',{align:'center',baseline:'middle',weight:'900'});
      this.text(effectText(a),x+cw/2,y+196,28,rm.col,{align:'center',baseline:'middle',weight:'900',glow:8});
      this.wrap(a.desc||'深淵詞綴會永久寫入這件裝備。',x+cw/2,y+260,cw-58,30,'#c8b894',22,'center');
      this.text(a.mode==='refine'?'提高既有數值':'占用 1 個詞綴槽，最多 '+MAX_SOCKET_AFFIXES+' 條',x+cw/2,y+378,20,'#8f846e',{align:'center',baseline:'middle',weight:'800'});
      this.button(x+34,y+ch-86,cw-68,58,a.mode==='refine'?'精煉':'鑲嵌','endless_socket_'+i,()=>this._hbChooseSocketAffix(i),{primary:true,size:25,weight:'900'});
    }
    const bw=360,bh=64,by=y+ch+34;
    this.button(BW/2-bw/2,by,bw,bh,'放棄鑲嵌','endless_socket_skip',()=>this._hbSkipSocketAffix(),{size:25,color:'#f0c0b0',weight:'900'});
  };
})();

// === final activation v18: commit normal-mode shot stats only on run finish ===
(function(){
  if(typeof Game==='undefined') return;
  const cloneEvent=e=>({id:e&&e.id,made:!!(e&&e.made),type:(e&&e.type)||null});
  const shouldDefer=(g,run)=>!!(g&&run&&run._hbDeferRunStats&&!run.endless&&!(g.save&&g.save.admin));
  const countEvents=events=>{
    const out={shots:0,makes:0,swishes:0,banks:0};
    for(const e of events||[]){
      out.shots++;
      if(e&&e.made){
        out.makes++;
        if(e.type==='swish') out.swishes++;
        else if(e.type==='bank') out.banks++;
      }
    }
    return out;
  };

  const prevStartRun=Game.prototype.startRun;
  Game.prototype.startRun=function(){
    const ret=prevStartRun.apply(this,arguments);
    if(this.run){
      this.run._hbDeferRunStats=true;
      this.run._hbDeferredStatEvents=[];
      this.run._hbStatsCommitted=false;
    }
    return ret;
  };

  const liveRecordShot=Game.prototype._recordShot;
  Game.prototype._recordShot=function(id,made,type){
    const run=this.run;
    if(shouldDefer(this,run)){
      run._hbDeferredStatEvents=run._hbDeferredStatEvents||[];
      run._hbDeferredStatEvents.push({id,made:!!made,type:type||null});
      return;
    }
    return liveRecordShot?liveRecordShot.apply(this,arguments):undefined;
  };

  const prevBattleUp=Game.prototype.battleUp;
  Game.prototype.battleUp=function(){
    const run=this.run, stats=this.save&&this.save.stats;
    const defer=shouldDefer(this,run), before=stats?Math.max(0,Number(stats.totalShots)||0):0;
    const ret=prevBattleUp.apply(this,arguments);
    if(defer&&stats) stats.totalShots=before;
    return ret;
  };

  const prevMakeBasket=Game.prototype.makeBasket;
  Game.prototype.makeBasket=function(){
    const run=this.run, stats=this.save&&this.save.stats;
    const defer=shouldDefer(this,run), before=stats?{swishes:Math.max(0,Number(stats.swishes)||0),banks:Math.max(0,Number(stats.banks)||0)}:null;
    const ret=prevMakeBasket.apply(this,arguments);
    if(defer&&stats&&before){ stats.swishes=before.swishes; stats.banks=before.banks; }
    return ret;
  };

  Game.prototype._hbCommitRunShotStats=function(run){
    if(!shouldDefer(this,run)||run._hbStatsCommitted) return false;
    run._hbStatsCommitted=true;
    const s=this.save;
    if(s&&s.stats){
      s.stats.totalShots=Math.max(0,Number(s.stats.totalShots)||0)+Math.max(0,Number(run.shots)||0);
      s.stats.swishes=Math.max(0,Number(s.stats.swishes)||0)+Math.max(0,Number(run.swishes)||0);
      s.stats.banks=Math.max(0,Number(s.stats.banks)||0)+Math.max(0,Number(run.banks)||0);
    }
    const events=(run._hbDeferredStatEvents||[]).map(cloneEvent);
    const c=countEvents(events);
    const heroId=run.heroId;
    let miss=Math.max(0,(Number(run.shots)||0)-c.shots);
    let swish=Math.max(0,(Number(run.swishes)||0)-c.swishes);
    let bank=Math.max(0,(Number(run.banks)||0)-c.banks);
    let made=Math.max(0,(Number(run.makes)||0)-c.makes);
    while(swish>0){ events.push({id:heroId,made:true,type:'swish'}); swish--; made--; miss--; }
    while(bank>0){ events.push({id:heroId,made:true,type:'bank'}); bank--; made--; miss--; }
    while(made>0){ events.push({id:heroId,made:true,type:'normal'}); made--; miss--; }
    while(miss>0){ events.push({id:heroId,made:false,type:null}); miss--; }
    if(liveRecordShot){
      for(const e of events) liveRecordShot.call(this,e.id||heroId,e.made,e.type);
    }
    run._hbDeferredStatEvents=[];
    this._syncLeaderboardStats&&this._syncLeaderboardStats(true);
    return true;
  };

  const prevFinishRun=Game.prototype.finishRun;
  Game.prototype.finishRun=function(won){
    const run=this.run;
    if(run&&!run.endless) this._hbCommitRunShotStats&&this._hbCommitRunShotStats(run);
    return prevFinishRun.apply(this,arguments);
  };
})();

// === final activation v19: hide cleared and stale cloud leaderboard rows ===
(function(){
  if(typeof Game==='undefined') return;
  const isClearedRow=row=>{
    const name=String((row&&row.player_name)||(row&&row.name)||'').trim();
    const key=String(row&&row.today_key||'').trim();
    return !row||/^__deleted__/i.test(name)||key==='deleted';
  };
  const oldNormalRow=Game.prototype._normalLeaderboardRow;
  Game.prototype._normalLeaderboardRow=function(row){
    if(row&&!row._local){
      if(isClearedRow(row)) return null;
      const today=this._dayKey&&this._dayKey();
      if(today&&row.today_key&&row.today_key!==today) return null;
    }
    return oldNormalRow?oldNormalRow.call(this,row):null;
  };
  const oldEndlessRows=Game.prototype._endlessLeaderboardRows;
  Game.prototype._endlessLeaderboardRows=function(){
    const cache=this._leaderboardCache;
    if(Array.isArray(cache)) this._leaderboardCache=cache.filter(r=>!isClearedRow(r));
    try{ return oldEndlessRows?oldEndlessRows.apply(this,arguments):[]; }
    finally{ this._leaderboardCache=cache; }
  };
})();

// === final activation v20: standard stage bean enemy sprites ===
(function(){
  if(typeof Game==='undefined') return;
  const BEAN_MOB_VER='20260629_bean_mobs_v1';
  const TYPE_TO_BEAN={skel:0,mummy:0,chain:1,imp:1,drummer:1,shield:2,zombie:3,slime:3,spider:3,bat:4,frost:4,eye:4,wizard:4};
  function isStandardRun(run){ return !!(run&&!run.endless&&!run.sandbag&&run.act>=1&&run.act<=5); }
  function beanMobSrc(act,idx){ return '/assets/mob/standard/act'+act+'/enemy_'+idx+'.png?v='+BEAN_MOB_VER; }

  Game.prototype._standardBeanMobImg=function(act,idx){
    this._standardBeanMobs=this._standardBeanMobs||{};
    const key=act+'_'+idx;
    if(this._standardBeanMobs[key]!==undefined) return this._standardBeanMobs[key];
    try{
      const im=new Image();
      im.onerror=()=>{ im._err=true; };
      im.onload=()=>{ try{ if(this.screen==='battle'&&this.render) this.render(); }catch(_e){} };
      im.src=beanMobSrc(act,idx);
      this._standardBeanMobs[key]=im;
      return im;
    }catch(e){
      this._standardBeanMobs[key]=null;
      return null;
    }
  };

  Game.prototype._standardBeanMobIndex=function(g){
    if(g&&g.elite) return 5;
    return TYPE_TO_BEAN[(g&&g.type)||''] ?? ((g&&g.slot)||0)%5;
  };

  Game.prototype._standardBeanMobSpriteFor=function(g){
    const run=this.run;
    if(!isStandardRun(run)) return null;
    return this._standardBeanMobImg(run.act,this._standardBeanMobIndex(g));
  };

  const oldDrawMobGroup=Game.prototype.drawMobGroup;
  Game.prototype.drawMobGroup=function(){
    if(isStandardRun(this.run)) return;
    return oldDrawMobGroup?oldDrawMobGroup.apply(this,arguments):undefined;
  };

  const oldDrawGuard=Game.prototype.drawGuard;
  Game.prototype.drawGuard=function(g){
    const run=this.run;
    if(isStandardRun(run)&&g&&!g.dead){
      const ctx=this.ctx, im=this._standardBeanMobSpriteFor(g), sc=(g.drawScale||1)*(g.elite?1.08:1);
      const bob=Math.sin((this.t||0)*2.1+(g.slot||0))*3;
      const foot=g.y+g.r*0.74;
      if(im&&im.complete&&im.naturalWidth&&!im._err){
        const baseH=g.r*(g.elite?4.65:4.25)*sc;
        const maxH=BH*0.27;
        const H=Math.min(baseH,maxH);
        const W=H*im.naturalWidth/im.naturalHeight;
        ctx.save();
        ctx.globalAlpha=g.phased?0.5:1;
        const sh=ctx.createRadialGradient(g.x,foot-4,8,g.x,foot-4,W*0.46);
        sh.addColorStop(0,'rgba(0,0,0,0.42)');
        sh.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=sh;
        ctx.beginPath();
        ctx.ellipse(g.x,foot-4,W*0.42,H*0.075,0,0,TAU);
        ctx.fill();
        if(g.elite){
          const glow=ctx.createRadialGradient(g.x,foot-H*0.48,10,g.x,foot-H*0.48,W*0.62);
          glow.addColorStop(0,'rgba(255,210,88,0.20)');
          glow.addColorStop(1,'rgba(255,210,88,0)');
          ctx.fillStyle=glow;
          ctx.beginPath();
          ctx.ellipse(g.x,foot-H*0.48,W*0.56,H*0.52,0,0,TAU);
          ctx.fill();
        }
        if(g.frozen){
          ctx.globalAlpha=0.32;
          ctx.fillStyle='#6fd8ff';
          ctx.beginPath();
          ctx.ellipse(g.x,foot-H*0.48,W*0.5,H*0.48,0,0,TAU);
          ctx.fill();
          ctx.globalAlpha=g.phased?0.5:1;
        }
        ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
        if(g.flash>0){
          ctx.globalCompositeOperation='lighter';
          ctx.globalAlpha=Math.min(0.6,g.flash*0.7);
          ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
          ctx.globalCompositeOperation='source-over';
          ctx.globalAlpha=g.phased?0.5:1;
        }
        ctx.restore();
        this.drawGuardTags&&this.drawGuardTags(g);
        return;
      }

      const base=g.r;
      ctx.save();
      ctx.translate(g.x,g.y);
      ctx.scale(sc,sc);
      ctx.globalAlpha=g.phased?0.48:1;
      this.shadow(0,base*0.95,base*0.95,0.22);
      this._bean(0,-base*0.08+bob,base*1.2,base*(g.elite?1.85:1.68),g.color||'#d8d0c0',{lw:7,seed:29,wob:2});
      ctx.fillStyle='#11100f';
      ctx.beginPath();
      ctx.arc(-base*0.22,-base*0.34+bob,base*0.075,0,TAU);
      ctx.arc(base*0.08,-base*0.34+bob,base*0.075,0,TAU);
      ctx.fill();
      if(g.flash>0){ ctx.globalAlpha=g.flash*0.62; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,base*1.08,0,TAU); ctx.fill(); }
      ctx.restore();
      this.drawGuardTags&&this.drawGuardTags(g);
      return;
    }
    return oldDrawGuard?oldDrawGuard.apply(this,arguments):undefined;
  };
})();

// === final activation v20: preload all runtime image assets before entry ===
(function(){
  if(typeof Game==='undefined') return;
  const uniq=list=>{
    const seen={}, out=[];
    for(const src of list||[]){
      const s=String(src||'').trim();
      if(!s||seen[s]) continue;
      seen[s]=1; out.push(s);
    }
    return out;
  };
  const seq=(a,b,fn)=>{ const out=[]; for(let i=a;i<=b;i++) out.push(fn(i)); return out; };
  const standardBeanMobAssets=()=>{
    const out=[];
    for(let act=1;act<=5;act++) for(let i=0;i<6;i++) out.push('/assets/mob/standard/act'+act+'/enemy_'+i+'.png?v=20260629_bean_mobs_v1');
    return out;
  };
  const relicNames=['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png'];
  const endlessEnemyNames=['crack_runner','screen_idol','iron_whistle','oil_monk','mist_librarian','cold_rim_guard','war_drum_leader','shattered_board_collector'];
  const endlessBossNames=['free_throw_executioner','broken_rim_stitcher','coldflame_scorekeeper','thunderbone_announcer','abyss_hoop_lord'];
  const runtimeImagesBase=[
    '/assets/ui/loading_splash_hoopbreaker.png',
    '/assets/ui/loading_splash_hoopbreaker.png?v=20260628_loading_splash_v1',
    '/assets/ui/login_panel_user.png',
    '/assets/ui/login_panel_user_trans.png',
    '/assets/atlas_base_clean_no_nodes_1704x786.webp',
    '/assets/background/home_bg_dark_1704x786.webp',
    '/assets/background/home_scene_flat_1704x786.webp',
    '/assets/final_bench_menu/final_bench_menu_full_flat_1704x786.webp',
    '/assets/hero_select/bg_clean.webp',
    '/assets/hero_select/sel_btn.webp',
    '/assets/host_guide/bean_demon_minimal_transparent_512.png',
    '/assets/host_guide/codex_bg_flat.webp',
    '/assets/character/hero_shadow_shooter.png',
    '/assets/decor/basketball_hoop_cluster.png',
    '/assets/decor/graffiti_dunk_or_die.png',
    '/assets/decor/skull_crowd_left.png',
    '/assets/decor/skull_crowd_right.png',
    '/assets/effects/flame_center.png',
    '/assets/logo/logo_english_purple.png',
    '/assets/logo/logo_zh_lime.png',
    '/assets/endless/endless_cracked_court.png',
    '/assets/endless/bg_iron_cage_stands.png',
    '/assets/endless/bg_coldflame_zone.png',
    '/assets/endless/bg_thunderbone_dome.png',
    '/assets/endless/bg_final_abyss_cathedral.png',
    '/assets/endless/boss_hoop_guardian.png',
    '/hero_shade.png','/hero_axer.png','/hero_elem.png','/hero_bone.png','/hero_archer.png','/hero_beast.png','/hero_whistle.png',
    '/hub_group.png','/icon-180.png','/icon-192.png','/icon-512.png'
  ]
    .concat(seq(1,5,i=>'/assets/battle/act'+i+'_bg.webp'))
    .concat(seq(1,5,i=>'/assets/stage'+i+'_route_base_1704x786.webp'))
    .concat(seq(1,5,i=>'/assets/mob/speed/act'+i+'.webp'))
    .concat(standardBeanMobAssets())
    .concat(endlessEnemyNames.map(n=>'/assets/endless/enemies/'+n+'.png'))
    .concat(endlessBossNames.map(n=>'/assets/endless/bosses/'+n+'.png'));

  Game.prototype._hbFullPreloadImages=function(){
    const relics=relicNames.map(name=>this._hbRelicUiUrl?this._hbRelicUiUrl(name):('/assets/relic_ui/'+name));
    return uniq(runtimeImagesBase.concat(relics));
  };

  const preloadLabel=src=>{
    if(src.includes('/relic_ui/')) return '載入聖物背包';
    if(src.includes('/endless/')) return '載入無盡深淵';
    if(src.includes('/mob/')) return '載入怪物圖';
    if(src.includes('/hero_')||src.includes('/hero_select/')) return '載入英雄圖';
    if(src.includes('/battle/')||src.includes('stage')||src.includes('atlas')||src.includes('/background/')||src.includes('/final_bench_menu/')||src.includes('/host_guide/')) return '載入場景圖';
    return '載入介面圖';
  };

  Game.prototype._preloadEntryAssets=async function(){
    if(!this._preloadImage) return;
    const st=this._assetLoading||{};
    if(this._hbFullPreloadDone){
      st.label='圖片已就緒'; st.detail='全部資源已載入'; st.progress=1;
      this.render&&this.render();
      return;
    }
    const list=this._hbFullPreloadImages?this._hbFullPreloadImages():[];
    const total=Math.max(1,list.length);
    let done=0, failed=0, idx=0;
    const loadOne=async(src)=>{
      st.label=preloadLabel(src);
      st.detail=(done+1)+' / '+total+' · '+((src.split('/').pop()||src).split('?')[0]);
      st.progress=Math.min(0.985,done/total);
      this.render&&this.render();
      let ok=false;
      try{ ok=await this._preloadImage(src); }
      catch(e){ try{ console.warn('[HB preload asset]',src,e); }catch(_e){} }
      if(!ok) failed++;
      done++;
      st.detail=done+' / '+total+(failed?(' · 跳過 '+failed+' 張'):'');
      st.progress=Math.min(0.995,done/total);
      this.render&&this.render();
    };
    const worker=async()=>{
      while(idx<list.length){
        const src=list[idx++];
        await loadOne(src);
      }
    };
    await Promise.all([worker(),worker(),worker(),worker()]);
    this._ensureLoadingSplash&&this._ensureLoadingSplash();
    this._preloadRelicUiAssets&&this._preloadRelicUiAssets();
    this._hbFullPreloadDone=true;
    st.label='準備開球';
    st.detail='已載入 '+done+' 張圖片'+(failed?('，跳過 '+failed+' 張'):'');
    st.progress=1;
    this.render&&this.render();
  };

  Game.prototype._bootPreloadAllAssets=async function(){
    if(this._hbBootPreloadPromise) return this._hbBootPreloadPromise;
    this._hbBootPreloadPromise=(async()=>{
      if(this._hbFullPreloadDone) return true;
      this._assetLoading={active:true,progress:0,label:'載入全部圖片',detail:'準備 Hoopbreaker'};
      this.render&&this.render();
      try{ await this._preloadEntryAssets(); }
      catch(e){ try{ console.warn('[HB boot preload]',e); }catch(_e){} }
      if(this._assetLoading){
        this._assetLoading.progress=1;
        this._assetLoading.label='載入完成';
        this._assetLoading.detail='進入遊戲';
        this.render&&this.render();
      }
      await new Promise(r=>setTimeout(r,160));
      this._assetLoading=null;
      this.render&&this.render();
      return true;
    })();
    return this._hbBootPreloadPromise;
  };
})();

// === final activation v23: approved bean art, spacing, and 7x6 RNG relic bases ===
(function(){
  if(typeof Game==='undefined') return;

  const ART_VER='20260629_bean_all_v2';
  const RELIC_VER='20260629_bean_relics_7x_v2';
  const mobUrl=p=>p+'?v='+ART_VER;
  const clampLocal=(v,a,b)=>Math.max(a,Math.min(b,v));
  const isStandardRun=run=>!!(run&&!run.endless&&!run.sandbag&&run.act>=1&&run.act<=5);
  const uniq=list=>{
    const seen={}, out=[];
    for(const src of list||[]){
      const s=String(src||'').trim();
      if(!s||seen[s]) continue;
      seen[s]=1; out.push(s);
    }
    return out;
  };

  if(typeof SANDBAGS!=='undefined'){
    for(let i=1;i<=5;i++) if(SANDBAGS[i]) SANDBAGS[i].file=mobUrl('/assets/mob/speed/act'+i+'.png');
  }

  const guardSpread=[
    {x:-610,y:148,s:1.24,layer:2},{x:-455,y:42,s:1.15,layer:1},{x:-292,y:166,s:1.22,layer:2},
    {x:-540,y:-86,s:1.02,layer:0},{x:-345,y:-140,s:1.00,layer:0},{x:-140,y:-84,s:1.04,layer:0},
    {x:86,y:-92,s:1.02,layer:0},{x:286,y:28,s:1.14,layer:1},{x:418,y:156,s:1.22,layer:2},
    {x:-690,y:12,s:1.10,layer:1},{x:-40,y:204,s:1.17,layer:2},{x:188,y:116,s:1.12,layer:2},
    {x:540,y:-38,s:1.06,layer:0},{x:612,y:92,s:1.14,layer:1}
  ];
  const previousSpawnGuard=Game.prototype.spawnGuard;
  Game.prototype.spawnGuard=function(type){
    const g=previousSpawnGuard.apply(this,arguments);
    const run=this.run, host=run&&run.host;
    if(!g||g.sandbag||!run||!host) return g;
    const slot=guardSpread[(g.slot||0)%guardSpread.length];
    const cycle=Math.floor((g.slot||0)/guardSpread.length);
    const dir=(this.save&&this.save.settings&&this.save.settings.lefty)?-1:1;
    const wave=((cycle%2)?54:-36)*(1+Math.min(3,cycle)*0.28);
    g.bx=slot.x*dir+wave*dir;
    g.by=slot.y+((cycle%3)-1)*24;
    g.layer=slot.layer;
    g.drawScale=slot.s*(g.elite?1.18:1);
    g.x=clampLocal(host.x+g.bx,72,BW-72);
    g.y=clampLocal(host.baseY+g.by,BH*0.24,BH-82);
    return g;
  };

  const previousDrawGuard=Game.prototype.drawGuard;
  Game.prototype.drawGuard=function(g){
    const run=this.run;
    if(isStandardRun(run)&&g&&!g.dead){
      const ctx=this.ctx, im=this._standardBeanMobSpriteFor&&this._standardBeanMobSpriteFor(g);
      if(!im||!im.complete||!im.naturalWidth||im._err) return;
      const sc=(g.drawScale||1)*(g.elite?1.13:1);
      const bob=Math.sin((this.t||0)*2.1+(g.slot||0))*3;
      const foot=g.y+g.r*0.82;
      const rawH=g.r*(g.elite?5.85:5.28)*sc;
      const H=Math.min(Math.max(rawH,g.elite?238:186),BH*(g.elite?0.38:0.33));
      const W=H*im.naturalWidth/im.naturalHeight;
      const rim=g.elite?'#ffe14d':'rgba(160,255,48,0.78)';
      ctx.save();
      ctx.globalAlpha=g.phased?0.5:1;
      const sh=ctx.createRadialGradient(g.x,foot-4,8,g.x,foot-4,W*0.58);
      sh.addColorStop(0,'rgba(0,0,0,0.52)');
      sh.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sh;
      ctx.beginPath();
      ctx.ellipse(g.x,foot-4,W*0.50,H*0.08,0,0,TAU);
      ctx.fill();
      ctx.save();
      ctx.globalAlpha=g.phased?0.28:0.66;
      ctx.filter='brightness(0) opacity(0.98)';
      const outline=Math.max(4,H*0.028);
      ctx.drawImage(im,g.x-W/2-outline,foot+bob-H,W,H);
      ctx.drawImage(im,g.x-W/2+outline,foot+bob-H,W,H);
      ctx.drawImage(im,g.x-W/2,foot+bob-H-outline,W,H);
      ctx.drawImage(im,g.x-W/2,foot+bob-H+outline,W,H);
      ctx.restore();
      ctx.save();
      ctx.shadowColor=rim;
      ctx.shadowBlur=H*(g.elite?0.18:0.12);
      ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
      ctx.restore();
      ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
      if(g.frozen){
        ctx.globalAlpha=0.32;
        ctx.fillStyle='#6fd8ff';
        ctx.beginPath();
        ctx.ellipse(g.x,foot-H*0.48,W*0.5,H*0.48,0,0,TAU);
        ctx.fill();
        ctx.globalAlpha=1;
      }
      if(g.flash>0){
        ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=Math.min(0.66,g.flash*0.75);
        ctx.drawImage(im,g.x-W/2,foot+bob-H,W,H);
      }
      ctx.restore();
      this.drawGuardTags&&this.drawGuardTags(g);
      return;
    }
    return previousDrawGuard?previousDrawGuard.apply(this,arguments):undefined;
  };

  Game.prototype._hbChapterBossImg=function(act){
    this._hbChapterBossImgs=this._hbChapterBossImgs||{};
    const key='act'+act+'_'+ART_VER;
    if(this._hbChapterBossImgs[key]!==undefined) return this._hbChapterBossImgs[key];
    try{
      const im=new Image();
      im.onerror=()=>{ im._err=true; };
      im.onload=()=>{ try{ if(this.screen==='battle'&&this.render) this.render(); }catch(_e){} };
      im.src=mobUrl('/assets/mob/bosses/act'+act+'.png');
      this._hbChapterBossImgs[key]=im;
      return im;
    }catch(e){
      this._hbChapterBossImgs[key]=null;
      return null;
    }
  };
  Game.prototype._hbDrawChapterBossArt=function(){
    const run=this.run, host=run&&run.host;
    if(!run||!host||run.endless||run.sandbag||!run.stage||!run.stage.boss) return false;
    const im=this._hbChapterBossImg(run.act);
    if(!im||!im.complete||!im.naturalWidth||im._err) return false;
    const ctx=this.ctx, nw=im.naturalWidth, nh=im.naturalHeight;
    let H=BH*0.78, W=H*nw/nh;
    if(W>BW*0.52){ W=BW*0.52; H=W*nh/nw; }
    const cx=host.x, by=BH-12;
    ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,32,cx,by-H*0.48,W*0.76);
    glow.addColorStop(0,'rgba(185,255,47,0.20)');
    glow.addColorStop(0.54,'rgba(126,60,190,0.13)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.ellipse(cx,by-H*0.46,W*0.66,H*0.56,0,0,TAU);
    ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.48);
    sh.addColorStop(0,'rgba(0,0,0,0.62)');
    sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh;
    ctx.beginPath();
    ctx.ellipse(cx,by-8,W*0.46,H*0.08,0,0,TAU);
    ctx.fill();
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run._mobHitFlash>0){
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(0.48,run._mobHitFlash*0.68);
      ctx.drawImage(im,cx-W/2,by-H,W,H);
    }
    ctx.restore();
    return true;
  };
  const previousDrawHostAndHoop=Game.prototype.drawHostAndHoop;
  Game.prototype.drawHostAndHoop=function(){
    this._hbDrawChapterBossArt&&this._hbDrawChapterBossArt();
    return previousDrawHostAndHoop?previousDrawHostAndHoop.apply(this,arguments):undefined;
  };

  const enemyMeta={
    crack_runner:{src:mobUrl('/assets/endless/enemies/crack_runner.png'),color:'#9fe024',scale:1.20},
    screen_idol:{src:mobUrl('/assets/endless/enemies/screen_idol.png'),color:'#d7a945',scale:1.38},
    iron_whistle:{src:mobUrl('/assets/endless/enemies/iron_whistle.png'),color:'#ffe14d',scale:1.15},
    oil_monk:{src:mobUrl('/assets/endless/enemies/oil_monk.png'),color:'#6fbe30',scale:1.28},
    mist_librarian:{src:mobUrl('/assets/endless/enemies/mist_librarian.png'),color:'#b980ff',scale:1.20},
    cold_rim_guard:{src:mobUrl('/assets/endless/enemies/cold_rim_guard.png'),color:'#6fd8ff',scale:1.28},
    war_drum_leader:{src:mobUrl('/assets/endless/enemies/war_drum_leader.png'),color:'#ffb34d',scale:1.30},
    shattered_board_collector:{src:mobUrl('/assets/endless/enemies/shattered_board_collector.png'),color:'#d8ff44',scale:1.22}
  };
  Game.prototype.drawEndlessGuard=function(g){
    if(this.run&&this.run.stage&&this.run.stage.boss) return;
    const id=(g&&g.endlessEnemyId)||'crack_runner';
    const info=enemyMeta[id]||enemyMeta.crack_runner;
    const im=this._endlessImg?this._endlessImg('enemy_'+id+'_'+ART_VER,info.src):null;
    if(!g||!im||!im.complete||!im.naturalWidth||im._err) return;
    const ctx=this.ctx, base=g.r||28, bob=Math.sin((this.t||0)*2.4+(g.slot||0))*4;
    const scale=(g.drawScale||1)*(info.scale||1)*(g.elite?1.14:1);
    let H=Math.min(Math.max(base*(g.elite?5.58:5.02)*scale,g.elite?238:186),BH*(g.elite?0.38:0.33));
    let W=H*im.naturalWidth/im.naturalHeight;
    const maxW=base*(g.elite?7.7:6.6)*scale;
    if(W>maxW){ W=maxW; H=W*im.naturalHeight/im.naturalWidth; }
    const x=-W/2, y=bob+base*1.08-H;
    const rim=g.endlessAffixColor||g.endlessColor||info.color||'#9fe024';
    ctx.save();
    ctx.translate(g.x,g.y);
    ctx.globalAlpha=g.phased?0.48:1;
    this.shadow(0,base*0.96,base*1.22,0.30);
    const glow=ctx.createRadialGradient(0,bob-base*0.45,4,0,bob-base*0.45,Math.max(base*2.9,W*0.72));
    glow.addColorStop(0,g.endlessAffix?'rgba(255,225,77,0.25)':'rgba(155,255,50,0.22)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.arc(0,bob-base*0.4,Math.max(base*2.45,W*0.60),0,TAU);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha=g.phased?0.30:0.68;
    ctx.filter='brightness(0) opacity(0.98)';
    const outline=Math.max(4,H*0.028);
    ctx.drawImage(im,x-outline,y,W,H);
    ctx.drawImage(im,x+outline,y,W,H);
    ctx.drawImage(im,x,y-outline,W,H);
    ctx.drawImage(im,x,y+outline,W,H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha=g.phased?0.36:0.88;
    ctx.shadowColor=rim;
    ctx.shadowBlur=H*(g.elite?0.18:0.13);
    ctx.drawImage(im,x,y,W,H);
    ctx.restore();
    ctx.drawImage(im,x,y,W,H);
    if(g.flash>0){
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(0.66,g.flash*0.75);
      ctx.drawImage(im,x,y,W,H);
      ctx.globalCompositeOperation='source-over';
      ctx.globalAlpha=1;
    }
    if(g.shieldUp){
      ctx.lineWidth=4;
      ctx.strokeStyle='rgba(215,169,69,0.88)';
      ctx.beginPath();
      ctx.ellipse(0,bob-base*0.45,W*0.48,H*0.45,0,0,TAU);
      ctx.stroke();
    }
    if(g.endlessAffix){
      const col=g.endlessAffixColor||'#ffe14d';
      ctx.save();
      ctx.translate(0,y-18);
      this.rr(-24,-16,48,32,10);
      ctx.fillStyle='rgba(9,6,5,0.88)';
      ctx.fill();
      ctx.lineWidth=2.4;
      ctx.strokeStyle=col;
      ctx.stroke();
      this.text(g.endlessAffixShort||'!',0,2,20,col,{align:'center',baseline:'middle',weight:'900',glow:8});
      ctx.restore();
      if(g.endlessCountdown>0) this.text(Math.ceil(g.endlessCountdown),0,y+22,18,'#ff6a4a',{align:'center',baseline:'middle',weight:'900'});
    }
    ctx.restore();
    this.drawGuardTags&&this.drawGuardTags(g);
  };

  const endlessBosses=[
    {limit:5,key:'free_throw_executioner',src:mobUrl('/assets/endless/bosses/free_throw_executioner.png')},
    {limit:10,key:'broken_rim_stitcher',src:mobUrl('/assets/endless/bosses/broken_rim_stitcher.png')},
    {limit:15,key:'coldflame_scorekeeper',src:mobUrl('/assets/endless/bosses/coldflame_scorekeeper.png')},
    {limit:20,key:'thunderbone_announcer',src:mobUrl('/assets/endless/bosses/thunderbone_announcer.png')},
    {limit:Infinity,key:'abyss_hoop_lord',src:mobUrl('/assets/endless/bosses/abyss_hoop_lord.png')}
  ];
  Game.prototype._endlessBossSprite=function(depth){
    depth=Math.max(1,Number(depth)||1);
    return endlessBosses.find(b=>depth<=b.limit)||endlessBosses[endlessBosses.length-1];
  };
  Game.prototype.drawEndlessBossArt=function(){
    const run=this.run, boss=this._endlessBossSprite(run&&run.endlessDepth);
    const im=this._endlessImg?this._endlessImg('boss_'+boss.key+'_'+ART_VER,boss.src):null;
    if(!im||!im.complete||!im.naturalWidth||im._err) return;
    const ctx=this.ctx, nw=im.naturalWidth, nh=im.naturalHeight;
    let H=BH*0.82, W=H*nw/nh;
    if(W>BW*0.68){ W=BW*0.68; H=W*nh/nw; }
    const cx=BW*0.67, by=BH-10;
    ctx.save();
    const glow=ctx.createRadialGradient(cx,by-H*0.48,30,cx,by-H*0.48,W*0.76);
    glow.addColorStop(0,'rgba(160,255,48,0.26)');
    glow.addColorStop(0.58,'rgba(100,255,36,0.10)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.ellipse(cx,by-H*0.45,W*0.66,H*0.56,0,0,TAU);
    ctx.fill();
    const sh=ctx.createRadialGradient(cx,by-8,20,cx,by-8,W*0.46);
    sh.addColorStop(0,'rgba(0,0,0,0.62)');
    sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh;
    ctx.beginPath();
    ctx.ellipse(cx,by-8,W*0.44,H*0.08,0,0,TAU);
    ctx.fill();
    ctx.drawImage(im,cx-W/2,by-H,W,H);
    if(run&&run._mobHitFlash>0){
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(0.48,run._mobHitFlash*0.68);
      ctx.drawImage(im,cx-W/2,by-H,W,H);
    }
    ctx.restore();
  };

  const relicTypes={
    ball:{label:'籃球',sheet:'icons_balls.png',cls:'core',names:['冠軍金球','冷焰籃球','燼鏈戰球','深淵紫球','碎玻璃球','毒裂籃球','幸運空心球'],forms:['normal','ice','fire','lightning','arrow','axe','normal']},
    wrist:{label:'護腕',sheet:'icons_wrist.png',cls:'feel',names:['骨哨護腕','鐵鏈護腕','黏油護腕','血紅腕帶','雷骨腕甲','霜封護腕','冠軍腕甲']},
    shoes:{label:'球鞋',sheet:'icons_shoes.png',cls:'feel',names:['羽翼疾鞋','鐵底球鞋','霜步球鞋','燼火鞋','影步鞋','荊棘戰靴','遠投金靴']},
    charm:{label:'護符',sheet:'icons_charms.png',cls:'oath',names:['骷髏墜飾','深淵護符','幸運框牌','碎鏡吊墜','綠焰符牌','裁判哨符','小王冠印']},
    mask:{label:'面具',sheet:'icons_masks.png',cls:'feel',names:['裁判面罩','影客兜帽','冷焰骨面','教練骨面','血戰面甲','毒沼面具','王冠金面']},
    hoop:{label:'籃框',sheet:'icons_hoops.png',cls:'oath',names:['破金籃框','鎖鏈鐵框','深淵紫框','冷焰冰框','黏油毒框','燼火紅框','骷髏冠框']}
  };
  const relicOrder=['ball','wrist','shoes','charm','mask','hoop'];
  const baseDesc='基底外觀固定；實際掉落強度、品質、素質與詞綴由 RNG 決定。';
  const visualById={
    abbey_ember:['ball',2],sand_bow:['ball',4],citadel_battery:['ball',3],red_axe:['hoop',5],final_chill:['ball',1],
    ember_saint:['charm',4],iron_hook:['hoop',1],coldflame_tesla:['ball',1],thunderbone:['wrist',4],absolute_zero:['ball',1],
    broken_glass:['ball',4],deadeye_sigil:['mask',0],kings_seal:['mask',6],blood_chalice:['charm',0],hex_idol:['charm',1],
    pilgrim_bone:['charm',0],rift_feather:['shoes',0],champ_ball:['ball',0],bench_towel:['wrist',3],ref_glasses:['mask',0],board_brace:['wrist',6]
  };
  if(typeof RELICS!=='undefined'){
    for(const type of relicOrder){
      const info=relicTypes[type];
      for(let i=0;i<7;i++){
        const id='hb_'+type+'_'+i;
        visualById[id]=[type,i];
        const relic=RELICS[id]||{};
        relic.name=info.names[i];
        relic.cls=info.cls;
        relic.equipType=type;
        if(info.forms) relic.form=info.forms[i];
        relic.desc=relic.desc||baseDesc;
        RELICS[id]=relic;
      }
    }
  }
  Game.prototype._hbRelicUiUrl=function(name){ return '/assets/relic_ui/'+name+'?v='+RELIC_VER; };
  Game.prototype._relicUiImg=function(name){
    this._relicUi=this._relicUi||{};
    const key=name+'?v='+RELIC_VER;
    if(this._relicUi[key]!==undefined) return this._relicUi[key];
    try{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ try{ if(this._bag||this._relicCompare||this.screen==='relics') this.render(); }catch(_e){} };
      im.onerror=()=>{ im._err=true; };
      im.src=this._hbRelicUiUrl(name);
      this._relicUi[key]=im;
      return im;
    }catch(e){
      this._relicUi[key]=null;
      return null;
    }
  };
  Game.prototype._preloadRelicUiAssets=function(){
    for(const name of ['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png']) this._relicUiImg(name);
  };
  Game.prototype._relicVisual=function(rid){
    if(visualById[rid]) return {type:visualById[rid][0],idx:visualById[rid][1]};
    const R=(typeof RELICS!=='undefined'&&RELICS[rid])||{};
    if(R.equipType&&relicTypes[R.equipType]) return {type:R.equipType,idx:0};
    if(R.form) return {type:'ball',idx:({fire:2,ice:1,lightning:3,arrow:4,axe:5,normal:6}[R.form]||0)};
    if(R.cls==='oath') return {type:'charm',idx:1};
    if(R.cls==='feel') return {type:'wrist',idx:0};
    return {type:'hoop',idx:0};
  };
  Game.prototype._allRelicCatalog=function(){
    const out=[];
    for(const type of relicOrder){
      const info=relicTypes[type];
      for(let i=0;i<7;i++) out.push({catalog:true,id:'cat_'+type+'_'+i,type,idx:i,name:info.names[i],core:info.label,tier:i%5,tab:info.label});
    }
    return out;
  };
  Game.prototype._relicDisplay=function(rid,owned){
    const R=(typeof RELICS!=='undefined'&&RELICS[rid])||{};
    const v=this._relicVisual(rid);
    const info=relicTypes[v.type]||relicTypes.ball;
    const meta=owned&&this._relicMeta?this._relicMeta(rid):null;
    return {
      id:rid,
      name:R.name||info.names[v.idx%7]||info.label,
      type:v.type,
      idx:v.idx%7,
      cls:R.cls||info.cls,
      core:info.label,
      desc:R.desc||baseDesc,
      tier:meta?meta.tier:0,
      q:meta?meta.q:0,
      lvl:meta?Math.max(0,Number(meta.lvl)||0):0,
      forgeCount:meta?Math.max(0,Number(meta.forgeCount)||0):0,
      affixes:meta&&Array.isArray(meta.affixes)?meta.affixes:[]
    };
  };

  const previousFullPreload=Game.prototype._hbFullPreloadImages;
  Game.prototype._hbFullPreloadImages=function(){
    const base=(previousFullPreload?previousFullPreload.call(this):[]).filter(src=>{
      const s=String(src||'');
      if(/\/assets\/mob\/speed\/act\d+\.webp/.test(s)) return false;
      if(s.includes('/assets/endless/boss_hoop_guardian.png')) return false;
      return true;
    });
    const add=[];
    for(let i=1;i<=5;i++){
      add.push(mobUrl('/assets/mob/speed/act'+i+'.png'));
      add.push(mobUrl('/assets/mob/bosses/act'+i+'.png'));
    }
    for(let act=1;act<=5;act++) for(let i=0;i<6;i++) add.push('/assets/mob/standard/act'+act+'/enemy_'+i+'.png?v=20260629_bean_mobs_v1');
    for(const key of Object.keys(enemyMeta)) add.push(enemyMeta[key].src);
    for(const boss of endlessBosses) add.push(boss.src);
    for(const name of ['backpack_bg.png','compare_modal.png','icons_balls.png','icons_wrist.png','icons_shoes.png','icons_charms.png','icons_masks.png','icons_hoops.png','icons_mixed.png']) add.push(this._hbRelicUiUrl?this._hbRelicUiUrl(name):('/assets/relic_ui/'+name));
    return uniq(base.concat(add));
  };
})();

// === final activation v24: keep hoop above monsters with subtle gold aura ===
(function(){
  if(typeof Game==='undefined') return;

  Game.prototype._hbDrawForegroundHoop=function(){
    const run=this.run, H=run&&run.hoop;
    if(!run||!H) return;
    const ctx=this.ctx, A=(typeof ACTS!=='undefined'&&ACTS[run.act-1])||{}, rx=H.rimR||64, rt=H.rimThick||9;
    const lit=H.lit||0, glow=H.glow||0;
    const boardW=Math.max((H.boardW||20)+24,34), boardH=(H.boardH||180)+22;
    const bx=H.x+rx+4, by=H.y-boardH*0.5;
    const topL=H.x-rx, topR=H.x+rx, netH=H.netH||84;
    const botHalf=rx*0.5, sway=(H.net||0)*Math.sin((this.t||0)*16);
    const botL=H.x-botHalf+sway, botR=H.x+botHalf+sway, botY=H.y+netH;

    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const aura=ctx.createRadialGradient(H.x,H.y+netH*0.28,8,H.x,H.y+netH*0.28,rx*2.45);
    aura.addColorStop(0,'rgba(255,226,150,'+(0.16+lit*0.12)+')');
    aura.addColorStop(0.45,'rgba(215,169,69,'+(0.10+glow*0.12)+')');
    aura.addColorStop(1,'rgba(215,169,69,0)');
    ctx.fillStyle=aura;
    ctx.beginPath();
    ctx.ellipse(H.x,H.y+netH*0.28,rx*1.95,netH*1.28,0,0,TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor='rgba(215,169,69,0.48)';
    ctx.shadowBlur=18+glow*18;
    this.rr(bx,by,boardW,boardH,11);
    const bg=ctx.createLinearGradient(bx,by,bx+boardW,by+boardH);
    bg.addColorStop(0,'rgba(50,40,52,0.95)');
    bg.addColorStop(1,'rgba(22,18,28,0.96)');
    ctx.fillStyle=bg;
    ctx.fill();
    ctx.lineWidth=4;
    ctx.strokeStyle='rgba(215,169,69,0.72)';
    this.rr(bx,by,boardW,boardH,11);
    ctx.stroke();
    ctx.shadowBlur=0;
    ctx.lineWidth=2;
    ctx.strokeStyle='rgba(255,232,178,'+(0.35+glow*0.35)+')';
    this.rr(bx+6,by+6,boardW-12,boardH-12,7);
    ctx.stroke();
    ctx.globalAlpha=0.45+glow*0.45;
    ctx.strokeStyle=A.rune||'#d7a945';
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.arc(bx+boardW/2,H.y,11,0,TAU);
    ctx.stroke();
    ctx.restore();

    const pr=rx+22+Math.sin((this.t||0)*2)*4;
    const rg=ctx.createRadialGradient(H.x,H.y,8,H.x,H.y,pr*1.55);
    rg.addColorStop(0,'rgba(255,180,90,'+(0.30+lit*0.36)+')');
    rg.addColorStop(0.62,'rgba(215,169,69,0.10)');
    rg.addColorStop(1,'rgba(215,169,69,0)');
    ctx.save();
    ctx.fillStyle=rg;
    ctx.beginPath();
    ctx.arc(H.x,H.y,pr*1.55,0,TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topL,H.y);
    ctx.lineTo(topR,H.y);
    ctx.lineTo(botR,botY);
    ctx.lineTo(botL,botY);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle='rgba(255,246,224,'+(0.72+lit*0.20)+')';
    ctx.lineWidth=2.2;
    const step=20;
    for(let xx=topL-netH;xx<topR+netH;xx+=step){
      ctx.beginPath();
      ctx.moveTo(xx,H.y-6);
      ctx.lineTo(xx+netH,botY+6);
      ctx.stroke();
    }
    for(let xx=topL-netH;xx<topR+netH;xx+=step){
      ctx.beginPath();
      ctx.moveTo(xx,H.y-6);
      ctx.lineTo(xx-netH,botY+6);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle='rgba(255,248,226,'+(0.74+lit*0.18)+')';
    ctx.lineWidth=2.6;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(topL,H.y);
    ctx.lineTo(botL,botY);
    ctx.moveTo(topR,H.y);
    ctx.lineTo(botR,botY);
    ctx.moveTo(botL,botY);
    ctx.lineTo(botR,botY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.lineCap='round';
    ctx.shadowColor='rgba(215,169,69,0.72)';
    ctx.shadowBlur=16+glow*24;
    ctx.lineWidth=rt*2+6;
    ctx.strokeStyle='#150f0a';
    ctx.beginPath();
    ctx.moveTo(topL,H.y);
    ctx.lineTo(topR,H.y);
    ctx.stroke();
    ctx.lineWidth=rt*2;
    ctx.strokeStyle=lit>0.3?'#ffe0a2':'#ff933f';
    ctx.beginPath();
    ctx.moveTo(topL,H.y);
    ctx.lineTo(topR,H.y);
    ctx.stroke();
    ctx.shadowBlur=0;
    ctx.lineWidth=2.6;
    ctx.strokeStyle='rgba(255,245,210,'+(0.58+lit*0.34)+')';
    ctx.beginPath();
    ctx.moveTo(topL+6,H.y-rt*0.55);
    ctx.lineTo(topR-6,H.y-rt*0.55);
    ctx.stroke();
    for(const ex of [topL,topR]){
      ctx.beginPath();
      ctx.arc(ex,H.y,rt+3,0,TAU);
      ctx.fillStyle='#ffcaa0';
      ctx.fill();
      ctx.lineWidth=3.6;
      ctx.strokeStyle='#0e0d0c';
      ctx.stroke();
      ctx.lineWidth=1.8;
      ctx.strokeStyle='rgba(255,236,175,0.88)';
      ctx.stroke();
    }
    ctx.restore();
  };

  const previousBattle=Game.prototype.drawBattle;
  Game.prototype.drawBattle=function(){
    const ctx=this.ctx, run=this.run;
    if(!run) return previousBattle.apply(this,arguments);
    const bg=this._ensureBattleBg&&this._ensureBattleBg(run.act);
    const hasBg=!!(bg&&bg.complete&&bg.naturalWidth&&!bg._err);
    if(hasBg){ this._coverImg(bg,0,0,BW,BH); }
    ctx.save();
    const cz=this.cam.zoom;
    ctx.translate(BW/2,BH);
    ctx.scale(cz,cz);
    ctx.translate(-BW/2,-BH+this.cam.y);
    if(run.shake>0&&!this.save.settings.reduceMotion) ctx.translate(rand(-run.shake,run.shake),rand(-run.shake,run.shake));
    if(!hasBg) this.backdrop(ACTS[run.act-1].key);
    this.drawCourt();
    this.drawEnemyTableauBackdrop();
    if(run.sandbag) this.drawSandbag(); else this.drawMobGroup();
    const ordered=[...run.guards].filter(g=>!g.dead).sort((a,b)=>(a.layer||0)-(b.layer||0)||a.y-b.y);
    for(const g of ordered){ if((g.layer||0)<=0) this.drawGuard(g); }
    this.drawHostAndHoop();
    for(const g of ordered){ if((g.layer||0)>0) this.drawGuard(g); }
    this.drawEliteTelegraphs();
    this.drawBossThreat();
    this.drawBattleFx();
    this.drawHeroPlayer();
    this.drawBall();
    this.drawAim();
    this._hbDrawForegroundHoop();
    ctx.restore();
    this.drawFx();
    this.drawBallIndicator();
    if(run.hitFlash>0){
      const a=clamp(run.hitFlash,0,1)*0.5;
      const g=ctx.createRadialGradient(BW/2,BH/2,BH*0.3,BW/2,BH/2,BW*0.7);
      g.addColorStop(0,'rgba(196,52,42,0)');
      g.addColorStop(1,'rgba(196,52,42,'+a+')');
      ctx.fillStyle=g;
      ctx.fillRect(0,0,BW,BH);
    }
    if(run._scoreFlash>0){
      const a=clamp(run._scoreFlash,0,1)*0.4;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      const gf=ctx.createRadialGradient(BW/2,BH*0.4,BH*0.1,BW/2,BH*0.4,BW*0.6);
      gf.addColorStop(0,'rgba(255,220,140,'+a+')');
      gf.addColorStop(1,'rgba(255,200,100,0)');
      ctx.fillStyle=gf;
      ctx.fillRect(0,0,BW,BH);
      ctx.restore();
    }
    this.drawHUD();
    if(run.speed) this.drawSpeedHUD(); else this.drawMobBars();
    if(run.banner) this.drawBanner();
    if(run.tutorial) this.drawTutorial();
    if(run.modal) this.drawModal();
    if(this._detailOpen) this.drawHeroDetail();
    if(this._paused) this.drawPause();
  };
})();

// === final activation v27: last-write bold monster status text ===
(function(){
  if(typeof Game==='undefined') return;

  const META={
    fire:{text:'燃燒',color:'#ff6a2f',key:'burn'},
    burn:{text:'燃燒',color:'#ff6a2f',key:'burn'},
    ice:{text:'冰凍',color:'#6fd8ff',key:'freeze'},
    freeze:{text:'冰凍',color:'#6fd8ff',key:'freeze'},
    frozen:{text:'冰凍',color:'#6fd8ff',key:'freeze'},
    lightning:{text:'閃電',color:'#ffe14d',key:'lightning'},
    shock:{text:'感電',color:'#ffe14d',key:'shock'},
    poison:{text:'中毒',color:'#8cff37',key:'poison'},
    venom:{text:'中毒',color:'#8cff37',key:'poison'},
    bleed:{text:'流血',color:'#ff4d59',key:'bleed'},
    breakShield:{text:'破盾',color:'#f0d49a',key:'breakShield'},
    block:{text:'格擋',color:'#d8cfb8',key:'block'},
    mirror:{text:'鏡框反射',color:'#8fe8ff',key:'mirror'},
    coldrim:{text:'寒框鎖定',color:'#6fd8ff',key:'coldrim'},
    lockrim:{text:'鎖框',color:'#d8ff44',key:'lockrim'},
    greed:{text:'貪分',color:'#c89bff',key:'greed'},
    debt:{text:'收債',color:'#ffb34d',key:'debt'},
    crown:{text:'深淵冠冕',color:'#ffe14d',key:'crown'},
    countdown:{text:'倒數懲罰',color:'#ff6a4a',key:'countdown'}
  };
  const stampNow=()=> (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  const statusOn=(g,names)=>!!g&&names.some(n=>(Number(g[n])||0)>0||g[n]===true);
  const statusSnap=g=>({
    hp:g?Number(g.hp)||0:0,
    shield:!!(g&&g.shieldUp),
    mirror:Number(g&&g.endlessMirror)||0,
    burn:Number(g&&g.burn)||0,
    frozen:!!(g&&g.frozen),
    freeze:Number(g&&g.freeze)||0,
    poison:statusOn(g,['poison','venom','toxic','poisoned']),
    bleed:statusOn(g,['bleed','bleeding'])
  });

  Game.prototype._hbMonsterStatusText=function(g,type,opts){
    if(!g||(g.dead&&!(opts&&opts.allowDead))) return;
    const meta=META[type]||{text:String(type||''),color:'#ffe7a6',key:String(type||'status')};
    if(!meta.text) return;
    const now=stampNow(), key=meta.key||type, cooldown=(opts&&opts.cooldown!=null)?opts.cooldown:520;
    g._hbStatusStamp=g._hbStatusStamp||{};
    if(g._hbStatusStamp[key]&&now-g._hbStatusStamp[key]<cooldown) return;
    g._hbStatusStamp[key]=now;
    const elite=!!(g.elite||g.endlessAffix), base=Number(g.r)||30;
    const size=(opts&&opts.size)||Math.round(elite?54:47);
    const jitter=(opts&&opts.jitterX!=null)?opts.jitterX:22;
    const x=(Number(g.x)||BW/2)+(Math.random()*2-1)*jitter;
    const y=(Number(g.y)||BH/2)-Math.max(base*1.28,52)-((opts&&opts.lift)||0);
    this._hbStatusFloaters=this._hbStatusFloaters||[];
    this._hbStatusFloaters.push({
      x,y,
      text:meta.text,
      color:meta.color,
      size,
      t:(opts&&opts.t)||1.08,
      t0:(opts&&opts.t)||1.08,
      vx:(Math.random()*2-1)*18,
      vy:(opts&&opts.vy)||-62,
      wob:Math.random()*TAU,
      big:true
    });
    if(this._hbStatusFloaters.length>48) this._hbStatusFloaters.splice(0,this._hbStatusFloaters.length-48);
  };

  Game.prototype._hbStatusDiffPop=function(g,before,ctxType){
    if(!g||!before) return;
    const after=statusSnap(g);
    if(before.shield&&!after.shield) this._hbMonsterStatusText(g,'breakShield',{size:52,cooldown:120});
    else if(before.shield&&after.shield&&after.hp>=before.hp) this._hbMonsterStatusText(g,'block',{size:46,cooldown:260});
    if(after.burn>before.burn+0.05) this._hbMonsterStatusText(g,'burn',{size:50,cooldown:320});
    if((after.frozen&&!before.frozen)||(after.freeze>before.freeze+0.05)) this._hbMonsterStatusText(g,'freeze',{size:52,cooldown:260});
    if(after.poison&&!before.poison) this._hbMonsterStatusText(g,'poison',{size:50,cooldown:260});
    if(after.bleed&&!before.bleed) this._hbMonsterStatusText(g,'bleed',{size:48,cooldown:260});
    if(ctxType==='fire') this._hbMonsterStatusText(g,'burn',{size:50,cooldown:420});
    else if(ctxType==='ice') this._hbMonsterStatusText(g,'freeze',{size:52,cooldown:420});
    else if(ctxType==='lightning') this._hbMonsterStatusText(g,'lightning',{size:52,cooldown:320});
  };

  const wrapElement=(name,type)=>{
    const old=Game.prototype[name];
    if(!old||old._hbStatusWrappedLast) return;
    const wrapped=function(c){
      const prev=this._hbElementTextContext;
      this._hbElementTextContext=type;
      try{ return old.apply(this,arguments); }
      finally{ this._hbElementTextContext=prev; }
    };
    wrapped._hbStatusWrappedLast=true;
    Game.prototype[name]=wrapped;
  };
  wrapElement('formFire','fire');
  wrapElement('formIce','ice');
  wrapElement('formLightning','lightning');

  const oldHurt=Game.prototype.hurtGuard;
  if(oldHurt&&!oldHurt._hbStatusWrappedLast){
    const wrappedHurt=function(g,dmg,c,primary){
      const before=statusSnap(g), run=this.run;
      const mirrorBefore=!!(run&&run.endless&&g&&Number(g.endlessMirror)>0);
      const ctxType=this._hbElementTextContext||null;
      const r=oldHurt.apply(this,arguments);
      if(g){
        this._hbStatusDiffPop(g,before,ctxType);
        if(mirrorBefore&&Number(g.endlessMirror||0)<=0) this._hbMonsterStatusText(g,'mirror',{size:54,cooldown:120});
        if(run&&run.endless&&g.endlessFreezeHoop) this._hbMonsterStatusText(g,'coldrim',{size:47,cooldown:850});
        if(run&&run.endless&&g.endlessLocksHoop) this._hbMonsterStatusText(g,'lockrim',{size:47,cooldown:850});
        if((before.burn>0)&&!(c&&c.hx!=null)) this._hbMonsterStatusText(g,'burn',{size:42,cooldown:850});
      }
      return r;
    };
    wrappedHurt._hbStatusWrappedLast=true;
    Game.prototype.hurtGuard=wrappedHurt;
  }

  const oldShared=Game.prototype._applySharedSkillEffects;
  if(oldShared&&!oldShared._hbStatusWrappedLast){
    const wrappedShared=function(ctx){
      const run=this.run, before=new Map();
      if(run&&Array.isArray(run.guards)) for(const g of run.guards) before.set(g,statusSnap(g));
      const r=oldShared.apply(this,arguments);
      if(run&&Array.isArray(run.guards)) for(const g of run.guards){ const b=before.get(g); if(b) this._hbStatusDiffPop(g,b,null); }
      return r;
    };
    wrappedShared._hbStatusWrappedLast=true;
    Game.prototype._applySharedSkillEffects=wrappedShared;
  }

  const oldRelic=Game.prototype.relicOnBasket;
  if(oldRelic&&!oldRelic._hbStatusWrappedLast){
    const wrappedRelic=function(swish,bank,ctx){
      const run=this.run, before=new Map();
      if(run&&Array.isArray(run.guards)) for(const g of run.guards) before.set(g,statusSnap(g));
      const r=oldRelic.apply(this,arguments);
      if(run&&Array.isArray(run.guards)) for(const g of run.guards){ const b=before.get(g); if(b) this._hbStatusDiffPop(g,b,null); }
      return r;
    };
    wrappedRelic._hbStatusWrappedLast=true;
    Game.prototype.relicOnBasket=wrappedRelic;
  }

  const oldKill=Game.prototype.killGuard;
  if(oldKill&&!oldKill._hbStatusWrappedLast){
    const wrappedKill=function(g){
      const aff=g&&g.endlessAffix, greed=!!(g&&g.endlessGreed), debt=!!(g&&g.endlessDebt);
      const r=oldKill.apply(this,arguments);
      if(g&&g.dead){
        if(aff==='crown') this._hbMonsterStatusText(g,'crown',{size:50,allowDead:true,cooldown:120});
        if(greed) this._hbMonsterStatusText(g,'greed',{size:48,allowDead:true,cooldown:120});
        if(debt) this._hbMonsterStatusText(g,'debt',{size:48,allowDead:true,cooldown:120});
      }
      return r;
    };
    wrappedKill._hbStatusWrappedLast=true;
    Game.prototype.killGuard=wrappedKill;
  }
})();

// === final activation v28: relic detail readability and clearer aim guide ===
(function(){
  if(typeof Game==='undefined') return;

  const RELIC_SHEETS={
    ball:'icons_balls.png',
    wrist:'icons_wrist.png',
    shoes:'icons_shoes.png',
    charm:'icons_charms.png',
    mask:'icons_masks.png',
    hoop:'icons_hoops.png'
  };
  const relicTierCol=it=>{
    const q=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
    return q[(it&&it.tier)||0]||q[0];
  };
  const validHeroSlot=i=>Number.isInteger(i)&&i>=0&&i<5;

  Game.prototype._drawRelicSheetIcon=function(type,idx,x,y,w,h,alpha){
    const im=this._relicUiImg&&this._relicUiImg(RELIC_SHEETS[type]||RELIC_SHEETS.ball);
    const ctx=this.ctx; alpha=alpha==null?1:alpha;
    const side=Math.min(w,h), dx=x+(w-side)/2, dy=y+(h-side)/2;
    if(im&&im.complete&&im.naturalWidth&&!im._err){
      const cols=4, sw=im.naturalWidth/cols, sh=im.naturalHeight/4;
      const safeIdx=Math.max(0,Number(idx)||0);
      const padX=Math.max(18,sw*0.115), padY=Math.max(22,sh*0.135);
      const sx=(safeIdx%cols)*sw+padX, sy=((safeIdx/cols)|0)*sh+padY;
      const cw=Math.max(8,sw-padX*2), ch=Math.max(8,sh-padY*2);
      ctx.save();
      ctx.globalAlpha=alpha;
      this.rr(x,y,w,h,10);
      ctx.clip();
      ctx.shadowColor='rgba(255,231,166,0.16)';
      ctx.shadowBlur=8;
      ctx.drawImage(im,sx,sy,cw,ch,dx,dy,side,side);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha=alpha;
    this.rr(dx,dy,side,side,10);
    ctx.fillStyle='rgba(20,14,9,0.9)';
    ctx.fill();
    ctx.strokeStyle='rgba(215,169,69,0.45)';
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype._hbDrawModalCard=function(it,x,y,w,h,title,col){
    const ctx=this.ctx;
    this.text(title,x+w/2,y-24,30,col,{align:'center',baseline:'middle',weight:'900'});
    this.rr(x,y,w,h,18);
    ctx.fillStyle='rgba(5,4,8,0.66)';
    ctx.fill();
    ctx.lineWidth=3.2;
    ctx.strokeStyle=it?relicTierCol(it):'rgba(160,150,130,0.35)';
    ctx.stroke();
    if(!it){
      this.text('空欄',x+w/2,y+h/2,38,'rgba(210,200,180,0.56)',{align:'center',baseline:'middle',weight:'900'});
      return;
    }
    const side=Math.min(w*0.5,h*0.40);
    this._drawRelicSheetIcon(it.type,it.idx,x+w/2-side/2,y+34,side,side,1);
    this.text(this._clip(it.name,w-64,36,'900'),x+w/2,y+h*0.56,36,relicTierCol(it),{align:'center',baseline:'middle',weight:'900'});
    this.text(this._hbRelicSummary?this._hbRelicSummary(it):((it.core||'聖物')+(it.q?(' · 強度 '+it.q+'/50'):'')),x+w/2,y+h*0.65,24,'#d8c9a8',{align:'center',baseline:'middle',weight:'900'});
    const lines=(it.affixes||[]).slice(0,3).map(a=>'◆ '+a.label+' +'+(a.pct?Math.round(a.val*100)+'%':a.val));
    if(!lines.length&&it.desc) lines.push(this._clip(it.desc,w-88,22,'900'));
    for(let i=0;i<Math.min(3,lines.length);i++) this.text(lines[i],x+48,y+h*0.74+i*41,23,'#fff1d5',{baseline:'middle',weight:'900'});
  };

  Game.prototype.drawRelicCompare=function(){
    const c=this._relicCompare;
    if(!c) return;
    const ctx=this.ctx;
    const selected=this._hbRelicDisplay?this._hbRelicDisplay(c.rid):(this._relicDisplay&&this._relicDisplay(c.rid,true));
    if(!selected) return;
    const current=c.current?(this._hbRelicDisplay?this._hbRelicDisplay(c.current):this._relicDisplay(c.current,true)):null;
    const single=c.inspect||!current||current.id===selected.id;

    ctx.save();
    ctx.fillStyle='rgba(2,1,5,0.76)';
    ctx.fillRect(0,0,BW,BH);
    ctx.restore();
    this.btn(0,0,BW,BH,'cmp_scrim',()=>{});

    if(single){
      const w=Math.min(900,BW-180), h=Math.min(730,BH-120), x=BW/2-w/2, y=BH/2-h/2+4;
      this.rr(x,y,w,h,24);
      ctx.fillStyle='rgba(8,5,10,0.97)';
      ctx.fill();
      ctx.lineWidth=4;
      ctx.strokeStyle='rgba(215,169,69,0.82)';
      ctx.stroke();
      this.text(c.equipped?'已裝備聖物':'聖物詳情',x+w/2,y+60,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});
      const icon=Math.min(224,w*0.32);
      this._drawRelicSheetIcon(selected.type,selected.idx,x+w/2-icon/2,y+100,icon,icon,1);
      this.text(this._clip(selected.name,w-120,42,'900'),x+w/2,y+354,42,relicTierCol(selected),{align:'center',baseline:'middle',weight:'900'});
      const summary=this._hbRelicSummary?this._hbRelicSummary(selected):((selected.core||'聖物')+(selected.q?(' · 強度 '+selected.q+'/50'):''));
      this.text(summary,x+w/2,y+402,27,'#d8c9a8',{align:'center',baseline:'middle',weight:'900'});
      const lines=(selected.affixes||[]).slice(0,3).map(a=>'◆ '+a.label+' +'+(a.pct?Math.round(a.val*100)+'%':a.val));
      if(selected.desc) lines.push(this._clip(selected.desc,w-150,24,'900'));
      const maxLines=h>675?4:3, first=y+462, lh=42;
      for(let i=0;i<Math.min(maxLines,lines.length);i++) this.text(lines[i],x+86,first+i*lh,25,'#fff1d5',{baseline:'middle',weight:'900'});
      const bw=248,bh=72,by=y+h-96;
      if(c.equipped){
        this.button(x+w/2-bw-26,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
        this.button(x+w/2+26,by,bw,bh,'卸下','cmp_unequip',()=>this._hbUnequipRelic(selected.id),{size:32,color:'#f0c0b0',weight:'900'});
      }else{
        const canDiscard=(this.save.library||[]).includes(selected.id);
        if(canDiscard){
          const sbw=216,gap=18,total=sbw*3+gap*2,sx=x+w/2-total/2;
          this.button(sx,by,sbw,bh,'丟棄','cmp_discard',()=>this._hbConfirmDiscardRelic(selected.id),{danger:true,size:29,color:'#fff0e8',weight:'900'});
          this.button(sx+sbw+gap,by,sbw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:29});
          this.button(sx+(sbw+gap)*2,by,sbw,bh,validHeroSlot(c.slot)?('裝入第 '+(c.slot+1)+' 欄'):'裝備','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:28,weight:'900'});
        }else{
          this.button(x+w/2-bw-26,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:30});
          this.button(x+w/2+26,by,bw,bh,validHeroSlot(c.slot)?('裝入第 '+(c.slot+1)+' 欄'):'裝備','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:31,weight:'900'});
        }
      }
      return;
    }

    const w=Math.min(1360,BW-150), h=Math.min(760,BH-120), x=BW/2-w/2, y=BH/2-h/2+4;
    const im=this._relicUiImg&&this._relicUiImg('compare_modal.png');
    if(im&&im.complete&&im.naturalWidth&&!im._err) ctx.drawImage(im,x,y,w,h);
    else {
      this.rr(x,y,w,h,24);
      ctx.fillStyle='rgba(8,5,10,0.97)';
      ctx.fill();
      ctx.lineWidth=4;
      ctx.strokeStyle='rgba(215,169,69,0.82)';
      ctx.stroke();
    }
    this.text('裝備比較',x+w/2,y+60,46,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:12});
    const cardW=Math.min(510,(w-260)/2), cardH=Math.min(490,h-250);
    this._hbDrawModalCard(current,x+96,y+148,cardW,cardH,'目前裝備','#bfff2f');
    this._hbDrawModalCard(selected,x+w-96-cardW,y+148,cardW,cardH,'準備裝備','#b980ff');
    this.text('VS',x+w/2,y+370,56,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:10});
    const bw=286,bh=76,by=y+h-108;
    const canDiscard=(this.save.library||[]).includes(selected.id)&&!((this.save.loadout||[]).includes(selected.id));
    if(canDiscard){
      const sbw=244,gap=24,total=sbw*3+gap*2,sx=x+w/2-total/2;
      this.button(sx,by,sbw,bh,'丟棄','cmp_discard',()=>this._hbConfirmDiscardRelic(selected.id),{danger:true,size:31,color:'#fff0e8',weight:'900'});
      this.button(sx+sbw+gap,by,sbw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:31});
      this.button(sx+(sbw+gap)*2,by,sbw,bh,'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:33,weight:'900'});
    }else{
      this.button(x+w/2-bw-36,by,bw,bh,'返回','cmp_back',()=>{this._relicCompare=null;this.render();},{size:31});
      this.button(x+w/2+36,by,bw,bh,'替換','cmp_equip',()=>this._equipFromCompare(),{primary:true,size:35,weight:'900'});
    }
  };

  Game.prototype.drawAim=function(){
    const ctx=this.ctx, run=this.run;
    if(!run||!run.aiming) return;
    const b=run.ball; if(!b) return;
    const ax=(run.aimStartX!=null?run.aimStartX:b.x), ay=(run.aimStartY!=null?run.aimStartY:b.y);
    const dx=ax-run.aimX, dy=ay-run.aimY, pull=Math.hypot(dx,dy);

    if(run.prevTraj&&run.prevTraj.length>1){
      ctx.save();
      ctx.lineCap='round';
      ctx.lineJoin='round';
      ctx.setLineDash([13,9]);
      ctx.globalAlpha=0.55;
      ctx.strokeStyle='rgba(0,0,0,0.88)';
      ctx.lineWidth=8;
      ctx.beginPath();
      ctx.moveTo(run.prevTraj[0][0],run.prevTraj[0][1]);
      for(let i=1;i<run.prevTraj.length;i++) ctx.lineTo(run.prevTraj[i][0],run.prevTraj[i][1]);
      ctx.stroke();
      ctx.globalAlpha=0.82;
      ctx.strokeStyle='#fff0b8';
      ctx.lineWidth=4;
      ctx.shadowBlur=10;
      ctx.shadowColor='#ffe14d';
      ctx.beginPath();
      ctx.moveTo(run.prevTraj[0][0],run.prevTraj[0][1]);
      for(let i=1;i<run.prevTraj.length;i++) ctx.lineTo(run.prevTraj[i][0],run.prevTraj[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if(pull<60){
      this.text('放開取消',b.x,b.y-60,26,'#ff6a4a',{align:'center',weight:'900',glow:8});
      return;
    }
    let maxPull=520;
    if(this._intfActive&&this._intfActive('maxPull')) maxPull*=0.85;
    if(this._intfActive&&this._intfActive('slowCharge')) maxPull*=1.15;
    const p=clamp(pull,0,maxPull)/maxPull, power=lerp(820,2650,p), ang=Math.atan2(dy,dx);
    let vx=Math.cos(ang)*power, vy=Math.sin(ang)*power, x=b.x, y=b.y;
    const G=2600*this._gravMul(), hh=1/60, pts=[];
    let dots=70+Math.round((run.relicIds&&run.relicIds.includes('deadeye_sigil'))?8:0);
    if(run.heroId==='shade'&&run._shadeBonus) dots+=6;
    if(run.relicIds&&run.relicIds.includes('deadeye_sigil')) dots=Math.round(dots*1.2);
    dots=Math.round(dots*this._getAimPreviewPct());
    if(this._intfActive&&this._intfActive('shortTraj')) dots=Math.round(dots*0.5);
    dots=Math.max(8,dots);
    let lx=x, ly=y;
    for(let i=0;i<dots;i++){
      vy+=G*hh; x+=vx*hh; y+=vy*hh; lx=x; ly=y;
      if(y>BH-92||x<0||x>BW) break;
      pts.push([x,y,i/dots]);
    }
    const col=this._ballColor(run.form);
    if(pts.length>1){
      ctx.save();
      ctx.lineCap='round';
      ctx.lineJoin='round';
      ctx.setLineDash([12,10]);
      ctx.globalAlpha=0.55;
      ctx.strokeStyle='rgba(0,0,0,0.95)';
      ctx.lineWidth=10;
      ctx.beginPath();
      ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.stroke();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=0.88;
      ctx.strokeStyle='#fff2b4';
      ctx.lineWidth=5;
      ctx.shadowBlur=14;
      ctx.shadowColor=col;
      ctx.beginPath();
      ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(const pt of pts){
      const tt=pt[2], r=lerp(10,3.8,tt), a=(1-tt)*0.96;
      ctx.globalAlpha=a;
      ctx.shadowBlur=12;
      ctx.shadowColor=col;
      ctx.fillStyle='rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.arc(pt[0],pt[1],r+3,0,TAU);
      ctx.fill();
      ctx.fillStyle=tt<0.5?'#fff2b4':col;
      ctx.beginPath();
      ctx.arc(pt[0],pt[1],r,0,TAU);
      ctx.fill();
    }
    ctx.restore();
    if(!(this._intfActive&&this._intfActive('hideLanding'))){
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.beginPath();
      ctx.arc(lx,ly,16,0,TAU);
      ctx.globalAlpha=0.28;
      ctx.fillStyle=col;
      ctx.fill();
      ctx.globalAlpha=1;
      ctx.lineWidth=4;
      ctx.strokeStyle='#fff2b4';
      ctx.shadowBlur=14;
      ctx.shadowColor=col;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle='rgba(0,0,0,0.78)';
    ctx.lineWidth=8;
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(run.aimX,run.aimY);
    ctx.stroke();
    ctx.strokeStyle='rgba(255,242,180,0.90)';
    ctx.lineWidth=4;
    ctx.shadowBlur=8;
    ctx.shadowColor='#ffe14d';
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(run.aimX,run.aimY);
    ctx.stroke();
    ctx.restore();

    const pp=Math.round(p*100);
    const elev=Math.atan2(-Math.sin(ang),Math.abs(Math.cos(ang)))*180/Math.PI;
    const arc=elev<30?'平射':(elev<55?'標準':'高拋');
    const ap=Math.round(this._getAimPreviewPct()*100);
    this.text('力道 '+pp+'%　弧線 '+arc+'　軌跡 '+ap+'%',BW/2,BH-70,27,'#fff2b4',{align:'center',weight:'900',glow:true});
  };
})();

// === final activation v29: typed monster attack effects ===
(function(){
  if(typeof Game==='undefined') return;

  const STYLE={
    skel:{label:'骨刺投擲',icon:'☠',color:'#eadfc4',core:'#fff3d7',trail:'#b9a888',shape:'bone',burst:'shard'},
    shield:{label:'盾骨衝擊',icon:'◆',color:'#d7c7aa',core:'#fff0bd',trail:'#9e8d74',shape:'shield',burst:'shard'},
    slime:{label:'黏液飛濺',icon:'●',color:'#9fe024',core:'#dcff79',trail:'#5fa832',shape:'slime',burst:'splat'},
    mummy:{label:'繃帶抽擊',icon:'⌁',color:'#d8c9a0',core:'#fff2cb',trail:'#a98f63',shape:'wrap',burst:'ribbon'},
    spider:{label:'蛛網束縛',icon:'✣',color:'#b980ff',core:'#f2d5ff',trail:'#7446c8',shape:'web',burst:'web'},
    chain:{label:'鐵鍊重砸',icon:'⛓',color:'#c8b894',core:'#fff0b8',trail:'#7f746a',shape:'chain',burst:'chain'},
    bat:{label:'迷霧撕咬',icon:'🌫',color:'#9d8cff',core:'#e3ddff',trail:'#5c4ad2',shape:'fog',burst:'fog'},
    zombie:{label:'油手黏擊',icon:'✋',color:'#9fe024',core:'#dfff7a',trail:'#4f8f32',shape:'oil',burst:'splat'},
    frost:{label:'寒霜法球',icon:'❄',color:'#6fd8ff',core:'#e7fbff',trail:'#238ec9',shape:'ice',burst:'ice'},
    eye:{label:'詛咒凝視',icon:'◉',color:'#ff6a4a',core:'#ffe0c7',trail:'#9b2dff',shape:'eye',burst:'curse'},
    drummer:{label:'戰鼓震波',icon:'♪',color:'#ff9a4a',core:'#ffe7a6',trail:'#c46a3a',shape:'drum',burst:'ring'},
    boss:{label:'Boss 制裁',icon:'⚠',color:'#ff5c37',core:'#ffe7a6',trail:'#8f2dff',shape:'boss',burst:'boss'},
    act1:{label:'鐘聲審判',icon:'🔔',color:'#ffb34d',core:'#fff2ba',trail:'#7a4a1a',shape:'bell',burst:'ring'},
    act2:{label:'收租鐵鏈',icon:'⛓',color:'#f0c86a',core:'#fff4c2',trail:'#8b7042',shape:'chain',burst:'chain'},
    act3:{label:'記分冷焰',icon:'▣',color:'#9fe024',core:'#e8ffb0',trail:'#5cc878',shape:'board',burst:'curse'},
    act4:{label:'雷骨判罰',icon:'⚡',color:'#ffe14d',core:'#fff7bf',trail:'#6fd8ff',shape:'bolt',burst:'bolt'},
    act5:{label:'終焉壓迫',icon:'☄',color:'#c89bff',core:'#fff0ff',trail:'#6b35d9',shape:'void',burst:'boss'}
  };
  const EFF_STYLE={
    grav:'chain',fog:'bat',grip:'zombie',freeze:'frost',gaze:'eye',drum:'drummer',
    slam:'shield',rush:'skel',shot:'eye'
  };
  const pickAttackSource=run=>{
    const live=(run&&run.guards||[]).filter(g=>g&&!g.dead&&!g.sandbag);
    if(!live.length) return null;
    return live.find(g=>g.casting)||live.find(g=>g.eliteMove)||live.slice().sort((a,b)=>(b.r||0)-(a.r||0))[0];
  };
  const styleFor=(g,run,kind)=>{
    if(kind==='boss'){
      const act=Math.max(1,Math.min(5,Number(run&&run.act)||1));
      return STYLE['act'+act]||STYLE.boss;
    }
    if(g&&g.eliteEff&&STYLE[EFF_STYLE[g.eliteEff]]) return STYLE[EFF_STYLE[g.eliteEff]];
    return STYLE[(g&&g.type)||'']||STYLE.boss;
  };
  const heroAnchor=function(){
    return {x:(this.save&&this.save.settings&&this.save.settings.lefty)?BW-210:210,y:BH-150};
  };
  Game.prototype._hbAttackFx=function(src,style,opts){
    const run=this.run; if(!run) return;
    style=style||STYLE.boss; opts=opts||{};
    const sx=opts.x!=null?opts.x:(src&&src.x!=null?src.x:BW*0.62);
    const sy=opts.y!=null?opts.y:(src&&src.y!=null?src.y-(src.r||32)*0.48:BH*0.48);
    const ha=heroAnchor.call(this);
    run.fx=run.fx||[];
    run.fx.push({kind:'hbAtkTele',x:sx,y:sy,hx:ha.x,hy:ha.y,t:opts.t||0.42,max:opts.t||0.42,style,seed:Math.random()*TAU});
    this.floater&&this.floater(sx,sy-34,style.icon+' '+style.label,style.color,22,{crit:true,vy:-26,t:0.75});
    this.burst&&this.burst(sx,sy,opts.burst||14,style.color,260,0.45,{r:4,glow:true,kind:style.burst==='splat'?'smoke':'shard'});
    if(style.shape==='drum'||style.burst==='ring'){
      this.ringFx&&this.ringFx(sx,sy,style.color,0.34,{r0:18,r1:170,width:8});
    } else if(style.shape==='eye'||style.shape==='board'||style.shape==='void'){
      this.ringFx&&this.ringFx(sx,sy,style.color,0.28,{r0:8,r1:120,width:6});
    }
  };
  const tagProjectiles=(run,fromLen,style,src)=>{
    if(!run||!run.projectiles) return;
    for(let i=fromLen;i<run.projectiles.length;i++){
      const p=run.projectiles[i];
      if(p&&p.kind==='enemyShot'){
        p.hbStyle=style;
        p.hbShape=style.shape;
        p.hbSeed=Math.random()*TAU;
        p.hbSourceType=src&&src.type;
        p.hbWide=(src&&src.elite)||style.shape==='boss'||style.shape==='void'||style.shape==='bolt';
      }
    }
  };

  const oldEnemyStrike=Game.prototype._enemyStrike;
  Game.prototype._enemyStrike=function(dmg){
    const run=this.run, src=pickAttackSource(run), st=styleFor(src,run,'normal'), before=run&&run.projectiles?run.projectiles.length:0;
    if(src){ src._lunge=0.36; this._hbAttackFx(src,st,{burst:src.elite?18:13}); }
    else this._hbAttackFx(null,st,{x:BW*0.62,y:BH*0.46,burst:12});
    const r=oldEnemyStrike?oldEnemyStrike.apply(this,arguments):undefined;
    tagProjectiles(run,before,st,src);
    return r;
  };

  const oldEliteCast=Game.prototype.eliteCast;
  Game.prototype.eliteCast=function(g){
    const st=styleFor(g,this.run,'elite');
    this._hbAttackFx(g,st,{t:0.56,burst:20});
    return oldEliteCast?oldEliteCast.apply(this,arguments):undefined;
  };

  const oldEliteStrike=Game.prototype._eliteStrike;
  Game.prototype._eliteStrike=function(g,dmg){
    const run=this.run, st=styleFor(g,run,'elite'), before=run&&run.projectiles?run.projectiles.length:0;
    this._hbAttackFx(g,st,{t:0.46,burst:18});
    const r=oldEliteStrike?oldEliteStrike.apply(this,arguments):undefined;
    tagProjectiles(run,before,st,g);
    return r;
  };

  const oldGuardCast=Game.prototype.guardCast;
  Game.prototype.guardCast=function(g){
    const st=styleFor(g,this.run,'guard');
    this._hbAttackFx(g,st,{t:0.62,burst:16});
    return oldGuardCast?oldGuardCast.apply(this,arguments):undefined;
  };

  const oldBossStrike=Game.prototype._bossStrike;
  Game.prototype._bossStrike=function(dmg){
    const run=this.run, st=styleFor(null,run,'boss'), before=run&&run.projectiles?run.projectiles.length:0;
    const host=run&&run.host;
    this._hbAttackFx(host||null,st,{x:host&&host.x,y:host&&host.baseY?host.baseY-(run&&run.stage&&run.stage.boss?180:80):undefined,t:0.62,burst:26});
    const r=oldBossStrike?oldBossStrike.apply(this,arguments):undefined;
    tagProjectiles(run,before,st,{type:'boss',elite:true});
    return r;
  };

  const oldUpdateProjectiles=Game.prototype.updateProjectiles;
  Game.prototype.updateProjectiles=function(dt){
    const run=this.run;
    if(run&&run.projectiles){
      for(const p of run.projectiles){
        if(!p||p.kind!=='enemyShot'||!p.hbStyle) continue;
        const st=p.hbStyle;
        const n=p.hbWide?2:1;
        for(let i=0;i<n;i++){
          this.spawn&&this.spawn(p.x+rand(-12,12),p.y+rand(-12,12),rand(-70,70),rand(-70,70),0.22+Math.random()*0.16,p.hbWide?5:3,st.trail||st.color,{glow:true,g:-20,drag:0.95});
        }
        if(p.hbShape==='ice'&&chance(0.35)) this.spawn(p.x,p.y,rand(-30,30),rand(-30,30),0.36,4,'#e7fbff',{kind:'shard',glow:true,g:10});
        if((p.hbShape==='chain'||p.hbShape==='bolt')&&chance(0.30)) this.arc&&this.arc(p.x-rand(20,48),p.y-rand(16,38),p.x+rand(20,48),p.y+rand(16,38));
      }
    }
    return oldUpdateProjectiles?oldUpdateProjectiles.apply(this,arguments):undefined;
  };

  const oldDrawBattleFx=Game.prototype.drawBattleFx;
  Game.prototype.drawBattleFx=function(){
    if(oldDrawBattleFx) oldDrawBattleFx.apply(this,arguments);
    const ctx=this.ctx, run=this.run; if(!run) return;
    ctx.save();
    ctx.lineCap='round';
    ctx.lineJoin='round';
    for(const m of (run.fx||[])){
      if(!m||m.kind!=='hbAtkTele') continue;
      const st=m.style||STYLE.boss, k=clamp(m.t/m.max,0,1), p=1-k;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=0.18+0.42*k;
      ctx.strokeStyle=st.color;
      ctx.lineWidth=12+10*k;
      ctx.shadowBlur=18;
      ctx.shadowColor=st.color;
      ctx.beginPath();
      const mx=(m.x+m.hx)/2+Math.sin(m.seed+p*5)*90, my=(m.y+m.hy)/2-80-Math.cos(m.seed)*40;
      ctx.moveTo(m.x,m.y);
      ctx.quadraticCurveTo(mx,my,m.hx,m.hy);
      ctx.stroke();
      ctx.globalAlpha=0.65*k;
      ctx.lineWidth=3.5;
      ctx.strokeStyle=st.core||'#fff';
      ctx.beginPath();
      ctx.moveTo(m.x,m.y);
      ctx.quadraticCurveTo(mx,my,m.hx,m.hy);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(m.x,m.y);
      const pulse=1+Math.sin(p*Math.PI)*0.28;
      ctx.scale(pulse,pulse);
      ctx.globalAlpha=0.88*k;
      ctx.font='900 34px "Microsoft JhengHei","PingFang TC",serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.lineWidth=7;
      ctx.strokeStyle='rgba(0,0,0,0.88)';
      ctx.strokeText(st.icon||'!',0,-8);
      ctx.fillStyle=st.core||st.color;
      ctx.shadowBlur=12;
      ctx.shadowColor=st.color;
      ctx.fillText(st.icon||'!',0,-8);
      ctx.restore();
    }

    for(const p of (run.projectiles||[])){
      if(!p||p.kind!=='enemyShot'||!p.hbStyle) continue;
      const st=p.hbStyle, trail=p.trail||[];
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      if(trail.length>1){
        for(let i=1;i<trail.length;i++){
          const a=i/(trail.length-1), q=trail[i], q0=trail[i-1];
          ctx.globalAlpha=a*0.62;
          ctx.strokeStyle=st.trail||st.color;
          ctx.lineWidth=(p.hbWide?18:12)*a+3;
          ctx.shadowBlur=16;
          ctx.shadowColor=st.color;
          ctx.beginPath();
          ctx.moveTo(q0[0],q0[1]);
          ctx.lineTo(q[0],q[1]);
          ctx.stroke();
        }
      }
      ctx.translate(p.x,p.y);
      const ang=Math.atan2(p.vy||0,p.vx||1);
      ctx.rotate(ang);
      ctx.globalAlpha=1;
      ctx.shadowBlur=24;
      ctx.shadowColor=st.color;
      const r=p.hbWide?23:17;
      if(st.shape==='chain'){
        ctx.strokeStyle=st.core; ctx.lineWidth=5; for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.ellipse(i*12,0,8,5,0,0,TAU); ctx.stroke(); }
      } else if(st.shape==='web'){
        ctx.strokeStyle=st.core; ctx.lineWidth=3; for(let i=0;i<6;i++){ const a=i/6*TAU; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*r*1.4,Math.sin(a)*r*1.4); ctx.stroke(); } ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke();
      } else if(st.shape==='ice'){
        ctx.fillStyle=st.core; ctx.beginPath(); ctx.moveTo(r*1.35,0); ctx.lineTo(-r*0.4,-r*0.72); ctx.lineTo(-r*0.95,0); ctx.lineTo(-r*0.4,r*0.72); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#0e5678'; ctx.lineWidth=2; ctx.stroke();
      } else if(st.shape==='eye'){
        ctx.fillStyle=st.color; ctx.beginPath(); ctx.ellipse(0,0,r*1.25,r*0.76,0,0,TAU); ctx.fill(); ctx.fillStyle=st.core; ctx.beginPath(); ctx.arc(0,0,r*0.45,0,TAU); ctx.fill();
      } else if(st.shape==='bolt'){
        ctx.fillStyle=st.core; ctx.beginPath(); ctx.moveTo(r*1.2,-r*0.85); ctx.lineTo(0,-r*0.15); ctx.lineTo(r*0.28,0); ctx.lineTo(-r*1.0,r*0.9); ctx.lineTo(-r*0.25,r*0.10); ctx.lineTo(-r*0.52,-r*0.05); ctx.closePath(); ctx.fill();
      } else if(st.shape==='drum'){
        ctx.strokeStyle=st.core; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r*1.3,0); ctx.lineTo(r*1.3,0); ctx.stroke();
      } else if(st.shape==='slime'||st.shape==='oil'){
        ctx.fillStyle=st.color; ctx.beginPath(); ctx.ellipse(0,0,r*1.18,r*0.86,Math.sin((this.t||0)*7)*0.2,0,TAU); ctx.fill(); ctx.fillStyle=st.core; ctx.globalAlpha=0.78; ctx.beginPath(); ctx.arc(-r*0.3,-r*0.25,r*0.25,0,TAU); ctx.fill();
      } else {
        const g=ctx.createRadialGradient(-r*0.3,-r*0.3,2,0,0,r*1.25);
        g.addColorStop(0,st.core||'#fff');
        g.addColorStop(0.48,st.color);
        g.addColorStop(1,'rgba(0,0,0,0.3)');
        ctx.fillStyle=g;
        ctx.beginPath();
        ctx.arc(0,0,r,0,TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  };
})();

// === final activation v30: boss drama, relic sorting, formal abyss forge ===
(function(){
  if(typeof Game==='undefined') return;

  const RELIC_TYPE_ORDER={ball:0,wrist:1,shoes:2,charm:3,mask:4,hoop:5};
  const RELIC_TYPE_LABEL={ball:'籃球',wrist:'護腕',shoes:'球鞋',charm:'護符',mask:'面具',hoop:'籃框'};
  const RELIC_SORTS=[
    {id:'rarity',label:'稀有度'},
    {id:'type',label:'部位'},
    {id:'equipped',label:'已裝備'},
    {id:'upgrade',label:'可升級'}
  ];
  const TIER_COL=['#6fb0e8','#9fe024','#b980ff','#ffb23c','#ff5a4d','#f4f0d0'];
  const TIER_NAME=['普通','精良','稀有','史詩','傳說','深淵'];
  const SOCKET_RARITY={
    common:{name:'普通',col:'#cfc6b0',glow:'rgba(207,198,176,0.16)'},
    magic:{name:'魔法',col:'#6fb0e8',glow:'rgba(111,176,232,0.18)'},
    rare:{name:'稀有',col:'#9fe024',glow:'rgba(159,224,36,0.18)'},
    epic:{name:'史詩',col:'#b980ff',glow:'rgba(185,128,255,0.20)'},
    legendary:{name:'傳說',col:'#ffb23c',glow:'rgba(255,178,60,0.22)'},
    abyss:{name:'深淵',col:'#f4f0d0',glow:'rgba(244,240,208,0.24)'}
  };

  const clip=(g,s,w,fs,weight)=>g&&g._clip?g._clip(String(s||''),w,fs,weight||'900'):String(s||'');
  const affixName=a=>String((a&&a.label)||(a&&a.name)||(a&&a.key)||'詞綴')
    .replace(/^鑲嵌[：:·\s]*/,'')
    .replace(/^精煉[：:·\s]*/,'')
    .replace(/^鍛造[：:·\s]*/,'');
  const affixValue=a=>{
    const v=Number(a&&a.val)||0;
    const sign=v>=0?'+':'';
    return sign+(a&&a.pct?Math.round(v*100)+'%':Math.round(v));
  };
  const affixLine=a=>affixName(a)+' '+affixValue(a);
  const tierCol=it=>TIER_COL[Math.max(0,Math.min(TIER_COL.length-1,Number(it&&it.tier)||0))]||'#e6c068';
  const tierName=it=>TIER_NAME[Math.max(0,Math.min(TIER_NAME.length-1,Number(it&&it.tier)||0))]||'普通';

  Game.prototype._hbRelicSortMode=function(){
    if(!this._relicSortHero) this._relicSortHero='rarity';
    return this._relicSortHero;
  };

  Game.prototype._hbRelicSortIds=function(ids){
    const list=(ids||[]).filter(Boolean);
    const mode=this._hbRelicSortMode();
    const load=(this.save&&this.save.loadout)||[];
    const equipped=new Set(load.filter(Boolean));
    const display=id=>{
      try{ return this._hbRelicDisplay?this._hbRelicDisplay(id):(this._relicDisplay?this._relicDisplay(id,true):null); }
      catch(e){ return null; }
    };
    const key=id=>{
      const it=display(id)||{};
      const eq=equipped.has(id)?1:0;
      const tier=Number(it.tier)||0;
      const q=Number(it.q)||0;
      const lvl=Number(it.lvl)||0;
      const typeRank=RELIC_TYPE_ORDER[it.type]!=null?RELIC_TYPE_ORDER[it.type]:99;
      if(mode==='type') return [typeRank,-tier,-q,-lvl,String(it.name||id)];
      if(mode==='equipped') return [-eq,-tier,-q,-lvl,typeRank,String(it.name||id)];
      if(mode==='upgrade') return [-eq,lvl,-tier,-q,typeRank,String(it.name||id)];
      return [-tier,-q,-lvl,-eq,typeRank,String(it.name||id)];
    };
    return list.slice().sort((a,b)=>{
      const ka=key(a), kb=key(b);
      for(let i=0;i<Math.max(ka.length,kb.length);i++){
        if(ka[i]===kb[i]) continue;
        return ka[i]<kb[i]?-1:1;
      }
      return String(a).localeCompare(String(b));
    });
  };

  const oldOwnedRelics=Game.prototype._hbOwnedRelicIds;
  Game.prototype._hbOwnedRelicIds=function(includeEquipped){
    const ids=oldOwnedRelics?oldOwnedRelics.call(this,includeEquipped):[];
    return this._hbRelicSortIds(ids);
  };

  const oldSlotCandidates=Game.prototype._hbSlotCandidates;
  Game.prototype._hbSlotCandidates=function(slot){
    const ids=oldSlotCandidates?oldSlotCandidates.call(this,slot):[];
    return this._hbRelicSortIds(ids);
  };

  Game.prototype._hbDrawRelicSortBar=function(){
    if(this._relicCompare) return;
    const ctx=this.ctx, safeT=this.insT||0, safeL=this.insL||0;
    const mode=this._hbRelicSortMode();
    const h=38, gap=8, w=96, total=RELIC_SORTS.length*w+(RELIC_SORTS.length-1)*gap;
    const x=Math.max(safeL+398,Math.min(BW-total-210,BW/2-total/2+70));
    const y=safeT+34;
    this.text('排序',x-52,y+h/2+1,19,'#c8b894',{baseline:'middle',weight:'900'});
    for(let i=0;i<RELIC_SORTS.length;i++){
      const s=RELIC_SORTS[i], bx=x+i*(w+gap), on=s.id===mode;
      this.rr(bx,y,w,h,10);
      ctx.fillStyle=on?'rgba(184,255,47,0.22)':'rgba(8,6,8,0.72)';
      ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle=on?'#bfff2f':'rgba(215,169,69,0.48)';
      ctx.stroke();
      this.text(s.label,bx+w/2,y+h/2+1,18,on?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      ((id)=>this.btn(bx,y,w,h,'hero_relic_sort_'+id,()=>{ this._relicSortHero=id; this.audio&&this.audio.sfx&&this.audio.sfx('ui'); this.render&&this.render(); }))(s.id);
    }
  };

  const oldDrawRelicBag=Game.prototype.drawRelicBag;
  Game.prototype.drawRelicBag=function(){
    const r=oldDrawRelicBag&&oldDrawRelicBag.apply(this,arguments);
    this._hbDrawRelicSortBar&&this._hbDrawRelicSortBar();
    return r;
  };

  Game.prototype._hbBossFxText=function(x,y,text,col,size){
    if(!this.run) return;
    this.floater&&this.floater(x,y,text,col||'#ffe7a6',size||34,{crit:true,t:1.25,vy:-54});
  };

  const oldEnterStage=Game.prototype.enterStage;
  Game.prototype.enterStage=function(pi){
    const r=oldEnterStage?oldEnterStage.apply(this,arguments):undefined;
    const run=this.run;
    if(run&&run.stage&&run.stage.boss){
      const name=run.endless?('深淵 Boss · 第 '+(run.endlessDepth||1)+' 層'):(run.stage.name||'Boss');
      run._hbBossIntro={start:this.t||0,dur:1.85,name,sub:run.stage.host||'守衛降臨'};
      run.shake=Math.max(run.shake||0,14);
      this.ringFx&&this.ringFx(BW/2,BH*0.38,'#ff7a3c',0.82,{r1:220,width:12});
      this.burst&&this.burst(BW/2,BH*0.38,34,'#ff7a3c',420,0.72,{glow:true,r:7,g:-30,len:68});
    }
    return r;
  };

  const oldHurtGuard=Game.prototype.hurtGuard;
  Game.prototype.hurtGuard=function(g,dmg,c,primary){
    const beforeShield=!!(g&&g.shieldUp);
    const beforeHp=g?Number(g.hp)||0:0;
    const r=oldHurtGuard?oldHurtGuard.apply(this,arguments):undefined;
    if(g&&beforeShield&&!g.shieldUp&&!g.dead){
      this.audio&&this.audio.sfx&&this.audio.sfx('boss');
      this.shockFx&&this.shockFx(g.x,g.y,'#ffe7a6',420,0.5);
      this.ringFx&&this.ringFx(g.x,g.y,'#ffe7a6',0.62,{r1:(g.r||60)+55,width:12});
      this.burst&&this.burst(g.x,g.y,30,'#ffe7a6',420,0.64,{kind:'shard',glow:true,r:6,g:120,len:58});
      this._hbBossFxText(g.x,g.y-(g.r||60)-48,'破盾','#ffe7a6',38);
      if(this.run) this.run.shake=Math.max(this.run.shake||0,16);
    }else if(g&&beforeHp>0&&g.hp>0&&primary&&beforeHp-g.hp>=Math.max(24,(g.maxhp||80)*0.25)){
      this._hbBossFxText(g.x,g.y-(g.r||60)-42,'重擊','#fff0c0',30);
    }
    return r;
  };

  const oldKillGuard=Game.prototype.killGuard;
  Game.prototype.killGuard=function(g){
    const wasDead=!!(g&&g.dead);
    const elite=!!(g&&(g.elite||g.intf||g.eliteMove));
    const r=oldKillGuard?oldKillGuard.apply(this,arguments):undefined;
    if(g&&!wasDead&&g.dead&&!g.sandbag){
      const col=elite?'#ffb23c':'#d8ff44';
      this.ringFx&&this.ringFx(g.x,g.y,col,elite?0.72:0.48,{r1:(g.r||48)+(elite?90:58),width:elite?13:8});
      this.burst&&this.burst(g.x,g.y,elite?42:24,col,elite?470:330,elite?0.78:0.55,{glow:true,r:elite?7:5,g:160,len:elite?74:48});
      this._hbBossFxText(g.x,g.y-(g.r||55)-36,elite?'菁英擊破':'擊破',col,elite?36:27);
      if(this.run) this.run.shake=Math.max(this.run.shake||0,elite?14:7);
    }
    return r;
  };

  const oldStageClear=Game.prototype.onStageClear;
  Game.prototype.onStageClear=function(){
    const run=this.run;
    const finalBoss=!!(run&&run.stage&&run.stage.boss&&run.spawned>=run.guardsTotal&&!run._stageClearing);
    const name=run&&run.stage&&run.stage.name;
    const r=oldStageClear?oldStageClear.apply(this,arguments):undefined;
    if(finalBoss&&this.run===run){
      run._hbBossDefeat={start:this.t||0,dur:2.25,name:name||'Boss',sub:run.endless?'深淵層主已倒下':'守衛崩解，聖物氣息外洩'};
      run.shake=Math.max(run.shake||0,24);
      this.audio&&this.audio.sfx&&this.audio.sfx('levelup');
      this.ringFx&&this.ringFx(BW/2,BH*0.36,'#d8ff44',0.95,{r1:260,width:15});
      this.burst&&this.burst(BW/2,BH*0.36,60,'#d8ff44',520,0.9,{glow:true,r:8,g:-40,len:90});
    }
    return r;
  };

  const oldFinishRun=Game.prototype.finishRun;
  Game.prototype.finishRun=function(won){
    const r=oldFinishRun?oldFinishRun.apply(this,arguments):undefined;
    if(this._endStats&&won&&this._endStats.loot&&this._endStats.loot.length){
      this._endStats._hbLootFxStart=this.t||0;
      this._endStats._hbLootFxDur=2.8;
    }
    return r;
  };

  Game.prototype._hbDrawBossDrama=function(){
    const run=this.run; if(!run||run.modal||this._paused||this._detailOpen) return;
    const ctx=this.ctx;
    const drawCard=(fx,titleCol,title,sub)=>{
      const p=clamp(((this.t||0)-fx.start)/fx.dur,0,1);
      if(p>=1) return false;
      const ease=p<0.5?p*2:1-(p-0.5)*0.35;
      ctx.save();
      ctx.globalAlpha=clamp(1-p*0.85,0,1);
      const g=ctx.createRadialGradient(BW/2,BH*0.34,40,BW/2,BH*0.34,BW*0.52);
      g.addColorStop(0,'rgba(255,230,170,0.22)');
      g.addColorStop(0.4,'rgba(255,120,60,0.10)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH);
      const w=760,h=144,x=BW/2-w/2,y=BH*0.15-16*Math.sin(p*Math.PI);
      this.rr(x,y,w,h,18);
      const bg=ctx.createLinearGradient(0,y,0,y+h);
      bg.addColorStop(0,'rgba(20,10,7,0.94)');
      bg.addColorStop(1,'rgba(7,4,7,0.92)');
      ctx.fillStyle=bg; ctx.fill();
      ctx.lineWidth=4;
      ctx.strokeStyle=titleCol;
      ctx.shadowBlur=22*ease;
      ctx.shadowColor=titleCol;
      this.rr(x,y,w,h,18); ctx.stroke();
      ctx.shadowBlur=0;
      this.text(title,BW/2,y+58,48,titleCol,{align:'center',baseline:'middle',weight:'900',glow:14});
      this.text(sub,BW/2,y+100,24,'#ffe7a6',{align:'center',baseline:'middle',weight:'900'});
      ctx.restore();
      return true;
    };
    if(run._hbBossIntro&&!drawCard(run._hbBossIntro,'#ff7a3c','BOSS 登場',run._hbBossIntro.name+' · '+run._hbBossIntro.sub)) run._hbBossIntro=null;
    if(run._hbBossDefeat&&!drawCard(run._hbBossDefeat,'#d8ff44','BOSS 擊破',run._hbBossDefeat.name+' · '+run._hbBossDefeat.sub)) run._hbBossDefeat=null;
  };

  const oldDrawBattle=Game.prototype.drawBattle;
  Game.prototype.drawBattle=function(){
    const r=oldDrawBattle?oldDrawBattle.apply(this,arguments):undefined;
    this._hbDrawBossDrama&&this._hbDrawBossDrama();
    return r;
  };

  const oldDrawEnd=Game.prototype.drawEnd;
  Game.prototype.drawEnd=function(){
    const r=oldDrawEnd?oldDrawEnd.apply(this,arguments):undefined;
    const s=this._endStats;
    if(!s||!s._hbLootFxStart||!s.loot||!s.loot.length) return r;
    const dur=s._hbLootFxDur||2.8, p=clamp(((this.t||0)-s._hbLootFxStart)/dur,0,1);
    if(p>=1) return r;
    const ctx=this.ctx, a=1-p;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=0.26*a;
    const rg=ctx.createRadialGradient(BW/2,BH*0.58,80,BW/2,BH*0.58,BW*0.5);
    rg.addColorStop(0,'rgba(255,232,150,0.55)');
    rg.addColorStop(0.55,'rgba(184,255,47,0.18)');
    rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=rg; ctx.fillRect(0,0,BW,BH);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha=clamp(a*1.2,0,1);
    this.text('聖物掉落',BW/2,Math.max(130,(this.insT||0)+116),54,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:18});
    this.text('戰利品已顯現，選擇收藏或丟棄',BW/2,Math.max(178,(this.insT||0)+164),25,'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    ctx.restore();
    return r;
  };

  Game.prototype._hbDrawForgeBackdrop=function(title,sub,accent){
    const ctx=this.ctx;
    ctx.save();
    const bg=ctx.createLinearGradient(0,0,0,BH);
    bg.addColorStop(0,'rgba(12,5,10,0.96)');
    bg.addColorStop(0.55,'rgba(5,4,8,0.98)');
    bg.addColorStop(1,'rgba(18,10,5,0.98)');
    ctx.fillStyle=bg; ctx.fillRect(0,0,BW,BH);
    const rg=ctx.createRadialGradient(BW/2,BH*0.32,30,BW/2,BH*0.32,BW*0.58);
    rg.addColorStop(0,'rgba(255,226,130,0.22)');
    rg.addColorStop(0.35,(accent||'#d8ff44')===' #d8ff44'?'rgba(184,255,47,0.08)':'rgba(184,255,47,0.08)');
    rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=rg; ctx.fillRect(0,0,BW,BH);
    ctx.restore();
    this.btn(0,0,BW,BH,'forge_scrim',()=>{});
    this.text(title,BW/2,88,62,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:18});
    this.text(sub,BW/2,138,25,accent||'#d8ff44',{align:'center',baseline:'middle',weight:'900'});
    const y=174, w=1120, x=BW/2-w/2, h=58;
    const steps=['每 5 層：裝備 +1 等','第 30 層後：詞綴鑲嵌','可放棄詞綴，避免洗分'];
    for(let i=0;i<steps.length;i++){
      const sw=(w-36)/3, sx=x+i*(sw+18);
      this.rr(sx,y,sw,h,14);
      ctx.fillStyle='rgba(20,13,8,0.88)'; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle=i===1?'rgba(184,255,47,0.72)':'rgba(215,169,69,0.42)'; ctx.stroke();
      this.text(steps[i],sx+sw/2,y+h/2+1,21,i===1?'#d8ff44':'#c8b894',{align:'center',baseline:'middle',weight:'900'});
    }
  };

  Game.prototype._hbDrawForgeRelicCard=function(it,x,y,w,h,opts){
    opts=opts||{};
    const ctx=this.ctx, col=tierCol(it);
    this.rr(x,y,w,h,20);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(38,25,15,0.98)');
    bg.addColorStop(0.48,'rgba(13,9,10,0.98)');
    bg.addColorStop(1,'rgba(5,4,8,0.99)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=3.5; ctx.strokeStyle=col; ctx.shadowBlur=18; ctx.shadowColor=col; this.rr(x,y,w,h,20); ctx.stroke(); ctx.shadowBlur=0;
    this.text(tierName(it)+' · '+(RELIC_TYPE_LABEL[it.type]||it.core||'聖物'),x+w/2,y+42,22,col,{align:'center',baseline:'middle',weight:'900'});
    const side=Math.min(150,w*0.42);
    if(this._drawRelicSheetIcon) this._drawRelicSheetIcon(it.type,it.idx,x+w/2-side/2,y+68,side,side,1);
    this.text(clip(this,it.name,w-44,31,'900'),x+w/2,y+244,31,col,{align:'center',baseline:'middle',weight:'900'});
    this.text('Lv '+(Number(it.lvl)||0)+'  →  Lv '+((Number(it.lvl)||0)+1)+'　強度 '+(it.q||0)+'/50',x+w/2,y+282,22,'#ffe7a6',{align:'center',baseline:'middle',weight:'900'});
    const lines=(it.affixes||[]).slice(0,4).map(a=>'◆ '+affixLine(a));
    if(!lines.length&&it.desc) lines.push(clip(this,it.desc,w-58,20,'800'));
    for(let k=0;k<Math.min(4,lines.length);k++) this.text(clip(this,lines[k],w-54,20,'800'),x+28,y+326+k*34,20,'#efe3ca',{baseline:'middle',weight:'800'});
    const by=y+h-78;
    this.button(x+30,by,w-60,58,opts.forge?'升級並鑲嵌':'升級 +1','endless_gear_'+it.id,()=>this._hbChooseEndlessGearReward(it.id),{primary:true,size:25,weight:'900'});
  };

  const oldDrawModal=Game.prototype.drawModal;
  Game.prototype.drawModal=function(){
    const run=this.run, m=run&&run.modal;
    if(!m||!(m.kind==='endlessGearReward'||m.kind==='endlessSocketAffixReward')) return oldDrawModal.apply(this,arguments);
    const ctx=this.ctx;
    if(m.kind==='endlessGearReward'){
      this._hbDrawForgeBackdrop('深淵鍛造','第 '+m.depth+' 層完成：選擇一件身上聖物升級 1 等'+(m.forge?'，接著可鑲嵌詞綴':''),'#d8ff44');
      const items=(m.choices||[]).map(id=>this._hbRelicDisplay?this._hbRelicDisplay(id):(this._relicDisplay?this._relicDisplay(id,true):null)).filter(Boolean);
      const n=Math.max(1,items.length), gap=26, cw=Math.min(330,(BW-220-(n-1)*gap)/n), ch=520;
      const total=n*cw+(n-1)*gap, x0=BW/2-total/2, y=264;
      for(let i=0;i<items.length;i++) this._hbDrawForgeRelicCard(items[i],x0+i*(cw+gap),y,cw,ch,{forge:m.forge});
      return;
    }

    this._hbDrawForgeBackdrop('深淵鑲嵌','第 '+m.depth+' 層：'+(m.itemName||'聖物')+' 已升至 Lv '+(m.upLevel||'')+'，選擇詞綴或放棄','#ffb23c');
    const choices=Array.isArray(m.choices)?m.choices:[], n=Math.max(1,choices.length);
    const gap=32, cw=Math.min(420,(BW-240-(n-1)*gap)/n), ch=474, total=n*cw+(n-1)*gap, x0=BW/2-total/2, y=274;
    for(let i=0;i<choices.length;i++){
      const a=choices[i], rm=SOCKET_RARITY[a.rarity]||SOCKET_RARITY.magic, x=x0+i*(cw+gap);
      this.rr(x,y,cw,ch,20);
      const bg=ctx.createLinearGradient(0,y,0,y+ch);
      bg.addColorStop(0,'rgba(39,27,17,0.98)');
      bg.addColorStop(1,'rgba(7,5,9,0.99)');
      ctx.fillStyle=bg; ctx.fill();
      ctx.lineWidth=3.5; ctx.strokeStyle=rm.col; ctx.shadowBlur=20; ctx.shadowColor=rm.col; this.rr(x,y,cw,ch,20); ctx.stroke(); ctx.shadowBlur=0;
      ctx.save(); ctx.fillStyle=rm.glow; ctx.beginPath(); ctx.arc(x+cw/2,y+98,78,0,TAU); ctx.fill(); ctx.restore();
      this.text(rm.name,x+cw/2,y+40,22,rm.col,{align:'center',baseline:'middle',weight:'900'});
      this.text(a.mode==='refine'?'精煉既有詞綴':'鑲嵌新詞綴',x+cw/2,y+76,20,'#c8b894',{align:'center',baseline:'middle',weight:'900'});
      this.text(clip(this,affixName(a),cw-56,34,'900'),x+cw/2,y+134,34,'#fff4dc',{align:'center',baseline:'middle',weight:'900'});
      this.text(affixValue(a),x+cw/2,y+190,36,rm.col,{align:'center',baseline:'middle',weight:'900',glow:10});
      this.wrap(a.desc||'深淵詞綴會永久寫入裝備，可放棄本次鑲嵌。',x+cw/2,y+252,cw-62,31,'#c8b894',22,'center');
      this.text(a.mode==='refine'?'提升這條詞綴數值':'佔用 1 個鑲嵌欄位',x+cw/2,y+360,20,'#8f846e',{align:'center',baseline:'middle',weight:'800'});
      this.button(x+34,y+ch-80,cw-68,58,a.mode==='refine'?'精煉詞綴':'鑲嵌詞綴','endless_socket_'+i,()=>this._hbChooseSocketAffix(i),{primary:true,size:25,weight:'900'});
    }
    this.button(BW/2-220,y+ch+34,440,64,'放棄詞綴，繼續深入','endless_socket_skip',()=>this._hbSkipSocketAffix(),{size:25,color:'#f0c0b0',weight:'900'});
  };
})();

// === final activation v31: boss victory cutscene with fade transitions ===
(function(){
  if(typeof Game==='undefined') return;

  const BOSS_DEFEAT_ASSETS={
    1:'/assets/boss_defeat/act1.png?v=20260629_v1',
    2:'/assets/boss_defeat/act2.png?v=20260629_v1',
    3:'/assets/boss_defeat/act3.png?v=20260629_v1',
    4:'/assets/boss_defeat/act4.png?v=20260629_v1',
    5:'/assets/boss_defeat/act5.png?v=20260629_v1'
  };
  const clamp01=v=>clamp(v,0,1);
  const smooth=v=>{ v=clamp01(v); return v*v*(3-2*v); };
  const uniq=a=>{ const s=new Set(), out=[]; for(const x of a||[]){ if(x&&!s.has(x)){ s.add(x); out.push(x); } } return out; };

  const oldFullPreload=Game.prototype._hbFullPreloadImages;
  Game.prototype._hbFullPreloadImages=function(){
    const base=oldFullPreload?oldFullPreload.call(this):[];
    return uniq(base.concat(Object.keys(BOSS_DEFEAT_ASSETS).map(k=>BOSS_DEFEAT_ASSETS[k])));
  };

  Game.prototype._hbBossDefeatImage=function(act){
    this._hbBossDefeatImgs=this._hbBossDefeatImgs||{};
    const src=BOSS_DEFEAT_ASSETS[act]||BOSS_DEFEAT_ASSETS[1];
    if(this._hbBossDefeatImgs[src]===undefined){
      try{ const im=new Image(); im.onerror=()=>{ im._err=true; }; im.onload=()=>{ try{ if(this.screen==='bossVictory') this.render(); }catch(e){} }; im.src=src; this._hbBossDefeatImgs[src]=im; }
      catch(e){ this._hbBossDefeatImgs[src]=null; }
    }
    return this._hbBossDefeatImgs[src];
  };

  Game.prototype._hbDrawCoverImage=function(img,x,y,w,h){
    const ctx=this.ctx;
    if(!img||!img.complete||!img.naturalWidth||img._err) return false;
    const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
    const s=Math.max(w/iw,h/ih), dw=iw*s, dh=ih*s;
    ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
    return true;
  };

  const oldFinishRun=Game.prototype.finishRun;
  Game.prototype.finishRun=function(won){
    const run=this.run;
    const shouldCut=!!(won&&run&&run.stage&&run.stage.boss&&!run.endless&&!run.speed&&!run._hbBossVictorySeen&&!this._hbVictoryContinuing);
    if(shouldCut){
      run._hbBossVictorySeen=true;
      this._hbBossVictory={
        run,won:true,act:run.act||1,
        actName:(ACTS[(run.act||1)-1]&&ACTS[(run.act||1)-1].name)||('ACT '+(run.act||1)),
        bossName:(run.stage&&run.stage.name)||(run.stage&&run.stage.host)||'BOSS',
        route:run.route||'std',
        start:this.t||0,
        closing:false,
        closeStart:0
      };
      this.screen='bossVictory';
      this._paused=false; this._detailOpen=false; this._confirm=null; this._toast=null;
      this.particles.length=0; this.floaters.length=0;
      this.audio&&this.audio.sfx&&this.audio.sfx('win');
      this.audio&&this.audio.sfx&&this.audio.sfx('whistle');
      this.render&&this.render();
      return;
    }
    return oldFinishRun?oldFinishRun.apply(this,arguments):undefined;
  };

  Game.prototype._hbCompleteBossVictory=function(){
    const cut=this._hbBossVictory;
    if(!cut||cut.closing) return;
    cut.closing=true;
    cut.closeStart=this.t||0;
    this.audio&&this.audio.sfx&&this.audio.sfx('ui');
    setTimeout(()=>{
      if(this._hbBossVictory!==cut) return;
      this.run=cut.run;
      this._hbBossVictory=null;
      this._hbPostVictoryFade={start:this.t||0,dur:0.55};
      this._hbVictoryContinuing=true;
      try{ oldFinishRun&&oldFinishRun.call(this,cut.won); }
      finally{ this._hbVictoryContinuing=false; }
      this.render&&this.render();
    },540);
  };

  Game.prototype.drawBossVictory=function(){
    const ctx=this.ctx, cut=this._hbBossVictory;
    if(!cut){ this.go('hub'); return; }
    const t=this.t||0, elapsed=Math.max(0,t-cut.start);
    const imgAlpha=smooth((elapsed-0.08)/0.72);
    const textAlpha=smooth((elapsed-0.62)/0.55);
    const btnAlpha=smooth((elapsed-1.05)/0.42);
    const closeAlpha=cut.closing?smooth((t-cut.closeStart)/0.48):0;
    const alphaMul=1-closeAlpha;
    const img=this._hbBossDefeatImage(cut.act);

    ctx.save();
    ctx.fillStyle='#030205';
    ctx.fillRect(0,0,BW,BH);
    ctx.globalAlpha=imgAlpha*alphaMul;
    if(!this._hbDrawCoverImage(img,0,0,BW,BH)){
      const bg=ctx.createLinearGradient(0,0,0,BH);
      bg.addColorStop(0,'#160b18'); bg.addColorStop(0.52,'#08060b'); bg.addColorStop(1,'#1c1007');
      ctx.fillStyle=bg; ctx.fillRect(0,0,BW,BH);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha=(0.26+0.34*textAlpha)*alphaMul;
    const shade=ctx.createLinearGradient(0,0,0,BH);
    shade.addColorStop(0,'rgba(0,0,0,0.54)');
    shade.addColorStop(0.30,'rgba(0,0,0,0.14)');
    shade.addColorStop(0.76,'rgba(0,0,0,0.08)');
    shade.addColorStop(1,'rgba(0,0,0,0.52)');
    ctx.fillStyle=shade; ctx.fillRect(0,0,BW,BH);
    ctx.restore();

    const titleY=Math.max(110,(this.insT||0)+96);
    ctx.save();
    ctx.globalAlpha=textAlpha*alphaMul;
    this.text('VICTORY',BW/2,titleY,86,'#ffe7a6',{align:'center',baseline:'middle',weight:'900',glow:24,font:'Georgia,serif'});
    this.text('BOSS DEFEATED',BW/2,titleY+70,30,'#d8ff44',{align:'center',baseline:'middle',weight:'900',glow:10});
    this.text('ACT '+cut.act+' CLEARED · '+cut.actName,BW/2,titleY+112,25,'#efe3ca',{align:'center',baseline:'middle',weight:'900'});
    this.text(cut.bossName,BW/2,titleY+148,25,'#c8b894',{align:'center',baseline:'middle',weight:'800'});
    ctx.restore();

    const bw=420,bh=72,bx=BW/2-bw/2,by=BH-(this.insB||0)-128;
    if(btnAlpha>0.02&&!cut.closing){
      ctx.save(); ctx.globalAlpha=btnAlpha;
      this.button(bx,by,bw,bh,'下一步','boss_victory_next',()=>this._hbCompleteBossVictory(),{primary:true,size:30,weight:'900'});
      ctx.restore();
    }

    if(closeAlpha>0){
      ctx.save(); ctx.globalAlpha=closeAlpha; ctx.fillStyle='#000'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    }else if(imgAlpha<1){
      ctx.save(); ctx.globalAlpha=1-imgAlpha; ctx.fillStyle='#000'; ctx.fillRect(0,0,BW,BH); ctx.restore();
    }
  };

  const oldRender=Game.prototype.render;
  Game.prototype.render=function(){
    if(this.screen!=='bossVictory') return oldRender.apply(this,arguments);
    const ctx=this.ctx,dpr=this.dpr;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.fillStyle='#030205'; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    if(this.portrait){ this._hideLoginInputs&&this._hideLoginInputs(); this.drawRotate(); return; }
    ctx.setTransform(this.scale*dpr,0,0,this.scale*dpr,this.ox*dpr,this.oy*dpr);
    this.buttons=[]; this._scrollable=false; this._layIds=[];
    this.drawBossVictory();
    if(this._confirm) this.drawConfirm();
    if(this._loginOpen) this.drawLoginModal(); else this._hideLoginInputs&&this._hideLoginInputs();
    ctx.setTransform(1,0,0,1,0,0);
  };

  const oldDrawEnd=Game.prototype.drawEnd;
  Game.prototype.drawEnd=function(){
    const r=oldDrawEnd?oldDrawEnd.apply(this,arguments):undefined;
    const f=this._hbPostVictoryFade;
    if(f){
      const p=smooth(((this.t||0)-f.start)/(f.dur||0.55));
      if(p>=1) this._hbPostVictoryFade=null;
      else{ const ctx=this.ctx; ctx.save(); ctx.globalAlpha=1-p; ctx.fillStyle='#000'; ctx.fillRect(0,0,BW,BH); ctx.restore(); }
    }
    return r;
  };
})();

// === final activation v32b: final selectable pull-shot / push-shot controls ===
(function(){
  if(typeof Game==='undefined') return;

  function shotSettings(game){
    if(!game.save) game.save=defaultSave();
    if(!game.save.settings) game.save.settings=defaultSave().settings;
    if(typeof game.save.settings.shotPush!=='boolean') game.save.settings.shotPush=false;
    return game.save.settings;
  }

  function shotLabel(game){
    return shotSettings(game).shotPush ? '推投' : '拉弓';
  }

  Game.prototype._hbShotPushMode=function(){
    return !!shotSettings(this).shotPush;
  };

  Game.prototype._hbAimVector=function(run){
    const b=run&&run.ball;
    const ax=(run&&run.aimStartX!=null)?run.aimStartX:(b?b.x:0);
    const ay=(run&&run.aimStartY!=null)?run.aimStartY:(b?b.y:0);
    const px=(run&&Number.isFinite(run.aimX))?run.aimX:ax;
    const py=(run&&Number.isFinite(run.aimY))?run.aimY:ay;
    const push=this._hbShotPushMode();
    const dx=push ? (px-ax) : (ax-px);
    const dy=push ? (py-ay) : (ay-py);
    return {ax,ay,px,py,dx,dy,pull:Math.hypot(dx,dy),push};
  };

  Game.prototype._hbSetShotMode=function(push){
    const st=shotSettings(this);
    if(st.shotPush===!!push) return;
    st.shotPush=!!push;
    persist(this.save);
    this.audio&&this.audio.sfx&&this.audio.sfx('select');
    this.toast&&this.toast('投籃手感已切換', shotLabel(this)+'模式');
    this.render&&this.render();
  };

  Game.prototype._hbDrawShotModeSwitch=function(x,y,w,h,opts){
    opts=opts||{};
    const ctx=this.ctx, st=shotSettings(this), U=opts.U||1;
    const activePush=!!st.shotPush;
    ctx.save();
    this.rr(x,y,w,h,18*U);
    const bg=ctx.createLinearGradient(0,y,0,y+h);
    bg.addColorStop(0,'rgba(40,28,14,0.95)');
    bg.addColorStop(1,'rgba(10,7,6,0.96)');
    ctx.fillStyle=bg; ctx.fill();
    ctx.lineWidth=2.5*U; ctx.strokeStyle='rgba(215,169,69,0.72)'; this.rr(x,y,w,h,18*U); ctx.stroke();
    ctx.lineWidth=1.2*U; ctx.strokeStyle='rgba(184,255,47,0.28)'; this.rr(x+7*U,y+7*U,w-14*U,h-14*U,14*U); ctx.stroke();
    this.text('投籃手感',x+28*U,y+28*U,22*U,'#ffe7a6',{baseline:'middle',weight:'900'});
    this.text(activePush?'手指往前推，球往前飛':'往後拉弓，球反向彈出',x+28*U,y+h-22*U,16*U,'#c8b894',{baseline:'middle',weight:'800'});
    ctx.restore();

    const gap=12*U, bw=(w-260*U-gap)/2, bh=52*U, by=y+22*U, bx=x+w-28*U-bw*2-gap;
    this.button(bx,by,bw,bh,'拉弓','shot_mode_pull_'+Math.round(x)+'_'+Math.round(y),()=>this._hbSetShotMode(false),{primary:!activePush,size:20*U,weight:'900'});
    this.button(bx+bw+gap,by,bw,bh,'推投','shot_mode_push_'+Math.round(x)+'_'+Math.round(y),()=>this._hbSetShotMode(true),{primary:activePush,size:20*U,weight:'900'});
  };

  const latestDrawSettings=Game.prototype.drawSettings;
  Game.prototype.drawSettings=function(){
    return latestDrawSettings?latestDrawSettings.apply(this,arguments):undefined;
  };

  const latestDrawPause=Game.prototype.drawPause;
  Game.prototype.drawPause=function(){
    const r=latestDrawPause?latestDrawPause.apply(this,arguments):undefined;
    const IT=this.insT||0, IR=this.insR||0;
    this._hbDrawShotModeSwitch(BW-IR-610,IT+56,540,96,{U:1});
    return r;
  };

  const latestBattleUp=Game.prototype.battleUp;
  Game.prototype.battleUp=function(x,y){
    const run=this.run, b=run&&run.ball;
    if(this._hbShotPushMode()&&run&&run.aiming&&b&&Number.isFinite(x)&&Number.isFinite(y)){
      const ax=(run.aimStartX!=null?run.aimStartX:b.x);
      const ay=(run.aimStartY!=null?run.aimStartY:b.y);
      return latestBattleUp.call(this,2*ax-x,2*ay-y);
    }
    return latestBattleUp.apply(this,arguments);
  };

  Game.prototype.drawAim=function(){
    const ctx=this.ctx, run=this.run;
    if(!run||!run.aiming) return;
    const b=run.ball;
    if(!b) return;
    const av=this._hbAimVector(run);
    const ax=av.ax, ay=av.ay, dx=av.dx, dy=av.dy, pull=av.pull;

    if(run.prevTraj&&run.prevTraj.length>1){
      ctx.save();
      ctx.lineCap='round';
      ctx.lineJoin='round';
      ctx.setLineDash([13,9]);
      ctx.globalAlpha=0.55;
      ctx.strokeStyle='rgba(0,0,0,0.88)';
      ctx.lineWidth=8;
      ctx.beginPath();
      ctx.moveTo(run.prevTraj[0][0],run.prevTraj[0][1]);
      for(let i=1;i<run.prevTraj.length;i++) ctx.lineTo(run.prevTraj[i][0],run.prevTraj[i][1]);
      ctx.stroke();
      ctx.globalAlpha=0.82;
      ctx.strokeStyle='#fff0b8';
      ctx.lineWidth=4;
      ctx.shadowBlur=10;
      ctx.shadowColor='#ffe14d';
      ctx.beginPath();
      ctx.moveTo(run.prevTraj[0][0],run.prevTraj[0][1]);
      for(let i=1;i<run.prevTraj.length;i++) ctx.lineTo(run.prevTraj[i][0],run.prevTraj[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if(pull<60){
      this.text('放開取消',b.x,b.y-60,26,'#ff6a4a',{align:'center',weight:'900',glow:8});
      return;
    }

    let maxPull=520;
    if(this._intfActive&&this._intfActive('maxPull')) maxPull*=0.85;
    if(this._intfActive&&this._intfActive('slowCharge')) maxPull*=1.15;
    const p=clamp(pull,0,maxPull)/maxPull, power=lerp(820,2650,p), ang=Math.atan2(dy,dx);
    let vx=Math.cos(ang)*power, vy=Math.sin(ang)*power, x=b.x, y=b.y;
    const G=2600*this._gravMul(), hh=1/60, pts=[];
    let dots=70+Math.round((run.relicIds&&run.relicIds.includes('deadeye_sigil'))?8:0);
    if(run.heroId==='shade'&&run._shadeBonus) dots+=6;
    if(run.relicIds&&run.relicIds.includes('deadeye_sigil')) dots=Math.round(dots*1.2);
    dots=Math.round(dots*this._getAimPreviewPct());
    if(this._intfActive&&this._intfActive('shortTraj')) dots=Math.round(dots*0.5);
    dots=Math.max(8,dots);
    let lx=x, ly=y;
    for(let i=0;i<dots;i++){
      vy+=G*hh; x+=vx*hh; y+=vy*hh; lx=x; ly=y;
      if(y>BH-92||x<0||x>BW) break;
      pts.push([x,y,i/dots]);
    }

    const col=this._ballColor(run.form);
    if(pts.length>1){
      ctx.save();
      ctx.lineCap='round';
      ctx.lineJoin='round';
      ctx.setLineDash([12,10]);
      ctx.globalAlpha=0.55;
      ctx.strokeStyle='rgba(0,0,0,0.95)';
      ctx.lineWidth=10;
      ctx.beginPath();
      ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.stroke();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=0.88;
      ctx.strokeStyle='#fff2b4';
      ctx.lineWidth=5;
      ctx.shadowBlur=14;
      ctx.shadowColor=col;
      ctx.beginPath();
      ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(const pt of pts){
      const tt=pt[2], r=lerp(10,3.8,tt), a=(1-tt)*0.96;
      ctx.globalAlpha=a;
      ctx.shadowBlur=12;
      ctx.shadowColor=col;
      ctx.fillStyle='rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.arc(pt[0],pt[1],r+3,0,TAU);
      ctx.fill();
      ctx.fillStyle=tt<0.5?'#fff2b4':col;
      ctx.beginPath();
      ctx.arc(pt[0],pt[1],r,0,TAU);
      ctx.fill();
    }
    ctx.restore();

    if(!(this._intfActive&&this._intfActive('hideLanding'))){
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.beginPath();
      ctx.arc(lx,ly,16,0,TAU);
      ctx.globalAlpha=0.28;
      ctx.fillStyle=col;
      ctx.fill();
      ctx.globalAlpha=1;
      ctx.lineWidth=4;
      ctx.strokeStyle='#fff2b4';
      ctx.shadowBlur=14;
      ctx.shadowColor=col;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle='rgba(0,0,0,0.78)';
    ctx.lineWidth=8;
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(av.px,av.py);
    ctx.stroke();
    ctx.strokeStyle=av.push?'rgba(184,255,47,0.95)':'rgba(255,242,180,0.90)';
    ctx.lineWidth=4;
    ctx.shadowBlur=10;
    ctx.shadowColor=av.push?'#b8ff2f':'#ffe14d';
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(av.px,av.py);
    ctx.stroke();
    const a2=Math.atan2(av.py-ay,av.px-ax);
    const ar=18;
    ctx.beginPath();
    ctx.moveTo(av.px,av.py);
    ctx.lineTo(av.px-Math.cos(a2-0.55)*ar,av.py-Math.sin(a2-0.55)*ar);
    ctx.moveTo(av.px,av.py);
    ctx.lineTo(av.px-Math.cos(a2+0.55)*ar,av.py-Math.sin(a2+0.55)*ar);
    ctx.stroke();
    ctx.restore();

    const pp=Math.round(p*100);
    const elev=Math.atan2(-Math.sin(ang),Math.abs(Math.cos(ang)))*180/Math.PI;
    const arc=elev<30?'低弧':(elev<55?'中弧':'高弧');
    const ap=Math.round(this._getAimPreviewPct()*100);
    this.text(shotLabel(this)+' · 力量 '+pp+'% · '+arc+' · 預覽 '+ap+'%',BW/2,BH-70,27,'#fff2b4',{align:'center',weight:'900',glow:true});
  };
})();
