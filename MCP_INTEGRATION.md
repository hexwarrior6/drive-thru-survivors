# MCP_INTEGRATION.md · 麦当劳 MCP 集成说明

> 本文件说明本项目**实际使用**的麦当劳 MCP Server、工具、调用流程与业务价值（参赛要求文件）。
> 完整技术规范见 [docs/MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md)。

## 一、使用的 MCP Server

| 项 | 值 |
|---|---|
| Server | 麦当劳中国官方 MCP `https://mcp.mcd.cn` |
| 协议 | Streamable HTTP + Bearer Token（`@modelcontextprotocol/sdk` 官方 SDK） |
| Token | 于 open.mcd.cn/mcp 控制台激活获取，仅存服务端 `.env`（变量 `MCDONALDS_MCP_TOKEN`） |

## 二、调用架构

```
前端游戏 (Vite: 5173)
    │  fetch('/api/snapshot?city=上海')   ← 前端唯一数据入口
    ↓
只读网关 (Hono: 3002, server/index.ts + server/app.ts)
    │  MCP SDK + Bearer Token，严格 6 工具白名单
    ↓
麦当劳官方 MCP (https://mcp.mcd.cn)
```

本地与线上共用同一个 Hono 网关（`server/app.ts`）：本地由 `@hono/node-server` 常驻 3002 端口，线上以 Web 标准具名方法导出（`export const GET`）直接运行 `app.fetch`（`api/index.ts`，零适配器），两端共享 `server/mcp.ts` 管线。

前端没有任何直连 MCP 或调用任意工具的通道；网关对所有非白名单调用直接抛错阻断。

## 三、实际调用的工具（6 个，全部只读）

| 工具 | 关键参数 | 调用时机 | 业务用途 |
|---|---|---|---|
| `query-nearby-stores` | `beType: 5`（得来速） | 开局按城市检索 | 真实得来速门店建立赛道站点池，随机预载最多 4 家有效店 |
| `query-meals` | `storeCode` / `beCode` | 每家候选店 | 拉取在售菜单，生成车载武器候选 |
| `query-meal-detail` | `code` | 每款候选单品 | 检查 `rounds` 字段，自动排除未拆解的套餐与组合定制商品 |
| `calculate-price` | `productCode × 1` | 过滤后单品 | **游戏内唯一价格来源**：整数分真实计价 → 游戏金币价 |
| `campaign-calendar` | `specifiedDate`（Asia/Shanghai） | 开局一次 | 当日品牌官方活动 → 注入对局作为波次主题 |
| `query-store-coupons` | `orderType: 1` | 开局一次 | 真实优惠券标题 → 商店「本站特惠 9 折」 |

## 四、调用流程

点击「发动引擎」时按城市一次性构建 `GameSnapshot`，整局固定，局内零网络依赖：

1. `query-nearby-stores` 按城市检索得来速（`beType=5`），优先营业中门店
2. 随机预载最多 4 家有效店的 `query-meals` 菜单
3. 逐款 `query-meal-detail`，含 `rounds` 的套餐/组合剔除，只留纯单品
4. `calculate-price` 对入围单品真实计价，取整数分；游戏金币价 = `ceil(分 / 100)`
5. `campaign-calendar` 查询当日活动，有则作为波次主题（金秋 / 节日 / 冰雪）
6. `query-store-coupons` 读取门店优惠券标题，驱动商店折扣
7. 快照剥离敏感字段（`couponCode`、`couponId` 等）后经 `/api/snapshot` 返回前端

可靠性设计：8 秒单工具 / 55 秒整体构建超时、15 分钟 LRU 缓存、并发请求合并、限流；查询失败或未配置 Token 时降级为示例数据，并在前端明确标注离线示例。

## 五、业务价值

- **真实门店 → 赛道站点**：HUD 与商店显示真实得来速店名与地址，下一站去哪家由官方数据决定
- **真实单品 → 车载武器**：汉堡炮台、薯条散射枪、鸡块地雷、可乐喷泉等映射自门店真实在售单品，每站 3 款差异推荐
- **真实计价 → 游戏经济**：金币价直接来自 `calculate-price`，不同城市/门店的真实价格差异成为玩法策略变量
- **真实活动/优惠券 → 玩法变量**：官方活动日历变波次主题，真实优惠券变商店折扣，游戏内容随现实数据变化

## 六、安全边界

- Token 仅存服务端 `.env`，禁止 `VITE_` 前缀（防止 Vite 注入前端），仓库内只有 `.env.example` 占位符
- 只读 6 工具白名单，非白名单调用直接抛错；**绝不调用领券、核销、下单等写操作接口**
- 返回前端的数据已剥离 `couponCode`、`couponId` 等敏感信息

## 七、本地运行

```bash
npm install
cp .env.example .env    # 可选：填入 MCDONALDS_MCP_TOKEN；无 Token 自动走示例数据
npm run dev             # 前端 http://127.0.0.1:5173
npm run dev:server      # 只读网关 http://127.0.0.1:3002（/api/health、/api/status）
npm test                # 74 项自动测试，含 MCP 白名单与快照降级检查
```

线上部署：见 [README.md](README.md)「在线部署（Vercel）」——同一套网关代码经 `api/index.ts` 胶水函数原样上云，Token 配置在 Vercel 环境变量。
