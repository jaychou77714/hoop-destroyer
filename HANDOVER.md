# HOOPBREAKER（籃框破壞神）— 交接文件 HANDOVER

> 給接手者（人或 AI）的上手說明。**本文件公開，嚴禁寫入任何 token / 金鑰 / 密碼。**

---

## 0. 機密處理（先讀這段）

- **GitHub PAT 絕對不寫進本 repo。** 此 repo 為公開；一旦把 PAT push 上來，GitHub secret scanning 會**立即撤銷該 token**，且任何人都看得到。
- Token 由**擁有者每次操作時提供**，用後不留存於版本控制。推送指令中的 token 僅以佔位符表示：

  ```
  <PAT>  ← 由擁有者當場提供的 90 天 fine-grained PAT，勿提交
  ```
- 即使改私有 repo 也不要提交 secret（會永久留在 commit 歷史）。

---

## 1. 專案概覽

- **內容**：暗黑戲謔籃球 roguelite（投籃物理 × 五聖物 BD × 英雄天賦 × 籃框主機戰鬥）。
- **線上**：`https://hoop-destroyer.vercel.app`
- **Repo**：`jaychou77714/hoop-destroyer`（公開，分支 `main`）
- **平台**：手機橫向（iPhone 15 landscape 為主要測試），鎖定橫向。

---

## 2. 架構：單檔 bundler

- 整個遊戲打包在 **`index.html`** 內。其中有一段：

  ```html
  <script type="__bundler/manifest"> … JSON … </script>
  ```

  此 JSON 是各 chunk 的 **gzip + base64** 內容。
- **引擎 chunk UUID**：`875365e8-8f11-4b79-9780-292f266babda`（即 `engine.js`，約 140KB 原始碼）。
- 開機流程：`index.html` 以 `<script type="module">` 載入引擎 chunk，引擎掛出 `window.HBStart`；頁面內的 component 輪詢到 `HBStart` 與 canvas 後呼叫 `HBStart(canvas, root)` 啟動，回傳的 game 物件即遊戲核心。

### 關鍵常數
- `const BH = 1080;`（固定）
- **`BW` 是動態的**（依裝置長寬比，iPhone landscape ≈ 2341）。因此畫布會被縮小顯示在手機上 → **字級要開大一點**（modal 內文字常用 22–40）。
- 提交者 email 需為 `storyhomedesign@gmail.com`（已存在於 commit 歷史，非機密）。

---

## 3. 開發流程（每次改引擎）

1. 從 `index.html` 解出引擎 chunk → 得到 `engine.js`。
2. 編輯 `engine.js`。
3. **務必先 `node --check engine.js`**。
4. 重新打包回 `index.html`（見下方腳本：gzip mtime=0 → base64 → round-trip 驗證 → 更新該 chunk 的 `data` 與 `size`）。
5. commit + push。

### 解包 / 重打包腳本（Python）

```python
import re, json, base64, gzip, io
UUID = '875365e8-8f11-4b79-9780-292f266babda'

def unpack():  # index.html -> engine.js
    html = open('index.html', encoding='utf-8').read()
    m = re.search(r'<script type="__bundler/manifest">(.*?)</script>', html, re.S)
    man = json.loads(m.group(1))
    src = gzip.decompress(base64.b64decode(man[UUID]['data'])).decode('utf-8')
    open('engine.js', 'w', encoding='utf-8').write(src)

def repack():  # engine.js -> index.html
    html = open('index.html', encoding='utf-8').read()
    m = re.search(r'(<script type="__bundler/manifest">)(.*?)(</script>)', html, re.S)
    man = json.loads(m.group(2))
    raw = open('engine.js', encoding='utf-8').read().encode('utf-8')
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb', mtime=0) as gz:  # mtime=0 → 穩定輸出
        gz.write(raw)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    assert gzip.decompress(base64.b64decode(b64)) == raw          # round-trip 驗證
    man[UUID]['data'] = b64
    man[UUID]['size'] = len(raw)
    out = html[:m.start()] + m.group(1) + json.dumps(man, ensure_ascii=False, separators=(',', ':')) + m.group(3) + html[m.end():]
    open('index.html', 'w', encoding='utf-8').write(out)
```

---

## 4. 推送與部署

### Git 推送
```bash
git config user.email storyhomedesign@gmail.com
git config user.name  jaychou77714
git push "https://<PAT>@github.com/jaychou77714/hoop-destroyer.git" main
```
（`<PAT>` 為當場提供的 token；推完請勿把 token 留在任何檔案或紀錄中。）

### 部署（Vercel）
- 連接 GitHub 自動部署。**已知問題：webhook 偶爾漏觸發**，新 commit 不一定立刻部署。
- 解法：推一個**空 commit** 重觸發：
  ```bash
  git commit --allow-empty -m "chore: 觸發 Vercel 重新部署"
  ```
- `vercel.json` 已對 `/` 與 `/index.html` 設 `Cache-Control: no-cache, must-revalidate`。
- **手機看不到新版時**：
  - Safari 開 `hoop-destroyer.vercel.app/?v=N`（換 N 跳過快取）。
  - 若是「加到主畫面」的 PWA：從多工列**完全滑掉 App** 再重開（iOS PWA 會把舊版留在記憶體）。

---

## 5. Headless 驗證（puppeteer）

- 用 `puppeteer-core` + 系統 Chrome（容器內 `/opt/google/chrome/chrome`）。
- viewport `852×393`、`deviceScaleFactor: 3`、`protocolTimeout: 60000`。
- 起一個本機 http server 服務 repo 目錄。
- **必裝 hook**（否則拿不到 game 物件）：在 `evaluateOnNewDocument` 裡攔截 `window.HBStart` 的 setter，包一層把回傳的 game 存到 `window.__game`。
- 取得除錯資料：`g._dbg()` 回傳 `{COMMON_UPGRADES, COMMON_RELICS, UPMAP, TALENT_TREES, HERO_LANES, HEROES, INTERFERENCES, POS_POOL, SHOP_ITEMS, RELIC_AFFIXES}`（注意聖物表的 key 是 **`COMMON_RELICS`**；`STAGES` 不在 `_dbg` 內，evaluate 裡勿引用）。
- 驅動：`g.startRun(act,'std',null,nodeIdx)`、`g._applyUpgrade(D.UPMAP[id])`、設 `g.screen` / `g._bag` / `g._detailOpen` 後 `g.render()`。
- 沙箱**連不到** `api.vercel.com` 與 `fonts.googleapis.com`（headless 下 webfont 會 fallback，正式裝置正常）。

---

## 6. 核心系統現況

- **英雄選擇頁**：7 名戲謔英雄、3 天賦線、21 節點天賦樹（以擦板蠻王為主）。
- **五聖物 loadout**：`save.loadout`（5 格，裝備中）／`save.library`（已擁有）。`RELICS[id]={name,cls(core/feel/oath/gag/job),form?,act,desc,hero?}`。`_relicMeta(id)` 決定性持久化 → `{tier(0普通/1精良/2稀有),q,affixes}`。`_toggleRelic(rid)` 裝/卸（核心球僅能 1 顆，會自動替換）。
- **遠征頁**：英雄+loadout+BD 摘要列、路線卡、石板格、每幕座標覆寫 `RT_ACT[1–5]`、tuner.html 視覺微調器。
- **籃獄圖譜**：分層素材組裝（底圖 + `_frame_empty` overlay + 程式文字）。
- **戰鬥**：自由浮動籃框、右上 HP 面板、每階怪群 `group.webp`、每幕背景（5 幕素材已到齊 `assets/mob/act{1-5}/stage{1-5}/`、`assets/battle/act{N}_bg.webp`）。
- **球形態**（核心機制，決定進球攻擊方式）：`BALL_FORMS{normal/fire/ice/lightning/axe/arrow}`，每個有 `attack(G,ctx)`。開局由 loadout 第一個帶 `form` 的核心聖物決定，否則 normal；局內「形態轉化」事件可改。
- **詳細資訊 Modal**（戰鬥中）：六區晶片（攻擊/元素/投籃/生存/聖物/干擾），**按住晶片 Hold-to-Preview** 跳大卡；球形態膠囊也可長按看攻擊說明。面板高度依內容自動收合。
- **聖物背包 Modal**（英雄頁，全螢幕）：頂部 5 裝備欄 + 依稀有度分區（稀有→精良→普通→未擁有）圖示格 + 底部詳情列；**點選**聖物顯示詳情並裝備/卸下。圖示為 **L3 光徽**（無框、發光線稿，`_drawRelicIcon` + `_relicGlyph` 每聖物專屬線符）。點空白**不**關閉，僅 ✕ 可關。
- **roguelite 成長**：12+ 獎勵（生存/投籃/攻擊），`run.mods` 乘算傷害；通用升級池（`allDmgMul`、`flatExtraHit`、元素附魔）。

---

## 7. 慣例 / SOP

- 預設交付＝**直接改引擎 + 重打包 + push**（非丟檔案）。完整檔輸出時：使用者刪舊上新。
- 改動**不要弄丟舊資料**（版本升級需 migrate）。
- 溝通用**繁體中文（台北用語）**，決策用互動式選項。
- 不要輸出進度報告式 markdown（本交接文件為例外，是刻意建立的長存文件）。
- 設計版本比較：用獨立深色 HTML mockup 呈現，不用會禁止深色遊戲風的可視化工具。

---

## 8. 近期里程碑（commit）

| commit | 內容 |
|---|---|
| `7ecdbf8` | 聖物圖示改 L3 光徽（線條+光）+ 每聖物專屬線符 + 字加大 |
| `14945c5` | 修正背包誤關（點空白不關閉，僅 ✕ 可關） |
| `15aac96` | 聖物背包改全螢幕 Modal（方向 D：稀有度分區 + 點選詳情） |
| `b33e2d1` | 詳細頁球形態膠囊加長按 Peek |
| `cf0cc6e` | 詳細資訊改晶片網格 + Hold-to-Preview |
| `01f74a8` | Act4/Act5 怪物 + 背景素材整合（5 幕到齊） |
| `50a8f48` | 戰鬥四項改版（金幣/升級池/進球追蹤/戰利品收下丟棄） |

---

## 9. 重要檔案 / 路徑速查

- `index.html` — 單檔遊戲（含 bundler manifest）。
- `vercel.json` — no-cache 標頭設定。
- `manifest.json` — PWA manifest（非 Service Worker；本專案**無** SW 快取）。
- `assets/mob/act{1-5}/stage{1-5}/group.webp` — 每幕每階怪群圖。
- `assets/battle/act{1-5}_bg.webp` — 每幕戰鬥背景。
- 引擎內主要繪製：`drawHeroes`（英雄頁，背包 gate 在此）、`drawRelicBag`、`_drawRelicIcon`/`_relicGlyph`、`drawHeroDetail`（戰鬥詳情 Modal）、`drawBattle`。

---

*最後更新：隨 commit `7ecdbf8` 後建立。後續重大改動請更新本表與第 6 節。*
