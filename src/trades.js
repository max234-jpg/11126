// Catalogue des métiers : tag OpenStreetMap, prestations types (modifiables), ambiance visuelle.
// Les prestations sont des intitulés génériques du métier, présentés comme "à confirmer" avec le client.
export const TRADES = {
  coiffeur: {
    label: 'Coiffeur', tags: ['shop=hairdresser'], theme: 'editorial', hue: 18,
    services: ['Coupe femme', 'Coupe homme', 'Couleur & balayage', 'Brushing', 'Soins du cheveu', 'Coiffure de cérémonie'],
    pitch: 'Un salon où l’on prend le temps.',
  },
  barbier: {
    label: 'Barbier', tags: ['shop=hairdresser][hairdresser=barber'], theme: 'noir', hue: 32,
    services: ['Coupe', 'Taille de barbe', 'Rasage à l’ancienne', 'Contours', 'Soin visage'],
    pitch: 'Le geste précis, l’allure en plus.',
  },
  estheticienne: {
    label: 'Institut de beauté', tags: ['shop=beauty'], theme: 'organique', hue: 340,
    services: ['Soins du visage', 'Épilations', 'Manucure', 'Beauté des pieds', 'Modelages'],
    pitch: 'Une parenthèse pour vous.',
  },
  plombier: {
    label: 'Plombier', tags: ['craft=plumber'], theme: 'swiss', hue: 210,
    services: ['Dépannage & fuites', 'Installation sanitaire', 'Chauffe-eau', 'Rénovation salle de bain', 'Débouchage'],
    pitch: 'Intervention propre, devis clair.',
  },
  electricien: {
    label: 'Électricien', tags: ['craft=electrician'], theme: 'swiss', hue: 48,
    services: ['Dépannage électrique', 'Mise aux normes', 'Tableau électrique', 'Éclairage', 'Bornes de recharge'],
    pitch: 'Le courant passe, en toute sécurité.',
  },
  menuisier: {
    label: 'Menuisier', tags: ['craft=carpenter', 'craft=joiner'], theme: 'organique', hue: 28,
    services: ['Agencement sur mesure', 'Portes & fenêtres', 'Escaliers', 'Placards & dressings', 'Terrasses bois'],
    pitch: 'Le bois, travaillé sur mesure.',
  },
  peintre: {
    label: 'Peintre en bâtiment', tags: ['craft=painter'], theme: 'editorial', hue: 200,
    services: ['Peinture intérieure', 'Ravalement de façade', 'Papiers peints', 'Enduits décoratifs', 'Préparation des supports'],
    pitch: 'Des murs qui changent tout.',
  },
  serrurier: {
    label: 'Serrurier', tags: ['craft=locksmith', 'shop=locksmith'], theme: 'noir', hue: 45,
    services: ['Ouverture de porte', 'Changement de serrure', 'Blindage', 'Reproduction de clés', 'Contrôle d’accès'],
    pitch: 'Votre porte, entre de bonnes mains.',
  },
  restaurant: {
    label: 'Restaurant', tags: ['amenity=restaurant'], theme: 'noir', hue: 14,
    services: ['Déjeuner', 'Dîner', 'Plats à emporter', 'Privatisation', 'Groupes & événements'],
    pitch: 'Une table qui donne envie de revenir.',
  },
  cafe: {
    label: 'Café', tags: ['amenity=cafe'], theme: 'organique', hue: 30,
    services: ['Cafés de spécialité', 'Petit-déjeuner', 'Pâtisseries', 'À emporter'],
    pitch: 'Le bon café du quartier.',
  },
  boulangerie: {
    label: 'Boulangerie', tags: ['shop=bakery'], theme: 'editorial', hue: 35,
    services: ['Pains', 'Viennoiseries', 'Pâtisseries', 'Snacking', 'Commandes spéciales'],
    pitch: 'Le goût du fait maison.',
  },
  boucherie: {
    label: 'Boucherie', tags: ['shop=butcher'], theme: 'editorial', hue: 355,
    services: ['Viandes', 'Volailles', 'Charcuterie', 'Plats préparés', 'Commandes & plateaux'],
    pitch: 'Le savoir-faire du boucher.',
  },
  fleuriste: {
    label: 'Fleuriste', tags: ['shop=florist'], theme: 'organique', hue: 330,
    services: ['Bouquets', 'Compositions', 'Mariages', 'Deuil', 'Plantes', 'Livraison locale'],
    pitch: 'Des fleurs qui racontent quelque chose.',
  },
  garage: {
    label: 'Garage', tags: ['shop=car_repair'], theme: 'swiss', hue: 4,
    services: ['Entretien & vidange', 'Freinage', 'Pneumatiques', 'Diagnostic', 'Climatisation', 'Préparation contrôle technique'],
    pitch: 'Votre voiture, entre de bonnes mains.',
  },
  fromagerie: {
    label: 'Fromagerie', tags: ['shop=cheese'], theme: 'editorial', hue: 45,
    services: ['Fromages affinés', 'Plateaux', 'Crèmerie', 'Épicerie fine'],
    pitch: 'L’affinage comme un art.',
  },
  caviste: {
    label: 'Caviste', tags: ['shop=wine'], theme: 'noir', hue: 345,
    services: ['Vins', 'Spiritueux', 'Conseil accords', 'Coffrets', 'Dégustations'],
    pitch: 'La bonne bouteille, le bon conseil.',
  },
  opticien: {
    label: 'Opticien', tags: ['shop=optician'], theme: 'swiss', hue: 190,
    services: ['Lunettes de vue', 'Solaires', 'Lentilles', 'Examen de vue', 'Ajustage & réparation'],
    pitch: 'Voir juste, avec style.',
  },
  toiletteur: {
    label: 'Toiletteur', tags: ['shop=pet_grooming'], theme: 'organique', hue: 160,
    services: ['Bain & séchage', 'Coupe', 'Tonte', 'Coupe des griffes', 'Soins'],
    pitch: 'Le bien-être de votre compagnon.',
  },
  photographe: {
    label: 'Photographe', tags: ['craft=photographer', 'shop=photo'], theme: 'noir', hue: 0,
    services: ['Portraits', 'Mariages', 'Photo d’entreprise', 'Événements', 'Photo d’identité'],
    pitch: 'Des images qui vous ressemblent.',
  },
  tatoueur: {
    label: 'Tatoueur', tags: ['shop=tattoo'], theme: 'noir', hue: 280,
    services: ['Projets sur mesure', 'Flash', 'Recouvrement', 'Retouches'],
    pitch: 'L’encre, avec intention.',
  },
  pressing: {
    label: 'Pressing', tags: ['shop=dry_cleaning', 'shop=laundry'], theme: 'swiss', hue: 220,
    services: ['Nettoyage à sec', 'Repassage', 'Linge de maison', 'Retouches', 'Cuir & daim'],
    pitch: 'Vos vêtements, comme neufs.',
  },
  'auto-ecole': {
    label: 'Auto-école', tags: ['amenity=driving_school'], theme: 'swiss', hue: 140,
    services: ['Permis B', 'Conduite accompagnée', 'Code de la route', 'Permis moto', 'Stages'],
    pitch: 'Le permis, sereinement.',
  },
};

export function tradeInfo(key) {
  if (TRADES[key]) return { key, ...TRADES[key] };
  // métier libre : on accepte un tag OSM brut "clé=valeur"
  const raw = String(key || '').trim();
  const isTag = /^[a-z_:]+=[a-z_;:-]+$/i.test(raw);
  return {
    key: raw,
    label: isTag ? raw.split('=')[1].replace(/_/g, ' ') : raw,
    tags: isTag ? [raw] : [],
    theme: 'editorial',
    hue: 220,
    services: [],
    pitch: '',
  };
}
