"""Fabrique l'icône de l'application (icone.icns) à partir d'une capture du jeu.
Usage : python3 tools/make_icon.py capture.png "Battle Royale.app/Contents/Resources/icone.icns"
"""
import io, struct, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, out = sys.argv[1], sys.argv[2]
S = 1024
im = Image.open(src).convert('RGB')
w, h = im.size
side = min(w, h)
cx = int(w * float(sys.argv[3])) if len(sys.argv) > 3 else w // 2
left = max(0, min(w - side, cx - side // 2))
im = im.crop((left, (h - side) // 2, left + side, (h - side) // 2 + side)).resize((824, 824), Image.LANCZOS)

# carré aux coins arrondis (gabarit des icônes macOS : 824 px dans 1024 px), ombre douce
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
mask = Image.new('L', (824, 824), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 823, 823), radius=185, fill=255)
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((100, 112, 923, 935), radius=185, fill=(0, 0, 0, 110))
icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
tile = im.convert('RGBA')
# dégradé sombre en bas pour le titre
grad = Image.new('L', (1, 824))
for y in range(824):
    grad.putpixel((0, y), int(max(0, (y - 430) / 394) ** 1.4 * 215))
dark = Image.new('RGBA', (824, 824), (6, 12, 18, 255))
tile = Image.composite(dark, tile, grad.resize((824, 824)))
d = ImageDraw.Draw(tile)
font = ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf', 132)
small = ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf', 74)
for txt, f, y, col in (('BATTLE', font, 545, (255, 255, 255)), ('ROYALE', small, 680, (255, 207, 71))):
    tw = d.textlength(txt, font=f)
    d.text(((824 - tw) / 2, y), txt, font=f, fill=col)
icon.paste(tile, (100, 100), mask)

entries = b''
for kind, size in ((b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024)):
    buf = io.BytesIO()
    icon.resize((size, size), Image.LANCZOS).save(buf, 'PNG')
    data = buf.getvalue()
    entries += kind + struct.pack('>I', len(data) + 8) + data
open(out, 'wb').write(b'icns' + struct.pack('>I', len(entries) + 8) + entries)
icon.resize((512, 512), Image.LANCZOS).save(out.replace('.icns', '.png'))
print('icône écrite :', out)
