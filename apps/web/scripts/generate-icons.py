#!/usr/bin/env python3
"""Genera los logos de la web y los iconos de la PWA a partir de las imágenes originales.

Uso:  python3 apps/web/scripts/generate-icons.py <carpeta con los PNG originales>
Necesita Pillow (pip install pillow).

Entrada (en la carpeta indicada):
  logo_coperoco.png, coperoco_cesta_logo.png, coperoco_gastos_logo.png,
  coperoco_favores_logo.png, coperoco_viajes_logo.png

Salida:
  src/assets/logos/<app>.png         logos que importa la web (192 px de ancho)
  public/icon-192.png, icon-512.png  iconos de la PWA (esquinas transparentes)
  public/icon-maskable-512.png       icono "maskable": fondo opaco y logo dentro de la zona segura (80 %)
  public/apple-touch-icon.png        iOS (opaco; iOS redondea las esquinas él mismo)
  public/favicon-32.png, favicon.ico pestaña del navegador
"""
import sys
from pathlib import Path
from PIL import Image

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
ROOT = Path(__file__).resolve().parent.parent
LOGOS = {
    "coperoco": "logo_coperoco.png",
    "cestaco": "coperoco_cesta_logo.png",
    "gastoco": "coperoco_gastos_logo.png",
    "favorco": "coperoco_favores_logo.png",
    "viajeco": "coperoco_viajes_logo.png",
}
BG = (228, 240, 253, 255)  # azul claro del fondo del logo
LANCZOS = Image.Resampling.LANCZOS

def square(im: Image.Image) -> Image.Image:
    w, h = im.size
    s = max(w, h)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(im, ((s - w) // 2, (s - h) // 2))
    return out

def on_bg(sq: Image.Image, size: int, scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    s = round(size * scale)
    canvas.alpha_composite(sq.resize((s, s), LANCZOS), ((size - s) // 2, (size - s) // 2))
    return canvas

(ROOT / "src/assets/logos").mkdir(parents=True, exist_ok=True)
for name, file in LOGOS.items():
    im = Image.open(SRC / file).convert("RGBA")
    h = round(192 * im.height / im.width)
    im.resize((192, h), LANCZOS).save(ROOT / f"src/assets/logos/{name}.png", optimize=True)

main = square(Image.open(SRC / LOGOS["coperoco"]).convert("RGBA"))
pub = ROOT / "public"
for size in (192, 512):
    main.resize((size, size), LANCZOS).save(pub / f"icon-{size}.png", optimize=True)
on_bg(main, 512, 0.74).save(pub / "icon-maskable-512.png", optimize=True)
on_bg(main, 180, 1.0).save(pub / "apple-touch-icon.png", optimize=True)
main.resize((32, 32), LANCZOS).save(pub / "favicon-32.png", optimize=True)
main.save(pub / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("ok")
