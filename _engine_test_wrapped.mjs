// 《地獄籃不住：籃獄圖譜》HOOPocalypse: Atlas of the Damned Rim
// Single-finger physics basketball × dark-comedy roguelite × boss hunt × relic collection.
// Data-driven rebuild. Self-contained, no network. Bean-style art. export start(canvas, root).

export function start(canvas, root){ const G=new Game(canvas,root); G.boot(); try{window.__HB=G;}catch(e){} return G; }
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
const BW=1920,BH=1080,FIXED=1/120;
const SAVE_KEY='hoopocalypse_save_v2';
const OLD_KEY='abyss_hoop_save_v1';

// ---------- persistence + migration ----------
function defaultSave(){ return {
  ver:2, coins:0, tutorialDone:false,
  hero:'shade',
  relics:[null,null,null],        // 3 universal slots (relic ids)
  library:[],                     // relic ids in storage
  acts:1,                         // highest act unlocked
  marks:{},                       // bossId -> mark count
  heat:{},                        // routeId -> 0..5
  memory:{},                      // routeId -> state string
  bossClears:{},                  // bossId -> times
  endless:false, endlessBest:0,
  stats:{ bestScore:0, bestAcc:0, bestCombo:0, totalShots:0, swishes:0, banks:0 },
  settings:{ music:true, sfx:true, vibrate:true, reduceMotion:false, lefty:false, lowPerf:false, musicVol:0.5, sfxVol:0.8 },
}; }
function loadSave(){
  let s=null; try{ s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); }catch(e){}
  if(!s){ s=migrateOld()||defaultSave(); }
  const d=defaultSave();
  for(const k in d) if(!(k in s)) s[k]=d[k];
  for(const k in d.settings) if(!(k in s.settings)) s.settings[k]=d.settings[k];
  for(const k in d.stats) if(!(k in s.stats)) s.stats[k]=d.stats[k];
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
    this.enMusic=true; this.enSfx=true; this.mVol=0.5; this.sVol=0.8; this._theme=null; this._timer=null; }
  ensure(){ if(this.ac) return; try{ const AC=window.AudioContext||window.webkitAudioContext; this.ac=new AC();
    this.master=this.ac.createGain(); this.master.gain.value=0.9; this.master.connect(this.ac.destination);
    this.musicGain=this.ac.createGain(); this.musicGain.gain.value=this.enMusic?this.mVol:0; this.musicGain.connect(this.master);
    this.sfxGain=this.ac.createGain(); this.sfxGain.gain.value=this.enSfx?this.sVol:0; this.sfxGain.connect(this.master);
  }catch(e){ this.ac=null; } }
  resume(){ this.ensure(); if(this.ac&&this.ac.state==='suspended') this.ac.resume(); }
  setMusic(b){ this.enMusic=b; if(this.musicGain) this.musicGain.gain.value=b?this.mVol:0; }
  setSfx(b){ this.enSfx=b; if(this.sfxGain) this.sfxGain.gain.value=b?this.sVol:0; }
  setMVol(v){ this.mVol=v; if(this.musicGain) this.musicGain.gain.value=this.enMusic?v:0; }
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
  startTheme(key,intense){ this.ensure(); if(!this.ac) return; const id=key+(intense?'!':''); if(this._theme===id) return; this.stopTheme(); this._theme=id; if(!this.enMusic) return;
    const ac=this.ac; const roots={abbey:110,sand:98,city:104,inferno:87,final:123.47,hub:98};
    const root=roots[key]||104; const seq=[0,0,3,0,5,3,0,-2]; let step=0; const beat=intense?0.32:0.5;
    const play=()=>{ if(!this.ac||this._theme!==id) return; const t=ac.currentTime; const f=root*Math.pow(2,seq[step%seq.length]/12);
      const o=ac.createOscillator(),g=ac.createGain(); o.type='sine'; o.frequency.value=f/2; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.15,t+0.04); g.gain.exponentialRampToValueAtTime(0.0001,t+beat*0.9); o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t+beat);
      const o2=ac.createOscillator(),g2=ac.createGain(); o2.type='triangle'; o2.frequency.value=f; g2.gain.setValueAtTime(0.0001,t); g2.gain.exponentialRampToValueAtTime(0.05,t+0.1); g2.gain.exponentialRampToValueAtTime(0.0001,t+beat*1.6); o2.connect(g2); g2.connect(this.musicGain); o2.start(t); o2.stop(t+beat*1.7);
      if(intense&&step%2===0) this.noise(0.05,0.05,6000,t,'highpass'); step++; this._timer=setTimeout(play,beat*1000); };
    play();
  }
  stopTheme(){ if(this._timer) clearTimeout(this._timer); this._timer=null; this._theme=null; }
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
  abbey_ember:   {name:'修院餘燼', cls:'core', form:'fire', act:1, desc:'開局火球；首球進球全體小爆'},
  sand_bow:      {name:'沙王骨弓', cls:'core', form:'arrow', act:2, desc:'開局魂弓；遠投穿透 +1'},
  citadel_battery:{name:'城邦電瓶', cls:'core', form:'lightning', act:3, desc:'開局閃電；每關首次空心連鎖全體'},
  red_axe:       {name:'紅牌戰斧', cls:'core', form:'axe', act:4, desc:'開局斬魂斧；返回傷害提高'},
  final_chill:   {name:'終場寒核', cls:'core', form:'ice', act:5, desc:'開局冰封；每關首球取消一名施法'},
  // 10 universal
  broken_glass:  {name:'破碎沙漏', cls:'feel', desc:'所有干擾持續 -1 球'},
  deadeye_sigil: {name:'死眼徽記', cls:'feel', desc:'軌跡 +20%，空心傷害 +15%'},
  kings_seal:    {name:'王衛印璽', cls:'oath', desc:'擦板球獲 6 護盾'},
  blood_chalice: {name:'血之聖杯', cls:'oath', desc:'連擊≥5每兩球回 2 生命'},
  hex_idol:      {name:'咒織偶像', cls:'core', desc:'每第五球隨機火/冰/雷'},
  pilgrim_bone:  {name:'朝聖者遺骨', cls:'oath', desc:'完成關卡回 8% 最大生命'},
  rift_feather:  {name:'裂隙羽骨', cls:'oath', desc:'每幕一次致命失手剩 1 生命'},
  champ_ball:    {name:'爛皮冠軍球', cls:'core', desc:'保持皮球時空心/擦板倍率提高'},
  bench_towel:   {name:'替補席毛巾', cls:'feel', desc:'每次升級額外重抽一次'},
  ref_glasses:   {name:'裁判近視眼鏡', cls:'feel', desc:'軌跡縮短干擾減半（畫面略糊）'},
};
const RELIC_CLASS={ core:'球核', feel:'手感', oath:'誓約' };

// ---- HEROES (7 投手) ----
const HEROES = [
  {id:'shade', name:'影投客', en:'Shade Shooter', role:'連擊／空心', body:'mage', col:'#6a3fa8', passive:'空心球後，下一球軌跡 +15%'},
  {id:'bone', name:'骨場教練', en:'Bone Coach', role:'擊殺連鎖', body:'necro', col:'#5a7a52', passive:'小怪死亡時有機率射出骨片'},
  {id:'archer', name:'荒弓前鋒', en:'Waste Archer', role:'箭矢／遠投', body:'amazon', col:'#2f8a78', passive:'遠距離進球傷害 +12%'},
  {id:'axer', name:'狂斧中鋒', en:'Axe Center', role:'戰斧／擦板', body:'barb', col:'#b5483f', passive:'擦板球使下次範圍傷害提高'},
  {id:'whistle', name:'聖哨後衛', en:'Holy Whistle', role:'生存／容錯', body:'paladin', col:'#aeb4b3', passive:'每關第一次失手只扣一半生命'},
  {id:'elem', name:'元素投手', en:'Elementalist', role:'火冰雷', body:'mage2', col:'#a97545', passive:'第一次元素能力自動+1級'},
  {id:'beast', name:'野獸控球', en:'Beast Handler', role:'混合／XP', body:'druid', col:'#c85e20', passive:'多殺 XP 提高，落地彈跳更誇張'},
];

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
  {id:2, key:'sand', name:'日蝕沙陵', sub:'Eclipse Dunes', sky:['#1a0d0a','#241410'], floor:'#1c1210', rune:'#ffb070', relic:'sand_bow', boss:'沙墓巨蟲'},
  {id:3, key:'city', name:'腐潮城邦', sub:'Rotting Citadel', sky:['#0e1a12','#101f16'], floor:'#0e1310', rune:'#9ac63f', relic:'citadel_battery', boss:'憎恨市長'},
  {id:4, key:'inferno', name:'違規煉獄', sub:'Foul Inferno', sky:['#1f0c08','#2a120a'], floor:'#1c0f08', rune:'#ff6a2a', relic:'red_axe', boss:'紅牌魔王'},
  {id:5, key:'final', name:'終場之巔', sub:'Overtime Summit', sky:['#0a0f1a','#101a2a'], floor:'#0e1320', rune:'#9fe6ff', relic:'final_chill', boss:'永遠延長賽之王'},
];
// stage: {act, idx, name, hostName, hostBody, guards:[ids], count, boss, waves, postier}
const STAGES = {
  1:[ {name:'血汗荒原', host:'血羽隊長', body:'captain', guards:['chain','skel'], count:9, tier:1, tut:true},
      {name:'亂葬球場', host:'墓鐘伯爵夫人', body:'countess', guards:['bat','zombie'], count:11, tier:2},
      {name:'地獄球具室', host:'鐵匠裁判', body:'smith', guards:['shield','drummer'], count:12, tier:2},
      {name:'地下籃堂', host:'痛苦院長', body:'dean', guards:['chain','bat','skel'], count:18, boss:true, waves:3, tier:3} ],
  2:[ {name:'漏水下水道', host:'排水中鋒', body:'drain', guards:['slime','chain'], count:10, tier:2, lift:true},
      {name:'弧線聖所', host:'召框術師', body:'summoner', guards:['eye','frost'], count:11, tier:3},
      {name:'真假七墓', host:'無名守墓人', body:'gravekeeper', guards:['bat','mummy'], count:12, tier:3, decoy:true},
      {name:'冷藏王墓', host:'沙墓巨蟲', body:'worm', guards:['slime','frost'], count:20, boss:true, waves:3, tier:4, burrow:true} ],
  3:[ {name:'蛛網森林', host:'八腳啦啦隊長', body:'spiderhost', guards:['spider','frost'], count:11, tier:3},
      {name:'矮鬼叢林', host:'鼓王小隊長', body:'drumlord', guards:['drummer','zombie'], count:12, tier:3},
      {name:'三哨議會', host:'吹錯哨三兄弟', body:'trio', guards:['chain','bat','frost'], count:13, tier:3, trio:true},
      {name:'憎恨球館', host:'憎恨市長', body:'mayor', guards:['chain','frost','drummer'], count:22, boss:true, waves:3, tier:4, throne:true} ],
  4:[ {name:'絕望外場', host:'墮落明星', body:'star', guards:['chain','shield'], count:12, tier:3},
      {name:'被禁賽之城', host:'紅牌騎士', body:'knight', guards:['bat','eye'], count:12, tier:4},
      {name:'火焰河熔爐', host:'鐵砧教練', body:'anvil', guards:['slime','shield'], count:14, tier:4, shieldElite:3},
      {name:'混沌聖館', host:'紅牌魔王', body:'redlord', guards:['chain','frost','eye'], count:24, boss:true, waves:3, tier:5} ],
  5:[ {name:'血汗山腳', host:'攻城教頭', body:'siege', guards:['drummer','chain','shield'], count:13, tier:4, catapult:true},
      {name:'凍板高原', host:'霜哨裁判', body:'frostref', guards:['frost','bat'], count:13, tier:4},
      {name:'三古裁判', host:'昨日今日延長賽', body:'trio', guards:['chain','bat','frost'], count:14, tier:4, trio:true},
      {name:'世界之筐', host:'永遠延長賽之王', body:'worldking', guards:['chain','frost','drummer','eye'], count:30, boss:true, waves:3, tier:5, finale:true} ],
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
    this.run=null; this._paused=false; this._confirm=null; this._toast=null;
    this.cam={y:0,zoom:1,ty:0,tz:1}; this.bgScroll=0;
    this.stars=this._mkStars();
    this._raf=null; this._last=0; this._dead=false;
    this._selAct=1; this._scroll=0;
  }
  _mkStars(){ const s=[]; for(let i=0;i<90;i++) s.push({x:Math.random()*BW,y:Math.random()*BH*0.7,r:Math.random()*1.8+0.4,a:Math.random()*0.5+0.2,tw:Math.random()*TAU}); return s; }

  boot(){ this._onResize=()=>{try{this.resize();}catch(err){this._hbErr(err);}}; window.addEventListener('resize',this._onResize); window.addEventListener('orientationchange',this._onResize);
    this._onVis=()=>{ if(document.hidden){ if(this.screen==='battle'&&this.run) this._paused=true; this.audio.stopTheme(); } };
    document.addEventListener('visibilitychange',this._onVis);
    this._bindInput(); this.resize(); this._last=performance.now();
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
    document.removeEventListener('visibilitychange',this._onVis); this.audio.stopTheme(); this._unbind&&this._unbind(); }

  resize(){ const r=this.root.getBoundingClientRect(); const cw=r.width||innerWidth, ch=r.height||innerHeight;
    this.dpr=Math.min(2,window.devicePixelRatio||1); this.canvas.width=Math.floor(cw*this.dpr); this.canvas.height=Math.floor(ch*this.dpr);
    this.portrait=ch>cw*1.04; const s=Math.min(cw/BW,ch/BH); this.scale=s; this.ox=(cw-BW*s)/2; this.oy=(ch-BH*s)/2; this.cw=cw; this.ch=ch; }
  toDesign(px,py){ return { x:(px-this.ox)/this.scale, y:(py-this.oy)/this.scale }; }

  _bindInput(){ const c=this.canvas; const xy=e=>{ const r=c.getBoundingClientRect(); return this.toDesign(e.clientX-r.left,e.clientY-r.top); };
    const down=e=>{ e.preventDefault(); this.audio.resume(); if(this.pointer.down) return; const p=xy(e);
      this.pointer.down=true; this.pointer.id=e.pointerId; this.pointer.sx=p.x; this.pointer.sy=p.y; this.pointer.x=p.x; this.pointer.y=p.y; this.pointer.moved=0; try{this.onDown(p.x,p.y);}catch(err){this._hbErr(err);} };
    const move=e=>{ if(!this.pointer.down||(this.pointer.id!=null&&e.pointerId!==this.pointer.id)) return; const p=xy(e); this.pointer.moved+=dist(this.pointer.x,this.pointer.y,p.x,p.y); this.pointer.x=p.x; this.pointer.y=p.y; try{this.onMove(p.x,p.y);}catch(err){this._hbErr(err);} };
    const up=e=>{ if(!this.pointer.down||(this.pointer.id!=null&&e.pointerId!==this.pointer.id)) return; const p=xy(e); this.pointer.down=false; this.pointer.id=null; try{this.onUp(p.x,p.y);}catch(err){this._hbErr(err);} };
    const wheel=e=>{ if(this._scrollable){ this._scroll=clamp(this._scroll+e.deltaY,0,this._scrollMax||0); } };
    c.addEventListener('pointerdown',down); c.addEventListener('pointermove',move); c.addEventListener('pointerup',up); c.addEventListener('pointercancel',up); c.addEventListener('wheel',wheel,{passive:true});
    this._unbind=()=>{ c.removeEventListener('pointerdown',down); c.removeEventListener('pointermove',move); c.removeEventListener('pointerup',up); c.removeEventListener('pointercancel',up); c.removeEventListener('wheel',wheel); };
  }
  vibrate(ms){ if(this.save.settings.vibrate&&navigator.vibrate){ try{navigator.vibrate(ms);}catch(e){} } }
  toast(m,sub){ this._toast={m,sub,t:2.6}; }
  confirm(m,onYes){ this._confirm={m,onYes}; }
  go(s){ this.screen=s; this._scroll=0; this.particles.length=0; this.floaters.length=0; this.audio.sfx('ui'); this.render(); }

  // ---- buttons ----
  btn(x,y,w,h,id,cb,opts){ this.buttons.push({x,y,w,h,id,cb,opts:opts||{}}); }
  hitButtons(x,y){ for(let i=this.buttons.length-1;i>=0;i--){ const b=this.buttons[i]; if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ this.audio.sfx('ui'); b.cb(); return true; } } return false; }

  // ---- pointer dispatch ----
  onDown(x,y){ if(this.portrait) return; if(this._confirm||this._toast) {} if(this.screen==='battle'&&!this._paused&&this.run){ this.battleDown(x,y); } }
  onMove(x,y){ if(this.screen==='battle'&&this.run) this.battleMove(x,y); }
  onUp(x,y){ if(this.portrait) return;
    if(this._confirm){ for(const b of this.buttons) if(b.opts._confirm&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ this.audio.sfx('ui'); b.cb(); return; } return; }
    if(this.screen==='battle'&&!this._paused&&this.run){ if(this.run.modal){ this.hitButtons(x,y); return; } this.battleUp(x,y); return; }
    this.hitButtons(x,y); this.render();
  }

  // ---- update ----
  update(dt){ this.updateFx(dt); if(this._toast){ this._toast.t-=dt; if(this._toast.t<=0)this._toast=null; } this.bgScroll+=dt*12;
    // camera ease
    this.cam.y=lerp(this.cam.y,this.cam.ty,clamp(dt*6,0,1)); this.cam.zoom=lerp(this.cam.zoom,this.cam.tz,clamp(dt*6,0,1));
    if(this.screen==='battle'&&this.run&&!this._paused&&!this.portrait&&!this.run.modal) this.updateBattle(dt);
    if(!this.portrait){ if(this.screen==='battle'&&this.run){ this.audio.startTheme(ACTS[this.run.act-1].key, this.run.stage.boss); } else if(this.screen==='home'||this.screen==='hub'){ this.audio.startTheme('hub',false); } else this.audio.stopTheme(); }
  }

  render(){ const ctx=this.ctx,dpr=this.dpr; ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.fillStyle='#06040a'; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    if(this.portrait){ this.drawRotate(); return; }
    ctx.setTransform(this.scale*dpr,0,0,this.scale*dpr,this.ox*dpr,this.oy*dpr);
    this.buttons=[]; this._scrollable=false;
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
      case 'win': case 'lose': this.drawEnd(); break;
    }
    this.drawFx();
    if(this._toast) this.drawToast();
    if(this._confirm) this.drawConfirm();
    ctx.setTransform(1,0,0,1,0,0);
  }

  drawRotate(){ const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height; const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#140f1c'); g.addColorStop(1,'#06040a'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.translate(w/2,h/2); ctx.scale(this.dpr,this.dpr); const t=this.t; ctx.strokeStyle='#e08a32'; ctx.lineWidth=4; ctx.save(); ctx.rotate(Math.sin(t*1.4)*0.5); ctx.strokeRect(-46,-78,92,156); ctx.restore();
    ctx.fillStyle='#ece0c4'; ctx.textAlign='center'; ctx.font='600 26px Georgia,serif'; ctx.fillText('請旋轉手機',0,130); ctx.font='15px Georgia,serif'; ctx.globalAlpha=0.7; ctx.fillText('橫向以進入籃獄',0,162); ctx.font='12px Georgia,serif'; ctx.globalAlpha=0.5; ctx.fillText('若畫面轉不過去，請關閉手機螢幕方向鎖定',0,192); ctx.restore(); }

  // ---- FX ----
  burst(x,y,n,color,spd,life,o){ o=o||{}; if(this.save.settings.reduceMotion||this.save.settings.lowPerf) n=Math.ceil(n*0.5); if(this.particles.length>900) return;
    for(let i=0;i<n;i++){ const a=Math.random()*TAU,s=spd*(0.4+Math.random()*0.8); this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:life*(0.6+Math.random()*0.5),max:life,r:(o.r||5)*(0.5+Math.random()),color,g:o.g||0,drag:o.drag||0.98,glow:o.glow}); } }
  spawn(x,y,vx,vy,life,r,color,o){ o=o||{}; if(this.particles.length>900) return; this.particles.push({x,y,vx,vy,life,max:life,r,color,g:o.g||0,drag:o.drag||0.98,glow:o.glow}); }
  ringFx(x,y,color,life){ this.particles.push({ring:true,x,y,color,life:life||0.5,max:life||0.5,r0:10,r1:240}); }
  floater(x,y,text,color,size,o){ o=o||{}; this.floaters.push({x,y,text,color,size:size||30,t:o.t||0.9,t0:o.t||0.9,vy:o.vy||-50,crit:o.crit}); }
  updateFx(dt){ const ps=this.particles; for(let i=ps.length-1;i>=0;i--){ const p=ps[i]; p.life-=dt; if(p.life<=0){ps.splice(i,1);continue;} if(p.ring)continue; p.vy+=p.g*dt; p.vx*=p.drag; p.vy*=p.drag; p.x+=p.vx*dt; p.y+=p.vy*dt; }
    const fs=this.floaters; for(let i=fs.length-1;i>=0;i--){ const f=fs[i]; f.t-=dt; if(f.t<=0){fs.splice(i,1);continue;} f.y+=f.vy*dt; f.vy*=0.92; } }
  drawFx(){ const ctx=this.ctx; for(const p of this.particles){ const a=clamp(p.life/p.max,0,1); ctx.globalAlpha=a;
      if(p.ring){ const rr=lerp(p.r0,p.r1,1-a); ctx.strokeStyle=p.color; ctx.lineWidth=lerp(12,1,1-a); ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,TAU); ctx.stroke(); continue; }
      if(p.glow){ctx.shadowBlur=14;ctx.shadowColor=p.color;} ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(0.3+a*0.7),0,TAU); ctx.fill(); if(p.glow)ctx.shadowBlur=0; }
    ctx.globalAlpha=1; ctx.textAlign='center'; for(const f of this.floaters){ const a=clamp(f.t/f.t0,0,1); ctx.globalAlpha=a; ctx.fillStyle=f.color; ctx.font=`${f.crit?'800':'700'} ${f.size}px Georgia,serif`; ctx.shadowBlur=6; ctx.shadowColor='#000'; ctx.fillText(f.text,f.x,f.y); ctx.shadowBlur=0; } ctx.globalAlpha=1; ctx.textAlign='left'; }

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
}
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

  // ---- backdrop per act ----
  backdrop(actKey){ const ctx=this.ctx; const A=ACTS.find(a=>a.key===actKey)||ACTS[0];
    const g=ctx.createLinearGradient(0,0,0,BH); g.addColorStop(0,A.sky[0]); g.addColorStop(1,A.sky[1]); ctx.fillStyle=g; ctx.fillRect(0,-400,BW,BH+800);
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
    const gg=ctx.createLinearGradient(0,fy,0,BH); gg.addColorStop(0,A.floor); gg.addColorStop(1,'#08060a'); ctx.fillStyle=gg; ctx.fillRect(0,fy,BW,BH-fy+400);
    let sd=actKey.length*7; const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;}; ctx.fillStyle='rgba(0,0,0,0.32)'; for(let i=0;i<40;i++){ ctx.beginPath(); ctx.ellipse(rnd()*BW,fy+rnd()*(BH-fy),8+rnd()*34,3+rnd()*9,0,0,TAU); ctx.fill(); }
  },

  // ---- hero body: EXACT bean-proposal art (unchanged) ----
  drawHero(heroId, cx, by, sc){ const map={shade:'_hAssassin',bone:'_hNecro',archer:'_hAmazon',axer:'_hBarb',whistle:'_hPaladin',elem:'_hMage',beast:'_hDruid'}; const fn=map[heroId]||'_hMage'; this[fn](cx,by,sc); },
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
];
Object.assign(Game.prototype,{
  // routeType: 'fast' | 'std' | 'corrupt' ; stone: id
  startRun(actId, routeType, stoneId){
    const s=this.save; const heroId=s.hero;
    // build stage path for this act
    const all=STAGES[actId]; let path;
    if(routeType==='fast'){ // 2 elite + boss
      path=[all[0],all[2],all[3]];
    } else if(routeType==='corrupt'){ path=[all[0],all[1],all[2],all[3]]; }
    else { path=[all[0],all[1],all[2],all[3]]; } // std
    if(stoneId==='nogate' && path.length>2){ path=[path[0],path[path.length-1]]; }
    // aggregate relic effects
    const relics=s.relics.filter(Boolean).map(id=>({id,...RELICS[id]}));
    let startForm='normal'; for(const r of relics){ if(r.form){ startForm=r.form; break; } }
    const hero=HEROES.find(h=>h.id===heroId);
    this.run={ act:actId, route:routeType, stone:stoneId, path, pi:0, stage:null,
      heroId, hero, relics, relicIds:s.relics.filter(Boolean),
      hp:100, maxhp:100, shield:0,
      form:startForm, level:1, xp:0, xpNext:25, pendingLevels:0,
      abilities:{}, words:[], comboMax:10, combo:0,
      score:0, shots:0, makes:0, swishes:0, banks:0, kills:0, bestCombo:0,
      host:null, hoop:null, guards:[], ball:null, projectiles:[], fx:[],
      aiming:false, aimX:0, aimY:0, intf:[], shotCount:0,
      modal:null, banner:null, invuln:0, hitFlash:0, shake:0,
      firstMissUsed:false, riftUsed:false, hexN:0, siphonCd:0,
      tutorial:!s.tutorialDone && actId===1,
      corrupt: routeType==='corrupt', heat: s.heat[actId+'-boss']||0,
      _acc:0, nextBall:0, _scoredBalls:0,
    };
    // champion ball relic / hero passives applied at use-time
    this.screen='battle'; this._paused=false; this.cam={y:0,zoom:1,ty:0,tz:1};
    this.enterStage(0);
  },

  enterStage(pi){ const run=this.run; run.pi=pi; const stage=run.path[pi]; run.stage=stage;
    run.guards=[]; run.projectiles=[]; run.fx=[]; run.intf=[]; run.shotCount=0; run.firstMissUsed=false;
    run.banner={ text:`${ACTS[run.act-1].name} · ${stage.name}`, sub: stage.boss?'幕級 BOSS':'菁英宿主', t:2.6 };
    // host
    const lefty=this.save.settings.lefty; const baseHostX = lefty? 560 : BW-560;
    run.host={ name:stage.host, body:stage.body, x:baseHostX, y:BH-300, baseY:BH-300, moving:0, mx:baseHostX, anim:0,
      boss:!!stage.boss, phase:1, posIdx:0, hop:0 };
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

  pickHoopPos(force){ const run=this.run; const host=run.host; const H=run.hoop;
    // choose a pool point appropriate to tier, not same as last, not occluded
    const tier=run.stage.tier||2; const maxIdx=Math.min(POS_POOL.length, 3+tier);
    let idx, guard=0; do{ idx=randi(0,maxIdx-1); guard++; } while(idx===H.posIdx && guard<10);
    H.posIdx=idx; const p=POS_POOL[idx]; const lefty=this.save.settings.lefty;
    // target host position so hoop lands at a good spot; host shuffles, hoop offset from host
    host.tx = clamp(host.baseX!=null?host.baseX:host.x, lefty?480:BW-720, lefty?900:BW-360);
    H.tx = clamp((lefty? 1920-(720) : (BW-560)) + (lefty?-p.dx:p.dx), 760, BW-80);
    H.ty = host.baseY + p.dy;
    H.label = p.label;
    if(force){ H.x=H.tx; H.y=H.ty; host.x=host.mx; }
    run.repos=force?0:0.7; // reposition timer (host moves)
  },

  spawnBall(){ const run=this.run; if(!run) return; const lefty=this.save.settings.lefty; const hx=lefty?BW-210:210;
    run.ball={ x:hx, y:BH-168, vx:0, vy:0, r:28, spin:0, angVel:0, live:false, held:true, scored:false, hitBoard:false, hitRim:false, lefty, settle:0, born:this.t, landed:false, _py:undefined };
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
    const dx=b.x-x, dy=b.y-y, pull=Math.hypot(dx,dy);
    if(pull<60) return; // cancel
    let maxPull=520; if(this._intfActive('maxPull')) maxPull*=0.85;
    const p=clamp(pull,0,maxPull)/maxPull; const power=lerp(820,2650,p); const ang=Math.atan2(dy,dx);
    b.vx=Math.cos(ang)*power; b.vy=Math.sin(ang)*power; b.angVel=(b.lefty?-1:1)*(-b.vx*0.004+6);
    b.live=true; b.held=false; b.scored=false; b.hitBoard=false; b.hitRim=false; b.landed=false; b.born=this.t;
    run.shots++; this.save.stats.totalShots++; this.audio.sfx('release'); this.audio.sfx('whoosh'); this.vibrate(8);
    if(run.tutorial&&(run.tutStep||0)<3) run.tutStep=3;
  },

  _intfActive(kind){ const run=this.run; return run.intf.some(i=>i.kind===kind&&i.shots>0); },
  _gravMul(){ return this._intfActive('gravity')? 1.25:1; },

  // ----- shot physics (no ceiling, land-through-net) -----
  stepBall(h){ const run=this.run; const b=run.ball; if(!b||!b.live) return;
    const G=2600*this._gravMul(), DRAG=0.0016;
    b.vy+=G*h; const sp=Math.hypot(b.vx,b.vy); b.vx-=b.vx*DRAG*sp*h*0.012; b.vy-=b.vy*DRAG*sp*h*0.012;
    b.x+=b.vx*h; b.y+=b.vy*h; b.spin+=b.angVel*h;
    const floorY=BH-92;
    if(b.y+b.r>floorY && b.vy>0){ b.y=floorY-b.r; b.vy*=-0.5; b.vx*=0.82; b.angVel*=0.6; if(Math.abs(b.vy)>120){ this.audio.sfx('floor'); this.burst(b.x,floorY,5,'#6a5238',180,0.4,{r:3,g:600}); } if(!b.landed&&b.scored){ b.landed=true; this.landingFx(); } }
    if(b.x-b.r<0){ b.x=b.r; b.vx*=-0.5; } if(b.x+b.r>BW){ b.x=BW-b.r; b.vx*=-0.5; }
    // NO ceiling: allow negative y. camera follows high shots
    this.collideHoop(b);
    const speed=Math.hypot(b.vx,b.vy);
    if(speed<60 && b.y+b.r>=floorY-2){ b.settle+=h; if(b.settle>0.25){ if(!b.scored) this.endShot(false); else this.endShot(true); } } else b.settle=0;
    if(this.t-b.born>7){ if(!b.scored) this.endShot(false); else this.endShot(true); }
  },
  collideHoop(b){ const run=this.run; const H=run.hoop; if(!H) return;
    const boardX=H.x+H.rimR+8, bt=H.y-H.boardH*0.55, bb=H.y+H.boardH*0.45;
    if(b.x+b.r>boardX&&b.x-b.r<boardX+H.boardW&&b.y>bt&&b.y<bb&&b.vx>0){ b.x=boardX-b.r; b.vx*=-0.6; b.vy*=0.92; b.hitBoard=true; this.audio.sfx('board'); this.burst(boardX,b.y,4,ACTS[run.act-1].rune,140,0.35,{r:3}); H.glow=0.5; }
    const lx=H.x-H.rimR, rx=H.x+H.rimR;
    for(const rxp of [lx,rx]){ const d=dist(b.x,b.y,rxp,H.y); if(d<b.r+H.rimThick){ const nx=(b.x-rxp)/(d||1),ny=(b.y-H.y)/(d||1); const ov=b.r+H.rimThick-d; b.x+=nx*ov; b.y+=ny*ov; const dot=b.vx*nx+b.vy*ny; b.vx-=1.6*dot*nx; b.vy-=1.6*dot*ny; b.vx*=0.78; b.vy*=0.78; b.hitRim=true; this.audio.sfx('rim'); H.glow=0.6; } }
    if(!b.scored && b.vy>0 && b._py!=null){ if(b._py<=H.y && b.y>=H.y && b.x>lx+6 && b.x<rx-6){ this.makeBasket(); H.net=18; } }
    b._py=b.y;
  },
  landingFx(){ const run=this.run; const b=run.ball; const f=run.form;
    if(f==='fire'){ this.burst(b.x,b.y,10,'#ff7a3c',200,0.5,{glow:true,r:4}); }
    else if(f==='ice'){ this.burst(b.x,b.y,12,'#6fd8ff',160,0.6,{r:3}); this.ringFx(b.x,b.y,'#6fd8ff',0.4); }
    else if(f==='lightning'){ this.burst(b.x,b.y,8,'#ffe14d',240,0.4,{glow:true,r:3}); }
    else if(f==='axe'){ this.audio.sfx('axe'); this.burst(b.x,b.y,8,'#cdd2da',180,0.4,{r:4}); }
    else if(f==='arrow'){ this.burst(b.x,b.y,6,'#b9f06a',160,0.4,{r:3}); }
    else this.burst(b.x,b.y,6,'#6a5238',180,0.4,{r:3});
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
    if(run.guards.length===0 && !run._stageClearing && !run.modal){ this.onStageClear(); }
    if(run.hp<=0 && !run._dead2){ run._dead2=true; this.finishRun(false); }
  },

  // ----- basket -----
  makeBasket(){ const run=this.run; const b=run.ball; if(b.scored) return; b.scored=true;
    const swish=!b.hitBoard&&!b.hitRim, bank=b.hitBoard&&!swish; const H=run.hoop; H.lit=1; H.glow=1;
    run.makes++; run.combo++; run.bestCombo=Math.max(run.bestCombo,run.combo); if(swish){run.swishes++;this.save.stats.swishes++;} if(bank){run.banks++;this.save.stats.banks++;}
    this.audio.sfx(swish?'swish':bank?'bank':'score'); this.vibrate(swish?30:bank?20:12);
    this.burst(H.x,H.y+24,swish?22:14,swish?'#fff0c0':ACTS[run.act-1].rune,swish?320:220,0.7,{glow:true,r:5,g:300});
    // score + xp
    const base=swish?160:bank?130:100; const cMul=1+run.combo*0.1; const sc=Math.round(base*cMul); run.score+=sc;
    this.floater(H.x,H.y-50,'+'+sc,'#e6c068',32,{vy:-70}); if(swish)this.floater(H.x,H.y-100,'空心 SWISH','#fff0c0',28,{crit:true}); else if(bank)this.floater(H.x,H.y-100,'擦板 BANK','#e08a32',26);
    let xp=swish?15:bank?12:10; if(run.abilities.quicklearn)xp*=(1.2+run.abilities.quicklearn*0.1); if(run.stone==='hunter')xp*=1.2; if(run.heroId==='beast')xp*=1.1;
    // fire form attack
    const dmg=this.shotDamage(swish,bank); const ctx={hx:H.x,hy:H.y,swish,bank,dmg,combo:run.combo,firstScore:!run._scoredBalls,firstSwish:swish&&!run._firstSwishDone};
    if(swish)run._firstSwishDone=true; run._scoredBalls++;
    BALL_FORMS[run.form].attack(this,ctx);
    // relic on-basket
    this.relicOnBasket(swish,bank,ctx);
    // ability on-basket (non-form)
    this.abilityOnBasket(swish,bank,dmg,ctx);
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
  formFire(c){ const run=this.run; const center=this._nearestCluster()||this._nearestGuard(c.hx,c.hy); if(!center){return;} this.beam(c.hx,c.hy,center,'#ff7a3c'); this.audio.sfx('fire'); this.ringFx(center.x,center.y,'#ff7a3c',0.5);
    const burn=2+(run.abilities.ember||0); for(const g of run.guards){ if(dist(center.x,center.y,g.x,g.y)<170+g.r){ this.hurtGuard(g,c.dmg*(g===center?1:0.7),c); g.burn=Math.max(g.burn,burn); g.burnDps=Math.max(g.burnDps,c.dmg*0.25); this.burst(g.x,g.y,5,'#ff7a3c',160,0.5,{glow:true,r:3,g:-30}); } } },
  formIce(c){ const run=this.run; const list=[...run.guards].sort((a,b)=>(b.casting?1:0)-(a.casting?1:0)||dist(c.hx,c.hy,a.x,a.y)-dist(c.hx,c.hy,b.x,b.y)).slice(0,randi(3,5));
    this.audio.sfx('ice'); for(const g of list){ this.beam(c.hx,c.hy,g,'#6fd8ff'); this.hurtGuard(g,c.dmg,c); g.frozen=true; g.freeze=3+(run.abilities.deepfreeze?run.abilities.deepfreeze*0.6:0); g.cast=0; g.casting=false; this.burst(g.x,g.y,8,'#6fd8ff',140,0.5,{r:3}); } },
  formLightning(c){ const run=this.run; let n=4+(run.abilities.chain||0)+(c.swish?(run.abilities.overload?1+run.abilities.overload:1):0); this.audio.sfx('lightning');
    let cur={x:c.hx,y:c.hy}; const hit=new Set(); for(let i=0;i<n;i++){ let best=null,bd=1e9; for(const g of run.guards){ if(hit.has(g))continue; const d=dist(cur.x,cur.y,g.x,g.y); if(d<bd){bd=d;best=g;} } if(!best)break; this.arc(cur.x,cur.y,best.x,best.y); this.hurtGuard(best,c.dmg*(0.85-i*0.05),c); hit.add(best); cur=best; } },
  formAxe(c){ const run=this.run; this.audio.sfx('axe'); const dir=c.hx>BW/2?-1:1; const hits=[...run.guards].sort((a,b)=>a.x-b.x); const retMul=1+(run.abilities.returnblade?0.3+run.abilities.returnblade*0.1:0); const cap=2;
    run.projectiles.push({kind:'axe',x:c.hx,y:c.hy,dir,t:0,phase:'out',dmg:c.dmg,retMul,cap,hitCount:{}, big:(c.bank?1:0)+(run.abilities.bigaxe||0)}); },
  formArrow(c){ const run=this.run; this.audio.sfx('arrow'); // aim at caster else nearest
    let tg=run.guards.find(g=>g.casting)||this._nearestGuard(c.hx,c.hy); if(!tg)return; const a=Math.atan2(tg.y-c.hy,tg.x-c.hx);
    const pierce=1+(run.abilities.pierce||0)+(run.relicIds.includes('sand_bow')?1:0); run.projectiles.push({kind:'arrow',x:c.hx,y:c.hy,vx:Math.cos(a)*1400,vy:Math.sin(a)*1400,t:1.2,dmg:c.dmg,pierce,hit:new Set(),split:(run.abilities.splitarrow||0)}); },
  _nearestGuard(x,y){ const run=this.run; let best=null,bd=1e9; for(const g of run.guards){ const d=dist(x,y,g.x,g.y); if(d<bd){bd=d;best=g;} } return best; },
  beam(x1,y1,g,color){ const run=this.run; if(g) run.fx.push({kind:'beam',x1,y1,x2:g.x,y2:g.y,color,t:0.2,max:0.2}); },
  arc(x1,y1,x2,y2){ this.run.fx.push({kind:'arc',x1,y1,x2,y2,t:0.18,max:0.18}); },

  abilityOnBasket(swish,bank,dmg,c){ const run=this.run,a=run.abilities;
    if(a.triple){ run._tri=(run._tri||0)+1; if(run._tri%3===0){ const g=this._nearestCluster(); if(g) this.aoe(g.x,g.y,200,18+a.triple*8,'#ff7a3c'); } }
    if(a.overload&&swish&&run.form!=='lightning'){ const g=this._nearestGuard(c.hx,c.hy); if(g)this.aoe(g.x,g.y,150,16+a.overload*8,'#ffe14d'); }
  },
  aoe(x,y,rad,dmg,color){ const run=this.run; this.ringFx(x,y,color,0.5); this.burst(x,y,14,color,240,0.5,{glow:true,r:4}); for(const g of run.guards){ if(dist(x,y,g.x,g.y)<rad+g.r) this.hurtGuard(g,dmg,{}); } },

  hurtGuard(g,dmg,c,primary){ if(!g||g.dead)return; const run=this.run; c=c||{};
    if(g.shieldUp&&primary){ g.shieldUp=false; this.audio.sfx('rim'); this.burst(g.x,g.y,12,'#b8b0a0',200,0.5,{r:4}); this.floater(g.x,g.y-g.r-8,'破盾','#b8b0a0',22); return; }
    const a=run.abilities; if(a.execute&&g.hp<g.maxhp*0.35)dmg*=1.4+a.execute*0.15; if(a.witchaim&&g.casting)dmg*=1.5+a.witchaim*0.15;
    dmg=Math.round(dmg); g.hp-=dmg; g.flash=1; run.score+=dmg; this.floater(g.x+rand(-10,10),g.y-g.r-10,''+dmg,c.swish?'#fff0c0':c.bank?'#e08a32':'#ece0c4',c.swish?30:24,{crit:c.swish}); this.burst(g.x,g.y,5,g.color,160,0.4,{r:3});
    if(g.hp<=0) this.killGuard(g);
  },
  killGuard(g){ const run=this.run; if(g.dead)return; g.dead=true; this.audio.sfx('death'); this.burst(g.x,g.y,18,g.color,240,0.7,{glow:true,r:4,g:200}); this.ringFx(g.x,g.y,g.color,0.45);
    run.kills++; run.score+=120; this.gainXP(2); if(g._lastHitMulti)this.gainXP(0);
    if(run.abilities.shatter&&g.frozen) this.aoe(g.x,g.y,180,20+run.abilities.shatter*10,'#6fd8ff');
    if(run.heroId==='bone'&&chance(0.4)){ const t=this._nearestGuardExcept(g); if(t){ this.arc(g.x,g.y,t.x,t.y); this.hurtGuard(t,12,{}); } }
    const i=run.guards.indexOf(g); if(i>=0)run.guards.splice(i,1);
    this.floater(g.x,g.y-g.r,'+1','#a2926e',20,{vy:-40});
  },
  _nearestGuardExcept(ex){ const run=this.run; let best=null,bd=1e9; for(const g of run.guards){ if(g===ex)continue; const d=dist(ex.x,ex.y,g.x,g.y); if(d<bd){bd=d;best=g;} } return best; },

  // ----- XP / level -----
  gainXP(n){ const run=this.run; run.xp+=n; while(run.xp>=run.xpNext){ run.xp-=run.xpNext; run.level++; run.pendingLevels++; run.xpNext=run.level<6? 15+run.level*10 : 70; }
    if(run.pendingLevels>0 && !run.modal && (!run.ball||!run.ball.live)) this.openLevelUp(); }
  ,
  // ----- end of shot / interference advance -----
  endShot(scored){ const run=this.run; const b=run.ball; if(!b)return; b.live=false;
    if(!scored){ // miss
      let dmg = run.stage.boss?15: run.stage.tier>=3?12:10; if(run.corrupt)dmg=Math.round(dmg*1.2);
      const a=run.abilities; let immune=false;
      if(run.stone==='seal'&&!run._sealUsed){ run._sealUsed=true; immune=true; }
      if(a.secondchance&&!run.firstMissUsed){ run.firstMissUsed=true; immune=true; this.floater(b.x,b.y-40,'第二次機會','#e6c068',24); }
      if(run.heroId==='whistle'&&!run.firstMissUsed){ run.firstMissUsed=true; dmg=Math.round(dmg/2); }
      if(!immune) this.playerHurt(dmg);
      run.combo=0;
    }
    // advance interference per shot
    this.advanceInterference();
    // host reposition only after a scored shot
    if(scored && run.guards.length>0){ this.pickHoopPos(false); }
    else if(scored && run.guards.length===0){ /* clear handled */ }
    run.nextBall=Math.max(run.nextBall,0.3);
    // pending levels
    if(run.pendingLevels>0&&!run.modal) this.openLevelUp();
  },
  playerHurt(dmg){ const run=this.run; if(run.shield>0){ const a=Math.min(run.shield,dmg); run.shield-=a; dmg-=a; }
    if(dmg>0){ if(run.relicIds.includes('rift_feather')&&!run.riftUsed&&run.hp-dmg<=0){ run.riftUsed=true; run.hp=1; this.floater(220,BH-280,'裂隙羽骨!','#6fd8ff',30,{crit:true}); } else run.hp-=dmg; }
    run.invuln=0.4; run.hitFlash=1; run.shake=12; this.audio.sfx('hurt'); this.vibrate(40); this.floater(220,BH-300,'-'+(dmg||0),'#e6433c',30,{vy:-50}); }
  ,
  advanceInterference(){ const run=this.run; run.shotCount++;
    // tick down existing
    for(let i=run.intf.length-1;i>=0;i--){ run.intf[i].shots--; if(run.intf[i].shots<=0)run.intf.splice(i,1); }
    // guards: advance cast countdown by one
    let drummed=false;
    for(const g of run.guards){ if(g.intf&&g.castMax>0){ if(g.cast<g.castMax){ g.cast++; g.casting=g.cast>=g.castMax-1; } if(g.cast>=g.castMax){ this.guardCast(g); g.cast=0; g.casting=false; } } }
  },
  guardCast(g){ const run=this.run; const kind=g.intf; if(!kind)return; const def=INTERFERENCES[kind];
    if(kind==='drum'){ for(const o of run.guards){ if(o!==g&&o.intf&&o.cast<o.castMax){ o.cast++; } } this.floater(g.x,g.y-g.r-20,'催促!','#c46a3a',22); this.audio.sfx('hit'); return; }
    // limit one main + one secondary
    let shots=def.shots; if(run.relicIds.includes('broken_glass'))shots=Math.max(1,shots-1);
    if(kind==='shortTraj'&&run.relicIds.includes('ref_glasses'))shots=Math.max(1,Math.ceil(shots/2));
    run.intf=run.intf.filter(i=>i.kind!==kind); run.intf.push({kind,shots,name:def.name}); if(run.intf.length>2)run.intf.shift();
    this.floater(g.x,g.y-g.r-20,def.name,'#e6c068',22); this.audio.sfx('ice');
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
      // orbit host (NO advance toward player) — idle drift around anchor
      g.wphase+=dt*1.6; const tx=g.bx + Math.cos(g.wphase)*10, ty=g.by + Math.sin(g.wphase*1.3)*8;
      g.x=lerp(g.x, tx + (host.x-host.mx||0), clamp(dt*2,0,1)); g.y=lerp(g.y, ty, clamp(dt*2,0,1));
    }
  },
  updateProjectiles(dt){ const run=this.run;
    for(let i=run.projectiles.length-1;i>=0;i--){ const p=run.projectiles[i];
      if(p.kind==='axe'){ p.t+=dt; const speed=900; if(p.phase==='out'){ p.x+=p.dir*speed*dt; for(const g of run.guards){ if((p.hitCount[g.type]||0)<1 && dist(p.x,p.y,g.x,g.y)<g.r+30){ this.hurtGuard(g,p.dmg,{}); p.hitCount[g.type]=(p.hitCount[g.type]||0)+1; } } if(p.t>0.6){ p.phase='back'; } }
        else { p.x-=p.dir*speed*dt; for(const g of run.guards){ if(dist(p.x,p.y,g.x,g.y)<g.r+30+p.big*8){ this.hurtGuard(g,p.dmg*p.retMul,{}); } } if(p.t>1.4){ run.projectiles.splice(i,1); continue; } }
        this.burst(p.x,p.y,1,'#cdd2da',60,0.2,{r:5}); }
      else if(p.kind==='arrow'){ p.t-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; for(const g of run.guards){ if(!p.hit.has(g)&&dist(p.x,p.y,g.x,g.y)<g.r+18){ this.hurtGuard(g,p.dmg,{}); p.hit.add(g); p.pierce--; if(p.split>0){ for(let s=0;s<p.split;s++){ const a=rand(0,TAU); run.projectiles.push({kind:'arrow',x:g.x,y:g.y,vx:Math.cos(a)*1100,vy:Math.sin(a)*1100,t:0.6,dmg:p.dmg*0.5,pierce:1,hit:new Set(),split:0}); } p.split=0; } if(p.pierce<=0){ p.t=0; } } } this.spawn(p.x,p.y,0,0,0.2,3,'#b9f06a',{glow:true}); if(p.t<=0||p.x<0||p.x>BW||p.y<-400||p.y>BH){ run.projectiles.splice(i,1); } }
    }
  },

  // ----- level up modal -----
  openLevelUp(){ const run=this.run; if(run.pendingLevels<=0)return; run.pendingLevels--;
    // first level: choose form (unless relic forced a non-normal start AND it's literally first)
    if(!run._formChosen && run.form==='normal'){ run._formChosen=true; run.modal={kind:'form', choices:FORM_CHOICES.slice()}; return; }
    run._formChosen=true;
    // ability choices from trees
    const avail=ABILITIES.filter(a=>(run.abilities[a.id]||0)<3);
    const pool=avail.length>=3?avail:ABILITIES.slice(); const ch=[]; const used=new Set();
    let extra=run.relicIds.includes('bench_towel')||run.stone==='bench'?1:0;
    while(ch.length<3&&used.size<pool.length){ const a=pick(pool); if(used.has(a.id))continue; used.add(a.id); ch.push(a); }
    run.modal={kind:'ability', choices:ch, reroll:extra};
  },
  chooseForm(f){ const run=this.run; run.form=f; this.audio.sfx('select'); this.floater(BW/2,BH*0.4,BALL_FORMS[f].name+'!','#e6c068',44,{crit:true,vy:-30,t:1.4}); run.modal=null;
    // elem hero auto-level first element ability later; continue pending
    if(run.pendingLevels>0) this.openLevelUp(); else this.afterModal(); },
  chooseAbility(a){ const run=this.run; run.abilities[a.id]=(run.abilities[a.id]||0)+1; this.audio.sfx('levelup');
    if(run.heroId==='elem'&&a.tree==='element'&&run.abilities[a.id]<3&&!run._elemBonus){ run._elemBonus=true; run.abilities[a.id]++; }
    run.modal=null; this.checkBallWords();
    if(run.pendingLevels>0) this.openLevelUp(); else this.afterModal(); },
  rerollAbility(){ const run=this.run; if(!run.modal||run.modal.reroll<=0)return; run.modal.reroll--; const avail=ABILITIES.filter(a=>(run.abilities[a.id]||0)<3); const pool=avail.length>=3?avail:ABILITIES.slice(); const ch=[]; const used=new Set(); while(ch.length<3&&used.size<pool.length){ const a=pick(pool); if(used.has(a.id))continue; used.add(a.id); ch.push(a); } run.modal.choices=ch; this.audio.sfx('ui'); },
  afterModal(){ const run=this.run; if(run.guards.length===0) this.onStageClear(); },

  checkBallWords(){ const run=this.run; for(const w of BALL_WORDS){ if(run.words.includes(w.id))continue; if(w.form&&run.form!==w.form)continue; if(w.need.every(id=>run.abilities[id])){ run.words.push(w.id); this.audio.sfx('word'); this.audio.sfx('whistle'); run.banner={text:w.name,sub:w.en+' · 球語成立',t:2.6}; this.ringFx(BW/2,BH*0.4,'#e6c068',0.8); } } },

  // ----- relics on basket -----
  relicOnBasket(swish,bank,c){ const run=this.run; const ids=run.relicIds;
    if(ids.includes('abbey_ember')&&c.firstScore){ this.aoe(c.hx,c.hy,9999,c.dmg*0.6,'#ff7a3c'); }
    if(ids.includes('citadel_battery')&&swish&&!run._battUsed){ run._battUsed=true; for(const g of run.guards){this.hurtGuard(g,c.dmg*0.6,{});} this.audio.sfx('lightning'); }
    if(ids.includes('final_chill')&&!run._chillUsed){ run._chillUsed=true; const cg=run.guards.find(g=>g.casting); if(cg){cg.cast=0;cg.casting=false;cg.frozen=true;cg.freeze=2;} }
    if(ids.includes('kings_seal')&&bank){ run.shield+=6; }
    if(ids.includes('blood_chalice')&&run.combo>=5){ run._bcN=(run._bcN||0)+1; if(run._bcN%2===0)this.heal(2); }
    if(ids.includes('pilgrim_bone')){ /* on stage clear */ }
    if(ids.includes('hex_idol')){ run.hexN++; if(run.hexN%5===0){ const g=this._nearestGuard(c.hx,c.hy); if(g){ const fx=pick(['fire','ice','lightning']); if(fx==='fire'){g.burn=3;g.burnDps=c.dmg*0.3;} else if(fx==='ice'){g.frozen=true;g.freeze=2;} else this.aoe(g.x,g.y,140,16,'#ffe14d'); } } }
  },
  heal(n){ const run=this.run; run.hp=Math.min(run.maxhp,run.hp+n); this.floater(220,BH-260,'+'+n,'#6fae4a',24,{vy:-40}); },

  // ----- stage clear / waves / finish -----
  onStageClear(){ const run=this.run; if(run._stageClearing)return;
    // boss waves
    if(run.spawned<run.guardsTotal){ run.bossWave++; const n=Math.min(run.waveSize, run.guardsTotal-run.spawned); this.spawnWave(n); run.spawned+=n;
      run.host.phase=run.bossWave+1; run.banner={text:run.host.name,sub:'第'+(run.bossWave+1)+'階段',t:1.8}; this.audio.sfx('boss'); this.pickHoopPos(true); if(!run.ball||(!run.ball.live&&!run.ball.held))this.spawnBall(); return; }
    run._stageClearing=true; this.audio.sfx('levelup');
    if(run.relicIds.includes('pilgrim_bone')) this.heal(Math.round(run.maxhp*0.08));
    if(run.tutorial){ run.tutorial=false; this.save.tutorialDone=true; persist(this.save); }
    setTimeout(()=>{ if(this.run!==run)return; run._stageClearing=false;
      if(run.pi+1>=run.path.length){ this.finishRun(true); }
      else { // mid-run: offer a relic? give a relic choice after boss only; here just advance, drop relic if last was boss
        this.enterStage(run.pi+1);
      }
    }, 800);
  },

  finishRun(won){ const run=this.run; this._stageClearing=false; const s=this.save;
    // stats
    const acc=run.shots? run.makes/run.shots:0;
    s.stats.bestScore=Math.max(s.stats.bestScore,run.score); s.stats.bestCombo=Math.max(s.stats.bestCombo,run.bestCombo); s.stats.bestAcc=Math.max(s.stats.bestAcc,acc);
    s.coins += run.kills*3 + (won?60:20);
    let loot=null, marks=0;
    if(won){
      const bossId=run.act+'-boss'; s.bossClears[bossId]=(s.bossClears[bossId]||0)+1;
      marks = run.route==='corrupt'?3: run.route==='std'?2:1; s.marks[bossId]=(s.marks[bossId]||0)+marks;
      if(run.act>=s.acts && run.act<5){ s.acts=run.act+1; }
      if(run.act===5){ s.endless=true; }
      // signature relic chance + a few rolls
      loot=this.rollLoot(run);
      // heat up this route
      s.heat[bossId]=Math.min(5,(s.heat[bossId]||0)+1);
      s.memory[bossId]='cleared';
    }
    persist(s);
    this._endStats={ won, act:run.act, stageName: run.path[run.pi]?.name||'', score:run.score, acc, swishes:run.swishes, banks:run.banks, bestCombo:run.bestCombo, kills:run.kills, words:run.words.slice(), reached:run.pi+1, total:run.path.length, loot, marks, picked:false };
    this.screen=won?'win':'lose'; this.audio.sfx(won?'win':'lose'); if(won)this.audio.sfx('whistle');
    this.particles.length=0; this.floaters.length=0;
    this.run=null;
  },
  rollLoot(run){ const owned=new Set([...run.relicIds, ...this.save.library]); const all=Object.keys(RELICS);
    const out=[]; // guarantee signature for this act sometimes
    const sig=ACTS[run.act-1].relic; if(!owned.has(sig)&&chance(run.route==='corrupt'?0.8:0.5))out.push(sig);
    const pool=all.filter(id=>!owned.has(id)&&!out.includes(id));
    while(out.length<3&&pool.length){ const id=pick(pool); out.push(id); pool.splice(pool.indexOf(id),1); }
    while(out.length<3&&all.length){ out.push(pick(all)); }
    return out;
  },
});
// === part 8 below ===
// ============================================================
// PART 8 — menu screens
// ============================================================
Object.assign(Game.prototype,{
  drawHome(){ const ctx=this.ctx; this.backdrop('hub');
    // rotating portal emblem
    const cx=BW/2,cy=320,t=this.t; ctx.save(); ctx.translate(cx,cy);
    for(let i=0;i<3;i++){ ctx.globalAlpha=0.22-i*0.05; ctx.strokeStyle='#e08a32'; ctx.lineWidth=8-i*2; ctx.beginPath(); ctx.ellipse(0,0,140+i*26,140+i*26,t*0.3+i,0,TAU); ctx.stroke(); }
    ctx.globalAlpha=1; ctx.rotate(t*0.5); ctx.strokeStyle='#ff7a3c'; ctx.lineWidth=10; ctx.shadowBlur=28; ctx.shadowColor='#ff7a3c'; ctx.beginPath(); ctx.arc(0,0,104,0,TAU); ctx.stroke(); ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(201,139,255,0.6)'; ctx.lineWidth=2; for(let i=0;i<10;i++){ const a=i/10*TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a)*102,Math.sin(a)*102); ctx.lineTo(Math.cos(a)*38,86); ctx.stroke(); } ctx.restore();
    if(chance(0.4)) this.spawn(cx+rand(-90,90),cy+50,rand(-10,10),rand(-60,-20),rand(0.8,1.6),rand(2,5),'#ff7a3c',{glow:true,g:-10});
    // title
    this.text('籃框破壞神',BW/2,640,96,'#ece0c4',{align:'center',weight:'800',glow:16});
    // big cartoon logo
    ctx.save(); ctx.translate(BW/2,738); ctx.rotate(-0.03); const logo='HOOPBREAKER'; ctx.font='800 76px Georgia,serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillText(logo,5,8); ctx.lineJoin='round'; ctx.lineWidth=20; ctx.strokeStyle='#140a06'; ctx.strokeText(logo,0,0);
    const lg=ctx.createLinearGradient(0,-40,0,40); lg.addColorStop(0,'#ffd24a'); lg.addColorStop(0.5,'#ff8a2a'); lg.addColorStop(1,'#c4342a'); ctx.fillStyle=lg; ctx.fillText(logo,0,0); ctx.restore();
    this.text('籃獄圖譜 · ATLAS OF OVERTIME',BW/2,788,24,'#a2926e',{align:'center'});
    this.text('世界毀滅了，延長賽還沒結束。',BW/2,820,22,'rgba(220,210,200,0.7)',{align:'center'});
    const s=this.save; this.text(`已解鎖第 ${s.acts} 幕　·　最高分 ${s.stats.bestScore|0}　·　最高連擊 ${s.stats.bestCombo}`,BW/2,856,20,'rgba(220,210,200,0.5)',{align:'center'});
    const bw=440,bh=84,x=BW/2-bw/2; let y=884;
    this.button(x,y,bw,bh,'進入板凳席','hub',()=>this.go('hub'),{primary:true,size:32});
    const sw=(bw-44)/3;
    this.button(x,y+bh+18,sw,68,'玩法','codex',()=>this.go('codex'),{size:24});
    this.button(x+sw+22,y+bh+18,sw,68,'設定','set',()=>this.go('settings'),{size:24});
    this.button(x+sw*2+44,y+bh+18,sw,68,'圖鑑','codex2',()=>this.go('codex'),{size:24});
  },

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
    this.button(bx+bw+30,560,bw,bh,'選擇投手','heroes',()=>this.go('heroes'),{size:26});
    this.button(bx,560+bh+24,bw,bh,'籃魂聖匣','relics',()=>this.go('relics'),{size:26});
    this.button(bx+bw+30,560+bh+24,bw,bh,'宿主圖鑑','codex',()=>this.go('codex'),{size:26});
    if(s.endless) this.button(BW/2-200,560+bh*2+48,400,64,'∞ 無盡加時 (最佳 '+s.endlessBest+')','endless',()=>this.startEndless(),{size:24,color:'#e6c068'});
    this.button(70,60,150,60,'← 首頁','home',()=>this.go('home'),{size:22});
    this.text('金幣 '+s.coins,BW-80,90,24,'#e6c068',{align:'right',weight:'700'});
  },
  _campfire(cx,cy){ const ctx=this.ctx,t=this.t; ctx.save(); ctx.translate(cx,cy); const gl=ctx.createRadialGradient(0,0,10,0,0,260); gl.addColorStop(0,'rgba(255,140,60,0.4)'); gl.addColorStop(1,'rgba(255,140,60,0)'); ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,260,0,TAU); ctx.fill();
    ctx.strokeStyle='#0d0c0b'; ctx.lineWidth=8; ctx.fillStyle='#4b3425'; ctx.save(); ctx.rotate(0.27); ctx.fillRect(-45,-9,90,18); ctx.strokeRect(-45,-9,90,18); ctx.restore(); ctx.save(); ctx.rotate(-0.27); ctx.fillRect(-45,-9,90,18); ctx.strokeRect(-45,-9,90,18); ctx.restore();
    const f=1+Math.sin(t*9)*0.08; ctx.save(); ctx.translate(0,-8); ctx.scale(f,1/f); this._rough([[-30,0],[-40,-30],[-22,-74],[-8,-40],[3,-100],[20,-54],[38,-72],[32,-18],[19,4]],'#e96116',{seed:81,lw:6,wob:2}); this._rough([[-18,0],[-23,-28],[-7,-60],[0,-34],[13,-70],[25,-25],[16,2]],'#ffc12a',{seed:82,lw:4,wob:1}); ctx.restore(); ctx.restore(); }

  ,drawHeroes(){ const ctx=this.ctx; this.backdrop('hub'); this.text('選擇投手',BW/2,96,52,'#ece0c4',{align:'center',weight:'800'});
    const cw=234,gap=18,total=HEROES.length*cw+(HEROES.length-1)*gap, x0=BW/2-total/2, y=190;
    for(let i=0;i<HEROES.length;i++){ const h=HEROES[i],x=x0+i*(cw+gap); const sel=this.save.hero===h.id;
      this.rr(x,y,cw,560,16); const g=ctx.createLinearGradient(0,y,0,y+560); g.addColorStop(0,'rgba(33,24,16,0.95)'); g.addColorStop(1,'rgba(20,14,9,0.97)'); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=sel?4:2; ctx.strokeStyle=sel?'#e6c068':'rgba(200,155,60,0.35)'; ctx.stroke();
      this.drawHero(h.id,x+cw/2,y+330,0.6,false);
      this.text(h.name,x+cw/2,y+388,30,'#ece0c4',{align:'center',weight:'800'}); this.text(h.en,x+cw/2,y+414,15,h.col,{align:'center'});
      this.text(h.role,x+cw/2,y+446,18,'#e6c068',{align:'center'}); this.wrap(h.passive,x+cw/2,y+482,cw-30,24,'#cfc6b0',18);
      this.btn(x,y,cw,560,'h'+h.id,()=>{ this.save.hero=h.id; persist(this.save); this.audio.sfx('select'); }); }
    this.button(BW/2-160,800,320,76,'確定','ok',()=>this.go('hub'),{primary:true,size:28});
    this.button(70,60,150,60,'← 返回','back',()=>this.go('hub'),{size:22});
  }

  ,drawAtlas(){ const ctx=this.ctx; this.backdrop('hub'); this.text('籃獄圖譜',BW/2,90,52,'#ece0c4',{align:'center',weight:'800'}); this.text('選擇要進攻的幕',BW/2,130,22,'#a2926e',{align:'center'});
    if(this._selAct>this.save.acts)this._selAct=this.save.acts;
    const cw=320,gap=24,total=ACTS.length*cw+(ACTS.length-1)*gap,x0=BW/2-total/2,y=200;
    for(let i=0;i<ACTS.length;i++){ const A=ACTS[i],x=x0+i*(cw+gap); const locked=A.id>this.save.acts; const sel=this._selAct===A.id;
      this.rr(x,y,cw,420,16); ctx.fillStyle= locked?'rgba(16,12,8,0.85)': sel?'rgba(60,44,20,0.95)':'rgba(28,20,12,0.92)'; ctx.fill(); ctx.lineWidth=sel?4:2; ctx.strokeStyle=locked?'rgba(80,70,50,0.4)':sel?'#e6c068':'rgba(200,155,60,0.35)'; ctx.stroke();
      this.text('第 '+A.id+' 幕',x+24,y+50,24,locked?'rgba(150,140,120,0.5)':'#e6c068',{weight:'700'});
      this.text(A.name,x+24,y+96,34,locked?'rgba(150,140,120,0.5)':'#ece0c4',{weight:'800'}); this.text(A.sub,x+24,y+126,16,'#a2926e');
      // mini map of 4 stages
      const sl=STAGES[A.id]; for(let j=0;j<sl.length;j++){ const sx=x+50+j*70,sy=y+200; ctx.beginPath(); ctx.arc(sx,sy,16,0,TAU); ctx.fillStyle= sl[j].boss?'#c4342a':locked?'#3a2c19':'#8a6a2e'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); if(j<sl.length-1){ctx.strokeStyle='rgba(200,155,60,0.4)';ctx.beginPath();ctx.moveTo(sx+16,sy);ctx.lineTo(sx+54,sy);ctx.stroke();} }
      this.text(locked?'未解鎖':'Boss：'+A.boss,x+24,y+300,18,locked?'rgba(150,140,120,0.5)':'#cfc6b0');
      const mk=this.save.marks[A.id+'-boss']||0, cl=this.save.bossClears[A.id+'-boss']||0, ht=this.save.heat[A.id+'-boss']||0;
      this.text('印記 '+mk+'　擊敗 '+cl+'　熱度 '+ht,x+24,y+340,16,'#a2926e');
      const sig=RELICS[A.relic]; this.text('標誌聖物：'+sig.name,x+24,y+372,16, (this.save.relics.includes(A.relic)||this.save.library.includes(A.relic))?'#39ad39':'#a2926e');
      if(!locked) this.btn(x,y,cw,420,'a'+A.id,()=>{ this._selAct=A.id; this.audio.sfx('ui'); });
    }
    this.button(BW/2-200,680,400,80,'選擇路線 →','route',()=>this.go('route'),{primary:true,size:30});
    this.button(70,60,150,60,'← 返回','back',()=>this.go('hub'),{size:22});
  }

  ,drawRoute(){ const ctx=this.ctx; this.backdrop('hub'); const A=ACTS[this._selAct-1];
    this.text('第 '+A.id+' 幕 · '+A.name,BW/2,84,46,'#ece0c4',{align:'center',weight:'800'});
    // route cards
    this.text('遠征路線',360,150,28,'#e6c068',{align:'center'});
    const routes=[['fast','速投線','2 菁英 + Boss｜約 7-9 分｜標準掉落'],['std','標準遠征','3 菁英 + Boss｜約 10-15 分｜較多聖物'],['corrupt','腐化加時','3 腐化菁英 + Boss 變體｜失手 +20%｜標誌機率高']];
    if(!this._selRoute)this._selRoute='std';
    for(let i=0;i<3;i++){ const [id,nm,desc]=routes[i]; const y=190+i*130,x=120,w=480; const sel=this._selRoute===id;
      this.rr(x,y,w,110,12); ctx.fillStyle=sel?'rgba(60,44,20,0.95)':'rgba(28,20,12,0.92)'; ctx.fill(); ctx.lineWidth=sel?3:2; ctx.strokeStyle=sel?'#e6c068':'rgba(200,155,60,0.35)'; ctx.stroke();
      this.text(nm,x+24,y+44,28,sel?'#e6c068':'#ece0c4',{weight:'800'}); this.text(desc,x+24,y+80,18,'#cfc6b0');
      this.btn(x,y,w,110,'r'+id,()=>{ this._selRoute=id; this.audio.sfx('ui'); }); }
    // stones
    this.text('球路石板（可不選）',BW-560,150,26,'#e6c068',{align:'center'});
    for(let i=0;i<ROUTE_STONES.length;i++){ const st=ROUTE_STONES[i]; const col=i%2,row=(i/2)|0; const x=BW-820+col*350,y=190+row*120,w=330; const sel=this._selStone===st.id;
      this.rr(x,y,w,104,10); ctx.fillStyle=sel?'rgba(60,44,20,0.95)':'rgba(28,20,12,0.92)'; ctx.fill(); ctx.lineWidth=sel?3:2; ctx.strokeStyle=sel?'#e6c068':'rgba(200,155,60,0.3)'; ctx.stroke();
      this.text(st.name,x+18,y+38,22,sel?'#e6c068':'#ece0c4',{weight:'700'}); this.wrap(st.desc,x+w/2,y+66,w-30,22,'#cfc6b0',16,'left');
      this.btn(x,y,w,104,'s'+st.id,()=>{ this._selStone=this._selStone===st.id?null:st.id; this.audio.sfx('ui'); }); }
    this.button(BW/2-220,920,440,84,'進入第 '+A.id+' 幕','go',()=>this.startRun(this._selAct,this._selRoute,this._selStone),{primary:true,size:32});
    this.button(70,60,150,60,'← 返回','back',()=>this.go('atlas'),{size:22});
  }

  ,startEndless(){ this.save.endless=true; this._selRoute='std'; this._selStone=null; this.startRun(1,'std',null); this.run.endless=true; this.toast('無盡加時','串接五幕菁英宿主'); }

  ,drawSettings(){ const ctx=this.ctx; this.backdrop('hub'); this.text('設定',BW/2,100,52,'#ece0c4',{align:'center',weight:'800'});
    const st=this.save.settings,x=BW/2-460,w=920; let y=180;
    const toggle=(label,key,cb)=>{ this.panel(x,y,w,72,{r:12}); this.text(label,x+28,y+46,28,'#ece0c4'); const on=st[key],tw=104,th=46,tx=x+w-tw-22,ty=y+13; this.rr(tx,ty,tw,th,th/2); ctx.fillStyle=on?'#caa23a':'rgba(40,30,18,0.9)'; ctx.fill(); ctx.strokeStyle=on?'#e6c068':'rgba(200,155,60,0.4)'; ctx.lineWidth=2; ctx.stroke(); ctx.beginPath(); ctx.arc(on?tx+tw-th/2:tx+th/2,ty+th/2,th/2-6,0,TAU); ctx.fillStyle='#ece0c4'; ctx.fill(); this.btn(x,y,w,72,'t'+key,()=>{ st[key]=!st[key]; cb&&cb(st[key]); persist(this.save); this.audio.sfx('ui'); }); y+=84; };
    const slider=(label,key,cb)=>{ this.panel(x,y,w,72,{r:12}); this.text(label,x+28,y+46,28,'#ece0c4'); const sx=x+360,sw=w-360-40,sy=y+36,v=st[key]; ctx.strokeStyle='rgba(200,155,60,0.4)'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+sw,sy); ctx.stroke(); ctx.strokeStyle='#caa23a'; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+sw*v,sy); ctx.stroke(); ctx.beginPath(); ctx.arc(sx+sw*v,sy,15,0,TAU); ctx.fillStyle='#ece0c4'; ctx.fill(); this._sliders=this._sliders||{}; this._sliders[key]={x:sx,w:sw,y,h:72,cb}; this.btn(sx-10,y,sw+20,72,'sl'+key,()=>{}); y+=84; };
    toggle('音樂','music',v=>this.audio.setMusic(v)); toggle('音效','sfx',v=>this.audio.setSfx(v)); toggle('震動','vibrate'); toggle('左手模式','lefty'); toggle('減少動態','reduceMotion'); toggle('低效能模式','lowPerf');
    slider('音樂音量','musicVol',v=>this.audio.setMVol(v)); slider('音效音量','sfxVol',v=>this.audio.setSVol(v));
    this.button(x,y+4,300,68,'重置存檔','reset',()=>{ this.confirm('確定要重置所有存檔？此動作無法復原。',()=>{ this.save=defaultSave(); persist(this.save); this.audio.setMusic(true); this.audio.setSfx(true); this.toast('存檔已重置'); }); },{danger:true,size:24});
    this.button(70,60,150,60,'← 返回','back',()=>this.go(this.screen==='settings'&&this._fromHome?'home':'hub'),{size:22});
  }

  ,drawCodex(){ const ctx=this.ctx; this.backdrop('hub'); this.text('宿主圖鑑 / 玩法',BW/2,90,48,'#ece0c4',{align:'center',weight:'800'});
    const lines=[ ['單指投籃','按住籃球向後拖曳調整角度與力量，放手投出。'],['籃框宿主','籃框綁在菁英或 Boss 身上；清光周圍小怪才勝利，宿主不吃傷害。'],['進球攻擊','進球後依球形態（火/冰/雷/斧/箭）爆發攻擊清怪。'],['空心 / 擦板','空心 18 傷害 15XP；擦板 15 傷害 12XP；普通 12 傷害 10XP。'],['投失扣血','只有投失才扣血；小怪以「重球/短軌/慢蓄力」干擾下一球，回合制且有預告。'],['每球升級','每球得 XP，前幾球就升級，三選一組成流派與球語。'],['聖物','三個通用聖物欄，標誌聖物可改變開局球形態。'],['五幕二十關','灰哨修院→日蝕沙陵→腐潮城邦→違規煉獄→終場之巔，擊敗終場之王解鎖無盡加時。'] ];
    let y=170; const x=BW/2-620; for(const [h,d] of lines){ this.panel(x,y,1240,78,{r:12}); this.text(h,x+28,y+48,28,'#e6c068',{weight:'700'}); this.text(d,x+300,y+48,24,'#ece0c4'); y+=90; }
    this.button(70,60,150,60,'← 返回','back',()=>this.go('hub'),{size:22});
  }
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
      this._sb(x+10+(cw-30)/2+10,cy+ch-34,(cw-30)/2,26,'分解',()=>{ s.coins+=20; s.library.splice(i,1); persist(s); this.audio.sfx('coin'); });
    }
    this.button(70,60,150,60,'← 返回','back',()=>this.go('hub'),{size:22});
    if(this._replaceTarget) this.drawReplace();
  },
  _sb(x,y,w,h,label,cb){ const ctx=this.ctx; this.rr(x,y,w,h,8); ctx.fillStyle='rgba(70,52,24,0.95)'; ctx.fill(); ctx.strokeStyle='rgba(200,155,60,0.45)'; ctx.lineWidth=2; ctx.stroke(); this.text(label,x+w/2,y+h/2,18,'#ece0c4',{align:'center',baseline:'middle',weight:'700'}); this.btn(x,y,w,h,'sb'+label+x+y,cb); },

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
    if(how==='dismantle'){ s.coins+=30; this._endStats.picked=true; persist(s); this.audio.sfx('coin'); return; }
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
    // off-screen ball indicator
    this.drawBallIndicator();
    // vignette on hurt
    if(run.hitFlash>0){ const a=clamp(run.hitFlash,0,1)*0.5; const g=ctx.createRadialGradient(BW/2,BH/2,BH*0.3,BW/2,BH/2,BW*0.7); g.addColorStop(0,'rgba(196,52,42,0)'); g.addColorStop(1,'rgba(196,52,42,'+a+')'); ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH); }
    this.drawHUD();
    if(run.banner) this.drawBanner();
    if(run.tutorial) this.drawTutorial();
    if(run.modal) this.drawModal();
    if(this._paused) this.drawPause();
  },
  drawCourt(){ const ctx=this.ctx; const run=this.run; const A=ACTS[run.act-1]; const fy=BH-90;
    ctx.save(); ctx.globalAlpha=0.4; ctx.strokeStyle=A.rune; ctx.lineWidth=3; ctx.shadowBlur=8; ctx.shadowColor=A.rune; ctx.beginPath(); ctx.moveTo(0,fy); ctx.lineTo(BW,fy); ctx.stroke();
    for(let i=0;i<3;i++){ ctx.globalAlpha=0.2; ctx.beginPath(); ctx.ellipse(BW*0.5,fy,280+i*180,56+i*18,0,Math.PI,TAU); ctx.stroke(); } ctx.shadowBlur=0; ctx.restore();
    if(chance(0.4)){ const c=run.act===4?'#ff7a3c':run.act===5?'#6fd8ff':A.rune; this.spawn(rand(0,BW),fy-rand(0,200),rand(-8,8),rand(-30,-8),rand(1.5,3),rand(1,3),c,{glow:true,g:-6,drag:0.999}); }
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
  drawBall(){ const ctx=this.ctx; const run=this.run; const b=run.ball; if(!b)return; const fc=BALL_FORMS[run.form].color;
    ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.spin); ctx.shadowBlur=16; ctx.shadowColor=fc;
    const g=ctx.createRadialGradient(-8,-8,4,0,0,b.r); g.addColorStop(0,'#ffce9a'); g.addColorStop(0.55,fc); g.addColorStop(1,'#5a2410'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,b.r,0,TAU); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(20,8,4,0.7)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(0,0,b.r,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-b.r,0); ctx.lineTo(b.r,0); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0,0,b.r*0.4,b.r,0,0,TAU); ctx.stroke();
    ctx.restore();
    if(b.live&&!this.save.settings.reduceMotion&&chance(0.6)) this.spawn(b.x,b.y,rand(-10,10),rand(-10,10),0.3,rand(2,5),fc,{glow:true});
  },
  drawAim(){ const ctx=this.ctx; const run=this.run; if(!run.aiming)return; const b=run.ball; const dx=b.x-run.aimX,dy=b.y-run.aimY,pull=Math.hypot(dx,dy);
    if(pull<60){ this.text('放開取消',b.x,b.y-60,24,'#e6433c',{align:'center'}); return; }
    let maxPull=520; if(this._intfActive('maxPull'))maxPull*=0.85; const p=clamp(pull,0,maxPull)/maxPull,power=lerp(820,2650,p),ang=Math.atan2(dy,dx);
    let vx=Math.cos(ang)*power,vy=Math.sin(ang)*power,x=b.x,y=b.y; const G=2600*this._gravMul(),hh=1/60;
    let dots=26+Math.round((run.relicIds.includes('deadeye_sigil')?5:0)); if(run.heroId==='shade'&&run._shadeBonus)dots+=4;
    if(this._intfActive('shortTraj')) dots=Math.max(7,Math.round(dots*0.5));
    if(run.relicIds.includes('deadeye_sigil')) dots=Math.round(dots*1.2);
    ctx.save(); for(let i=0;i<dots;i++){ vy+=G*hh; x+=vx*hh; y+=vy*hh; if(y>BH-92||x<0||x>BW)break; const tt=i/dots; ctx.globalAlpha=(1-tt)*0.9; const r=lerp(8,2,tt); ctx.fillStyle=i%2?'#ffe14d':BALL_FORMS[run.form].color; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); } ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(run.aimX,run.aimY); ctx.stroke();
  },
  drawBattleFx(){ const ctx=this.ctx; const run=this.run;
    for(let i=run.fx.length-1;i>=0;i--){ const m=run.fx[i]; m.t-=1/60; if(m.t<=0){run.fx.splice(i,1);continue;} const k=clamp(m.t/m.max,0,1);
      if(m.kind==='beam'){ ctx.globalAlpha=k; ctx.strokeStyle=m.color; ctx.lineWidth=8*k+2; ctx.shadowBlur=14; ctx.shadowColor=m.color; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); ctx.lineTo(m.x2,m.y2); ctx.stroke(); ctx.shadowBlur=0; ctx.globalAlpha=1; }
      else if(m.kind==='arc'){ ctx.globalAlpha=k; ctx.strokeStyle='#ffe14d'; ctx.lineWidth=4; ctx.shadowBlur=14; ctx.shadowColor='#ffe14d'; ctx.beginPath(); ctx.moveTo(m.x1,m.y1); const mx=(m.x1+m.x2)/2+rand(-30,30),my=(m.y1+m.y2)/2+rand(-30,30); ctx.lineTo(mx,my); ctx.lineTo(m.x2,m.y2); ctx.stroke(); ctx.shadowBlur=0; ctx.globalAlpha=1; } }
    // projectiles
    for(const p of run.projectiles){ if(p.kind==='axe'){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(this.t*20); ctx.fillStyle='#cdd2da'; ctx.beginPath(); ctx.moveTo(-6,-30-p.big*8); ctx.lineTo(30+p.big*8,-10); ctx.lineTo(0,10); ctx.lineTo(-30-p.big*8,-10); ctx.closePath(); ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); ctx.restore(); }
      else if(p.kind==='arrow'){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(p.vy,p.vx)); ctx.fillStyle='#b9f06a'; ctx.shadowBlur=12; ctx.shadowColor='#b9f06a'; ctx.fillRect(-18,-3,36,6); ctx.beginPath(); ctx.moveTo(18,-7); ctx.lineTo(30,0); ctx.lineTo(18,7); ctx.closePath(); ctx.fill(); ctx.shadowBlur=0; ctx.restore(); } }
  },
  drawBallIndicator(){ const ctx=this.ctx; const run=this.run; const b=run.ball; if(!b||!b.live)return;
    // ball position in screen space (after cam): approximate using cam transform
    const sy=(b.y-this.cam.y); if(sy>-20)return; // only when above view top
    const sx=clamp(b.x,40,BW-40); ctx.save(); ctx.fillStyle='#ffd24a'; ctx.beginPath(); ctx.moveTo(sx,30); ctx.lineTo(sx-16,60); ctx.lineTo(sx+16,60); ctx.closePath(); ctx.fill(); ctx.restore();
  },

  drawHUD(){ const ctx=this.ctx; const run=this.run;
    // top-left HP + shield + interference
    const x=40,y=36,w=440; this.panel(x,y,w,108,{r:14,c0:'rgba(20,14,9,0.82)',c1:'rgba(12,8,5,0.86)'});
    this.text('生命',x+20,y+34,22,'#e6433c',{weight:'700'}); const bx=x+92,bw=w-114;
    ctx.fillStyle='rgba(0,0,0,0.5)'; this.rr(bx,y+18,bw,22,6); ctx.fill(); ctx.fillStyle='#c4342a'; this.rr(bx,y+18,bw*clamp(run.hp/run.maxhp,0,1),22,6); ctx.fill(); this.text(`${Math.max(0,Math.round(run.hp))}/${run.maxhp}`,bx+bw/2,y+34,18,'#fff',{align:'center',weight:'700'});
    if(run.shield>0){ ctx.fillStyle='rgba(0,0,0,0.5)'; this.rr(bx,y+48,bw,14,5); ctx.fill(); ctx.fillStyle='#6fae4a'; this.rr(bx,y+48,bw*clamp(run.shield/30,0,1),14,5); ctx.fill(); this.text('護盾 '+Math.round(run.shield),bx+bw/2,y+60,13,'#0a2014',{align:'center',weight:'700'}); }
    // interference chips
    let ix=x+20,iy=y+78; this.text('干擾',ix,iy+14,16,'#a2926e'); ix+=56; if(run.intf.length===0){ this.text('無',ix,iy+14,16,'rgba(180,170,150,0.5)'); } else for(const it of run.intf){ const iw=ctx.measureText(it.name).width+44; this.rr(ix,iy,iw,26,6); ctx.fillStyle='rgba(196,52,42,0.3)'; ctx.fill(); ctx.strokeStyle='#c4342a'; ctx.lineWidth=1.5; ctx.stroke(); this.text((INTERFERENCES[it.kind].icon||'')+it.name+'×'+it.shots,ix+iw/2,iy+18,15,'#e6c068',{align:'center'}); ix+=iw+8; }
    // top-center: stage, remaining guards, level + xp
    const rem=run.guards.length+(run.guardsTotal-run.spawned); this.text(run.stage.name,BW/2,46,28,'#ece0c4',{align:'center',weight:'700'});
    this.text('剩餘護衛 '+rem+' / '+run.guardsTotal,BW/2,78,22,'#e6c068',{align:'center'});
    if(run.combo>1){ const cc=run.combo>=10?'#ff5a2a':run.combo>=5?'#ffe14d':'#e08a32'; this.text('連擊 x'+run.combo,BW/2,118,30,cc,{align:'center',weight:'800',glow:run.combo>=5?12:0}); }
    // xp bar
    const xw=420,xx=BW/2-xw/2,xy=run.combo>1?138:120; ctx.fillStyle='rgba(0,0,0,0.5)'; this.rr(xx,xy,xw,16,5); ctx.fill(); ctx.fillStyle='#6b86e8'; this.rr(xx,xy,xw*clamp(run.xp/run.xpNext,0,1),16,5); ctx.fill(); this.text('Lv'+run.level,xx-10,xy+13,18,'#ece0c4',{align:'right',weight:'700'});
    // top-right: pause + form + words
    const pb=86,pbx=BW-pb-40,pby=36; this.panel(pbx,pby,pb,pb,{r:14}); this.text('II',pbx+pb/2,pby+pb/2+2,34,'#ece0c4',{align:'center',baseline:'middle',weight:'800'}); this._pauseHit={x:pbx,y:pby,w:pb,h:pb};
    // bottom-center: form + words progress
    const F=BALL_FORMS[run.form]; this.text('球形態：'+F.name,BW/2,BH-30,22,F.color,{align:'center',weight:'700'});
    if(run.words.length) this.text(run.words.map(id=>BALL_WORDS.find(w=>w.id===id).name).join(' · '),BW/2,BH-58,18,'#e6c068',{align:'center'});
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
  drawPause(){ const ctx=this.ctx; ctx.fillStyle='rgba(3,2,4,0.86)'; ctx.fillRect(0,0,BW,BH); this.text('暫停',BW/2,260,64,'#ece0c4',{align:'center',weight:'800'});
    const bw=440,bh=80,gap=20,x=BW/2-bw/2; let y=360;
    this.button(x,y,bw,bh,'繼續','res',()=>{ this._paused=false; },{primary:true,size:30}); y+=bh+gap;
    this.button(x,y,bw,bh,'放棄遠征','quit',()=>{ this.confirm('放棄本次遠征返回板凳席？',()=>{ this._paused=false; this.run=null; this.screen='hub'; }); },{size:26}); y+=bh+gap;
    const st=this.save.settings,tw=210;
    this.button(x,y,tw,68,st.music?'音樂 開':'音樂 關','pm',()=>{ st.music=!st.music; this.audio.setMusic(st.music); persist(this.save); },{size:22});
    this.button(x+tw+20,y,tw,68,st.sfx?'音效 開':'音效 關','ps',()=>{ st.sfx=!st.sfx; this.audio.setSfx(st.sfx); persist(this.save); },{size:22});
  },

  // ----- end screen -----
  drawEnd(){ const ctx=this.ctx; const s=this._endStats; if(!s){ this.go('hub'); return; } this.backdrop(s.won?'final':'abbey');
    this.text(s.won?'終場哨響起':'你被吹下場',BW/2,120,68,s.won?'#e6c068':'#c4342a',{align:'center',weight:'800',glow:16});
    this.text(s.won?(ACTS[s.act-1].name+' 通關　·　第一節結束'):('止步於 '+s.stageName),BW/2,170,24,'#a2926e',{align:'center'});
    const stats=[['得分',s.score],['命中率',Math.round(s.acc*100)+'%'],['空心球',s.swishes],['擦板球',s.banks],['最高連擊',s.bestCombo],['擊殺',s.kills]];
    const cw=240,ch=104,gap=22,per=3,tw=per*cw+(per-1)*gap,sx=BW/2-tw/2,sy=210;
    for(let i=0;i<stats.length;i++){ const cx=sx+(i%per)*(cw+gap),cy=sy+((i/per)|0)*(ch+gap); this.panel(cx,cy,cw,ch,{r:12}); this.text(stats[i][0],cx+cw/2,cy+38,20,'#e6c068',{align:'center'}); this.text(''+stats[i][1],cx+cw/2,cy+80,36,'#ece0c4',{align:'center',weight:'800'}); }
    if(s.words.length) this.text('球語：'+s.words.map(id=>BALL_WORDS.find(w=>w.id===id).name).join('、'),BW/2,sy+ch*2+gap*2+30,22,'#e6c068',{align:'center'});
    const ly=sy+ch*2+gap*2+60;
    if(s.won&&s.loot&&!s.picked){ this.text('選擇一件聖物保留（印記 +'+s.marks+'）',BW/2,ly,28,'#e6c068',{align:'center',weight:'700'});
      const lw=300,lh=240,lg=36,tot=s.loot.length*lw+(s.loot.length-1)*lg,lx0=BW/2-tot/2,lyy=ly+24;
      for(let i=0;i<s.loot.length;i++){ const id=s.loot[i],R=RELICS[id],x=lx0+i*(lw+lg); const col=R.cls==='core'?'#e6c068':R.cls==='feel'?'#6b86e8':'#39ad39'; this.rr(x,lyy,lw,lh,14); ctx.fillStyle='rgba(20,14,9,0.95)'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=col; ctx.shadowBlur=12; ctx.shadowColor=col; ctx.stroke(); ctx.shadowBlur=0;
        this.text(RELIC_CLASS[R.cls],x+lw/2,lyy+34,18,'#a2926e',{align:'center'}); this.text(R.name,x+lw/2,lyy+68,24,col,{align:'center',weight:'800'}); this.wrap(R.desc,x+lw/2,lyy+102,lw-30,22,'#cfc6b0',16);
        const by=lyy+lh-50,bw2=(lw-30)/3; this._sb(x+10,by,bw2-4,40,'裝備',()=>{ this.claimLoot(id,'equip'); }); this._sb(x+10+bw2,by,bw2-4,40,'收納',()=>{ this.claimLoot(id,'library'); }); this._sb(x+10+bw2*2,by,bw2-4,40,'分解',()=>{ this.claimLoot(id,'dismantle'); }); }
    } else {
      const bw=380,bh=84,gap2=30,bx=BW/2-(bw*2+gap2)/2;
      this.button(bx,ly+30,bw,bh,s.won?'再次遠征':'立即重試','retry',()=>{ this._endStats=null; this.go('atlas'); },{primary:true,size:30});
      this.button(bx+bw+gap2,ly+30,bw,bh,'返回板凳席','hub',()=>{ this._endStats=null; this.go('hub'); },{size:28});
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
    o=o||{}; const ctx=this.ctx; const radius=o.r||12;
    this.rr(x,y,w,h,radius);
    if(o.primary){ const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#f4cc74'); g.addColorStop(1,'#c98a27'); ctx.fillStyle=g; }
    else if(o.danger){ const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#8b2822'); g.addColorStop(1,'#5f1612'); ctx.fillStyle=g; }
    else { const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'rgba(36,27,18,0.96)'); g.addColorStop(1,'rgba(20,15,10,0.98)'); ctx.fillStyle=g; }
    ctx.fill();
    ctx.strokeStyle=o.primary?'rgba(255,235,180,0.8)':(o.danger?'rgba(255,140,120,0.45)':'rgba(230,192,104,0.45)');
    ctx.lineWidth=2; ctx.stroke();
    const size=this.fitText(label, w-26, o.size||26, 14, o.weight||'700');
    this.text(label,x+w/2,y+h/2,size,o.primary?'#1a120a':(o.color||'#ece0c4'),{align:'center',baseline:'middle',weight:o.weight||'700'});
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
  drawHub(){
    const ctx=this.ctx; this.backdrop('hub'); const s=this.save;
    this.text('最後板凳席',BW/2,94,58,'#ece0c4',{align:'center',weight:'800',glow:12});
    this.text('守護發光聖球，準備投進籃獄',BW/2,136,22,'#cfc6b0',{align:'center'});
    const cx=BW*0.33, cy=BH*0.56; this._glowingBasketShrine(cx,cy);
    // 4 guardians around the ball instead of campfire gathering
    const shrineHeroes=['shade','whistle','axer','elem'];
    const pos=[[-170,70,0.44],[170,76,0.44],[-70,142,0.4],[72,146,0.4]];
    for(let i=0;i<4;i++){ const [dx,dy,sc]=pos[i]; this.drawHero(shrineHeroes[i], cx+dx, cy+dy, sc); }
    const hero=HEROES.find(h=>h.id===s.hero);
    this.panel(BW-660,190,560,190,{r:18,c0:'rgba(20,14,10,0.84)',c1:'rgba(12,9,7,0.88)'});
    this.text('當前投手',BW-630,230,22,'#e6c068',{weight:'700'});
    this.text(hero.name+'　'+hero.en,BW-630,275,32,'#ece0c4',{weight:'800'});
    this.wrap('被動：'+hero.passive,BW-630+210,314,400,24,'#cfc6b0',19,'left');
    // selected hero portrait showcase
    this.drawHero(s.hero, BW-500, BH-140, 0.62);
    // resource chips
    this.panel(BW-660,400,270,90,{r:16}); this.text('碎金',BW-630,438,20,'#a2926e'); this.text(String(s.coins),BW-630,476,36,'#ece0c4',{weight:'800'});
    this.panel(BW-372,400,272,90,{r:16}); this.text('無盡最佳',BW-342,438,20,'#a2926e'); this.text(String(s.endlessBest||0),BW-342,476,36,'#ece0c4',{weight:'800'});
    // buttons
    const bx=BW-650, bw=270, bh=74;
    this.button(bx,536,bw,bh,'進入籃獄圖譜','atlas',()=>this.go('atlas'),{primary:true,size:28});
    this.button(bx+bw+20,536,bw,bh,'選擇投手','heroes',()=>this.go('heroes'),{size:25});
    this.button(bx,536+bh+18,bw,bh,'籃魂聖匣','relics',()=>this.go('relics'),{size:25});
    this.button(bx+bw+20,536+bh+18,bw,bh,'宿主圖鑑','codex',()=>this.go('codex'),{size:25});
    if(s.endless) this.button(bx,536+bh*2+36,bw*2+20,64,'∞ 無盡加時 (最佳 '+s.endlessBest+')','endless',()=>this.startEndless(),{size:23,color:'#e6c068'});
    this.button(70,60,150,60,'← 首頁','home',()=>this.go('home'),{size:22});
  },
  battleDown(x,y){
    const run=this.run; if(run.modal) return;
    if(this._pauseHit && x>=this._pauseHit.x&&x<=this._pauseHit.x+this._pauseHit.w&&y>=this._pauseHit.y&&y<=this._pauseHit.y+this._pauseHit.h){ this._paused=true; return; }
    const b=run.ball; if(!b||!b.held||b.live||run.repos>0) return;
    // allow drag from any non-HUD point for longer pull distance
    if(y<160 && x>BW-140) return;
    run.aiming=true; run.aimX=x; run.aimY=y; if(run.tutorial&&run.tutStep==null) run.tutStep=1;
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
    run.guards.push(g); return g;
  },
  updateGuards(dt){
    const run=this.run; const host=run.host;
    for(const g of run.guards){ if(g.dead) continue;
      g.flash=Math.max(0,g.flash-dt*5);
      if(g.frozen){ g.freeze-=dt; if(g.freeze<=0){ g.frozen=false; g.freeze=0; } }
      if(g.burn>0){ g.burn-=dt; this.hurtGuard(g, g.burnDps*dt, {}); }
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
    const ctx=this.ctx; const bob=Math.sin(this.t*2.4+g.slot)*4; const def=GUARDS[g.type]; const body=def.body; const pal=this._guardPalette(body);
    const sc=g.drawScale||1;
    ctx.save(); ctx.translate(g.x,g.y); ctx.scale(sc,sc); ctx.globalAlpha=g.phased?0.45:1;
    // aura for elite
    if(g.elite){ const rg=ctx.createRadialGradient(0,0,6,0,0,g.r*1.6); rg.addColorStop(0,'rgba(255,204,110,0.20)'); rg.addColorStop(1,'rgba(255,204,110,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(0,0,g.r*1.6,0,TAU); ctx.fill(); }
    this.shadow(0,g.r*0.95,g.r*0.95,0.22);
    const base=g.r;
    if(body==='bat'){
      for(const s of[-1,1]){ ctx.save(); ctx.scale(s,1); this._rough([[base*0.1,bob],[base*1.2,-base*0.55+bob],[base*1.05,base*0.28+bob]],pal[0],{lw:5,wob:2,seed:13}); ctx.restore(); }
      this._oval(0,bob,base*0.6,base*0.52,pal[1],{lw:6});
    } else if(body==='eye'){
      this._oval(0,bob,base*0.95,base*0.78,pal[0],{lw:6}); ctx.fillStyle='#fff6e9'; ctx.beginPath(); ctx.arc(0,bob,base*0.48,0,TAU); ctx.fill(); ctx.fillStyle='#11100f'; ctx.beginPath(); ctx.arc(Math.sin(this.t*1.5+g.slot)*base*0.16,bob,base*0.22,0,TAU); ctx.fill();
    } else if(body==='spider'){
      ctx.strokeStyle='#11100f'; ctx.lineWidth=4; for(let i=0;i<4;i++){ const a=0.48+i*0.36; for(const s of[-1,1]){ ctx.beginPath(); ctx.moveTo(0,bob); ctx.lineTo(s*Math.cos(a)*base*1.4,bob+Math.sin(a)*base*0.55+base*0.34); ctx.stroke(); } }
      this._oval(0,bob,base*0.78,base*0.6,pal[0],{lw:6});
    } else if(body==='slime'){
      this._rough([[-base*0.95,base*0.46+bob],[-base*0.72,-base*0.32+bob],[0,-base*0.68+bob],[base*0.75,-base*0.3+bob],[base*0.92,base*0.48+bob]],pal[0],{lw:6,wob:3,seed:11});
    } else {
      this._bean(0,-base*0.06+bob,base*1.08,base*(g.elite?1.72:1.58),pal[0],{lw:6,seed:21,wob:2,lean:2});
      if(body==='wizard'){ this._rough([[0,-base*1.3+bob],[base*0.42,-base*0.54+bob],[-base*0.42,-base*0.54+bob]],pal[1],{lw:5,wob:1.5,seed:4}); }
      if(body==='shield'){ ctx.save(); ctx.translate(-base*0.95,bob+4); this._rough([[-14,-24],[14,-24],[16,18],[0,28],[-16,18]],'#bdb5a6',{seed:7,lw:5}); ctx.restore(); }
      if(body==='drummer'){ this._oval(0,base*0.52+bob,base*0.52,base*0.32,'#6b4326',{lw:5}); }
      if(body==='imp'){ for(const s of[-1,1]){ this._rough([[s*base*0.18,-base*0.55+bob],[s*base*0.45,-base*0.94+bob],[s*base*0.04,-base*0.56+bob]],'#b84822',{lw:3,wob:1,seed:5}); } }
    }
    // faces / markings
    ctx.fillStyle=body==='wizard'||body==='bat'?'#fff6e9':'#11100f';
    if(body==='bat'){ ctx.beginPath(); ctx.arc(-base*0.18,bob,base*0.08,0,TAU); ctx.arc(base*0.18,bob,base*0.08,0,TAU); ctx.fill(); }
    else if(body!=='eye'){ ctx.beginPath(); ctx.arc(-base*0.22,-base*0.24+bob,base*0.08,0,TAU); ctx.arc(base*0.22,-base*0.24+bob,base*0.08,0,TAU); ctx.fill(); ctx.strokeStyle='#11100f'; ctx.lineWidth=3.5; ctx.beginPath(); ctx.moveTo(-7,base*0.18+bob); ctx.quadraticCurveTo(0,base*0.26+bob,7,base*0.18+bob); ctx.stroke(); }
    if(g.elite){ ctx.fillStyle='#ffd070'; this.cstar(base*0.24); }
    if(g.flash>0){ ctx.globalAlpha=g.flash*0.65; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,base*1.05,0,TAU); ctx.fill(); }
    ctx.restore();
    this.drawGuardTags(g);
  },
  drawGuardTags(g){
    const ctx=this.ctx; const y=g.y-g.r*(g.drawScale||1)-20, x=g.x;
    if(g.casting||g.cast>0){
      const intf=INTERFERENCES[GUARDS[g.type].intf];
      this.panel(x-48,y-30,96,26,{r:10,c0:'rgba(30,18,12,0.9)',c1:'rgba(18,11,7,0.9)'});
      this.text((intf?intf.icon:'!')+' '+g.cast+'/'+g.castMax,x,y-12,14,g.casting?'#ffd070':'#cfc6b0',{align:'center',weight:'700'});
    }
    if(g.elite){
      this.panel(x-32,y,64,22,{r:10,c0:'rgba(60,40,12,0.9)',c1:'rgba(40,25,8,0.9)'});
      this.text('菁英',x,y+15,13,'#ffd070',{align:'center',weight:'800'});
    }
  },
  drawEnemyTableauBackdrop(){
    const ctx=this.ctx; const host=this.run.host; const gy=host.baseY-10;
    const rg=ctx.createRadialGradient(host.x-80,gy-120,50,host.x-80,gy-120,420);
    rg.addColorStop(0,'rgba(30,22,18,0.0)'); rg.addColorStop(0.6,'rgba(22,14,10,0.18)'); rg.addColorStop(1,'rgba(8,6,5,0.0)');
    ctx.fillStyle=rg; ctx.beginPath(); ctx.ellipse(host.x-120,gy-60,480,280,0,0,TAU); ctx.fill();
  },
  drawBattle(){
    const ctx=this.ctx; const run=this.run; if(!run){ this.go('hub'); return; }
    ctx.save(); const cz=this.cam.zoom; ctx.translate(BW/2,BH); ctx.scale(cz,cz); ctx.translate(-BW/2,-BH+this.cam.y);
    if(run.shake>0&&!this.save.settings.reduceMotion) ctx.translate(rand(-run.shake,run.shake),rand(-run.shake,run.shake));
    this.backdrop(ACTS[run.act-1].key); this.drawCourt(); this.drawEnemyTableauBackdrop();
    const ordered=[...run.guards].filter(g=>!g.dead).sort((a,b)=>(a.layer||0)-(b.layer||0)||a.y-b.y);
    for(const g of ordered){ if((g.layer||0)<=0) this.drawGuard(g); }
    this.drawHostAndHoop();
    for(const g of ordered){ if((g.layer||0)>0) this.drawGuard(g); }
    this.drawBattleFx(); this.drawHeroPlayer(); this.drawBall(); this.drawAim(); ctx.restore();
    this.drawBallIndicator();
    if(run.hitFlash>0){ const a=clamp(run.hitFlash,0,1)*0.5; const g=ctx.createRadialGradient(BW/2,BH/2,BH*0.3,BW/2,BH/2,BW*0.7); g.addColorStop(0,'rgba(196,52,42,0)'); g.addColorStop(1,'rgba(196,52,42,'+a+')'); ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH); }
    this.drawHUD(); if(run.banner) this.drawBanner(); if(run.tutorial) this.drawTutorial(); if(run.modal) this.drawModal(); if(this._paused) this.drawPause();
  },
  drawHostAndHoop(){
    const ctx=this.ctx; const run=this.run; const host=run.host; const H=run.hoop; const A=ACTS[run.act-1];
    const bx=host.x, by=host.baseY - (host.hop||0);
    ctx.save(); ctx.translate(bx,by);
    const boss=host.boss, scale=boss?1.18:1;
    ctx.scale(scale,scale);
    this.shadow(0,102,boss?170:132,0.28);
    // host body variations
    const cols={captain:['#e0c7a8','#c76f2c'],countess:['#d8c6b0','#9b3d62'],smith:['#d0ba96','#6c6058'],dean:['#d7b78f','#6a2a22'],drain:['#7fa0a6','#5f6a6c'],summoner:['#b08fd1','#4656b8'],gravekeeper:['#cdb79f','#786048'],worm:['#b5d26c','#8ea43a'],spiderhost:['#8d67bc','#4f2b76'],drumlord:['#cf7d3e','#8d4418'],trio:['#d6d3ce','#424242'],mayor:['#f0b069','#a84d22'],star:['#d8b48a','#d1452f'],knight:['#cfcfd3','#4c5668'],anvil:['#9e948c','#6a6057'],redlord:['#d46045','#781d16'],siege:['#b7b089','#7a6a52'],frostref:['#a7d6ef','#6197bf'],worldking:['#f2dfb4','#7c5fd2']};
    const col=cols[host.body]||['#dbc0a0','#6a4a6a'];
    // body
    this._bean(0,-4,boss?190:150,boss?216:174,col[0],{lw:8,lean:4,seed:9});
    // accessories / silhouette differentiators
    if(host.body==='knight' || host.body==='redlord'){ this._rough([[-36,-24],[36,-24],[28,46],[-28,46]],col[1],{lw:6,wob:2,seed:3}); }
    if(host.body==='countess'){ this._rough([[-58,-78],[0,-132],[56,-76],[38,-52],[-36,-54]],col[1],{lw:6,wob:3,seed:6}); }
    if(host.body==='smith' || host.body==='anvil'){ this._oval(-88,22,24,34,'#7f7f86',{lw:6}); }
    if(host.body==='summoner' || host.body==='worldking'){ this._rough([[-10,-132],[16,-170],[40,-130],[16,-94]],col[1],{lw:5,wob:2,seed:11}); }
    if(host.body==='worm'){ this._oval(0,12,102,54,col[1],{lw:6}); }
    if(host.body==='spiderhost'){ ctx.strokeStyle='#11100f'; ctx.lineWidth=5; for(let i=0;i<4;i++){ const a=0.52+i*0.32; for(const s of[-1,1]){ ctx.beginPath(); ctx.moveTo(0,26); ctx.lineTo(s*Math.cos(a)*118,32+Math.sin(a)*52); ctx.stroke(); } } }
    // face
    ctx.fillStyle='#11100f'; ctx.beginPath(); ctx.arc(-24,-42,6,0,TAU); ctx.arc(24,-42,6,0,TAU); ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='#11100f'; ctx.beginPath(); ctx.moveTo(-18,18); ctx.quadraticCurveTo(0,8,18,18); ctx.stroke();
    if(boss){ const halo=ctx.createRadialGradient(0,-20,10,0,-20,160); halo.addColorStop(0,'rgba(255,208,120,0.22)'); halo.addColorStop(1,'rgba(255,208,120,0)'); ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,-20,160,0,TAU); ctx.fill(); }
    ctx.restore();
    // integrated hoop rig
    ctx.save(); ctx.strokeStyle='#483422'; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(bx+34, by-48); ctx.lineTo(H.x+H.rimR+18, H.y); ctx.stroke(); ctx.restore();
    const boardX=H.x+H.rimR+8, bt=H.y-H.boardH*0.55;
    this._rough([[boardX,bt],[boardX+H.boardW+10,bt-6],[boardX+H.boardW+14,bt+H.boardH*0.5],[boardX+H.boardW+4,bt+H.boardH],[boardX-4,bt+H.boardH-8],[boardX-2,bt+10]],'#382f49',{seed:60,wob:3,lw:8});
    // sacred backboard mark
    ctx.save(); ctx.globalAlpha=0.45+H.glow*0.55; ctx.strokeStyle=A.rune; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(boardX+H.boardW/2+4,H.y-30,12,0,TAU); ctx.stroke(); ctx.restore();
    const pr=H.rimR+26+Math.sin(this.t*2)*4; const rg=ctx.createRadialGradient(H.x,H.y,8,H.x,H.y,pr*1.8); rg.addColorStop(0,`rgba(255,160,70,${0.42+H.lit*0.4})`); rg.addColorStop(0.6,'rgba(120,40,40,0.15)'); rg.addColorStop(1,'rgba(20,10,10,0)'); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(H.x,H.y+6,pr*1.8,0,TAU); ctx.fill();
    const sway=H.net*Math.sin(this.t*20); ctx.strokeStyle=`rgba(255,220,170,${0.74+H.lit*0.2})`; ctx.lineWidth=3; ctx.lineCap='round';
    for(let i=0;i<=7;i++){ const tt=i/7,x0=H.x-H.rimR+8+tt*(H.rimR*2-16),xb=lerp(x0,H.x,0.55)+Math.sin(this.t*3+i)*4+sway; ctx.beginPath(); ctx.moveTo(x0,H.y); ctx.quadraticCurveTo((x0+xb)/2,H.y+H.netH*0.6,xb,H.y+H.netH); ctx.stroke(); }
    ctx.lineWidth=H.rimThick*2+6; ctx.strokeStyle='#15110d'; ctx.beginPath(); ctx.moveTo(H.x-H.rimR,H.y); ctx.lineTo(H.x+H.rimR,H.y); ctx.stroke();
    ctx.lineWidth=H.rimThick*2; ctx.strokeStyle=H.lit>0.3?'#ffe1a0':'#ff8a3a'; ctx.shadowBlur=16+H.glow*22; ctx.shadowColor='#ff7a3c'; ctx.beginPath(); ctx.moveTo(H.x-H.rimR,H.y); ctx.lineTo(H.x+H.rimR,H.y); ctx.stroke(); ctx.shadowBlur=0;
    for(const rx of [H.x-H.rimR,H.x+H.rimR]){ ctx.beginPath(); ctx.arc(rx,H.y,H.rimThick+3,0,TAU); ctx.fillStyle='#ffcaa0'; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle='#0e0d0c'; ctx.stroke(); }
    if(run.tutorial||(!this.save.settings.lowPerf&&run.shots<3)){ this.text(H.label||'',H.x,H.y-H.boardH*0.55-14,18,'#a2926e',{align:'center'}); }
  },
});
