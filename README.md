# 🏎️ Drive-Thru Survivors · 得来速幸存者

> **麦当劳赛车 × 土豆兄弟 × 得来速武器改装**
> 一款融合街机漂移赛车、Brotato 式自动射击生存和麦当劳 MCP 真实数据的网页游戏。

## 项目概述

开着赛车冲过敌群，用麦当劳餐品改装你的车载武器，看看你能在这条无尽公路上活多久。

- **赛车操控**来自《马里奥赛车》：漂移蓄力加速、碰撞弹飞、速度感十足
- **战斗系统**来自《土豆兄弟 Brotato》：自动射击、波次生存、波间商店、6 槽武器 Build 构筑
- **数据驱动**来自麦当劳 MCP：真实餐品变身车载武器，真实门店变身赛道站点

## 文档导航

本项目的所有设计文档均在 `docs/` 目录下，编程 Agent 应按以下顺序阅读：

| 顺序 | 文件 | 内容 |
|------|------|------|
| 1 | [docs/VISION.md](docs/VISION.md) | 游戏愿景、核心循环、为什么好玩 |
| 2 | [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | 驾驶、战斗、武器、商店、经济系统详细设计 |
| 3 | [docs/ART_STYLE.md](docs/ART_STYLE.md) | 视觉风格指南、配色系统、粒子特效清单 |
| 4 | [docs/TECH_ARCHITECTURE.md](docs/TECH_ARCHITECTURE.md) | 技术栈、架构图、性能约束、项目结构 |
| 5 | [docs/MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) | 麦当劳 MCP 接入规范、6 个工具、安全隔离 |
| 6 | [docs/WEAPONS_CATALOG.md](docs/WEAPONS_CATALOG.md) | 餐品→武器映射表、升级系统、Build 示例 |
| 7 | [docs/PHASE_INSTRUCTIONS.md](docs/PHASE_INSTRUCTIONS.md) | 分 5 阶段的编码执行指令与验收标准 |

参考资料在 `reference/` 目录下：

| 文件 | 内容 |
|------|------|
| [reference/CODEX_REUSE_GUIDE.md](reference/CODEX_REUSE_GUIDE.md) | 从已有项目 codex-6.1-sol 可复用的代码清单 |

## 快速启动

```bash
npm install
npm run dev
# 打开 http://127.0.0.1:5173/

# 可选：另开终端启动阶段 0 网关脚手架
npm run dev:server
# http://127.0.0.1:3002/api/health
# Vite 已将 /api 代理到 3002

npm test       # 驾驶物理、碰撞和网关检查
npm run build # TypeScript 严格检查与生产构建
npm run preview # 预览生产构建：http://127.0.0.1:4173/
```

## 关联项目

- **codex-6.1-sol**（`/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol`）：包含可复用的 MCP 网关代码、SVG 美术资产坐标与配色、Web Audio 音效合成方案

## 当前实现：阶段 0 + 阶段 1

点击「发动引擎」进入无限驾驶练习场。默认开启自动油门，可以关闭后使用 W / ↑ 加速；S / ↓ 刹车，A D / ← → 转向。按住 Shift + 转向开始漂移，可保持 Shift 并反打方向控制走线；松开 Shift 释放蓝 / 橙 / 紫三级加速。空格冲刺消耗 20 氮气并持续 2 秒；练习场氮气耗尽后可重置补满。

桌面端保留竖向视角，游戏区接近占满可用高度，底部不显示触控按钮；漂移蓄力状态与自动油门位于左侧。移动端游戏铺满动态视口，页面无滚动，按安全区留出操作空间；支持多点触控，底部方向、漂移和冲刺按钮高度为 64 CSS px。P / Esc 暂停，R 重置，M 切换声音；页面失焦或切到后台自动暂停，回到页面后手动继续。声音在首次交互后解锁，由 Web Audio 实时合成。

- 桌面使用 450×800 逻辑画布；手机保持 450 逻辑宽度，按屏幕比例扩展纵向场景。Phaser FIT 等比缩放，赛车不拉伸；WebGL 优先、Canvas 自动降级。
- 固定 60Hz 物理步长与位置插值；512 个预分配粒子精灵，饱和时丢弃新粒子。
- 赛车、树木、积木楼和门店纹理由代码绘制；配色、几何与音效包络参考关联项目，未引入外部图片、字体或音频。
- 网关当前仅开放健康检查和配置状态，不连接 MCP；战斗、武器、商店和真实快照按后续阶段实现。无需 Token 即可体验驾驶。
- `npm run dev` 提供只读 `window.__driveThru` 调试状态；生产构建不包含此接口。

验收覆盖桌面 Chromium、390×844 手机尺寸及多点触控模拟、强制禁用 WebGL 的 Canvas 路径。真机触感与扬声器听感仍需实际设备体验；固定物理步长不代表所有设备都已验证稳定 60 FPS。
