#!/usr/bin/env python3
# 重建 籃獄圖譜/stage-select 的分層合成底圖 assets/stage_select/bg_clean.webp
# 需求：素材包解壓在 A 路徑下；PIL + numpy
# 做法：背景底圖(只取氛圍) + 清掉素材內部烤字後疊回(JSON座標) + base自身返回/路線鬼影清除
from PIL import Image
import numpy as np, os, sys

A = sys.argv[1] if len(sys.argv) > 1 else \
    '/home/claude/sspkg/Hoopbreaker_StageSelect_DarkParody_iPhone15/assets/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/hoop/assets/stage_select/bg_clean.webp'
rng = np.random.default_rng(7)

def flat(im, x0, y0, x1, y1, col, fe=14, nz=4):
    a = np.array(im.convert('RGB')).astype(float); H = y1 - y0; W = x1 - x0
    for j, yy in enumerate(range(y0, y1)):
        for i, xx in enumerate(range(x0, x1)):
            al = min(1, (j+1)/fe, (H-j)/fe, (i+1)/fe, (W-i)/fe)
            a[yy, xx] = (np.array(col) + rng.uniform(-nz, nz, 3)) * al + a[yy, xx] * (1 - al)
    return Image.fromarray(np.clip(a, 0, 255).astype('uint8'))

def samp(im, x, y, r=5):
    a = np.array(im.convert('RGB')).astype(float)
    return np.median(a[y-r:y+r, x-r:x+r].reshape(-1, 3), axis=0)

# 1) 清素材內部烤字（素材內部平滑→無痕）
act = flat(Image.open(A+'stage_card_active_frame_empty.png'),   42, 66, 246, 360, (20, 16, 13), 16)
ina = flat(Image.open(A+'stage_card_inactive_frame_empty.png'), 42, 66, 246, 360, (15, 13, 16), 16)
ti  = Image.open(A+'title_header_frame.png')
ti  = flat(ti, 40, 10, 326, 82, samp(ti, 182, 8), 16, 5)     # 主標 籃獄圖譜
ti  = flat(ti, 86, 88, 300, 130, samp(ti, 182, 135), 12, 3)  # 副標牌

# 2) base：清自身 返回/路線 鬼影（保留 painted 石板與金條）
a = np.array(Image.open(A+'full_scene_base_no_text_1704x786.png').convert('RGB')).astype(float)
def bs(x, y, r=7):
    x = max(r, min(a.shape[1]-r, x)); y = max(r, min(a.shape[0]-r, y))
    return np.median(a[y-r:y+r, x-r:x+r].reshape(-1, 3), axis=0)
def bfeath(x0, y0, x1, y1, fe=16, nz=4):
    tl = bs(x0-12, y0-8); tr = bs(x1+12, y0-8); bl = bs(x0-12, y1+8); br = bs(x1+12, y1+8)
    H = y1 - y0; W = x1 - x0
    for j, yy in enumerate(range(y0, y1)):
        ty = j / max(1, H-1)
        for i, xx in enumerate(range(x0, x1)):
            tx = i / max(1, W-1)
            syn = (tl*(1-tx)+tr*tx)*(1-ty) + (bl*(1-tx)+br*tx)*ty + rng.uniform(-nz, nz, 3)
            al = min(1, (j+1)/fe, (H-j)/fe, (i+1)/fe, (W-i)/fe)
            a[yy, xx] = syn*al + a[yy, xx]*(1-al)
def bgold(x0, y0, x1, y1, cL, cR, fe=13, nz=3):
    H = y1 - y0; W = x1 - x0
    for j, yy in enumerate(range(y0, y1)):
        for i, xx in enumerate(range(x0, x1)):
            tx = i / max(1, W-1); col = cL*(1-tx) + cR*tx + rng.uniform(-nz, nz, 3)
            al = min(1, (j+1)/fe, (H-j)/fe, (i+1)/fe, (W-i)/fe)
            a[yy, xx] = col*al + a[yy, xx]*(1-al)
bfeath(70, 58, 210, 150, fe=16)                          # 返回 ← 鬼影
bgold(730, 640, 1000, 690, bs(726, 662), bs(996, 662), 13)  # 路線金條烤字

# 3) 疊回前景框（JSON 座標；hi-res = css*2）
base = Image.fromarray(np.clip(a, 0, 255).astype('uint8')).convert('RGBA')
def put(im, cssx, cssy, cssw, cssh):
    im = im.convert('RGBA').resize((round(cssw*2), round(cssh*2)), Image.LANCZOS)
    base.alpha_composite(im, (round(cssx*2), round(cssy*2)))
put(ti, 338, 0, 181, 71)                                  # 標題框
for i, x in enumerate([98, 236, 375, 514, 653]):          # 五張卡（第1張 active）
    put(act if i == 0 else ina, x, 83, 140, 224)
# 注意：返回框、路線金條沿用 base 本身（不疊 back/route 素材，因 JSON 座標對不上 base）

out = base.convert('RGB')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
out.save(OUT, 'WEBP', quality=92, method=6)
print('saved', OUT, os.path.getsize(OUT)//1024, 'KB')
