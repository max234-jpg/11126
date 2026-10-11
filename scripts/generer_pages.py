#!/usr/bin/env python3
"""Génère les pages statiques de Central Rénovation dans le dossier passé en argument."""
import sys, os

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHONE = "01 XX XX XX XX"
MAIL = "contact@[domaine].fr"

ARROW = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
PHONE_ICO = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>'

NAV = [
    ("prestations", "prestations.html", "Prestations"),
    ("methode", "methode.html", "Méthode"),
    ("zone", "zone.html", "Zone"),
    ("faq", "faq.html", "FAQ"),
    ("contact", "contact.html", "Contact"),
]


def head(title, desc, preload):
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="preload" as="image" href="assets/img/{preload}.jpg">
<link rel="stylesheet" href="assets/css/styles.css">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  "name": "Central Rénovation",
  "description": "Entreprise de rénovation intérieure à Montreuil (93).",
  "areaServed": ["Montreuil", "Bagnolet", "Romainville", "Rosny-sous-Bois", "Noisy-le-Sec", "Vincennes", "Fontenay-sous-Bois", "Paris"],
  "address": {{ "@type": "PostalAddress", "addressLocality": "Montreuil", "postalCode": "93100", "addressCountry": "FR" }}
}}
</script>
</head>
<body>
<!--SITE-START-->'''


def header(active):
    links = "\n".join(
        f'      <a href="{href}"{" aria-current=\"page\"" if key == active else ""}>{label}</a>'
        for key, href, label in NAV
    )
    return f'''<a class="skip" href="#contenu">Aller au contenu</a>

<header class="site-header" id="site-header">
  <div class="wrap header-row">
    <a class="brand" href="index.html" aria-label="Central Rénovation, accueil">
      <svg class="brand-mark" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="38" height="38" rx="2" class="bm-frame"/>
        <path d="M10 29V17.5L20 11l10 6.5V29" class="bm-roof"/>
        <path d="M16 29v-7h8v7" class="bm-door"/>
      </svg>
      <span class="brand-name"><span>Central</span><span>Rénovation</span></span>
    </a>
    <nav class="nav" id="nav" aria-label="Navigation principale">
      <a class="nav-home" href="index.html"{" aria-current=\"page\"" if active == "accueil" else ""}>Accueil</a>
{links}
      <a class="btn btn-accent btn-sm nav-cta" href="contact.html">Devis gratuit</a>
    </nav>
    <div class="header-actions">
      <a class="header-phone" href="tel:+33100000000">{PHONE_ICO}<span>{PHONE}</span></a>
      <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Ouvrir le menu">
        <span class="nav-toggle-bars" aria-hidden="true"></span>
      </button>
    </div>
  </div>
</header>
'''


def footer(active):
    cta = '' if active == 'contact' else f'''
<section class="final-cta" aria-labelledby="final-cta-titre">
  <div class="wrap final-cta-row" data-reveal>
    <div>
      <p class="eyebrow eyebrow-light">Un projet de rénovation&nbsp;?</p>
      <h2 id="final-cta-titre">Visite et devis gratuits à Montreuil</h2>
    </div>
    <div class="final-cta-actions">
      <a class="btn btn-accent btn-lg" href="contact.html">Demander un devis {ARROW}</a>
      <a class="btn btn-glass btn-lg" href="tel:+33100000000">{PHONE}</a>
    </div>
  </div>
</section>
'''
    return cta + f'''
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <p class="brand-name brand-name-light"><span>Central</span><span>Rénovation</span></p>
      <p>Rénovation intérieure à Montreuil (93100) et dans l'Est parisien.</p>
    </div>
    <nav class="footer-nav" aria-label="Pied de page">
      <a href="index.html">Accueil</a>
      <a href="prestations.html">Prestations</a>
      <a href="methode.html">Méthode</a>
      <a href="zone.html">Zone d'intervention</a>
      <a href="faq.html">Questions fréquentes</a>
      <a href="contact.html">Contact</a>
    </nav>
    <div class="footer-contact">
      <p>{PHONE}</p>
      <p>{MAIL}</p>
      <p class="footer-muted">Lundi – vendredi, 8&nbsp;h – 18&nbsp;h</p>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>© <span id="year">2026</span> Central Rénovation</p>
    <p>Photos d'illustration : Unsplash</p>
  </div>
</footer>
<!--SITE-END-->
<script src="assets/js/main.js"></script>
</body>
</html>
'''


def page_hero(img, alt, eyebrow, title, lead, crumb):
    return f'''
  <section class="page-hero" aria-labelledby="page-titre">
    <img class="hero-img" src="assets/img/{img}.jpg" alt="{alt}" width="1600" height="900" fetchpriority="high">
    <div class="hero-veil" aria-hidden="true"></div>
    <div class="wrap page-hero-inner">
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="index.html">Accueil</a><span aria-hidden="true">/</span><span aria-current="page">{crumb}</span></nav>
      <p class="eyebrow eyebrow-light">{eyebrow}</p>
      <h1 id="page-titre">{title}</h1>
      <p class="hero-lead">{lead}</p>
    </div>
  </section>
'''


def write(name, title, desc, preload, active, main):
    html = head(title, desc, preload) + "\n" + header(active) + '\n<main id="contenu">\n' + main + "\n</main>\n" + footer(active)
    with open(os.path.join(ROOT, name), "w") as f:
        f.write(html)


def reveal(i=0):
    return f' data-reveal style="--d:{i}"'


# ---------------------------------------------------------------- ACCUEIL
TRADES = ["Plâtrerie", "Électricité", "Plomberie", "Carrelage", "Peinture", "Parquet", "Isolation", "Menuiserie", "Cuisine", "Salle de bain"]
marquee_items = "".join(f"<li>{t}</li>" for t in TRADES)

accueil = f'''
  <section class="hero" aria-labelledby="hero-titre">
    <img class="hero-img" src="assets/img/hero.jpg" alt="Séjour rénové, parquet clair, mur habillé de bois et grandes baies vitrées" width="1920" height="1200" fetchpriority="high">
    <div class="hero-veil" aria-hidden="true"></div>
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <p class="eyebrow eyebrow-light">Rénovation intérieure · Montreuil</p>
        <h1 id="hero-titre">Votre intérieur, rénové de A à Z.</h1>
        <p class="hero-lead">Appartements, maisons et lofts à Montreuil&nbsp;: Central Rénovation pilote tous les corps de métier de votre chantier, avec un seul interlocuteur et un devis détaillé poste par poste.</p>
        <div class="hero-actions">
          <a class="btn btn-accent btn-lg" href="contact.html">Demander un devis gratuit {ARROW}</a>
          <a class="btn btn-glass btn-lg" href="prestations.html">Nos prestations</a>
        </div>
      </div>
      <aside class="hero-card" aria-label="Nos garanties">
        <p class="hero-card-title">Nos garanties</p>
        <ul class="checks">
          <li>Visite et devis gratuits</li>
          <li>Devis détaillé par lot</li>
          <li>Assurance décennale</li>
          <li>Chantier protégé et nettoyé</li>
        </ul>
      </aside>
    </div>
  </section>

  <div class="marquee" aria-hidden="true">
    <ul class="marquee-track">{marquee_items}{marquee_items}</ul>
  </div>

  <section class="section intro" aria-labelledby="intro-titre">
    <div class="wrap intro-grid">
      <div class="collage" aria-hidden="true" data-reveal>
        <img class="collage-a" src="assets/img/plans.jpg" alt="" width="900" height="1100" loading="lazy">
        <img class="collage-b" src="assets/img/peinture.jpg" alt="" width="900" height="700" loading="lazy">
        <div class="collage-tag"><span class="collage-tag-k">Montreuil</span><span class="collage-tag-v">93100</span></div>
      </div>
      <div class="intro-copy">
        <p class="eyebrow"{reveal(0)}>Notre approche</p>
        <h2 id="intro-titre"{reveal(1)}>Un seul interlocuteur, du premier plan à la dernière couche</h2>
        <p class="lead"{reveal(2)}>Une rénovation réussie, c'est d'abord une bonne coordination. Nous organisons l'ordre des travaux, les commandes et les artisans pour que votre chantier avance sans temps mort.</p>
        <ul class="feature-list">
          <li{reveal(3)}>
            <span class="feature-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg></span>
            <div><h3>Tous corps d'état</h3><p>Démolition, plâtrerie, plomberie, électricité, sols et peinture.</p></div>
          </li>
          <li{reveal(4)}>
            <span class="feature-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h3v16H5V5h3zM9 12l2 2 4-4"/></svg></span>
            <div><h3>Devis lisible</h3><p>Chaque lot chiffré séparément, quantités en m² et références de matériaux.</p></div>
          </li>
          <li{reveal(5)}>
            <span class="feature-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 9h16M9 13h6"/></svg></span>
            <div><h3>Planning tenu</h3><p>Dates d'intervention fixées à l'avance et point régulier avec photos.</p></div>
          </li>
        </ul>
        <a class="link-arrow"{reveal(6)} href="methode.html">Découvrir notre méthode {ARROW}</a>
      </div>
    </div>
  </section>

  <section class="section services-section" aria-labelledby="prestations-titre">
    <div class="wrap">
      <header class="section-head section-head-split" data-reveal>
        <div>
          <p class="eyebrow">Prestations</p>
          <h2 id="prestations-titre">Ce que nous rénovons</h2>
        </div>
        <p class="section-intro">Un chantier complet ou une seule pièce&nbsp;: le même chef de chantier suit vos travaux du début à la fin.</p>
      </header>

      <div class="bento">
        <a class="tile tile-big" href="prestations.html#renovation-complete"{reveal(0)}>
          <img src="assets/img/renovation-complete.jpg" alt="" width="1200" height="1200" loading="lazy">
          <div class="tile-body">
            <span class="tile-tag">Tous corps d'état</span>
            <h3>Rénovation complète</h3>
            <p>Appartement ou maison remis à neuf&nbsp;: redistribution des pièces, réseaux, isolation, finitions.</p>
            <span class="tile-link">En savoir plus {ARROW}</span>
          </div>
        </a>
        <a class="tile tile-sdb" href="prestations.html#salle-de-bain"{reveal(1)}>
          <img src="assets/img/salle-de-bain.jpg" alt="" width="900" height="1100" loading="lazy">
          <div class="tile-body"><span class="tile-tag">Salle d'eau</span><h3>Salle de bain</h3><p>Douche à l'italienne, baignoire, étanchéité, ventilation.</p></div>
        </a>
        <a class="tile tile-cui" href="prestations.html#cuisine"{reveal(2)}>
          <img src="assets/img/cuisine.jpg" alt="" width="900" height="700" loading="lazy">
          <div class="tile-body"><span class="tile-tag">Pose et agencement</span><h3>Cuisine</h3></div>
        </a>
        <a class="tile tile-pei" href="prestations.html#peinture"{reveal(3)}>
          <img src="assets/img/peinture.jpg" alt="" width="900" height="700" loading="lazy">
          <div class="tile-body"><span class="tile-tag">Finitions</span><h3>Peinture</h3></div>
        </a>
        <a class="tile tile-sol" href="prestations.html#sols"{reveal(4)}>
          <img src="assets/img/sols.jpg" alt="" width="900" height="1100" loading="lazy">
          <div class="tile-body"><span class="tile-tag">Revêtements</span><h3>Parquet et sols</h3></div>
        </a>
        <a class="tile tile-ele" href="prestations.html#electricite"{reveal(5)}>
          <img src="assets/img/electricite.jpg" alt="" width="900" height="700" loading="lazy">
          <div class="tile-body"><span class="tile-tag">Réseaux</span><h3>Électricité</h3></div>
        </a>
        <div class="tile tile-more"{reveal(6)}>
          <p class="tile-tag">Et aussi</p>
          <ul class="more-list">
            <li>Plâtrerie, cloisons, faux plafonds</li>
            <li>Isolation intérieure</li>
            <li>Plomberie et chauffage</li>
            <li>Menuiseries intérieures, dressings</li>
          </ul>
          <a class="btn btn-accent" href="prestations.html">Toutes nos prestations</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-dark" aria-labelledby="methode-titre">
    <div class="wrap">
      <header class="section-head section-head-split" data-reveal>
        <div>
          <p class="eyebrow eyebrow-light">Méthode</p>
          <h2 id="methode-titre">Cinq étapes, du rendez-vous à la remise des clés</h2>
        </div>
        <a class="link-arrow link-arrow-light" href="methode.html">Voir la méthode en détail {ARROW}</a>
      </header>
      <ol class="timeline" data-reveal>
        <li{reveal(0)}><span class="t-n">1</span><h3>Visite</h3><p>Écoute du projet, relevé des cotes, état des réseaux et des supports.</p></li>
        <li{reveal(1)}><span class="t-n">2</span><h3>Devis détaillé</h3><p>Chaque lot chiffré, quantités et matériaux précisés.</p></li>
        <li{reveal(2)}><span class="t-n">3</span><h3>Planning</h3><p>Dates de chaque corps de métier, commandes, démarches de copropriété.</p></li>
        <li{reveal(3)}><span class="t-n">4</span><h3>Chantier suivi</h3><p>Protections dès le premier jour, point régulier, nettoyage quotidien.</p></li>
        <li{reveal(4)}><span class="t-n">5</span><h3>Réception</h3><p>Visite de fin de travaux, levée des réserves, remise des garanties.</p></li>
      </ol>
    </div>
  </section>

  <section class="cta-band" aria-labelledby="zone-titre">
    <img class="cta-img" src="assets/img/sejour.jpg" alt="" width="1200" height="800" loading="lazy">
    <div class="cta-veil" aria-hidden="true"></div>
    <div class="wrap cta-grid">
      <div class="cta-copy" data-reveal>
        <p class="eyebrow eyebrow-light">Zone d'intervention</p>
        <h2 id="zone-titre">Montreuil et les communes voisines</h2>
        <p>Tous les quartiers de Montreuil, du Bas-Montreuil aux Ramenas, et l'Est parisien.</p>
        <div class="hero-actions">
          <a class="btn btn-glass btn-lg" href="zone.html">Voir la zone d'intervention</a>
        </div>
      </div>
      <ul class="towns" aria-label="Communes desservies"{reveal(2)}>
        <li class="town-main">Montreuil <span>93100</span></li>
        <li>Bagnolet <span>93170</span></li>
        <li>Romainville <span>93230</span></li>
        <li>Rosny-sous-Bois <span>93110</span></li>
        <li>Noisy-le-Sec <span>93130</span></li>
        <li>Vincennes <span>94300</span></li>
        <li>Fontenay-sous-Bois <span>94120</span></li>
        <li>Paris 12<sup>e</sup> <span>75012</span></li>
        <li>Paris 20<sup>e</sup> <span>75020</span></li>
      </ul>
    </div>
  </section>
'''

write("index.html", "Central Rénovation Montreuil",
      "Central Rénovation : rénovation intérieure à Montreuil et dans l'Est parisien. Rénovation complète, salle de bain, cuisine, peinture, sols, électricité. Visite et devis gratuits.",
      "hero", "accueil", accueil)

# ---------------------------------------------------------------- PRESTATIONS
SERVICES = [
    ("renovation-complete", "renovation-complete", "renovation", "Tous corps d'état", "Rénovation complète",
     "Votre appartement ou votre maison remis à neuf, de la démolition aux finitions. Nous coordonnons chaque artisan et l'ordre des interventions pour éviter les temps morts et les reprises.",
     ["Dépose, démolition et évacuation des gravats", "Redistribution des pièces, cloisons, faux plafonds", "Électricité et plomberie refaites à neuf", "Isolation des murs et des plafonds", "Sols, murs, peinture et menuiseries intérieures"]),
    ("salle-de-bain", "salle-de-bain", "sdb", "Salle d'eau", "Salle de bain",
     "Une salle de bain pensée pour l'usage quotidien et durable dans le temps. L'étanchéité et la ventilation sont traitées avec le même soin que les finitions.",
     ["Douche à l'italienne ou receveur extra-plat", "Étanchéité sous carrelage", "Faïence, carrelage, meuble vasque", "WC suspendu, sèche-serviettes", "Ventilation et extraction"]),
    ("cuisine", "cuisine", "cuisine", "Pose et agencement", "Cuisine",
     "Nous préparons la pièce, posons votre cuisine et réalisons tous les raccordements. Vous pouvez acheter votre cuisine chez le fabricant de votre choix.",
     ["Dépose de l'ancienne cuisine", "Arrivées d'eau et évacuations", "Circuits électriques dédiés (plaque, four, lave-vaisselle)", "Pose des meubles, plan de travail, crédence", "Éclairage sous meubles et plafond"]),
    ("peinture", "peinture", "peinture", "Finitions", "Peinture et revêtements muraux",
     "Une belle peinture dépend surtout de la préparation. Nous rebouchons, enduisons et poncions les supports avant d'appliquer la finition choisie.",
     ["Préparation : rebouchage, enduits, ponçage", "Murs et plafonds, mat, velours ou satin", "Boiseries, portes, radiateurs", "Papier peint, toile de verre", "Protection des sols et des meubles"]),
    ("sols", "sols", "sols", "Revêtements", "Parquet et sols",
     "Parquet neuf, rénovation d'un parquet ancien ou carrelage&nbsp;: nous préparons le support pour un sol plan et durable.",
     ["Ragréage et préparation du support", "Parquet massif, contrecollé ou stratifié", "Ponçage et vitrification de parquet ancien", "Carrelage, grands formats", "Sols souples, plinthes et barres de seuil"]),
    ("electricite", "electricite", "electricite", "Réseaux", "Électricité",
     "Une installation ancienne peut être dangereuse. Nous la remettons aux normes et l'adaptons à vos usages actuels.",
     ["Diagnostic de l'installation existante", "Tableau électrique et protections", "Mise en conformité NF C 15-100", "Prises, interrupteurs, éclairage", "Circuits spécialisés et VMC"]),
]

rows = []
for i, (anchor, img, typ, tag, title, text, items) in enumerate(SERVICES):
    lis = "".join(f"<li>{x}</li>" for x in items)
    rows.append(f'''
      <article class="service-row{" service-row-flip" if i % 2 else ""}" id="{anchor}">
        <div class="service-media" data-reveal>
          <img src="assets/img/{img}.jpg" alt="" width="900" height="900" loading="lazy">
          <span class="service-index">0{i + 1}</span>
        </div>
        <div class="service-copy">
          <p class="eyebrow"{reveal(0)}>{tag}</p>
          <h2{reveal(1)}>{title}</h2>
          <p class="lead"{reveal(2)}>{text}</p>
          <ul class="ticks"{reveal(3)}>{lis}</ul>
          <a class="btn btn-accent"{reveal(4)} href="contact.html?type={typ}">Demander un devis {ARROW}</a>
        </div>
      </article>''')

chips = "".join(f'<a href="#{a}">{t}</a>' for a, _, _, _, t, _, _ in SERVICES)

EXTRAS = [
    ("M4 4h16v16H4zM4 12h16M12 4v16", "Plâtrerie", "Cloisons, doublages, faux plafonds, reprise d'enduits sur murs anciens."),
    ("M3 10l9-6 9 6M5 9v11h14V9M9 20v-6h6v6", "Isolation intérieure", "Doublages isolants des murs et isolation des combles aménagés."),
    ("M7 3v6a5 5 0 0 0 10 0V3M12 14v7M8 21h8", "Plomberie et chauffage", "Remplacement de canalisations, radiateurs, chauffe-eau."),
    ("M5 3h14v18H5zM12 3v18M9 12h1M14 12h1", "Menuiseries intérieures", "Portes, placards, dressings sur mesure, habillages."),
]
extras = "".join(f'''
        <article class="extra"{reveal(i)}>
          <span class="feature-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="{p}"/></svg></span>
          <h3>{t}</h3>
          <p>{d}</p>
        </article>''' for i, (p, t, d) in enumerate(EXTRAS))

prestations = page_hero("douche", "Salle de bain rénovée avec douche vitrée et double vasque", "Prestations",
                        "Nos prestations de rénovation",
                        "Un chantier complet ou une seule pièce. Chaque prestation est chiffrée poste par poste et suivie par le même chef de chantier.",
                        "Prestations") + f'''
  <nav class="chips-bar" aria-label="Prestations">
    <div class="wrap chips">{chips}</div>
  </nav>

  <section class="section services-list" aria-label="Détail des prestations">
    <div class="wrap">{"".join(rows)}
    </div>
  </section>

  <section class="section section-stone" aria-labelledby="extras-titre">
    <div class="wrap">
      <header class="section-head" data-reveal>
        <p class="eyebrow">Et aussi</p>
        <h2 id="extras-titre">Les autres corps de métier</h2>
      </header>
      <div class="extras">{extras}
      </div>
    </div>
  </section>
'''
write("prestations.html", "Prestations · Central Rénovation",
      "Rénovation complète, salle de bain, cuisine, peinture, parquet et sols, électricité à Montreuil. Découvrez le détail des prestations de Central Rénovation.",
      "douche", "prestations", prestations)

# ---------------------------------------------------------------- MÉTHODE
STEPS = [
    ("Visite sur place", "Nous venons chez vous pour comprendre le projet, relever les cotes et vérifier l'état des réseaux, des murs et des sols.", "Un échange sur vos priorités et votre budget"),
    ("Devis détaillé", "Chaque lot est chiffré séparément, avec les quantités en m² ou en unités et les références de matériaux. Vous savez exactement ce que vous payez.", "Un devis écrit, poste par poste"),
    ("Planning", "Nous fixons les dates de chaque corps de métier, passons les commandes et vous aidons pour les démarches de copropriété.", "Un calendrier des interventions"),
    ("Chantier suivi", "Les protections sont posées dès le premier jour. Le chantier est nettoyé chaque soir et vous recevez un point régulier avec photos.", "Un interlocuteur joignable pendant tout le chantier"),
    ("Réception", "Nous faisons ensemble la visite de fin de travaux. Les éventuelles réserves sont levées, puis nous vous remettons notices et garanties.", "Un procès-verbal de réception"),
]
steps = "".join(f'''
        <li class="step"{reveal(0)}>
          <span class="t-n">{i + 1}</span>
          <div class="step-body">
            <h3>{t}</h3>
            <p>{d}</p>
            <p class="step-out"><span>Vous recevez</span>{o}</p>
          </div>
        </li>''' for i, (t, d, o) in enumerate(STEPS))

ENG = [
    ("Un seul interlocuteur", "Le même chef de chantier, du premier rendez-vous à la réception."),
    ("Devis lisible", "Chaque lot chiffré, fournitures comprises, sans ligne floue."),
    ("Chantier propre", "Protection des sols et des parties communes, nettoyage quotidien."),
    ("Assurance décennale", "Attestation fournie avec le devis."),
]
eng = "".join(f'<article class="eng"{reveal(i)}><h3>{t}</h3><p>{d}</p></article>' for i, (t, d) in enumerate(ENG))

BATI = [
    ("1880 – 1930", "Pavillon en meulière", "Murs épais et poreux&nbsp;: enduits à la chaux et ventilation efficace contre l'humidité."),
    ("1900 – 1940", "Immeuble faubourien", "Planchers bois et murs en plâtre. Constat de risque d'exposition au plomb requis avant 1949."),
    ("Ateliers", "Loft du Bas-Montreuil", "Grands volumes à isoler et chauffer, verrières, acoustique, électricité à reprendre."),
    ("1950 – 1997", "Appartement d'après-guerre", "Réseaux vieillissants, menuiseries peu isolantes. Repérage amiante avant démolition."),
]
bati = "".join(f'''
        <article class="bati-item"{reveal(i)}>
          <p class="bati-era">{e}</p>
          <h3>{t}</h3>
          <p>{d}</p>
        </article>''' for i, (e, t, d) in enumerate(BATI))

methode = page_hero("plans", "Plans de rénovation dessinés à la main sur une table de travail", "Méthode",
                    "Notre méthode de chantier",
                    "Cinq étapes claires, pour que vous sachiez à tout moment où en est votre rénovation et ce qui vient ensuite.",
                    "Méthode") + f'''
  <section class="section" aria-labelledby="etapes-titre">
    <div class="wrap method-grid">
      <header class="section-head method-head" data-reveal>
        <p class="eyebrow">Les étapes</p>
        <h2 id="etapes-titre">Du rendez-vous à la remise des clés</h2>
        <p class="section-intro">Chaque étape se termine par un document concret. Rien ne démarre sans votre accord écrit.</p>
        <a class="btn btn-accent" href="contact.html">Prendre rendez-vous {ARROW}</a>
      </header>
      <ol class="steps" data-reveal>{steps}
      </ol>
    </div>
  </section>

  <section class="section section-dark" aria-labelledby="eng-titre">
    <div class="wrap">
      <header class="section-head" data-reveal>
        <p class="eyebrow eyebrow-light">Engagements</p>
        <h2 id="eng-titre">Ce que vous pouvez attendre de nous</h2>
      </header>
      <div class="engagements">{eng}</div>
    </div>
  </section>

  <section class="section" aria-labelledby="bati-titre">
    <div class="wrap">
      <header class="section-head section-head-split" data-reveal>
        <div>
          <p class="eyebrow">Bâti montreuillois</p>
          <h2 id="bati-titre">Nous connaissons les logements de Montreuil</h2>
        </div>
        <p class="section-intro">Pavillons en meulière, immeubles anciens, ateliers reconvertis&nbsp;: chaque bâti a ses points de vigilance.</p>
      </header>
      <div class="bati">{bati}
      </div>
    </div>
  </section>
'''
write("methode.html", "Méthode · Central Rénovation",
      "Visite, devis détaillé, planning, chantier suivi, réception : la méthode de Central Rénovation pour vos travaux à Montreuil.",
      "plans", "methode", methode)

# ---------------------------------------------------------------- ZONE
QUARTIERS = ["Bas-Montreuil – République", "Bas-Montreuil – Bobillot", "Villiers-Barbusse", "Étienne-Marcel – Chanzy",
             "Centre-ville", "Jean-Moulin – Beaumonts", "Solidarité – Carnot", "La Noue – Clos-Français",
             "Branly – Boissière", "Montreau – Le Morillon", "Ruffins – Théophile-Sueur", "Ramenas – Léo-Lagrange",
             "Bel-Air – Grands-Pêchers", "Signac – Murs-à-Pêches"]
quart = "".join(f"<li{reveal(i % 7)}>{q}</li>" for i, q in enumerate(QUARTIERS))

# Schéma (pas à l'échelle) : position approximative des communes autour de Montreuil
NEIGH = [
    ("Paris 20e", "75020", 70, 175, "end"),
    ("Bagnolet", "93170", 120, 70, "end"),
    ("Romainville", "93230", 300, 40, "middle"),
    ("Noisy-le-Sec", "93130", 470, 80, "start"),
    ("Rosny-sous-Bois", "93110", 520, 200, "start"),
    ("Fontenay-sous-Bois", "94120", 450, 330, "start"),
    ("Vincennes", "94300", 250, 350, "middle"),
    ("Paris 12e", "75012", 90, 300, "end"),
]
nodes = []
for i, (n, cp, x, y, anchor) in enumerate(NEIGH):
    dx = {"end": -14, "start": 14, "middle": 0}[anchor]
    dy = -32 if anchor == "middle" and y < 200 else (30 if anchor == "middle" else 0)
    nodes.append(f'''
          <g class="map-node" style="--d:{i}">
            <line x1="300" y1="200" x2="{x}" y2="{y}" class="map-link"/>
            <circle cx="{x}" cy="{y}" r="7" class="map-dot"/>
            <text x="{x + dx}" y="{y + dy}" text-anchor="{anchor}" class="map-label">{n}</text>
            <text x="{x + dx}" y="{y + dy + 17}" text-anchor="{anchor}" class="map-cp">{cp}</text>
          </g>''')
zone_map = f'''
        <figure class="zone-map" data-reveal>
          <svg viewBox="-50 -10 750 410" role="img" aria-labelledby="map-title">
            <title id="map-title">Schéma des communes desservies autour de Montreuil</title>
            <circle cx="300" cy="200" r="150" class="map-ring"/>
            <circle cx="300" cy="200" r="90" class="map-ring map-ring-2"/>{"".join(nodes)}
            <circle cx="300" cy="200" r="46" class="map-pulse"/>
            <circle cx="300" cy="200" r="46" class="map-center"/>
            <text x="300" y="196" text-anchor="middle" class="map-center-label">Montreuil</text>
            <text x="300" y="216" text-anchor="middle" class="map-center-cp">93100</text>
          </svg>
          <figcaption>Schéma indicatif, pas à l'échelle.</figcaption>
        </figure>'''

zone = page_hero("sejour", "Salon lumineux avec canapé gris et grandes fenêtres", "Zone d'intervention",
                 "Montreuil et l'Est parisien",
                 "Nous intervenons dans tous les quartiers de Montreuil et dans les communes limitrophes.",
                 "Zone") + f'''
  <section class="section" aria-labelledby="communes-titre">
    <div class="wrap zone-page-grid">
      <div class="zone-copy">
        <header class="section-head" data-reveal>
          <p class="eyebrow">Communes desservies</p>
          <h2 id="communes-titre">Au plus près de vos chantiers</h2>
          <p class="section-intro">Être proches de vous, c'est pouvoir passer sur le chantier chaque jour et réagir vite en cas d'imprévu.</p>
        </header>
        <a class="btn btn-accent" href="contact.html" data-reveal>Vérifier ma commune {ARROW}</a>
      </div>{zone_map}
    </div>
  </section>

  <section class="section section-stone" aria-labelledby="quartiers-titre">
    <div class="wrap">
      <header class="section-head section-head-split" data-reveal>
        <div>
          <p class="eyebrow">Montreuil</p>
          <h2 id="quartiers-titre">Les 14 quartiers de Montreuil</h2>
        </div>
        <p class="section-intro">Du Bas-Montreuil aux hauteurs de Montreau, nous connaissons les rues, les immeubles et les contraintes d'accès.</p>
      </header>
      <ul class="quartiers">{quart}</ul>
    </div>
  </section>
'''
write("zone.html", "Zone d'intervention · Central Rénovation",
      "Central Rénovation intervient dans les 14 quartiers de Montreuil et à Bagnolet, Romainville, Noisy-le-Sec, Rosny-sous-Bois, Fontenay-sous-Bois, Vincennes, Paris 12e et 20e.",
      "sejour", "zone", zone)

# ---------------------------------------------------------------- FAQ
FAQ = [
    ("Devis et prix", [
        ("Le devis est-il payant&nbsp;?", "Non. La visite et le devis sont gratuits et sans engagement. Le devis détaille chaque poste pour que vous puissiez comparer."),
        ("Comment se passe le paiement&nbsp;?", "Le calendrier de paiement figure sur le devis&nbsp;: en général un acompte à la commande, puis des règlements selon l'avancement du chantier."),
        ("Quel taux de TVA s'applique&nbsp;?", "Pour un logement achevé depuis plus de deux ans, les travaux de rénovation peuvent bénéficier d'une TVA à taux réduit, sous conditions. Le taux applicable est indiqué sur le devis."),
    ]),
    ("Pendant les travaux", [
        ("Peut-on habiter le logement pendant les travaux&nbsp;?", "C'est souvent possible pour des travaux pièce par pièce. Pour une rénovation complète, nous organisons le planning avec vous pour limiter la gêne."),
        ("Combien de temps dure un chantier&nbsp;?", "Cela dépend de l'ampleur des travaux. La durée précise est fixée dans le planning, avant le démarrage."),
        ("Qui s'occupe des gravats&nbsp;?", "Nous. Les gravats et déchets de chantier sont évacués, et le chantier est nettoyé chaque soir."),
    ]),
    ("Démarches et garanties", [
        ("Faut-il l'accord de la copropriété&nbsp;?", "Oui dès que les travaux touchent les parties communes ou l'aspect extérieur (fenêtres, murs porteurs, colonnes). Nous vous aidons à préparer le dossier pour l'assemblée générale."),
        ("Faut-il une autorisation de la mairie&nbsp;?", "Les travaux intérieurs n'en demandent généralement pas. Une déclaration préalable est nécessaire si vous modifiez l'aspect extérieur, par exemple les fenêtres."),
        ("Pouvez-vous m'aider pour les aides à la rénovation&nbsp;?", "Nous vous indiquons les travaux concernés et vous orientons vers France Rénov' pour vérifier votre éligibilité aux aides comme MaPrimeRénov'."),
        ("Êtes-vous assurés&nbsp;?", "Oui. L'attestation d'assurance décennale est jointe au devis."),
    ]),
]
faq_groups = []
for gi, (cat, qs) in enumerate(FAQ):
    items = "".join(f'''
          <details{reveal(i)}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>''' for i, (q, a) in enumerate(qs))
    faq_groups.append(f'''
      <div class="faq-group">
        <h2 class="faq-cat" data-reveal>{cat}</h2>
        <div class="faq">{items}
        </div>
      </div>''')

faq = page_hero("faq", "Chambre rénovée aux murs blancs et parquet gris", "Questions fréquentes",
                "Vos questions, nos réponses",
                "Devis, déroulement du chantier, démarches&nbsp;: l'essentiel avant de lancer vos travaux.",
                "FAQ") + f'''
  <section class="section" aria-label="Questions et réponses">
    <div class="wrap faq-page">{"".join(faq_groups)}
      <aside class="faq-aside" data-reveal>
        <p class="faq-aside-title">Une autre question&nbsp;?</p>
        <p>Appelez-nous ou décrivez votre projet&nbsp;: nous vous répondons rapidement.</p>
        <a class="btn btn-accent btn-block" href="contact.html">Nous écrire</a>
        <p class="faq-aside-phone">{PHONE}</p>
      </aside>
    </div>
  </section>
'''
write("faq.html", "Questions fréquentes · Central Rénovation",
      "Devis, paiement, TVA, durée du chantier, copropriété, aides : les réponses de Central Rénovation à vos questions sur la rénovation à Montreuil.",
      "faq", "faq", faq)

# ---------------------------------------------------------------- CONTACT
contact = page_hero("contact", "Salon lumineux avec fauteuil noir et plantes", "Contact",
                    "Demandez votre devis gratuit",
                    "Décrivez vos travaux en quelques lignes. Nous vous rappelons pour fixer une visite sur place.",
                    "Contact") + f'''
  <section class="section section-stone contact-section" aria-label="Formulaire et coordonnées">
    <div class="wrap contact-grid">
      <form class="quote" id="quote-form" novalidate data-reveal>
        <p class="quote-title">Votre projet</p>
        <div class="field-row">
          <div class="field">
            <label for="f-nom">Nom</label>
            <input id="f-nom" name="nom" type="text" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="f-tel">Téléphone</label>
            <input id="f-tel" name="telephone" type="tel" autocomplete="tel" inputmode="tel" required>
          </div>
        </div>
        <div class="field">
          <label for="f-mail">E-mail <span class="opt">(facultatif)</span></label>
          <input id="f-mail" name="email" type="email" autocomplete="email">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="f-type">Type de travaux</label>
            <select id="f-type" name="type">
              <option value="renovation">Rénovation complète</option>
              <option value="sdb">Salle de bain</option>
              <option value="cuisine">Cuisine</option>
              <option value="peinture">Peinture</option>
              <option value="sols">Parquet et sols</option>
              <option value="electricite">Électricité</option>
              <option value="platrerie">Plâtrerie et isolation</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div class="field">
            <label for="f-surface">Surface <span class="opt">(m², environ)</span></label>
            <input id="f-surface" name="surface" type="number" min="1" inputmode="numeric">
          </div>
        </div>
        <div class="field">
          <label for="f-ville">Commune</label>
          <input id="f-ville" name="ville" type="text" value="Montreuil" autocomplete="address-level2">
        </div>
        <div class="field">
          <label for="f-msg">Votre projet</label>
          <textarea id="f-msg" name="message" rows="5" placeholder="Ex. : refaire la salle de bain d'un 3 pièces, remplacer la baignoire par une douche."></textarea>
        </div>
        <button class="btn btn-accent btn-lg btn-block" type="submit">Envoyer ma demande {ARROW}</button>
        <p class="form-status" id="form-status" role="status" aria-live="polite"></p>
      </form>

      <div class="contact-side">
        <div class="contact-card" data-reveal style="--d:1">
          <p class="contact-card-title">Coordonnées</p>
          <ul class="coords">
            <li>
              <span class="coord-ico" aria-hidden="true">{PHONE_ICO.replace(' width="18" height="18"', '')}</span>
              <div><p class="coord-k">Téléphone</p><p class="coord-v">{PHONE}</p></div>
            </li>
            <li>
              <span class="coord-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zM3 6l9 7 9-7"/></svg></span>
              <div><p class="coord-k">E-mail</p><p class="coord-v">{MAIL}</p></div>
            </li>
            <li>
              <span class="coord-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg></span>
              <div><p class="coord-k">Adresse</p><p class="coord-v">Montreuil (93100)</p></div>
            </li>
            <li>
              <span class="coord-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/></svg></span>
              <div><p class="coord-k">Horaires</p><p class="coord-v">Lundi – vendredi, 8&nbsp;h – 18&nbsp;h</p></div>
            </li>
          </ul>
        </div>
        <div class="next-steps" data-reveal style="--d:2">
          <p class="contact-card-title">Et ensuite&nbsp;?</p>
          <ol>
            <li><span>1</span>Nous vous rappelons pour parler du projet.</li>
            <li><span>2</span>Nous fixons une visite sur place, gratuite.</li>
            <li><span>3</span>Vous recevez un devis détaillé poste par poste.</li>
          </ol>
        </div>
      </div>
    </div>
  </section>
'''
write("contact.html", "Contact · Central Rénovation",
      "Demandez un devis gratuit à Central Rénovation, entreprise de rénovation intérieure à Montreuil. Visite sur place et devis détaillé.",
      "contact", "contact", contact)

print("pages générées")
