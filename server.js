// WebSell Local — ta version perso : prospection, sites design générés, emails automatisés.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, save, id, now, log, updateSettings, isUnsubscribed, SITES_DIR, DEFAULT_SETTINGS } from './src/db.js';
import { TRADES, tradeInfo } from './src/trades.js';
import { searchBusinesses } from './src/osm.js';
import { generateSite, THEMES } from './src/generator/index.js';
import { stripRibbon } from './src/generator/render.js';
import { aiAvailable } from './src/generator/ai.js';
import { discoverSkills } from './src/skills.js';
import { verifySmtp, smtpConfigured, deliver, buildEmail } from './src/mailer.js';
import {
  createCampaign, prepareDrafts, approve, cancel, stopProspect, sendOne, schedulerStatus, startScheduler, DEFAULT_SEQUENCE,
} from './src/campaigns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// --- Sécurité : si l'app est exposée via un tunnel (pour rendre les sites visibles par les prospects),
// seules les pages publiques (/s/… sites, /u/… désinscription) sont accessibles depuis l'extérieur.
const isLocal = (req) => {
  const host = (req.headers.host || '').split(':')[0];
  return ['localhost', '127.0.0.1', '[::1]'].includes(host) && !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'];
};
app.use((req, res, next) => {
  if (isLocal(req) || /^\/(s|u)\//.test(req.path)) return next();
  res.status(404).send('Not found');
});

// ---------- Pages publiques ----------
app.get('/s/:slug', (req, res, next) => (req.path.endsWith('/') ? next() : res.redirect(301, `/s/${req.params.slug}/`)));
app.get('/s/:slug/', (req, res) => {
  const file = path.join(SITES_DIR, path.basename(req.params.slug), 'index.html');
  if (!fs.existsSync(file)) return res.status(404).send('Site introuvable');
  const p = db.prospects.find((x) => x.siteSlug === req.params.slug);
  if (p && !isLocal(req)) { p.views = (p.views || 0) + 1; p.lastViewAt = now(); save(); }
  let html = fs.readFileSync(file, 'utf8');
  if (req.query.clean) html = stripRibbon(html);
  res.type('html').send(html);
});
app.get('/s/:slug/preview.png', (req, res) => {
  const file = path.join(SITES_DIR, path.basename(req.params.slug), 'preview.png');
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

const unsubPage = (title, text, form = '') => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f2ee;font-family:system-ui,sans-serif;color:#18181b;padding:24px">
<main style="max-width:440px;background:#fff;padding:40px;border-radius:20px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="color:#57534e;line-height:1.6">${text}</p>${form}</main></body></html>`;
app.get('/u/:token', (req, res) => {
  const p = db.prospects.find((x) => x.token === req.params.token);
  if (!p) return res.status(404).send(unsubPage('Lien invalide', 'Ce lien de désinscription n’est pas reconnu.'));
  if (isUnsubscribed(p.email)) return res.send(unsubPage('C’est noté', 'Vous ne recevrez plus aucun message de notre part.'));
  res.send(unsubPage('Ne plus être contacté', `Confirmez pour ne plus recevoir de messages à l’adresse <b>${p.email}</b>.`,
    `<form method="post"><button style="margin-top:16px;padding:12px 22px;border:0;border-radius:999px;background:#111;color:#fff;font-weight:600;cursor:pointer">Confirmer la désinscription</button></form>`));
});
app.post('/u/:token', (req, res) => {
  const p = db.prospects.find((x) => x.token === req.params.token);
  if (!p) return res.status(404).send(unsubPage('Lien invalide', 'Ce lien n’est pas reconnu.'));
  const email = p.email.trim().toLowerCase();
  if (!db.unsubscribes.includes(email)) db.unsubscribes.push(email);
  p.status = 'unsubscribed';
  stopProspect(p.id, 'Désinscrit');
  log('unsub', `${p.name} s’est désinscrit`, { prospectId: p.id });
  save();
  res.send(unsubPage('C’est noté', 'Vous ne recevrez plus aucun message de notre part. Désolé pour le dérangement.'));
});

// ---------- API ----------
const api = express.Router();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ error: e.message }));
const findOr404 = (list, key, res) => {
  const x = list.find((i) => i.id === key);
  if (!x) res.status(404).json({ error: 'Introuvable' });
  return x;
};

const publicSettings = () => {
  const s = structuredClone(db.settings);
  s.smtp.pass = s.smtp.pass ? '••••••••' : '';
  return s;
};

api.get('/state', (req, res) => {
  const P = db.prospects;
  const count = (st) => P.filter((p) => p.status === st).length;
  res.json({
    settings: publicSettings(),
    aiAvailable: aiAvailable(),
    smtpConfigured: smtpConfigured(),
    trades: Object.fromEntries(Object.entries(TRADES).map(([k, t]) => [k, { label: t.label, theme: t.theme }])),
    themes: Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.label])),
    scheduler: schedulerStatus(),
    stats: {
      prospects: P.length,
      withEmail: P.filter((p) => p.email).length,
      sites: P.filter((p) => p.siteSlug).length,
      contacted: count('contacted'),
      replied: count('replied'),
      won: count('won'),
      lost: count('lost'),
      unsubscribed: count('unsubscribed'),
      sent: db.messages.filter((m) => m.status === 'sent').length,
      views: P.reduce((a, p) => a + (p.views || 0), 0),
      revenue: P.filter((p) => p.status === 'won').reduce((a, p) => a + (Number(p.dealPrice) || Number(db.campaigns.find((c) => c.id === p.campaignId)?.price) || 0), 0),
    },
    defaultSequence: DEFAULT_SEQUENCE,
    jobs: jobs.slice(0, 20),
  });
});

api.post('/settings', wrap((req, res) => {
  const patch = req.body || {};
  if (patch.smtp && patch.smtp.pass === '••••••••') delete patch.smtp.pass;
  updateSettings(patch);
  res.json({ settings: publicSettings() });
}));
api.post('/settings/reset-libs', (req, res) => { updateSettings({ libs: DEFAULT_SETTINGS.libs }); res.json({ settings: publicSettings() }); });

api.get('/skills', (req, res) => res.json({ skills: discoverSkills(db.settings.ai.skillsDirs), enabled: db.settings.ai.enabledSkills }));
api.get('/log', (req, res) => res.json(db.log.slice(0, 100)));

// --- Recherche & prospects
api.post('/search', wrap(async (req, res) => {
  const { trade, city } = req.body;
  if (!trade || !city) throw new Error('Choisis un métier et une ville.');
  const out = await searchBusinesses({ trade, city, countryCodes: db.settings.search.countryCodes, max: db.settings.search.maxResults });
  const known = new Set(db.prospects.map((p) => p.sourceId).filter(Boolean));
  out.results.forEach((r) => (r.known = known.has(r.sourceId)));
  res.json(out);
}));

const PROSPECT_FIELDS = ['name', 'trade', 'tradeLabel', 'city', 'address', 'phone', 'email', 'hours', 'lat', 'lon', 'facebook', 'instagram', 'source', 'sourceUrl', 'sourceId', 'reliability', 'notes', 'services', 'status', 'campaignId', 'dealPrice', 'theme'];
const pickFields = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => PROSPECT_FIELDS.includes(k)));

function addProspect(data) {
  const trade = tradeInfo(data.trade);
  const p = { id: id('p_'), status: 'new', source: 'Manuel', createdAt: now(), tradeLabel: trade.label, ...pickFields(data) };
  if (!p.name) throw new Error('Le nom est obligatoire.');
  if (p.email) p.email = p.email.trim().toLowerCase();
  if (p.email && isUnsubscribed(p.email)) p.status = 'unsubscribed';
  db.prospects.unshift(p);
  return p;
}

api.get('/prospects', (req, res) => res.json(db.prospects));
api.post('/prospects', wrap((req, res) => { const p = addProspect(req.body); save(); res.json(p); }));
api.post('/prospects/bulk', wrap((req, res) => {
  const items = req.body.items || [];
  const known = new Set(db.prospects.map((p) => p.sourceId).filter(Boolean));
  const added = items.filter((i) => !i.sourceId || !known.has(i.sourceId)).map((i) => addProspect({ ...i, campaignId: req.body.campaignId || i.campaignId }));
  save();
  res.json({ added: added.length, ids: added.map((p) => p.id) });
}));

function parseCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const map = { nom: 'name', name: 'name', entreprise: 'name', email: 'email', mail: 'email', telephone: 'phone', tel: 'phone', phone: 'phone', adresse: 'address', address: 'address', ville: 'city', city: 'city', metier: 'trade', trade: 'trade', horaires: 'hours', notes: 'notes' };
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [map[h] || h, (r[i] || '').trim()])));
}
api.post('/prospects/import', wrap((req, res) => {
  const items = parseCsv(String(req.body.csv || ''));
  const added = items.filter((i) => i.name).map((i) => addProspect({ ...i, trade: i.trade || req.body.trade, city: i.city || req.body.city, campaignId: req.body.campaignId, source: 'Import CSV' }));
  save();
  res.json({ added: added.length });
}));

api.patch('/prospects/:id', wrap((req, res) => {
  const p = findOr404(db.prospects, req.params.id, res);
  if (!p) return;
  const prev = p.status;
  Object.assign(p, pickFields(req.body));
  if (p.email) p.email = p.email.trim().toLowerCase();
  if (p.status !== prev && ['replied', 'won', 'lost', 'unsubscribed'].includes(p.status)) {
    stopProspect(p.id, `Statut : ${p.status}`);
    if (p.status === 'unsubscribed' && p.email && !db.unsubscribes.includes(p.email)) db.unsubscribes.push(p.email);
    log('status', `${p.name} → ${p.status}`, { prospectId: p.id });
  }
  save();
  res.json(p);
}));
api.delete('/prospects/:id', (req, res) => {
  const p = db.prospects.find((x) => x.id === req.params.id);
  db.prospects = db.prospects.filter((x) => x.id !== req.params.id);
  db.messages = db.messages.filter((m) => m.prospectId !== req.params.id || m.status === 'sent');
  if (p?.siteSlug) fs.rmSync(path.join(SITES_DIR, path.basename(p.siteSlug)), { recursive: true, force: true });
  save();
  res.json({ ok: true });
});

// --- Génération de sites (file de tâches en arrière-plan)
const jobs = [];
let running = false;
async function runJobs() {
  if (running) return;
  running = true;
  let job;
  while ((job = jobs.find((j) => j.status === 'queued'))) {
    job.status = 'running';
    const p = db.prospects.find((x) => x.id === job.prospectId);
    try {
      if (!p) throw new Error('Prospect supprimé');
      await generateSite(p, { theme: job.theme, mode: job.mode, port: PORT });
      job.status = 'done';
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      log('error', `Génération échouée pour ${p?.name} : ${e.message}`);
    }
    job.endedAt = now();
  }
  running = false;
}
api.post('/generate', wrap((req, res) => {
  const ids = req.body.ids || [];
  for (const pid of ids) {
    const p = db.prospects.find((x) => x.id === pid);
    if (!p) continue;
    jobs.unshift({ id: id('j_'), prospectId: pid, name: p.name, theme: req.body.theme || null, mode: req.body.mode || null, status: 'queued', at: now() });
  }
  jobs.length = Math.min(jobs.length, 200);
  runJobs();
  res.json({ queued: ids.length });
}));
api.post('/prospects/:id/copy', wrap(async (req, res) => {
  const p = findOr404(db.prospects, req.params.id, res);
  if (!p) return;
  p.copy = { ...(p.copy || {}), ...req.body.copy };
  if (req.body.theme) p.theme = req.body.theme;
  await generateSite(p, { theme: p.theme, mode: 'template', port: PORT });
  res.json(p);
}));
app.get('/sites/:slug/download', (req, res) => {
  const file = path.join(SITES_DIR, path.basename(req.params.slug), 'index.html');
  if (!fs.existsSync(file)) return res.status(404).end();
  res.attachment(`${req.params.slug}.html`).type('html').send(stripRibbon(fs.readFileSync(file, 'utf8')));
});

// --- Campagnes
api.get('/campaigns', (req, res) => res.json(db.campaigns));
api.post('/campaigns', wrap((req, res) => res.json(createCampaign({ ...req.body, tradeLabel: tradeInfo(req.body.trade).label }))));
api.patch('/campaigns/:id', wrap((req, res) => {
  const c = findOr404(db.campaigns, req.params.id, res);
  if (!c) return;
  for (const k of ['name', 'price', 'autoFollowups', 'sequence']) if (k in req.body) c[k] = req.body[k];
  save();
  res.json(c);
}));
api.delete('/campaigns/:id', (req, res) => {
  db.campaigns = db.campaigns.filter((c) => c.id !== req.params.id);
  db.messages.forEach((m) => { if (m.campaignId === req.params.id && ['draft', 'approved'].includes(m.status)) m.status = 'cancelled'; });
  save();
  res.json({ ok: true });
});
api.post('/campaigns/:id/drafts', wrap((req, res) => {
  const c = findOr404(db.campaigns, req.params.id, res);
  if (c) res.json(prepareDrafts(c));
}));

// --- File d'envoi
api.get('/messages', (req, res) => res.json(db.messages.slice(0, 1000)));
api.patch('/messages/:id', wrap((req, res) => {
  const m = findOr404(db.messages, req.params.id, res);
  if (!m) return;
  for (const k of ['subject', 'body', 'scheduledAt']) if (k in req.body) m[k] = req.body[k];
  save();
  res.json(m);
}));
api.post('/messages/approve', (req, res) => res.json({ approved: approve(req.body.ids || []) }));
api.post('/messages/cancel', (req, res) => res.json({ cancelled: cancel(req.body.ids || []) }));
api.post('/messages/:id/send-now', wrap(async (req, res) => {
  const m = findOr404(db.messages, req.params.id, res);
  if (!m) return;
  if (!['draft', 'approved', 'failed'].includes(m.status)) throw new Error('Ce message n’est plus envoyable.');
  await sendOne(m, { force: true });
  res.json(m);
}));
api.get('/messages/:id/preview', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  const p = m && db.prospects.find((x) => x.id === m.prospectId);
  if (!p) return res.status(404).end();
  const mail = buildEmail(m, p);
  res.type('html').send(mail.html.replace('cid:preview@websell', `/s/${p.siteSlug}/preview.png`));
});

// --- SMTP
api.post('/smtp/verify', wrap(async (req, res) => { await verifySmtp(); res.json({ ok: true }); }));
api.post('/smtp/test', wrap(async (req, res) => {
  const to = req.body.to || db.settings.sender.email;
  if (!to) throw new Error('Renseigne ton email dans Réglages → Expéditeur.');
  const r = await deliver({ from: db.settings.sender.email, to, subject: 'Test WebSell Local', text: 'Ça marche ! Ton envoi SMTP est opérationnel.', html: '<p>Ça marche ! Ton envoi SMTP est opérationnel.</p>', attachments: [] });
  res.json(r);
}));

app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

startScheduler();
app.listen(PORT, HOST, () => {
  console.log(`\n  ✦ WebSell Local prêt → http://localhost:${PORT}\n`);
  console.log(`    IA Claude : ${aiAvailable() ? 'activée' : 'désactivée (ajoute ANTHROPIC_API_KEY dans .env)'}`);
  console.log(`    Emails    : ${db.settings.dryRun || !smtpConfigured() ? 'mode SIMULATION (data/outbox)' : 'SMTP réel'}\n`);
});
