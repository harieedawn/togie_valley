#!/usr/bin/env python3
"""Togie Valley - tools/gen_icon.py (Stage 15A-3, A7). Pure PIL, no network.
Draws ONE 1024 px master (2x supersampled) and derives every icon from the same art:
  icons/icon-master-1024.png, icon-512, icon-192, apple-touch-icon (180, opaque), icon-maskable-512
  (art lives inside the central 80% safe zone, full-bleed background), favicon-32/48,
  icons/android/mipmap-*/ic_launcher(.png|_round.png|_foreground.png|_background.png) for tools/android_patch.js.
Usage: python3 tools/gen_icon.py"""
import os, math, random
from PIL import Image, ImageDraw, ImageChops, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'icons')
SS = 2                      # supersampling factor over the 1024 master
N = 1024 * SS
INK = (62, 40, 28)          # thick dark-brown ink

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def shade(c, f): return tuple(max(0, min(255, int(v * f))) for v in c)

class Canvas:
    def __init__(self, scale=1.0, bg=True, art=True):
        self.scale, self.draw_bg, self.draw_art = scale, bg, art
        self.img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    def p(self, x, y):
        c = 512.0
        return ((c + (x - c) * self.scale) * SS, (c + (y - c) * self.scale) * SS)
    def r(self, v): return v * self.scale * SS
    def mask(self, fn, g=0):
        m = Image.new('L', (N, N), 0)
        fn(ImageDraw.Draw(m), g)
        return m
    def fill(self, m, color):
        self.img.paste(Image.new('RGBA', (N, N), color + (255,)), (0, 0), m)
    def part(self, fn, color, ink=11, band=14):
        """inked cel-shaded shape: ink outline, base, shadow rim (bottom-right), highlight rim (top-left)."""
        g = self.r(ink)
        self.fill(self.mask(fn, g), INK)
        base = self.mask(fn, 0)
        self.fill(base, color)
        d = int(self.r(band))
        sh = ImageChops.subtract(base, ImageChops.offset(base, -d, -d))
        hl = ImageChops.subtract(base, ImageChops.offset(base, d, d))
        self.fill(sh, shade(color, 0.78))
        self.fill(hl, tuple(min(255, int(v + (255 - v) * 0.45)) for v in color))
    def ell(self, cx, cy, rx, ry):
        def f(dr, g):
            x0, y0 = self.p(cx - rx, cy - ry); x1, y1 = self.p(cx + rx, cy + ry)
            dr.ellipse([x0 - g, y0 - g, x1 + g, y1 + g], fill=255)
        return f
    def poly(self, pts):
        P = [self.p(x, y) for x, y in pts]
        def f(dr, g):
            dr.polygon(P, fill=255)
            if g: dr.line(P + [P[0]], fill=255, width=int(g * 2), joint='curve')
        return f
    def rect(self, x0, y0, x1, y1, rad=0):
        def f(dr, g):
            a = self.p(x0, y0); b = self.p(x1, y1)
            dr.rounded_rectangle([a[0] - g, a[1] - g, b[0] + g, b[1] + g], radius=self.r(rad) + g, fill=255)
        return f

def bezier(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]

def leaf(base, tip, bulge):
    """leaf polygon between base and tip, bulging by `bulge` perpendicular to its axis."""
    mx, my = (base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2
    dx, dy = tip[0] - base[0], tip[1] - base[1]
    l = math.hypot(dx, dy) or 1
    nx, ny = -dy / l, dx / l
    a = bezier(base, (mx + nx * bulge, my + ny * bulge), tip)
    b = bezier(tip, (mx - nx * bulge, my - ny * bulge), base)
    return a + b[1:]

def background(cv):
    sky, mead = hexc('#bfe7f6'), hexc('#a9d98f')
    img = Image.new('RGBA', (N, N))
    px = ImageDraw.Draw(img)
    hz = int(N * 0.62)
    for y in range(N):                                   # soft sky -> meadow gradient
        if y < hz:
            t = y / hz; c = tuple(int(sky[i] * (1 - t * 0.18) + 255 * t * 0.18) for i in range(3))
        else:
            t = (y - hz) / (N - hz); c = tuple(int(mead[i] * (1 - t * 0.2) + shade(mead, 0.82)[i] * t * 0.2 + 0) for i in range(3))
        px.line([(0, y), (N, y)], fill=c + (255,))
    # rolling hill band + sun (cozy, no glow)
    px.ellipse([N * 0.72, N * 0.07, N * 0.92, N * 0.27], fill=hexc('#ffe6a1') + (255,), outline=INK + (255,), width=int(7 * SS))
    px.ellipse([-N * 0.2, hz - N * 0.06, N * 0.75, N * 1.05], fill=shade(mead, 1.05) + (255,))
    px.ellipse([N * 0.3, hz - N * 0.02, N * 1.25, N * 1.1], fill=shade(mead, 0.93) + (255,))
    # halftone corners (bottom-left + top-left), dot size fades with distance
    dots = Image.new('L', (N, N), 0); dd = ImageDraw.Draw(dots)
    step = 34 * SS
    for corner in ((0, N), (0, 0)):
        for gy in range(0, N + step, step):
            for gx in range(0, N + step, step):
                ox = step // 2 if (gy // step) % 2 else 0
                x, y = gx + ox, gy
                d = math.hypot(x - corner[0], y - corner[1]) / (N * 0.55)
                if d < 1:
                    r = (1 - d) * 11 * SS
                    dd.ellipse([x - r, y - r, x + r, y + r], fill=255)
    img.paste(Image.new('RGBA', (N, N), shade(mead, 0.72) + (255,)), (0, 0), dots)
    return img

def art(cv):
    SKIN, STRAW, BAND, LEAF = hexc('#f6cfa4'), hexc('#efc765'), hexc('#d9604f'), hexc('#6fc06a')
    # sprout growing out of the crown
    cv.part(cv.poly(bezier((505, 330), (520, 270), (512, 215)) + bezier((522, 215), (532, 270), (528, 330))[::-1][::-1]), LEAF, ink=10, band=6)
    cv.part(cv.poly(leaf((512, 255), (352, 170), 62)), LEAF, ink=10, band=10)
    cv.part(cv.poly(leaf((520, 240), (690, 150), 70)), shade(LEAF, 1.08), ink=10, band=10)
    # face (round, cream) under the hat
    cv.part(cv.ell(512, 640, 205, 190), SKIN, ink=12, band=16)
    # brim (wide straw ellipse) then dome
    cv.part(cv.ell(512, 430, 205, 150), STRAW, ink=13, band=18)
    cv.part(cv.rect(318, 400, 706, 446, 18), BAND, ink=9, band=8)
    cv.part(cv.ell(512, 520, 345, 92), STRAW, ink=13, band=18)
    # straw weave ticks on brim
    for x in range(250, 790, 62):
        a = cv.p(x, 548 + abs(x - 512) * -0.05); b = cv.p(x + 24, 580 - abs(x - 512) * 0.05)
    # face: dot eyes, blush, tiny smile
    layer = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for ex in (440, 584):
        x0, y0 = cv.p(ex - 20, 640 - 24); x1, y1 = cv.p(ex + 20, 640 + 28)
        d.ellipse([x0, y0, x1, y1], fill=INK + (255,))
        h0, h1 = cv.p(ex - 9, 640 - 14), cv.p(ex + 3, 640 - 2)
        d.ellipse([h0[0], h0[1], h1[0], h1[1]], fill=(255, 255, 255, 255))
    for bx in (392, 632):
        x0, y0 = cv.p(bx - 34, 700 - 18); x1, y1 = cv.p(bx + 34, 700 + 18)
        d.ellipse([x0, y0, x1, y1], fill=(238, 130, 120, 200))
    s0, s1 = cv.p(472, 690), cv.p(552, 750)
    d.arc([s0[0], s0[1] - cv.r(20), s1[0], s1[1] - cv.r(20)], 20, 160, fill=INK + (255,), width=int(cv.r(11)))
    cv.img.alpha_composite(layer)
    return cv

def render(scale=1.0, bg=True, fg=True):
    cv = Canvas(scale)
    if bg:
        cv.img = background(cv)
    if fg:
        art(cv)
    return cv.img

def save(img, name, size, opaque=False, sub=OUT):
    im = img.resize((size, size), Image.LANCZOS)
    if opaque:
        base = Image.new('RGB', im.size, hexc('#a9d98f')); base.paste(im, mask=im.split()[3]); im = base
    os.makedirs(sub, exist_ok=True)
    im.save(os.path.join(sub, name), optimize=True)

def circle(im):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    out = im.copy(); out.putalpha(m); return out

def rounded(im, rad=0.18):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=int(im.size[0] * rad), fill=255)
    out = im.copy(); out.putalpha(m); return out

def main():
    master = render(1.0)                      # content radius ~0.34 of canvas: inside the 80% maskable safe zone
    save(master, 'icon-master-1024.png', 1024)
    save(master, 'icon-512.png', 512)
    save(master, 'icon-192.png', 192)
    save(master, 'apple-touch-icon.png', 180, opaque=True)
    save(master, 'icon-maskable-512.png', 512)
    save(master, 'favicon-32.png', 32)
    save(master, 'favicon-48.png', 48)
    fg = render(0.9, bg=False)                # adaptive foreground: art inside the central 66/108 zone
    bgl = render(1.0, fg=False)
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for k, m in dens.items():
        sub = os.path.join(OUT, 'android', 'mipmap-' + k)
        legacy = master.resize((int(48 * m), int(48 * m)), Image.LANCZOS)
        legacy.save(os.path.join(sub, 'x'), 'PNG') if False else None
        os.makedirs(sub, exist_ok=True)
        rounded(legacy).save(os.path.join(sub, 'ic_launcher.png'), optimize=True)
        circle(legacy).save(os.path.join(sub, 'ic_launcher_round.png'), optimize=True)
        save(fg, 'ic_launcher_foreground.png', int(108 * m), sub=sub)
        save(bgl, 'ic_launcher_background.png', int(108 * m), opaque=True, sub=sub)
    print('gen_icon: done (master 1024 -> web + android variants)')

if __name__ == '__main__':
    main()
