# Conception PCB : méthode de travail

Outils : voir README.md. Lancer `scripts/verify-pcb-tools.sh` si un doute existe
sur l'installation. Python des outils : `/opt/pcb-venv/bin/python`.

## Démarche pour une carte
1. **Spécifier** : alimentation, courants, interfaces, contraintes mécaniques,
   fabricant visé (ex. JLCPCB : règles de piste/isolement, nombre de couches).
2. **Choisir les composants** réels (référence fabricant + LCSC si JLCPCB),
   vérifier dans la datasheet le brochage et le circuit d'application.
3. **Simuler** les parties analogiques et l'alimentation avec ngspice/InSpice
   avant de router.
4. **Saisir le schéma** en code (atopile, tscircuit ou SKiDL) ou via le MCP KiCad.
   Lancer l'ERC : `kicad-cli sch erc --exit-code-violations projet.kicad_sch`.
5. **Placer et router** : placement manuel des pièces critiques (découplage au
   plus près, boucles de courant courtes, plan de masse continu), puis
   Freerouting pour le reste (`pcbnew.ExportSpecctraDSN` → `freerouting -de … -do …`
   → `pcbnew.ImportSpecctraSES`).
6. **Vérifier** : `kicad-cli pcb drc --exit-code-violations projet.kicad_pcb`,
   zéro connexion manquante, zéro erreur.
7. **Fabriquer** : KiBot ou `kicad-cli pcb export gerbers/drill/pos`, BOM.

Ne jamais déclarer une carte terminée sans ERC et DRC propres ; signaler
explicitement ce qui n'a pas été vérifié (intégrité du signal, thermique, CEM).
