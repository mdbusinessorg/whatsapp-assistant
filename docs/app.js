const FN = 'https://rhcsgnjqdveferhlddgb.supabase.co/functions/v1/wa-panel';
const INSTANCE = 'business';
const qs = new URLSearchParams(location.search);
if (qs.get('token')) { localStorage.waTok = qs.get('token'); history.replaceState(null, '', location.pathname); }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  leads: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.6 0 4.6 1.6 5.4 4.5"/>',
  funnel: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  follow: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  obj: '<path d="M4 7a3 3 0 0 1 3-3h4l2 2h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/>',
  wa: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  act: '<path d="M20 14a3 3 0 0 1-3 3H9l-5 4V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/><path d="M8 8h8M8 12h5"/>',
  more: '<circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>',
  cam: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;
const PRIMARY = [['home', 'Painel'], ['leads', 'Leads'], ['follow', 'Pendentes'], ['act', 'Chat']];
const SECONDARY = [['funnel', 'Funil'], ['obj', 'Objeções'], ['wa', 'WhatsApp']];
const STAGE = { initial_contact: 'Contacto inicial', discovery: 'Descoberta', qualification: 'Qualificação', recommendation: 'Recomendação', value_presentation: 'Valor', objection_handling: 'Objeções', conversion: 'Conversão', confirmation: 'Confirmação', post_sale: 'Pós-venda' };
const CAT = { cold: 'Frio', developing: 'Em desenvolvimento', qualified: 'Qualificado', hot: 'Quente', ready: 'Pronto a comprar' };
const OBJ = { price: 'Preço', no_money: 'Sem dinheiro', think: 'Vou pensar', partner: 'Falar com parceiro', later: 'Mais tarde', wait: 'Esperar', compare: 'Comparar', trust: 'Confiança', fraud: 'Medo de fraude', not_needed: 'Não precisa', not_interested: 'Sem interesse', browsing: 'Só a ver', more_info: 'Mais informação', unsure: 'Indeciso', other_supplier: 'Outro fornecedor', prepayment: 'Pagamento antecipado' };
const STATUS = { open: 'Aberto', won: 'Vendido', lost: 'Perdido', declined: 'Recusou' };
let D = null, ROW = null, NOW = Date.now(), view = 'home', range = 'all', leadFilter = '';
const ago = (t) => { if (!t) return '—'; const m = Math.round((NOW - t) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
const initials = (l) => (l.name || l.num || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const face = (l) => `<span class="face" style="background:hsl(${hue(l.num)} 15% 35%)" title="${esc(l.name || '+' + l.num)}">${esc(initials(l))}</span>`;
function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => (e.style.display = 'none'), 2500); }
function saveTok() { localStorage.waTok = $('tok').value.trim(); load(); }
async function api(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': localStorage.waTok || '' }, body: JSON.stringify(body) });
  if (r.status === 401) { $('login').hidden = false; $('app').hidden = true; throw new Error('401'); }
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
}
async function cmd(c, arg) { await api({ action: 'cmd', instance: INSTANCE, cmd: c, arg }); toast('Enviado — aplica em segundos'); }
function inRange(l) {
  const span = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5 }[range];
  return !span || NOW - (l.lastCustomerAt || l.createdAt) <= span;
}
const nav = $('nav');
const navButton = ([id, label]) => `<button type="button" data-view="${id}" aria-controls="v-${id}">${svg(id)}<span>${label}</span></button>`;
nav.innerHTML = PRIMARY.map(navButton).join('') +
  `<button type="button" id="nav-more" aria-expanded="false" aria-controls="nav-extra">${svg('more')}<span>Mais</span></button>
   <div id="nav-extra">${SECONDARY.map(navButton).join('')}</div>`;
const more = $('nav-more');
const mobileNav = matchMedia('(max-width:850px)');
function closeNav() {
  if (mobileNav.matches && $('nav-extra').contains(document.activeElement)) more.focus();
  more.setAttribute('aria-expanded', 'false');
}
nav.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (button === more) more.setAttribute('aria-expanded', String(more.getAttribute('aria-expanded') !== 'true'));
  else if (button?.dataset.view) {
    go(button.dataset.view);
    if (mobileNav.matches) window.scrollTo(0, 0);
  }
});
nav.addEventListener('keydown', e => {
  if (e.key === 'Escape' && more.getAttribute('aria-expanded') === 'true') { closeNav(); more.focus(); }
});
nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) more.setAttribute('aria-expanded', 'false'); });
document.addEventListener('click', e => { if (!nav.contains(e.target)) closeNav(); });
mobileNav.addEventListener('change', closeNav);
function go(v, f) { closeNav(); view = v; if (f !== undefined) leadFilter = f; render(); }
async function load() {
  try {
    const j = await api({ action: 'get' });
    NOW = Date.parse(j.now) || Date.now();
    ROW = j.instances.find((r) => r.instance === INSTANCE) || null;
    D = ROW?.data || null;
    $('login').hidden = true; $('app').hidden = false;
    render();
  } catch (e) { if (e.message !== '401') toast('Erro: ' + e.message); }
}
