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
