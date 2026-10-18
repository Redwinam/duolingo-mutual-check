export const SOURCE = 'duolingo-web-friends-v1';

export function normalizeUser(user) {
  const id = String(user.id ?? user.userId ?? '');
  if (!/^\d+$/.test(id)) throw new Error('名单中缺少有效账号 ID，未保存本次结果。');
  return {
    id,
    name: String(user.name ?? user.displayName ?? user.username ?? id).slice(0,200),
    username: String(user.username ?? '').slice(0,200)
  };
}

export function normalizeSnapshot(raw) {
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

export function compare(current, previous = null) {
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

export function historyKey(accountId) { return `history:v1:${accountId}`; }

export function appendSnapshot(history, snapshot) {
  const latest = normalizeSnapshot(snapshot);
  const previous = history.map(normalizeSnapshot);
  if (previous.some(s=>s.account.id !== latest.account.id || s.source !== latest.source)) {
    throw new Error('历史记录的账号不一致，未覆盖原记录。');
  }
  return [latest,...previous].slice(0,30);
}
