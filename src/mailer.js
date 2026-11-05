// Envoi d'emails : SMTP (Nodemailer) ou mode simulation (fichiers .json dans data/outbox).
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { db, OUTBOX_DIR, SITES_DIR, token, save } from './db.js';

let transport = null;
let transportKey = '';
function getTransport() {
  const s = db.settings.smtp;
  const key = JSON.stringify(s);
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: s.host, port: Number(s.port) || 587, secure: !!s.secure,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    });
    transportKey = key;
  }
  return transport;
}

export const smtpConfigured = () => !!db.settings.smtp.host;

export async function verifySmtp() {
  if (!smtpConfigured()) throw new Error('Aucun serveur SMTP configuré.');
  await getTransport().verify();
  return true;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function siteUrl(p) {
  const base = db.settings.publicBaseUrl?.replace(/\/$/, '');
  return base && p.siteSlug ? `${base}/s/${p.siteSlug}/` : '';
}

export function vars(p, campaign, step = 0) {
  const s = db.settings.sender;
  return {
    entreprise: p.name || '',
    metier: (p.tradeLabel || p.trade || '').toLowerCase(),
    ville: p.city || '',
    lien_site: siteUrl(p) || (step === 0 ? '(aperçu en image ci-dessous)' : '(aperçu dans mon premier message)'),
    prix: campaign?.price ? `${campaign.price} €` : '',
    prenom_expediteur: (s.name || '').split(' ')[0],
    expediteur: s.name || '',
    societe: s.company || s.name || '',
    telephone: s.phone || '',
    signature: s.signature || [s.name, s.company, s.phone].filter(Boolean).join('\n'),
  };
}

export const fill = (tpl, v) => String(tpl || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => (k in v ? v[k] : m));

export function ensureToken(p) {
  if (!p.token) { p.token = token(); save(); }
  return p.token;
}

function unsubscribeUrl(p) {
  const base = db.settings.publicBaseUrl?.replace(/\/$/, '') || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/u/${ensureToken(p)}`;
}

export function buildEmail(msg, p) {
  const s = db.settings.sender;
  const url = siteUrl(p);
  const unsub = unsubscribeUrl(p);
  const previewPath = p.siteSlug ? path.join(SITES_DIR, p.siteSlug, 'preview.png') : '';
  const hasPreview = msg.step === 0 && previewPath && fs.existsSync(previewPath);
  const legal = [s.company || s.name, s.legal].filter(Boolean).join(' — ');
  const hasPublic = !!db.settings.publicBaseUrl;
  const optOut = hasPublic ? `Pour ne plus être contacté : ${unsub}` : 'Pour ne plus être contacté, répondez simplement « STOP ».';
  const footerTxt = `\n\n—\n${legal}\nVous recevez ce message car votre établissement est référencé publiquement comme professionnel. ${optOut}`;

  const bodyHtml = esc(msg.body).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#111">$1</a>');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ee;padding:24px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="padding:32px 32px 8px;font-size:15.5px;line-height:1.6">${bodyHtml}</td></tr>
${hasPreview ? `<tr><td style="padding:16px 32px 8px">${url ? `<a href="${esc(url)}">` : ''}<img src="cid:preview@websell" alt="Aperçu du site proposé pour ${esc(p.name)}" width="536" style="width:100%;height:auto;border-radius:10px;border:1px solid #e7e5e4;display:block">${url ? '</a>' : ''}</td></tr>` : ''}
${url && msg.step === 0 ? `<tr><td style="padding:12px 32px 8px"><a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">Voir le site →</a></td></tr>` : ''}
<tr><td style="padding:24px 32px 28px;font-size:11.5px;line-height:1.5;color:#78716c;border-top:1px solid #f0efed">${esc(legal)}<br>Vous recevez ce message car votre établissement est référencé publiquement comme professionnel. ${hasPublic ? `<a href="${esc(unsub)}" style="color:#78716c">Ne plus être contacté</a>.` : 'Pour ne plus être contacté, répondez simplement « STOP ».'}</td></tr>
</table></body></html>`;

  return {
    from: s.name ? `"${s.name.replace(/"/g, '')}" <${s.email}>` : s.email,
    to: msg.to,
    replyTo: s.email,
    subject: msg.subject,
    text: msg.body + footerTxt,
    html,
    headers: { 'List-Unsubscribe': [hasPublic && `<${unsub}>`, s.email && `<mailto:${s.email}?subject=STOP>`].filter(Boolean).join(', ') },
    attachments: hasPreview ? [{ filename: 'apercu.png', path: previewPath, cid: 'preview@websell' }] : [],
  };
}

export async function deliver(mail) {
  if (db.settings.dryRun || !smtpConfigured()) {
    const file = path.join(OUTBOX_DIR, `${Date.now()}-${String(mail.to).replace(/[^a-z0-9@.]/gi, '_')}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...mail, attachments: mail.attachments.map((a) => a.filename) }, null, 2));
    return { messageId: 'simulation:' + path.basename(file), simulated: true };
  }
  const info = await getTransport().sendMail(mail);
  return { messageId: info.messageId, simulated: false };
}
