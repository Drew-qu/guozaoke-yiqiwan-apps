# 抛物线乐园 v1.0.2 · 一起玩

横版蓄力抛物线小游戏：四种角色、可挖地形、风力与坡度，瞬移/回复/加强/双发道具，支持闯关、每日与双人同屏。

手机：画布占满、侧栏抽屉；拖动画布只调角度，按住「抛出」蓄力发射。

## 打包上传

```bash
cd apps/tank
# 勿打进 README.md；上传表单名称/介绍用休闲口径
zip /tmp/tank-1.0.2.zip manifest.json index.html app.js style.css
python /path/to/developer-kit/tools/check_package.py /tmp/tank-1.0.2.zip
```

标识建议：`tank`。
