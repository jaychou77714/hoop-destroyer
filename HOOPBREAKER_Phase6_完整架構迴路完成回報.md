# HOOPBREAKER Phase 6 — 完整架構迴路 完成回報

> 引擎 commit：`bf103bb`（`jaychou77714/hoop-destroyer`，index.html 引擎 chunk）
> 驗證：**headless 48/48 全過** + 全畫面 smoke（14 畫面）無 pageerror
> 狀態：**待哈利 iPhone 15 橫向實機大量測試** → 再交 Codex 工程整理

---

## 一、本輪做了什麼（一次補齊）

| 系統 | 結果 |
|---|---|
| 等級系統 | run.level/xp/xpNext/levelUpsPending；公式 `round(100×1.22^(lv-1))`；HUD Lv/XP 條 |
| 經驗來源 | 普通怪+10、菁英/干擾怪+20、普通關+40、Boss+100（×xpMul） |
| 金幣系統 | 局內 `run.gold`（怪+2/+4、普通關+20、Boss+60）＋永久 `profile.coins` |
| 永久金幣 | 每幕通關+50、五幕通關+300、失敗依已過節點×10＋分數 bonus；localStorage |
| 商店 | `drawShop`，第 2、4 普通關後進場，5 品項，可跳過，手機橫向可讀 |
| 天賦樹 | 七英雄各 21 格（12 小／6 中／3 異變大），花永久幣、localStorage 存、生效 |
| 共用 BD 池 | `COMMON_UPGRADES` 24 個，**完全無職業字眼**；reward／levelup／商店秘寶共用同一池 |
| 共用聖物 | `COMMON_RELICS`＝去職業化的 RELICS（移除 hero 綁定、武器名改中性、job/gag→feel） |
| 技能傷害結算器 | 進球後**邏輯保證打到怪**；axe/arrow 不再靠動畫碰撞 |
| 結果頁統計 | 得分/命中率/空心/擦板/連擊/擊殺/金幣/等級/永久幣/選過的 BD |
| 存檔 | `_loadProfile`/`_saveProfile`，profile = {coins, unlockedTalents} |

---

## 二、新增資料結構（附加於引擎 chunk 尾端）

- **`COMMON_UPGRADES`（24）**：攻擊 11（fireup/frost/thunder/swishzeal/bankfaith/luckydisc/swishhunt/bankwave/luckyfin/chainb/reap）、投籃 2（nearfocus/farfocus/combo/memory）、生存 6（heal/shield/ironhide/entrysh/regen/missbuf）、經濟 3（scavenge/bounty/learner）。每項 `{id,name,type,desc,instant?|mod,delta,cap,maxStack}`。
- **`UPMAP`**：id→def 查找表。
- **`COMMON_RELICS = RELICS`**：聖物已全部共通化（無 `hero` 欄位、無斧/弓字眼）。
- **`SHOP_ITEMS`（5）**：熱血毛巾/臨時護盾/重抽券/共用秘寶/籃魂兌換。
- **`TALENT_SMALL`（12）/`TALENT_MID`（6）/`HERO_MUT`（七英雄各 3）** ＋ `buildTalentTree()` ＋ **`TALENT_TREES`（每英雄 21 格）**。
- **profile**：`PROFILE_KEY='hb_profile_v1'`、`defaultProfile`、`loadProfileRaw`/`saveProfileRaw`。
- **`run` 新欄位**：`gold`、`levelUpsPending`、`shopBought`、`rewardLog`、`mut`、`_stageMakes`、擴充 `run.mods`（新增 swishExtra/bankAoe/luckyExecute/extraChainChance/executeMul/stageStartShield/missShield/bonusGoldMul/killGoldBonus/xpMul/comboDmgPerStack/minPreviewBonus）。
- **`this.profile`、`this.sessionStats`**（跨幕遠征累計）。

---

## 三、新增畫面（screens）

| screen | 進入點 | 內容 |
|---|---|---|
| `shop` | 第 2/4 普通關 reward 後 | 局內金幣顯示、5 品項購買、離開→下一關 |
| `talents` | 英雄頁天賦面板「解鎖 ›」 | 永久幣顯示、英雄切換、21 格節點購買、解鎖高亮、返回 |
| `upgrade` modal | 升級時（戰鬥中） | 共用 BD 三選一（取代舊球途盤）；可重抽 |

---

## 四、流程圖（文字版）

```
英雄選擇 → loadout/聖物 → 遠征(atlas/route)
  → Act n Stage 1 戰鬥
     → 進球 → BALL_FORMS.attack → 技能傷害結算器掃怪
     → 擊殺 → +XP +gold
     → xp 滿 → levelup 三選一(共用 BD, modal)
  → 清關 → +清關XP +清關gold
     → reward 三選一(共用 BD)
     → _continueAfterReward()
        ├ 第2/4普通關 → shop 花 gold → 下一關
        └ 其他 → 下一關
  → Boss 關 → 幕通關 → finishRun(won)
     → +永久籃魂幣 → drawEnd「前往第 n+1 幕」
  → Act5 通關 → 「★全五幕遠征通關★」+ 遠征總結
  → 回英雄頁 → 天賦樹花 coins 解鎖 → 影響下次 startRun
```

---

## 五、技能傷害結算器（企劃第六點，重點）

新增 `_getAliveGuards / _pickSkillTargets(all|nearest|farthest|lowhp|random|aoe) / _dealSkillDamage / _skillSweep`。

- `formNormal/Fire/Ice/Lightning`：原本已是邏輯直接 `hurtGuard`（合格，保留）。
- **`formAxe`**：進球後 `_skillSweep({mode:'nearest', n:2~3})` **必定**掃到最近數名怪；視覺斧 projectile 改 `dmg:0`（純動畫）。
- **`formArrow`**：點名施法者→否則最遠怪（`farthest`），穿透時再點低血（`lowhp`）；視覺箭 `dmg:0`。
- **共用後效** `_applySharedSkillEffects`：空心追擊（額外打 N）、擦板震波（小 AoE）、幸運補刀（低血）、連鎖彈跳（隨機）、元素溢散（首球爆）。
- 無怪時安全 return、不報錯（驗證第 31 項）。`run.mods` 倍率仍套用（驗證第 32 項）。

---

## 六、headless 驗證結果（48/48 全過）

```
PASS 48/48
全畫面 smoke：home/hub/heroes/atlas/route/relics/codex/battle/
            upgrade-modal/shop/talents/reward/lose/win 全 render，PAGE ERRORS: none
```

- 等級 1–7：擊殺/清關給 XP、滿級進 levelup、三選一不出職業項、套用正確、連續升級。
- 金幣 8–13：擊殺/清關給 gold、shop 可進、可花、不足擋購、離開進下一關。
- 天賦 14–20：profile 初始化、coins 存 localStorage、節點可買、不足擋、**各英雄資料獨立**、startRun 套用天賦、異變 flags 進 run。
- 共用池 21–24：COMMON_RELICS/COMMON_UPGRADES 無職業技能、七英雄共用同一池、levelup 不出斧/弓。
- 技能打怪 25–32：normal/fire/ice/lightning/axe/arrow 進球皆實際打到怪、無怪不報錯、mods 倍率套用。
- 流程 33–40：Act1~5 可跑、reward 正常、互不卡死、Boss→下一幕、Act5→遠征通關、結果頁統計、永久幣入帳、可回英雄頁。
- 回歸 41–48：五種進球判定、擦板蠻王板魂、干擾系統、軌跡難度曲線、框位平衡、獎勵系統、未動投籃物理、未動 hitbox。

---

## 七、placeholder ／ 留給 Codex 工程整理

- 天賦大節點異變效果偏**保守**（多為 run.mods 加成 + 少數 mut 旗標）。
- `drawTalents` / 商店為**功能版 UI**（無美術 polish）。
- `sessionStats` 為**簡版**跨幕統計。
- **球語 BALL_WORDS** 因 `run.abilities` 恆空，目前不會成立（企劃未保護；建議與天賦/英雄被動一起重新設計）。
- 死碼可清理：舊 `ABILITIES` 球途盤、`REWARDS`/`REWARD_IDS`、`chooseForm`/`chooseAbility`/`rerollAbility`、`FORM_CHOICES`、`_dbg`（驗證用）。

---

## 八、確認沒有改壞 Phase 4 核心

回歸驗證 41–48 全過。**未動**：投籃物理／battleUp 力道／stepBall／collideHoop／hoop·rim hitbox／五種進球判定 if 鏈／擦板蠻王被動／怪物干擾核心／hideLanding·slowCharge·drum·maxPull·shortTraj·gravity／上一球殘影／籃框位置行為牌／投失不換位·進球換位／五幕閉環／5-1b run.mods 基本結構／5-2 軌跡難度曲線／手機橫向操作。

---

## 九、push 狀態

引擎與本回報已在本機 commit 完成（`bf103bb` + HANDOFF/回報 commit）。**本輪為新容器、已委託的 PAT 不在此 session context**，故 push 尚未送出——需哈利提供 token（或自行 push）後即可上 Vercel。
