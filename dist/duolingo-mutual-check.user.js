// ==UserScript==
// @name         多邻国 · 互关核对
// @namespace    local.duolingo-mutual-check
// @version      1.0.0
// @author       Redwinam
// @copyright    2026 Redwinam
// @license      CC-BY-NC-SA-4.0
// @homepageURL  https://github.com/Redwinam/duolingo-mutual-check
// @supportURL   https://github.com/Redwinam/duolingo-mutual-check/issues
// @downloadURL  https://raw.githubusercontent.com/Redwinam/duolingo-mutual-check/main/dist/duolingo-mutual-check.user.js
// @updateURL    https://raw.githubusercontent.com/Redwinam/duolingo-mutual-check/main/dist/duolingo-mutual-check.meta.js
// @description  一键核对互关、需要回关及疑似取关，保存本地历史；只读取，不自动关注或取关。
// @match        https://www.duolingo.com/*
// @match        https://preview.duolingo.com/*
// @match        https://duolingo.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function(){
'use strict';
const SOURCE = 'duolingo-web-friends-v1';

function normalizeUser(user) {
  const id = String(user.id ?? user.userId ?? '');
  if (!/^\d+$/.test(id)) throw new Error('名单中缺少有效账号 ID，未保存本次结果。');
  return {
    id,
    name: String(user.name ?? user.displayName ?? user.username ?? id).slice(0,200),
    username: String(user.username ?? '').slice(0,200)
  };
}

function normalizeSnapshot(raw) {
  if (raw?.schema !== 1 || raw.source !== SOURCE || raw.complete !== true) {
    throw new Error('名单未完整读取，未保存本次结果。');
  }
  if (!Number.isFinite(Date.parse(raw.capturedAt))) throw new Error('快照时间无效。');
  const account = normalizeUser(raw.account);
  const lists = {};
  for (const key of ['following', 'followers']) {
    if (!Array.isArray(raw[key])) throw new Error('名单格式发生变化，请更新工具。');
    const entries = raw[key].map(normalizeUser);
    if (new Set(entries.map(u=>u.id)).size !== entries.length) throw new Error('名单出现重复 ID，未保存本次结果。');
    lists[key] = entries;
  }
  return {schema:1, source:SOURCE, complete:true, capturedAt:raw.capturedAt, account, ...lists};
}

function compare(current, previous = null) {
  const now = normalizeSnapshot(current);
  const old = previous ? normalizeSnapshot(previous) : null;
  if (old && (old.account.id !== now.account.id || old.source !== now.source)) {
    throw new Error('不同账号或来源的快照不能互相比较。');
  }
  const difference = (a,b) => {
    const ids = new Set(b.map(u=>u.id));
    return a.filter(u=>!ids.has(u.id)).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  };
  return {
    needFollowBack:difference(now.followers,now.following),
    notFollowingBack:difference(now.following,now.followers),
    newFollowers:old ? difference(now.followers,old.followers) : [],
    lostFollowers:old ? difference(old.followers,now.followers) : [],
    mutual:now.following.length-difference(now.following,now.followers).length,
    hasBaseline:!!old,
    baselineAt:old?.capturedAt ?? null
  };
}

function historyKey(accountId) { return `history:v1:${accountId}`; }

function appendSnapshot(history, snapshot) {
  const latest = normalizeSnapshot(snapshot);
  const previous = history.map(normalizeSnapshot);
  if (previous.some(s=>s.account.id !== latest.account.id || s.source !== latest.source)) {
    throw new Error('历史记录的账号不一致，未覆盖原记录。');
  }
  return [latest,...previous].slice(0,30);
}

// Login data stays inside this function and is never returned to the panel or storage.
async function collectSnapshot() {
  try {
    if (location.protocol !== 'https:' || !['www.duolingo.com','preview.duolingo.com','duolingo.com'].includes(location.hostname)) {
      throw new Error('请先打开已登录的多邻国网页，再点击「互关核对」。');
    }
    const cookie = document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('jwt_token='));
    if (!cookie) throw new Error('未找到网页登录状态，请在多邻国登录后重试。');
    // Reuse the existing session only in memory. Never return, store, or log it.
    const token = decodeURIComponent(cookie.slice('jwt_token='.length));
    let payload;
    try {
      const part = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
    } catch { throw new Error('无法识别当前登录状态，请重新登录多邻国后重试。'); }
    const userId = String(payload.sub ?? '');
    if (!/^\d+$/.test(userId)) throw new Error('无法确认当前登录账号，请重新登录多邻国后重试。');
    const request = async (path, params = {}) => {
      const url = new URL(path,location.origin);
      if (url.origin !== location.origin) throw new Error('请求地址无效。');
      for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
      let response;
      try {
        response = await fetch(url.href, {
          method:'GET', credentials:'same-origin', cache:'no-store', redirect:'error',
          headers:{Accept:'application/json',Authorization:`Bearer ${token}`},
          signal:AbortSignal.timeout(20000)
        });
      } catch { throw new Error('连接超时或网络不可用。本次未保存，请稍后重试。'); }
      if ([401,403].includes(response.status)) throw new Error('登录已失效或名单无权访问，请重新登录后重试。');
      if (response.status === 429) throw new Error('多邻国暂时限制了请求频率，请稍后再试。');
      if (!response.ok) throw new Error(`多邻国读取失败（${response.status}），本次未保存。`);
      try { return await response.json(); }
      catch { throw new Error('多邻国返回了无法识别的数据，本次未保存。'); }
    };
    const profile = await request(`/2023-05-23/users/${userId}`,{fields:'id,username,name'});
    if (String(profile.id) !== userId || !profile.username) throw new Error('无法确认账号资料，本次未保存。');
    const clean = u => {
      const id = String(u.userId ?? u.id ?? '');
      if (!/^\d+$/.test(id)) throw new Error('名单中缺少账号 ID，本次未保存。');
      return {id,name:String(u.displayName ?? u.name ?? u.username ?? id).slice(0,200),username:String(u.username ?? '').slice(0,200)};
    };
    async function readList(kind) {
      const users = new Map(), cursors = new Set();
      let cursor;
      for (let page=0;page<100;page++) {
        const params={pageSize:500,viewerId:userId};
        if (cursor) params.pageAfter=cursor;
        const data=await request(`/2017-06-30/friends/users/${userId}/${kind}`,params);
        const list=data?.[kind];
        if (!list || !Array.isArray(list.users) || !Object.hasOwn(list,'cursor')) {
          throw new Error('名单接口格式发生变化，请更新工具。本次未保存。');
        }
        const before=users.size;
        for (const raw of list.users) {
          const user=clean(raw);
          if (users.has(user.id)) throw new Error('分页名单出现重复账号，请稍后重试。本次未保存。');
          users.set(user.id,user);
        }
        if (list.cursor === null || list.cursor === '') return [...users.values()];
        if (typeof list.cursor !== 'string' || cursors.has(list.cursor) || before===users.size) {
          throw new Error('分页没有正常结束，本次未保存。');
        }
        cursors.add(list.cursor);
        cursor=list.cursor;
      }
      throw new Error('名单超过读取上限，本次未保存。');
    }
    const [following,followers] = await Promise.all([readList('following'),readList('followers')]);
    const [followingAgain,followersAgain] = await Promise.all([readList('following'),readList('followers')]);
    const ids = users=>users.map(u=>u.id).sort().join(',');
    if (ids(following)!==ids(followingAgain) || ids(followers)!==ids(followersAgain)) {
      throw new Error('读取期间名单发生变化，本次未保存，请重新核对。');
    }
    // When the owner profile is visible, compare its displayed counts too.
    const path=location.pathname.split('/').filter(Boolean);
    if (path.length===2 && path[0]==='profile' && decodeURIComponent(path[1]).toLowerCase()===profile.username.toLowerCase()) {
      const buttons=[...document.querySelectorAll('button')].map(el=>(el.textContent||'').trim());
      for (const [word,rows] of [['Following',following],['Followers',followers]]) {
        const match=buttons.map(t=>t.match(new RegExp('^([\\d,]+)\\s+'+word+'$','i'))).find(Boolean);
        if (match && Number(match[1].replace(/,/g,''))!==rows.length) {
          throw new Error('名单条数与当前主页计数不一致。请刷新多邻国页面后重新核对，本次未保存。');
        }
      }
    }
    return {ok:true,snapshot:{schema:1,source:'duolingo-web-friends-v1',complete:true,capturedAt:new Date().toISOString(),account:clean(profile),following,followers}};
  } catch (error) {
    // Only our own short messages leave the page; never serialize request objects.
    return {ok:false,error:error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '无法读取名单。本次未保存，请刷新多邻国页面后重试。'};
  }
}

const PANEL_CSS=":host{color-scheme:light;--ink:#24332c;--muted:#708078;--green:#438b37;--line:#e3e9e1}*{box-sizing:border-box}#shell{margin:0;width:min(760px,calc(100vw - 32px));height:min(630px,calc(100vh - 48px));background:#f8faf5;color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;display:flex;flex-direction:column}header{padding:20px 24px 16px;display:flex;justify-content:space-between;align-items:center}.brand{display:flex;gap:12px;align-items:center}h1{font-size:21px;line-height:1.2;margin:0;font-weight:750;letter-spacing:.4px}.brand p{font-size:12px;color:var(--muted);margin:4px 0 0}button{font:inherit;cursor:pointer;border:1px solid var(--line);border-radius:9px;background:white;color:var(--ink);padding:8px 13px}button:hover{background:#eef5e9}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #8bba67;outline-offset:2px}button:disabled{cursor:wait;opacity:.6}.primary{background:#497f37;color:white;border-color:#497f37;font-weight:650}.primary:hover{background:#3b6e2b}.status{margin:0 24px 14px;padding:10px 13px;border-radius:9px;background:#eaf3e3;color:#426c35;font-size:13px}.status.error{color:#9c462d;background:#fff0e7}.status.busy:before{content:\"\";display:inline-block;width:9px;height:9px;border:2px solid #9bb28d;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px}@keyframes spin{to{transform:rotate(360deg)}}main{padding:0 24px;min-height:0;flex:1;display:flex;flex-direction:column}[hidden]{display:none!important}.summary{display:grid;grid-template-columns:1fr 1fr 1fr 1.65fr;border:1px solid var(--line);border-radius:12px;background:white;padding:14px 0}.summary>div{padding:0 20px;border-right:1px solid var(--line);display:flex;flex-direction:column}.summary>div:last-child{border:0}.summary span{font-size:12px;color:var(--muted)}.summary strong{font-size:27px;font-weight:720;line-height:1.3;margin-top:3px}.time b{font-size:13px;font-weight:550;margin-top:10px}.comparison{display:flex;align-items:center;gap:10px;margin:13px 0;font-size:12px;color:var(--muted)}select{font:inherit;border:1px solid var(--line);border-radius:7px;padding:5px 8px;background:white;color:var(--ink);max-width:310px}.quiet{font-size:12px;padding:5px 10px;margin-left:auto;background:transparent}nav{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;border-bottom:1px solid var(--line);padding-bottom:10px}nav button{font-size:12px;border-color:transparent;background:transparent;padding:8px 7px;white-space:nowrap}nav button b{border-radius:5px;background:#e8ece5;padding:1px 5px;margin-left:3px;font-size:11px}nav button.active{background:#e5efdc;color:#3d6c2a;font-weight:650}nav button.active b{background:#cddfbb}.list-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0}.list-heading p{margin:0;font-size:12px;color:var(--muted)}input{width:165px;min-width:165px;border:1px solid var(--line);border-radius:7px;padding:6px 9px;background:white;font:12px/1.4 inherit}.list{flex:1;overflow:auto;min-height:80px;background:white;border:1px solid var(--line);border-radius:10px}.row{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid #eef1eb}.row:last-child{border-bottom:0}.avatar{width:32px;height:32px;border-radius:50%;background:#eef2e7;color:#6d8756;display:grid;place-items:center;font-weight:650;flex-shrink:0}.identity{min-width:0;flex:1}.identity strong{font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity small{color:var(--muted);font-size:11px}.row a{color:#3d7830;font-size:12px;text-decoration:none;border:1px solid #d7e4cf;border-radius:7px;padding:5px 9px;flex-shrink:0}.row a:hover{background:#f1f7ed}.empty{min-height:130px;display:grid;place-content:center;text-align:center;padding:20px;color:var(--muted);font-size:13px;gap:6px}.empty strong{color:#566c48;font-size:15px;font-weight:600}.note{font-size:11px;line-height:1.5;color:var(--muted);margin:10px 0 0}footer{padding:12px 24px 14px;font-size:11px;color:#879087}\n\n:host{font:14px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:#24332c}#launcher{pointer-events:auto;position:fixed;right:24px;bottom:84px;background:#497f37;color:#fff;border:1px solid #ffffff80;border-radius:999px;box-shadow:0 4px 18px #1d3c2526;padding:11px 18px;font-size:14px;font-weight:650}#launcher:hover{background:#3b6e2b}#backdrop{position:fixed;inset:0;background:#172b2359;display:grid;place-items:center;pointer-events:auto}#shell{border:1px solid #e0e6dc;border-radius:18px;box-shadow:0 22px 90px #0a1d2a38;overflow:hidden}.actions{display:flex;gap:8px;align-items:center}#close{border:0;background:transparent;font-size:24px;line-height:1;padding:7px 8px;color:#73806b}.logo{font-size:31px;color:#497f37;line-height:1}.summary .time{padding-right:8px}.time b{font-size:12px}select{max-width:330px}#export{white-space:nowrap}@media(max-width:600px){header{padding:16px}main{padding:0 16px}.status{margin-left:16px;margin-right:16px}.summary>div{padding:0 10px}.summary{grid-template-columns:1fr 1fr 1fr}.summary>.time{display:none}nav{grid-template-columns:repeat(2,1fr)}.comparison{flex-wrap:wrap;gap:6px}select{max-width:205px}.list-heading{align-items:start;flex-direction:column;gap:7px}input{width:100%}.note{font-size:10px}footer{padding:10px 16px;font-size:10px}h1{font-size:18px}.primary{font-size:12px;padding:7px 10px}}\n";
function startPanel() {
  if (document.getElementById('duo-mutual-check-host')) return;
  const host = document.createElement('div');
  host.id = 'duo-mutual-check-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const root = host.attachShadow({mode:'closed'});
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  root.append(style);
  const content = document.createElement('div');
  // Static markup only; all profile data is rendered via textContent.
  content.innerHTML = `
    <button id="launcher" title="核对多邻国关注与关注者">⇄ 互关核对</button>
    <div id="backdrop" hidden><section id="shell" role="dialog" aria-modal="true" aria-labelledby="title">
      <header><div class="brand"><span class="logo" aria-hidden="true">⇄</span><div><h1 id="title">互关核对</h1><p id="account">多邻国 · 本地记录</p></div></div><div class="actions"><button id="scan" class="primary">重新核对</button><button id="close" aria-label="关闭核对面板">×</button></div></header>
      <section class="status" id="status" role="status" aria-live="polite">正在读取两份名单…</section>
      <main id="results" hidden>
        <div class="summary"><div><span>我关注的</span><strong id="following">—</strong></div><div><span>关注我的</span><strong id="followers">—</strong></div><div><span>已互关</span><strong id="mutual">—</strong></div><div class="time"><span>本次核对</span><b id="checked">—</b></div></div>
        <div class="comparison"><label for="baseline">与哪次比较</label><select id="baseline"></select><button id="export" class="quiet">导出记录</button></div>
        <nav id="categories" aria-label="核对结果分类">
          <button data-category="needFollowBack" class="active">需要回关 <b>0</b></button>
          <button data-category="notFollowingBack">对方未关注我 <b>0</b></button>
          <button data-category="newFollowers">新增关注者 <b>0</b></button>
          <button data-category="lostFollowers">疑似取关 <b>0</b></button>
        </nav>
        <div class="list-heading"><p id="description"></p><input id="search" type="search" aria-label="搜索账号" placeholder="搜索昵称或用户名"></div>
        <div id="list" class="list"></div><p id="baseline-note" class="note"></p>
      </main>
      <footer>网页可见名单 · 不自动更改关注 · 最近 30 次记录保存在油猴本地</footer>
    </section></div>`;
  root.append(content); document.documentElement.append(host);
  const $=id=>root.getElementById(id);
  let history=[],category='needFollowBack',report=null,busy=false,previousFocus=null;
  const dates=iso=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(iso));
  const titles={needFollowBack:'这些人关注了你，你尚未关注他们。',notFollowingBack:'你关注了这些人，他们不在当前关注者名单中。',newFollowers:'本次名单中新增的关注者。',lostFollowers:'过去在关注者名单中，本次不再出现的账号。'};
  function setStatus(message,type=''){ $('status').textContent=message;$('status').className=`status ${type}`; }
  function renderList(){
    if(!report)return;
    $('description').textContent=titles[category];
    const query=$('search').value.trim().toLowerCase();
    const rows=report[category].filter(u=>`${u.name} ${u.username} ${u.id}`.toLowerCase().includes(query));
    $('list').replaceChildren();
    if(!rows.length){
      const box=document.createElement('div');box.className='empty';
      const strong=document.createElement('strong');strong.textContent=query?'没有匹配的账号':!report.hasBaseline&&['newFollowers','lostFollowers'].includes(category)?'首次记录，已建立比较基线':'这一项暂时没有需要处理的人';
      box.append(strong);$('list').append(box);return;
    }
    for(const user of rows){
      const row=document.createElement('div');row.className='row';
      const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=Array.from(user.name)[0]||'友';
      const identity=document.createElement('div');identity.className='identity';
      const name=document.createElement('strong');name.textContent=user.name;
      const handle=document.createElement('small');handle.textContent=user.username?`@${user.username}`:`账号 ID ${user.id}`;
      identity.append(name,handle);
      const link=document.createElement('a');link.href=`${location.origin}/u/${user.id}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent='打开主页';
      row.append(avatar,identity,link);$('list').append(row);
    }
  }
  function render(){
    if(!history.length)return;
    const current=history[0],baseline=history[Number($('baseline').value)]||null;
    report=compare(current,baseline);$('results').hidden=false;
    $('account').textContent=`${current.account.name} · @${current.account.username}`;
    $('following').textContent=current.following.length;$('followers').textContent=current.followers.length;
    $('mutual').textContent=report.mutual;$('checked').textContent=dates(current.capturedAt);
    root.querySelectorAll('[data-category]').forEach(button=>{
      button.classList.toggle('active',button.dataset.category===category);
      button.setAttribute('aria-pressed',String(button.dataset.category===category));
      button.querySelector('b').textContent=report[button.dataset.category].length;
    });
    $('baseline-note').textContent=report.hasBaseline
      ? `与 ${dates(report.baselineAt)} 比较。“疑似取关”表示网页名单中的消失，不能单凭此项确定原因；手机端不可见记录不在核对范围内。`
      : '首次核对可查看当前是否互关；从下一次开始，就能发现名单变化。手机与网页数量不同的部分仍需另行核对。';
    renderList();
  }
  function setHistory(value){
    history=value;$('baseline').replaceChildren();
    if(history.length<2)$('baseline').add(new Option('首次记录（暂无历史）','-1'));
    else history.slice(1).forEach((s,i)=>$('baseline').add(new Option(`${i===0?'上次核对 · ':''}${dates(s.capturedAt)}`,String(i+1))));
    render();
  }
  async function scan(){
    if(busy)return;busy=true;$('scan').disabled=true;$('scan').textContent='核对中…';
    $('results').hidden=true;setStatus('正在读取两份完整名单，并复读验证…','busy');
    try{
      const result=await collectSnapshot();
      if(!result?.ok)throw new Error(result?.error||'无法读取当前页面，请刷新多邻国后重试。');
      const snapshot=normalizeSnapshot(result.snapshot),key=historyKey(snapshot.account.id);
      const save=async()=>{
        const stored=await GM_getValue(key,[]);
        if(!Array.isArray(stored))throw new Error('历史记录格式异常，未覆盖原记录。');
        if(stored.length && Date.parse(stored[0].capturedAt)>Date.parse(snapshot.capturedAt))throw new Error('另一个标签页已完成更新的核对，请重新核对。');
        const next=appendSnapshot(stored,snapshot);await GM_setValue(key,next);return next;
      };
      const next=navigator.locks?await navigator.locks.request(`duo-mutual-${snapshot.account.id}`,save):await save();
      category='needFollowBack';$('search').value='';setHistory(next);
      const r=compare(next[0],next[1]);
      setStatus(r.needFollowBack.length+r.notFollowingBack.length===0?'核对完成，两份网页名单完全一致。':'核对完成，已列出需要核对的关注关系。');
    }catch(error){
      const safe=error instanceof Error&&/[\u4e00-\u9fff]/.test(error.message)?error.message:'读取未完成，历史记录未覆盖。请刷新多邻国页面后重试。';
      setStatus(safe,'error');$('results').hidden=true;
    }finally{busy=false;$('scan').disabled=false;$('scan').textContent='重新核对';}
  }
  const close=()=>{$('backdrop').hidden=true;(previousFocus?.isConnected?previousFocus:$('launcher')).focus();};
  const open=()=>{previousFocus=document.activeElement;$('backdrop').hidden=false;$('close').focus();scan();};
  $('launcher').addEventListener('click',open);$('close').addEventListener('click',close);
  $('backdrop').addEventListener('click',e=>{if(e.target===$('backdrop'))close();});
  $('shell').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    if(e.key==='Tab'){
      const focusable=[...$('shell').querySelectorAll('button,a,input,select')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&root.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&root.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  $('scan').addEventListener('click',scan);$('baseline').addEventListener('change',render);$('search').addEventListener('input',renderList);
  $('categories').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(button){category=button.dataset.category;render();}});
  $('export').addEventListener('click',()=>{
    if(!history.length)return;
    const data={tool:'duolingo-mutual-check',schema:1,exportedAt:new Date().toISOString(),snapshots:history.map(normalizeSnapshot)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`duolingo-${history[0].account.username.replace(/[^a-zA-Z0-9_.-]/g,'_')}-${new Date().toISOString().slice(0,10)}.json`;root.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  });
  GM_registerMenuCommand('打开互关核对',open);
}
startPanel();

})();
