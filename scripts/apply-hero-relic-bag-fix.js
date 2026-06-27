const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ENGINE = 'engine.js';
const INDEX = 'index.html';
const SCRIPT_PATH = 'scripts/apply-hero-relic-bag-fix.js';
const WORKFLOW_PATH = '.github/workflows/hero-relic-bag-fix.yml';
const BLOCK_MARKER = '// === final activation: hero-page relic backpack uses generated backpack art ===';
const INSERT_BEFORE = '// === final activation: branded loading splash absolute last ===';

function replaceOnce(src, from, to) {
  if (!src.includes(from)) return src;
  return src.replace(from, to);
}

function patchEngine(src) {
  src = src.split("if(this.screen==='relics'||this._relicCompare)this.render();").join("if(this.screen==='relics'||this._bag||this._relicCompare)this.render();");
  src = src.split("if(this.screen==='relics'||this._relicCompare) this.render();").join("if(this.screen==='relics'||this._bag||this._relicCompare) this.render();");
  src = replaceOnce(src, "if(this.screen==='relics') this.render();", "if(this.screen==='relics'||this._bag) this.render();");

  if (src.includes(BLOCK_MARKER)) return src;
  const block = `
${BLOCK_MARKER}
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
`;

  if (!src.includes(INSERT_BEFORE)) throw new Error('loading splash marker not found');
  return src.replace(INSERT_BEFORE, block + '\n' + INSERT_BEFORE);
}

function repackIndex(engine) {
  let index = fs.readFileSync(INDEX, 'utf8');
  const dq = String.fromCharCode(34);
  const openTag = '<script type=' + dq + '__bundler/manifest' + dq + '>';
  const closeTag = '</script>';
  const start = index.indexOf(openTag);
  if (start < 0) throw new Error('bundler manifest open tag not found');
  const jsonStart = start + openTag.length;
  const end = index.indexOf(closeTag, jsonStart);
  if (end < 0) throw new Error('bundler manifest close tag not found');
  const manifest = JSON.parse(index.slice(jsonStart, end));
  const id = Object.keys(manifest).find(k => manifest[k] && manifest[k].mime === 'text/javascript');
  if (!id) throw new Error('text/javascript bundle not found');
  const bytes = Buffer.from(engine, 'utf8');
  const gzip = zlib.gzipSync(bytes);
  manifest[id].compressed = true;
  manifest[id].data = gzip.toString('base64');
  manifest[id].size = bytes.length;
  const next = index.slice(0, jsonStart) + JSON.stringify(manifest) + index.slice(end);
  fs.writeFileSync(INDEX, next, 'utf8');
  return { engineBytes: bytes.length, gzipBytes: gzip.length };
}

function sha256(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

const before = fs.readFileSync(ENGINE, 'utf8');
const after = patchEngine(before);
fs.writeFileSync(ENGINE, after, 'utf8');
const packed = repackIndex(after);
execFileSync('node', ['--check', ENGINE], { stdio: 'inherit' });

for (const p of [SCRIPT_PATH, WORKFLOW_PATH]) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

execFileSync('git', ['config', 'user.name', 'github-actions[bot]'], { stdio: 'inherit' });
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { stdio: 'inherit' });
execFileSync('git', ['add', ENGINE, INDEX, SCRIPT_PATH, WORKFLOW_PATH], { stdio: 'inherit' });
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
console.log('engine.js sha256', sha256(ENGINE));
console.log('index.html sha256', sha256(INDEX));
console.log('packed', JSON.stringify(packed));
if (status.trim()) {
  execFileSync('git', ['commit', '-m', 'Fix hero relic backpack UI'], { stdio: 'inherit' });
  execFileSync('git', ['push'], { stdio: 'inherit' });
} else {
  console.log('No changes to commit');
}