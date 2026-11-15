// Utilidades de contraste (WCAG 2) para poder usar cualquier color de acento y que el texto siga siendo legible.

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function mix(hex: string, target: string, t: number) {
  const a = channels(hex), b = channels(target);
  return "#" + a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Color de texto (blanco o casi negro) con más contraste sobre un fondo `accent`. */
export const onAccent = (accent: string) => (contrast(accent, "#ffffff") >= contrast(accent, "#111111") ? "#ffffff" : "#111111");

/** El propio color si ya se lee sobre `surface`; si no, una variante más oscura/clara (mismo tono) con contraste ≥ 4,5. */
export function readableOn(color: string, surface: string, min = 4.5) {
  if (contrast(color, surface) >= min) return color;
  const toward = luminance(surface) > 0.5 ? "#000000" : "#ffffff";
  for (let t = 0.04; t <= 1; t += 0.04) { const c = mix(color, toward, t); if (contrast(c, surface) >= min) return c; }
  return toward;
}

/** Variables CSS de un color de acento: fondo, texto sobre él, y texto-de-acento legible en claro y en oscuro. */
export function accentVars(accent: string) {
  return {
    "--accent": accent,
    "--on-accent": onAccent(accent),
    "--accent-text-l": readableOn(accent, "#ffffff"),
    "--accent-text-d": readableOn(accent, "#181b22"),
  } as Record<string, string>;
}
