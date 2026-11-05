// Intégration Claude (optionnelle) : rédaction des textes ou design HTML complet,
// guidé par les skills (SKILL.md) que tu as installés.
import Anthropic from '@anthropic-ai/sdk';
import { loadSkillTexts } from '../skills.js';

let client;
export const aiAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const HONESTY = `Règles d'honnêteté NON négociables :
- Utilise UNIQUEMENT les faits fournis (nom, métier, ville, adresse, téléphone, email, horaires, prestations).
- N'invente jamais d'avis clients, de notes, de chiffres, d'années d'existence, de diplômes, de récompenses, de prix, de photos ou de promesses.
- Si une information manque, n'en parle pas.
- Français naturel, chaleureux et précis, sans superlatifs creux.`;

function factsOf(p, trade) {
  return {
    nom: p.name,
    metier: trade?.label || p.tradeLabel || p.trade,
    ville: p.city,
    adresse: p.address || null,
    telephone: p.phone || null,
    email: p.email || null,
    horaires_osm: p.hours || null,
    coordonnees: p.lat && p.lon ? { lat: p.lat, lon: p.lon } : null,
    prestations: p.services?.length ? p.services : trade?.services || [],
    notes_du_vendeur: p.notes || null,
  };
}

async function run({ settings, system, user, maxTokens, format }) {
  const stream = getClient().beta.messages.stream({
    model: settings.ai.model || 'claude-opus-5-5',
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: settings.ai.effort || 'high', ...(format ? { format } : {}) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude a décliné cette demande.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse tronquée (max_tokens atteint).');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const COPY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kicker', 'headline', 'tagline', 'intro', 'services', 'spiritTitle', 'spirit', 'cta', 'theme'],
  properties: {
    kicker: { type: 'string', description: 'Sur-titre court : métier — ville' },
    headline: { type: 'string', description: 'Titre du hero : en général le nom exact du commerce' },
    tagline: { type: 'string', description: 'Accroche de 4 à 9 mots' },
    intro: { type: 'string', description: '1 à 2 phrases sur les prestations' },
    services: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'text'],
        properties: { title: { type: 'string' }, text: { type: 'string', description: 'Une phrase descriptive, sans promesse chiffrée' } },
      },
    },
    spiritTitle: { type: 'string' },
    spirit: { type: 'string', description: '2 phrases maximum sur l’esprit du lieu, sans fait inventé' },
    cta: { type: 'string', description: 'Appel à l’action de 2 à 4 mots' },
    theme: { type: 'string', enum: ['editorial', 'noir', 'swiss', 'organique'] },
  },
};

export async function aiCopy({ prospect, trade, settings }) {
  const skills = loadSkillTexts(settings.ai.enabledSkills);
  const system = `Tu es directeur artistique et copywriter pour des sites vitrines de commerces locaux.\n${HONESTY}\n${skills ? `\nApplique aussi ces skills installés par l'utilisateur :\n${skills}` : ''}`;
  const user = `Rédige les textes du site vitrine et choisis la direction artistique la plus adaptée.\nFaits disponibles :\n${JSON.stringify(factsOf(prospect, trade), null, 2)}`;
  const text = await run({ settings, system, user, maxTokens: 16000, format: { type: 'json_schema', schema: COPY_SCHEMA } });
  return JSON.parse(text);
}

export async function aiFullSite({ prospect, trade, settings, baseHtml }) {
  const libs = settings.libs;
  const skills = loadSkillTexts(settings.ai.enabledSkills);
  const system = `Tu es un designer/développeur front-end de très haut niveau (niveau Awwwards). Tu livres UN fichier HTML autonome, prêt à être ouvert.
${HONESTY}
Contraintes techniques :
- Un seul fichier : CSS et JS inline. Polices via Google Fonts uniquement.
- Bibliothèques disponibles (balises <script> à inclure telles quelles) : GSAP ${libs.gsap} ; ScrollTrigger ${libs.scrollTrigger} ; Lenis ${libs.lenis} ; SplitType ${libs.splitType}${libs.extra ? ` ; extra : ${libs.extra}` : ''}.
- Aucune image externe ni photo : formes, typographie, SVG et dégradés uniquement. Carte OpenStreetMap en iframe autorisée si coordonnées.
- Responsive impeccable (mobile 375px), accessibilité (contrastes, alt, focus), prefers-reduced-motion respecté.
- Conserve le bandeau "<!--ribbon-->…<!--/ribbon-->" présent dans la base, à l'identique.
- Réponds UNIQUEMENT avec le code HTML complet, sans balises markdown.
${skills ? `\nSkills installés par l'utilisateur — suis-les :\n${skills}` : ''}`;
  const user = `Conçois un site vitrine exceptionnel pour ce commerce. Pars de cette base (structure + faits), puis surpasse-la en design :\n\nFaits :\n${JSON.stringify(factsOf(prospect, trade), null, 2)}\n\nBase HTML :\n${baseHtml}`;
  let html = await run({ settings, system, user, maxTokens: 64000 });
  html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!/<html[\s>]/i.test(html)) throw new Error('Claude n’a pas renvoyé de HTML valide.');
  return html;
}
