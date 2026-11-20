# 疯狂打螺丝 v1.0.0 · 一起玩

高还原度物理打螺丝拆板消除小游戏！支持单点支点重力摆动、4 种几何亚克力板、金属拧出与合盖打包动画、4 大实用道具（加孔位 / 开新盒 / 砸碎板 / 磁吸）以及无限闯关与每日同种冲榜。

## 本地预览

1. **直接试玩**：双击 `index.html` 即可在浏览器中直接体验（无平台 SDK 时自动降级使用 `localStorage`）。
2. **一起玩工具包预览**：
```bash
python /path/to/developer-kit/tools/preview.py apps/luosi --port 8766
```

## 打包上传

```bash
cd apps/luosi
# 勿打进 README.md
zip /tmp/luosi-1.0.0.zip manifest.json index.html app.js style.css image.jpeg
python /path/to/developer-kit/tools/check_package.py /tmp/luosi-1.0.0.zip
```

标识建议：`luosi`。

