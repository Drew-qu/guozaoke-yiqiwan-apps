# 抛物线乐园 v1.0.3 · 一起玩

横版蓄力抛物线：四种角色、可挖地形、风力与坡度，瞬移 / 回复 / 加强 / 双发，支持闯关、每日与双人同屏。

手机上画布占满，侧栏是抽屉。拖动画布只调角度。按住「抛出」蓄力，在按钮上松手才发射；手指滑出按钮、右键或 Esc 取消，不会抛出。闯关是你打一发、一名对手回一发。双人同屏仍按坦克轮流。

## 打包上传

```bash
cd apps/tank
# 勿打进 README.md
zip /tmp/tank-1.0.3.zip manifest.json index.html app.js style.css image.jpg
python /path/to/developer-kit/tools/check_package.py /tmp/tank-1.0.3.zip
```

标识建议：`tank`。
