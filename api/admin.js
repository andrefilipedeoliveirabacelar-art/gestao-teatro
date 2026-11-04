const L = require('./_lib');
const IDX = 'teatro:snaps';
const COLS = ['members', 'plays', 'characters', 'meetings', 'expenses', 'avisos', 'changes', 'feedbacks'];
const fileOf = (st, u) => { const { auditLog, ...rest } = L.pub(st, u); return { schemaVersion: 1, exportedAt: new Date().toISOString(), ...rest }; };
const idx = async () => { const r = await L.redis(['GET', IDX]); return r ? JSON.parse(r) : []; };
async function snapshot(st, by, kind) {
  const id = Date.now().toString(36), at = new Date().toISOString();
  await L.redis(['SET', 'teatro:snap:' + id, JSON.stringify(st)]);
  const list = [{ id, at, by, kind, membros: (st.members || []).length, pecas: (st.plays || []).length, ensaios: (st.meetings || []).length }, ...(await idx())];
  for (const o of list.slice(10)) await L.redis(['DEL', 'teatro:snap:' + o.id]);
  await L.redis(['SET', IDX, JSON.stringify(list.slice(0, 10))]);
  return { id, at };
}
module.exports = async (req, res) => {
  if (!L.configured) return L.send(res, 500, { error: 'Banco de dados não configurado na Vercel.' });
  const st = await L.load();
  const u = L.verify(req, st);
  if (!u || u.role !== 'master') return L.send(res, 403, { error: 'Somente o Master pode usar a área de segurança.' });
  if (req.method === 'GET') return L.send(res, 200, { snaps: await idx() });
  if (req.method !== 'POST') return L.send(res, 405, { error: 'Método inválido' });
  const b = req.body || {};
  if (b.action === 'backup') {
    await snapshot(st, u.username, 'manual');
    L.addLog(st, u.username, 'Backup manual', 'Cópia criada no servidor e baixada');
    await L.save(st);
    return L.send(res, 200, { snaps: await idx(), file: fileOf(st, u) });
  }
  if (b.action === 'reset') {
    if (b.confirm !== 'ZERAR' || !L.check(String(b.password || ''), u.passHash)) return L.send(res, 400, { error: 'Confirmação ou senha incorreta.' });
    await snapshot(st, u.username, 'antes de zerar');
    const next = { ...st, rev: st.rev + 1 };
    COLS.forEach((k) => { next[k] = []; });
    if (!b.keepUsers) next.users = [u];
    if (!b.keepConfig) delete next.config;
    L.addLog(next, u.username, 'Dados zerados', 'Backup automático feito antes');
    await L.save(L.fix(next));
    return L.send(res, 200, { rev: next.rev, state: L.pub(next, u), snaps: await idx(), file: fileOf(st, u) });
  }
  if (b.action === 'restore') {
    let src = b.data;
    if (b.id) {
      const raw = await L.redis(['GET', 'teatro:snap:' + String(b.id).replace(/[^a-z0-9]/gi, '')]);
      if (!raw) return L.send(res, 404, { error: 'Backup não encontrado.' });
      src = JSON.parse(raw);
    }
    const bad = b.id ? null : L.validateBackup(src);
    if (bad) return L.send(res, 400, { error: bad });
    await snapshot(st, u.username, 'antes de restaurar');
    const next = { ...st, rev: st.rev + 1 };
    COLS.forEach((k) => { next[k] = Array.isArray(src[k]) ? src[k] : []; });
    if (src.config) next.config = L.cleanConfig(src.config, st.config);
    L.addLog(next, u.username, 'Backup restaurado', b.id ? 'Cópia do servidor' : 'Arquivo enviado');
    await L.save(next);
    return L.send(res, 200, { rev: next.rev, state: L.pub(next, u), snaps: await idx() });
  }
  L.send(res, 400, { error: 'Ação inválida' });
};
