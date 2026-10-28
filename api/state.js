const L = require('./_lib');
module.exports = async (req, res) => {
  if (!L.configured) return L.send(res, 500, { error: 'Banco de dados não configurado na Vercel.' });
  const st = await L.load();
  const u = L.verify(req, st);
  if (!u) return L.send(res, 401, { error: 'Sessão inválida' });
  if (req.method === 'GET') return L.send(res, 200, { me: L.me(u), rev: st.rev, state: L.pub(st) });
  if (req.method !== 'PUT') return L.send(res, 405, { error: 'Método inválido' });
  if (u.role !== 'master') return L.send(res, 403, { error: 'Somente o Master pode editar.' });
  const { rev, state: inc } = req.body || {};
  if (!inc || rev !== st.rev) return L.send(res, 409, { rev: st.rev, state: L.pub(st) });
  const next = { rev: st.rev + 1 };
  ['members', 'plays', 'characters', 'meetings', 'expenses'].forEach((k) => { next[k] = Array.isArray(inc[k]) ? inc[k] : st[k]; });
  const old = new Map(st.users.map((x) => [x.id, x]));
  next.users = [];
  for (const x of inc.users || []) {
    const prev = old.get(x.id);
    let passHash = prev && prev.passHash;
    if (x.password && String(x.password).trim()) passHash = L.hash(String(x.password).trim());
    if (!passHash) continue;
    next.users.push({ id: x.id, name: L.clean(x.name, 80), username: L.clean(x.username, 40), role: x.role === 'master' ? 'master' : 'user', passHash });
  }
  if (!next.users.some((x) => x.role === 'master')) return L.send(res, 400, { error: 'Precisa existir pelo menos um Master.' });
  await L.save(next);
  L.send(res, 200, { rev: next.rev });
};
