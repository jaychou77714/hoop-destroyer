# HOOPBREAKER｜籃獄圖譜(關卡選擇/atlas)頁 — 線上交接

> 狀態：**已完成 v14、尚未 push**。等 Harry 決定上線。
> 本頁採「**分層組裝**」重做（背景氛圍 + 疊回乾淨空框素材 + 程式文字），已通過 852×393 / 844×390 / hit-test 驗證。

---

## 1. 專案座標
- repo：`jaychou77714/hoop-destroyer`（public）
- live：https://hoop-destroyer.vercel.app
- 引擎 chunk：`875365e8-8f11-4b79-9780-292f266babda`（index.html 內 `<script type="__bundler/manifest">` 的 gzip+base64）
- 改字頁面函式：`drawAtlas()`（畫面切換 `case 'atlas'`）
- 資料來源：`ACTS`(5幕)、`STAGES[id]`(節點，`.boss`旗標)、`RELICS[relic].name`、`save.acts/marks/bossClears/heat/relics/library`

## 2. 這次做了什麼
把「籃獄圖譜」頁美術升級到接近素材包 target mockup，**保留主架構與互動、所有文字程式可改**。
做法（重點）：
- **不**再用 `full_scene_base_no_text` 羽化清字當前景（會有灰霧/黑遮罩痕跡）。
- 改成**分層**：① base 只當氛圍底 ② 把**素材內部烤字清乾淨**後的空框，疊回**JSON 座標** ③ 程式畫文字。
- 關鍵發現：`*_frame_empty` 素材其實**內含烤字且不透明**；base 正是這些素材在**同一組 JSON 座標**合成的，所以清完字疊回＝**完美重合、無雙框、無接縫**。

## 3. 改了哪些檔（要 push 的東西）
1. `index.html` → 改寫 `drawAtlas()`、新增 `_ensureSsBg()`（載入下面那張底圖）。
2. 新增 `assets/stage_select/bg_clean.webp`（分層合成好的乾淨底圖，~187KB）。

> 互動/hit 不變：卡片 `a{id}`（僅解鎖的可點）、`route`→`go('route')`、`back`→`go('hub')`。

## 4. drawAtlas 程式（目前 v14，直接貼入 chunk 取代舊 drawAtlas，並在前面加 _ensureSsBg）
```js
  ,_ensureSsBg(){ if(this._ssBg===undefined){ try{ const im=new Image(); im.onerror=()=>{this._ssBgErr=true;}; im.src='/assets/stage_select/bg_clean.webp'; this._ssBg=im; }catch(e){ this._ssBgErr=true; } } }
  ,drawAtlas(){ const ctx=this.ctx; const U=BW/852, D=v=>v*U;
    this._ensureSsBg();
    if(this._ssBg&&this._ssBg.complete&&this._ssBg.naturalWidth&&!this._ssBgErr){ ctx.drawImage(this._ssBg,0,0,BW,BH); }
    else { this.backdrop('hub'); }
    if(this._selAct>this.save.acts)this._selAct=this.save.acts;
    // header — gold-heavy title (dark outline + green glow) 蓋在已清乾淨的標題牌上
    { const tx=D(428), ty=D(33); ctx.save(); ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.font=`800 ${D(26)}px Georgia,serif`; ctx.lineJoin='round';
      ctx.shadowBlur=D(9); ctx.shadowColor='rgba(120,220,90,0.55)'; ctx.lineWidth=D(6.5); ctx.strokeStyle='#160c04'; ctx.strokeText('籃獄圖譜',tx,ty); ctx.shadowBlur=0;
      const g=ctx.createLinearGradient(0,ty-D(23),0,ty+D(3)); g.addColorStop(0,'#f7e09a'); g.addColorStop(0.55,'#e1b54c'); g.addColorStop(1,'#a9781f');
      ctx.fillStyle=g; ctx.fillText('籃獄圖譜',tx,ty); ctx.restore(); }
    this.text('選擇要進攻的幕', D(428), D(58), D(11.5), '#d8b86a', {align:'center',weight:'700'});
    const cardLeft=[110,242,374,506,638];  // 每張卡文字左緣(css)
    for(let i=0;i<ACTS.length;i++){ const A=ACTS[i]; const locked=A.id>this.save.acts; const cx=D(cardLeft[i]);
      const nameCol=locked?'rgba(150,140,120,0.5)':'#ece0c4';
      this.text('第 '+A.id+' 幕', cx, D(122), D(11), locked?'rgba(160,150,120,0.55)':'#e6c068', {weight:'700'});
      this.text(A.name, cx, D(144), D(19), nameCol, {weight:'800'});
      this.text(A.sub, cx, D(165), D(10.5), locked?'rgba(150,140,120,0.5)':'#b7a98a');
      const sl=STAGES[A.id]||[]; const ny=D(192), nx0=cx, ndw=D(104), nn=Math.max(1,sl.length-1);
      for(let j=0;j<sl.length;j++){ const dx=nx0+ndw*j/nn; if(j<sl.length-1){ ctx.strokeStyle='rgba(200,155,60,0.4)'; ctx.lineWidth=D(1.4); ctx.beginPath(); ctx.moveTo(dx+D(5),ny); ctx.lineTo(nx0+ndw*(j+1)/nn-D(5),ny); ctx.stroke(); } }
      for(let j=0;j<sl.length;j++){ const dx=nx0+ndw*j/nn; ctx.beginPath(); ctx.arc(dx,ny,D(5),0,TAU); ctx.fillStyle=sl[j].boss?'#c4342a':(locked?'#3a2c19':'#8a6a2e'); ctx.fill(); ctx.lineWidth=D(1.4); ctx.strokeStyle='#0e0d0c'; ctx.stroke(); }
      this.text(locked?'未解鎖':'Boss：'+A.boss, cx, D(220), D(11), locked?'rgba(150,140,120,0.5)':'#cfc6b0');
      const mk=this.save.marks[A.id+'-boss']||0, cl=this.save.bossClears[A.id+'-boss']||0, ht=this.save.heat[A.id+'-boss']||0;
      this.text('印記 '+mk+'　擊敗 '+cl+'　熟度 '+ht, cx, D(238), D(9.5), '#a2926e');
      const sig=RELICS[A.relic]; this.text('精英聖物：'+sig.name, cx, D(254), D(9.5), (this.save.relics.includes(A.relic)||this.save.library.includes(A.relic))?'#7fb04a':'#8a7e60');
      if(!locked) this.btn(D(cardLeft[i]-8), D(108), D(122), D(172), 'a'+A.id, ()=>{ this._selAct=A.id; this.audio.sfx('ui'); });
    }
    const rt={x:D(321),y:D(320),w:D(204),h:D(40)};
    if(this._press(rt)){ ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle='#000'; this.rr(rt.x,rt.y,rt.w,rt.h,D(10)); ctx.fill(); ctx.restore(); }
    this.text('選擇路線 →', rt.x+rt.w/2, D(339), D(17), '#241803', {align:'center',weight:'800'});
    this.btn(rt.x,rt.y,rt.w,rt.h,'route',()=>this.go('route'));
    const bk={x:D(20),y:D(42),w:D(86),h:D(40)};
    this.text('← 返回', D(62), D(64), D(12.5), '#f1e7cf', {align:'center',weight:'700'});
    this.btn(bk.x,bk.y,bk.w,bk.h,'back',()=>this.go('hub'));
  }
```

## 5. 底圖 bg_clean.webp 怎麼重建
- 腳本：`build_bg_clean.py`（已附）。用法：`python3 build_bg_clean.py <素材assets資料夾> <輸出webp路徑>`
- 邏輯：清 active/inactive 卡內部、標題主+副字 → base 清自身返回鬼影(bfeath 70,58,210,150)+路線金條烤字(bgold 730,640,1000,690) → 疊回 JSON 座標：標題(338,0,181,71)、五卡(98/236/375/514/653, 83, 140×224)。**返回框/路線金條沿用 base 本身**（JSON 的 back/route 座標對不上 base，不要疊 back/route 素材）。

## 6. repack（改完 chunk 後寫回 index.html）
```python
import re,json,base64,gzip,io
html=open('index.html').read()
m=re.search(r'(<script type="__bundler/manifest">)(.*?)(</script>)',html,re.S)
man=json.loads(m.group(2)); KEY='875365e8-8f11-4b79-9780-292f266babda'; old=man[KEY]['data']
js=open('chunk_engine.js').read(); buf=io.BytesIO()
import gzip,io
with gzip.GzipFile(fileobj=buf,mode='wb',mtime=0) as f: f.write(js.encode())
nb=base64.b64encode(buf.getvalue()).decode()
assert gzip.decompress(base64.b64decode(nb)).decode()==js; assert html.count(old)==1
man[KEY]['data']=nb
open('index.html','w').write(html[:m.start()]+m.group(1)+json.dumps(man,separators=(',',':'),ensure_ascii=False)+m.group(3)+html[m.end():])
```

## 7. 驗證（headless）
- `node shot.js atlas out.png 82 44 4 92`（852×393）、`node shot844.js atlas out.png 80 44 4 90`（844×390）
- `node hshit_atlas.js` 應列出 `a1 / route / back`（鎖定卡無 hit＝原設計）

## 8. push 流程（決定上線時）
- committer/author email **必須** `storyhomedesign@gmail.com`（否則 Vercel Hobby 擋）
- PAT 由 Harry 本 session 提供（HOOPBREAKER 那顆 90 天細粒度 token，可重用、勿存檔）
- Git Trees API 原子提交 2 檔：`index.html` + `assets/stage_select/bg_clean.webp`
  GET ref → GET commit(base_tree) → POST blobs(base64) → POST tree → POST commit(author+committer) → PATCH ref → 再 GET 確認 HEAD

## 9. 待 Harry 決定 / 實機確認
- [ ] 是否 push 上線
- [ ] 標題金字與骷髏鏈條疊壓觀感
- [ ] 路線金條重貼漸層的金色接縫
- [ ] 返回字垂直置中、瀏海安全區邊緣
- [ ] 實機 iPhone15 字級可讀性

## 10. 接手要帶的檔（因容器會重置）
本 session 的成品檔已輸出，下個 session 直接上傳即可續作或 push：
- `index.html`（已含 v14 drawAtlas）
- `assets/stage_select/bg_clean.webp`
- `build_bg_clean.py`、`HANDOFF_stage_select.md`
（素材包 zip 也請一併重新上傳，若需重建底圖）
