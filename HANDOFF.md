# 籃框破壞神 HOOPBREAKER — 交接文件

> 給接手的 AI / 開發者。Harry（哈利）是創意總監（體驗師），非工程師，Claude 直接 GitHub 接管。一律繁體中文（台北用語）回覆。

## 專案資訊
- **Repo**：`jaychou77714/hoop-destroyer`（public）
- **線上**：https://hoop-destroyer.vercel.app （Vercel 自動部署，push 後約 20–30 秒生效）
- **類型**：NANACA†CRASH 風格籃球物理彈射遊戲，**單檔靜態 web app**
- **部署**：Vercel，根目錄 `index.html`，零 build 設定

## ⚠️ 特殊架構：bundler 打包格式（接手前必讀）
這**不是普通 HTML**，是 bundler 打包的單檔。`index.html` 內含兩個關鍵 script：

1. `<script type="__bundler/manifest">` — JSON，內含兩個 **gzip + base64** 壓縮的 JS chunk：
   - `af2147d2-3ac8-434b-bfe8-7a89eab8c035` = DC framework runtime（React 渲染框架，~55KB）
   - `875365e8-8f11-4b79-9780-292f266babda` = **遊戲引擎**（~141KB，ES module，`export function start` → 掛 `window.HBStart`）
2. `<script type="__bundler/template">` — JSON，遊戲頁面 HTML（含 `#ah-canvas`、DC Component）存成字串

**引擎關鍵**：`BW=1920, BH=1080`（橫向設計），鎖橫向，直向顯示「請旋轉手機」。Game class 全用 canvas 自繪，按鈕走 `hitButtons()` 命中判定，畫面切換用 `this.screen`。

### 修改引擎的流程（重要）
```
1. 從 manifest 取 chunk → base64 decode → gunzip → 得到 JS 原始碼
2. 修改 JS（str_replace，含中文用 assertion 確認唯一）
3. 重新 gzip → base64 encode
4. 用字串 replace 把新 base64 填回 index.html manifest 的對應 data 欄
5. 驗證：node --check + puppeteer 真實瀏覽器測試
```
改完務必確認 manifest / template 兩個 JSON 都還能 `JSON.parse`。

## 已完成（修復歷史）
1. **App logo + PWA**：`icon-180/192/512.png` + `manifest.json`，可加到手機主畫面
2. **手機觸控無法點擊** → `#ah-canvas` 加 `touch-action:none`（CSS 不繼承，外層有但 canvas 自己要加）
3. **橫向字小** → 首次互動 `requestFullscreen`（Android 有效；iOS 無 API，靠加到主畫面全螢幕）
4. **引擎防護** → 主迴圈 / pointer / resize 全包 try-catch + `_hbErr()` 把真實錯誤顯示到畫面（取代被跨來源遮蔽的 "Script error."）
5. **Script error 根因** → DC 框架從 `unpkg.com` CDN 載 React/ReactDOM，4G 弱網下載失敗。解法：放本地 `react.production.min.js` + `react-dom.production.min.js`，在 head 同源預載。DC 的 `loadReactUmd()` 偵測 `window.React` 已存在就跳過 unpkg。**這兩個檔勿刪！**
6. **iOS 點不到根因** → 引擎 `pointerdown` 呼叫了 `e.preventDefault()`（iOS WebKit 會阻斷後續 `pointerup`），且 `pointerup` 有 `pointerId` 過濾（iOS 的 up id 與 down 不一致被擋掉）。解法：移除這兩者（改靠 touch-action:none），並加 **touch 事件雙保險**。`_bindInput` 已重寫為 `doDown/doMove/doUp` + `fresh()` 去重。

## 目前狀態
- 全面排查：home/hub/heroes/atlas/route/relics/codex/settings 的所有按鈕 + **所有返回鍵** + 確認框 → 全部正常，0 錯誤
- 用 puppeteer（headless Chrome）真實 touch 測試驗證通過

## 待辦 / 下一步
- [ ] **實玩驗證**戰鬥中 / 勝利 / 失敗畫面的按鈕（需實際打一局才進得去，容器無法完整模擬）
- [ ] 穩定後可移除 `_hbErr` 的診斷紅框（目前留著當保險）
- [ ] 字小若仍困擾，可評估 CSS 強制旋轉方案（讓方向鎖定的使用者也能橫向玩）

## 驗證工具（容器內）
- 系統有 **`/opt/google/chrome/chrome`** + npm `puppeteer-core`
- 可用真實瀏覽器跑：`file://` 或 `python3 -m http.server`
- 抓 `page.on('pageerror')` 能**繞過跨來源遮蔽**，看到真實錯誤（這次找到 unpkg 根因就靠這個）
- 模擬 iOS：`setViewport({isMobile:true, hasTouch:true})` + `touchscreen.tap()` 或手動派發 `TouchEvent`

## 操作 SOP
- 每次 commit 前：`git config user.email "storyhomedesign@gmail.com"`（Vercel Hobby 必需）
- GitHub PAT：由 Harry 提供（classic token，勾 `repo` scope），用完撤銷，**勿存入記憶**
- push 後用 GitHub API 驗證 HEAD SHA
- 給 Harry 選項時用可點選的互動選項（ask_user_input），不用純文字 A/B/C/D
