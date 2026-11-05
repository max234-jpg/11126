// Recherche de commerces SANS site web via OpenStreetMap (Nominatim + Overpass).
// Données © contributeurs OpenStreetMap, licence ODbL.
import { tradeInfo } from './trades.js';

const UA = 'WebSell-Local/1.0 (outil de prospection personnel)';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function fetchJson(url, opts = {}, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${new URL(url).host}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function geocodeCity(city, countryCodes = 'fr,be,ch') {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.search = new URLSearchParams({ q: city, format: 'jsonv2', limit: '5', countrycodes: countryCodes, addressdetails: '0' });
  const res = await fetchJson(u, {}, 20000);
  const hit = res.find((r) => r.osm_type === 'relation') || res[0];
  if (!hit) throw new Error(`Ville introuvable : « ${city} »`);
  return hit;
}

function buildQuery(tags, area, max) {
  const sel = tags.map((t) => `  nwr[${t}][!website][!"contact:website"][!url]${area};`).join('\n');
  return `[out:json][timeout:60];\n(\n${sel}\n);\nout center tags ${max};`;
}

async function overpass(query) {
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      return await fetchJson(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      }, 40000);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Overpass indisponible : ' + (lastErr?.message || 'erreur inconnue'));
}

const pick = (t, ...keys) => keys.map((k) => t[k]).find(Boolean) || '';

export function elementToProspect(el, trade, cityLabel) {
  const t = el.tags || {};
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const place = [t['addr:postcode'], t['addr:city'] || cityLabel].filter(Boolean).join(' ');
  return {
    name: t.name,
    trade: trade.key,
    tradeLabel: trade.label,
    city: t['addr:city'] || cityLabel,
    address: [street, place].filter(Boolean).join(', '),
    phone: pick(t, 'phone', 'contact:phone', 'contact:mobile'),
    email: pick(t, 'email', 'contact:email').split(';')[0].trim(),
    hours: t.opening_hours || '',
    facebook: pick(t, 'contact:facebook', 'facebook'),
    instagram: pick(t, 'contact:instagram', 'instagram'),
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
    source: 'OpenStreetMap',
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    sourceId: `osm:${el.type}/${el.id}`,
    reliability: t.check_date || t['survey:date'] ? `vérifié le ${t.check_date || t['survey:date']}` : 'non daté — à vérifier',
  };
}

export async function searchBusinesses({ trade: tradeKey, city, countryCodes, max = 60 }) {
  const trade = tradeInfo(tradeKey);
  if (!trade.tags.length) throw new Error('Métier inconnu : choisis-en un dans la liste ou saisis un tag OSM (ex : shop=bakery).');
  const geo = await geocodeCity(city, countryCodes);
  let area;
  if (geo.osm_type === 'relation') {
    area = `(area:${3600000000 + Number(geo.osm_id)})`;
  } else {
    const [s, n, w, e] = geo.boundingbox.map(Number);
    area = `(${s},${w},${n},${e})`;
  }
  const query = buildQuery(trade.tags, area, Math.max(max * 3, 100));
  const data = await overpass(query);
  const cityLabel = geo.name || city;
  const seen = new Set();
  const results = [];
  for (const el of data.elements || []) {
    if (!el.tags?.name) continue;
    const p = elementToProspect(el, trade, cityLabel);
    const key = (p.name + p.address).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(p);
  }
  // les fiches avec email d'abord (contactables), puis téléphone
  results.sort((a, b) => (!!b.email - !!a.email) || (!!b.phone - !!a.phone));
  return { city: cityLabel, results: results.slice(0, max), total: results.length };
}
