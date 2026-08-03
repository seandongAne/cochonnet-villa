# Kerr 黑洞 HDR 旋转视觉验收

日期：2026-08-03
验收路由：`/villa-map/?observatory=perf&view=black-hole-edge&lights=off&quality=high&motion=full&sky=impossible`

## 视觉来源与目标

- 用户参考图：`C:/Users/seand/AppData/Local/Temp/codex-clipboard-4b022339-ca23-4d34-a40f-2fa6166f7369.png`，2584×1366。
- 主要方向：黑/金配色、很小但接近白热的峰值、连续暖色 halo，以及肉眼可辨的缓慢旋转。
- 产品约束：真实摄影星空、Gaia 星点和事件视界必须保留；不使用会把整片穹顶与房间一起洗白的全屏 Bloom。

## 最终实现

- Kerr 盘面保留 10/15/25 秒内/中/外差速流动；另以单一、连贯的 15 秒 hero tracer 提供清晰的旋转读数。
- hero tracer 是一个贴合盘面的长条琥珀/金色 carrier；只有很窄的前缘热点进入近白热 HDR，避免重新变成均匀发光圆环。
- High/Medium 的黑洞局部合成增加连续、由真实世界黑洞投影位置和角半径驱动的暖色 aureole；Low 继续走已验证的单采样回退路径。
- 白热峰只允许出现在近中性白、局部亮度脊且邻近暖色盘面的区域；静态灰白 crescent 被压低，事件视界保持纯黑。
- 无全场 Bloom、无重复大半径采样环、无 spaghetti 线圈、无灰白矩形或时间累积鬼影；黑洞外的精细星空保持清晰。

## 同屏对照与旋转证据

- 参考图与最终浏览器画面同屏比较：`docs/observatory-final/25-kerr-hdr-reference-comparison.png`。
- 同一固定机位的 t0 / 约 t+2 秒 / 约 t+4 秒序列：`docs/observatory-final/26-kerr-hdr-rotation-sequence.png`。
- 原始浏览器帧：
  - `docs/observatory-final/21-kerr-hdr-f-off.png`
  - `docs/observatory-final/22-kerr-hdr-t0.png`
  - `docs/observatory-final/23-kerr-hdr-t2.png`
  - `docs/observatory-final/24-kerr-hdr-t4.png`
- 三帧中白热 knot 从暗影右下沿盘面移动到右上，再到上方偏左；观察 2–4 秒即可直接读出方向，不需要依赖整体圆环旋转。

## 迭代记录

1. v1：整体偏暗，虽然周期已缩短，肉眼仍像静止纹理。
2. v2：直接扩大高亮产生过亮线圈、spaghetti 弧线与灰白块，拒绝。
3. v3：流动更平滑，但静态 Doppler crescent 仍盖住运动信号，拒绝。
4. final：把琥珀长弧与窄白热点拆开；静态 crescent 退后，运动 carrier 成为唯一强方向线索，并用局部 aureole 提升感知亮度。

## 浏览器与自动化证据

- 浏览器状态：High、lights off、F on、motion full、`kerr-atlas`、HalfFloat、80,000 Gaia、8K 背景；drawing buffer 2124×1098，黑洞 pass 1920×993。
- 诊断状态：`blackHole.reveal=1`、`lensAmount=1`、预热完成、Kerr/source map/source stars ready；无 WebGL、shader 或 framebuffer 错误。
- 最终局部采样：t0/t2 峰值分别约 0.937/0.957，达到近白热小面积高光；同一区域平均亮度仅约 0.184/0.183/0.181，说明 HDR 读数来自局部对比而非整片提亮。
- `node --test tests/observatory-kerr-lens.test.mjs tests/observatory-black-hole-pass.test.mjs tests/observatory-runtime.test.mjs`：31/31 通过。
- `npm test`：257/257 通过。
- `npm run build`：通过。

## 剩余取舍

- P3：最终版有意没有复制参考图占据大部分画幅的吸积盘尺寸和全屏 Bloom。当前黑洞仍是“精细星空中的有限距离天体”，这样可以保住摄影银河、Gaia 星点、空间距离感和房间暗适应。若未来需要更电影化，可单独增加 F 模式的角尺寸/镜头构图选项，而不是污染所有星空像素。
- 浏览器验收证明实现路径与视觉状态正常，但不替代 Iris Xe/M1、UHD 620 级设备的目标 GPU p95。

final result: passed
