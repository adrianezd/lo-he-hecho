'use strict';
// Lo he hecho: rutinas de comprobación con la hora de cada marca, foto opcional e historial.
// Estado en localStorage; la última foto de cada comprobación en IndexedDB.

const CLAVE = 'lo-he-hecho-v1';
const MAX_HISTORIAL = 600;
const HOLD_MS = 650;
const SUGERENCIAS = [
  ['🔑', 'Cerrar con llave'], ['🔥', 'Fuegos apagados'], ['♨️', 'Horno apagado'], ['🔌', 'Plancha desenchufada'],
  ['🚰', 'Grifos cerrados'], ['🧯', 'Gas cerrado'], ['🪟', 'Ventanas cerradas'], ['💡', 'Luces apagadas'],
  ['🌡️', 'Calefacción apagada'], ['💨', 'Secador desenchufado'], ['🔋', 'Cargadores desenchufados'], ['🚿', 'Ducha cerrada'],
  ['🚗', 'Coche cerrado'], ['🅿️', 'Freno de mano'], ['👛', 'Cartera'], ['📱', 'Móvil'], ['🗝️', 'Llaves'],
  ['🐾', 'Agua a la mascota'], ['💊', 'Pastilla tomada'], ['⏰', 'Alarma puesta'], ['🧺', 'Lavadora apagada'], ['🗑️', 'Basura bajada']
];
const EMOJIS = ['🔑', '🗝️', '🚪', '🔒', '🔥', '♨️', '🧯', '🔌', '🔋', '💡', '🚰', '🚿', '🪟', '🌡️', '💨', '🧺', '🚗', '🅿️', '👛', '📱', '💊', '⏰', '🐾', '🪴', '🗑️', '📦', '✉️', '🎒', '🧾', '👶', '🍳', '☕', '🛏️', '🏠', '🌙', '☀️', '✔️', '⭐'];
const HORAS = [2, 8, 12, 24];

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hora = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function porDefecto() {
  const it = l => l.map(([e, t]) => ({ id: uid(), e, t }));
  return {
    rutinas: [
      { id: uid(), nombre: 'Salir de casa', e: '🚪', horas: 8, items: it([['🔑', 'Cerrar con llave'], ['🔥', 'Fuegos apagados'], ['🔌', 'Plancha desenchufada'], ['🚰', 'Grifos cerrados'], ['🪟', 'Ventanas cerradas'], ['💡', 'Luces apagadas']]) },
      { id: uid(), nombre: 'Antes de dormir', e: '🌙', horas: 12, items: it([['🔒', 'Puerta con llave'], ['🔥', 'Fuegos y horno apagados'], ['🧯', 'Gas cerrado'], ['⏰', 'Alarma puesta']]) },
      { id: uid(), nombre: 'Coche', e: '🚗', horas: 2, items: it([['🔒', 'Coche cerrado'], ['💡', 'Luces apagadas'], ['🅿️', 'Freno de mano'], ['🪟', 'Ventanillas subidas']]) }
    ],
    marcas: {}, historial: [], actual: null, ajustes: { mantener: true, vibrar: true }
  };
}

let D;
try { D = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) {}
if (!D || !Array.isArray(D.rutinas)) D = porDefecto();
D.marcas = D.marcas || {}; D.historial = D.historial || []; D.ajustes = Object.assign({ mantener: true, vibrar: true }, D.ajustes);
let sinGuardar = false;
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(D)); sinGuardar = false; }
  catch (e) { if (!sinGuardar) aviso('No se puede guardar en este navegador. Prueba fuera del modo incógnito.'); sinGuardar = true; }
}

// ---------- Fotos ----------
const Fotos = (() => {
  let abierta;
  const abrir = () => abierta || (abierta = new Promise((ok, ko) => {
    const r = indexedDB.open('lo-he-hecho', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos');
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  }));
  const tx = async (modo, fn) => {
    const db = await abrir();
    return new Promise((ok, ko) => { const t = db.transaction('fotos', modo); const q = fn(t.objectStore('fotos')); t.oncomplete = () => ok(q && q.result); t.onerror = () => ko(t.error); });
  };
  const cache = {};
  return {
    cache,
    async cargar() {
      try {
        const db = await abrir();
        await new Promise(ok => {
          const t = db.transaction('fotos', 'readonly'), s = t.objectStore('fotos'), c = s.openCursor();
          c.onsuccess = () => { const k = c.result; if (k) { cache[k.key] = { ...k.value, url: URL.createObjectURL(k.value.blob) }; k.continue(); } };
          t.oncomplete = ok; t.onerror = ok;
        });
      } catch (e) {}
    },
    async poner(id, blob, t) {
      this.quitarCache(id);
      cache[id] = { blob, t, url: URL.createObjectURL(blob) };
      try { await tx('readwrite', s => s.put({ blob, t }, id)); } catch (e) {}
    },
    quitarCache(id) { if (cache[id]) { URL.revokeObjectURL(cache[id].url); delete cache[id]; } },
    async quitar(id) { if (!cache[id]) return; this.quitarCache(id); try { await tx('readwrite', s => s.delete(id)); } catch (e) {} }
  };
})();
async function comprimir(file, max = 800) {
  const im = await new Promise((ok, ko) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = ko; i.src = u; });
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(b => ok(b || file), 'image/jpeg', .8));
}

// ---------- Estado ----------
const S = { vista: 'hoy', edId: null, recien: null, fotoPara: null };
const rutina = id => D.rutinas.find(r => r.id === id);
const actual = () => rutina(D.actual) || D.rutinas[0];
// Una marca vale mientras no pasen las horas de su rutina.
function marca(r, it) {
  const t = D.marcas[it.id];
  return t && Date.now() - t < r.horas * 36e5 ? t : 0;
}
const hechos = r => r.items.filter(it => marca(r, it)).length;
const fotoDe = (r, it) => { const m = marca(r, it), f = Fotos.cache[it.id]; return m && f && f.t === m ? f : null; };

function hace(t) {
  const m = Math.floor((Date.now() - t) / 6e4);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
}
function diaTexto(t) {
  const d = new Date(t), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dif = Math.round((hoy - x) / 864e5);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function vibrar(p) { if (D.ajustes.vibrar && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }

// ---------- Vistas ----------
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.val === S.vista ? 'page' : 'false'));
  $('#vista').innerHTML = S.vista === 'historial' ? vHistorial() : S.vista === 'editar' ? vEditar() : vHoy();
  S.recien = null;
}

const ICO_CAM = '<svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>';
const ICO_CHECK = '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>';

function vHoy() {
  if (!D.rutinas.length) return `<div class="tarjeta vacio-txt"><span class="grande">🌿</span>No tienes ninguna rutina.<div style="margin-top:14px"><button class="btn" data-acc="nueva-rutina">Crear una</button></div></div>`;
  const r = actual(), n = hechos(r), total = r.items.length;
  const chips = D.rutinas.map(x => `<button class="chip${x === r ? ' on' : ''}" data-acc="rutina" data-id="${x.id}">${x.e} ${esc(x.nombre)}<small>${hechos(x)}/${x.items.length}</small></button>`).join('');
  const C = 2 * Math.PI * 25, pct = total ? n / total : 0;
  const todo = total && n === total;
  const ultima = todo ? Math.max(...r.items.map(it => marca(r, it))) : 0;
  return `<div class="chips">${chips}<button class="chip mas" data-acc="nueva-rutina">+ Nueva</button></div>
  <div class="progreso">
    <svg class="anillo" viewBox="0 0 58 58" aria-hidden="true"><circle class="fondo" cx="29" cy="29" r="25"/><circle class="lleno" cx="29" cy="29" r="25" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
    <div><h2>${r.e} ${esc(r.nombre)}</h2><p>${!total ? 'Sin comprobaciones todavía' : todo ? 'Todo comprobado' : `${n} de ${total} comprobados`}</p></div>
  </div>
  ${total ? `<ul class="lista">${r.items.map(it => itemHTML(r, it)).join('')}</ul>` : `<div class="tarjeta vacio-txt">Añade lo que quieras comprobar.<div style="margin-top:14px"><button class="btn" data-acc="editar-rutina" data-id="${r.id}">Añadir comprobaciones</button></div></div>`}
  ${todo ? `<div class="paz"><span class="grande">🌿</span><h3>Todo hecho</h3><p>Lo comprobaste a las ${hora(ultima)}. Todo en orden.</p><button class="btn sec" data-acc="reiniciar" data-id="${r.id}">Empezar de nuevo</button></div>`
    : total && n === 0 ? `<p class="pista">${D.ajustes.mantener ? 'Mantén pulsado cada cosa mientras la compruebas.' : 'Toca cada cosa mientras la compruebas.'} Con la cámara te queda una foto de prueba.</p>`
    : n ? `<p class="pista"><button class="btn suave" data-acc="reiniciar" data-id="${r.id}">Empezar de nuevo</button></p>` : ''}`;
}

function itemHTML(r, it) {
  const m = marca(r, it), f = fotoDe(r, it);
  return `<li class="item${m ? ' hecho' : ''}${S.recien === it.id ? ' recien' : ''}" data-item="${it.id}">
    <button class="marcar" data-acc="item" data-id="${it.id}" aria-label="${esc(it.t)}${m ? ', hecho a las ' + hora(m) : ''}">
      <span class="emo" aria-hidden="true">${it.e}</span>
      <span class="txt"><strong>${esc(it.t)}</strong><span class="cuando"${m ? ` data-t="${m}"` : ''}>${m ? `Hecho a las ${hora(m)} · ${hace(m)}` : 'Pendiente'}</span></span>
      <span class="check" aria-hidden="true">${ICO_CHECK}</span>
    </button>
    <button class="camara" data-acc="${f ? 'ver' : 'foto'}" data-id="${it.id}" aria-label="${f ? 'Ver foto' : 'Hacer foto de prueba'}">${f ? `<img src="${f.url}" alt="">` : ICO_CAM}</button>
  </li>`;
}

function vHistorial() {
  const h = D.historial;
  if (!h.length) return `<div class="cab"><h2>Historial</h2></div><div class="tarjeta vacio-txt" style="margin-top:14px"><span class="grande">🕊️</span>Aquí aparecerá cada cosa que marques, con su hora. Si te entra la duda, mira aquí: lo hiciste.</div>`;
  const grupos = [];
  h.slice().reverse().forEach(x => { const d = diaTexto(x.t); const g = grupos[grupos.length - 1]; if (g && g.d === d) g.l.push(x); else grupos.push({ d, l: [x] }); });
  return `<div class="cab"><h2>Historial</h2><p class="nota">Si te entra la duda, mira aquí: lo hiciste.</p></div>
  ${grupos.map(g => `<div class="dia-h">${g.d}</div><ul class="registro">${g.l.map(x => `<li><time>${hora(x.t)}</time><span class="e">${x.e}</span><span class="t">${esc(x.i)}<small>${esc(x.r)}${x.f ? ' · con foto' : ''}</small></span></li>`).join('')}</ul>`).join('')}
  <div class="seccion"><button class="btn peligro ancho" data-acc="borrar-historial">Borrar historial</button></div>`;
}

function vEditar() {
  const r = rutina(S.edId) || actual();
  if (!r) return `<div class="cab"><h2>Editar</h2></div><div class="seccion"><button class="btn ancho" data-acc="nueva-rutina">Nueva rutina</button></div>${ajustesHTML()}`;
  S.edId = r.id;
  const usados = new Set(r.items.map(it => it.t.toLowerCase()));
  const sug = SUGERENCIAS.filter(([, t]) => !usados.has(t.toLowerCase()));
  return `<div class="cab"><h2>Editar</h2></div>
  <div class="chips" style="margin-top:12px">${D.rutinas.map(x => `<button class="chip${x === r ? ' on' : ''}" data-acc="ed-rutina" data-id="${x.id}">${x.e} ${esc(x.nombre)}</button>`).join('')}<button class="chip mas" data-acc="nueva-rutina">+ Nueva</button></div>
  <div class="campo"><span>Nombre de la rutina</span><div class="anadir" style="margin:0"><button class="mini emo-b" data-acc="emoji" data-id="R" aria-label="Cambiar icono">${r.e}</button><input type="text" id="r-nombre" value="${esc(r.nombre)}" maxlength="40"></div></div>
  <div class="campo"><span>Las marcas se borran solas pasadas</span><div class="chips">${HORAS.map(h => `<button class="chip${r.horas === h ? ' on' : ''}" data-acc="horas" data-val="${h}">${h} horas</button>`).join('')}</div></div>
  <div class="campo"><span>Comprobaciones</span>
    ${r.items.length ? `<ul class="ed-lista">${r.items.map((it, i) => `<li>
      <button class="mini emo-b" data-acc="emoji" data-id="${it.id}" aria-label="Cambiar icono">${it.e}</button>
      <input type="text" data-item="${it.id}" class="it-txt" value="${esc(it.t)}" maxlength="50" aria-label="Texto">
      <button class="mini" data-acc="subir" data-id="${it.id}" aria-label="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
      <button class="mini" data-acc="quitar" data-id="${it.id}" aria-label="Quitar">×</button>
    </li>`).join('')}</ul>` : '<p class="nota" style="margin:0">Todavía no hay ninguna.</p>'}
    <form class="anadir" id="f-anadir"><input type="text" id="nuevo-txt" placeholder="Otra cosa que comprobar" maxlength="50"><button class="btn">Añadir</button></form>
    ${sug.length ? `<div class="sugerencias">${sug.map(([e, t]) => `<button class="chip" data-acc="sug" data-val="${esc(t)}">${e} ${esc(t)}</button>`).join('')}</div>` : ''}
  </div>
  ${D.rutinas.length > 1 ? `<button class="btn peligro ancho" data-acc="borrar-rutina" data-id="${r.id}">Borrar esta rutina</button>` : ''}
  ${ajustesHTML()}`;
}
const ajustesHTML = () => `<div class="seccion"><h3>Ajustes</h3><div class="tarjeta" style="padding:4px 18px">
  <label class="ajuste"><span>Mantener pulsado para marcar<small>Un gesto consciente se recuerda mejor que un toque rápido</small></span><input type="checkbox" class="interruptor" data-ajuste="mantener"${D.ajustes.mantener ? ' checked' : ''}></label>
  <label class="ajuste"><span>Vibrar al marcar<small>Si tu móvil lo permite</small></span><input type="checkbox" class="interruptor" data-ajuste="vibrar"${D.ajustes.vibrar ? ' checked' : ''}></label>
</div></div>`;

// ---------- Hojas ----------
let hojaAbierta = false;
function abrirHoja(titulo, cuerpo) {
  $('#hoja').innerHTML = `<div class="hoja-cab"><h3>${titulo}</h3><button class="cerrar" data-acc="cerrar" aria-label="Cerrar">×</button></div>${cuerpo}`;
  $('#hoja').scrollTop = 0;
  if (!hojaAbierta) {
    hojaAbierta = true; $('#velo').hidden = false;
    try { if (!(history.state && history.state.hoja)) history.pushState({ hoja: 1 }, ''); } catch (e) {}
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('con-hoja')));
  }
}
function cerrarDeVerdad() {
  if (!hojaAbierta) return;
  hojaAbierta = false;
  document.body.classList.remove('con-hoja');
  setTimeout(() => { if (!hojaAbierta) { $('#velo').hidden = true; $('#hoja').innerHTML = ''; } }, 260);
}
function cerrarHoja() { if (history.state && history.state.hoja) history.back(); else cerrarDeVerdad(); }
window.addEventListener('popstate', cerrarDeVerdad);

function buscarItem(id) { for (const r of D.rutinas) { const it = r.items.find(x => x.id === id); if (it) return [r, it]; } return []; }

function hojaPrueba(id) {
  const [r, it] = buscarItem(id); if (!it) return;
  const m = marca(r, it), f = fotoDe(r, it);
  if (!m) return;
  abrirHoja(`${it.e} ${esc(it.t)}`, `<div class="prueba"><div class="hora">${hora(m)}</div><p>${diaTexto(m)}, ${hace(m)}. Lo comprobaste.</p>${f ? `<img src="${f.url}" alt="Foto de prueba">` : ''}</div>
    <div class="fila">${f ? '' : `<button class="btn sec" data-acc="foto" data-id="${id}">Hacer foto</button>`}<button class="btn" data-acc="cerrar">Entendido</button></div>
    <button class="btn suave ancho" style="margin-top:10px" data-acc="desmarcar" data-id="${id}">Quitar la marca</button>`);
}
function hojaEmoji(id) {
  const r = rutina(S.edId);
  const actualE = id === 'R' ? r.e : (r.items.find(x => x.id === id) || {}).e;
  abrirHoja('Elige un icono', `<div class="emojis">${EMOJIS.map(e => `<button class="${e === actualE ? 'on' : ''}" data-acc="poner-emoji" data-id="${id}" data-val="${e}">${e}</button>`).join('')}</div>`);
}

// ---------- Marcar ----------
function marcar(id, conFoto) {
  const [r, it] = buscarItem(id); if (!it) return 0;
  const t = Date.now();
  D.marcas[id] = t;
  D.historial.push({ t, e: it.e, i: it.t, r: r.nombre, f: conFoto ? 1 : 0 });
  if (D.historial.length > MAX_HISTORIAL) D.historial.splice(0, D.historial.length - MAX_HISTORIAL);
  guardar();
  vibrar(conFoto ? 30 : [18, 40, 18]);
  S.recien = id;
  if (hechos(r) === r.items.length) setTimeout(() => vibrar([30, 60, 30, 60, 60]), 200);
  return t;
}
async function desmarcar(id) {
  delete D.marcas[id]; guardar();
  await Fotos.quitar(id);
}

// Mantener pulsado: se rellena la tarjeta y al acabar se marca.
let hold = null, ultimoHoldHecho = 0;
function empezarHold(b) {
  cancelarHold();
  b.style.setProperty('--hold', HOLD_MS + 'ms');
  b.classList.add('pulsando');
  hold = { b, t: setTimeout(() => { hold.hecho = true; b.classList.remove('pulsando'); marcar(b.dataset.id); render(); }, HOLD_MS) };
}
function cancelarHold() {
  if (!hold) return;
  clearTimeout(hold.t);
  if (hold.b.isConnected) hold.b.classList.remove('pulsando');
  hold = null;
}
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.marcar');
  if (!b || !D.ajustes.mantener || b.closest('.item').classList.contains('hecho')) return;
  if (e.button && e.button !== 0) return;
  empezarHold(b);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => document.addEventListener(ev, e => {
  if (!hold || (ev === 'pointerleave' && e.target !== hold.b)) return;
  if (hold.hecho) { hold = null; ultimoHoldHecho = Date.now(); } else cancelarHold();
}, true));
document.addEventListener('contextmenu', e => { if (e.target.closest('.marcar')) e.preventDefault(); });
const holdTerminado = () => Date.now() - ultimoHoldHecho < 600;

// ---------- Avisos ----------
let tAviso;
function aviso(txt) {
  const a = $('#aviso');
  a.textContent = txt; a.hidden = false;
  a.style.animation = 'none'; void a.offsetWidth; a.style.animation = '';
  clearTimeout(tAviso); tAviso = setTimeout(() => { a.hidden = true; }, 2600);
}
function dobleToque(b, txt, fn) {
  if (b.dataset.armado) { fn(); return; }
  const antes = b.textContent;
  b.dataset.armado = '1'; b.classList.add('armado'); b.textContent = txt;
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armado; b.classList.remove('armado'); b.textContent = antes; } }, 3000);
}

// ---------- Acciones ----------
function editada(r) { guardar(); render(); }
const ACC = {
  vista: (b, id, v) => { S.vista = v; render(); window.scrollTo({ top: 0 }); },
  cerrar: () => cerrarHoja(),
  rutina: (b, id) => { D.actual = id; guardar(); render(); },
  item: (b, id, v, e) => {
    if (holdTerminado()) return;
    const [r, it] = buscarItem(id); if (!it) return;
    if (marca(r, it)) { hojaPrueba(id); return; }
    // Con teclado (detail 0) se marca directamente aunque esté activado mantener.
    if (D.ajustes.mantener && e.detail !== 0) { aviso('Mantén pulsado para marcarlo'); return; }
    marcar(id); render();
  },
  foto: (b, id) => { S.fotoPara = id; $('#f-foto').click(); },
  ver: (b, id) => hojaPrueba(id),
  desmarcar: (b, id) => dobleToque(b, 'Pulsa otra vez para quitarla', async () => { await desmarcar(id); cerrarHoja(); render(); }),
  reiniciar: (b, id) => {
    const r = rutina(id);
    const fn = async () => { for (const it of r.items) await desmarcar(it.id); render(); aviso('Lista lista para la próxima vez'); };
    if (hechos(r) === r.items.length) fn(); else dobleToque(b, 'Pulsa otra vez para empezar', fn);
  },
  'nueva-rutina': () => {
    const r = { id: uid(), nombre: 'Nueva rutina', e: '⭐', horas: 8, items: [] };
    D.rutinas.push(r); D.actual = r.id; S.edId = r.id; S.vista = 'editar'; guardar(); render();
    const i = $('#r-nombre'); if (i) { i.focus(); i.select(); }
  },
  'editar-rutina': (b, id) => { S.edId = id; S.vista = 'editar'; render(); },
  'ed-rutina': (b, id) => { S.edId = id; render(); },
  horas: (b, id, v) => { rutina(S.edId).horas = +v; editada(); },
  emoji: (b, id) => hojaEmoji(id),
  'poner-emoji': (b, id, v) => {
    const r = rutina(S.edId);
    if (id === 'R') r.e = v; else { const it = r.items.find(x => x.id === id); if (it) it.e = v; }
    guardar(); cerrarHoja(); render();
  },
  subir: (b, id) => { const l = rutina(S.edId).items, i = l.findIndex(x => x.id === id); if (i > 0) { [l[i - 1], l[i]] = [l[i], l[i - 1]]; editada(); } },
  quitar: (b, id) => { const r = rutina(S.edId); r.items = r.items.filter(x => x.id !== id); delete D.marcas[id]; Fotos.quitar(id); editada(); },
  sug: (b, id, v) => { const s = SUGERENCIAS.find(x => x[1] === v); rutina(S.edId).items.push({ id: uid(), e: s ? s[0] : '✔️', t: v }); editada(); },
  'borrar-rutina': (b, id) => dobleToque(b, 'Pulsa otra vez para borrarla', () => {
    const r = rutina(id);
    r.items.forEach(it => { delete D.marcas[it.id]; Fotos.quitar(it.id); });
    D.rutinas = D.rutinas.filter(x => x !== r);
    if (D.actual === id) D.actual = D.rutinas[0] && D.rutinas[0].id;
    S.edId = D.actual; guardar(); render(); aviso('Rutina borrada');
  }),
  'borrar-historial': b => dobleToque(b, 'Pulsa otra vez para borrarlo', () => { D.historial = []; guardar(); render(); })
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-acc]');
  if (!b || b.disabled) return;
  const f = ACC[b.dataset.acc];
  if (f) f(b, b.dataset.id, b.dataset.val, e);
});
$('#velo').addEventListener('click', e => { if (e.target.id === 'velo') cerrarHoja(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && hojaAbierta) cerrarHoja(); });
document.addEventListener('change', e => {
  const a = e.target.dataset.ajuste;
  if (a) { D.ajustes[a] = e.target.checked; guardar(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'r-nombre') { rutina(S.edId).nombre = e.target.value.trim() || 'Rutina'; guardar(); }
  if (e.target.classList.contains('it-txt')) {
    const it = rutina(S.edId).items.find(x => x.id === e.target.dataset.item);
    if (it) { it.t = e.target.value.trim() || it.t; guardar(); }
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'f-anadir') return;
  e.preventDefault();
  const v = $('#nuevo-txt').value.trim(); if (!v) return;
  const s = SUGERENCIAS.find(x => x[1].toLowerCase() === v.toLowerCase());
  rutina(S.edId).items.push({ id: uid(), e: s ? s[0] : '✔️', t: v });
  editada();
  const i = $('#nuevo-txt'); if (i) i.focus();
});

$('#f-foto').addEventListener('change', async e => {
  const f = e.target.files[0], id = S.fotoPara; e.target.value = '';
  if (!f || !id) return;
  try {
    const blob = await comprimir(f);
    const [r, it] = buscarItem(id);
    const t = (r && marca(r, it)) || marcar(id, true);
    await Fotos.poner(id, blob, t);
    if (hojaAbierta) cerrarHoja();
    render(); aviso('Foto guardada como prueba');
  } catch (err) { aviso('No se ha podido guardar la foto'); }
});

// Refresca los "hace X min" y quita las marcas que caducan sin redibujar en mitad de un pulsado.
setInterval(() => {
  if (S.vista !== 'hoy' || hold) return;
  const r = actual(); if (!r) return;
  const caducada = r.items.some(it => D.marcas[it.id] && !marca(r, it) && document.querySelector(`[data-item="${it.id}"].hecho`));
  if (caducada) { render(); return; }
  document.querySelectorAll('.cuando[data-t]').forEach(s => { const t = +s.dataset.t; s.textContent = `Hecho a las ${hora(t)} · ${hace(t)}`; });
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !hojaAbierta && !hold) render(); });

Fotos.cargar().then(render);
render();
