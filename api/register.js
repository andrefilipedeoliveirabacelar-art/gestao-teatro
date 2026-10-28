const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'Método inválido' });
  if (!L.configured) return L.send(res, 500, { error: 'Banco de dados não configurado na Vercel.' });
  const b = req.body || {};
  const name = L.clean(b.name, 80), username = L.clean(b.username, 40), password = String(b.password || '').trim();
  if (!name || !username || password.length < 4) return L.send(res, 400, { error: 'Preencha nome, login e senha (mín. 4 caracteres).' });
  const st = await L.load();
  if (st.users.some((u) => L.norm(u.username) === L.norm(username))) return L.send(res, 409, { error: 'Este login já existe! Escolha outro.' });
  const u = { id: Date.now(), name, username, role: 'user', passHash: L.hash(password) };
  st.users.push(u); st.rev++;
  await L.save(st);
  L.send(res, 200, { token: L.sign(u.id), me: L.me(u), rev: st.rev, state: L.pub(st) });
};
