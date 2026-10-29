const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'Método inválido' });
  if (!L.configured) return L.send(res, 500, { error: 'Banco de dados não configurado na Vercel.' });
  const { username, password } = req.body || {};
  const st = await L.load();
  const u = st.users.find((x) => L.norm(x.username) === L.norm(username));
  if (!u || !L.check(String(password || ''), u.passHash)) return L.send(res, 401, { error: 'Usuário ou senha incorretos!' });
  L.send(res, 200, { token: L.sign(u.id), me: L.me(u), rev: st.rev, state: L.pub(st, u) });
};
