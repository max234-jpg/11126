---
name: site-design-premium
description: Règles de design pour des sites vitrines haut de gamme de commerces locaux (typographie, mouvement, rythme, honnêteté du contenu).
---

# Sites vitrines premium pour commerces locaux

## Direction artistique
- Une idée forte par site. La typographie porte l'identité : un titre display très grand (clamp 3.5rem → 11rem), interlignage serré (0.9), approche éditoriale.
- Deux polices maximum (Google Fonts). Associer un display à caractère (Fraunces, Syne, Instrument Serif, Space Grotesk, Bricolage Grotesque) et un texte neutre (Inter, Manrope, DM Sans).
- Palette restreinte : un fond, une encre, UN accent. Contraste AA minimum.
- Grain léger en overlay (SVG feTurbulence), jamais d'images stock.
- Grille généreuse, beaucoup d'air, sections bien rythmées (alternance pleine page / grille / bandeau défilant).

## Mouvement (GSAP + ScrollTrigger + Lenis + SplitType)
- Scroll fluide Lenis branché sur le ticker GSAP.
- Titre du hero découpé en lignes/mots (SplitType), apparition en cascade (yPercent 110 → 0, stagger 0.06, ease expo.out).
- Révélations au scroll discrètes (y 40 → 0, opacité), parallaxe légère sur les formes décoratives.
- Un bandeau marquee infini avec les prestations.
- Respecter `prefers-reduced-motion` : tout désactiver.

## Contenu — honnêteté absolue
- N'utiliser QUE les informations fournies (nom, adresse, téléphone, horaires, prestations).
- Jamais d'avis clients, de notes, de chiffres, d'années d'expérience, de récompenses ou de photos inventés.
- Si une info manque, ne pas la remplacer : l'omettre ou inviter à appeler.

## Structure type
1. Nav minimale (nom + bouton appeler)
2. Hero typographique plein écran
3. Marquee prestations
4. Prestations numérotées (01, 02…)
5. L'esprit de la maison (texte court)
6. Horaires & accès (carte OpenStreetMap intégrée si coordonnées)
7. Contact XXL (téléphone cliquable) + footer sobre
