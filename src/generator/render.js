// Générateur de sites vitrines "extrêmement design" — 4 directions artistiques,
// animations GSAP + ScrollTrigger, scroll fluide Lenis, titres découpés avec SplitType.
// Règle d'or : uniquement des informations réelles (aucun avis, chiffre ou photo inventé).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const THEMES = {
  editorial: {
    label: 'Éditorial',
    fonts: 'family=Fraunces:ital,opsz,wght@0,9..144,300..800;1,9..144,300..800&family=Inter+Tight:wght@400;500;600',
    display: "'Fraunces', Georgia, serif",
    body: "'Inter Tight', system-ui, sans-serif",
    vars: (h) => ({ bg: '#f2ede4', bg2: '#e9e2d6', ink: '#16130f', muted: '#6d655b', accent: `hsl(${h} 62% 44%)`, onAccent: '#fff' }),
    displayWeight: 360, upper: false, radius: '0px', tracking: '-0.045em',
  },
  noir: {
    label: 'Noir',
    fonts: 'family=Syne:wght@500;700;800&family=Manrope:wght@400;500;600',
    display: "'Syne', system-ui, sans-serif",
    body: "'Manrope', system-ui, sans-serif",
    vars: (h) => ({ bg: '#0b0b0c', bg2: '#151517', ink: '#f1eee8', muted: '#8f8b84', accent: `hsl(${h} 90% 64%)`, onAccent: '#0b0b0c' }),
    displayWeight: 800, upper: false, radius: '22px', tracking: '-0.05em',
  },
  swiss: {
    label: 'Suisse',
    fonts: 'family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600',
    display: "'Space Grotesk', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    vars: (h) => ({ bg: '#f4f4f1', bg2: '#e8e8e4', ink: '#0a0a0a', muted: '#5f5f5a', accent: `hsl(${h} 92% 48%)`, onAccent: '#fff' }),
    displayWeight: 700, upper: true, radius: '0px', tracking: '-0.06em',
  },
  organique: {
    label: 'Organique',
    fonts: 'family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600',
    display: "'Instrument Serif', Georgia, serif",
    body: "'DM Sans', system-ui, sans-serif",
    vars: (h) => ({ bg: `hsl(${h} 32% 94%)`, bg2: `hsl(${h} 30% 89%)`, ink: '#1c211e', muted: '#5d655f', accent: `hsl(${h} 42% 38%)`, onAccent: '#fff' }),
    displayWeight: 400, upper: false, radius: '999px', tracking: '-0.03em',
  },
};

const DAYS = { Mo: 'Lun', Tu: 'Mar', We: 'Mer', Th: 'Jeu', Fr: 'Ven', Sa: 'Sam', Su: 'Dim', PH: 'Jours fériés' };
export function formatHours(raw) {
  if (!raw) return [];
  return raw.split(';').map((s) => s.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^([A-Za-z,\- ]+?)\s+(.+)$/);
    const fr = (s) => s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d]).replace(/-/g, ' – ').replace(/,/g, ', ');
    if (!m) return { days: '', time: part.replace(/off|closed/i, 'Fermé') };
    return { days: fr(m[1]), time: m[2].replace(/\boff\b|\bclosed\b/gi, 'Fermé').replace(/,/g, ' · ').replace(/-/g, ' – ') };
  });
}

const initials = (name) => String(name).split(/\s+/).filter((w) => /^[\p{L}\d]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');

export function defaultCopy(p, trade) {
  const label = trade?.label || p.tradeLabel || p.trade || '';
  return {
    kicker: [label, p.city].filter(Boolean).join(' — '),
    headline: p.name,
    tagline: trade?.pitch || `${label} à ${p.city}`,
    intro: `${p.name} vous accueille${p.city ? ` à ${p.city}` : ''}. Retrouvez ici les prestations, les horaires et toutes les façons de nous joindre.`,
    services: (p.services?.length ? p.services : trade?.services || []).map((s) => (typeof s === 'string' ? { title: s, text: '' } : s)),
    spiritTitle: 'L’esprit de la maison',
    spirit: trade?.pitch ? `${trade.pitch} ${p.name} met son savoir-faire au service des habitants${p.city ? ` de ${p.city}` : ''} et des alentours.` : '',
    cta: p.phone ? 'Appelez-nous' : 'Écrivez-nous',
  };
}

export function renderSite({ prospect: p, trade, copy, themeKey, settings, preview = true }) {
  const theme = THEMES[themeKey] || THEMES.editorial;
  const hue = trade?.hue ?? 220;
  const v = theme.vars(hue);
  const c = { ...defaultCopy(p, trade), ...(copy || {}) };
  const libs = settings.libs || {};
  const hours = formatHours(p.hours);
  const hasMap = p.lat && p.lon;
  const d = 0.004;
  const mapUrl = hasMap ? `https://www.openstreetmap.org/export/embed.html?bbox=${p.lon - d * 1.6},${p.lat - d},${p.lon + d * 1.6},${p.lat + d}&layer=mapnik&marker=${p.lat},${p.lon}` : '';
  const routeUrl = hasMap ? `https://www.openstreetmap.org/directions?to=${p.lat},${p.lon}` : p.address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(p.address)}` : '';
  const ringText = `${p.name} • ${c.kicker} • `.toUpperCase();
  const marquee = c.services.map((s) => `<span>${esc(s.title)}</span><i aria-hidden="true">✦</i>`).join('');
  const words = String(c.headline).split(/\s+/);
  const headlineHtml = themeKey === 'editorial' || themeKey === 'organique'
    ? words.map((w, i) => (i === words.length - 1 && words.length > 1 ? `<em>${esc(w)}</em>` : esc(w))).join(' ')
    : esc(c.headline);
  const year = new Date().getFullYear();
  const sender = settings.sender || {};

  const servicesHtml = c.services.map((s, i) => `
      <li class="svc" data-reveal>
        <span class="svc-n">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="svc-t">${esc(s.title)}</h3>
        ${s.text ? `<p class="svc-d">${esc(s.text)}</p>` : ''}
        <span class="svc-arrow" aria-hidden="true">↗</span>
      </li>`).join('');

  const hoursHtml = hours.length
    ? `<dl class="hours">${hours.map((h) => `<div><dt>${esc(h.days)}</dt><dd>${esc(h.time)}</dd></div>`).join('')}</dl>`
    : `<p class="muted">Horaires communiqués sur simple appel${p.phone ? ` au <a href="${telHref(p.phone)}">${esc(p.phone)}</a>` : ''}.</p>`;

  const socials = [
    p.instagram && `<a href="${esc(p.instagram.startsWith('http') ? p.instagram : 'https://instagram.com/' + p.instagram.replace('@', ''))}" target="_blank" rel="noopener">Instagram</a>`,
    p.facebook && `<a href="${esc(p.facebook.startsWith('http') ? p.facebook : 'https://facebook.com/' + p.facebook)}" target="_blank" rel="noopener">Facebook</a>`,
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} — ${esc(c.kicker)}</title>
<meta name="description" content="${esc(c.tagline)} ${esc(p.address || '')}">
<meta name="theme-color" content="${v.bg}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${theme.fonts}&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${v.accent}'/><text x='50%' y='54%' font-family='Arial' font-weight='700' font-size='28' fill='${v.onAccent}' text-anchor='middle' dominant-baseline='middle'>${initials(p.name)}</text></svg>`)}">
<style>
:root{--bg:${v.bg};--bg2:${v.bg2};--ink:${v.ink};--muted:${v.muted};--accent:${v.accent};--on-accent:${v.onAccent};
--display:${theme.display};--body:${theme.body};--dw:${theme.displayWeight};--tr:${theme.tracking};--r:${theme.radius};
--gut:clamp(18px,4vw,56px);--line:color-mix(in oklab,var(--ink) 14%,transparent)}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
html.lenis{height:auto}.lenis.lenis-smooth{scroll-behavior:auto}
body{background:var(--bg);color:var(--ink);font:400 clamp(16px,1.05vw,18px)/1.6 var(--body);overflow-x:hidden}
a{color:inherit}
::selection{background:var(--accent);color:var(--on-accent)}
.grain{pointer-events:none;position:fixed;inset:-50%;z-index:100;opacity:.07;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:grain 1.2s steps(6) infinite}
@keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-1%)}100%{transform:translate(1%,3%)}}
.wrap{padding-inline:var(--gut)}
.display{font-family:var(--display);font-weight:var(--dw);letter-spacing:var(--tr);line-height:.9;${theme.upper ? 'text-transform:uppercase;' : ''}}
.display em{font-style:italic;color:var(--accent)}
.muted{color:var(--muted)}
.kicker{font:500 12px/1 var(--body);letter-spacing:.18em;text-transform:uppercase;display:inline-flex;gap:.8em;align-items:center}
.kicker::before{content:"";width:28px;height:1px;background:currentColor}

/* nav */
.nav{position:fixed;inset:0 0 auto;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:18px var(--gut);transition:transform .5s cubic-bezier(.2,.8,.2,1),background .4s}
.nav.scrolled{background:color-mix(in oklab,var(--bg) 82%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.nav.hide{transform:translateY(-110%)}
.logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:600;letter-spacing:-.01em}
.mono{width:38px;height:38px;border-radius:${themeKey === 'swiss' ? '0' : '50%'};display:grid;place-items:center;background:var(--ink);color:var(--bg);font:700 13px/1 var(--body);letter-spacing:.02em}
.btn{display:inline-flex;align-items:center;gap:.6em;padding:.95em 1.5em;border-radius:var(--r);background:var(--ink);color:var(--bg);text-decoration:none;font-weight:600;font-size:15px;position:relative;overflow:hidden;isolation:isolate;transition:color .4s}
.btn::after{content:"";position:absolute;inset:0;background:var(--accent);transform:translateY(101%);transition:transform .5s cubic-bezier(.7,0,.2,1);z-index:-1}
.btn:hover{color:var(--on-accent)}.btn:hover::after{transform:none}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 var(--accent);animation:pulse 2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 0 transparent}}

/* hero */
.hero{min-height:100svh;display:grid;grid-template-rows:1fr auto;padding-top:120px;position:relative;overflow:hidden}
.hero-inner{align-self:center;position:relative;z-index:2}
.hero h1{font-size:clamp(3.4rem,11.5vw,12.5rem);margin:.28em 0 .22em;max-width:14ch}
.hero h1 .line{overflow:hidden;padding-bottom:.06em}
.hero-foot{display:flex;flex-wrap:wrap;gap:24px 48px;justify-content:space-between;align-items:end;padding-block:28px 34px;border-top:1px solid var(--line);position:relative;z-index:2}
.tagline{font-size:clamp(1.1rem,1.8vw,1.6rem);max-width:28ch;line-height:1.3;letter-spacing:-.01em}
.hero-actions{display:flex;gap:12px;flex-wrap:wrap}
.ring{position:absolute;right:var(--gut);top:18vh;width:clamp(120px,15vw,210px);aspect-ratio:1;z-index:3}
.ring svg{width:100%;height:100%;animation:spin 22s linear infinite}
.ring text{font:600 10.5px var(--body);letter-spacing:.32em;fill:var(--ink)}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font:400 clamp(28px,3vw,44px)/1 var(--display);color:var(--accent)}
@keyframes spin{to{transform:rotate(360deg)}}
.deco{position:absolute;pointer-events:none;z-index:1}
${themeDeco(themeKey)}

/* marquee */
.marquee{border-block:1px solid var(--line);overflow:hidden;padding-block:clamp(18px,2.4vw,30px);background:var(--bg)}
.marquee-track{display:flex;gap:clamp(24px,3vw,48px);width:max-content;animation:marq 32s linear infinite;font:var(--dw) clamp(2rem,5vw,4.6rem)/1 var(--display);letter-spacing:var(--tr);${theme.upper ? 'text-transform:uppercase;' : ''}align-items:center}
.marquee-track i{font-style:normal;color:var(--accent);font-size:.5em}
.marquee:hover .marquee-track{animation-play-state:paused}
@keyframes marq{to{transform:translateX(-50%)}}

/* sections */
section{padding-block:clamp(80px,12vw,180px)}
.sec-head{display:grid;grid-template-columns:1fr;gap:20px;margin-bottom:clamp(40px,6vw,90px)}
@media(min-width:900px){.sec-head{grid-template-columns:1fr 1.4fr;align-items:end}}
.sec-head h2{font-size:clamp(2.6rem,6.5vw,6.4rem)}
.sec-head p{max-width:46ch;font-size:1.08em}
.svcs{list-style:none;border-top:1px solid var(--line)}
.svc{display:grid;grid-template-columns:60px 1fr auto;gap:8px 24px;align-items:baseline;padding:clamp(20px,2.6vw,34px) 0;border-bottom:1px solid var(--line);position:relative;cursor:default;transition:padding .5s cubic-bezier(.2,.8,.2,1)}
.svc::before{content:"";position:absolute;inset:0;background:var(--accent);transform:scaleY(0);transform-origin:bottom;transition:transform .55s cubic-bezier(.7,0,.2,1);z-index:-1}
.svc:hover{padding-inline:20px;color:var(--on-accent)}.svc:hover::before{transform:scaleY(1)}.svc:hover .svc-n,.svc:hover .svc-d{color:inherit}
.svcs{position:relative;isolation:isolate}
.svc-n{font:500 13px var(--body);color:var(--muted);letter-spacing:.08em}
.svc-t{font:var(--dw) clamp(1.7rem,3.6vw,3.2rem)/1 var(--display);letter-spacing:var(--tr);${theme.upper ? 'text-transform:uppercase;' : ''}}
.svc-d{grid-column:2;color:var(--muted);max-width:60ch}
.svc-arrow{grid-column:3;grid-row:1;font-size:clamp(1.4rem,2.4vw,2.2rem);transition:transform .5s}
.svc:hover .svc-arrow{transform:rotate(45deg)}

.spirit{background:var(--ink);color:var(--bg);border-radius:${themeKey === 'noir' ? '32px' : themeKey === 'organique' ? '48px' : '0'};margin-inline:${themeKey === 'swiss' ? '0' : 'clamp(8px,1.2vw,18px)'}}
.spirit .display{font-size:clamp(2.4rem,7vw,7.4rem);max-width:16ch}
.spirit p{max-width:52ch;font-size:clamp(1.05rem,1.4vw,1.3rem);margin-top:34px;opacity:.8}
.spirit .kicker{color:var(--accent)}

.info{display:grid;gap:clamp(30px,5vw,80px)}
@media(min-width:900px){.info{grid-template-columns:1fr 1.2fr}}
.hours div{display:flex;justify-content:space-between;gap:20px;padding:16px 0;border-bottom:1px solid var(--line)}
.hours dt{font-weight:600}.hours dd{color:var(--muted);text-align:right}
.map{border-radius:${themeKey === 'swiss' ? '0' : '24px'};overflow:hidden;min-height:380px;background:var(--bg2);position:relative}
.map iframe{position:absolute;inset:0;width:100%;height:100%;border:0;filter:grayscale(1) contrast(1.05) ${themeKey === 'noir' ? 'invert(.92) hue-rotate(180deg)' : ''}}
.addr{font:var(--dw) clamp(1.6rem,3vw,2.6rem)/1.05 var(--display);letter-spacing:var(--tr);margin:18px 0 26px}

.contact{text-align:center;padding-block:clamp(100px,16vw,240px)}
.contact .big{display:inline-block;font-size:clamp(2.6rem,10vw,10.5rem);text-decoration:none;margin:24px 0 36px;position:relative}
.contact .big::after{content:"";position:absolute;left:0;right:0;bottom:-.06em;height:.06em;background:var(--accent);transform:scaleX(0);transform-origin:right;transition:transform .7s cubic-bezier(.7,0,.2,1)}
.contact .big:hover::after{transform:scaleX(1);transform-origin:left}
.foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:14px;padding-block:28px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
.foot nav{display:flex;gap:20px}
[data-reveal]{will-change:transform,opacity}

.ribbon{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:90;background:var(--ink);color:var(--bg);font:500 12.5px/1.4 var(--body);padding:10px 16px;border-radius:999px;box-shadow:0 10px 40px rgba(0,0,0,.25);max-width:calc(100% - 32px);text-align:center}
.ribbon b{color:var(--accent)}
.ribbon button{background:none;border:0;color:inherit;opacity:.6;margin-left:10px;cursor:pointer;font:inherit}
@media (max-width:700px){.ring,.bigsq{display:none}.hero h1{font-size:16.5vw}.svc{grid-template-columns:40px 1fr}.svc-arrow{display:none}.nav .btn{padding:.75em 1.1em}.ribbon{font-size:11px;padding:8px 12px;bottom:10px}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<header class="nav" id="nav">
  <a class="logo" href="#top"><span class="mono">${esc(initials(p.name))}</span><span>${esc(p.name)}</span></a>
  ${p.phone ? `<a class="btn" href="${telHref(p.phone)}"><span class="dot"></span><span class="lbl">${esc(p.phone)}</span></a>` : p.email ? `<a class="btn" href="mailto:${esc(p.email)}">Nous écrire</a>` : ''}
</header>

<main id="top">
  <section class="hero wrap" style="padding-bottom:0">
    ${themeDecoHtml(themeKey)}
    <div class="ring" aria-hidden="true" data-speed="-0.15">
      <svg viewBox="0 0 200 200"><defs><path id="c" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"/></defs><text><textPath href="#c" textLength="488" lengthAdjust="spacingAndGlyphs">${esc(ringText.length > 54 ? ringText.slice(0, 51) + '… • ' : ringText)}</textPath></text></svg>
      <b>✦</b>
    </div>
    <div class="hero-inner">
      <span class="kicker" data-fade>${esc(c.kicker)}</span>
      <h1 class="display" data-split>${headlineHtml}</h1>
    </div>
    <div class="hero-foot">
      <p class="tagline" data-fade>${esc(c.tagline)}</p>
      <div class="hero-actions" data-fade>
        ${p.phone ? `<a class="btn" href="${telHref(p.phone)}">${esc(c.cta)} →</a>` : p.email ? `<a class="btn" href="mailto:${esc(p.email)}">${esc(c.cta)} →</a>` : ''}
        ${routeUrl ? `<a class="btn ghost" href="${esc(routeUrl)}" target="_blank" rel="noopener">Itinéraire</a>` : ''}
      </div>
    </div>
  </section>

  ${c.services.length ? `<div class="marquee" aria-hidden="true"><div class="marquee-track">${marquee}${marquee}${marquee}${marquee}</div></div>` : ''}

  ${c.services.length ? `<section class="wrap" id="prestations">
    <div class="sec-head">
      <h2 class="display" data-split>Prestations</h2>
      <p class="muted" data-reveal>${esc(c.intro)}</p>
    </div>
    <ul class="svcs">${servicesHtml}</ul>
  </section>` : ''}

  ${c.spirit ? `<section class="spirit wrap">
    <span class="kicker">${esc(c.spiritTitle)}</span>
    <p class="display" data-split style="margin-top:28px">${esc(c.tagline)}</p>
    <p data-reveal>${esc(c.spirit)}</p>
  </section>` : ''}

  <section class="wrap" id="infos">
    <div class="info">
      <div>
        <span class="kicker">Horaires & accès</span>
        ${p.address ? `<p class="addr" data-reveal>${esc(p.address)}</p>` : ''}
        <div data-reveal>${hoursHtml}</div>
        ${routeUrl ? `<p style="margin-top:28px" data-reveal><a class="btn ghost" href="${esc(routeUrl)}" target="_blank" rel="noopener">Calculer l’itinéraire ↗</a></p>` : ''}
      </div>
      ${hasMap ? `<div class="map" data-reveal><iframe loading="lazy" title="Plan d’accès" src="${esc(mapUrl)}"></iframe></div>` : ''}
    </div>
  </section>

  <section class="contact wrap" id="contact">
    <span class="kicker">${esc(c.cta)}</span><br>
    ${p.phone ? `<a class="big display" href="${telHref(p.phone)}" data-split>${esc(p.phone)}</a>` : p.email ? `<a class="big display" href="mailto:${esc(p.email)}" data-split>${esc(p.email)}</a>` : `<p class="big display" data-split>${esc(p.name)}</p>`}
    ${p.phone && p.email ? `<p><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></p>` : ''}
  </section>
</main>

<footer class="foot wrap">
  <span>© ${year} ${esc(p.name)}${p.city ? ` · ${esc(p.city)}` : ''}</span>
  <nav>${socials}${hasMap ? '<span>Carte © OpenStreetMap</span>' : ''}</nav>
</footer>
${preview ? `<!--ribbon--><div class="ribbon">Maquette proposée à <b>${esc(p.name)}</b>${sender.company || sender.name ? ` par ${esc(sender.company || sender.name)}` : ''} — pas encore en ligne officiellement.<button onclick="this.parentNode.remove()" aria-label="Fermer">✕</button></div><!--/ribbon-->` : ''}

<script src="${esc(libs.gsap)}"></script>
<script src="${esc(libs.scrollTrigger)}"></script>
<script src="${esc(libs.lenis)}"></script>
<script src="${esc(libs.splitType)}"></script>
${libs.extra || ''}
<script>
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = document.getElementById('nav');
  let lastY = 0;
  const onScroll = (y) => { nav.classList.toggle('scrolled', y > 30); nav.classList.toggle('hide', y > lastY && y > 300); lastY = y; };
  addEventListener('scroll', () => onScroll(scrollY), { passive: true });
  if (reduce || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  if (window.Lenis) {
    const lenis = new Lenis({ lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); lenis.scrollTo(a.getAttribute('href')); }));
  }
  const split = (el) => window.SplitType ? new SplitType(el, { types: 'lines,words' }) : null;
  document.querySelectorAll('[data-split]').forEach((el, i) => {
    const s = split(el);
    if (!s) return;
    s.lines.forEach((l) => { const w = document.createElement('div'); w.className = 'line'; w.style.overflow = 'hidden'; l.parentNode.insertBefore(w, l); w.appendChild(l); });
    const inHero = !!el.closest('.hero');
    gsap.from(s.words, { yPercent: 115, rotate: 4, duration: 1.25, ease: 'expo.out', stagger: 0.06, delay: inHero ? 0.25 : 0,
      scrollTrigger: inHero ? null : { trigger: el, start: 'top 85%' } });
  });
  gsap.from('[data-fade]', { y: 24, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.12, delay: 0.7 });
  gsap.from('.nav', { y: -30, opacity: 0, duration: 1, ease: 'power3.out', delay: 0.2 });
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    gsap.from(el, { y: 50, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  document.querySelectorAll('[data-speed]').forEach((el) => {
    gsap.to(el, { yPercent: parseFloat(el.dataset.speed) * 100, ease: 'none', scrollTrigger: { trigger: el.closest('section') || el, start: 'top top', end: 'bottom top', scrub: true } });
  });
  const orb = document.querySelector('.orb');
  if (orb) addEventListener('pointermove', (e) => gsap.to(orb, { x: e.clientX - innerWidth / 2, y: e.clientY - innerHeight / 2, duration: 2.2, ease: 'power3.out' }));
  const track = document.querySelector('.marquee-track');
  if (track) ScrollTrigger.create({ trigger: '.marquee', onUpdate: (st) => gsap.to(track, { skewX: gsap.utils.clamp(-8, 8, st.getVelocity() / -300), duration: 0.4, overwrite: true }) });
})();
</script>
</body>
</html>`;
}

function themeDeco(k) {
  switch (k) {
    case 'noir':
      return `.hero h1{font-size:clamp(3rem,9vw,10rem)}
.orb{left:50%;top:50%;width:70vmax;height:70vmax;margin:-35vmax 0 0 -35vmax;border-radius:50%;background:radial-gradient(circle at 50% 50%,var(--accent),transparent 62%);filter:blur(60px);opacity:.28}
.hero h1{background:linear-gradient(180deg,var(--ink) 40%,color-mix(in oklab,var(--ink) 55%,transparent));-webkit-background-clip:text;background-clip:text}`;
    case 'swiss':
      return `.gridlines{inset:0;background-image:linear-gradient(to right,var(--line) 1px,transparent 1px);background-size:calc((100% - 2*var(--gut))/6) 100%;background-position:var(--gut) 0;background-repeat:repeat-x;margin-inline:var(--gut)}
.bigsq{right:calc(var(--gut) + clamp(150px,19vw,260px));top:22vh;width:clamp(70px,9vw,140px);aspect-ratio:1;background:var(--accent)}
.hero h1{max-width:12ch}`;
    case 'organique':
      return `.blob{right:-8vw;top:12vh;width:min(62vw,720px);aspect-ratio:1;background:radial-gradient(circle at 30% 30%,color-mix(in oklab,var(--accent) 55%,var(--bg)),var(--accent));opacity:.22;border-radius:42% 58% 63% 37% / 41% 44% 56% 59%;animation:morph 14s ease-in-out infinite alternate}
.blob.b2{left:-12vw;right:auto;top:auto;bottom:-10vh;width:min(46vw,520px);opacity:.14;animation-duration:18s}
@keyframes morph{50%{border-radius:58% 42% 35% 65% / 55% 62% 38% 45%;transform:rotate(25deg) scale(1.06)}100%{border-radius:38% 62% 46% 54% / 62% 36% 64% 38%;transform:rotate(-12deg)}}`;
    default:
      return `.rule{left:var(--gut);right:var(--gut);top:96px;height:1px;background:var(--line)}
.bigletter{right:-2vw;bottom:-14vh;font:italic 300 clamp(18rem,48vw,46rem)/.8 var(--display);color:var(--accent);opacity:.09;letter-spacing:-.06em}`;
  }
}

function themeDecoHtml(k) {
  switch (k) {
    case 'noir': return '<div class="deco orb" aria-hidden="true"></div>';
    case 'swiss': return '<div class="deco gridlines" aria-hidden="true"></div><div class="deco bigsq" aria-hidden="true" data-speed="-0.4"></div>';
    case 'organique': return '<div class="deco blob" aria-hidden="true" data-speed="0.25"></div><div class="deco blob b2" aria-hidden="true" data-speed="-0.2"></div>';
    default: return '<div class="deco rule" aria-hidden="true"></div><div class="deco bigletter" aria-hidden="true" data-speed="0.35">&amp;</div>';
  }
}

export const stripRibbon = (html) => html.replace(/<!--ribbon-->[\s\S]*?<!--\/ribbon-->/g, '');
