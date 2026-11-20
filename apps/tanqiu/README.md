# 弹珠破阵 · 一起玩

拉线瞄准弹射数字砖块，每 5 回合触发肉鸽三选一强化！支持经典无尽冲分 + 每日全服同种子挑战 + Web Audio 合成音律反馈。

## 本地预览

1. **直接试玩**：双击 `index.html` 即可在浏览器中直接体验（无平台 SDK 时自动降级使用 `localStorage`）。
2. **一起玩工具包预览**：
```bash
python3 /Users/qudu/project/yiqiwan-developer-kit/tools/preview.py \
  /Users/qudu/project/yiqiwan-tanqiu-1.0.0 --port 8799
# 打开 http://127.0.0.1:8799/?theme=light
```

## 打包上传

```bash
cd /Users/qudu/project/yiqiwan-tanqiu-1.0.0
zip -r tanqiu-1.0.1.zip manifest.json index.html app.js style.css
python3 /Users/qudu/project/yiqiwan-developer-kit/tools/check_package.py tanqiu-1.0.1.zip
```

网址标识建议：`marble-break` / `brick-volley`（勿用 `tanqiu`，易撞保留名；`reed-lake` 是别人的）。
ZIP 校验与 slug 无关，slug 在上传页单独填写。
