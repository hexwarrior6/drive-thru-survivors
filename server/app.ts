import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { DataError, withMcp, buildSnapshot, type McpCall } from './mcp.js';
import { demoSnapshot, type Snapshot } from '../src/data/snapshot';

export function createApp(token='', testCall?:McpCall){
  const app=Fastify({logger:false,bodyLimit:4096});
  const cache=new Map<string,{expires:number;data:Snapshot}>();const pending=new Map<string,Promise<Snapshot>>();
  app.register(rateLimit,{max:30,timeWindow:'1 minute'});
  // Install routes only after the rate-limit plugin has registered onRoute.
  app.after(()=>{
  app.get('/api/health',async()=>({ok:true}));
  app.get('/api/status',async()=>({configured:!!token,source:'麦当劳官方 MCP',readonly:true}));
  app.get('/api/snapshot',{config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(request,reply)=>{
    const query=z.object({city:z.string().trim().min(1).max(20).default('上海'),area:z.string().trim().max(40).default('')}).safeParse(request.query);
    if(!query.success)return reply.code(400).send({error:'请输入 1–20 字的城市名；区域名称最多 40 字。'});
    if(!token&&!testCall)return demoSnapshot(query.data.city);
    const key=`${query.data.city}:${query.data.area}`;const hit=cache.get(key);if(hit&&hit.expires>Date.now()){cache.delete(key);cache.set(key,hit);return hit.data;}
    try {
      let promise=pending.get(key);
      if(!promise){promise=testCall?buildSnapshot(testCall,query.data.city,query.data.area):withMcp(token,call=>buildSnapshot(call,query.data.city,query.data.area));pending.set(key,promise);}
      const data=await promise;cache.set(key,{expires:Date.now()+15*60*1000,data});if(cache.size>20)cache.delete(cache.keys().next().value!);return data;
    }catch(error){if(error instanceof DataError)return reply.code(error.status).send({error:error.message});return reply.code(502).send({error:'MCP 连接失败或查询超时。请检查服务端配置、稍后重试，或选择示例试玩。'});}finally{pending.delete(key);}
  });
  });
  app.setErrorHandler((error,_request,reply)=>{const limited=typeof error==='object'&&error!==null&&'statusCode' in error&&error.statusCode===429;return reply.code(limited?429:500).send({error:limited?'请求过于频繁，请一分钟后重试。':'服务暂时不可用，请稍后重试。'});});
  return app;
}
