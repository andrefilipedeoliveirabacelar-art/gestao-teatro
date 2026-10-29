const L = require('./_lib');
const SCR = { members: ['membros'], plays: ['pecas'], characters: ['pecas', 'escalacao'], meetings: ['faltas'], expenses: ['financeiro'], avisos: ['avisos'], changes: ['pecas', 'escalacao'] };
const COLS = Object.keys(SCR);
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const J = (x) => JSON.stringify(canon(x));
module.exports = async (req, res) => {
  if (!L.configured) return L.send(res, 500, { error: 'Banco de dados não configurado na Vercel.' });
  const st = await L.load();
  const u = L.verify(req, st);
  if (!u) return L.send(res, 401, { error: 'Sessão inválida' });
  if (req.method === 'GET') return L.send(res, 200, { me: L.me(u), rev: st.rev, state: L.pub(st, u) });
  if (req.method !== 'PUT') return L.send(res, 405, { error: 'Método inválido' });
  const { rev, state: inc } = req.body || {};
  if (!inc || rev !== st.rev) return L.send(res, 409, { rev: st.rev, state: L.pub(st, u) });
  const master = u.role === 'master';
  if (!master) {
    if (L.lvl(u, 'financeiro') < 1) {
      inc.expenses = st.expenses;
      const om = new Map(st.members.map((m) => [m.id, m]));
      inc.members = (inc.members || []).map((m) => { const o = om.get(m.id); return o ? { ...m, txEncontro: o.txEncontro, txEquipe: o.txEquipe } : m; });
    }
    for (const k of COLS) {
      const a = st[k] || [], b = Array.isArray(inc[k]) ? inc[k] : a;
      const oa = new Map(a.map((x) => [x.id, J(x)])), ob = new Map(b.map((x) => [x.id, J(x)]));
      let ins = false, del = false;
      for (const [id, j] of ob) if (oa.get(id) !== j) ins = true;
      for (const id of oa.keys()) if (!ob.has(id)) del = true;
      const lv = Math.max(...SCR[k].map((s) => L.lvl(u, s)));
      if ((ins && lv < 2) || (del && lv < 3) || (k === 'members' && (ins || del) && L.lvl(u, 'financeiro') < 1)) return L.send(res, 403, { error: 'Seu usuário não tem permissão para esta alteração.' });
    }
  }
  const next = { rev: st.rev + 1 };
  COLS.forEach((k) => { next[k] = Array.isArray(inc[k]) ? inc[k] : st[k]; });
  if (!master) next.users = st.users;
  else {
    const old = new Map(st.users.map((x) => [x.id, x]));
    next.users = [];
    for (const x of inc.users || []) {
      const prev = old.get(x.id);
      let passHash = prev && prev.passHash;
      if (x.password && String(x.password).trim()) passHash = L.hash(String(x.password).trim());
      if (!passHash) continue;
      const perms = L.cleanPerms(x.perms), mid = Number(x.memberId);
      next.users.push({ id: x.id, name: L.clean(x.name, 80), username: L.clean(x.username, 40), role: L.ROLES.includes(x.role) ? x.role : 'user', passHash, ...(perms ? { perms } : {}), ...(mid ? { memberId: mid } : {}) });
    }
    if (!next.users.some((x) => x.role === 'master')) return L.send(res, 400, { error: 'Precisa existir pelo menos um Master.' });
  }
  await L.save(next);
  L.send(res, 200, { rev: next.rev });
};
