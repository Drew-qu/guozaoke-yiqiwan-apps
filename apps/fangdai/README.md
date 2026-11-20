# 房贷精算师 · 一起玩

可视化房贷与提前还贷计算器！支持商业贷款、公积金、组合贷款，一键对比提前还贷「缩短年限 vs 减少月供」省息方案，内置纯 Canvas 本息环形图、逐年走势图与完整还款明细表。

## 本地预览

1. **直接试用**：双击 `index.html` 即可在浏览器中直接运行（无平台 SDK 时自动使用 `localStorage` 保存方案）。
2. **一起玩工具包预览**：
```bash
python /path/to/developer-kit/tools/preview.py /path/to/yiqiwan-fangdai --port 8766
```

## 打包上传

```bash
cd yiqiwan-fangdai
zip -r fangdai-1.0.2.zip manifest.json index.html app.js style.css
python /path/to/developer-kit/tools/check_package.py fangdai-1.0.2.zip
```

标识建议：`fangdai`。
