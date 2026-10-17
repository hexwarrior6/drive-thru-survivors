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
# 编程 Agent 应先阅读文档，再按 PHASE_INSTRUCTIONS.md 逐步执行
# 阶段 0 会创建项目脚手架并完成技术选型
# 阶段 1-4 逐步实现游戏系统
```

## 关联项目

- **codex-6.1-sol**（`/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol`）：包含可复用的 MCP 网关代码、SVG 美术资产坐标与配色、Web Audio 音效合成方案
