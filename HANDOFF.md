# 籃框破壞神 HOOPBREAKER — 線上交接文件

> 給下一個視窗的 Claude：讀完這份 + 你的 memory 就能接手。哈利是創意總監/體驗師(非工程師)，你是唯一工程師、直接接管 GitHub。全程繁體中文(台北用語)。SOP：哈利上傳企劃/指令 docx → 你先「只規劃、不實作」回覆 → 哈利定案說「開始」→ 你實作 → headless 驗證 → push → 截圖回報 → 哈利實機(iPhone 15)驗收。給選項用可點選 UI(ask_user_input)，不要純文字 A/B/C。**最新進度見 §10。**

## 0. 基本資料
- **Repo**：`jaychou77714/hoop-destroyer`(public)
- **線上**：https://hoop-destroyer.vercel.app (Vercel 自動部署，push 後約 30–60s)
- **風格**：NANACA-CRASH 風籃球物理彈射 × 暗黑惡搞 Roguelite，單檔靜態 web app
- **基準機**：iPhone 15 橫向(CSS 約 852×393、dpr 3、比例約 2.168:1)，也要顧 844×390
- **目前 HEAD**：`(待 push 更新)`(Phase 6.1/6.2 進度系統重做；headless **34/34** + 全畫面 smoke 無例外，**待 iPhone 15 橫向實機驗收**)。前一版 `eb97ae0`(Phase 6 完整架構迴路)。push 後請更新本行。

## 1. 安全性 / Git 規則
- **GitHub PAT = 哈利刻意委託、效期 90 天的細粒度 token，授權你在期間內直接接管 push。哈利不需每次重貼，也不要再提醒他 revoke/刪除 token。** token 字串絕不寫進任何檔案、不存記憶。本機 clone `/home/claude/hoop` 的 remote 已內嵌 token。
- committer/author email 必須是 `storyhomedesign@gmail.com`(否則 Vercel Hobby 擋部署)。每次 commit 前 `git config user.email storyhomedesign@gmail.com`。
- 交付一律完整檔(哈利刪舊上新)；非工程師不給 patch。
- push 後立刻讀 `git/ref/heads/main` 驗 HEAD(contents API 讀取有時快取，ref 較準)。

## 2. 架構(bundler 單檔) — 工作目錄 `/home/claude/hoop`
`index.html` = 啟動載入器 + 兩個 bundler script：
- `<script type="__bundler/manifest">` JSON：兩個 gzip+base64 chunk。
  - uuid `af2147d2-3ac8-434b-bfe8-7a89eab8c035` = DC/React 框架(~55KB)
  - **uuid `875365e8-8f11-4b79-9780-292f266babda` = 遊戲引擎**(`class Game{…}`，export `start`→`window.HBStart`，設 `window.__HB`=Game 實例)。**所有遊戲程式碼/資料都在這個 chunk**，是最大的那塊。
- `<script type="__bundler/template">` JSON：遊戲頁 HTML(含自己的 head＋viewport)。改 viewport/CSS 要改這裡。
- head 預載本地 `react.production.min.js`+`react-dom.production.min.js`(同源，**勿刪**)。

### 渲染/座標核心(畫 Canvas 一定要懂)
- 設計空間 = **BW×BH，BH=1080 固定、BW 動態**(程式預設 `let BW=1920`，`resize()` 依裝置改成 iPhone15 約 **2342**)。`scale=min(cw/BW,ch/BH)`、dpr 上限 2；`render()` 做 `setTransform(scale*dpr,…)`，**DPR 與 letterbox 全域處理好，畫的時候只管設計單位**。不要改 resize/render/input。
- **兩種頁面座標慣例(改版前先看該頁是哪種)**：
  - **U-縮放頁(英雄/首頁/板凳席/圖鑑)**：座標經 `_xxxLayout()` 以 `U = 1/this.scale`(iPhone15 約 2.748)把 852×393 CSS frame 換算成設計單位。字級 `N*U` 設計 = N CSS px。安全區 `this.insL/insR/insT/insB` 已是設計單位。版面用 `LO` rect 共用、自適應置中。
  - **Raw-1920/1080 頁(遠征 drawRoute、戰鬥等)**：直接用設計座標(0..BW, 0..1080)，**水平要用 BW 相對**(置中 `BW/2`、靠右 `BW-…`)才能在寬螢幕(2342)正確；垂直 0..1080 固定。⚠️ 別寫死像 1640/1040 這種只對 BW=1920 的數值(遠征頁踩過這坑，已改 BW 相對)。
- 命中：`this.btn(x,y,w,h,id,cb)` 註冊矩形，由後往前掃。**畫的矩形與命中矩形必須同一份**。最小命中 `Math.max(44*U,h)`。輔助：`this._press(rect)`、`this._clip(str,maxW,size,weight)`、`rr/panel/text/wrap/button/drawHero(id,cx,feetY,sc)`、`this._fade(hex,a)`。

## 3. 改引擎流程(每次必照做) — Python repack
```python
import re,json,base64,gzip,io
KEY='875365e8-8f11-4b79-9780-292f266babda'
html=open('index.html',encoding='utf-8').read()
m=re.search(r'(<script type="__bundler/manifest">)(.*?)(</script>)',html,re.S)
manifest=json.loads(m.group(2)); js=gzip.decompress(base64.b64decode(manifest[KEY]['data'])).decode()
# … str replace，每處 assert js.count(old)==1 …
# 平衡檢查 ()/{}/[] 數量相等
buf=io.BytesIO()
with gzip.GzipFile(fileobj=buf,mode='wb',mtime=0) as g: g.write(js.encode())
nb=base64.b64encode(buf.getvalue()).decode(); assert gzip.decompress(base64.b64decode(nb)).decode()==js
manifest[KEY]['data']=nb
if 'size' in manifest[KEY]: manifest[KEY]['size']=len(js.encode())
open('index.html','w',encoding='utf-8').write(html[:m.start(2)]+json.dumps(manifest,separators=(',',':'),ensure_ascii=False)+html[m.end(2):])
```
要點：中文多的段落務必 `assert count==1`；改完查 `()/{}/[]` 平衡；gzip 一律 `mtime=0` 並 round-trip 斷言；改 `data` 後同步更新 `size`。push 用 contents API 單檔(先抓 SHA)或直接 `git commit/push`(本機 clone 已內嵌 token)。

## 4. Headless 驗證(兩種，擇一)
Chromium `/opt/google/chrome/chrome` + **puppeteer-core 裝在 `/home/claude`(不是 /tmp，shoot 腳本要放這跑)**。
- **(A) 真實遊戲**(推薦，渲染真頁)：`python3 -m http.server` 服務 repo，viewport 852×393 dpr 3，`waitForFunction('!!window.__HB')` 後 `G=window.__HB; G.go(screen); G.render()` → screenshot。可注入安全區 `G.insL/insR/insT/insB`。
- **(B) 隔離 harness**(本次 session 用，只想驗單頁、不想完整啟動 DC 框架時)：用 Python 把該頁所需方法(由 `,methodName(` 大括號配對抽出)組成獨立 `G={…}` 物件，stub `drawHero`(畫簡單剪影)/`audio`/`btn`/`go`/`startRun`，補資料 const(HEROES/RELICS/…)，puppeteer 載入後 `window.__set(state)`→screenshot。**踩過的坑**：①英雄頁 harness `scale` 要設 **0.5**(否則 U 錯、卡片過高)②遠征頁 harness `BW=2342, BH=1080`③`backdrop('hub')` 會讀 `this.stars`，要 stub `stars:[]`④site3 工作目錄在 `/home/claude/site3`。

## 5. Canvas 主頁總覽

| 畫面 | 函式 / go() | 座標慣例 | 重點 |
|---|---|---|---|
| 選擇英雄 | `drawHeroes` / `heroes` | U-縮放 `_heroesLayout` | **已完成 phase-1 改版**(見 §10)。左英雄卡(立繪+新名/英文/定位+數據列+基礎技能+五聖物 loadout 列)、右天賦樹三線**破框/髒球/手感**(擦板蠻王 21 節點，其餘規劃中)。 |
| 遠征頁 | `drawRoute` / `route` | Raw-1920/1080(BW 相對) | **已完成 phase-2 改版**(見 §10)。上幕別、右上英雄+5聖物+BD 唯讀摘要、左三路線、右六球路石板 2×3、底部出戰摘要+進場。由 atlas 進入。 |
| 首頁 | `drawHome` / `home`(開機頁) | U-縮放 | flat 場景圖滿版；死亡計數真 state(`save.deaths…`)。`_homeMode` flat(出貨)。已移除「圖鑑」，只留 玩法/設定 2 鍵置中。 |
| 最後板凳席 | `drawHub` / `hub` | U-縮放 `_fbLayout` | Final Bench flat 圖；右側不透明哥德面板畫當前投手卡(HEROES[save.hero])+碎金+四鍵。**「∞ 無盡」「天梯榜」反灰停用**(點擊 toast「即將開放」)，原聖匣入口已撤。 |
| 宿主圖鑑/玩法 | `drawCodex` / `codex` | U-縮放 `_hgLayout` | 暗黑手冊全 Canvas 自繪；8 列文字源 = `_guideRows()`。返回回首頁。 |
| 籃獄圖譜 | `drawAtlas` / `atlas` | — | **近 FINAL，勿大改**。5 幕卡片、每幕 4 節點、節點 canvas 自繪(`_atlasNodes`)。底圖 webp。選幕後 → 遠征頁。 |

> 其餘(戰鬥 battle/win/lose、drawRelics 舊聖匣、settings)本階段未動。

## 6. 聖物系統現況(phase-1 後已大改)
- **英雄頁五聖物 loadout = 已實裝可用**：`save.loadout:[null×5]`(出戰前攜帶 5 個)。`_relicRow` 顯示「聖物 N/5」+5 格(類別色+首字)+BD 標籤+背包鍵；`drawRelicBag` 覆蓋層列全部 16 聖物(2 欄、依五類排序、★推薦、灰=未擁有、已裝亮框)，`_toggleRelic` 裝卸。第一階段**全部可選+標示擁有**(解鎖經濟後再限制只能裝已擁有)。
- **聖物五類**：`cls` = `core 核心 / feel 手感 / oath 誓約 / gag 惡搞 / job 職業`。職業聖物有 `hero` 欄=**軟性推薦標籤**(UI 標★，非硬鎖，所有英雄都能裝)。
- **BD 標籤** `_bdTags(load)`：由聖物 `form`(火/冰/雷/斧頭/箭/皮球)+desc 關鍵字(護盾/擦板/連擊/高風險/成長)推導；類別色/名 `_clsCol`/`_clsName`。
- **⚠️ 尚未串接戰鬥**：`save.loadout`(5 格 loadout) 與 **舊的 `save.relics:[null,null,null]`(局內 3 通用欄，`drawRelics`/`startRun` 用)是兩套**。把 loadout 帶進戰鬥、取代/整合舊 3 欄 = **未來戰鬥階段**的工作，第一/二階段刻意不動。

## 7. v2 企劃 + 階段藍圖(哈利的凍結方向)
v2 定義：單指拉弓物理投籃 × 暗黑惡搞 Roguelite × **五聖物 BD** × **英雄天賦樹** × 籃框宿主戰鬥。頁面順序：英雄選擇頁 → 遠征頁 → 籃獄圖譜 → 戰鬥畫面 → 完整第一幕。
- **Phase 1 英雄頁**：✅ 完成(§10)。
- **Phase 2 遠征頁**：✅ 完成(§10)。
- **Phase 3 籃獄圖譜**：近 FINAL，只需收尾統一暗黑墓碑風，**不大改**。
- **Phase 4 戰鬥畫面**：最大工程。左英雄/右怪群+籃框宿主、軌跡清楚、UI 簡化。子階段：**4-1 HUD 重排 ✅(`1937f89`)**；**4-2 五種進球判定 ✅(`90041cf`)**；**4-3 loadout 帶入(只摘要+開局形態) ✅(`cfce57b`)**；**4-4 擦板蠻王最小被動 ✅(`7889f3d`)**；**4-5 干擾補接+預告 ✅(`e90147c`，見 §10)**；**4-6 籃框位置行為牌+下一球預告(第一版) ✅(`186faa3`，見 §10)**。哈利定的開工順序＝4-1→4-2→…。
- **Phase 5 完整第一幕**(灰哨修院 4 關+怪物+Boss 三階段)。
- **小階段(哈利提過)**：導航優化(目前遠征頁「點摘要回英雄頁」後，英雄頁返回是回 hub 非回遠征頁)；英雄美術(現用 7 張現成 `hero_*.png`，之後重繪)；遠征頁底圖(現程序底+暗黑框，之後新繪)。

### 硬性禁止(企劃明列，務必遵守)
不做技能按鈕戰鬥/不加底部技能列；聖物不做成傳統裝備(武器/頭盔/戒指/衣服)；天賦不做純數值加成；不移除拉弓投籃；籃框不固定也不亂跳(要公平可讀)；怪物不即時亂攻擊(每球一回合、有預告)；UI 不蓋軌跡；不重畫已近完成的 FINAL 頁。

## 8. 關鍵資料結構(都在引擎 chunk，用 `,名稱(` 或 `const 名稱` 定位)
- `HEROES`(7)：`{id,name,en,role,body,col,passive,tag,origin}`。`tag`=核心一句話、`origin`=原型備查(phase-1 加)。id：shade/bone/archer/axer/whistle/elem/beast。
- `HERO_TALENTS`：以英雄 id 為 key；目前**只有 `axer`** 三線(`break/dirty/feel`)×7 格 `{name,desc}`；其餘 id 無 key → 視為「規劃中」。
- `_talentLanes()`：三線 `break 破框系(橘⚔)/dirty 髒球系(藍❖)/feel 手感系(綠❀)`。
- `RELICS`(16)：`{name,cls,form?,act?,hero?,desc}`。cls 五類見 §6。phase-1 改：ref_glasses→gag、kings_seal→job+hero:axer、新增 `board_brace`(板魂護腕,job,hero:axer)。
- `ROUTE_STONES`(6)：`{id,name,desc}` = 無門捷徑/貪婪深路/追獵者誓約/不朽鎮印/遠望之徑/替補名單。遠征頁右側 2×3。
- `ACTS`(5)：`{id,key,name,sub,sky…}`，A.name 例「灰哨修院」。
- `STAGES`/`GUARDS`(11)/`INTERFERENCES`(6 干擾)/`BALL_FORMS`(6)/`ABILITIES`(球途盤 18,局內三選一)/`BALL_WORDS`(7 球語)：戰鬥/局內系統，**本階段未動**。
- `defaultSave`：含 `hero`、`relics:[null,null,null]`(局內 3 欄,舊)、**`loadout:[null×5]`(phase-1 加,英雄頁)**、`library:[]`、`coins`、`stats{}`、`settings{}`。`loadSave` 會把 defaultSave 新 key 自動補進舊存檔(遷移安全)。
- 持久化：改 save 後呼叫 `persist(this.save)`。

## 9. 資產路徑(repo 根 `/assets/…`)
- 英雄立繪 `assets/hero_*.png`(×7)、英雄頁底圖 `assets/hero_select/bg_clean.webp`
- 首頁/板凳席/圖鑑 flat 圖、籃獄圖譜 `assets/atlas_base_clean_no_nodes_1704x786.webp`
- 宿主圖鑑豆人 `assets/host_guide/bean_demon_minimal_transparent_512.png`
- PWA：react/react-dom 本地檔、icon、manifest.json；`vercel.json` 讓 index.html `no-cache`

## 10. 本次 session 完成(英雄頁 + 遠征頁)

### ★ Phase 6.1/6.2 進度系統重做(本次最新，HEAD 待 push)
暗黑式累積：把 Phase 6 的「貨幣解天賦」改成「永久等級＋天賦點」，並上聖物隨機素質。哈利定案：① 每英雄永久累積等級(賽季歸零概念先留)②天賦方案 A(每英雄 3 主題線)③分解就是分解不給獎勵、商店先封存、遊戲內＝暗黑式累積 XP 升級。補充：核心球限 1、聖物隨機素質一次做完。
- **移除**：碎金(`save.coins` 不再增加，板凳席欄改「今日命中率」per-hero 每日重置跟著選的英雄)、籃魂幣(`profile.coins` 整個退役)、商店(`_shouldOpenShop` 永遠 false、reward 後直接下一關，drawShop 碼留著休眠)、HUD 金幣 pill、reward/結算金幣字樣、分解給幣(兩處)。
- **永久等級**：`profile`(bump `hb_profile_v2`= `{heroes:{id:{level,xp,talents}},relicMeta:{},heroDay:{key,stats}}`)。`startRun` 載入該英雄 `_heroProg(id).level/xp`→`run.level/xp`，`xpNext=min(180,round(100*1.15^(lv-1)))` 軟上限(高等仍每幕升得到、升級三選一持續)。`gainXP`/`finishRun` 把 run 等級存回該英雄。遊戲內 HUD 等級＝英雄選單等級＝同一數字、不歸零。
- **天賦點**：每 10 等 1 點(`_talentPtsEarned/Spent/Avail`)、無貨幣。每英雄 3 主題線×7 格(`HERO_LANES`+`_laneNodes()`→`TALENT_TREES` 共 21 節點，row2/4=mid、row6=big 英雄異變壓頂)。**逐格爬**：`_talentNodeLocked` 同線需先解上一格＋點數檢查。`drawTalents` 重寫為 3 線版面(線標題+逐格連線+天賦點顯示)。
- **聖物隨機素質(6.2)**：`RELIC_AFFIXES`(13 詞綴 pool)+`_qualTier`+`QUAL_NAME/QUAL_COL`(普通白/精良藍/稀有金)。`_rollRelicMeta`(品質 q=5~50、tier 決定詞綴數 1~3、val 按 q/50 縮放)、`_relicMeta`(id 為 key、lazy roll、存 `profile.relicMeta`)、`_rerollRelicMeta`。`_applyRelicAffixesToRun`：loadout 聖物詞綴→`run.mods`/maxhp/shield(走既有 mod 系統，不改 relicOnBasket 戰鬥 hook)，由 `_applyTalentEffectsToRun` 末端呼叫。顯示：背包列品質色+品質名、結算 loot 卡品質色 border+「強度 q/50」+詞綴行(◆ label +val)。**已知簡化**：每 relic id 一個 roll(不支援同 relic 多實例)。
- **核心球限 1**：`_toggleRelic` 裝帶 `form` 的聖物時先清掉既有 form 聖物(toast 替換)、最多帶 1 顆球。
- **燃燒/持續傷害實裝**(原是真 bug：`burnDps*dt`→`Math.round` 變 0 既噴 0 又沒扣血)：生效 `updateGuards` 改每 0.5s tick `hurtGuard(max(1,round(burnDps*0.5)))`。axe/arrow 視覺 projectile(dmg:0)三處加 `if(p.dmg>0)` 守衛、不再噴 0(實際傷害已由技能結算器一次給足)。
- **驗證**：headless **34/34**(天賦樹 21/3 線、永久等級載入存檔、天賦點每 10 等 1 點+逐格 gating+無貨幣、今日命中率 per-hero、聖物素質 q5~50+詞綴+套用 mods、shop 封存、核心球限 1 替換、燃燒真實扣血、回歸 stepBall/collideHoop/battleUp/mods 結構)。全畫面 smoke(home/heroes/3 線 talents/板凳席命中率/品質背包/codex/route/battle 無金幣 HUD/30 幀 step/reward/win 詞綴卡/lose)無例外。**未動**：同 Phase 6 不動清單(投籃物理/battleUp/stepBall/collideHoop/hitbox/五判定/擦板蠻王/干擾/殘影/籃框位置牌/五幕閉環/mods 基本結構/軌跡曲線/手機橫向)。
- **遺留死碼可由 Codex 清**：`ABILITIES`/`REWARDS`/`chooseForm`/`chooseAbility`/`FORM_CHOICES`/`TALENT_SMALL`·`TALENT_MID`·`HERO_MUT`(舊版被取代)。`run.gold` 仍累積(商店未來回歸用)。

- **Phase 1 英雄頁**(`a9fd9d5`)：7 英雄改惡搞名+一句話；天賦三線改名+擦板蠻王 21 節點(其餘規劃中)；五聖物 loadout(`save.loadout`)+功能背包覆蓋層 `drawRelicBag`+BD 標籤；聖物重標五類+新增板魂護腕。
- **Phase 2 遠征頁**(`9504199`→自適應修 `9102eac`)：drawRoute 重塑為出戰選擇頁。新增英雄+5聖物+BD 唯讀摘要(複用 `drawHero/_bdTags/_clsCol`)、空聖物提示回英雄頁、三路線(速投/標準/腐化)卡片化、六球路石板 2×3、底部出戰摘要+進場。**沿用 `startRun(act,route,stone)` 行為不變**。
- 兩階段都**未動**：戰鬥/win/lose、物理引擎、籃獄圖譜、home/hub、球途盤三選一、球語、部署。
- **Phase 4-1 戰鬥 HUD 重排**(`1937f89`)：**只重寫 `drawHUD()` 一個方法**。左上整合英雄面板(圓形立繪徽章複用`drawHero`裁切+惡搞名+Lv+HP/護盾+經驗細條+球形態膠囊+干擾預留槽「無」)、上方關卡條集中(幕別`ACTS.name`/關卡名`stage.name`(boss轉紅)/第N/M波/剩餘護衛X/Y)、右上只留暫停(`_pauseHit`保留)、底部極簡(球形態+「下一籃框行為：—」預留)、連擊改關卡條下方單一焦點、HUD 全錨安全區`insL/insR/insT/insB`(舊版用死margin 40)。**未動** stepBall/battleDown·Move·Up/collideHoop/makeBasket/BALL_FORMS/ABILITIES/drawAim/物理/heroes/route/atlas/home/hub/球途盤/球語/部署。headless 四態驗證通過(未瞄準/瞄準/投球後/Boss波數)。

- **Phase 4-2 五種進球判定**(`90041cf`)：**只動三函式**。`spawnBall` 初始化 `rimBounces:0/_rimLatch:false/scoreType:null`；`collideHoop` 加上升緣閂鎖累積 `rimBounces`(防每幀灌水，反彈衝量一字未改)；`makeBasket` 依優先序判 `b.scoreType`(空心`!board&&rb===0`>擦板`board&&rb===0`>幸運`rb>=2`>普通其餘)、用相容布林`swish/bank`餵下游、補「幸運進球 LUCKY!」(紫#c89bff)/「進球」浮字。**幸運球**：傷害=XP=普通(走 swish=bank=false)、不觸發空心/擦板/擦板蠻王加成、combo 照++不中斷。投失沿用 `endShot(false)` 未動。headless 驗證：五型判定優先序正確(含 board+rb>=2→lucky)、閂鎖貼框8幀只計1次/離開歸位/再接觸計2、LUCKY 浮字渲染 OK。**未動** stepBall/battleDown·Move·Up/drawHUD/drawEnd/物理/heroes/route/atlas/球途盤/球語/干擾/loadout。
- **`b.scoreType` 現可用**：戰鬥內每次進球後 `run.ball.scoreType` ∈ {swish,bank,lucky,normal}。未來若要結算頁幸運球計數或聖物依 scoreType 觸發，直接讀此欄。
- **瞄準觸控小修**(`8623688`)：為實機測試手感，把拉弓改成「**按下點為錨、拖曳差量**」模型(原本是球→手指、按遠處會滿力)。生效 `battleDown`@2206、`battleUp`@765、`drawAim`@1883(檔內有重複定義，**取最後者為生效**，別改到死碼 759)。新增 `run.aimStartX/aimStartY` 錨點(按下時記錄)；battleUp/drawAim 用 `(aimStart - 手指)` 算方向力道。**發射起點與預測軌跡仍從球 b.x,b.y**。觸控避開 UI(英雄面板 IL+24..+486×IT+22..+210 / 關卡條 BW/2±280×IT+18..+92 / 暫停右上 / 底部 BH-IB-44 以下)，保留按球附近也可拉。headless 驗證 10 項全過(任意空白拉/錨點正確/左下拖→右上射/起點在球/UI不誤觸/按球附近仍可/點擊不誤射)。**未動** stepBall/collideHoop/makeBasket/五種判定/drawHUD/籃框行為/干擾/loadout/heroes/route/atlas/球途盤/球語。

- **Phase 4-3 loadout 帶入戰鬥(最小版)**(`cfce57b`)：**只動 `startRun`+`drawHUD`**。`startRun` 新增 `run.loadout`(來源優先 `save.loadout`，全空才 fallback `save.relics`，補成 5 格含 null)；開局 `startForm` 改由 `run.loadout` 由左到右第一個帶 `form` 的聖物決定(abbey_ember→fire/sand_bow→arrow/citadel_battery→lightning/red_axe→axe/final_chill→ice，無則 normal)。`drawHUD` 英雄面板底部加「聖物」列：5 格唯讀 chip(`_clsCol(cls)`類別色+聖物首字、空格虛線「—」)+ BD 標籤(`_bdTags(run.loadout)`)；為留空間把球形態膠囊上移到 py+130、chip 列 py+176(仍在現有觸控排除 210 內，**故不必動 battleDown**)。**關鍵安全**：`run.relics`/`run.relicIds` 維持 `save.relics` 不變，5 聖物**不進** relicOnBasket/relicOnMiss → 任何聖物數值效果都不誤觸發。headless 驗證：loadout 正確帶入/relicIds 未被覆寫且不含 loadout id/八種開局形態全對/fallback OK/**回血反證**(blood_chalice 只在 loadout→進球 HP 不變50；放 relics→HP 52)/kings_seal 只在 loadout→擦板無護盾/HUD chip+BD 渲染不擋場景。**未動** stepBall/battleDown·Move·Up/collideHoop/makeBasket/五種判定/籃框行為/干擾/球途盤/球語/heroes/route/atlas/home/hub/部署。

- **Phase 4-4 擦板蠻王最小被動**(`7889f3d`)：**只動 `startRun`+`makeBasket`+`drawHUD`**。`startRun` 初始化 `run._boardBuff=false`。`makeBasket` 順序 a→d：**(b)消耗**——若 `run._boardBuff && run.form∈{fire,ice,lightning}` 則 `ctx.dmg×1.3`、清 buff、浮字「板魂爆發!」(在 `BALL_FORMS.attack` 之前)；**(c)** form 攻擊；**(d)設定**——若 `run.heroId==='axer' && bank` 則攻擊後 `_boardBuff=true`(不自吃)。布林**不疊層**、固定 +30%。AoE 只認 fire/ice/lightning；normal/axe/arrow 不消耗。投失保留(未動 `endShot`)。`drawHUD` 聖物列右端加「⚔板魂蓄勢」徽章(僅 axer+buff，BD 標籤遇 buff 自動截短讓位)。headless 驗證：axer 擦板設 buff/+30% 實測(fire 1.313、lightning 1.325，ice 因 randi(3,5) 命中數隨機致比值雜訊但 cleared=true)/消耗後清除/swish·normal·lucky 不設/其他英雄不設/normal·axe·arrow 不消耗保留/投失保留/連續擦板不疊層/HUD 徽章渲染 OK。**未動** stepBall/battleDown·Move·Up/collideHoop/五種判定 if 鏈/loadout/聖物數值/heroes/route/atlas/球途盤/球語。
- **`run._boardBuff` 現可用**(布林)；未來 4-5/4-6 或天賦樹要擴充擦板蠻王效果可沿用此旗標。
- **Phase 4-5 怪物干擾補接+預告**(`e90147c`)：六種干擾**都有對應怪**(chain→gravity/bat→shortTraj/zombie→maxPull/frost→slowCharge/eye→hideLanding/drummer→drum)，機制**已是每球一回合制**(`advanceInterference` 每球推進怪 cast、頭頂 pips 預告)。本階段：新增 `_mainIntf()`(回本球唯一主要干擾)；`guardCast` 改 `run.intf=[{…}]` **只留 1 筆**(最新取代)、drum 不佔槽仍推進其他 intf 怪 cast+1；`drawHUD` 干擾槽改讀 `_mainIntf` 顯示 icon+名稱+剩餘球數(不再列多個)；`drawAim` 新增**落點圈**(預測末端、`hideLanding` active 時只隱藏此圈、軌跡點全保留)、加 `slowCharge → maxPull×1.15`；`battleUp` 同加 slowCharge `maxPull×1.15`(沿用現有 maxPull 管線、不改拉弓模型)；`drawGuardTags` 縮小 96×26→80×22 避免擋籃框。gravity(`_gravMul`×1.25)/shortTraj(dots×0.5)/maxPull(×0.85) 維持。headless 驗證：六種各進 intf(cap 1)/最新取代/drum 推進別人 cast+1 且不佔槽/gravMul 1.25/實測力道 none 2228·slowCharge 2045(×1.15 較低)·maxPull 2477(×0.85 較高)/落點圈顯示 vs hideLanding 隱藏(軌跡點仍全在)/干擾槽只顯 1 主要。**未動** stepBall/collideHoop/makeBasket 五種判定/擦板蠻王/loadout/heroes/route/atlas/home/hub/球途盤/球語/部署。

- **Phase 4-5a 頭頂預告可讀性**(`40f9a1d`)：實機 iPhone 15 橫向看不清，**只改 `drawGuardTags`**。tag 80×22→108×30、icon 18px、cast 由文字改**圓點 pips**(直徑6/間距3、實心=已蓄/空心=剩餘)、深黑底~0.78、金描邊(casting 橘金#ffb24d+shadow 脈動)、上移6px、**近籃框/右緣自動左移66px**避免擋框、casting 加「!」。不顯長文字。**機制全不動**(slowCharge/maxPull/hideLanding/drum/落點圈/軌跡/物理/五種判定/擦板蠻王/loadout/heroes/route/atlas)。

- **Phase 4-5b 投籃輔助+殘影+頭頂預告放大**(`5b45664`)：(1)`drawAim` 底部中央『力道%　弧線(平射/標準/高拋)』僅瞄準中、力道=拉弓/maxPull、弧線由 `ang` 分類(<30平射/<55標準/else高拋)。(2)**上一球前50%殘影**：`startRun` 初始化 `run.prevTraj`、`battleUp` 後 `_recordPrevTraj(b)` 用發射 vx/vy 模擬弧取前50%、`drawAim` 灰虛線 alpha0.3 畫在預測下層、投進投失皆保留、spawnBall 後保留、hideLanding 不影響。(3)`drawGuardTags` 放大 108×30→132×36、icon 18→22、pips d6→d8/間距3→4、casting 描邊加粗+橘金#ffc266+『!』更明顯、近籃框自動左移80。**機制全不動**。
  - **✅ 已過實機驗收(iPhone 15 橫向)**：投籃輔助資訊／上一球殘影／小怪頭頂預告**先保留現況**；**頭頂預告留待未來美術 polish 階段統一調整**。**4-5 系列不再細修**。

- **Phase 4-6 籃框位置行為牌+下一球預告(第一版)**(`186faa3`)：沿用 `POS_POOL` 9 位置當牌庫(label 即牌名)。新增 `_pickHoopCard(excludeIdx)`。`pickHoopPos` 進球換位(force=false)改**套用 `run.nextHoopAct`(預告牌)**而非當下隨機 → 寫入 `run.hoopAct` → 補抽新 `run.nextHoopAct`(≠目前)；force/init 仍抽新。**絕對定位**(固定基準+POS_POOL dx/dy、不用 += 不漂移)。`drawHUD` 右下改『進球後框位：<nextHoopAct.label>』。投失(`endShot(false)`)不換位、預告不變。換位(repos lerp)只在投球之間;`ball.live`/`run.aiming` 時不動 hoop 目標也不設 repos。**關鍵**:`pickHoopPos(false)` 由 `endShot(true)`@941 呼叫(非 makeBasket)。headless 驗證:套用=上一預告/hoopAct=預告/新預告≠目前/repos 啟動/label 同步/連續5球不漂移(tx 恆定)/投失不動/五種判定 swish·bank·lucky·normal 正常/擦板蠻王 axer bank 正常/瞄準·飛行籃框靜止。**未動** stepBall/collideHoop/makeBasket五種判定/hoop·rim hitbox/擦板蠻王/干擾/4-5b/loadout/heroes/route/atlas;未新增 HOOP_ACTS;無縮框斜框旋轉飛行中移動。
  - **✅ 已過實機驗收(iPhone 15 橫向)**：右下「進球後框位」正常顯示、進球後換位可接受、投失留原地＋上一球殘影修正方向**保留**。**不再追加**縮框/斜框/旋轉/飛行中移動。**已知小問題**：浮字在籃框附近略擁擠 → **記入未來美術 polish / FX polish，不在本階段處理**。**Phase 4 戰鬥核心目前視為穩定版。**

- **Phase 5 第一幕灰哨修院閉環(第一版)**(`700bd03`)：`STAGES[1]` 補 1 普通關(禁聲長廊,body smith,guards zombie/shield,count13)湊滿 **4普通+1boss=5場**。`startRun` std 僅 act1 `path=[all0,all1,all2,all4,all3]`(新關 all4 插在 boss all3 前;**fast/corrupt 不動**仍 boss=all3)+初始化 `run.rewardPending=false`/`run.actCleared=false`。`onStageClear` 插入獎勵流程:**保留最後關保護**(`pi+1>=path.length`→`actCleared=true`+`finishRun(true)` 不進獎勵)否則 `rewardPending=true`+`go('reward')`。新增 `screen='reward'` 分派 + `drawReward()` 三選一(回血25%maxhp/護盾+20/加分+200,複用 `heal`·`shield`·`score`)+`_pickReward(id)` **防連點**(`rewardPending` 一次性,選一次即 false)。回血用 `heal()` 自帶 clamp 到 maxhp。`drawEnd` 沿用 ACTS 名顯示『灰哨修院 通關』。headless 驗證:5場(血汗/亂葬/地獄/禁聲長廊/地下籃堂 boss@idx4)、普通關清關→reward、回血90→100 clamp、連點無效、護盾+20、加分+200、各進下一關、boss 清關→win 不進 reward、全程 5 場。**未動** stepBall/collideHoop/makeBasket五種判定/擦板蠻王/干擾/4-5b/籃框位置牌/loadout/heroes/route/atlas;無新 BD/boss 專屬系統。**關鍵**:`onStageClear` 換場有 800ms setTimeout;測試需強制 `run.spawned=run.guardsTotal` 跳過 boss 波再 clear。
  - **✅ 已過實機驗收(iPhone 15 橫向)**：第一幕可跑 4普通+1boss 共5場、前4關通關進三選一獎勵頁、回血/護盾/加分可接受、Boss 通關直接進通關結果。Phase 4 戰鬥核心仍穩定版。**獎勵頁目前為功能版 UI，美術 polish 留待之後**。**Phase 5 第一版不再細修。**

- **Phase 5-1a 第一幕籃框遠近平衡**(`bdd5a60`)：解「第一幕每球大三分」。`POS_POOL` **append** 2 真正近框(**idx9 貼框低 dx-400/dy-120、idx10 貼框 dx-520/dy-180**;既有 idx0-8 不動)。`_pickHoopCard` 加 `run.act===1` 分層:NEAR=[9,10,0,1]/MID=[2,3,4]/FAR=[5,6,7,8](idx8 近極高=高拋歸 far難度)。**第1-2關(pi<=1)只近+中不出遠**;**第3-4關(pi<=3)近中為主+少量遠(僅遠低idx5)且 `run._lastWasFar` 防連續遠**;**Boss(pi4)中遠輪替但 `run._farStreak>=2` 強制回近中**。非 act1 維持原 `maxIdx=3+tier`(<9,新條目不影響其他幕)。headless:第1-2關無遠(distinct[0,1,2,3,4,9,10])、真正近框可達、第3-4關遠僅idx5且不連續、boss farStreak<=2、idx9/10 append 完整、Phase 4-6 預告(score 套用/miss 不換位)正常。**未動** pickHoopPos 絕對定位/nextHoopAct·hoopAct/右下框位文字/物理/五種判定/hitbox/擦板蠻王/干擾/4-5b/閉環骨架/reward。**注意**:框位平衡只在 `_pickHoopCard` 約束「合格 idx」,卡片架構不變。

- **Phase 5-1b 獎勵與成長系統**(`484b156`)：reward 頁從補給升級成 Roguelite 成長頁。新增 `REWARDS` **12 池**(生存4 heal/shield/ironhide/regen、投籃2 nearfocus/farfocus、攻擊6 fireup/frost/thunder/bankfaith/swishzeal/luckydisc)+`REWARD_IDS`。`startRun` 初始化 `run.mods`(10鍵:傷害類 1、生存類 0)+`run.modStacks{}`+`run.rewardChoices[]`。`_rollRewards()` 抽 3 不重複、**疊滿(maxStack3)排除**、heal/shield 即時類永遠可出。`drawReward` 改正式成長卡(類型標籤 生存綠/投籃藍/攻擊橘+名稱+短描述+`Lv n/3`,標題『選擇一項成長』)。`_pickReward` 套用即時(heal clamp/shield+20)或 mod(+0.15/+0.05、cap damageReduce0.45·stageStartHeal0.15·mult1.45、modStacks++)、防連點(rewardPending 一次性)。**`_applyRewardDamageMods(ctx)` 掛 `makeBasket` 的 `BALL_FORMS.attack` 前**(fire/ice/lightning 依 `run.form`、swish/bank/lucky 依 ctx、近/貼→nearMul·遠→farMul 讀 `run.hoopAct.label` 首字、中框不吃;**與板魂相乘**;ctx.lucky 由 makeBasket 補)。`playerHurt` 開頭減傷(先於扣盾,`Math.min(0.45,…)`)。`enterStage` 每場 `stageStartHeal` 回血(clamp 0.15)。`onStageClear` 進 reward 前 `_rollRewards()`。headless:mods 初始化/抽3不重複/重繪穩定/疊滿排除/heal clamp+連點無效/shield+20/ironhide cap0.45×3/regen cap0.15×3/fireMul cap1.45×3/fire115·ice130·lightning145·normal不吃·swish·bank·lucky·近·貼·遠·中框不吃·板魂×獎勵=180/減傷100→55/每場回血+10。**未改** 五種判定 if 鏈/shotDamage/擦板蠻王/物理/hitbox/干擾/4-5b/5-1a 框位/閉環骨架/loadout/heroes/route/atlas;run 內有效、無永久成長、無全域 dmgMul。

- **Phase 5-2 五幕閉環擴張+投籃軌跡難度曲線**(`5a8aa0f`)：`STAGES` 全 5 幕重建,**各 4 普通+1 boss=5 關、boss 末位(idx4)**。Act1 灰哨修院(reorder boss 末位,gameplay 同)/Act2 鐵籃貧民窟(shield·drummer,tier2-4)/Act3 冷焰球具塔(frost·eye,tier3-4)/Act4 雷骨看台(chain·bat,tier4-5)/Act5 終焉籃堂(混合,tier4-5,boss waves4)。沿用現有 body/guards 素材。`ACTS` act2-5 改幕名+boss名(key/sky/relic 不變)。`startRun` std/corrupt path 統一 `[0,1,2,3,4]`、fast `[0,2,4]`(boss idx4 全幕;**移除 act1 特例**)。`_pickHoopCard` 擴 act2-5 分層(act2 近中+少遠[5,6]/act3 中為主遠增/act4 中遠混合不長連發/act5 更難但 `_farStreak>=2` 回近中;NEAR=[9,10,0,1]/MID=[2,3,4]/FAR=[5,6,7,8])。`_endStats` 加 `route`/`stone`。`drawEnd`:won&act<5→『前往第 N 幕』`startRun(act+1,route,stone)`;act5 won→『★全五幕遠征通關★』。**軌跡難度曲線**:新增 `_getAimPreviewPct()=clamp(1-((act-1)*5+pi)*0.05,0.55,1)`;`drawAim` `dots*=pct`(**只縮可視長度**、落點圈用迴圈末端 `_lx,_ly` 自動跟隨不暴露完整落點、與 shortTraj*0.5 疊加、`min7`、hideLanding 仍只隱藏圈);輔助文字加『軌跡 %』。headless:五幕各5關/boss末位/軌跡% a1p0=100·a1p4=80·a2p0=75·a2p4=55·a3+=55/各幕分層(act1 stage1 無遠·act5 streak<=2 有近中)/前往下一幕帶 route/act2 完整閉環/reward 傷害加成·5-1a 回歸。**未動** 物理/battleUp力道/stepBall/collideHoop/hitbox/五種判定/shotDamage/擦板蠻王/干擾核心/各干擾機制/殘影/REWARDS·run.mods 數值/抽選邏輯/loadout/heroes/atlas/聖物背包/天賦樹。**注意**:全幕 boss 統一 idx4;軌跡% 只影響 drawAim 可視點數,不影響球路/殘影記錄。
  - **✅ 已過實機驗收(iPhone 15 橫向)**：Act1~Act5 各 4 普通+1 Boss(共 25 場結構成立)、Act1~Act4 通關可前往下一幕、Act5 通關顯全五幕遠征通關、軌跡難度曲線(100% 起每節點 -5% 最低 55%)可接受、shortTraj/hideLanding 與軌跡曲線疊加正常、5-1a 框位/5-1b 獎勵成長/Phase 4 戰鬥核心皆正常。**本階段不再細修。**

- **Phase 6 完整架構迴路**(`bf103bb`)：一次補齊主要遊戲架構。實作策略＝把引擎 chunk 解成 `/home/claude/engine.js` 用檔案 str_replace 編輯、再整檔 repack(gzip mtime=0+round-trip 斷言+更新 size)。**新增資料結構**(附加在引擎尾)：`COMMON_UPGRADES`(24 個共用 BD、攻擊/投籃/生存/經濟四類、**無職業字眼**)+`UPMAP`、`COMMON_RELICS=RELICS`(聖物已去職業化)、`SHOP_ITEMS`(5 品項)、`TALENT_SMALL`(12)/`TALENT_MID`(6)/`HERO_MUT`(七英雄各3異變)/`buildTalentTree()`/`TALENT_TREES`(每英雄 21 格)、`PROFILE_KEY='hb_profile_v1'`/`defaultProfile`/`loadProfileRaw`/`saveProfileRaw`。**新增方法**：profile(`_loadProfile`/`_saveProfile`/`_talentUnlocked`/`_talentBoughtCount`/`_talentNodeLocked`(中需3格/大需7格)/`_buyTalent`/`_getHeroTalentEffects`/`_applyTalentEffectsToRun`)、**技能傷害結算器**(`_getAliveGuards`/`_pickSkillTargets`(all/nearest/farthest/lowhp/random/aoe)/`_dealSkillDamage`/`_skillSweep`/`_applySharedSkillEffects`)、共用升級(`_applyUpgrade`/`_rollUpgradePool`/`chooseUpgrade`/`rerollUpgrade`)、金幣(`addRunGold`/`_clearGold`)、流程(`_shouldOpenShop`/`_continueAfterReward`)、商店(`drawShop`/`_pickShopItem`)、天賦頁(`drawTalents`)、除錯(`_dbg`)。**現有方法串接**：`startRun`(加 `gold:0`/`xpNext:100`/`levelUpsPending`/擴充 `run.mods` 全鍵/`shopBought`·`rewardLog`·`mut`/呼叫 `_applyTalentEffectsToRun`/初始化 `sessionStats`/幕間 `actGold`)、`gainXP`(套 `xpMul`+企劃公式 `round(100*1.22^(lv-1))`+清關中不自動開升級)、`killGuard`(擊殺 XP 普通+10/菁英+20、金幣 +2/+4+`killGoldBonus`、`killHeal` 異變)、`makeBasket`(板魂異變加成、`_applySharedSkillEffects`、首球旗標)、`formAxe`/`formArrow`(**改技能結算器邏輯保證命中**、projectile 降純視覺 dmg:0)、`hurtGuard`(`executeMul`+`bossDmg`)、`_applyRewardDamageMods`(`comboDmgPerStack`+`firstMakeDmg`)、`endShot`(`missShield`/`missShieldStage`/`missImmune`)、`enterStage`(`stageStartShield`+每關旗標重置)、`onStageClear`(清關 XP/金幣)、`openLevelUp`(**改抽 `COMMON_UPGRADES` modal kind='upgrade'**、移除球途盤)、`drawModal`(加 upgrade 分支)、`_rollRewards`/`_pickReward`/`drawReward`(改用 `UPMAP`/共用池+重抽+走 `_continueAfterReward`)、`finishRun`(永久籃魂幣入帳 每幕+50/五幕+300/失敗 reached*10+score bonus、`sessionStats` 累計、擴充 `_endStats`)、`_getAimPreviewPct`(`minPreviewBonus` 最低值)、render switch(+shop/talents)、`drawHUD`(局內金幣 pill)、`drawTalentPanel`(「解鎖 ›」入口→`go('talents')`)。`pendingLevels` 全域改名 `levelUpsPending`(企劃)。**升級 3 選一＝七英雄共用 BD 池、去職業**(舊 `ABILITIES` 球途盤保留但 `openLevelUp` 不再走、成無害死碼;`run.abilities` 永遠 {} 故戰鬥碼讀 `a.xxx` 皆 0)。**headless 48/48 全過**(等級7/金幣6/天賦7/共用池4/技能打怪8/流程8/回歸8)+**全畫面 smoke**(home/hub/heroes/atlas/route/relics/codex/battle/upgrade-modal/shop/talents/reward/lose/win 全 render 無 pageerror)。**未動(企劃硬性禁止)**：投籃物理/battleUp 力道/stepBall/collideHoop/hoop·rim hitbox/五種進球判定 if 鏈/擦板蠻王被動/怪物干擾核心/hideLanding·slowCharge·drum·maxPull·shortTraj·gravity/上一球殘影/籃框位置行為牌/投失不換位·進球換位/五幕閉環/5-1b run.mods 基本結構/5-2 軌跡難度曲線/手機橫向。
  - **placeholder / 留給 Codex**：天賦大節點異變效果偏保守(多為 mods 加成+少數 mut 旗標)、`drawTalents` 為功能版 UI(無美術)、商店為功能版、`sessionStats` 為簡版跨幕統計、球語(BALL_WORDS)因 `run.abilities` 恆空目前不會成立(企劃未保護、留待天賦/英雄被動重新設計)、舊 `ABILITIES`/`REWARDS`/`chooseForm`/`chooseAbility` 成死碼可由 Codex 清理。**待哈利 iPhone 15 橫向實機驗收。**

## 11. 近期 commit(新→舊)
`bf103bb` **Phase 6 完整架構迴路** → `5a8aa0f` Phase 5-2 五幕閉環+軌跡難度 → `484b156` Phase 5-1b 獎勵與成長系統 → `bdd5a60` Phase 5-1a 籃框遠近平衡 → `700bd03` Phase 5 第一幕閉環 → `4ac6fec` HANDOFF(4-6驗收/Phase4穩定) → `186faa3` Phase 4-6 籃框位置行為牌+預告 → `a64f5db` HANDOFF(4-5b驗收) → `5b45664` Phase 4-5b 投籃輔助+殘影+頭頂放大 → `40f9a1d` Phase 4-5a 頭頂預告可讀性 → `e90147c` Phase 4-5 干擾補接+預告 → `7889f3d` Phase 4-4 擦板蠻王最小被動 → `cfce57b` Phase 4-3 loadout帶入戰鬥 → `8623688` 瞄準觸控小修 → `90041cf` Phase 4-2 五種進球判定 → `1937f89` Phase 4-1 戰鬥HUD重排。

## 12. 下一步建議
**Phase 6 完整架構迴路已實作完成**(`bf103bb`，headless 48/48 + 全畫面 smoke 無例外)，**待哈利 iPhone 15 橫向實機大量測試** → 再交給 Codex 工程整理與細修。完整迴路：英雄選→loadout→遠征→戰鬥→進球技能掃怪→擊殺給 XP/金幣→清關→reward 三選一(共用 BD)→升級 levelup 三選一(共用 BD)→第2/4 普通關後 shop 花金幣→Boss→幕通關→下一幕→Act5→遠征總結→永久籃魂幣→回英雄頁花幣點天賦。
**前一穩定版**：Phase 5-2(`5a8aa0f`)已過實機。
**現行不動清單(沿用)**：投籃物理核心、battleUp 力道、五種進球判定、hoop/rim hitbox、擦板蠻王、怪物干擾、4-5b 投籃輔助與殘影、籃框位置行為牌、五幕閉環、5-1b run.mods 結構、5-2 軌跡曲線、手機橫向。
