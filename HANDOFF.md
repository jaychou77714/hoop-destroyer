# 籃框破壞神 HOOPBREAKER — 線上交接文件

> 給下一個視窗的 Claude：讀完這份 + 你的 memory 就能接手。哈利是創意總監/體驗師(非工程師)，你是唯一工程師、直接接管 GitHub。全程繁體中文(台北用語)。SOP：你先做 → 哈利實機(iPhone 15)驗證 → 截圖回報。給選項用可點選 UI(ask_user_input)，不要純文字 A/B/C。

## 0. 基本資料
- **Repo**：`jaychou77714/hoop-destroyer`(public)
- **線上**：https://hoop-destroyer.vercel.app (Vercel 自動部署，push 後約 30–60s)
- **風格**：NANACA-CRASH 風籃球物理彈射，單檔靜態 web app
- **基準機**：iPhone 15 橫向(CSS 約 852×393、dpr 3、比例約 2.168:1)，也要顧 844×390

## 1. 安全性 / Git 規則
- **GitHub PAT = 哈利刻意委託、效期 90 天的細粒度 token，授權你在期間內直接接管 push。哈利不需每次重貼，也不要再提醒他 revoke/刪除 token。** token 字串絕不寫進任何檔案、不存記憶。
- committer/author email 必須是 `storyhomedesign@gmail.com`(否則 Vercel Hobby 擋部署)。
- 交付一律完整檔(哈利刪舊上新)；非工程師不給 patch。
- push 後立刻讀 `git/ref/heads/main` 驗 HEAD(contents API 讀取有時快取，ref 較準)。

## 2. 架構(bundler 單檔) — 工作目錄 `/home/claude/hoop`
`index.html` = 啟動載入器 + 兩個 bundler script：
- `<script type="__bundler/manifest">` JSON：兩個 gzip+base64 chunk。
  - uuid `af2147d2-3ac8-434b-bfe8-7a89eab8c035` = DC/React 框架(~55KB)
  - **uuid `875365e8-8f11-4b79-9780-292f266babda` = 遊戲引擎**(export `start`→`window.HBStart`，設 `window.__HB`=Game 實例)
- `<script type="__bundler/template">` JSON：遊戲頁 HTML(含自己的 head＋viewport)。改 viewport/CSS 要改這裡。
- head 預載本地 `react.production.min.js`+`react-dom.production.min.js`(同源，**勿刪**)。

### 渲染/座標核心(畫 Canvas 一定要懂)
- 設計空間 = **BW×BH，BH=1080 固定、BW 動態**(iPhone15 約 2342)。`resize()` 設 `scale=min(cw/BW,ch/BH)`、dpr 上限 2；`render()` 做 `setTransform(scale*dpr,…)`，**DPR 與 letterbox 全域處理好，畫的時候只管設計單位**。不要改 resize/render/input。
- **CSS-px×U 換算法(五頁改版都用這個)**：設計稿座標都是 852×393 frame 的 CSS px，乘上 `U = 1/this.scale`(iPhone15 約 2.748)就得到設計單位(852×U=BW、393×U=1080)。設計字級 N 在畫面上 = N×scale CSS px，所以 `N*U` 設計 = N CSS px。安全區 `this.insL/insR/insT/insB` 已是設計單位。
- 命中：`this.btn(x,y,w,h,id,cb)` 註冊矩形，`hitButtons` 由後往前掃。**畫的矩形與命中矩形必須同一份**。最小命中 `Math.max(44*U,h)`。輔助：`this._press(rect)` 即時按壓態、`this._clip(str,maxW,size,weight)` 省略號、`this._coverImg(img,x,y,w,h)` cover 滿版、`rr/panel/text/wrap/drawHero(id,cx,feetY,sc)`。

## 3. 改引擎流程(每次必照做)
1. 從 index.html manifest 解出引擎 chunk → `chunk_engine.js`(uuid 875365e8 的 data：base64→gunzip)。
2. `str_replace` / Python replace 改 `chunk_engine.js`(中文多的段落用 `assert src.count(old)==1`)。
3. `node --check chunk_engine.js`。
4. **repack**：gzip(mtime=0)+base64 → 字串替換 manifest 舊引擎 base64 → 斷言 round-trip 一致 → 寫回 index.html(保留你對 template/viewport 的修改)。
5. **headless 驗證**(見 §4) → 截圖 → 迭代。
6. push(contents API 單檔 PUT 先抓 SHA；多檔用 Git Trees API 原子提交；committer email 同上)。

## 4. Headless 驗證
`/opt/google/chrome/chrome` + puppeteer-core。`export NODE_PATH=/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules`。harness：`python3 -m http.server` 服務 repo，viewport 852×393(也測 844×390) dpr 3，`waitForFunction('!!window.__HB')` 後：
```js
G._safeProbe=null; G.insL=82; G.insR=44; G.insT=4; G.insB=92; G.go(screen); G.render();
```
再 screenshot。要重現「Dynamic Island 在左」用 `insL=162`(約 59 CSS)驗證返回鍵/版面不被島遮。命中測試：`G.go(screen);G.render();const b=G.buttons.find(x=>x.id===ID);G.hitButtons(b.x+b.w/2,b.y+b.h/2);` 看 `G.screen`/`G._toast`。本機資產要放 `/home/claude/hoop/assets/…` 給 http server。

## 5. 五個 Canvas 主頁(都已改版上線，layout/hit 共用、安全區夾擠、DPR、hit≥44)

| 畫面 | 函式 / go() | 重點 |
|---|---|---|
| 選擇英雄 | `drawHeroes` / `heroes` | `_heroesLayout` 共用 rect。左整合英雄卡(立繪+名/英文/角色+數據列 Lv/空心/打板/Miss+基礎技能一行+聖物 0/5 列)。右天賦樹三支線(攻擊橘/控制藍/增益綠，7 節點 Lv10–70，點節點→底部浮層)。手機字級 ≥22–26 設計單位。 |
| 首頁 | `drawHome` / `home`(開機頁) | Version C：flat 場景圖 `assets/background/home_scene_flat_1704x786.webp` 滿版(左場景+角色+烙印 logo/副標)，Canvas 只畫互動層+死亡計數。`_homeMode` flat(出貨)/layered。死亡計數用真 state(`save.deaths/deathsDay/deathsDayKey`，`_recordDeath()` 在落敗時呼叫)。 |
| 最後板凳席 | `drawHub` / `hub`(由首頁「進入板凳席」) | Final Bench：flat `assets/final_bench_menu/final_bench_menu_full_flat_1704x786.webp` 滿版(左 7 角色圍綠球+烙印標題)，右側 Canvas **不透明哥德面板**蓋掉烙印、畫動態當前投手卡(HEROES[save.hero])+碎金(coins)/無盡最佳(endlessBest)+四鍵。`_fbLayout` 共用。返回鍵前疊柔邊暗暈蓋掉 flat 烙印的返回鍵(避免雙返回)。**註：左下「∞ 無盡模式」鍵目前反灰停用(`fb_endless_locked`，點擊只 toast「即將開放」)，原「籃魂聖匣」入口已撤(drawRelics 仍在但 hub 進不去)。** |
| 宿主圖鑑/玩法 | `drawCodex` / `codex`(由 hub「宿主圖鑑」、首頁「玩法」) | 惡搞暗黑地獄手冊：**無 flat 底圖**(規格要求文字可改、不可烤整頁)，看板/鍊條/角骷髏/交叉骨/綠史萊姆/骷髏觀眾/月亮/城堡/破籃框/塗鴉/列 icon **全部 Canvas 自繪**。唯一圖片素材 = 左下放大豆人 `assets/host_guide/bean_demon_minimal_transparent_512.png`(+向量備援)。`_hgLayout` 共用；看板右移留左側給豆人。**8 列文字源 = `_guideRows()`**(`['標題','說明','icon']`)，改文案只動這裡，過長自動一行省略。 |

> 其餘畫面(atlas 籃獄圖譜、戰鬥、drawRelics 聖匣、settings、drawEnd/drawReplace 等)未動。

## 6. 聖物系統現況(重要：尚未串接)
- **英雄頁「聖物 0/5」(`_relicRow`) = 純視覺佔位**：5 格 + 背包鍵，點了只 toast「後續開放」，**不讀寫 save、不綁英雄、不影響戰鬥**。
- **真正運作 = 籃魂聖匣(`drawRelics`)**：save `relics:[null,null,null]`=**3 個「全英雄共用」裝備欄** + `library:[]`(聖物庫上限 30)。15 個聖物分三類 球核/手感/誓約(誓約=標誌聖物給開局起始球形)。開局 `run.relics=s.relics.filter(Boolean)` 帶進戰鬥。
- **方向(哈利已定)**：聖物以**英雄頁 5 格實裝 + 30 背包**為主；hub 聖匣入口已撤。**待拍板**：5 格要做「全英雄共用(把 library/欄位 3→5)」還是「每英雄獨立(新 save 結構)」——兩種 save 遷移不同，動工前要先問。舊 `drawRelics` 程式保留未刪。

## 7. 待辦 / 下一步
- `heroes-tuner.html`：即時參數調整單頁工具(讓哈利調字級/顏色/邊框並匯出 JSON 給你套用)。哈利說「明天」做，**未開工**。
- 聖物串接：卡在「共用 5 / 每英雄」決策(見 §6)。
- 無盡模式：目前反灰佔位，真功能未做。
- codex 8 列說明在實機若放不下 → 可把 `_clip` 省略改自動縮字。
- codex 是否改用壓縮包的 8 格金邊 icon 條(`rule_row_icons_optional_strip_8x96.png`，順序與 8 列 1:1)取代現在自繪向量 —— 待哈利選。

## 8. 資產路徑(repo 根 `/assets/…`，Vercel 靜態服務)
- `assets/background/home_scene_flat_1704x786.webp` 等(首頁 Version C)
- `assets/final_bench_menu/final_bench_menu_full_flat_1704x786.webp`(板凳席)
- `assets/host_guide/bean_demon_minimal_transparent_512.png`(宿主圖鑑豆人)
- PWA：`react/react-dom` 本地檔、icon-180/192/512、manifest.json

## 9. 近期 commit(新→舊)
`64f9fe2c` codex 強化惡搞暗黑 → `f70c064f` codex 地獄手冊改版 → `ab426668` hub 無盡模式反灰 → `fabcae2a` hub 返回鍵暗暈修正 → `28a6d4e9` hub Final Bench → `fa83cba3` home Version C → `4a0b0314`/`ddd5333c` 選擇英雄改版。
