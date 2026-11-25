# guozaoke-yiqiwan

过早客「一起玩」小应用源码合集。每个子目录是一个可独立打包上传的静态应用（`manifest.json` + `index.html` + …）。

## 应用列表

| 目录 | 名称 | 说明 |
|------|------|------|
| `apps/fangdai` | 房贷精算师 | 房贷与提前还贷对比 |
| `apps/luobo` | 萝卜守卫战 | 塔防 1.1.0：闯关 / 无尽 / 每日，合成对比两座 3 级 |
| `apps/tanqiu` | 弹珠破阵 | 弹射破砖 + 肉鸽强化 |
| `apps/youche` | 买车养车账本 | 燃油/混动/插混/增程/纯电持有成本对比 |
| `apps/zhexian` | 折线 | 一笔连点、禁止交叉 |
| `apps/canglan` | 沧澜突围 | 三维街机 1.0.4（折影 / 潮垒） |
| `apps/tank` | 抛物线乐园 | 2.0.2：直进战斗、第一章三星、伤害衰减/AI/统计 |
| `apps/luosi` | 疯狂打螺丝 | 物理拆板消除 1.0.0 |

## 本地预览

需 [一起玩 developer-kit](https://www.guozaoke.com/static/apps/docs/developer-kit.zip) 的 `tools/preview.py`：

```bash
python3 /path/to/developer-kit/tools/preview.py apps/youche --port 8801
# http://127.0.0.1:8801/?theme=light
```

## 打包上传

平台不接受 `.md` / 多余 zip。只打源文件：

```bash
cd apps/youche
zip /tmp/youche-1.0.0.zip index.html style.css app.js manifest.json image.jpg
python3 /path/to/developer-kit/tools/check_package.py /tmp/youche-1.0.0.zip
```

上传到 [开发者中心](https://www.guozaoke.com/apps/developer)。`description` 1–160 字；网页「应用介绍」勿只留空格。

## 规范

- Manifest：见官方 [manifest.schema.json](https://www.guozaoke.com/static/apps/docs/manifest.schema.json)
- 指南：[AI-DEVELOPMENT.md](https://www.guozaoke.com/static/apps/docs/AI-DEVELOPMENT.md)
