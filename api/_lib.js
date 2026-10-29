const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'teatro:state';
const SECRET = crypto.createHash('sha256').update('teatro|' + (TOKEN || '')).digest();

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const hash = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const check = (pw, h) => {
  const [s, x] = String(h || '').split(':');
  if (!s || !x) return false;
  const y = crypto.scryptSync(pw, s, 32), xb = Buffer.from(x, 'hex');
  return xb.length === y.length && crypto.timingSafeEqual(xb, y);
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const clean = (s, n) => String(s || '').replace(/[<>&"'`]/g, '').trim().slice(0, n);

const fix = (st) => { st.avisos = st.avisos || []; st.changes = st.changes || []; return st; };
const SC = ['dashboard', 'avisos', 'membros', 'pecas', 'escalacao', 'faltas', 'financeiro', 'ranking', 'conquistas', 'relatorios'];
const ROLES = ['master', 'user', 'membro'];
const lvl = (u, s) => {
  if (!u) return 0; if (u.role === 'master') return 3;
  if (u.perms && u.perms[s] !== undefined) return u.perms[s];
  if (u.role === 'membro') return ['faltas', 'pecas', 'avisos', 'conquistas'].includes(s) ? 1 : 0;
  return 1;
};
const cleanPerms = (p) => {
  if (!p || typeof p !== 'object') return undefined;
  const o = {}; SC.forEach((k) => { const v = Number(p[k]); if (v >= 0 && v <= 3) o[k] = Math.floor(v); });
  return Object.keys(o).length ? o : undefined;
};
async function load() {
  const raw = await redis(['GET', KEY]);
  if (raw) return fix(typeof raw === 'string' ? JSON.parse(raw) : raw);
  const st = { rev: 1, users: [{ id: 1, name: 'Administrador Master', username: 'admin', role: 'master', passHash: hash(process.env.ADMIN_PASSWORD || 'admin123') }], members: [], plays: [], characters: [], meetings: [], expenses: [], avisos: [], changes: [] };
  await redis(['SET', KEY, JSON.stringify(st), 'NX']);
  const again = await redis(['GET', KEY]);
  return fix(typeof again === 'string' ? JSON.parse(again) : again);
}
const save = (st) => redis(['SET', KEY, JSON.stringify(st)]);
const pub = (st, u) => {
  const { rev, users, ...rest } = st;
  const o = { ...rest, users: users.map(({ passHash, ...x }) => x) };
  if (u && lvl(u, 'financeiro') < 1) { o.expenses = []; o.members = (o.members || []).map(({ txEncontro, txEquipe, ...m }) => m); }
  return o;
};
const me = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, perms: u.perms, memberId: u.memberId });
function sign(uid) {
  const p = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 30 * 864e5 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
}
function verify(req, st) {
  const [p, sig] = String(req.headers.authorization || '').replace('Bearer ', '').split('.');
  if (!p || !sig) return null;
  const ok = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() ? (st.users.find((u) => u.id === d.uid) || null) : null;
  } catch { return null; }
}
const send = (res, code, obj) => res.status(code).json(obj);
module.exports = { SC, ROLES, lvl, cleanPerms, load, save, pub, me, sign, verify, hash, check, norm, clean, send, configured: !!(URL_ && TOKEN) };
