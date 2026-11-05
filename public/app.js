// WebSell Local — tableau de bord (vanilla JS, sans build)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = new Intl.NumberFormat('fr-FR');
const timeFmt = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const ago = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};

async function api(url, body, method) {
  const r = await fetch('/api' + url, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}

function toast(text, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = text;
  $('#toasts').append(el);
  window.gsap?.from(el, { y: 20, opacity: 0, duration: 0.4, ease: 'power3.out' });
  setTimeout(() => (window.gsap ? gsap.to(el, { opacity: 0, y: 10, duration: 0.3, onComplete: () => el.remove() }) : el.remove()), err ? 6000 : 3200);
}

async function busy(btn, fn) {
  const html = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${btn.dataset.busy || 'Patiente…'}`; }
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) { btn.disabled = false; btn.innerHTML = html; } }
}

// ---------------- état ----------------
const S = { state: null, prospects: [], campaigns: [], messages: [], log: [] };
async function load() {
  const [state, prospects, campaigns, messages, log] = await Promise.all([api('/state'), api('/prospects'), api('/campaigns'), api('/messages'), api('/log')]);
  Object.assign(S, { state, prospects, campaigns, messages, log });
  $('#c-prospects').textContent = prospects.length || '';
  $('#c-sites').textContent = state.stats.sites || '';
  $('#c-drafts').textContent = state.scheduler.drafts || '';
  const sch = state.scheduler;
  $('#sidefoot').innerHTML = `
    <span class="pill ${state.aiAvailable ? 'ok' : ''}">IA Claude ${state.aiAvailable ? 'active' : 'off'}</span>
    <span class="pill ${state.settings.dryRun || !state.smtpConfigured ? 'warn' : 'ok'}">${state.settings.dryRun || !state.smtpConfigured ? 'Emails : simulation' : 'Emails : SMTP réel'}</span>
    <span class="pill ${sch.windowOpen ? 'ok' : ''}">${sch.windowOpen ? 'Fenêtre d’envoi ouverte' : 'Hors fenêtre d’envoi'}</span>
    <span class="dim mono">${sch.sentToday}/${sch.dailyLimit} envoyés aujourd’hui</span>`;
}
const P = (id) => S.prospects.find((p) => p.id === id);
const C = (id) => S.campaigns.find((c) => c.id === id);
const STATUS = { new: 'Nouveau', site_ready: 'Site prêt', contacted: 'Contacté', replied: 'A répondu', won: 'Signé', lost: 'Perdu', unsubscribed: 'Désinscrit' };
const MSTATUS = { draft: 'À valider', approved: 'Programmé', sent: 'Envoyé', failed: 'Échec', cancelled: 'Annulé' };
const st = (s, map = STATUS) => `<span class="st ${s}">${map[s] || s}</span>`;

// ---------------- vues ----------------
const views = {};

views.home = () => {
  const s = S.state.stats, set = S.state.settings, sch = S.state.scheduler;
  const name = set.sender.name?.split(' ')[0];
  const steps = [
    { done: !!set.sender.email && !!set.sender.name, t: 'Renseigne ton identité d’expéditeur', d: 'Nom, email, téléphone, mentions légales.', href: '#/reglages' },
    { done: S.state.smtpConfigured, t: 'Branche ton SMTP', d: 'Gmail, OVH, Brevo, Mailjet… (sinon, mode simulation).', href: '#/reglages' },
    { done: S.state.aiAvailable, t: 'Active Claude (optionnel)', d: 'ANTHROPIC_API_KEY dans .env : textes et design sur mesure.', href: '#/reglages' },
    { done: S.campaigns.length > 0, t: 'Lance ta première campagne', d: 'Un métier, une ville. Les prospects arrivent.', href: '#/campagnes' },
    { done: s.sites > 0, t: 'Génère les sites', d: 'Un site design par commerce, en un clic.', href: '#/prospects' },
    { done: s.sent > 0, t: 'Valide et envoie', d: 'Rien ne part sans ton accord.', href: '#/envois' },
  ];
  const pipe = [
    ['Nouveaux', S.prospects.filter((p) => p.status === 'new').length, '#3a3a3f'],
    ['Site prêt', S.prospects.filter((p) => p.status === 'site_ready').length, 'var(--blue)'],
    ['Contactés', s.contacted, 'var(--warn)'],
    ['Réponses', s.replied, '#c79bff'],
    ['Signés', s.won, 'var(--accent)'],
  ];
  const total = pipe.reduce((a, x) => a + x[1], 0);
  return `
  <div class="head">
    <div>
      <span class="eyebrow">Tableau de bord</span>
      <h1 class="title">${name ? `Bonjour ${esc(name)}.` : 'Bonjour.'}<br><em>On vend des sites&nbsp;?</em></h1>
      <p class="lead">Choisis un métier et une ville, l’outil trouve les commerces sans site, leur crée un site design et prépare les emails. Tu valides, il envoie et relance tout seul.</p>
    </div>
    <a class="btn pri lg" href="#/campagnes">+ Nouvelle campagne</a>
  </div>

  <div class="grid g4 reveal-group">
    <div class="card kpi reveal hl"><div class="l">CA signé</div><div class="n" data-count="${s.revenue}">0<small>€</small></div></div>
    <div class="card kpi reveal"><div class="l">Prospects</div><div class="n" data-count="${s.prospects}">0</div><div class="muted mt-s">${s.withEmail} avec email</div></div>
    <div class="card kpi reveal"><div class="l">Sites générés</div><div class="n" data-count="${s.sites}">0</div><div class="muted mt-s">${s.views} vue${s.views > 1 ? 's' : ''} par les prospects</div></div>
    <div class="card kpi reveal"><div class="l">Emails envoyés</div><div class="n" data-count="${s.sent}">0</div><div class="muted mt-s">${s.replied + s.won} réponses</div></div>
  </div>

  <div class="grid g2 mt">
    <div class="card reveal">
      <div class="row"><h3>Pipeline</h3><span class="spacer"></span><span class="mono dim">${total} prospects actifs</span></div>
      <div class="funnel">${total ? pipe.map(([l, n, c]) => n ? `<div style="flex:${n};background:${c}"><span>${n}</span></div>` : '').join('') : '<div style="flex:1;background:#1c1c1f"></div>'}</div>
      <div class="legend">${pipe.map(([l, n, c]) => `<span><i style="background:${c}"></i>${l} · ${n}</span>`).join('')}</div>
      <div class="hr"></div>
      <div class="row">
        <div><div class="l muted" style="font-size:12px">Envoi automatique</div><div style="font:400 28px var(--serif)">${sch.sentToday} / ${sch.dailyLimit} <span class="muted" style="font:500 13px var(--sans)">aujourd’hui</span></div></div>
        <span class="spacer"></span>
        <div style="text-align:right"><span class="pill ${sch.windowOpen ? 'ok' : ''}">${sch.windowOpen ? 'En cours' : 'En pause (hors horaires)'}</span><div class="muted mono mt-s">${sch.queued} programmés · ${sch.drafts} à valider</div></div>
      </div>
    </div>
    <div class="card reveal">
      <div class="row"><h3>Démarrage</h3><span class="spacer"></span><span class="mono dim">${steps.filter((x) => x.done).length}/${steps.length}</span></div>
      ${steps.map((x, i) => `<a class="check ${x.done ? 'done' : ''}" href="${x.href}"><span class="b">${x.done ? '✓' : i + 1}</span><div><h3>${x.t}</h3><div class="muted" style="font-size:13px">${x.d}</div></div></a>`).join('')}
    </div>
  </div>

  <div class="card mt reveal">
    <div class="row"><h3>Activité récente</h3></div>
    <div class="log mt-s">${S.log.length ? S.log.slice(0, 12).map((l) => `<div><time>${ago(l.at)}</time><span>${esc(l.text)}</span></div>`).join('') : '<p class="muted mt-s">Rien pour l’instant. Lance une campagne pour commencer.</p>'}</div>
  </div>`;
};

// ---- Campagnes
const W = { trade: 'coiffeur', city: '', price: 490, results: null, selected: new Set(), searching: false };
views.campagnes = () => {
  const trades = S.state.trades;
  return `
  <div class="head">
    <div><span class="eyebrow">Campagnes</span><h1 class="title">Un métier. Une ville.<br><em>Des clients.</em></h1></div>
  </div>
  <div class="steps reveal">
    <div><div class="num">01</div><h3 class="mt-s">Choisis la cible</h3><p class="muted">Recherche des commerces sans site sur OpenStreetMap.</p></div>
    <div><div class="num">02</div><h3 class="mt-s">Génère les sites</h3><p class="muted">Un site vitrine design par commerce, avec ses vraies infos.</p></div>
    <div><div class="num">03</div><h3 class="mt-s">Valide & encaisse</h3><p class="muted">Emails + relances auto. Le client te paie directement.</p></div>
  </div>

  <div class="card mt reveal">
    <h2 class="sub">Nouvelle recherche</h2>
    <div class="chips" id="trade-chips">${Object.entries(trades).map(([k, t]) => `<button class="chip ${W.trade === k ? 'on' : ''}" data-act="pick-trade" data-k="${k}">${esc(t.label)}</button>`).join('')}
      <button class="chip ${trades[W.trade] ? '' : 'on'}" data-act="custom-trade">Autre (tag OSM)…</button></div>
    <div class="form two mt">
      <label class="f">Ville<input class="in" id="w-city" placeholder="Lyon, Nantes, Liège…" value="${esc(W.city)}"></label>
      <label class="f">Ton prix (€)<input class="in" id="w-price" type="number" min="0" value="${W.price}"></label>
      <label class="f" style="justify-content:end"><button class="btn pri lg" data-act="search" data-busy="Recherche sur OpenStreetMap…">Trouver les commerces sans site →</button></label>
    </div>
    <p class="note mt-s">Source : <b>OpenStreetMap</b> (ODbL). Seuls les commerces <b>sans site web renseigné</b> sont listés : vérifie quand même avant d’envoyer. Pas de résultat ? Ajoute tes prospects à la main ou importe un CSV depuis l’onglet Prospects.</p>
    <div id="results">${renderResults()}</div>
  </div>

  <h2 class="sub mt" style="margin-top:56px">Mes campagnes</h2>
  ${S.campaigns.length ? `<div class="grid g2">${S.campaigns.map(campaignCard).join('')}</div>` : '<div class="empty"><div class="big">Aucune campagne</div>Lance une recherche ci-dessus.</div>'}`;
};

function renderResults() {
  if (!W.results) return '';
  const r = W.results;
  if (!r.results.length) return `<div class="empty mt"><div class="big">Aucun résultat</div>Essaie une ville plus grande ou un autre métier.</div>`;
  return `
    <div class="row mt"><h3>${r.results.length} commerces sans site à ${esc(r.city)}</h3><span class="spacer"></span>
      <span class="muted">${W.selected.size} sélectionnés</span>
      <button class="btn sm" data-act="sel-email">Avec email</button><button class="btn sm" data-act="sel-all">Tout</button><button class="btn sm ghost" data-act="sel-none">Aucun</button>
      <button class="btn pri" data-act="create-campaign" ${W.selected.size ? '' : 'disabled'}>Créer la campagne (${W.selected.size}) →</button></div>
    <div class="tbl-wrap mt-s"><table class="t"><thead><tr><th></th><th>Commerce</th><th>Adresse</th><th>Contact</th><th>Fiabilité</th><th>Source</th></tr></thead><tbody>
    ${r.results.map((x, i) => `<tr><td><input type="checkbox" class="ck" data-act="sel" data-i="${i}" ${W.selected.has(i) ? 'checked' : ''} ${x.known ? 'disabled' : ''}></td>
      <td class="name">${esc(x.name)}${x.known ? ' <span class="tag">déjà ajouté</span>' : ''}</td><td class="muted">${esc(x.address || '—')}</td>
      <td><span class="tag ${x.email ? 'ok' : 'no'}">email</span> <span class="tag ${x.phone ? 'ok' : 'no'}">tél</span></td>
      <td class="muted" style="font-size:12px">${esc(x.reliability)}</td><td><a class="mono muted" href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">OSM ↗</a></td></tr>`).join('')}
    </tbody></table></div>`;
}

function campaignCard(c) {
  const ps = S.prospects.filter((p) => p.campaignId === c.id);
  const ms = S.messages.filter((m) => m.campaignId === c.id);
  const n = (f) => ps.filter(f).length;
  return `<div class="card reveal">
    <div class="row"><span class="eyebrow">${esc(S.state.trades[c.trade]?.label || c.trade)} · ${esc(c.city)}</span><span class="spacer"></span><span class="pill acc">${fmt.format(c.price)} €</span></div>
    <h2 class="sub mt-s" style="margin-bottom:6px">${esc(c.name)}</h2>
    <div class="muted mono">Créée ${ago(c.createdAt)} · ${c.sequence.length} emails dans la séquence</div>
    <div class="grid g4 mt" style="grid-template-columns:repeat(4,1fr);gap:8px">
      ${[['Prospects', ps.length], ['Sites', n((p) => p.siteSlug)], ['Envoyés', ms.filter((m) => m.status === 'sent' && m.step === 0).length], ['Signés', n((p) => p.status === 'won')]].map(([l, v]) => `<div><div style="font:400 34px/1 var(--serif)">${v}</div><div class="muted" style="font-size:12px">${l}</div></div>`).join('')}
    </div>
    <div class="row mt">
      <button class="btn sm pri" data-act="gen-campaign" data-id="${c.id}" ${n((p) => !p.siteSlug) ? '' : 'disabled'}>Générer ${n((p) => !p.siteSlug)} site(s)</button>
      <button class="btn sm" data-act="drafts" data-id="${c.id}">Préparer les emails</button>
      <button class="btn sm" data-act="edit-seq" data-id="${c.id}">Séquence & relances</button>
      <a class="btn sm ghost" href="#/prospects?c=${c.id}">Voir les prospects</a>
      <span class="spacer"></span><button class="btn sm ghost danger" data-act="del-campaign" data-id="${c.id}">Supprimer</button>
    </div>
  </div>`;
}

// ---- Prospects
const PF = { q: '', status: '', campaign: '' };
views.prospects = (params) => {
  if (params.get('c')) PF.campaign = params.get('c');
  const list = S.prospects.filter((p) => (!PF.status || p.status === PF.status) && (!PF.campaign || p.campaignId === PF.campaign)
    && (!PF.q || `${p.name} ${p.city} ${p.email} ${p.address}`.toLowerCase().includes(PF.q.toLowerCase())));
  return `
  <div class="head">
    <div><span class="eyebrow">Prospects</span><h1 class="title">${S.prospects.length} commerces<br><em>à convaincre.</em></h1></div>
    <div class="row"><button class="btn" data-act="import">Importer un CSV</button><button class="btn pri" data-act="new-prospect">+ Ajouter</button></div>
  </div>
  <div class="row reveal">
    <input class="in" style="max-width:280px" placeholder="Rechercher…" id="pf-q" value="${esc(PF.q)}">
    <select class="in" style="max-width:190px" id="pf-status"><option value="">Tous les statuts</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${PF.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select class="in" style="max-width:240px" id="pf-campaign"><option value="">Toutes les campagnes</option>${S.campaigns.map((c) => `<option value="${c.id}" ${PF.campaign === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <span class="spacer"></span>
    <button class="btn" data-act="gen-visible" data-busy="Mise en file…">Générer les sites manquants (${list.filter((p) => !p.siteSlug).length})</button>
  </div>
  ${list.length ? `<div class="tbl-wrap mt reveal"><table class="t"><thead><tr><th>Commerce</th><th>Ville</th><th>Email</th><th>Site</th><th>Statut</th><th>Vues</th></tr></thead><tbody>
    ${list.map((p) => `<tr class="click" data-act="open-prospect" data-id="${p.id}">
      <td><div class="name">${esc(p.name)}</div><div class="muted" style="font-size:12px">${esc(p.tradeLabel || p.trade || '')}</div></td>
      <td class="muted">${esc(p.city || '')}</td>
      <td>${p.email ? `<span class="mono">${esc(p.email)}</span>` : '<span class="tag no">manquant</span>'}</td>
      <td>${p.siteSlug ? `<a class="tag ok" href="/s/${p.siteSlug}/" target="_blank" data-stop>${esc(S.state.themes[p.theme] || p.theme)} ↗</a>` : jobBadge(p.id)}</td>
      <td>${st(p.status)}</td><td class="mono muted">${p.views || 0}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty mt"><div class="big">Aucun prospect</div>Lance une campagne ou ajoute-en à la main.</div>'}`;
};
function jobBadge(pid) {
  const j = S.state.jobs.find((x) => x.prospectId === pid);
  if (!j) return '<span class="tag">—</span>';
  if (j.status === 'error') return `<span class="tag" style="color:var(--bad)" title="${esc(j.error)}">erreur</span>`;
  return `<span class="tag" style="color:var(--warn)">${j.status === 'running' ? 'génération…' : 'en file'}</span>`;
}

// ---- Sites
views.sites = () => {
  const list = S.prospects.filter((p) => p.siteSlug);
  return `
  <div class="head"><div><span class="eyebrow">Sites</span><h1 class="title">La galerie.<br><em>${list.length} sites</em> prêts à vendre.</h1></div></div>
  ${list.length ? `<div class="grid g3">${list.map((p) => `
    <div class="site-card reveal">
      <a class="thumb" href="/s/${p.siteSlug}/" target="_blank">${p.hasPreview ? `<img loading="lazy" src="/s/${p.siteSlug}/preview.png?${encodeURIComponent(p.siteAt || '')}" alt="">` : `<iframe loading="lazy" src="/s/${p.siteSlug}/?clean=1" tabindex="-1"></iframe>`}</a>
      <div class="meta"><div><div class="name" style="font-weight:600">${esc(p.name)}</div><div class="muted" style="font-size:12px">${esc(S.state.themes[p.theme] || '')} · ${esc(p.city || '')} · ${p.views || 0} vue${p.views > 1 ? 's' : ''}</div></div>
      <span class="spacer"></span><button class="btn sm" data-act="open-prospect" data-id="${p.id}">Éditer</button></div>
    </div>`).join('')}</div>` : '<div class="empty"><div class="big">Pas encore de site</div>Génère-les depuis une campagne ou la liste des prospects.</div>'}`;
};

// ---- Envois
let MTAB = 'draft';
views.envois = () => {
  const counts = Object.fromEntries(Object.keys(MSTATUS).map((k) => [k, S.messages.filter((m) => m.status === k).length]));
  const list = S.messages.filter((m) => m.status === MTAB).sort((a, b) => (MTAB === 'approved' ? (a.scheduledAt || '').localeCompare(b.scheduledAt || '') : 0));
  const set = S.state.settings;
  return `
  <div class="head">
    <div><span class="eyebrow">Envois</span><h1 class="title">Rien ne part<br><em>sans ton accord.</em></h1>
    <p class="lead">Valide les premiers emails. Les relances suivent automatiquement (si activé dans la campagne) et s’arrêtent dès qu’un prospect répond, signe ou se désinscrit.</p></div>
    ${set.dryRun || !S.state.smtpConfigured ? '<span class="pill warn">Mode simulation : les emails sont écrits dans data/outbox</span>' : '<span class="pill ok">SMTP réel actif</span>'}
  </div>
  <div class="row">
    <div class="tabs">${Object.entries(MSTATUS).map(([k, v]) => `<button class="${MTAB === k ? 'on' : ''}" data-act="mtab" data-k="${k}">${v}<b>${counts[k]}</b></button>`).join('')}</div>
    <span class="spacer"></span>
    ${MTAB === 'draft' && list.length ? `<button class="btn pri" data-act="approve-all">Tout valider (${list.length})</button>` : ''}
  </div>
  <div class="grid mt">${list.length ? list.slice(0, 200).map(msgCard).join('') : `<div class="empty"><div class="big">Rien ici</div>${MTAB === 'draft' ? 'Prépare des emails depuis une campagne.' : ''}</div>`}</div>`;
};
function msgCard(m) {
  const p = P(m.prospectId) || {};
  const c = C(m.campaignId);
  const editable = ['draft', 'approved', 'failed'].includes(m.status);
  return `<div class="msg reveal" data-mid="${m.id}">
    <div class="top">${st(m.status, MSTATUS)}<span class="tag">Email ${m.step + 1}/${c?.sequence.length || '?'}</span>
      <b>${esc(p.name || '—')}</b><span class="mono muted">${esc(m.to)}</span><span class="spacer"></span>
      <span class="muted mono">${m.status === 'sent' ? `envoyé ${timeFmt(m.sentAt)}${m.simulated ? ' (simulation)' : ''}` : m.scheduledAt ? `prévu ${timeFmt(m.scheduledAt)}` : ''}</span></div>
    ${m.error ? `<div class="note" style="color:var(--bad)">${esc(m.error)}</div>` : ''}
    ${editable ? `<input class="in subj" data-f="subject" value="${esc(m.subject)}"><textarea class="in" data-f="body">${esc(m.body)}</textarea>` : `<div class="subj">${esc(m.subject)}</div><div class="muted" style="white-space:pre-wrap;font-size:13.5px">${esc(m.body)}</div>`}
    <div class="row">
      ${editable ? `<button class="btn sm" data-act="save-msg">Enregistrer</button>` : ''}
      <a class="btn sm ghost" href="/api/messages/${m.id}/preview" target="_blank">Aperçu HTML ↗</a>
      ${p.siteSlug ? `<a class="btn sm ghost" href="/s/${p.siteSlug}/" target="_blank">Site ↗</a>` : ''}
      <span class="spacer"></span>
      ${editable ? `<button class="btn sm ghost danger" data-act="cancel-msg">Annuler</button>` : ''}
      ${editable ? `<button class="btn sm" data-act="send-now" data-busy="Envoi…">Envoyer maintenant</button>` : ''}
      ${m.status === 'draft' ? `<button class="btn sm pri" data-act="approve-msg">Valider ✓</button>` : ''}
    </div>
  </div>`;
}

// ---- Réglages
views.reglages = () => {
  const s = S.state.settings;
  const sw = (path, val, label) => `<label class="switch"><input type="checkbox" data-path="${path}" ${val ? 'checked' : ''}>${label}</label>`;
  const inp = (path, val, label, type = 'text', ph = '') => `<label class="f">${label}<input class="in" data-path="${path}" type="${type}" value="${esc(val ?? '')}" placeholder="${esc(ph)}"></label>`;
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return `
  <div class="head"><div><span class="eyebrow">Réglages</span><h1 class="title">Ta machine,<br><em>tes règles.</em></h1></div>
    <button class="btn pri lg" data-act="save-settings" data-busy="Enregistrement…">Enregistrer</button></div>

  <div class="grid g2">
    <div class="card reveal"><h2 class="sub">Expéditeur</h2><div class="form two">
      ${inp('sender.name', s.sender.name, 'Nom complet', 'text', 'Marie Dupont')}
      ${inp('sender.company', s.sender.company, 'Nom commercial', 'text', 'Studio Dupont')}
      ${inp('sender.email', s.sender.email, 'Email d’envoi', 'email', 'contact@…')}
      ${inp('sender.phone', s.sender.phone, 'Téléphone', 'tel')}
    </div><div class="form mt-s">
      <label class="f">Signature<textarea class="in" style="min-height:80px" data-path="sender.signature" placeholder="Marie Dupont&#10;Studio Dupont — sites pour commerces">${esc(s.sender.signature)}</textarea></label>
      ${inp('sender.legal', s.sender.legal, 'Mentions légales (pied d’email)', 'text', 'Marie Dupont EI — SIRET … — adresse')}
    </div></div>

    <div class="card reveal"><h2 class="sub">Envoi des emails</h2><div class="form two">
      ${inp('smtp.host', s.smtp.host, 'Serveur SMTP', 'text', 'smtp.gmail.com')}
      ${inp('smtp.port', s.smtp.port, 'Port', 'number')}
      ${inp('smtp.user', s.smtp.user, 'Utilisateur')}
      ${inp('smtp.pass', s.smtp.pass, 'Mot de passe / mot de passe d’application', 'password')}
    </div><div class="form mt-s">
      ${sw('smtp.secure', s.smtp.secure, 'Connexion SSL directe (port 465)')}
      ${sw('dryRun', s.dryRun, '<b>Mode simulation</b> : n’envoie rien, écrit les emails dans data/outbox')}
      <div class="row"><button class="btn sm" data-act="smtp-verify" data-busy="Connexion…">Tester la connexion</button><button class="btn sm" data-act="smtp-test" data-busy="Envoi…">M’envoyer un email test</button></div>
    </div></div>

    <div class="card reveal"><h2 class="sub">Rythme & horaires</h2><div class="form two">
      ${inp('sending.dailyLimit', s.sending.dailyLimit, 'Emails max / jour', 'number')}
      ${inp('sending.minGapSeconds', s.sending.minGapSeconds, 'Délai mini entre 2 emails (s)', 'number')}
      ${inp('sending.windowStart', s.sending.windowStart, 'Début (heure)', 'number')}
      ${inp('sending.windowEnd', s.sending.windowEnd, 'Fin (heure)', 'number')}
    </div><div class="chips mt-s" id="days">${days.map((d, i) => `<button class="chip ${s.sending.days.includes(i) ? 'on' : ''}" data-act="day" data-d="${i}">${d}</button>`).join('')}</div>
    <p class="note mt-s">Petits volumes, envois espacés et horaires de bureau = meilleure délivrabilité. Commence à 20-30 par jour.</p></div>

    <div class="card reveal"><h2 class="sub">Liens publics</h2><div class="form">
      ${inp('publicBaseUrl', s.publicBaseUrl, 'URL publique (tunnel ou domaine)', 'url', 'https://xxxx.trycloudflare.com')}
      <p class="note">Sans URL publique, l’email contient une <b>capture du site</b> (si Playwright est installé). Avec une URL (ex. <span class="mono">cloudflared tunnel --url http://localhost:3000</span>), le prospect clique et voit le site animé. Seuls les sites et la page de désinscription sont exposés, jamais ce tableau de bord.</p>
      ${inp('search.countryCodes', s.search.countryCodes, 'Pays de recherche (codes ISO)', 'text', 'fr,be,ch')}
    </div></div>

    <div class="card reveal hl"><h2 class="sub">IA Claude</h2>
      <p class="muted">${S.state.aiAvailable ? '<span class="pill ok">Clé API détectée</span>' : '<span class="pill warn">Ajoute ANTHROPIC_API_KEY dans .env puis relance</span>'}</p>
      <div class="form mt-s">
      ${sw('ai.enabled', s.ai.enabled, 'Utiliser Claude pour générer les sites')}
      <label class="f">Mode<select class="in" data-path="ai.mode">
        <option value="copy" ${s.ai.mode === 'copy' ? 'selected' : ''}>Textes sur mesure + thèmes maison (rapide, fiable)</option>
        <option value="full" ${s.ai.mode === 'full' ? 'selected' : ''}>Design complet par Claude, guidé par tes skills (unique, plus long)</option></select></label>
      <div class="form two">
        ${inp('ai.model', s.ai.model, 'Modèle')}
        <label class="f">Effort<select class="in" data-path="ai.effort">${['low', 'medium', 'high', 'xhigh', 'max'].map((e) => `<option ${s.ai.effort === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      </div>
      <label class="f">Dossiers de skills (un par ligne)<textarea class="in" style="min-height:70px" data-path="ai.skillsDirs" data-lines>${esc(s.ai.skillsDirs.join('\n'))}</textarea></label>
      <div id="skills"><p class="muted">Chargement des skills…</p></div>
    </div></div>

    <div class="card reveal"><h2 class="sub">Bibliothèques des sites</h2><div class="form">
      ${inp('libs.gsap', s.libs.gsap, 'GSAP')}
      ${inp('libs.scrollTrigger', s.libs.scrollTrigger, 'ScrollTrigger')}
      ${inp('libs.lenis', s.libs.lenis, 'Lenis (scroll fluide)')}
      ${inp('libs.splitType', s.libs.splitType, 'SplitType (titres animés)')}
      <label class="f">Balises supplémentaires injectées dans chaque site<textarea class="in" style="min-height:70px;font-family:var(--mono);font-size:12px" data-path="libs.extra" placeholder='<script src="https://cdn.jsdelivr.net/npm/…"></script>'>${esc(s.libs.extra)}</textarea></label>
      <div class="row"><button class="btn sm ghost" data-act="reset-libs">Rétablir les valeurs par défaut</button></div>
    </div></div>
  </div>`;
};

async function loadSkills() {
  const box = $('#skills');
  if (!box) return;
  const { skills, enabled } = await api('/skills');
  box.innerHTML = skills.length
    ? `<div class="muted" style="font-size:12.5px;margin-bottom:8px">${skills.length} skill(s) trouvé(s). Coche ceux à injecter dans le prompt de design :</div>
       ${skills.map((k) => `<label class="switch" style="align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-skill="${esc(k.path)}" ${enabled.includes(k.path) ? 'checked' : ''}><span><b>${esc(k.name)}</b><br><span class="muted" style="font-size:12.5px">${esc(k.description || k.path)}</span></span></label>`).join('')}`
    : '<p class="note">Aucun SKILL.md trouvé dans ces dossiers.</p>';
}

// ---------------- tiroirs ----------------
function openDrawer(html) {
  $('#drawer').innerHTML = `<button class="btn sm x" data-act="close">Fermer ✕</button>${html}`;
  $('#drawer').classList.add('on');
  $('#drawer-bg').classList.add('on');
  $('#drawer').scrollTop = 0;
}
function closeDrawer() { $('#drawer').classList.remove('on'); $('#drawer-bg').classList.remove('on'); }

function prospectDrawer(p) {
  const msgs = S.messages.filter((m) => m.prospectId === p.id);
  const themes = S.state.themes;
  const copy = p.copy || {};
  openDrawer(`
    <span class="eyebrow">${esc(p.tradeLabel || p.trade || '')} · ${esc(p.source || '')}</span>
    <h1 class="title" style="font-size:52px">${esc(p.name)}</h1>
    <div class="row mt-s">${st(p.status)}${p.sourceUrl ? `<a class="tag" href="${esc(p.sourceUrl)}" target="_blank">fiche source ↗</a>` : ''}${p.reliability ? `<span class="tag">${esc(p.reliability)}</span>` : ''}</div>

    <div class="card mt" style="padding:0">
      ${p.siteSlug ? `<a class="thumb" href="/s/${p.siteSlug}/" target="_blank" style="border-radius:16px 16px 0 0">${p.hasPreview ? `<img src="/s/${p.siteSlug}/preview.png?${Date.now()}" alt="">` : `<iframe src="/s/${p.siteSlug}/?clean=1"></iframe>`}</a>` : '<div class="empty" style="border:0">Pas encore de site</div>'}
      <div style="padding:16px" class="form">
        <div class="row">
          <select class="in" id="d-theme" style="max-width:180px"><option value="">Thème auto</option>${Object.entries(themes).map(([k, v]) => `<option value="${k}" ${p.theme === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select class="in" id="d-mode" style="max-width:220px"><option value="template">Modèle maison</option>${S.state.aiAvailable ? `<option value="copy" ${S.state.settings.ai.mode === 'copy' ? 'selected' : ''}>IA : textes sur mesure</option><option value="full" ${S.state.settings.ai.mode === 'full' ? 'selected' : ''}>IA : design complet</option>` : ''}</select>
          <button class="btn pri" data-act="gen-one" data-id="${p.id}" data-busy="Mise en file…">${p.siteSlug ? 'Régénérer' : 'Générer le site'}</button>
        </div>
        ${p.siteSlug ? `<div class="row"><a class="btn sm" href="/s/${p.siteSlug}/" target="_blank">Ouvrir ↗</a><a class="btn sm" href="/sites/${p.siteSlug}/download">Télécharger le HTML (version livrable)</a></div>` : ''}
      </div>
    </div>

    ${p.siteSlug ? `<details class="card mt"><summary style="cursor:pointer;font-weight:600">Retoucher les textes du site</summary><div class="form mt-s" id="copy-form">
      ${['kicker', 'headline', 'tagline', 'intro', 'spiritTitle', 'spirit', 'cta'].map((k) => `<label class="f">${{ kicker: 'Sur-titre', headline: 'Titre', tagline: 'Accroche', intro: 'Intro prestations', spiritTitle: 'Titre « esprit »', spirit: 'Texte « esprit »', cta: 'Appel à l’action' }[k]}<input class="in" data-c="${k}" value="${esc(copy[k] ?? '')}"></label>`).join('')}
      <label class="f">Prestations (une par ligne, « Titre | description »)<textarea class="in" data-c="services">${esc((copy.services || []).map((s) => (s.text ? `${s.title} | ${s.text}` : s.title)).join('\n'))}</textarea></label>
      <button class="btn pri" data-act="save-copy" data-id="${p.id}" data-busy="Re-rendu…">Appliquer au site</button></div></details>` : ''}

    <div class="card mt"><h3>Fiche</h3><div class="form two mt-s" id="p-form">
      ${[['name', 'Nom'], ['email', 'Email'], ['phone', 'Téléphone'], ['city', 'Ville'], ['address', 'Adresse'], ['hours', 'Horaires (format OSM)'], ['dealPrice', 'Prix négocié (€)']].map(([k, l]) => `<label class="f">${l}<input class="in" data-k="${k}" value="${esc(p[k] ?? '')}"></label>`).join('')}
      <label class="f">Statut<select class="in" data-k="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div><div class="form mt-s">
      <label class="f">Prestations réelles (une par ligne, remplace les prestations types du métier)<textarea class="in" style="min-height:90px" data-k="services">${esc((p.services || []).join('\n'))}</textarea></label>
      <label class="f">Notes (transmises à l’IA comme contexte factuel)<textarea class="in" style="min-height:70px" data-k="notes">${esc(p.notes || '')}</textarea></label>
      <div class="row"><button class="btn pri" data-act="save-prospect" data-id="${p.id}">Enregistrer</button><span class="spacer"></span><button class="btn ghost danger" data-act="del-prospect" data-id="${p.id}">Supprimer</button></div>
    </div></div>

    <div class="card mt"><h3>Historique des emails</h3>
      ${msgs.length ? msgs.map((m) => `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)">${st(m.status, MSTATUS)}<span>${esc(m.subject)}</span><span class="spacer"></span><span class="mono muted">${timeFmt(m.sentAt || m.scheduledAt || m.createdAt)}</span></div>`).join('') : '<p class="muted mt-s">Aucun email pour l’instant.</p>'}
    </div>`);
}

function sequenceDrawer(c) {
  openDrawer(`
    <span class="eyebrow">Séquence</span><h1 class="title" style="font-size:52px">${esc(c.name)}</h1>
    <div class="form two mt">
      <label class="f">Nom<input class="in" id="sq-name" value="${esc(c.name)}"></label>
      <label class="f">Prix proposé (€)<input class="in" id="sq-price" type="number" value="${c.price}"></label>
    </div>
    <label class="switch mt-s"><input type="checkbox" id="sq-auto" ${c.autoFollowups ? 'checked' : ''}>Relances validées automatiquement (sinon elles arrivent dans « À valider »)</label>
    <p class="note mt-s">Variables : <span class="mono">{{entreprise}} {{metier}} {{ville}} {{lien_site}} {{prix}} {{expediteur}} {{prenom_expediteur}} {{societe}} {{telephone}} {{signature}}</span>. Le lien de désinscription et tes mentions légales sont ajoutés automatiquement.</p>
    <div id="sq-steps">${c.sequence.map((s, i) => seqStep(s, i)).join('')}</div>
    <div class="row mt"><button class="btn" data-act="seq-add">+ Ajouter une relance</button><span class="spacer"></span><button class="btn pri" data-act="seq-save" data-id="${c.id}">Enregistrer</button></div>`);
}
const seqStep = (s, i) => `<div class="card mt seq-step">
  <div class="row"><b>${i === 0 ? 'Premier email' : `Relance ${i}`}</b><span class="spacer"></span>
  ${i === 0 ? '' : `<label class="f" style="flex-direction:row;align-items:center">J+<input class="in" style="width:70px" type="number" min="1" data-s="delayDays" value="${s.delayDays}"> après le précédent</label><button class="btn sm ghost danger" data-act="seq-del">✕</button>`}</div>
  <div class="form mt-s"><input class="in" data-s="subject" value="${esc(s.subject)}"><textarea class="in" style="min-height:180px" data-s="body">${esc(s.body)}</textarea></div></div>`;

// ---------------- actions ----------------
const A = {
  close: closeDrawer,
  'pick-trade': (el) => { W.trade = el.dataset.k; $$('#trade-chips .chip').forEach((c) => c.classList.toggle('on', c === el)); },
  'custom-trade': (el) => {
    const t = prompt('Tag OpenStreetMap (ex : shop=bicycle, craft=roofer, amenity=dentist)', '');
    if (t) { W.trade = t.trim(); $$('#trade-chips .chip').forEach((c) => c.classList.toggle('on', c === el)); el.textContent = t; }
  },
  search: (el) => busy(el, async () => {
    W.city = $('#w-city').value.trim(); W.price = Number($('#w-price').value) || 0;
    W.results = await api('/search', { trade: W.trade, city: W.city });
    W.selected = new Set(W.results.results.map((r, i) => (r.email && !r.known ? i : -1)).filter((i) => i >= 0));
    $('#results').innerHTML = renderResults();
    animateIn($('#results'));
  }),
  sel: (el) => { const i = +el.dataset.i; el.checked ? W.selected.add(i) : W.selected.delete(i); $('#results').innerHTML = renderResults(); },
  'sel-all': () => { W.selected = new Set(W.results.results.map((r, i) => (r.known ? -1 : i)).filter((i) => i >= 0)); $('#results').innerHTML = renderResults(); },
  'sel-email': () => { W.selected = new Set(W.results.results.map((r, i) => (r.email && !r.known ? i : -1)).filter((i) => i >= 0)); $('#results').innerHTML = renderResults(); },
  'sel-none': () => { W.selected.clear(); $('#results').innerHTML = renderResults(); },
  'create-campaign': (el) => busy(el, async () => {
    const c = await api('/campaigns', { trade: W.trade, city: W.results.city || W.city, price: W.price });
    const items = [...W.selected].map((i) => W.results.results[i]);
    const r = await api('/prospects/bulk', { items, campaignId: c.id });
    W.results = null; W.selected.clear();
    toast(`Campagne créée avec ${r.added} prospects. Génère maintenant leurs sites.`);
    await refresh();
  }),
  'gen-campaign': (el) => busy(el, async () => {
    const ids = S.prospects.filter((p) => p.campaignId === el.dataset.id && !p.siteSlug).map((p) => p.id);
    await api('/generate', { ids });
    toast(`${ids.length} site(s) en cours de génération…`);
    await refresh();
  }),
  'gen-visible': (el) => busy(el, async () => {
    const ids = $$('[data-act="open-prospect"]').map((r) => r.dataset.id).filter((id) => !P(id)?.siteSlug);
    if (!ids.length) return toast('Tous les prospects affichés ont déjà un site.');
    await api('/generate', { ids });
    toast(`${ids.length} site(s) en file de génération.`);
    await refresh();
  }),
  'gen-one': (el) => busy(el, async () => {
    await api('/generate', { ids: [el.dataset.id], theme: $('#d-theme').value || null, mode: $('#d-mode').value });
    toast('Génération lancée. L’aperçu se mettra à jour.');
    closeDrawer();
    await refresh();
  }),
  drafts: (el) => busy(el, async () => {
    const r = await api(`/campaigns/${el.dataset.id}/drafts`, {});
    const sk = r.skipped;
    toast(`${r.created} email(s) à valider. Ignorés : ${sk.noEmail} sans email, ${sk.noSite} sans site, ${sk.already} déjà contactés.`);
    if (r.created) { MTAB = 'draft'; location.hash = '#/envois'; } else await refresh();
  }),
  'edit-seq': (el) => sequenceDrawer(C(el.dataset.id)),
  'seq-add': () => {
    const n = $$('.seq-step').length;
    $('#sq-steps').insertAdjacentHTML('beforeend', seqStep({ delayDays: 5, subject: 'Re: {{entreprise}}', body: 'Bonjour,\n\n\n{{signature}}' }, n));
  },
  'seq-del': (el) => el.closest('.seq-step').remove(),
  'seq-save': (el) => busy(el, async () => {
    const sequence = $$('.seq-step').map((s, i) => ({ delayDays: i === 0 ? 0 : Number($('[data-s=delayDays]', s)?.value) || 1, subject: $('[data-s=subject]', s).value, body: $('[data-s=body]', s).value }));
    await api(`/campaigns/${el.dataset.id}`, { name: $('#sq-name').value, price: Number($('#sq-price').value), autoFollowups: $('#sq-auto').checked, sequence }, 'PATCH');
    toast('Séquence enregistrée. Elle s’applique aux prochains brouillons.');
    closeDrawer(); await refresh();
  }),
  'del-campaign': async (el) => {
    if (!confirm('Supprimer cette campagne ? Les emails non envoyés seront annulés (les prospects sont conservés).')) return;
    await api(`/campaigns/${el.dataset.id}`, null, 'DELETE'); await refresh();
  },
  'open-prospect': (el, ev) => { if (ev.target.closest('[data-stop]')) return; prospectDrawer(P(el.dataset.id)); },
  'new-prospect': () => {
    openDrawer(`<span class="eyebrow">Nouveau prospect</span><h1 class="title" style="font-size:52px">Ajouter un commerce</h1>
      <div class="form two mt" id="np">
        <label class="f">Nom *<input class="in" data-k="name"></label>
        <label class="f">Métier<select class="in" data-k="trade">${Object.entries(S.state.trades).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}</select></label>
        <label class="f">Ville<input class="in" data-k="city"></label><label class="f">Adresse<input class="in" data-k="address"></label>
        <label class="f">Email<input class="in" data-k="email" type="email"></label><label class="f">Téléphone<input class="in" data-k="phone"></label>
        <label class="f">Horaires (ex : Mo-Fr 09:00-19:00; Sa 09:00-12:00)<input class="in" data-k="hours"></label>
        <label class="f">Campagne<select class="in" data-k="campaignId"><option value="">—</option>${S.campaigns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      </div><button class="btn pri mt" data-act="create-prospect">Ajouter</button>`);
  },
  'create-prospect': async () => {
    const data = Object.fromEntries($$('#np [data-k]').map((i) => [i.dataset.k, i.value.trim()]));
    try { const p = await api('/prospects', data); toast('Prospect ajouté.'); await refresh(); prospectDrawer(P(p.id)); } catch (e) { toast(e.message, true); }
  },
  import: () => {
    openDrawer(`<span class="eyebrow">Import</span><h1 class="title" style="font-size:52px">Importer un CSV</h1>
      <p class="lead">Colonnes reconnues : <span class="mono">nom, email, telephone, adresse, ville, metier, horaires, notes</span> (séparateur , ou ;).</p>
      <div class="form mt">
        <input type="file" accept=".csv,text/csv" class="in" id="imp-file">
        <textarea class="in" id="imp-csv" placeholder="nom;email;telephone;ville&#10;Salon Léa;contact@salonlea.fr;0478000000;Lyon"></textarea>
        <div class="form two">
          <label class="f">Métier par défaut<select class="in" id="imp-trade">${Object.entries(S.state.trades).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}</select></label>
          <label class="f">Campagne<select class="in" id="imp-c"><option value="">—</option>${S.campaigns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        </div>
        <button class="btn pri" data-act="do-import">Importer</button>
      </div>`);
    $('#imp-file').addEventListener('change', async (e) => { $('#imp-csv').value = await e.target.files[0].text(); });
  },
  'do-import': async () => {
    try {
      const r = await api('/prospects/import', { csv: $('#imp-csv').value, trade: $('#imp-trade').value, campaignId: $('#imp-c').value || undefined });
      toast(`${r.added} prospect(s) importé(s).`); closeDrawer(); await refresh();
    } catch (e) { toast(e.message, true); }
  },
  'save-prospect': async (el) => {
    const data = Object.fromEntries($$('#p-form [data-k], .drawer textarea[data-k]').map((i) => [i.dataset.k, i.value]));
    data.services = data.services.split('\n').map((s) => s.trim()).filter(Boolean);
    try { await api(`/prospects/${el.dataset.id}`, data, 'PATCH'); toast('Fiche enregistrée.'); await refresh(); prospectDrawer(P(el.dataset.id)); } catch (e) { toast(e.message, true); }
  },
  'save-copy': (el) => busy(el, async () => {
    const copy = Object.fromEntries($$('#copy-form [data-c]').map((i) => [i.dataset.c, i.value]));
    copy.services = copy.services.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [title, ...t] = l.split('|'); return { title: title.trim(), text: t.join('|').trim() }; });
    await api(`/prospects/${el.dataset.id}/copy`, { copy, theme: $('#d-theme').value || undefined });
    toast('Site mis à jour.'); await refresh(); prospectDrawer(P(el.dataset.id));
  }),
  'del-prospect': async (el) => {
    if (!confirm('Supprimer ce prospect et son site ?')) return;
    await api(`/prospects/${el.dataset.id}`, null, 'DELETE'); closeDrawer(); await refresh();
  },
  mtab: (el) => { MTAB = el.dataset.k; render(); },
  'save-msg': async (el) => {
    const card = el.closest('.msg');
    await api(`/messages/${card.dataset.mid}`, { subject: $('[data-f=subject]', card).value, body: $('[data-f=body]', card).value }, 'PATCH');
    toast('Email enregistré.');
  },
  'approve-msg': async (el) => {
    const card = el.closest('.msg');
    await api(`/messages/${card.dataset.mid}`, { subject: $('[data-f=subject]', card).value, body: $('[data-f=body]', card).value }, 'PATCH');
    await api('/messages/approve', { ids: [card.dataset.mid] });
    window.gsap ? gsap.to(card, { height: 0, opacity: 0, padding: 0, margin: 0, duration: 0.45, ease: 'power3.inOut', onComplete: refresh }) : refresh();
  },
  'approve-all': async () => {
    if (!confirm('Valider tous les brouillons ? Ils partiront progressivement, selon ton rythme et tes horaires d’envoi.')) return;
    const ids = S.messages.filter((m) => m.status === 'draft').map((m) => m.id);
    const r = await api('/messages/approve', { ids });
    toast(`${r.approved} email(s) programmé(s).`); await refresh();
  },
  'cancel-msg': async (el) => { await api('/messages/cancel', { ids: [el.closest('.msg').dataset.mid] }); await refresh(); },
  'send-now': (el) => busy(el, async () => {
    const card = el.closest('.msg');
    await api(`/messages/${card.dataset.mid}`, { subject: $('[data-f=subject]', card).value, body: $('[data-f=body]', card).value }, 'PATCH');
    const m = await api(`/messages/${card.dataset.mid}/send-now`, {});
    toast(m.status === 'sent' ? `Envoyé${m.simulated ? ' (simulation)' : ''}.` : `Échec : ${m.error}`, m.status !== 'sent');
    await refresh();
  }),
  day: (el) => el.classList.toggle('on'),
  'save-settings': (el) => busy(el, saveSettings),
  'reset-libs': async () => { await api('/settings/reset-libs', {}); await refresh(); toast('Bibliothèques réinitialisées.'); },
  'smtp-verify': (el) => busy(el, async () => { await saveSettings(true); await api('/smtp/verify', {}); toast('Connexion SMTP OK ✓'); }),
  'smtp-test': (el) => busy(el, async () => { await saveSettings(true); const r = await api('/smtp/test', {}); toast(r.simulated ? 'Simulation : email écrit dans data/outbox (désactive le mode simulation pour un vrai envoi).' : 'Email de test envoyé ✓'); }),
};

async function saveSettings(silent) {
  const patch = {};
  for (const el of $$('[data-path]')) {
    const keys = el.dataset.path.split('.');
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if ('lines' in el.dataset) v = v.split('\n').map((s) => s.trim()).filter(Boolean);
    keys.reduce((o, k, i) => (i === keys.length - 1 ? (o[k] = v) : (o[k] = o[k] || {})), patch);
  }
  const days = $$('#days .chip').map((c, i) => (c.classList.contains('on') ? i : -1)).filter((i) => i >= 0);
  patch.sending.days = days;
  patch.ai.enabledSkills = $$('[data-skill]').filter((c) => c.checked).map((c) => c.dataset.skill);
  await api('/settings', patch);
  await load();
  if (silent !== true) toast('Réglages enregistrés.');
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON') ev.preventDefault();
  fn(el, ev);
});
$('#drawer-bg').addEventListener('click', closeDrawer);
addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'pf-q') { PF.q = ev.target.value; debounceRender(); }
});
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'pf-status') { PF.status = ev.target.value; render(); }
  if (ev.target.id === 'pf-campaign') { PF.campaign = ev.target.value; history.replaceState(null, '', '#/prospects'); render(); }
});
let dt;
const debounceRender = () => { clearTimeout(dt); dt = setTimeout(() => { render(false); const q = $('#pf-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 220); };

// ---------------- rendu & animations ----------------
function animateIn(root, full = true) {
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) { $$('.reveal', root).forEach((e) => (e.style.opacity = 1)); return; }
  const title = $('h1.title', root);
  if (full && title) gsap.from(title, { y: 40, opacity: 0, duration: 0.9, ease: 'expo.out' });
  gsap.to($$('.reveal', root), { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.05, delay: full ? 0.1 : 0 });
  $$('[data-count]', root).forEach((el) => {
    const target = Number(el.dataset.count), small = el.querySelector('small')?.outerHTML || '';
    const o = { v: 0 };
    gsap.to(o, { v: target, duration: 1.4, ease: 'power3.out', onUpdate: () => (el.innerHTML = fmt.format(Math.round(o.v)) + small) });
  });
}
function scaleThumbs() {
  $$('.thumb iframe').forEach((f) => { f.style.transform = `scale(${f.parentElement.clientWidth / 1280})`; });
}
addEventListener('resize', scaleThumbs);

let currentView = '';
function render(full = true) {
  const [path, qs] = (location.hash.slice(2) || '').split('?');
  const name = views[path] ? path : 'home';
  const params = new URLSearchParams(qs || '');
  $$('#menu a').forEach((a) => a.classList.toggle('on', a.dataset.view === name));
  const v = $('#view');
  const changed = name !== currentView;
  currentView = name;
  const scroll = v.scrollTop;
  v.innerHTML = views[name](params);
  if (changed) v.scrollTop = 0; else v.scrollTop = scroll;
  if (full && changed) animateIn(v); else $$('.reveal', v).forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; });
  $$('[data-count]', v).forEach((el) => { if (!changed) el.innerHTML = fmt.format(Number(el.dataset.count)) + (el.querySelector('small')?.outerHTML || ''); });
  scaleThumbs();
  if (name === 'reglages') loadSkills();
}

async function refresh() {
  try { await load(); } catch (e) { toast(e.message, true); return; }
  // ne pas écraser un formulaire en cours d'édition
  const editing = document.activeElement?.matches?.('input, textarea, select') && $('#view').contains(document.activeElement);
  if (!editing) render(false);
}

addEventListener('hashchange', () => { closeDrawer(); render(); });
await refresh();
render();
// rafraîchissement léger : progression des générations, envois automatiques
setInterval(() => {
  const active = S.state?.jobs.some((j) => j.status === 'queued' || j.status === 'running');
  if (active || ['envois', 'home'].includes(currentView)) refresh();
}, 6000);
