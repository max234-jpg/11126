"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = { mode: "couleur", frames: 5, tab: "cam", scans: [], selected: new Set(), current: null };

// ---------------------------------------------------------------- utilitaires
async function api(url, opts = {}) {
  const r = await fetch(url, opts);
  const isJson = (r.headers.get("Content-Type") || "").includes("json");
  const data = isJson ? await r.json() : null;
  if (!r.ok) throw new Error((data && data.error) || `Erreur ${r.status}`);
  return data;
}
const post = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

let toastTimer;
function toast(msg, ms = 2500) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function setModeButtons(container, mode) {
  $$(`${container} button`).forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
}

// ---------------------------------------------------------------- onglets
function showTab(name) {
  state.tab = name;
  $$("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  updateLive();
  if (name === "scans") loadScans();
}
$$("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("#goScans").addEventListener("click", () => showTab("scans"));

// ---------------------------------------------------------------- vidéo en direct
function updateLive() {
  const img = $("#live");
  const want = state.tab === "cam" && $("#editor").hidden && !document.hidden;
  if (want) {
    const src = `/video_feed?overlay=${$("#overlay").checked ? 1 : 0}&t=${Date.now()}`;
    if (!img.dataset.on || img.dataset.overlay !== String($("#overlay").checked)) {
      img.src = src; img.dataset.on = "1"; img.dataset.overlay = String($("#overlay").checked);
    }
  } else if (img.dataset.on) {
    img.removeAttribute("src"); delete img.dataset.on;
  }
}
$("#overlay").addEventListener("change", updateLive);
document.addEventListener("visibilitychange", updateLive);

async function refreshStatus() {
  try {
    const s = await api("/api/status");
    const b = $("#status");
    if (!s.source) { b.textContent = "Non configurée"; b.className = "badge ko"; }
    else if (s.connected) { b.textContent = `● ${s.width}×${s.height} · ${s.fps} img/s`; b.className = "badge ok"; }
    else { b.textContent = "● Déconnectée"; b.className = "badge ko"; b.title = s.error || ""; }
  } catch { $("#status").textContent = "Serveur injoignable"; $("#status").className = "badge ko"; }
}
setInterval(refreshStatus, 3000);

// ---------------------------------------------------------------- réglages de scan
$$("#modes button").forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode; setModeButtons("#modes", state.mode);
  post("/api/config", { mode: state.mode });
}));
$("#frames").addEventListener("input", (e) => { $("#framesVal").textContent = e.target.value; });
$("#frames").addEventListener("change", (e) => {
  state.frames = +e.target.value; post("/api/config", { frames: state.frames });
});

// ---------------------------------------------------------------- scanner
$("#scanBtn").addEventListener("click", async () => {
  const btn = $("#scanBtn");
  if (btn.classList.contains("busy")) return;
  btn.classList.add("busy");
  toast("Scan en cours…", 15000);
  try {
    const meta = await post("/api/scan", { mode: state.mode, frames: state.frames });
    toast(meta.detected ? "✔ Document détecté et redressé" : "Document non détecté : image entière utilisée (recadrez si besoin)", 3500);
    openEditor(meta);
  } catch (e) { toast("⚠️ " + e.message, 5000); }
  finally { btn.classList.remove("busy"); }
});

$("#upload").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append("file", f));
  fd.append("mode", state.mode);
  toast("Traitement…", 30000);
  try {
    const res = await api("/api/upload", { method: "POST", body: fd });
    if (res.scans) { toast(`✔ ${res.scans.length} images scannées`); showTab("scans"); }
    else { toast("✔ Image scannée"); openEditor(res); }
  } catch (err) { toast("⚠️ " + err.message, 5000); }
  e.target.value = "";
});

// ---------------------------------------------------------------- galerie
async function loadScans() {
  state.scans = await api("/api/scans");
  const ids = new Set(state.scans.map((s) => s.id));
  state.selected.forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
  $("#count").textContent = state.scans.length || "";
  const grid = $("#grid");
  grid.innerHTML = "";
  $("#empty").hidden = state.scans.length > 0;
  for (const s of state.scans) {
    const d = document.createElement("div");
    d.className = "thumb" + (state.selected.has(s.id) ? " sel" : "");
    const date = new Date(s.created * 1000).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    d.innerHTML = `<img loading="lazy" src="/scans/${s.id}/thumb.jpg?v=${s.updated}"><input type="checkbox" ${state.selected.has(s.id) ? "checked" : ""}><div class="lbl">${date}</div>`;
    const cb = d.querySelector("input");
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      cb.checked ? state.selected.add(s.id) : state.selected.delete(s.id);
      d.classList.toggle("sel", cb.checked); updateSelInfo();
    });
    d.addEventListener("click", () => openEditor(s));
    grid.appendChild(d);
  }
  updateSelInfo();
}
function updateSelInfo() {
  const n = state.selected.size;
  $("#selInfo").textContent = n ? `${n} sélectionné(s)` : "Touchez un scan pour l'ouvrir. Cochez-en plusieurs pour un PDF.";
  $("#pdfBtn").textContent = n ? `📕 PDF (${n})` : "📕 Exporter en PDF";
  $("#delSel").disabled = !n;
  $("#selAll").textContent = n && n === state.scans.length ? "Tout désélectionner" : "Tout sélectionner";
}
$("#selAll").addEventListener("click", () => {
  if (state.selected.size === state.scans.length) state.selected.clear();
  else state.scans.forEach((s) => state.selected.add(s.id));
  loadScans();
});
$("#pdfBtn").addEventListener("click", () => {
  if (!state.scans.length) return toast("Aucun scan à exporter");
  // ordre chronologique (du plus ancien au plus récent)
  const ids = state.scans.filter((s) => state.selected.has(s.id)).reverse().map((s) => s.id);
  window.location.href = "/api/pdf" + (ids.length ? "?ids=" + ids.join(",") : "");
});
$("#delSel").addEventListener("click", async () => {
  const n = state.selected.size;
  if (!n || !confirm(`Supprimer ${n} scan(s) ?`)) return;
  for (const id of state.selected) await api(`/api/scans/${id}`, { method: "DELETE" });
  state.selected.clear(); loadScans(); toast("Supprimé");
});

// ---------------------------------------------------------------- éditeur
function openEditor(meta) {
  state.current = meta;
  $("#editor").hidden = false;
  updateLive();
  showCrop(false);
  renderEditor();
}
function renderEditor() {
  const m = state.current;
  $("#edImg").src = `/scans/${m.id}.jpg?v=${m.updated}`;
  $("#edDl").href = `/scans/${m.id}.jpg?dl=1`;
  $("#edTitle").textContent = `${m.width}×${m.height}`;
  setModeButtons("#edModes", m.mode);
}
function closeEditor() {
  $("#editor").hidden = true; state.current = null;
  updateLive(); if (state.tab === "scans") loadScans(); else refreshCount();
}
async function refreshCount() {
  try { $("#count").textContent = (await api("/api/scans")).length || ""; } catch { /* rien */ }
}
$("#edClose").addEventListener("click", closeEditor);

async function reprocess(changes) {
  $("#busy").hidden = false;
  try { state.current = await post(`/api/scans/${state.current.id}/process`, changes); renderEditor(); }
  catch (e) { toast("⚠️ " + e.message, 4000); }
  finally { $("#busy").hidden = true; }
}
$$("#edModes button").forEach((b) => b.addEventListener("click", () => reprocess({ mode: b.dataset.mode })));
$("#rotL").addEventListener("click", () => reprocess({ rotation: (state.current.rotation + 270) % 360 }));
$("#rotR").addEventListener("click", () => reprocess({ rotation: (state.current.rotation + 90) % 360 }));
$("#edDel").addEventListener("click", async () => {
  if (!confirm("Supprimer ce scan ?")) return;
  await api(`/api/scans/${state.current.id}`, { method: "DELETE" });
  toast("Supprimé"); closeEditor();
});

// ---------------------------------------------------------------- recadrage manuel
let corners = [];
function showCrop(on) {
  $("#cropWrap").hidden = !on; $("#edImg").hidden = on;
  $("#cropTools").hidden = !on; $("#edTools").hidden = on;
}
$("#cropBtn").addEventListener("click", () => {
  corners = state.current.corners.map((p) => [...p]);
  const img = $("#cropImg");
  img.onload = () => drawCrop();
  img.src = `/scans/${state.current.id}/original.jpg?v=${state.current.created}`;
  showCrop(true);
  if (img.complete && img.naturalWidth) drawCrop();
});
function drawCrop() {
  const svg = $("#cropSvg");
  const r = svg.getBoundingClientRect();
  if (!r.width) return;
  svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  const pts = corners.map(([x, y]) => [x * r.width, y * r.height]);
  const poly = pts.map((p) => p.join(",")).join(" ");
  svg.innerHTML =
    `<defs><mask id="m"><rect width="100%" height="100%" fill="white"/><polygon points="${poly}" fill="black"/></mask></defs>` +
    `<rect width="100%" height="100%" fill="rgba(0,0,0,.5)" mask="url(#m)"/>` +
    `<polygon points="${poly}" fill="rgba(47,140,255,.12)" stroke="#2f8cff" stroke-width="2.5"/>` +
    pts.map((p, i) => `<circle data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="16" fill="rgba(47,140,255,.35)" stroke="#fff" stroke-width="3"/>`).join("");
}
window.addEventListener("resize", () => { if (!$("#cropWrap").hidden) drawCrop(); });

let drag = null;
$("#cropSvg").addEventListener("pointerdown", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  // coin le plus proche du doigt
  let best = 0, bd = Infinity;
  corners.forEach(([cx, cy], i) => {
    const d = Math.hypot((cx - x) * r.width, (cy - y) * r.height);
    if (d < bd) { bd = d; best = i; }
  });
  if (bd > 60) return;
  drag = best; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
});
$("#cropSvg").addEventListener("pointermove", (e) => {
  if (drag === null) return;
  const r = e.currentTarget.getBoundingClientRect();
  corners[drag] = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
                   Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  drawCrop();
});
["pointerup", "pointercancel"].forEach((ev) => $("#cropSvg").addEventListener(ev, () => (drag = null)));

$("#cropCancel").addEventListener("click", () => showCrop(false));
$("#cropFull").addEventListener("click", () => { corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; drawCrop(); });
$("#cropAuto").addEventListener("click", async () => { showCrop(false); await reprocess({ corners: "auto" }); });
$("#cropOk").addEventListener("click", async () => { showCrop(false); await reprocess({ corners }); });

// ---------------------------------------------------------------- configuration caméra
async function loadConfig() {
  const c = await api("/api/config");
  $("#source").value = c.source; $("#kind").value = c.kind || "auto";
  $("#user").value = c.user; $("#password").value = c.password;
  state.mode = c.mode || "couleur"; state.frames = c.frames || 5;
  setModeButtons("#modes", state.mode);
  $("#frames").value = state.frames; $("#framesVal").textContent = state.frames;
  if (!c.source) { showTab("settings"); toast("Commencez par indiquer l'adresse de votre caméra", 4000); }
}
$("#cfgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await post("/api/config", {
    source: $("#source").value.trim(), kind: $("#kind").value,
    user: $("#user").value.trim(), password: $("#password").value, reconnect: true,
  });
  toast("Connexion à la caméra…");
  setTimeout(async () => {
    await refreshStatus();
    const s = await api("/api/status");
    if (s.connected) { toast("✔ Caméra connectée"); showTab("cam"); }
    else toast("⚠️ Pas encore d'image" + (s.error ? " : " + s.error : " (patientez ou vérifiez l'adresse)"), 6000);
  }, 3000);
});

$("#discoverBtn").addEventListener("click", async () => {
  const out = $("#discover");
  out.innerHTML = '<p class="hint">Recherche sur le réseau (≈ 10 s)…</p>';
  try {
    const r = await api("/api/discover");
    if (!r.devices.length) { out.innerHTML = `<p class="hint">Aucun appareil trouvé sur ${r.me.replace(/\.\d+$/, ".x")}.</p>`; return; }
    out.innerHTML = r.devices.map((d) => `<div class="dev"><b>${d.ip}</b> <span class="hint">ports ${d.ports.join(", ")}</span><br>` +
      d.urls.map((u) => `<button type="button" data-url="${u}">${u}</button>`).join("") + "</div>").join("");
    out.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      $("#source").value = b.dataset.url; $("#kind").value = "auto"; toast("Adresse copiée : complétez si besoin puis Enregistrer");
    }));
  } catch (e) { out.innerHTML = `<p class="hint">Erreur : ${e.message}</p>`; }
});

// ---------------------------------------------------------------- démarrage
loadConfig().then(() => { updateLive(); refreshStatus(); refreshCount(); });
