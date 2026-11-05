// Stockage local en JSON (data/db.json) — zéro dépendance, facile à sauvegarder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const SITES_DIR = path.join(DATA_DIR, 'sites');
export const OUTBOX_DIR = path.join(DATA_DIR, 'outbox');
const DB_FILE = path.join(DATA_DIR, 'db.json');

for (const d of [DATA_DIR, SITES_DIR, OUTBOX_DIR]) fs.mkdirSync(d, { recursive: true });

export const DEFAULT_SETTINGS = {
  sender: {
    name: '',
    company: '',
    email: '',
    phone: '',
    signature: '',
    legal: '', // ex : "Marie Dupont EI — SIRET 000 000 000 00000 — 12 rue X, 75000 Paris"
  },
  smtp: { host: '', port: 587, secure: false, user: '', pass: '' },
  dryRun: true, // tant que c'est vrai, les emails sont écrits dans data/outbox au lieu d'être envoyés
  publicBaseUrl: '', // ex : https://mon-tunnel.trycloudflare.com — rend les liens "voir le site" cliquables
  sending: {
    dailyLimit: 30,
    minGapSeconds: 90, // délai mini entre deux envois (anti-spam)
    maxGapSeconds: 240,
    windowStart: 9,
    windowEnd: 18,
    days: [1, 2, 3, 4, 5], // lun → ven
  },
  search: { countryCodes: 'fr,be,ch', maxResults: 60 },
  ai: {
    enabled: true,
    model: 'claude-opus-5-5',
    effort: 'high',
    mode: 'copy', // 'copy' = Claude rédige les textes, thème maison ; 'full' = Claude conçoit tout le HTML
    skillsDirs: ['~/.claude/skills', './skills'],
    enabledSkills: [], // chemins des SKILL.md injectés dans le prompt de design
  },
  libs: {
    gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
    lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js',
    splitType: 'https://cdn.jsdelivr.net/npm/split-type@0.3.4/umd/index.min.js',
    extra: '', // balises <script>/<link> supplémentaires injectées dans chaque site
  },
};

const EMPTY = {
  settings: DEFAULT_SETTINGS,
  prospects: [],
  campaigns: [],
  messages: [],
  unsubscribes: [],
  log: [],
};

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = k in base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null
      ? deepMerge(base[k], over[k])
      : over[k];
  }
  return out;
}

let state;
try {
  state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  state = structuredClone(EMPTY);
}
state = { ...structuredClone(EMPTY), ...state, settings: deepMerge(DEFAULT_SETTINGS, state.settings) };

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}
export function flush() {
  clearTimeout(timer);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
process.on('exit', flush);

export const db = state;
export const id = (p = '') => p + crypto.randomBytes(6).toString('hex');
export const token = () => crypto.randomBytes(16).toString('hex');
export const now = () => new Date().toISOString();

export function updateSettings(patch) {
  state.settings = deepMerge(state.settings, patch);
  save();
  return state.settings;
}

export function log(type, text, extra = {}) {
  state.log.unshift({ at: now(), type, text, ...extra });
  state.log.length = Math.min(state.log.length, 500);
  save();
}

export function isUnsubscribed(email) {
  return !!email && state.unsubscribes.includes(email.trim().toLowerCase());
}

export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'site';
}
