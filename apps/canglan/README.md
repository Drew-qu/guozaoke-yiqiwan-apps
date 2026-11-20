# 沧澜突围 · 一起玩

虚构碧潮航道上的原创三维街机。驾驶鸭翼双垂尾试验机「折影」，空袭打飞行编队，海攻炸护航舰和潮垒航母部件。不含现实军备数据，也没有外部素材或运行时 CDN。

三维画面使用随包的 Three.js（MIT，见 `vendor/LICENSE-three.txt`），模型、海面和音效都在本地用代码生成。

当前 1.0.4：翼型和机身更密，材质为 PBR + ACES，舱盖和舰体有层次。玩家可见名称仍是折影、掠影、雷鸦、潮哨、潮垒。离开或关闭页面会停掉循环引擎声。

## 本地预览

在仓库根目录：

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/apps/canglan/?theme=light
```

有一起玩 developer-kit 时：

```bash
python3 /path/to/developer-kit/tools/preview.py apps/canglan --port 8765
```

没有平台 SDK 时会降级到 localStorage，游戏本身可玩。

玩法自测（不打进上传包）：

```bash
cd apps/canglan
node logic.test.js
node gfx.test.js
```

## 打包上传

平台不接受 `.md` / 测试脚本 / `package.json`。只打源文件：

```bash
cd apps/canglan
zip /tmp/canglan-1.0.4.zip \
  manifest.json index.html style.css app.js logic.js gfx.js image.jpeg \
  vendor/three.module.min.js vendor/LICENSE-three.txt
```

网址标识建议：`canglan` / `azure-tide`（若 slug 被拒再换，不要占用别人的名字）。

## 操作

- 键盘：WASD 或方向键移动，J / 空格空袭，K 海攻，Shift 隐身，P 暂停，Enter 开始或重开
- 触控：按住画面拖动，右侧「空袭 / 海攻 / 隐身」
