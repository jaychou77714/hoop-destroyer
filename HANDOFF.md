# 籃框破壞神 HOOPBREAKER — 線上交接文件

> 給下一個視窗的 Claude：讀完這份 + 你的 memory 就能接手。哈利是創意總監/體驗師(非工程師)，你是唯一工程師、直接接管 GitHub。全程繁體中文(台北用語)。SOP：你先做 → 哈利實機(iPhone 15)驗證 → 截圖回報。

## 0. 基本資料
- **Repo**：`jaychou77714/hoop-destroyer`(public)
- **線上**：https://hoop-destroyer.vercel.app (Vercel 自動部署，push 後約 30–60s)
- **風格**：NANACA-CRASH 風籃球物理彈射，單檔靜態 web app
- **基準機**：iPhone 15 橫向(CSS 約 852×393、dpr 3、比例約 2.168:1)
- **互動偏好**：給哈利選項時用可點選 UI(ask_user_input)，不要純文字 A/B/C

## 1. 安全性 / Git 規則
- GitHub PAT 由哈利當場提供，**只用環境變數 `GH_TOKEN`，絕不寫進檔案、不留存**。
- committer email 必須是 `storyhomedesign@gmail.com`(Vercel Hobby 要求)。
- 交付一律給**完整 index.html**(哈利刪舊上新)；非工程師不給 patch。

## 2. 架構(bundler 單檔) — 工作目錄 `/home/claude/hoop`
`index.html` = 啟動載入器 + 兩個 bundler script：
- `<script type="__bundler/manifest">` JSON：兩個 gzip+base64 chunk。
  - uuid `af2147d2-3ac8-434b-bfe8-7a89eab8c035` = DC/React 框架(~55KB)
  - **uuid `875365e8-8f11-4b79-9780-292f266babda` = 遊戲引擎**(export `start`→`window.HBStart`，設 `window.__HB`=Game 實例)
- `<script type="__bundler/template">` JSON：`pages`(遊戲頁 HTML，含自己的 head＋viewport)＋`entry`。**bundler 用模板的 head 渲染**，viewport/CSS 改這裡才生效。
- head 預載本地 `react.production.min.js`+`react-dom.production.min.js`(同源，**勿刪**)。DC 框架仍會 fallback 去 unpkg，弱網失敗丟跨來源 `Script error.`(非致命，已在 index.html 第~88 行改成只 console.warn、不彈框)。

## 3. 改引擎流程(每次必照做)
1. 從 index.html manifest 解出引擎 chunk → `chunk_engine.js`(取 uuid 875365e8 的 data：base64→gunzip)。
2. 用 `str_replace` 改 `chunk_engine.js`。
3. **repack**：讀 index.html → 把 `chunk_engine.js` gzip(mtime=0)+base64 → 字串替換 manifest 裡舊引擎 base64 → 斷言 manifest+template 仍可 json.loads 且 round-trip 一致 → 寫回。**repack 只換引擎 chunk，保留你對 index.html 的 viewport/CSS/template 直接修改。**
4. `node --check chunk_engine.js`。
5. push：GitHub contents API PUT(先抓現 SHA、帶 committer email)。

repack 樣板(Python)：
```python
import re, json, gzip, base64
html=open('index.html',encoding='utf-8').read()
uuid='875365e8-8f11-4b79-9780-292f266babda'
old=json.loads(re.search(r'__bundler/manifest">\s*(\{.*?\})\s*</script>',html,re.S).group(1))[uuid]['data']
new_src=open('chunk_engine.js',encoding='utf-8').read()
new=base64.b64encode(gzip.compress(new_src.encode(),mtime=0)).decode()
assert old in html; h2=html.replace(old,new)
for isl in ['manifest','template']: json.loads(re.search(r'__bundler/'+isl+r'">\s*(\{.*?\})\s*</script>',h2,re.S).group(1))
assert gzip.decompress(base64.b64decode(json.loads(re.search(r'__bundler/manifest">\s*(\{.*?\})\s*</script>',h2,re.S).group(1))[uuid]['data'])).decode()==new_src
open('index.html','w',encoding='utf-8').write(h2)
```

## 4. 真實瀏覽器驗證(headless)
- 容器有 `/opt/google/chrome/chrome` + puppeteer-core。
- `export NODE_PATH=/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules`
- 流程：node 內 `spawn('python3',['-m','http.server',PORT],{stdio:'ignore'})` → `goto networkidle2` → `waitForFunction(()=>!!window.__HB)` → `window.__HB.go('screen')` → `render()` → screenshot。
- **環境很脆**：指令若 background(`&`/nohup)或剛 `pkill` 後，bash 會回 -1。用「node 內 spawn、每次換新 port、總時長短」最穩。檔案有時會消失就重建。`file://` 載不了引擎。
- 模擬安全島：render 前 `G._safeProbe=null; G.insL=82;G.insR=44;G.insT=4;G.insB=92;` 再 render。

## 5. 引擎重點(chunk_engine.js)
- 第 17 行：`let BW=1920; const BH=1080,FIXED=1/120;`(**BW 已改 `let`、動態**)
- `resize()`：橫向時 `BW=Math.max(1920,Math.min(3200,Math.round(BH*cw/ch)))`，結果 `sc=ch/BH`、`ox=oy=0` → **真滿版、零 letterbox**。BW 變動會 `_mkStars()` 重生星空。
- **安全區**：建構子建隱藏 `_safeProbe` div(padding 設 `env(safe-area-inset-*)`)；resize 讀 `getComputedStyle` 換算成設計單位存 `this.insL/insR/insT/insB`。**目前只有英雄頁套用內縮，其他畫面待補**。
- `render()`：底色 `#150f22`(深紫，非黑)。`backdrop()` 過掃描 +200 鋪滿。
- `drawHero(id,cx,by,sc)`：開場 `_preloadHeroes()` 預載 7 張圖；載到圖畫圖、載入中只畫陰影(不閃舊向量)、僅 `_heroImgErr[id]` 為真才用向量 `_h*`。圖路徑 `/hero_<id>.png`。
- 英雄 id：`shade 影投客 / bone 骨場教練 / archer 荒弓前鋒 / axer 狂斧中鋒 / whistle 聖哨後衛 / elem 元素投手 / beast 野獸控球`。
- helper：`panel/text/wrap/rr/button/shadow/btn/toast/backdrop`。很多 draw* 後有 `Object.assign(Game.prototype,{...})` **覆寫**才是生效版。

## 6. 美術資產(repo 根)
- `hero_<id>.png` ×7、`hub_group.png`、`icon-180/192/512.png`、`manifest.json`、本地 react 兩檔。
- `manifest.json`：`display:"fullscreen"`、`orientation:"landscape"`、`background_color/theme_color:"#150f22"`。**改 manifest 後 iOS 要「重新加到主畫面」才生效。**

## 7. 「選擇英雄」頁(drawHeroes)現況 — 已定稿版面
- **頂列同高**：左=「選用這名英雄/已選用 ✓」(primary)、中=標題「選擇英雄」+`x/7`、右=「← 返回」。
- **上下拉滿**：`colTop=topY+92`、`colBot=1080-max(insB,14)-10`，左右兩欄填滿。左欄=角色卡(大立繪+‹›箭頭+名/en/role+分隔線+Lv/空心/打板/Miss)→ 基礎技能(圖示框+能力字)→ 聖物 0/5(5格+背包)。右欄=天賦面板。
- **天賦樹(視覺佔位)**：三線(攻擊/控制/增益)各 8 圈、左右鋪滿、金色虛線跨線串接。
- **字級已為手機放大**：分支標籤 26、標題 30、圈圈 r27、基礎技能/聖物標籤 26、能力字 25、數據 23。

> ⚠️ **手機字級鐵則**：sc≈0.36，設計單位的字要夠大(body 建議 ≥22~26)，否則手機看不清。所有 UI 調整先想手機顯示。

## 8. 待辦 / 下一步
**哈利尚未點選**要先做哪塊真功能(用 ask_user_input 給 4 選項)：
1. **天賦樹機制**：每升 10 等給 1 點、三線串接解鎖規則、每節點實際效果。
2. **數據埋點**：戰鬥即時統計 空心/打板/Miss → 存檔 → 餵進英雄頁。
3. **聖物系統**：5 裝備 + 10 背包獨立視窗、實際加成。
4. **基礎技能主動化**：每隻被動技在戰鬥真正生效。

**其他待處理**：
- 安全區內縮目前只有英雄頁；其他畫面(hub 首頁鍵+右側面板、戰鬥 HUD、route/atlas 返回鍵)要把同一套 `insL/insR/insT/insB` 鋪過去。
- 「切換看到舊人物」已用預載+不閃向量處理，待實機確認(疑似舊圖快取)。
- 滿版/安全區以實機為準，headless 測得 `ox≈0`。
- hub 仍有舊文案(「最後板凳席/當前投手」等)，視需要再統一。

## 9. 本期(此會話)已完成並上線
- 動態畫布寬度 → 真滿版。
- iOS `safe-area-inset` 探針 + 英雄頁內縮。
- 英雄頁方案 B → 頂列(選用左上同標題高、返回右上)、上下拉滿。
- 預載英雄圖 + 載入中不閃舊向量。
- 手機字級全面放大。
- 關閉非致命跨來源錯誤彈框；manifest/底色改深紫消安全區黑邊。
- 最近 commit(新→舊)：`0469cd8a` 預載+字級 / `7ea6e7b2` 頂列+拉滿 / `7191ca60` 安全區 / `0067c9b2` 動態BW / `487354cf` 深紫 / `49d26fa9` 關錯誤框 / `0e0d749e` manifest。
