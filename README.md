# 11126 — Atelier de conception PCB assistée par Claude

Ce dépôt installe automatiquement, à chaque session cloud Claude Code, une
chaîne d'outils open source pour concevoir et vérifier des circuits imprimés.

## Outils installés

| Outil | Rôle | Commande |
|---|---|---|
| KiCad 9 (PPA officiel) | Schéma, PCB, ERC/DRC, exports fabrication | `kicad-cli`, module Python `pcbnew` |
| Serveur MCP KiCad ([mixelpixx/KiCAD-MCP-Server](https://github.com/mixelpixx/KiCAD-MCP-Server) v2.8.2) | 244 outils MCP pour piloter KiCad | déclaré dans `.mcp.json` |
| atopile 0.15.8 | PCB décrit en code (langage `.ato`) | `ato` |
| tscircuit | PCB en TypeScript/JSX, export KiCad | `tsci` |
| SKiDL | Netlists en Python | `import skidl` |
| ngspice + InSpice | Simulation SPICE (CLI et Python) | `ngspice`, `import InSpice` |
| Freerouting 2.1 | Autoroutage (DSN → SES) | `freerouting` |
| KiBot / KiKit | Sorties fabrication automatisées, panélisation | `kibot`, `kikit` |
| easyeda2kicad, InteractiveHtmlBom, kicad-skip | Import de pièces LCSC, BOM interactive, édition de schémas | — |

Les outils Python sont dans le venv `/opt/pcb-venv` (il voit `pcbnew`).

## Scripts

- `scripts/setup-pcb-tools.sh` : installation (idempotente, root requis).
- `scripts/verify-pcb-tools.sh` : test de bout en bout (simulation, export
  tscircuit, autoroutage Freerouting + DRC, démarrage du serveur MCP).
- `.claude/hooks/session-start.sh` : lance l'installation au démarrage d'une
  session cloud.

## Limites

- Pas d'interface graphique : tout passe par la CLI, l'API Python et le MCP.
- Pas de simulation électromagnétique (openEMS n'est pas packagé pour Ubuntu 24.04).
- atopile 0.16+ est devenu une application web ; 0.15.8 est la dernière CLI.
