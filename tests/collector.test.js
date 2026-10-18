import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSnapshot} from '../src/collector.js';

async function run({pages,buttons=[],status=200,origin='https://preview.duolingo.com',cookie=true,invalidJSON=false}){
  const old={location:globalThis.location,document:globalThis.document,fetch:globalThis.fetch};
  const token=`test.${Buffer.from(JSON.stringify({sub:99})).toString('base64url')}.test`;
  const calls=[];
  globalThis.location=new URL(`${origin}/profile/tester`);
  globalThis.document={cookie:cookie?`jwt_token=${token}`:'',querySelectorAll:()=>buttons.map(textContent=>({textContent}))};
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.method,'GET');assert.equal(new URL(url).origin,origin);
    calls.push(url);
    const kind=new URL(url).pathname.split('/').at(-1);
    const data=kind==='99'?{id:99,username:'tester',name:'测试用户'}:pages(kind,new URL(url).searchParams,calls);
    return {ok:status===200,status,json:async()=>{if(invalidJSON)throw new Error('raw-secret-response');return data;}};
  };
  try{return {result:await collectSnapshot(),calls,token};}
  finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}
const user=id=>({userId:id,displayName:`用户${id}`,username:`user${id}`});
test('short first page still follows cursor, and both lists are read twice',async()=>{
  const {result,calls,token}=await run({pages:(kind,params)=>({[kind]:params.has('pageAfter')?{users:[user(2)],cursor:null}:{users:[user(1)],cursor:'next'}}),buttons:['2 Following','2 Followers']});
  assert.equal(result.ok,true);assert.equal(result.snapshot.following.length,2);assert.equal(calls.length,9);
  assert.equal(JSON.stringify(result).includes(token),false);
});
test('malformed final page cannot become a successful empty list',async()=>{
  const {result}=await run({pages:kind=>({[kind]:{users:[]}})});
  assert.equal(result.ok,false);assert.match(result.error,/格式/);
});
test('cursor loops and repeated entries fail closed',async()=>{
  const {result}=await run({pages:kind=>({[kind]:{users:[user(1)],cursor:'same'}})});
  assert.equal(result.ok,false);assert.match(result.error,/重复/);
});
test('changing membership during verification cannot replace history',async()=>{
  const seen={following:0,followers:0};
  const {result}=await run({pages:kind=>({[kind]:{users:[user(++seen[kind])],cursor:null}})});
  assert.equal(result.ok,false);assert.match(result.error,/发生变化/);
});
test('displayed profile count guards against consistently truncated lists',async()=>{
  const {result}=await run({pages:kind=>({[kind]:{users:[user(1)],cursor:null}}),buttons:['2 Following','1 Followers']});
  assert.equal(result.ok,false);assert.match(result.error,/计数不一致/);
});
test('empty but complete lists are valid',async()=>{
  const {result}=await run({pages:kind=>({[kind]:{users:[],cursor:null}}),buttons:['0 Following','0 Followers']});
  assert.equal(result.ok,true);assert.deepEqual(result.snapshot.followers,[]);
});
test('authentication and rate limiting do not expose request details',async()=>{
  for(const status of [401,403,429]){
    const {result,token}=await run({pages:()=>({}),status});
    assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes(token),false);
  }
});
test('non-Duolingo pages and missing sessions make no requests',async()=>{
  for(const input of [{origin:'https://example.org'},{cookie:false}]){
    const {result,calls}=await run({pages:()=>({}),...input});
    assert.equal(result.ok,false);assert.equal(calls.length,0);
  }
});
test('unexpected server response is never included in the error',async()=>{
  const {result}=await run({pages:()=>({}),invalidJSON:true});
  assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('raw-secret'),false);
});
