// Client minimale per Supabase (auth + foto). Nessuna dipendenza.
const Cloud = (() => {
  const cfg = () => window.CONFIG || {};
  const enabled = () => !!(cfg().SUPABASE_URL && cfg().SUPABASE_ANON_KEY);
  let s; try { s = JSON.parse(localStorage.getItem('sb_session')); } catch {}
  const keep = d => {
    s = d && { at: d.access_token, rt: d.refresh_token, exp: Date.now() / 1000 + d.expires_in - 30, uid: d.user.id, email: d.user.email };
    try { s ? localStorage.setItem('sb_session', JSON.stringify(s)) : localStorage.removeItem('sb_session'); } catch {}
  };
  const raw = (path, opts = {}, tok) => fetch(cfg().SUPABASE_URL + path, { ...opts,
    headers: { apikey: cfg().SUPABASE_ANON_KEY, Authorization: `Bearer ${tok || cfg().SUPABASE_ANON_KEY}`, ...opts.headers } });
  async function token() {
    if (s && Date.now() / 1000 > s.exp) {
      const r = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.rt }) });
      keep(r.ok ? await r.json() : null);
    }
    return s && s.at;
  }
  const api = async (path, opts) => raw(path, opts, await token());
  const ok = async r => { if (!r.ok) throw new Error((await r.text()) || r.status); return r; };
  const json = { 'Content-Type': 'application/json' };

  async function login(kind, email, password) {
    const r = await raw(kind === 'up' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password',
      { method: 'POST', headers: json, body: JSON.stringify({ email, password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.msg || d.message || r.status);
    if (d.access_token) { keep(d); return 'ok'; }
    return 'confirm';
  }
  const logout = () => keep(null);
  const user = () => s && { id: s.uid, email: s.email };

  // Carica (o sostituisce) l'immagine e crea/aggiorna la riga. rec: { name, cloudId?, cloudPath? }
  async function save(rec, blob, visibility) {
    if (!user()) throw new Error('Accedi per usare il cloud.');
    rec.cloudPath = rec.cloudPath || `${s.uid}/${crypto.randomUUID()}.jpg`;
    await ok(await api(`/storage/v1/object/photos/${rec.cloudPath}`, { method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: blob }));
    if (rec.cloudId) {
      await ok(await api(`/rest/v1/photos?id=eq.${rec.cloudId}`, { method: 'PATCH', headers: json, body: JSON.stringify({ visibility }) }));
    } else {
      const r = await ok(await api('/rest/v1/photos', { method: 'POST', headers: { ...json, Prefer: 'return=representation' },
        body: JSON.stringify({ path: rec.cloudPath, title: rec.name.replace(/\.[^.]+$/, ''), visibility }) }));
      rec.cloudId = (await r.json())[0].id;
    }
  }

  // URL firmati per più percorsi: { path: url }
  async function sign(paths) {
    if (!paths.length) return {};
    const r = await ok(await api('/storage/v1/object/sign/photos', { method: 'POST', headers: json,
      body: JSON.stringify({ expiresIn: 3600, paths }) }));
    const base = cfg().SUPABASE_URL + '/storage/v1', out = {};
    (await r.json()).forEach(o => { if (o.signedURL) out[o.path] = o.signedURL.startsWith('http') ? o.signedURL : base + o.signedURL; });
    return out;
  }
  return { enabled, login, logout, user, save, sign, api, ok, json };
})();
