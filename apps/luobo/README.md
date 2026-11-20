# 萝卜守卫战 · 一起玩

造炮塔、清障碍赚金币，守卫大萝卜。含 3 张主题图、无尽守卫与每日同种子冲榜。

## 本地预览

```bash
python3 /Users/qudu/project/yiqiwan-developer-kit/tools/preview.py \
  /Users/qudu/project/yiqiwan-luobo-1.0.0 --port 8801
# http://127.0.0.1:8801/?theme=light
```

无工具包时也可双击 `index.html`（无 SDK 时降级 localStorage）。

## 打包上传

```bash
cd /Users/qudu/project/yiqiwan-luobo-1.0.0
# 勿把 README.md 打进包：平台会拒 .md
zip /Users/qudu/project/luobo-1.0.3.zip manifest.json index.html app.js style.css image.jpeg
```

网址标识建议：`carrot-defense` / `luobo-guard`（勿直接抄别人的 slug；`luobo` 若被拒再换）。
