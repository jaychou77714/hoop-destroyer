# HANDOFF.md — 交接給 Codex（HOOPBREAKER 籃框破壞神）

> 本文件公開，**嚴禁寫入任何 token / 金鑰 / 密碼**。PAT 一律以 `<PAT>` 佔位符表示。
> 最後更新：速投（沙包生存）session 之後，HEAD `b9e8290`。
> 給 Codex：讀完這份就能接手。哈利是創意總監／體驗師（非工程師），你是唯一工程師、直接接管 GitHub push，全程繁體中文（台北用語），決策用互動式選項。

---

## ⚠️ 先讀：架構與交接範本不一致（很重要）

`交接給Codex.docx` 範本描述的是一個 **Vite + React + TypeScript + Zod schema + Zustand store + IndexedDB 自動存檔 + Service Worker PWA**、目錄為 `src/app`、`src/features/atlas|menu|town`、`src/game`、`src/data`、`src/store`、且「第一階段不得實作卡牌戰鬥／節點只顯示 Encounter Placeholder」的專案。

**本 repo（`jaychou77714/hoop-destroyer`）不是那個專案。** 本 repo 是：

- **單檔 vanilla canvas 遊戲**：整個遊戲打包在 `index.html` 內的 gzip+base64 chunk。
- **沒有** `src/` 模組化目錄、**沒有** React 元件樹（React 僅作極薄外殼）、**沒有** Zod、**沒有** Zustand、**沒有** IndexedDB、**沒有** Service Worker、**沒有** `npm build/test/lint/e2e`。
- 戰鬥**早已完整實作**（籃框主機投籃戰鬥），不是 placeholder；也沒有「卡牌戰鬥」概念。

下面我**依範本的章節結構**回答，但內容一律是本專案的**實況**；範本假設的東西若不存在，我會明確寫「不適用／無」。
**如果你（哈利）的 docx 其實是要給另一個 Vite/React 重構版專案用的，那個專案不在這個 session／這個 repo 裡 —— 把它的 repo 指給我，我再針對真實程式碼重寫一份。**

---

## 目前專案狀態

- **做到哪裡**：可上線、可玩的暗黑戲謔籃球 roguelite。線上：`https://hoop-destroyer.vercel.app`。主要測試機 iPhone 15 橫向。
- **已完成的主要功能**：
  - 首頁 / 英雄選擇頁（7 名英雄、3 天賦線、21 節點天賦樹）。
  - 五聖物 loadout（5 格裝備 + 全螢幕聖物背包 Modal，依稀有度分區、L3 光徽圖示）。
  - 遠征路線頁（`fast` 速投線 / `std` 標準 / `corrupt` 腐化；每幕座標覆寫 `RT_ACT[1–5]` + 後台 `tuner.html` 逐幕微調器）。
  - 籃獄圖譜頁（分層素材組裝）。
  - 籃框主機投籃戰鬥：自由浮動籃框、右上 HP 面板、每階怪群 `group.webp`、五幕背景到齊、球形態攻擊系統（normal/fire/ice/lightning/axe/arrow）、戰鬥中詳細資訊 Modal（六區晶片 + Hold-to-Preview）。
  - roguelite 成長（12+ 獎勵、`run.mods` 乘算傷害、通用升級池）。
  - 5 幕封閉迴路 + 無盡模式解鎖。
  - **模式進度獨立化**（`modeProg={fast,std,corrupt}`，各自 acts/marks/bossClears/heat/nodeProg）。
  - **速投（沙包生存）模式**（本 session 主要工作，見「最近重要變更」）。
- **尚未完成 / 待補**：
  - 第 2–5 幕的速投沙包美術只到 act1–act5 各一張；一般戰鬥第 2–5 幕怪群圖已到齊。
  - 後台 tuner 僅遠征頁已接，其餘分頁（首頁/板凳席/英雄選/地圖/玩法圖鑑/設定/結算）仍是 placeholder。
  - 新核心球（每幕第 2 顆，共 5 顆）的數值平衡尚未經哈利實機定案。
- **可否啟動 / build / test / lint**：見下方「測試狀態」。本專案**無建置步驟**（純靜態，瀏覽器直接開 `index.html` 即跑）；驗證靠 `node --check engine.js` + puppeteer headless。

---

## 最近重要變更

> 本 session 全部圍繞**速投（速投線 / 沙包生存）模式**。所有變更只動 `engine.js`，重打包進 `index.html` 後 push（見「開發流程」）。下列 commit 由新到舊：

| commit | 內容 |
|---|---|
| `4e28121` | 速投五項調整：①沒投進直接扣血（1/5 maxHP，不用等超時）②10 秒沒出手也扣血 ③出手倒數**只在球在手上時**遞減（球飛行/落地/回手前凍結，拿到球重置 10 秒）④玩家攻擊改打**沙包**（不是籃框）⑤瞄準線縮短級距 0.015→0.025（約 20 球縮到一半）。HUD「違例 N/5」改為依血量顯示「機會 X」。 |
| `74e3fa6` | 沙包貼齊畫面最右緣（站後方）；籃框每進一球隨機移動（新 `_speedHoopPos`，在左/中半場隨機定位、避開貼右沙包）。 |
| `fa8f9a0` | 路線頁新增**速投專屬節點**（獨立、不連線）：速投線時亮、標準/腐化時轉灰；點灰色速投節點會切到速投線。 |
| `e2e1a23` | 修速投進場 bug（路線頁 `_selNode` 恆有值致 `nodeMode` 永真，把速投擋成一般戰鬥）→ 改成 `fast` 一律進速投、`run.nodeMode=false`。 |
| `1aa4f41` | 換 App icon（惡魔破裂籃球）icon-180/192/512。 |
| `e27e10e` | 模式進度獨立化 `modeProg` + 安全遷移 + 路線頁擋未解鎖；標準/腐化掉落品質定位（腐化→稀有、標準→≤精良）；每幕第 2 顆核心球共 5 顆；速投 15 球解鎖下一幕；標準/腐化通 5 幕解鎖無盡。 |
| `a704f17` | 速投初版：瞄準線隨進球縮短取代縮秒、結算依進球數 roll 核心聖物等。 |

**改到的程式區（engine.js，行號會漂移，用符號搜尋）**：
- `enterSpeedStage()` — 速投開場：建 host、`makeHoop`、**生成被動無敵「沙包替身」guard**（`sandbag:true,_static:true`，讓既有形態攻擊打在沙包上）、`_speedHoopPos(true)`、`spawnBall()`。
- `_speedHoopPos(force)` — 速投專屬籃框隨機定位（左/中半場、避開貼右沙包；`force` 立即定位、否則 `repos=0.7` 動畫）。
- `updateBattle()` 速投時鐘段 — 只在 `run.ball.held && !run.ball.live` 時 `shotClock-=dt`；歸零→扣血。
- `spawnBall()` — 速投時把 `shotClock` 重置為 `shotClockMax`（球回到手上才重新計時）。
- `endShot()` — 速投：未進球 `playerHurt(maxhp/5)`；進球呼叫 `_speedHoopPos(false)` 換框。
- `updateGuards()` — **注意：專案內有兩個 `updateGuards` 定義，實際生效的是後面那個（約 line 3052，用 `host.x + g.bx + wobX` 相對偏移 + `g.slot`）**。已在該版加 `if(g._static){ g.x=g.bx; g.y=g.by; continue; }` 把沙包替身 pin 在絕對座標（否則替身缺 `slot` 會算出 NaN、攻擊抓不到目標）。
- `hurtGuard()` — `if(g.sandbag) g.hp=g.maxhp`（沙包永不死）。`killGuard()` — `if(g.dead||g.sandbag)return`。
- `drawSandbag()` — 沙包貼右緣繪製 + 每幀把替身 guard 同步到沙包實際中心（`sg.x=sg.bx=cx` 等）。
- `drawSpeedHUD()` — 進球數 + 出手倒數條 + 「機會 X」。
- `_getAimPreviewPct()` — 速投分支 `clamp(1 - speedScore*0.025, 0.5, 1)`。
- 路線頁 `_drawRouteArt()` 節點區 — 速投節點 `rnodespeed` + `isFast` 灰化標準節點/連線。

**尚未 commit 的變更**：對「已部署產物」而言**沒有**。`index.html`（唯一上線來源）已完整 push 到 `main`。本機 `git status` 顯示的 `??` 全是**未追蹤的開發暫存檔**（`engine.js` 解包工作檔、各種 `*.mjs` puppeteer 測試腳本、`node_modules/`、`package*.json`），這些**刻意不提交**。

**branch / commit / PR 狀態**：
- branch：`main`
- HEAD：`b9e8290`（`chore: 觸發 Vercel 重新部署` 空 commit；其前 `4e28121` 為速投五項調整）
- PR：**無**。哈利的流程是**直接 push 到 `main`**，不開 PR。

---

## 架構與資料流

> 範本的 `src/app`、`src/features/atlas|menu|town`、`src/game`、`src/data`、`src/store` 目錄在本專案**不存在**。本專案的對應如下：

- **單檔 bundler**：`index.html` 內有 `<script type="__bundler/manifest">`（各 chunk 的 gzip+base64）與 `<script type="__bundler/template">`（遊戲頁 HTML、含 viewport，改 viewport/CSS 改這裡）。
  - 引擎 chunk uuid `875365e8-8f11-4b79-9780-292f266babda` = **`engine.js`（約 3,640 行，所有遊戲程式碼與資料都在這）**。
  - 另一個 chunk = React/DC 薄框架（極少動）。
- **啟動**：引擎掛出 `window.HBStart` → 頁面 component 拿到 `HBStart` 與 canvas 後呼叫 `HBStart(canvas, root)`，回傳的 `Game` 實例即核心。
- **常數**：`BH=1080` 固定；**`BW` 動態**（依裝置長寬比，iPhone landscape ≈ 2341；`onResize` 內 `BW=clamp(BH*cw/ch, 1920, 3200)`）。畫布在手機被縮小 → modal 字級要開大（22–40）。
- **遊戲狀態儲存**：純 **`localStorage`**（**不是 IndexedDB**）。
  - `persist(s){ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }`，存的是整個 `this.save` 物件。
  - 載入 `loadSave()` 會從舊 key 遷移並備份（`OLD_KEY+'_backup'`），並建 `modeProg`。
  - **自動存檔觸發點**＝在關鍵事件後呼叫 `persist(this.save)`：教學完成、過關/結算（`finishRun`）、解鎖、開發者模式切換、設定變更等。沒有背景定時存檔；是「事件驅動立即寫入」。
- **哪些資料是「資料驅動」**：在 `engine.js` 內以**大物件常數**定義（非外部 JSON、非 Zod）：`RELICS`、`BALL_FORMS`、`ACTS`/`STAGES`、`GUARDS`、`HEROES`/`TALENT_TREES`/`HERO_LANES`、`POS_POOL`、`SANDBAGS`、`ROUTE_STONES`、`RT_DEF`/`RT_ACT` 等。美術為外部檔（`assets/**`）。
- **核心邏輯函式**：`update/updateBattle`、`stepBall`（物理 + 進球判定 line ~947）、`makeBasket`（進球 → 形態攻擊 + 聖物觸發）、`endShot`、`finishRun`、`pickHoopPos`/`_speedHoopPos`、`hurtGuard`/`killGuard`/`updateGuards`、`startRun`、`loadSave`/`persist`。

---

## 圖譜與節點系統

- **節點資料**：
  - 遠征路線頁：`_drawRouteArt()` 內 `ns=[lv('node0'..'node4')]` 五個硬座標節點（1704 art-space），可被 `RT_ACT[幕]` 逐幕覆寫；逐關進度 `_nodeProg(act)`（讀 `modeProg[route].nodeProg`）。**速投專屬節點**為獨立節點 `rnodespeed`（不在 5 連節點路徑上）。
  - 籃獄圖譜頁：`drawAtlas()` 的 `CARDS`（5 幕卡）+ `_atlasNodes(cx,y,lit)`（每卡 4 點，純展示）。
- **道路/連線資料**：路線頁的虛線是 `_drawRouteArt()` 內**程式畫的**（`ctx.moveTo(ns[0])→lineTo(ns[i])` 連 5 節點 + 路線卡到 node0 的引導線）。**沒有獨立的 graph/road 資料結構**；速投節點刻意不連線。
- **可抵達判定**：**不是圖論可達性**，是**線性逐關 + 逐模式解鎖**：
  - 進入某幕：`_modeActs(route) < _selAct` → 擋下並 toast。
  - 節點可玩：`_playable = (i <= _nodeProg)`（要先清前一關）。速投線時標準節點一律灰化（`isFast`）。
- **點擊節點流程**：節點 btn `rnode{i}`/`rnodespeed` → 設 `_selNode`（或切 `_selRoute='fast'`）→ 主按鈕 `go` → `startRun(_selAct, _selRoute, _selStone, _selNode)`。速投線忽略 `_selNode`、強制走 `enterSpeedStage`。
- **移動目前位置與自動存檔**：過關/結算在 `finishRun` 內更新 `modeProg[route]`（acts/marks/bossClears/nodeProg）後 `persist`；速投 15 球在結算解鎖 `fast` 下一幕。
- **底部資訊抽屜**：路線頁底部有「出戰摘要」橫列（英雄·路線·石板）；戰鬥中另有「詳細資訊 Modal」（六區晶片 + Hold-to-Preview 大卡）。沒有獨立的可拉抽屜元件。

---

## 手機橫向與響應式狀態

- **基準機**：iPhone 15 橫向，CSS 約 **852×393**、dpr 3；同時顧 **844×390**。`BW` 依長寬比動態算，理論上適應其他比例。
- **範本列的斷點**（`915×412`、`844×390`、`1280×720`、`1440×900`）：只有 **844×390** 有特別顧過；其餘**未逐一審視**（headless 驗證固定用 852×393 dpr3）。建議 Codex 若要支援平板/桌面比例，逐一截圖檢查 modal 字級與安全區。
- **直向旋轉提示**：**已完成**。`this.portrait = ch > cw*1.04`；直向時 `render()` 直接 `drawRotate()` 並 return，且 `onDown` 等輸入在直向時全部 `return`（停用觸控）。
- **觸控拖曳 / 點擊**：投籃為拖曳放開（`battleDown/Move/Up`）。**雙指縮放**：遊戲本身是固定畫布、無自訂 pinch-zoom（地圖/圖譜為固定 1704 畫布，非可縮放地圖）。
- **已知版面注意**：iOS landscape 位址列收合會造成 viewport 漂移 → 程式內已對點擊座標做過校正（見 `onResize`/`ck` 區的註解）。

---

## PWA 狀態

- **manifest**：`manifest.json` 存在（含 icon-180/192/512）→ 可「加到主畫面」。
- **Service Worker**：**無**。本專案**沒有 SW、沒有離線快取**。`vercel.json` 對 `/` 與 `/index.html` 設 `Cache-Control: no-cache, must-revalidate`。
- **build 後可否安裝/離線**：可安裝（有 manifest），但**無離線能力**（無 SW）。實機看不到新版多半是 iOS PWA 把舊版留在記憶體 → 從主畫面**刪除圖示重加**或 Safari 開 `?v=N` 跳快取。
- **PWA 相關設定檔**：`manifest.json`、`index.html`（template chunk 內的 `<head>`/viewport/icon link）、`vercel.json`。

---

## 測試狀態

本專案**沒有** `npm run build/test/lint/e2e`（`package.json` 的 `scripts` 是空的，唯一 dep 是 `puppeteer-core`，純供 headless 驗證）。對應結果：

- `npm run build`：**未設置 / 不適用**（純靜態，無建置步驟；瀏覽器直接開即跑）。
- `npm test`：**未設置 / 不適用**。
- `npm run lint`：**未設置 / 不適用**。
- `npm run e2e`：**未設置 / 不適用**。

**本專案實際採用的驗證（本 session 已執行、全綠）**：
- `node --check engine.js`：語法通過 ✅
- puppeteer headless（852×393 dpr2/3，攔 `window.HBStart` 取 `window.__game`）逐項驗速投五項：
  - 沒進球扣血 100→80 ✅／超時扣血 100→80 ✅
  - 時鐘：持球遞減 ✅／飛行暫停 ✅／回手重置 ✅
  - 瞄準線 score=20→0.5 ✅
  - 攻擊打沙包：`_nearestGuard` 命中替身、`_mobHitFlash>0`、沙包不死 ✅（截圖確認火球從籃框射向沙包）
- **尚未執行 / 待真人驗收**：哈利實機（iPhone 15）對速投手感與新核心球平衡的驗收尚未回報。

---

## 已知問題

- **兩個 `updateGuards` 定義**：line ~1224 那個是**死碼**（被後面 line ~3052 的 Object.assign 覆蓋）。改怪物移動/pin 行為**要改 3052 那個**；改錯會無效。本 session 踩過這雷（沙包替身 NaN）。
- **速投沙包與一般戰鬥共用 guard 系統**：沙包是「被動無敵替身 guard」。若日後改 `updateGuards`/`_enemyStrike`/`hurtGuard`，務必保留 `_static`/`sandbag` 分支，否則替身會亂動或被打死。
- **第 2–5 幕速投沙包美術**：目前各幕一張，缺多階變化。
- **Vercel webhook 偶爾漏觸發**：push 後新部署沒冒出來 → 補一筆空 commit 重觸發。**沙箱連不到 `api.vercel.com`**，只能用 GitHub API 驗 HEAD。
- **新核心球（5 顆）數值未定案**：實作是合理初版，平衡待哈利實機。
- **行號會漂移**：交接內所有行號僅供參考，請用符號（函式名）搜尋。

---

## 下一步建議（依優先順序）

1. **哈利實機驗收速投手感**，依回饋微調：扣血量（目前 maxHP/5＝5 次機會）、出手倒數秒數（10s）、瞄準線級距（0.025）、籃框漫遊範圍（左→約 0.58 BW）、沙包位置。
2. 補**第 2–5 幕速投沙包美術**（多階/受擊變化），以及一般戰鬥缺漏素材。
3. **新 5 顆核心球做平衡 pass**（餘燼聖球/鐵索鉤球/冷焰連電球/雷骨碎裂球/絕對零度球）。
4. **接地圖頁進後台 tuner**（哈利先前已要求；仿遠征頁做 `at.*` 逐元件 lv/HH + tuner「地圖」分頁）。
5. 其餘 tuner 分頁（首頁/板凳席/玩法圖鑑/結算）視需要接。
6. 速投結算頁打磨（目前沿用一般結算；可做專屬「投進 N 球」展示）。
7. 評估是否要把 `engine.js` 內的大資料表（RELICS/STAGES 等）抽成可維護結構（**但本專案是單檔，無建置流程；任何重構都要維持「解包→改→重打包→push」可行**）。

---

## 重要限制（給 Codex）

**本單檔專案的實際限制（一定要遵守）：**
- **改引擎流程**：`index.html` 解出 `engine.js` → `str_replace` 編輯 → `node --check engine.js` → Python repack（gzip `mtime=0` + base64 + round-trip 斷言 + 更新 manifest `size`）→ `git add index.html`（**絕不 commit `engine.js`/`*.mjs`/`node_modules`**）→ commit → push → 補空 commit 重觸發 Vercel。
- **committer email 必須是 `storyhomedesign@gmail.com`**（否則 Vercel Hobby 擋部署）。
- **PAT 絕不寫進 repo / 檔案 / 紀錄**（公開 repo，GitHub secret scanning 會立即撤銷）；推送指令只用 `<PAT>` 佔位符。哈利已刻意授權 90 天細粒度 token，**不要提醒他 revoke**。
- **版本升級不要弄丟舊存檔**：`save` 結構變動要在 `loadSave` 做 migrate（已有 `modeProg` 遷移先例）。
- **`save` 必須保持 JSON 可序列化**（走 `localStorage` `JSON.stringify`）。
- **手機橫向是第一優先體驗**；改任何 UI 先想 852×393 dpr3。
- 預設交付＝**直接改引擎 + 重打包 + push**（非丟檔案給哈利）；要完整檔時哈利會刪舊上新。
- 不要輸出進度報告式 markdown（本交接文件為**刻意例外**）。

**範本（`交接給Codex.docx`）原列、針對 Vite/React 重構版的限制——若哈利之後要啟動重構才適用：**
- 第一階段不得實作卡牌戰鬥；節點戰鬥只顯示 Encounter Placeholder。
- 遊戲規則不要寫死在 React 元件。
- 新資料先擴充 Zod schema → 再加 JSON → 再補測試。
- Zustand store 必須保持 JSON 可序列化。

> ☝️ 以上四點在**目前的單檔 vanilla 專案不適用**（無卡牌戰鬥概念、戰鬥已完整、無 React 規則層、無 Zod/Zustand）。列出來是保留哈利的設計意圖，供未來若做 Vite/React 重構時參考。

---

## 回報（哈利要的四點）

1. **目前 branch**：`main`
2. **最新 commit hash**：`b9e8290`（其前 `4e28121` 為速投五項調整）
3. **是否有未 commit 的變更**：對上線產物（`index.html`）**沒有**，已全部 push。本機只有未追蹤的開發暫存檔（engine.js 工作檔、`*.mjs` 測試、node_modules），刻意不提交。
4. **建議 Codex 從哪裡開始**：先讀本檔 →（若有真人回饋）從「下一步建議 1：速投手感微調」進；要熟悉程式先看 `enterSpeedStage`/`_speedHoopPos`/`updateBattle` 速投段，並記住「**改 line ~3052 的 `updateGuards`、不是 line ~1224 那個**」。

---
<br>

> 以下為**前一份交接文件（保留參考，內容較舊，HEAD 停在 `1bf75d6` 速投 session 之前）**：

# 籃框破壞神 HOOPBREAKER — 線上交接文件

> 給下一個視窗的 Claude：讀完這份 + 你的 memory 就能接手。哈利是創意總監/體驗師(非工程師)，你是唯一工程師、直接接管 GitHub。全程繁體中文(台北用語)。SOP：哈利上傳企劃/指令 docx → 你先「只規劃、不實作」回覆 → 哈利定案說「開始」→ 你實作 → headless 驗證 → push → 截圖回報 → 哈利實機(iPhone 15)驗收。給選項用可點選 UI(ask_user_input)，不要純文字 A/B/C。**最新狀態見正下方「★★★ 最新 SESSION」段（V2 遠征頁逐幕 + 後台 tuner + 地圖頁）；舊階段(Phase 4–6 戰鬥/閉環)見 §10–§12。**

## ★★★ 最新 SESSION（V2 遠征頁逐幕版位 + 後台 tuner 逐幕化 + 地圖頁微調）— 下個視窗先讀這段

**目前 HEAD：`1bf75d6`**（地圖頁選中卡：進攻目標移底部橫幅+選取框收窄）。push 後更新本行。

### 授權與環境（重要）
- **GitHub PAT：哈利已刻意授權一組「90 天細粒度 token」給 Claude 直接接管 push**（本視窗確認仍在效期內、有效）。**token 字串絕不寫進此公開 repo**（會觸發 GitHub 推送保護被自動撤銷）；實際字串由哈利在對話內提供 / 在你的 memory 內。**不要提醒哈利 revoke/刪除 token。**
- 新視窗請先 clone 並把 token 內嵌進 remote（沙箱是全新的、沒有舊 clone）：`git clone https://x-access-token:<PAT>@github.com/jaychou77714/hoop-destroyer.git`，工作目錄用 `/home/claude/hoop`。**每次 commit 前**：`git config user.email storyhomedesign@gmail.com`（否則 Vercel Hobby 擋部署）。
- **Vercel**：push main 自動部署、約 1–2 分鐘。**沙箱連不到 `api.vercel.com`（egress proxy 回 `host_not_allowed`），無法查 Vercel 狀態或重新部署**。只能用 GitHub API 驗 HEAD：`curl -s -H "Authorization: Bearer <PAT>" https://api.github.com/repos/jaychou77714/hoop-destroyer/commits/main`。
- **本 session 踩到的雷**：有一次 push 後 Vercel **webhook 漏接**（GitHub 有該 commit，但 Vercel 完全沒建立部署、清單找不到那筆）。解法＝**再推一筆（可空 commit `git commit --allow-empty -m …`）重新觸發**，新部署就會冒出。若再推仍無新部署→才可能是 Hobby 每日額度，請哈利在 Vercel 後台手動 Redeploy 或等隔日重置。

### 改引擎流程（本 session 用法）
- 引擎解出成 `/home/claude/engine.js`，用 `str_replace` 編輯 → Python repack 回 `hoop/index.html`（gzip mtime=0 + base64 + round-trip 斷言 + 更新 manifest size），engine chunk uuid `875365e8-8f11-4b79-9780-292f266babda`（repack 腳本見 §3）。
- 驗證 harness 放 `/home/claude`：`allacts.js`（截遠征頁 2–5 幕）、`atlasshot.js`（截地圖頁）。viewport 852×393 dpr3、`waitUntil:'domcontentloaded'`（**勿用 networkidle0**）。admin：`G.save.admin=true`。

### A. 遠征頁（`drawRoute`/`_drawRouteArt`）— ✅ 五幕逐幕版位完成
- 座標系 `U=BW/1704, D=v=>v*U`（art-space 1704×786）。底圖逐幕 `assets/stage{N}_route_base_1704x786.webp`（`_ensureRouteBg(act)` 快取載入）；五幕背景**都已換成哈利新版金邊框架**。
- **逐幕座標覆寫系統（本 session 核心）**：`_drawRouteArt` 內有 `RT_DEF`（基準＝第1幕）＋ **`RT_ACT={2:{…},3:{…},4:{…},5:{…}}`**（各幕專屬覆寫）。取值 `lv(key)` = `RT_ACT[this._selAct][key] || RT_DEF[key]`（逐幕優先）；連線起點也讀逐幕 `r{si}hi`。**五幕版位都已由哈利在後台逐幕調好、烘進 RT_ACT**（第1幕用 RT_DEF、第2–5幕各有覆寫）。
- 元件粒度：每個文字/聖物格/節點/遮罩都是獨立 key（back/title/subtitle/portrait/heroName/heroEn/heroRole/relicLabel/bd/changeBtn/routeHeader/stonesHeader/summary/cta/relic0-4/r0-2name/r0-2desc/s0-5name/s0-5desc/node0-3/r0-2hi/s0-5hi）。
- **⚠️ `bd` 有 `tagX:566` 額外欄、`*desc` 有 `w` 寬欄**：後台匯出**不含 tagX**，烘 RT_ACT 時若 bd 與基準相同**就別放進 RT_ACT**（讓它 fallback 到 RT_DEF 保住 tagX）；relicLabel/routeHeader/stonesHeader 同理（與基準相同就省略）。
- **哈利調版位 SOP**：哈利進後台 tuner → 切到某幕 → 拖元件/十字鍵微調 → 匯出 JSON（開頭註明「第N幕」）→ 貼回 → 你把差異烘進 `RT_ACT[該幕]`（engine.js）＋ `RT_ACT_TUNER[該幕]`（tuner.html，讓後台顯示同步）→ repack + push。**只動該幕、其他幕完全不受影響**（這正是哈利要的「獨立」）。

### B. 後台調校台（根目錄 `tuner.html`，靜態）— ✅ 逐幕化
- 線上 `https://hoop-destroyer.vercel.app/tuner.html`。多分頁（遠征頁已接；首頁/板凳席/英雄選/地圖/玩法圖鑑/設定/結算 = 待接 placeholder）。
- 遠征頁頂端有 **幕別切換（第1~5幕）**：切幕即換該幕背景＋標題＋進入鈕文字＋載入該幕版位。**逐幕獨立存讀**（localStorage `hb_tuner_route_a{N}`）。`RT_ACT_TUNER` 鏡射引擎 `RT_ACT`；`routeDef()` 把該幕覆寫疊到 `DEF_route()` 當起點。匯出 key=`rt.*`、註明第幾幕。
- 用法：選分頁 → 點下方元件名/圖上綠點選元件 → 十字鍵微調、A± 字級、額外欄（W/H/dy…）± 鈕 → 匯出整段貼回。

### C. 地圖頁（`drawAtlas`/atlas）— 本 session 微調，尚未接後台
- 只動「選中卡標示」：**移除頂部緞帶**、「▶ 進攻目標」改放**底部橫幅框內置中**（art 座標 `855,681`、22px 金字 `#ffe6b0`；橫幅＝route 鈕框 `685,676,340,70`）、**選取發光框左右收窄**（`C.x+5 / C.w-10`，垂直維持 `-7/+14`）。
- 結構：`CARDS`（5 幕卡，cx=[367,626,884,1130,1381]）＋ `UP={no,zh,en}`/`LO={boss,stat,relic}`/`NODEY` ＋ `_atlasNodes(cx,y,lit)` 畫 4 點。底圖 `atlas_base_clean_no_nodes_1704x786.webp`，座標系同 1704 art-space。
- **地圖頁是 1704 固定空間 → 可接後台 tuner**（**下一步 TODO**：仿遠征頁做 `at.*` 逐元件 lv/HH + DEF_atlas + tuner「地圖」分頁可調）。

### D. 英雄選頁（`drawHeroes`/heroes）— ❌ 不適合放固定後台調
- 用**響應式版面**（`_heroesLayout` 以 `U=1/scale` + 安全區 inset 算座標、隨裝置變），**非固定 1704 畫布** → 不能在這個固定 1704 後台拖曳調準。要調英雄頁版位請用**遊戲內排版模式**（設定→排版模式，真實裝置空間）或直接改值。

### E. 遊戲資料（哈利問過的小怪/菁英/王名單）
- 各幕 5 節點 = 1 host（節點1-4＝菁英、節點5＝王）＋ `count` 隻小怪。**小怪總數固定、種類從 `stage.guards` 隨機平均抽**（非寫死配比）。資料在 `STAGES`（§8）、小怪名在 `GUARDS`（11 種）。路線：標準/腐化走全 5 關、速投線走 `[0,2,4]`、「無門捷徑」石板砍成 `[首,末]`。本 session 已把完整名單＋數量給過哈利；若要改寫死配比要改 `spawnWave`。

### 下一步 TODO（哈利方向）
1. **接地圖頁進後台 tuner**（哈利已要求，最可能的下一步）。
2. 其餘 tuner 分頁（首頁/板凳席/玩法圖鑑/結算）視需要接。
3. 戰鬥場景背景：已給哈利五幕 GPT 提示詞（空場、排除怪物/角色、1704×786 webp），等他出圖放 assets。

### 本 session commit（新→舊）
`1bf75d6` 地圖選中卡(進攻目標移底部橫幅+選取框收窄) → `740e632` 地圖進攻目標移卡底(已被上一筆取代) → `83ef641` 遠征頁第5幕版位 → `946d43e` 第4幕 → `d859edd` 第3幕 → `8c62518` 重觸發部署(空commit) → `46be6a6` 遠征頁逐幕覆寫RT_ACT+第2幕 → `870007e` 後台tuner接2-5幕(幕別切換) → `b53c1a1` 換2-5幕新版背景 → `94935d2` 加2-5幕背景 → `e76a9af` 第1幕美術版面套到全5幕。

---

## 0. 基本資料
- **Repo**：`jaychou77714/hoop-destroyer`(public)
- **線上**：https://hoop-destroyer.vercel.app (Vercel 自動部署，push 後約 30–60s)
- **風格**：NANACA-CRASH 風籃球物理彈射 × 暗黑惡搞 Roguelite，單檔靜態 web app
- **基準機**：iPhone 15 橫向(CSS 約 852×393、dpr 3、比例約 2.168:1)，也要顧 844×390
- **目前 HEAD**：`1bf75d6`（見最上方「★★★ 最新 SESSION」段）。push 後請更新本行與最上方段。

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

### ★ 第1幕遠征頁美術皮 + 管理員模式(本次最新，HEAD 待 push)
- **第1幕「灰哨修院」遠征選擇頁吃素材重繪**(`_drawRouteArt`)：底圖 `assets/stage1_route_base_1704x786.webp`(126KB，由哈利素材包 PNG 轉)畫滿 `(0,0,BW,BH)`，座標系 `U=BW/1704, D=v=>v*U`(同 drawAtlas/首頁/圖鑑慣例)。所有框/右側6石板icon/月亮/修院場景烘在底圖；文字與動態高亮全程式畫回：標題/副標、返回、英雄框(頭像圈 drawHero＋擦板蠻王/Boardbarian/定位＋攜帶聖物5/5彩色聖物格＋BD標籤＋點此回英雄頁更換)、左3路線卡、右6石板卡(2×3)、出戰摘要條、進入主鈕(火光呼吸)。selected=暖金微光+左側亮邊(路線)/右上勾選亮點(石板)；底圖不烙 selected。**版位用實測座標**(JSON 與烘圖有偏移、不可信)：石板 colCx=[1285,1490] rowTop=[308,445,580] cw196 ch122；英雄格 cxs=[553,623,693,763,833] cy184 sz52；兩區標題 y=290。**只第1幕**(`drawRoute` 判 `_selAct===1`&圖就緒→art，否則 `_drawRouteFlat` 舊版)。其他幕之後各別出圖再加。headless 截圖比對 accepted_direction_mockup 已吻合。
- **管理員模式**(`save.admin`)：首頁左上角隱藏熱區→`_toggleAdmin()`→`window.prompt` 密碼 **071428** 開/關，開啟時左上顯示「🛠 管理員 ON」徽章。效果：①`_unlockedActs()` 回 5(全地圖，atlas 解鎖閘改用此函式)②`makeBasket` 進球即 `setTimeout(240ms)` 清空 guards+`onStageClear`(一球秒節點)③**不計成績**：`finishRun`/`_recordShot`/`gainXP` 永久等級存檔/`_recordDeath` 全部 `if(!admin)` 守衛(bestScore/acts/bossClears/marks/heat/memory/sessionStats/英雄等級/死亡/命中率都不寫)。純供哈利逐節點微調美術。
- **驗證**：管理員 9/9(解鎖全幕/不寫bestScore/不解鎖acts/不存等級/不計死亡/不計命中率/關閉恢復/非admin正常寫)、全畫面 smoke 無例外、Phase6.1/6.2 回歸 34/34 仍綠。


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
