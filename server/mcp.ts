/** Read-only MCP pipeline adapted from McPitstop/codex-6.1-sol. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { discoveryScore, normalizeProductName } from '../src/data/menuDiscovery.js';
import { categories, snapshotSchema, type Category, type Snapshot, type Store } from '../src/data/snapshot.js';

export const allowedTools = ['query-nearby-stores','query-meals','query-meal-detail','calculate-price','campaign-calendar','query-store-coupons'] as const;
type Tool = typeof allowedTools[number];
export type McpCall = (name: Tool, args: Record<string, unknown>) => Promise<any>;
export class DataError extends Error { constructor(public status: number, message: string) { super(message); } }
export function unwrap(result: any): any {
  if(result.isError) throw new DataError(502,'官方查询未成功，请稍后重试。');
  let value=result.structuredContent;
  if(!value){const text=(result.content??[]).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');try{value=JSON.parse(text);}catch{throw new DataError(502,'官方返回了无法解析的数据。');}}
  if(value.success===false || (value.code!==undefined&&value.code!==200&&value.code!=='200'&&value.code!==0))throw new DataError(502,'官方服务当前无法提供该地区数据，请换区域或稍后重试。');
  return value.data??value;
}
export async function withMcp<T>(token: string, run: (call:McpCall)=>Promise<T>): Promise<T> {
  const client=new Client({name:'McPitstop-readonly',version:'1.0.0'},{capabilities:{}});
  const transport=new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}, reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
  const abort=new AbortController();const deadline=setTimeout(()=>abort.abort(),55000);
  try {
    await client.connect(transport,{timeout:8000,signal:abort.signal});
    const listed=await client.listTools(undefined,{timeout:8000,signal:abort.signal});const names=new Set(listed.tools.map(t=>t.name));
    const call:McpCall=async(name,args)=>{
      if(!allowedTools.includes(name)||!names.has(name))throw new DataError(502,`官方服务当前不支持 ${name}。`);
      let last:unknown;
      for(let attempt=0;attempt<2;attempt++)try{return unwrap(await client.callTool({name,arguments:args},undefined,{timeout:8000,signal:abort.signal}));}catch(error){last=error;if(abort.signal.aborted||error instanceof DataError||/401|403|429/.test(String(error)))break;}
      throw last;
    };
    return await run(call);
  } finally {clearTimeout(deadline);await client.close().catch(()=>{});}
}
export function classify(name:string):Category|undefined {
  if(/套餐|组合|件套|分享|双全盒|双人|三人|随心配|全家|桶|买一|第二|券|金卡|加料/.test(name))return;
  if(/巨无霸|麦香鸡|麦香鱼|堡|卷|麦满分|帕尼尼/.test(name))return 'main';
  if(/甜筒|圆筒|圣代|冰淇淋|麦旋风/.test(name))return 'side';
  if(/麦乐鸡|扭扭薯|薯饼|芝士条|苹果片|薯条|鸡块|鸡翅|鸡腿|脆汁鸡|派$/.test(name))return 'side';
  if(/可乐|雪碧|芬达|柠檬|茶|咖啡|卡布奇诺|奶铁|拿铁|美式|牛奶|豆浆|果汁|麦炫酷|美汁源|纯悦|怡泉/.test(name))return 'drink';
}
export async function buildSnapshot(call:McpCall,city:string,keyword:string):Promise<Snapshot>{
  const nearby=await call('query-nearby-stores',{beType:5,searchType:2,city,keyword:keyword || city});
  if(!Array.isArray(nearby))throw new DataError(502,'门店数据格式有误。');
  // A closed shop can supply an explicitly labelled future menu snapshot, never
  // an invented opening status. No reservation or order is created.
  const candidates=nearby.filter(s=>s.storeCode&&s.beCode&&s.storeName).map(s=>{
    if(s.businessStatus!==false)return {...s,referenceTime:undefined};
    const option=s.reservation===true?s.reservationTimeOptions?.find((o:any)=>{const match=String(o.reservationOptionText).match(/午餐[（(](\d{2}:\d{2})至(\d{2}:\d{2})[)）]/);return typeof o.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(o.date)&&match&&match[1]<='12:00'&&match[2]>='12:00';}):undefined;
    return option?{...s,referenceTime:`${option.date} 12:00`}:null;
  }).filter(s=>s!==null);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  // Preload a small random route pool, not a city-wide directory. Prefer currently open shops.
  candidates.sort((a,b)=>Number(!!a.referenceTime)-Number(!!b.referenceTime));
  candidates.splice(4);
  if (!candidates.length) throw new DataError(422, '该区域未找到可用得来速门店，请更换区域。');
  // Read each complete menu first so differences never mean "omitted by our price filter".
  const menus = await Promise.allSettled(candidates.map(async s => {
    const args = { storeCode: String(s.storeCode), beCode: String(s.beCode), orderType: 1, beType: 5,
      ...(s.referenceTime ? { reservationDate: s.referenceTime } : {}) };
    const menu = await call('query-meals', args);
    const entries = (Object.entries(menu.meals ?? {}) as [string, any][])
      .filter(([,m]) => typeof m.name === 'string' && classify(m.name) && !/随单购|卡优惠/.test(m.discountType ?? ''));
    return { s, args, entries, names: new Set(entries.map(([,m]) => normalizeProductName(m.name))) };
  }));
  const loaded = menus.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const resolved = await Promise.allSettled(loaded.map(async ({s,args,entries}): Promise<Store> => {
    const ranked = entries.map(([code,m]) => ({ code, m, category: classify(m.name)!,
      menuPresence: { stores: loaded.filter(menu => menu.names.has(normalizeProductName(m.name))).length, compared: loaded.length } }))
      .sort((a,b) => discoveryScore({ ...b.m, menuPresence: b.menuPresence }) - discoveryScore({ ...a.m, menuPresence: a.menuPresence }));
    // A bounded, diverse quote list keeps startup within the official MCP deadline.
    const selected = ranked.slice(0, 15);
    for (const category of categories) {
      const baseline = ranked.find(p => p.category === category);
      if (baseline && !selected.includes(baseline)) selected.push(baseline);
    }
    const products = await Promise.allSettled(selected.map(async ({code,m,category,menuPresence}) => {
      const detail = await call('query-meal-detail', {...args,code});
      if (detail.rounds?.length) throw new DataError(422, '忽略未支持的套餐商品。');
      const quote = await call('calculate-price', {...args,needTableware:false,items:[{productCode:code,quantity:1}]});
      if (!Number.isInteger(quote.price) || quote.price <= 0) throw new DataError(422, '商品缺少有效报价。');
      return {id:code,name:String(m.name),category,price:quote.price,menuPresence};
    }));
    const available = products.flatMap(p => p.status === 'fulfilled' ? [p.value] : []);
    if (available.length < 3) throw new DataError(422, '门店可核价单品不足 3 款。');
    return {id:String(s.storeCode),name:String(s.storeName),address:String(s.address??''),driveThru:true,
      products:available,referenceTime:s.referenceTime,
      source:`麦当劳官方 MCP · 单件最终报价${s.referenceTime ? ' · 预约菜单参考 '+s.referenceTime : ' · 当前菜单'}`};
  }));
  const stores = resolved.flatMap(s => s.status === 'fulfilled' ? [s.value] : []);
  if (!stores.length) throw new DataError(422, '门店有效单品或报价不足，请更换区域或稍后重试。');
  let campaign='城市补给挑战 · 游戏主题（本次无有效官方活动）';
  const coupons:Snapshot['coupons']=[];
  const extras=await Promise.allSettled([call('campaign-calendar',{specifiedDate:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})}),call('query-store-coupons',{storeCode:stores[0]!.id,beCode:String(candidates.find(s=>String(s.storeCode)===stores[0]!.id)!.beCode),orderType:1,beType:5})]);
  if(extras[0]!.status==='fulfilled'){const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});const day=extras[0]!.value.dailyList?.find((d:any)=>d.date===today);const title=day?.events?.find((e:any)=>e.activityTitle)?.activityTitle;if(typeof title==='string')campaign=`${today} · ${title}`;}
  if(extras[1]!.status==='fulfilled'&&Array.isArray(extras[1]!.value))for(const c of extras[1]!.value.slice(0,5))if(typeof c.title==='string')coupons.push({title:c.title,description:'账号相关权益，仅作信息展示；不参与公平对局，不领取或核销。'});
  return snapshotSchema.parse({mode:'live',city,fetchedAt:new Date().toISOString(),stores,campaign,coupons,notes:['真实得来速门店、商品与单件报价来自官方 MCP；购买只扣游戏金币。菜单差异仅比较本次读取的候选门店，不代表门店独家。每店展示最多 18 款已核价单品，非完整菜单。','每件商品使用独立报价，不代表真实组合订单价格。个人优惠不参与对局。',...(stores.some(s=>s.referenceTime)?['部分门店已打烊，使用官方提供的下一个可用午餐时段菜单作游戏参考，未创建预约。']:[]),... (categories.every(c=>stores.some(s=>s.products.some(p=>p.category===c)))?[]:['本次仅对已验证可用类别生成任务。'])]});
}
