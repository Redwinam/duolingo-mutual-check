// Login data stays inside this function and is never returned to the panel or storage.
export async function collectSnapshot() {
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
