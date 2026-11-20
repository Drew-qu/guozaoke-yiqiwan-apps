# 萝卜守卫战 v1.1.0 · 一起玩

造炮塔、相邻合成变强力塔，冰火搭配守卫大萝卜。上半是冒险闯关（青草弯道为新手推荐），下半是无尽生存与每日挑战。

一座合成体对比两座同系 3 级，单目标理论输出 ≥ 约 1.05 倍，并带灼烧、冻结或连发。榜 ID 固定为 `luobo-*-v2`，发版不换榜；每日榜按北京时间换日。结算可见本局伤害贡献。

## 本地预览

在仓库根目录：

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/apps/luobo/?theme=light
```

无工具包时也可直接打开 `index.html`（无 SDK 时降级 localStorage）。

## 打包上传

```bash
cd apps/luobo
# 勿把 README.md 打进包
zip /tmp/luobo-1.1.0.zip manifest.json index.html app.js style.css image.jpeg
```

标识建议：`carrot-defense` / `luobo-guard`（若 slug 被拒再换）。
