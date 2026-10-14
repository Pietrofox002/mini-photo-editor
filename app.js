const FILTERS = [
  { id: 'brightness', label: 'Luminosità', min: 0, max: 200, def: 100, fmt: v => `brightness(${v}%)` },
  { id: 'contrast',   label: 'Contrasto',  min: 0, max: 200, def: 100, fmt: v => `contrast(${v}%)` },
  { id: 'saturate',   label: 'Saturazione',min: 0, max: 200, def: 100, fmt: v => `saturate(${v}%)` },
  { id: 'grayscale',  label: 'Bianco e nero', min: 0, max: 100, def: 0, fmt: v => `grayscale(${v}%)` },
  { id: 'sepia',      label: 'Seppia',     min: 0, max: 100, def: 0,  fmt: v => `sepia(${v}%)` },
  { id: 'hue',        label: 'Tonalità',   min: 0, max: 360, def: 0,  fmt: v => `hue-rotate(${v}deg)` },
  { id: 'blur',       label: 'Sfocatura',  min: 0, max: 20,  def: 0,  fmt: v => `blur(${v}px)` },
];
const defaults = () => Object.fromEntries(FILTERS.map(f => [f.id, f.def]));

const $ = s => document.querySelector(s);
const canvas = $('#canvas'), ctx = canvas.getContext('2d');
const state = { img: null, rec: null, rot: 0, flip: false, original: false, values: defaults() };

// ---------- Archivio locale (IndexedDB) ----------
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('mini-photo-editor', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await dbp;
  return new Promise((res, rej) => {
    const t = db.transaction('photos', mode), r = fn(t.objectStore('photos'));
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
  });
};
const dbAll = () => tx('readonly', s => s.getAll());
const dbPut = rec => tx('readwrite', s => s.put(rec));
const dbDel = id => tx('readwrite', s => s.delete(id));
dbp.catch(() => alert('Salvataggio locale non disponibile (navigazione privata?). Le foto non resteranno salvate.'));
navigator.storage?.persist?.();

// ---------- Controlli ----------
const box = $('#sliders');
FILTERS.forEach(f => {
  box.insertAdjacentHTML('beforeend',
    `<div class="ctl"><label for="${f.id}">${f.label}<output id="o-${f.id}">${f.def}</output></label>
     <input id="${f.id}" type="range" min="${f.min}" max="${f.max}" value="${f.def}" disabled></div>`);
  $('#' + f.id).addEventListener('input', e => {
    state.values[f.id] = +e.target.value;
    $('#o-' + f.id).textContent = e.target.value;
    render(); queueSave();
  });
});

function syncSliders() {
  FILTERS.forEach(f => {
    $('#' + f.id).value = state.values[f.id];
    $('#o-' + f.id).textContent = state.values[f.id];
  });
}

function render() {
  if (!state.img) return;
  const { img, rot } = state, swap = rot % 180 !== 0;
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  ctx.save();
  ctx.filter = state.original ? 'none' : FILTERS.map(f => f.fmt(state.values[f.id])).join(' ');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rot * Math.PI / 180);
  if (state.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
}

// Salva le modifiche della foto aperta (con piccolo ritardo)
let saveTimer;
function queueSave() {
  clearTimeout(saveTimer);
  const rec = state.rec;
  if (!rec) return;
  saveTimer = setTimeout(() => {
    rec.settings = { values: { ...state.values }, rot: state.rot, flip: state.flip };
    dbPut(rec).catch(() => {});
  }, 400);
}

// ---------- Libreria ----------
const readImage = blob => new Promise((res, rej) => {
  const img = new Image(), url = URL.createObjectURL(blob);
  img.onload = () => { URL.revokeObjectURL(url); res(img); };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
  img.src = url;
});

function makeThumb(img) {
  const c = document.createElement('canvas'), k = 160 / Math.max(img.naturalWidth, img.naturalHeight, 160);
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
}

let thumbUrls = [];
async function refreshLibrary() {
  const photos = (await dbAll()).sort((a, b) => a.added - b.added);
  thumbUrls.forEach(URL.revokeObjectURL); thumbUrls = [];
  $('#thumbs').replaceChildren(...photos.map(rec => {
    const url = URL.createObjectURL(rec.thumb); thumbUrls.push(url);
    const el = document.createElement('div');
    el.className = 'thumb' + (state.rec?.id === rec.id ? ' active' : '');
    el.innerHTML = `<button type="button" aria-label="Apri ${rec.name}"><img alt="" src="${url}"></button>
                    <button type="button" class="del" aria-label="Elimina ${rec.name}">×</button>`;
    el.firstElementChild.onclick = () => openPhoto(rec);
    el.lastElementChild.onclick = () => removePhoto(rec, photos);
    return el;
  }));
  return photos;
}

async function openPhoto(rec) {
  state.img = await readImage(rec.blob);
  state.rec = rec;
  const s = rec.settings || {};
  state.values = { ...defaults(), ...s.values };
  state.rot = s.rot || 0; state.flip = !!s.flip;
  syncSliders();
  $('#drop').hidden = true; canvas.hidden = false;
  setEnabled(true); render(); refreshLibrary();
}

async function removePhoto(rec, photos) {
  if (!confirm(`Eliminare "${rec.name}" dall'app?`)) return;
  if (state.rec?.id === rec.id) { clearTimeout(saveTimer); state.rec = state.img = null; }
  await dbDel(rec.id);
  const rest = photos.filter(p => p.id !== rec.id);
  if (!state.rec && rest.length) return openPhoto(rest[rest.length - 1]);
  if (!rest.length) { canvas.hidden = true; $('#drop').hidden = false; setEnabled(false); }
  refreshLibrary();
}

async function addFiles(files) {
  let last;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const img = await readImage(file);
      const rec = { name: file.name, blob: file, thumb: await makeThumb(img), added: Date.now(),
                    settings: { values: defaults(), rot: 0, flip: false } };
      rec.id = await dbPut(rec);
      autoSync(rec);
      last = rec;
    } catch { alert(`Impossibile leggere "${file.name}".`); }
  }
  if (last) openPhoto(last); else if (!state.rec) alert('Scegli un file immagine (JPG, PNG, WebP...).');
}

function setEnabled(on) {
  document.querySelectorAll('#panel button, #panel input, #panel select').forEach(el => el.disabled = !on);
}

// ---------- Account e cloud ----------
const dlg = $('#auth');
function refreshAcct() {
  const u = Cloud.enabled() && Cloud.user();
  $('#acct').hidden = !Cloud.enabled();
  $('#acct-btn').textContent = u ? `${u.email} · Esci` : 'Accedi o registrati';
  if (window.CONFIG?.CONTACT_EMAIL) $('#contact').textContent = window.CONFIG.CONTACT_EMAIL;
}
$('#acct-btn').onclick = () => { if (Cloud.user()) { Cloud.logout(); refreshAcct(); } else dlg.showModal(); };
$('#auth-close').onclick = () => dlg.close();
$('#signup').onclick = () => authGo('up');
$('#auth form').onsubmit = e => { e.preventDefault(); authGo('in'); };
async function authGo(kind) {
  const err = $('#auth-err'); err.textContent = '';
  if (kind === 'up' && !$('#age').checked) return err.textContent = 'Per registrarti conferma di avere almeno 18 anni e accetta le condizioni.';
  try {
    if (await Cloud.login(kind, $('#a-email').value, $('#a-pw').value) === 'confirm')
      return err.textContent = "Controlla la tua email per confermare l'account, poi accedi.";
    $('#a-pw').value = ''; dlg.close(); refreshAcct(); syncPending();
  } catch (e) { err.textContent = 'Non riuscito: ' + e.message; }
}

// Con l'account, ogni foto aggiunta viene copiata nel cloud come privata
async function autoSync(rec) {
  if (!Cloud.user() || rec.cloudId) return;
  try {
    await Cloud.save(rec, rec.blob, 'private');
    const live = state.rec?.id === rec.id ? state.rec : rec;
    live.cloudId = rec.cloudId; live.cloudPath = rec.cloudPath; await dbPut(live);
  } catch (e) { console.warn('Sincronizzazione non riuscita, riproverà', e); }
}
let syncing = false;
async function syncPending() {
  if (!Cloud.user() || syncing) return;
  syncing = true;
  try { for (const rec of await dbAll()) await autoSync(rec); } catch {}
  syncing = false;
}

// ---------- Eventi ----------
['#file', '#camera'].forEach(id => $(id).addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; }));
const stage = $('#stage');
['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); $('#drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); $('#drop').classList.remove('over'); }));
stage.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));

$('#panel').addEventListener('click', e => {
  const act = e.target.dataset.act;
  if (!act) return;
  if (act === 'rotate') state.rot = (state.rot + 90) % 360;
  if (act === 'flip') state.flip = !state.flip;
  if (act === 'reset') { state.values = defaults(); state.rot = 0; state.flip = false; syncSliders(); }
  render(); queueSave();
});

const cmp = $('#compare');
cmp.addEventListener('pointerdown', () => { state.original = true; render(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => cmp.addEventListener(t, () => { state.original = false; render(); }));

$('#download').addEventListener('click', () => {
  const type = $('#format').value;
  state.original = false; render();
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.rec.name.replace(/\.[^.]+$/, '') + '-modificata.' + (type === 'image/png' ? 'png' : 'jpg');
    a.click();
    URL.revokeObjectURL(a.href);
  }, type, 0.92);
});

// ---------- Salva nel cloud con visibilità ----------
$('#publish').addEventListener('click', async () => {
  if (!Cloud.user()) return dlg.showModal();
  const vis = $('#visibility').value, status = $('#status'), btn = $('#publish');
  if (vis === 'public' && !confirm("La foto sarà visibile a tutti nella galleria pubblica dopo l'approvazione del gestore. Continuare?")) return;
  state.original = false; render();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
  btn.disabled = true; status.textContent = 'Salvataggio…';
  try {
    await Cloud.save(state.rec, blob, vis); await dbPut(state.rec);
    status.textContent = vis === 'public' ? "Inviata: sarà pubblica dopo l'approvazione." : 'Salvata nel cloud come privata.';
  } catch (e) { status.textContent = 'Non riuscito: ' + e.message; }
  btn.disabled = false;
});

// ---------- Avvio: riapre l'ultima foto salvata ----------
setEnabled(false);
refreshLibrary().then(p => { if (p.length) openPhoto(p[p.length - 1]); }).catch(() => {});
refreshAcct(); syncPending();
