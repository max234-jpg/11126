"""Compose an email-ready device mockup (browser window + phone) from demo screenshots.
Usage: python3 tools/mockup.py <shots_prefix> <out.jpg> <hex_color_top> <hex_color_bottom>"""
import sys
from PIL import Image, ImageDraw, ImageFilter

prefix, out, c1, c2 = sys.argv[1:5]
W, H = 1200, 760
hexrgb = lambda h: tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
a, b = hexrgb(c1), hexrgb(c2)
bg = Image.new('RGB', (W, H))
d = ImageDraw.Draw(bg)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))

def rounded(im, r):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    im.putalpha(m)
    return im

def shadow(canvas, box, r, blur=28, off=18, alpha=110):
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(sh).rounded_rectangle([x0, y0 + off, x1, y1 + off], r, fill=(0, 0, 0, alpha))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))

canvas = bg.convert('RGBA')
# Browser window
bw, bh = 940, 600
bx, by = 60, 80
shadow(canvas, (bx, by, bx + bw, by + bh), 18)
win = Image.new('RGBA', (bw, bh), (255, 255, 255, 255))
wd = ImageDraw.Draw(win)
wd.rectangle([0, 0, bw, 38], fill=(238, 240, 244, 255))
for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
    wd.ellipse([16 + i * 22, 13, 28 + i * 22, 25], fill=col + (255,))
wd.rounded_rectangle([110, 9, bw - 110, 29], 10, fill=(255, 255, 255, 255))
shot = Image.open(f'{prefix}-desktop.png').convert('RGBA')
shot = shot.resize((bw, int(shot.height * bw / shot.width)), Image.LANCZOS).crop((0, 0, bw, bh - 38))
win.paste(shot, (0, 38))
canvas.alpha_composite(rounded(win, 16), (bx, by))
# Phone
pw, ph = 270, 560
px, py = W - pw - 70, H - ph - 50
shadow(canvas, (px, py, px + pw, py + ph), 42, alpha=140)
phone = Image.new('RGBA', (pw, ph), (17, 17, 20, 255))
m = Image.open(f'{prefix}-mobile.png').convert('RGBA')
iw = pw - 20
m = m.resize((iw, int(m.height * iw / m.width)), Image.LANCZOS).crop((0, 0, iw, ph - 20))
phone.paste(rounded(m, 32), (10, 10), rounded(m.copy(), 32))
ImageDraw.Draw(phone).rounded_rectangle([pw // 2 - 45, 18, pw // 2 + 45, 40], 11, fill=(17, 17, 20, 255))
canvas.alpha_composite(rounded(phone, 42), (px, py))
canvas.convert('RGB').save(out, quality=84, optimize=True, progressive=True)
print('saved', out)
