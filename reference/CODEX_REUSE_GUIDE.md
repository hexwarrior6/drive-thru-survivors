# 🔄 代码与资产复用指南 · From codex-6.1-sol

> 现有项目地址：`/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol`
> 该代码库在 MCP 安全网关、原创 SVG 视觉坐标、暖色调 CSS 体系和 Web Audio 程序化音效上有着极高水准的成熟实现。
> 编程 Agent 在开发《Drive-Thru Survivors》时，应当**优先提取与搬迁现有成熟模块**，杜绝重复发明轮子。

---

## 1. 麦当劳 MCP 服务端只读网关（直接搬迁）

### 来源文件
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/server/src/mcp.ts`
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/server/src/app.ts`
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/packages/shared/src/index.ts`

### 可复用核心逻辑
1. **MCP SDK 客户端连接**：Streamable HTTP 连接官方服务端 `https://mcp.mcd.cn` 的完整配置。
2. **6 项工具白名单过滤机制**：
   - `query-nearby-stores`：得来速门店（`beType: 5`）候选查找。
   - `query-meals`：在售餐品拉取。
   - `query-meal-detail`：自动过滤组合定制与多轮次套餐，只保留清晰单品。
   - `calculate-price`：为每一个单品发起真实计价，提取最终整数分报价（`price`）。
   - `campaign-calendar`：查询当日官方活动标题。
   - `query-store-coupons`：仅提取优惠标题用于展示。
3. **夜间打烊优雅处理**：
   - 提取 `reservationTimeOptions` 中包含第二天 12:00 午餐的时段，安全拉取预约菜单参考，杜绝夜间测试菜单空白。
4. **限流与快照缓存**：
   - LRU 15 分钟内存快照缓存。
   - 并发请求 Promise 合并（`pending.get(key)`），杜绝瞬时高并发击穿。
5. **完全脱敏的 `demoSnapshot()`**：
   - 内置 4 家得来速与 6 款经典单品（巨无霸、麦辣鸡腿堡、薯条、麦乐鸡、咖啡、柠檬红茶）的自包含测试数据。

---

## 2. 视觉矢量资产与精灵坐标（提取绘制）

### 来源文件
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/web/src/components/Board.vue`
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/web/src/components/ArtIcon.vue`
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/web/src/components/FoodArt.vue`

### 提取与迁移方式
无需引入任何外部 SVG 文件，可直接将 Vue 组件中的 SVG 矢量坐标路径转译为 Phaser Graphics API / Canvas 绘制命令：

1. **赛车（#raceCar）**：
   - 车身轮廓：圆角矩形 (`rx="8" ry="8"`)，主色 `#e75239`（活力橙红），描边 `#754329`。
   - 4 轮布局：独立黑色小矩形，坐标对称分布在四角。
   - 前大灯与挡风玻璃透光度参数。
2. **麦当劳得来速门店（#cafe）**：
   - 红顶遮雨棚、金黄色立面双拱门 M 标、得来速取餐小窗、薄荷色防风玻璃。可作为路边停靠点与商店过场景物。
3. **环境植被与建筑（#roundTree & #building）**：
   - 双层半球冠圆树与积木楼立体阴影的几何坐标。
4. **餐品大图标（FoodArt.vue）**：
   - 汉堡、麦辣鸡腿堡、中薯条盒、麦乐鸡块盒、咖啡纸杯、冷饮杯的矢量绘制参数，可直接用于在 Phaser BootScene 中程序化烘焙成商店界面的 UI 精灵纹理。

---

## 3. Web Audio 程序化音效合成算法（无文件依赖）

### 来源文件
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/web/src/game/sound.ts`

### 现有算法与扩展建议
旧版使用纯原生 `AudioContext` 振荡器实现了免音频文件的音效合成，新版只需在此基础上进行扩展：

```typescript
// 1. 现有成熟实现：
// - 点击反馈 (tap): 440Hz 正弦波 80ms 快速衰减
// - 完美达成 (perfect): 四和弦快速琶音 (523Hz, 659Hz, 784Hz, 1047Hz)
// - 获得奖励 (reward): 659Hz -> 880Hz 双音级跳跃
// - 冲线完成 (finish): 欢庆五和弦

// 2. 新增驾驶与战斗合成逻辑：
// - 引擎运转：持续正弦波，随车速从 80Hz 平滑 lerp 到 220Hz
// - 漂移胎噪：通过 createBuffer 生成白噪声数组，经过 BiquadFilterNode 低通滤波，随横滑速度调整截止频率
// - 弹丸射击：高频方波（440Hz~880Hz）15ms 指数衰减
// - 爆炸震荡：白噪声脉冲叠加低频正弦波（60Hz）的快速释放包络
```

---

## 4. 样式规范与色彩体系

### 来源文件
- `/Users/zhuyuhao/ZYHCodeSpace/McPitstop/codex-6.1-sol/apps/web/src/styles/play.css`

### 核心调色板（直接引入代码常量）
```typescript
export const GAME_PALETTE = {
  bg: '#fcf3d9',            // 暖奶油黄底色
  panel: '#fff9e8',         // 商店面板底色
  panelBorder: '#754329',   // 棕色轮廓描边
  textDark: '#354e3c',      // 深森林绿主文字
  playerCar: '#e75239',     // 玩家赛车红
  mcdonaldsYellow: '#ffcf52', // 金拱门金黄
  grass: '#bed994',         // 草地绿
  asphalt: '#5c6564',       // 沥青路面深灰
  laneMarker: '#e9dfc1',    // 虚线路标浅黄
  iceBlue: '#80c6c3',       // 冰冻/饮品天青蓝
  hazardRed: '#d93025',     // 受伤/危险红
};
```
