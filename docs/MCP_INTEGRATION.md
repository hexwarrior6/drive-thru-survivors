# 🍔 MCP 集成规范 · Drive-Thru Survivors

> 本文档定义了麦当劳 MCP（Model Context Protocol）在游戏中的接入方式、安全边界和数据使用规则。
> 核心逻辑可直接复用 codex-6.1-sol 的 `apps/server/src/mcp.ts`。

## 架构概述

```
前端游戏 (Vite: 5173)
    │
    │  fetch('/api/snapshot?city=上海&area=人民广场')
    │  fetch('/api/status')
    │  fetch('/api/health')
    ↓
服务端网关 (Fastify: 3002)
    │
    │  MCP SDK + Bearer Token
    │  只允许 6 个白名单工具
    ↓
麦当劳官方 MCP (https://mcp.mcd.cn)
```

**安全铁律：**

- Token 仅存于服务端 `.env` 文件（变量名 `MCDONALDS_MCP_TOKEN`）
- 禁止使用 `VITE_` 前缀（防止 Vite 注入前端）
- 前端没有任何调用任意 MCP 工具的接口
- 返回前端的数据已剥离所有敏感信息（couponCode、couponId 等）

## 6 个白名单 MCP 工具

服务端严格限制只调用以下 6 个工具，非白名单调用直接抛错阻断。

### 1. `query-nearby-stores`

```typescript
参数: { beType: 5, searchType: 2, city: string, keyword: string }
```

- 检索具有得来速（`beType: 5`）属性的候选门店
- 获取 `storeCode`、`beCode`、`storeName` 和地址
- 用途：建立赛道站点候选池

### 2. `query-meals`

```typescript
参数: { storeCode, beCode, orderType: 1, beType: 5, reservationDate?: string }
```

- 拉取门店在售菜单商品列表
- 用途：生成商店可售武器候选

### 3. `query-meal-detail`

```typescript
参数: { storeCode, beCode, code: string }
```

- 检查商品是否包含套餐轮次（`detail.rounds?.length`）
- **自动排除**所有未拆解的套餐与组合定制商品
- 确保入库的都是具备明确单一类别的纯单品

### 4. `calculate-price`

```typescript
参数: { storeCode, beCode, needTableware: false, items: [{ productCode, quantity: 1 }] }
```

- 对选定单品发起**真实计价**
- 菜单显示价与结算报价单位不一致，只取此接口的最终 `price`（整数分 Cents）
- 这是游戏内唯一的价格来源

### 5. `campaign-calendar`

```typescript
参数: { specifiedDate: "YYYY-MM-DD" } // Asia/Shanghai
```

- 查询当天是否存在品牌官方活动
- 有活动：`activityTitle` 注入对局作为波次主题
- 无活动：降级为游戏虚构主题

### 6. `query-store-coupons`

```typescript
参数: { storeCode, beCode, orderType: 1, beType: 5 }
```

- 仅读取优惠券标题与描述
- 前端展示为参考信息
- **绝不调用领券、核销或下单接口**

## 游戏快照（Snapshot）数据结构

开局时一次性构建，整局固定使用，局内零网络依赖。

```typescript
interface GameSnapshot {
  mode: 'live' | 'demo';              // 真实数据 or 示例数据
  createdAt: string;                   // ISO 8601 创建时间
  referenceTime?: string;             // 如使用预约菜单，标注参考时间
  city: string;
  area: string;
  campaign?: {                         // 当日活动（如有）
    title: string;
    date: string;
  };
  stores: Store[];                     // 1-5 家得来速门店
  products: Product[];                 // 已验证的单品列表
}

interface Store {
  storeCode: string;
  beCode: string;
  name: string;                        // 门店名（用于赛道站点命名）
  address: string;
}

interface Product {
  code: string;
  name: string;                        // MCP 返回的真实商品名
  category: 'burger' | 'side' | 'drink' | 'coffee' | 'dessert' | 'other';
  priceCents: number;                  // calculate-price 返回的整数分报价
  storeCode: string;                   // 来源门店
  imageHint?: string;                  // 可选：用于 UI 图标选择的提示
}
```

## 餐品 → 武器映射

```typescript
// 映射规则（在 weaponMapper.ts 中实现）
function mapProductToWeapon(product: Product): WeaponType {
  switch (product.category) {
    case 'burger':
      // 汉堡类 → 高伤害直线类武器
      return pickBurgerWeapon(product);
    case 'side':
      // 薯条/小食类 → 散射/范围/地雷类武器
      return pickSideWeapon(product);
    case 'drink':
      // 饮品类 → 控制/防御类武器
      return pickDrinkWeapon(product);
    case 'coffee':
      // 咖啡类 → 被动增益类（加速等）
      return pickCoffeeWeapon(product);
    case 'dessert':
      // 甜品类 → 被动回复类
      return pickDessertWeapon(product);
    default:
      // 未分类 → 基础直线射击
      return DEFAULT_WEAPON;
  }
}
```

每个类别内可以有多种武器变体，由商品名关键词匹配决定具体变体。详见 [WEAPONS_CATALOG.md](WEAPONS_CATALOG.md)。

## 夜间/打烊处理

- 麦当劳得来速门店夜间通常打烊（`businessStatus === false`）
- 实现"预约菜单参考"逻辑：
  1. 检查 `reservationTimeOptions`
  2. 提取包含第二天午餐（`12:00`）的时段
  3. 携带 `reservationDate: "YYYY-MM-DD 12:00"` 查询菜单
  4. 在快照中标注"预约菜单参考时间"
- **绝不进行真实预约或下单操作**
- 若无可用得来速门店，或没有任何门店能提供至少 3 款已核价单品：返回 422 错误，引导用户切换区域或进入示例模式；只有 1 家有效店也可开始游戏

## 缓存与限流

| 策略 | 配置 |
|------|------|
| 快照缓存 | 按 `city:area` 内存缓存 15 分钟，LRU 上限 20 |
| 全局限流 | 30 次/分钟 |
| 快照接口限流 | 6 次/分钟 |
| 并发合并 | 同区域同时请求做 Promise 合并 |
| 单次超时 | 8 秒 |
| 总构建超时 | 55 秒 |
| 重试策略 | 仅瞬时错误最多重试 1 次 |

## 示例数据模式（Demo Mode）

- `demoSnapshot()` 内置 4 家虚构上海得来速门店 + 6 款典型餐品
- 无网络、无 Token 即可瞬间启动
- 必须明确标注"示例模式"
- 示例数据不能替代失败的真实查询

## 绝对禁止事项

- ❌ 创建订单
- ❌ 真实支付
- ❌ 核销优惠券
- ❌ 领取优惠券
- ❌ 积分兑换
- ❌ 地址管理
- ❌ 抽奖
- ❌ 向前端暴露 Token
- ❌ 向前端发送 couponCode / couponId
- ❌ 在游戏运行中请求 MCP（只在开局构建快照）
- ❌ 伪造不存在的门店或餐品
- ❌ 将游戏能力声明为餐品的真实功能


## 当前实现补充：城市出发与菜单差异

实际复用的快照 wire schema 以 `src/data/snapshot.ts` 为准：餐品位于 `stores[].products`，`id` 对应商品编码、`price` 为最终整数分、`category` 为 main / side / drink。可选 `menuPresence: { stores, compared }` 记录商品名在本次候选菜单中的出现范围。该比较在截取核价名单前进行，不代表全国独家。

开局 UI 仅输入 / 选择城市，也可用骰子从 40 个常用城市中随机选城；不提供手动选店。网关 `city` 接受 1–20 字城市名，省略 `area` 时自动用城市名检索。随机预载最多 4 家有效门店作为本局路线池，不表示全市门店总数；优先营业中门店。前端随机安排首站和后续停靠，访问完路线池后再洗牌，尽量避免连续重复。服务端每店最多尝试 18 款差异 / 风味优先且覆盖各类别的单品，展示通过详情与计价验证的子集；前端保留 3 张推荐卡，并允许展开其余已核价单品。所有选购仍只扣除游戏金币。
