# 买车养车账本 · 一起玩

燃油 / 油电混动 / 插混 / 增程 / 纯电分公式测算持有成本。默认对比两辆车，可加第三辆；纯电行驶占比与家充占比分开。

## 本地预览

1. **直接试用**：双击 `index.html` 即可在浏览器中直接运行（无平台 SDK 时自动使用 `localStorage` 保存方案）。
2. **一起玩工具包预览**：
```bash
python /path/to/developer-kit/tools/preview.py /path/to/yiqiwan-youche --port 8766
```

## 打包上传

```bash
cd yiqiwan-youche
zip -r youche-1.0.1.zip manifest.json index.html app.js style.css
python /path/to/developer-kit/tools/check_package.py youche-1.0.1.zip
```

标识建议：`youche`（或 `ev-vs-ice`）。
