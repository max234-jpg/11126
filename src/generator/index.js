import fs from 'node:fs';
import path from 'node:path';
import { db, save, slugify, log, SITES_DIR, now } from '../db.js';
import { tradeInfo } from '../trades.js';
import { renderSite, THEMES, defaultCopy } from './render.js';
import { aiAvailable, aiCopy, aiFullSite } from './ai.js';

export { THEMES };

function uniqueSlug(base, currentId) {
  let slug = slugify(base);
  let i = 2;
  while (db.prospects.some((p) => p.siteSlug === slug && p.id !== currentId)) slug = `${slugify(base)}-${i++}`;
  return slug;
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = import('playwright')
      .then(({ chromium }) => chromium.launch())
      .catch(() => null);
  }
  return browserPromise;
}

export async function screenshot(slug, port) {
  const browser = await getBrowser();
  if (!browser) return false;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(`http://127.0.0.1:${port}/s/${slug}/?clean=1`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2200); // laisse finir les animations d'entrée
    await page.screenshot({ path: path.join(SITES_DIR, slug, 'preview.png') });
    return true;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

/**
 * Génère (ou régénère) le site d'un prospect.
 * mode : 'template' | 'copy' (Claude rédige) | 'full' (Claude conçoit tout)
 */
export async function generateSite(prospect, { theme, mode, port } = {}) {
  const settings = db.settings;
  const trade = tradeInfo(prospect.trade);
  const useAi = settings.ai.enabled && aiAvailable();
  const effectiveMode = mode || (useAi ? settings.ai.mode : 'template');
  let copy = prospect.copy || null;
  let themeKey = theme || prospect.theme || trade.theme || 'editorial';
  let html;

  if (effectiveMode !== 'template' && !aiAvailable()) throw new Error('Mode IA demandé mais ANTHROPIC_API_KEY absente (voir .env).');

  if (effectiveMode === 'copy' || (effectiveMode === 'full' && !copy)) {
    const ai = await aiCopy({ prospect, trade, settings });
    if (!theme) themeKey = THEMES[ai.theme] ? ai.theme : themeKey;
    delete ai.theme;
    copy = ai;
  }
  if (!copy) copy = defaultCopy(prospect, trade);

  html = renderSite({ prospect, trade, copy, themeKey, settings });
  if (effectiveMode === 'full') html = await aiFullSite({ prospect, trade, settings, baseHtml: html });

  const slug = prospect.siteSlug || uniqueSlug(`${prospect.name}-${prospect.city || ''}`, prospect.id);
  const dir = path.join(SITES_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);

  Object.assign(prospect, { siteSlug: slug, theme: themeKey, copy, siteMode: effectiveMode, siteAt: now() });
  if (['new', 'site_ready'].includes(prospect.status || 'new')) prospect.status = 'site_ready';
  save();
  log('site', `Site généré pour ${prospect.name} (${THEMES[themeKey]?.label || themeKey}, ${effectiveMode})`, { prospectId: prospect.id });

  if (port) prospect.hasPreview = await screenshot(slug, port);
  save();
  return prospect;
}
