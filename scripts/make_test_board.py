"""Crée une carte de test non routée (2 résistances, 1 net) et l'exporte en DSN."""
import sys

import pcbnew

board_path, dsn_path = sys.argv[1], sys.argv[2]
board = pcbnew.BOARD()
lib = "/usr/share/kicad/footprints/Resistor_SMD.pretty"
net = pcbnew.NETINFO_ITEM(board, "SIG")
board.Add(net)
for i, x in enumerate((0, 10)):
    fp = pcbnew.FootprintLoad(lib, "R_0805_2012Metric")
    fp.SetReference(f"R{i + 1}")
    fp.SetPosition(pcbnew.VECTOR2I_MM(100 + x, 100))
    board.Add(fp)
    fp.FindPadByNumber("2" if i == 0 else "1").SetNet(net)
outline = pcbnew.PCB_SHAPE(board)
outline.SetShape(pcbnew.SHAPE_T_RECT)
outline.SetLayer(pcbnew.Edge_Cuts)
outline.SetStart(pcbnew.VECTOR2I_MM(95, 95))
outline.SetEnd(pcbnew.VECTOR2I_MM(115, 105))
board.Add(outline)
pcbnew.SaveBoard(board_path, board)
pcbnew.ExportSpecctraDSN(pcbnew.LoadBoard(board_path), dsn_path)
