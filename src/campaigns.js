// Campagnes, file d'envoi validée par toi, relances automatiques et planificateur.
import { db, id, now, save, log, isUnsubscribed } from './db.js';
import { buildEmail, deliver, fill, vars } from './mailer.js';

export const DEFAULT_SEQUENCE = [
  {
    delayDays: 0,
    subject: 'Un site pour {{entreprise}}, déjà prêt',
    body: `Bonjour,

Je m'appelle {{expediteur}}, je crée des sites internet pour les commerces de {{ville}}.

En cherchant un {{metier}} dans le coin, j'ai remarqué que {{entreprise}} n'avait pas encore de site. Plutôt que de vous en parler dans le vide, j'en ai préparé un à votre nom, avec vos prestations et vos coordonnées : {{lien_site}}

Si le résultat vous plaît, il peut être mis en ligne rapidement pour {{prix}}. Textes, couleurs et contenus s'ajustent à votre goût.

Je reste disponible par retour de mail ou au {{telephone}}.

Bonne journée,
{{signature}}`,
  },
  {
    delayDays: 4,
    subject: 'Re: Un site pour {{entreprise}}, déjà prêt',
    body: `Bonjour,

Je me permets de revenir vers vous au sujet du site que j'ai préparé pour {{entreprise}} : {{lien_site}}

Avez-vous eu l'occasion d'y jeter un œil ? Un simple « oui » ou « non merci » me suffit.

{{signature}}`,
  },
  {
    delayDays: 7,
    subject: 'Dernier message — site {{entreprise}}',
    body: `Bonjour,

Dernier message de ma part, promis. Le site préparé pour {{entreprise}} reste disponible quelques jours : {{lien_site}}

Si ce n'est pas le bon moment, aucun souci, je ne vous relancerai plus.

{{signature}}`,
  },
];

export const STOP_STATUSES = ['replied', 'won', 'lost', 'unsubscribed'];

export function createCampaign(data) {
  const c = {
    id: id('c_'),
    name: data.name || `${data.tradeLabel || data.trade} · ${data.city}`,
    trade: data.trade,
    city: data.city,
    price: Number(data.price) || 490,
    autoFollowups: data.autoFollowups !== false,
    sequence: data.sequence?.length ? data.sequence : structuredClone(DEFAULT_SEQUENCE),
    createdAt: now(),
  };
  db.campaigns.unshift(c);
  save();
  return c;
}

function render(p, campaign, step) {
  const seq = campaign.sequence[step];
  const v = vars(p, campaign, step);
  return { subject: fill(seq.subject, v), body: fill(seq.body, v) };
}

/** Crée les brouillons du 1er email pour chaque prospect prêt (email + site) de la campagne. */
export function prepareDrafts(campaign) {
  let created = 0;
  const skipped = { noEmail: 0, noSite: 0, unsub: 0, already: 0 };
  for (const p of db.prospects.filter((x) => x.campaignId === campaign.id)) {
    if (!p.email) { skipped.noEmail++; continue; }
    if (!p.siteSlug) { skipped.noSite++; continue; }
    if (isUnsubscribed(p.email) || STOP_STATUSES.includes(p.status)) { skipped.unsub++; continue; }
    if (db.messages.some((m) => m.prospectId === p.id && m.campaignId === campaign.id && m.status !== 'cancelled')) { skipped.already++; continue; }
    db.messages.unshift({
      id: id('m_'), prospectId: p.id, campaignId: campaign.id, step: 0, to: p.email,
      ...render(p, campaign, 0), status: 'draft', createdAt: now(), scheduledAt: null,
    });
    created++;
  }
  save();
  return { created, skipped };
}

export function approve(ids) {
  let n = 0;
  for (const m of db.messages) {
    if (ids.includes(m.id) && m.status === 'draft') {
      m.status = 'approved';
      m.approvedAt = now();
      m.scheduledAt = m.scheduledAt || now();
      n++;
    }
  }
  save();
  return n;
}

export function cancel(ids) {
  let n = 0;
  for (const m of db.messages) if (ids.includes(m.id) && ['draft', 'approved', 'failed'].includes(m.status)) { m.status = 'cancelled'; n++; }
  save();
  return n;
}

/** Stoppe toutes les relances en attente d'un prospect (réponse, désinscription…). */
export function stopProspect(prospectId, reason) {
  for (const m of db.messages) {
    if (m.prospectId === prospectId && ['draft', 'approved'].includes(m.status)) {
      m.status = 'cancelled';
      m.error = reason;
    }
  }
  save();
}

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
export const sentToday = () => db.messages.filter((m) => m.status === 'sent' && m.sentAt >= startOfDay()).length;

export function sendingWindowOpen(date = new Date()) {
  const s = db.settings.sending;
  const h = date.getHours() + date.getMinutes() / 60;
  return s.days.includes(date.getDay()) && h >= s.windowStart && h < s.windowEnd;
}

let nextAllowedAt = 0;
let busy = false;

export async function sendOne(m, { force = false } = {}) {
  const p = db.prospects.find((x) => x.id === m.prospectId);
  const campaign = db.campaigns.find((c) => c.id === m.campaignId);
  if (!p || !campaign) { m.status = 'cancelled'; m.error = 'Prospect ou campagne supprimé'; save(); return; }
  if (isUnsubscribed(m.to) || STOP_STATUSES.includes(p.status)) {
    m.status = 'cancelled'; m.error = 'Prospect désinscrit ou a répondu'; save(); return;
  }
  try {
    const res = await deliver(buildEmail(m, p));
    Object.assign(m, { status: 'sent', sentAt: now(), messageId: res.messageId, simulated: res.simulated, error: null });
    p.status = p.status === 'site_ready' || p.status === 'new' ? 'contacted' : p.status;
    p.lastContactAt = m.sentAt;
    log('mail', `${res.simulated ? '[simulation] ' : ''}Email ${m.step + 1}/${campaign.sequence.length} envoyé à ${p.name}`, { prospectId: p.id });
    // planifie la relance suivante
    const next = campaign.sequence[m.step + 1];
    if (next) {
      const at = new Date(Date.now() + next.delayDays * 86400000).toISOString();
      db.messages.unshift({
        id: id('m_'), prospectId: p.id, campaignId: campaign.id, step: m.step + 1, to: p.email,
        ...render(p, campaign, m.step + 1),
        status: campaign.autoFollowups ? 'approved' : 'draft',
        createdAt: now(), scheduledAt: at, approvedAt: campaign.autoFollowups ? now() : null,
      });
    }
  } catch (e) {
    Object.assign(m, { status: 'failed', error: e.message, failedAt: now() });
    log('error', `Échec d'envoi à ${p.name} : ${e.message}`, { prospectId: p.id });
    if (!force) throw e;
  } finally {
    save();
  }
}

export async function tick() {
  if (busy) return;
  const s = db.settings.sending;
  if (!sendingWindowOpen() || Date.now() < nextAllowedAt || sentToday() >= s.dailyLimit) return;
  const due = db.messages
    .filter((m) => m.status === 'approved' && (!m.scheduledAt || m.scheduledAt <= now()))
    .sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))[0];
  if (!due) return;
  busy = true;
  try {
    await sendOne(due);
  } catch {
    /* déjà journalisé */
  } finally {
    busy = false;
    const gap = s.minGapSeconds + Math.random() * Math.max(0, s.maxGapSeconds - s.minGapSeconds);
    nextAllowedAt = Date.now() + gap * 1000;
  }
}

export function schedulerStatus() {
  const s = db.settings.sending;
  return {
    windowOpen: sendingWindowOpen(),
    sentToday: sentToday(),
    dailyLimit: s.dailyLimit,
    nextAllowedAt: nextAllowedAt ? new Date(nextAllowedAt).toISOString() : null,
    queued: db.messages.filter((m) => m.status === 'approved').length,
    drafts: db.messages.filter((m) => m.status === 'draft').length,
  };
}

export function startScheduler() {
  setInterval(() => tick().catch(() => {}), 20000);
}
