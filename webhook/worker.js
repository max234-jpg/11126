// Récepteur des réponses WhatsApp (mode "api" uniquement).
// Cloudflare Worker gratuit : Meta y envoie chaque message reçu, le Worker le
// garde 30 jours dans un KV et, si NTFY_TOPIC est défini, te pousse une
// notification sur ton téléphone. Chaque matin le script le relit.
//
// Secrets (wrangler secret put …) : VERIFY_TOKEN, APP_SECRET, API_TOKEN, [NTFY_TOPIC]

const enc = new TextEncoder();

async function signatureValide(corps, entete, secret) {
  if (!entete || !entete.startsWith("sha256=") || !secret) return false;
  const cle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cle, enc.encode(corps)));
  const attendu = [...sig].map((o) => o.toString(16).padStart(2, "0")).join("");
  const recu = entete.slice(7);
  if (recu.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < recu.length; i++) diff |= recu.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

function texteDe(m) {
  return m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ?? `[${m.type}]`;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // 1. Vérification du webhook par Meta
    if (url.pathname === "/webhook" && req.method === "GET") {
      const p = url.searchParams;
      if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === env.VERIFY_TOKEN) {
        return new Response(p.get("hub.challenge"));
      }
      return new Response("interdit", { status: 403 });
    }

    // 2. Messages entrants
    if (url.pathname === "/webhook" && req.method === "POST") {
      const brut = await req.text();
      if (!(await signatureValide(brut, req.headers.get("x-hub-signature-256"), env.APP_SECRET))) {
        return new Response("signature invalide", { status: 401 });
      }
      const corps = JSON.parse(brut);
      for (const entry of corps.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const v = change.value ?? {};
          const noms = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]));
          for (const m of v.messages ?? []) {
            const r = { id: m.id, de: m.from, nom: noms[m.from] ?? "", texte: texteDe(m), ts: Number(m.timestamp) };
            await env.REPONSES.put(`r:${String(r.ts).padStart(12, "0")}:${m.id}`, JSON.stringify(r),
              { expirationTtl: 60 * 60 * 24 * 30 });
            if (env.NTFY_TOPIC) {
              ctx.waitUntil(fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
                method: "POST",
                headers: { Title: "Réponse d'un artisan", Tags: "speech_balloon" },
                body: `${r.nom || "+" + r.de} : ${r.texte}`.slice(0, 1000),
              }));
            }
          }
        }
      }
      return new Response("ok");
    }

    // 3. Lecture par le script du matin
    if (url.pathname === "/reponses" && req.method === "GET") {
      if (!env.API_TOKEN || req.headers.get("authorization") !== `Bearer ${env.API_TOKEN}`) {
        return new Response("interdit", { status: 401 });
      }
      const depuis = `r:${String(url.searchParams.get("depuis") ?? "0").padStart(12, "0")}`;
      const sortie = [];
      let cursor;
      do {
        const page = await env.REPONSES.list({ prefix: "r:", cursor });
        for (const k of page.keys) {
          if (k.name < depuis) continue;
          const v = await env.REPONSES.get(k.name);
          if (v) sortie.push(JSON.parse(v));
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return Response.json(sortie);
    }

    return new Response("introuvable", { status: 404 });
  },
};
