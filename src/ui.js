// Interface : menu principal, casier, boutique, options, HUD, mini-carte, fil des éliminations.
import { SKINS } from './character.js';
import { H, N, HALF, LOTS, ROAD_D, WATER } from './map.js';

const $ = (sel, root = document) => root.querySelector(sel);
const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.menuOpen = true;
    this.root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="hud-top">
          <div class="chip"><span class="ic">👥</span><b id="h-alive">16</b> en vie</div>
          <div class="chip"><span class="ic">🎯</span><b id="h-kills">0</b> élim.</div>
          <div class="chip storm"><span class="ic">🌪️</span><span id="h-storm">—</span></div>
        </div>
        <div id="minimap"><canvas id="mm" width="200" height="200"></canvas><div id="mm-n">N</div></div>
        <div id="hud-health">
          <div class="row"><span class="lbl">SANTÉ</span><div class="bar hp"><span id="h-hp"></span></div><b id="h-hpn">100</b></div>
          <div class="row"><span class="lbl">🩹 x<b id="h-med">0</b></span><span class="lbl coins">🪙 <b id="h-coins">0</b></span></div>
        </div>
        <div id="hud-ammo"><div class="wname">PISTOLET 9 MM</div><div><b id="h-mag">12</b><span>/ <b id="h-res">36</b></span></div></div>
        <div id="cross"><i></i><i></i><i></i><i></i></div>
        <div id="hitm"></div>
        <div id="prompt" class="hidden"></div>
        <div id="feed"></div>
        <div id="toast"></div>
        <div id="storm-warn" class="hidden">⚠️ HORS DE LA ZONE — rejoins le cercle !</div>
        <div id="speed" class="hidden"><b id="h-speed">0</b> km/h</div>
      </div>
      <div id="menu" class="screen">
        <div class="menu-left">
          <h1>BATTLE<br>ROYALE</h1>
          <p class="tag">Île de San Calma · 16 joueurs · solo hors ligne</p>
          <button class="big" data-act="play">▶ JOUER</button>
          <button data-act="locker">👕 CASIER</button>
          <button data-act="shop">🛍️ BOUTIQUE</button>
          <button data-act="options">⚙️ OPTIONS</button>
          <button data-act="help">⌨️ COMMANDES</button>
          <p class="wallet">🪙 <b class="m-coins">0</b> pièces</p>
        </div>
        <div class="menu-panel hidden" id="panel"></div>
      </div>
      <div id="pause" class="screen hidden">
        <div class="card"><h2>PAUSE</h2>
          <button class="big" data-act="resume">▶ REPRENDRE</button>
          <button data-act="options">⚙️ OPTIONS</button>
          <button data-act="help">⌨️ COMMANDES</button>
          <button data-act="quit">⏏ QUITTER LA PARTIE</button>
        </div>
        <div class="menu-panel hidden" id="panel2"></div>
      </div>
      <div id="end" class="screen hidden"><div class="card"><h2 id="end-title"></h2><p id="end-sub"></p><button class="big" data-act="menu">CONTINUER</button></div></div>
      <div id="bigmap" class="hidden"><canvas id="bm" width="640" height="640"></canvas><p>M pour fermer</p></div>
    `;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.action(b.dataset.act, b);
    });
    this.mapImage = this.renderMap();
    this.mm = $('#mm').getContext('2d');
    this.updateWallet();
  }

  hide(el, v = true) { el.classList.toggle('hidden', v); }

  action(act, el) {
    const g = this.game;
    g.audio.start();
    if (act === 'play') g.startMatch();
    else if (act === 'locker') this.panel('locker');
    else if (act === 'shop') this.panel('shop');
    else if (act === 'options') this.panel('options');
    else if (act === 'help') this.panel('help');
    else if (act === 'resume') g.resume();
    else if (act === 'quit' || act === 'menu') g.toMenu();
    else if (act === 'equip') { g.equipSkin(el.dataset.id); this.panel(this.curPanel); }
    else if (act === 'buy') { g.buySkin(el.dataset.id); this.panel(this.curPanel); }
    else if (act === 'close') this.hide(this.curPanelEl, true);
  }

  panel(kind) {
    const g = this.game;
    const el = g.state === 'paused' ? $('#panel2') : $('#panel');
    this.curPanel = kind; this.curPanelEl = el;
    this.hide(el, false);
    if (kind === 'locker' || kind === 'shop') {
      const list = kind === 'locker' ? SKINS.filter((s) => g.save.owned.includes(s.id)) : SKINS;
      el.innerHTML = `<h3>${kind === 'locker' ? '👕 MON CASIER' : '🛍️ BOUTIQUE'}</h3>
        <p class="hint">${kind === 'locker' ? 'Choisis ta tenue. Tes tenues achetées apparaissent ici.' : 'Gagne des pièces en ouvrant des coffres, en éliminant des adversaires et en remportant la partie.'}</p>
        <div class="skins">${list.map((s) => {
          const owned = g.save.owned.includes(s.id), eq = g.save.skin === s.id;
          return `<div class="skin ${eq ? 'eq' : ''}">
            <div class="sw" style="background:linear-gradient(180deg, ${s.shirt.fabric === 'camo' ? '#55603d' : s.shirt.color} 0 55%, ${s.pants.fabric === 'camo' ? '#4a4f36' : s.pants.color === '#ffffff' ? '#3d5a86' : s.pants.color} 55% 92%, ${s.shoes} 92%)"></div>
            <b>${s.nom}</b><small>${s.body === 'Male' ? 'Homme' : 'Femme'} · ${s.shirt.fabric.replace('_fabric', '').replace('fabric_', '').replace('_01', '').replace('cotton_jersey', 'coton').replace('jersey_melange', 'jersey chiné').replace('leather', 'cuir').replace('denim', 'jean').replace('camo', 'camouflage')}</small>
            ${owned ? (eq ? '<span class="tag-eq">ÉQUIPÉE</span>' : `<button data-act="equip" data-id="${s.id}">Équiper</button>`)
              : `<button data-act="buy" data-id="${s.id}" ${g.save.coins < s.prix ? 'disabled' : ''}>Acheter ${s.prix} 🪙</button>`}
          </div>`;
        }).join('')}</div>
        <p class="wallet">🪙 <b class="m-coins">${g.save.coins}</b> pièces</p>
        <button data-act="close">Fermer</button>`;
    } else if (kind === 'options') {
      el.innerHTML = `<h3>⚙️ OPTIONS</h3>
        <label>Qualité graphique
          <select id="o-q">${['basse', 'moyenne', 'haute', 'ultra'].map((q) => `<option ${g.engine.qualityName === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
        <label>Sensibilité de la souris <input id="o-s" type="range" min="0.3" max="2.5" step="0.05" value="${g.input.sensitivity}"></label>
        <label>Volume <input id="o-v" type="range" min="0" max="1" step="0.05" value="${g.audio.volume}"></label>
        <p class="hint">« haute » convient aux Mac Apple Silicon (M1 et plus récents). Choisis « moyenne » ou « basse » sur un Mac Intel.</p>
        <button data-act="close">Fermer</button>`;
      $('#o-q', el).onchange = (e) => g.setQuality(e.target.value);
      $('#o-s', el).oninput = (e) => { g.input.sensitivity = +e.target.value; g.persist(); };
      $('#o-v', el).oninput = (e) => { g.audio.setVolume(+e.target.value); g.persist(); };
    } else if (kind === 'help') {
      el.innerHTML = `<h3>⌨️ COMMANDES</h3><table class="keys">
        <tr><td>Z Q S D / W A S D</td><td>Se déplacer (nager dans l’eau)</td></tr>
        <tr><td>Maj</td><td>Sprinter</td></tr><tr><td>Espace</td><td>Sauter</td></tr>
        <tr><td>Souris</td><td>Regarder autour</td></tr><tr><td>Clic droit</td><td>Viser</td></tr>
        <tr><td>Clic gauche</td><td>Tirer</td></tr><tr><td>R</td><td>Recharger</td></tr>
        <tr><td>E</td><td>Ouvrir un coffre · monter / descendre de voiture</td></tr>
        <tr><td>H</td><td>Utiliser une trousse de soin</td></tr><tr><td>B</td><td>Danser</td></tr>
        <tr><td>C</td><td>Marcher lentement</td></tr><tr><td>M</td><td>Carte de l’île</td></tr>
        <tr><td>Échap</td><td>Pause</td></tr></table>
        <p class="hint">En voiture : Z/W accélérer, S freiner / reculer, Q/A et D tourner, Espace frein à main.</p>
        <button data-act="close">Fermer</button>`;
    }
  }

  updateWallet() { for (const e of document.querySelectorAll('.m-coins')) e.textContent = this.game.save.coins; }

  showMenu(v) {
    this.menuOpen = v;
    this.hide($('#menu'), !v);
    this.hide($('#hud'), v);
    this.hide($('#panel'), true);
    this.updateWallet();
  }
  showPause(v) { this.menuOpen = v; this.hide($('#pause'), !v); this.hide($('#panel2'), true); }
  showEnd(title, sub) { this.menuOpen = true; $('#end-title').innerHTML = title; $('#end-sub').innerHTML = sub; this.hide($('#end'), false); }
  hideEnd() { this.hide($('#end'), true); }

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  feed(msg) {
    const f = $('#feed');
    const e = html(`<div class="kf">${msg}</div>`);
    f.prepend(e);
    setTimeout(() => e.remove(), 6000);
    while (f.children.length > 5) f.lastChild.remove();
  }

  hitmarker(head, killed) {
    const h = $('#hitm');
    h.className = 'on' + (head ? ' head' : '') + (killed ? ' kill' : '');
    clearTimeout(this.hitT);
    this.hitT = setTimeout(() => (h.className = ''), 160);
  }

  damageFlash() { this.flash = 0.45; }
  shake(v) { this.shakeAmt = Math.max(this.shakeAmt || 0, v); }

  prompt(text) {
    const p = $('#prompt');
    if (text) { p.innerHTML = text; this.hide(p, false); } else this.hide(p, true);
  }

  // ---------- carte : rendu une fois à partir du relief ----------
  renderMap() {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, h = H[k], p = k * 4;
      let r, g, b;
      if (h < WATER) { const d = Math.min(1, -h / 12); r = 40 - d * 30; g = 150 - d * 90; b = 170 - d * 50; }
      else if (h < 2) { r = 214; g = 199; b = 150; }
      else {
        const gx = (H[Math.min(k + 1, N * N - 1)] - H[Math.max(k - 1, 0)]), gz = (H[Math.min(k + N, N * N - 1)] - H[Math.max(k - N, 0)]);
        const shade = 1 + (gx - gz) * 0.18;
        r = (70 + h * 2.2) * shade; g = (118 + h * 1.4) * shade; b = (60 + h) * shade;
        if (Math.hypot(gx, gz) > 1.2) { r = g = b = 130 * shade; }
      }
      if (ROAD_D[k] < 0) { r = 72; g = 74; b = 78; }
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = '#d9cfc0';
    for (const l of LOTS) { x.save(); x.translate(l.x + HALF, l.z + HALF); x.rotate(-l.rot); x.fillRect(-6, -5, 12, 10); x.restore(); }
    return c;
  }

  drawMinimap(player, storm, yaw) {
    const ctx = this.mm, S = 200, scale = 1.25;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1d4f66'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(yaw);
    ctx.scale(scale, scale);
    ctx.translate(-(player.pos.x + HALF), -(player.pos.z + HALF));
    ctx.drawImage(this.mapImage, 0, 0);
    // tempête
    ctx.beginPath();
    ctx.rect(-500, -500, N + 1000, N + 1000);
    ctx.arc(storm.cur.x + HALF, storm.cur.z + HALF, Math.max(0.1, storm.cur.r), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(120,40,200,0.38)'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(storm.next.x + HALF, storm.next.z + HALF, Math.max(0.1, storm.next.r), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // joueur (flèche au centre)
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(yaw - player.yaw + Math.PI);
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    $('#mm-n').style.transform = `translate(-50%, -50%) rotate(${yaw}rad) translateY(-88px) rotate(${-yaw}rad)`;
  }

  drawBigMap(player, storm) {
    const ctx = $('#bm').getContext('2d');
    ctx.drawImage(this.mapImage, 0, 0, 640, 640);
    const k = 640 / N;
    ctx.save(); ctx.scale(k, k);
    ctx.beginPath(); ctx.rect(0, 0, N, N);
    ctx.arc(storm.cur.x + HALF, storm.cur.z + HALF, Math.max(0.1, storm.cur.r), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(120,40,200,0.4)'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(storm.next.x + HALF, storm.next.z + HALF, Math.max(0.1, storm.next.r), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(player.pos.x + HALF, player.pos.z + HALF, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  toggleMap(v) { this.hide($('#bigmap'), !v); }

  updateHud(g, dt) {
    const p = g.player;
    $('#h-alive').textContent = g.actors.filter((a) => a.alive).length;
    $('#h-kills').textContent = p.kills;
    $('#h-storm').textContent = g.storm.label();
    $('#h-hp').style.width = Math.max(0, p.health) + '%';
    $('#h-hp').style.background = p.health > 50 ? '#5ee38c' : p.health > 25 ? '#ffc94d' : '#ff5a4d';
    $('#h-hpn').textContent = Math.ceil(Math.max(0, p.health));
    $('#h-med').textContent = g.medkits;
    $('#h-coins').textContent = g.save.coins;
    $('#h-mag').textContent = p.reloading > 0 ? '…' : p.mag;
    $('#h-res').textContent = p.reserve;
    this.hide($('#storm-warn'), !(g.storm.outside(p.pos) && p.alive));
    $('#cross').className = p.aiming ? 'aim' : '';
    this.hide($('#cross'), !!p.inCar);
    this.hide($('#speed'), !p.inCar);
    if (p.inCar) $('#h-speed').textContent = Math.round(Math.abs(p.inCar.speed) * 3.6);
    // flash rouge de dégâts + secousse
    this.flash = Math.max(0, (this.flash || 0) - dt * 1.6);
    const low = p.alive && p.health < 30 ? 0.12 + 0.06 * Math.sin(performance.now() / 200) : 0;
    g.engine.grade.uniforms.uFlash.value = Math.max(this.flash * 0.5, low);
    const outside = g.storm.outside(p.pos);
    g.engine.grade.uniforms.uTint.value.set(outside ? 0.85 : 1, outside ? 0.75 : 1, outside ? 1.1 : 1);
  }
}
