#!/bin/bash
# Vérifie de bout en bout la chaîne d'outils PCB installée par setup-pcb-tools.sh.
set -uo pipefail

PY=/opt/pcb-venv/bin/python
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail=0
check() {  # check "nom" commande...
  local name=$1; shift
  if out=$("$@" 2>&1); then echo "✅ $name ${out:+— $(echo "$out" | tail -1)}"
  else echo "‼️  $name"; echo "$out" | tail -5 | sed 's/^/    /'; fail=1; fi
}

check "KiCad CLI"  kicad-cli version
check "pcbnew (Python)" "$PY" -c "import pcbnew; print(pcbnew.Version())"
check "ngspice : diviseur 5V → 2,5V" bash -c "
  printf 'div\nV1 vin 0 5\nR1 vin vout 10k\nR2 vout 0 10k\n.op\n.end\n' > $WORK/div.cir
  ngspice -b $WORK/div.cir 2>&1 | grep -E 'vout +2\.5'"
check "InSpice (Python ↔ ngspice)" "$PY" -c "
from InSpice.Spice.Netlist import Circuit
from InSpice.Spice.Simulator import Simulator
from InSpice.Unit import u_V, u_kOhm
c = Circuit('div'); c.V('src', 'vin', c.gnd, 5@u_V)
c.R(1, 'vin', 'vout', 10@u_kOhm); c.R(2, 'vout', c.gnd, 10@u_kOhm)
v = float(Simulator.factory().simulation(c).operating_point()['vout'][0])
assert abs(v - 2.5) < 1e-6, v; print(f'Vout = {v} V')"
check "SKiDL / KiBot / KiKit / easyeda2kicad" "$PY" -c "
import skidl, kibot, kikit, easyeda2kicad, skip; print('imports OK')"
check "atopile" ato --version
check "tscircuit → KiCad" bash -c "
  cd $WORK && cat > board.circuit.tsx <<'TSX'
export default () => (
  <board width=\"20mm\" height=\"15mm\">
    <resistor name=\"R1\" resistance=\"10k\" footprint=\"0402\" pcbX={-3} />
    <capacitor name=\"C1\" capacitance=\"100nF\" footprint=\"0402\" pcbX={3} />
    <trace from=\".R1 > .pin2\" to=\".C1 > .pin1\" />
  </board>
)
TSX
  tsci export board.circuit.tsx -f kicad_pcb >/dev/null && test -s board.circuit.kicad_pcb && echo 'board.circuit.kicad_pcb généré'"
check "Freerouting + DRC (0 connexion manquante)" bash -c "
  cd $WORK && $PY $HERE/make_test_board.py t.kicad_pcb t.dsn &&
  freerouting -de t.dsn -do t.ses -mp 5 >/dev/null 2>&1 &&
  $PY -c \"import pcbnew; b=pcbnew.LoadBoard('t.kicad_pcb'); assert pcbnew.ImportSpecctraSES(b,'t.ses'); pcbnew.SaveBoard('t.kicad_pcb',b)\" &&
  kicad-cli pcb drc -o d.rpt t.kicad_pcb | grep 'Found 0 unconnected'"
check "Serveur MCP KiCad" bash -c "
  (printf '%s\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"verify\",\"version\":\"1\"}}}' \
    '{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}' '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}'; sleep 10) |
  KICAD_PYTHON=$PY timeout 20 node /opt/mcp/KiCAD-MCP-Server/dist/index.js 2>/dev/null |
  python3 -c \"import sys,json
for l in sys.stdin:
    try: m=json.loads(l)
    except ValueError: continue
    if m.get('id')==2: print(len(m['result']['tools']),'outils'); sys.exit(0)
sys.exit(1)\""

exit $fail
