# 🛠️ 技术架构 · Drive-Thru Survivors

## 技术栈

```
前端游戏：
├── Phaser 3（npm 安装，WebGL 渲染模式）
│   - 内建精灵管理、场景系统、输入处理
│   - 内建粒子系统和补间动画
│   - 或可选 PixiJS + 自定义场景管理（如追求更轻量）
├── TypeScript（严格模式，类型安全）
├── Web Audio API（程序化音效合成，零音频文件）
└── Vite（构建工具，开发服务器 + 生产构建）

后端 MCP 网关（复用 codex-6.1-sol 架构）：
├── Fastify + @fastify/rate-limit
├── @modelcontextprotocol/sdk（MCP 客户端）
├── 6 个白名单 MCP 工具
├── 快照缓存 15 分钟 + LRU 上限 20
└── 示例数据降级（无 Token 可玩）

共享层：
├── Zod（运行时数据校验）
└── 共享类型定义（Product, Store, Snapshot, WeaponMapping）
```

## 项目目录结构

```
drive-thru-survivors/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                    # 游戏入口 HTML
├── .env.example                  # MCDONALDS_MCP_TOKEN=xxx, PORT=3002
│
├── src/
│   ├── main.ts                   # 入口：创建 Phaser.Game 实例
│   ├── config.ts                 # 全局游戏配置常量
│   │
│   ├── scenes/                   # Phaser 场景（游戏状态机的每个状态）
│   │   ├── BootScene.ts          # 预加载 + 程序化资产生成（纹理、精灵表）
│   │   ├── TitleScene.ts         # 标题画面
│   │   ├── SelectScene.ts        # 赛车选择
│   │   ├── GameScene.ts          # 核心驾驶+战斗（主场景）
│   │   ├── ShopScene.ts          # 得来速商店（叠加在 GameScene 上或独立场景）
│   │   └── ResultScene.ts        # 结算画面
│   │
│   ├── entities/                 # 游戏实体
│   │   ├── Player.ts             # 玩家赛车（操控、漂移、碰撞体）
│   │   ├── Enemy.ts              # 敌人基类 + 各敌人子类
│   │   ├── Bullet.ts             # 弹丸基类（含对象池集成）
│   │   ├── Pickup.ts             # 掉落物（金币、氮气瓶、修理零件）
│   │   └── Boss.ts               # BOSS 实体（独立行为逻辑）
│   │
│   ├── systems/                  # 游戏子系统
│   │   ├── DriftPhysics.ts       # Dual-Vector 漂移物理引擎
│   │   ├── WeaponSystem.ts       # 武器管理、自动瞄准、射击冷却
│   │   ├── WaveSystem.ts         # 波次管理、敌人生成模式、难度曲线
│   │   ├── TrackGenerator.ts     # 程序化赛道段生成
│   │   ├── CollisionSystem.ts    # 碰撞检测与响应
│   │   ├── DropSystem.ts         # 掉落物生成与吸附
│   │   ├── EconomySystem.ts      # 金币收入、支出、余额管理
│   │   └── HealthSystem.ts       # 车况管理、受伤、紧急状态
│   │
│   ├── effects/                  # 视听反馈
│   │   ├── ParticleManager.ts    # 粒子特效管理器（对象池）
│   │   ├── ScreenShake.ts        # 屏幕震动系统
│   │   ├── DamageNumbers.ts      # 伤害数字弹出（对象池）
│   │   ├── ComboCounter.ts       # 连击计数器 UI
│   │   └── AudioSynth.ts         # Web Audio API 程序化音效合成
│   │
│   ├── ui/                       # UI 组件
│   │   ├── HUD.ts                # 游戏内 HUD（车况、金币、氮气、武器槽）
│   │   ├── ShopCard.ts           # 商店武器卡片组件
│   │   ├── WaveAnnouncer.ts      # 波次提示（"WAVE 5" 弹出文字）
│   │   └── MobileControls.ts     # 手机虚拟按钮（方向、漂移、冲刺）
│   │
│   ├── data/                     # 静态数据定义
│   │   ├── weapons.ts            # 武器类型定义表（属性、升级效果）
│   │   ├── enemies.ts            # 敌人类型定义表（行为、血量、掉落）
│   │   ├── tracks.ts             # 赛道段模板定义
│   │   └── colors.ts             # 配色常量（来自 ART_STYLE.md）
│   │
│   ├── utils/                    # 工具函数
│   │   ├── ObjectPool.ts         # 通用泛型对象池
│   │   ├── juice.ts              # 游戏果汁工具（震动、闪烁、慢动作）
│   │   └── math.ts               # 向量运算、lerp、slerp、clamp
│   │
│   └── mcp/                      # MCP 集成层
│       ├── McpClient.ts          # 前端 MCP 网关客户端（fetch /api/snapshot）
│       ├── snapshot.ts           # 快照类型定义 + demoSnapshot() 示例数据
│       └── weaponMapper.ts       # 餐品类别 → 游戏武器映射逻辑
│
└── server/                       # MCP 网关服务端（可选，也可复用 codex-6.1-sol）
    ├── index.ts                  # Fastify 服务入口
    ├── app.ts                    # 路由、限流、静态托管
    └── mcp.ts                    # MCP SDK 客户端 + 6 个白名单工具
```

## 核心状态机

```
[BOOT] → [TITLE] → [SELECT_CAR] → [LOADING_MCP] → [COUNTDOWN]
                                                       ↓
                                                   [GAME_LOOP]
                                                   ↙        ↘
                                             [DRIVING]    [SHOP]
                                             (战斗中)    (得来速商店)
                                                   ↘        ↙
                                                   [GAME_LOOP]
                                                       ↓
                                                 (车况归零)
                                                       ↓
                                                   [GAME_OVER]
                                                       ↓
                                                   [RESULT]
                                                   ↙      ↘
                                           [SELECT_CAR]  [TITLE]
```

每个状态对应一个 Phaser Scene。状态切换由 `this.scene.start('SceneName', data)` 驱动。

## 性能关键约束

### 1. 固定时间步长物理

```typescript
// 物理更新固定 60Hz，与渲染帧率解耦
const FIXED_DT = 1 / 60; // 16.66ms
let accumulator = 0;

update(time: number, delta: number) {
  accumulator += delta / 1000;
  while (accumulator >= FIXED_DT) {
    this.fixedUpdate(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  // 渲染使用插值位置
  const alpha = accumulator / FIXED_DT;
  this.renderInterpolated(alpha);
}
```

### 2. 对象池（零运行时 GC）

```typescript
// 所有频繁创建/销毁的对象必须使用对象池
class ObjectPool<T> {
  private pool: T[] = [];
  private active: Set<T> = new Set();

  constructor(
    private factory: () => T,
    private reset: (obj: T) => void,
    initialSize: number
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T | null { /* 从池中取出 */ }
  release(obj: T): void { /* 归还到池中 */ }
}

// 推荐预分配量：
// 弹丸池：200 个
// 敌人池：100 个
// 粒子池：500 个
// 掉落物池：50 个
// 伤害数字池：30 个
```

### 3. 碰撞检测优化

- 使用 **空间哈希** 或 **四叉树** 进行粗筛
- 弹丸与敌人的碰撞：先做 AABB 粗检测，再做圆-矩形精检测
- 同帧内同一弹丸只处理一次碰撞（穿透类武器除外）

### 4. 渲染优化

- 目标：同屏 50+ 敌人 + 100+ 弹丸 + 200+ 粒子，稳定 60 FPS
- Phaser WebGL 批渲染：相同纹理的精灵自动合并 draw call
- 屏幕外的实体跳过渲染（但保留物理更新）
- 粒子使用 Phaser 内建粒子系统（GPU 加速）

## 音效系统（Web Audio API，零文件）

```typescript
// 所有音效通过浏览器 AudioContext 实时合成
const ctx = new AudioContext();

// 引擎音（持续播放，频率随速度变化）
function engineSound(speed: number) {
  const freq = 80 + speed * 120; // 80Hz 怠速 → 200Hz 全速
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
}

// 射击音（方波快速衰减）
function shootSound() {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 440;
  // 10ms 快速衰减包络
}

// 爆炸音（白噪声 + 指数衰减）
function explosionSound() {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  // 填充白噪声 + 指数衰减包络
}
```

完整音效清单：

| 音效 | 合成方式 | 参数 |
|------|----------|------|
| 引擎轰鸣 | 正弦波振荡器 | 80-200Hz 随速度映射，持续播放 |
| 漂移轮胎 | 白噪声 + 低通滤波器 | 截止频率随横向滑移速度变化 |
| 射击 | 方波 + 快速衰减 | 440Hz，10ms 衰减 |
| 爆炸 | 白噪声 + 指数衰减 | 200ms 衰减 |
| 金币收集 | 正弦波滑音 | 880Hz→1760Hz，50ms |
| 购买确认 | 三和弦琶音 | C-E-G 上行，各 80ms |
| 受伤 | 锯齿波下行 + 低通 | 200Hz 下行至 80Hz |
| 倒计时 | 正弦波 | 440→880→440→880→1320Hz |
| 波次提示 | 和弦 | 523-659-784Hz 同时 |

## 存档与恢复

- 使用 `localStorage` 保存当前对局状态
- 存档键名：`drive-thru-survivors-save-v1`
- 存档内容：
  - 当前波次、距离、金币
  - 车况、氮气
  - 已装备的 6 个武器（类型 + 等级）
  - MCP 快照数据（开局固定）
  - 随机种子
- 使用 Zod Schema 做反序列化校验
- 刷新页面后检测存档，提供"继续"或"新游戏"选择

## 响应式与移动端

- 游戏画布自适应屏幕尺寸（Phaser Scale Manager: `FIT` 模式）
- 支持横屏和竖屏（推荐竖屏，赛道纵向滚动天然适配）
- 手机触摸输入：虚拟摇杆/方向按钮 + 漂移按钮 + 冲刺按钮
- 按钮尺寸 ≥ 48×48 CSS px，冲刺按钮 64-72 px
- 切后台自动暂停（`visibilitychange` 事件）
- 暂停时保存状态
