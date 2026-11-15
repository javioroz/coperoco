const eurFmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const eur = (cents: number) => eurFmt.format(cents / 100);

/** "12,5" / "12.50" -> 1250. Devuelve null si no es un importe válido (> 0, máx. 2 decimales). */
export function parseAmountToCents(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(parseFloat(t) * 100);
  return cents > 0 ? cents : null;
}

/** Fecha local de hoy como YYYY-MM-DD (no UTC: a las 00:30 en España sigue siendo "hoy"). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateLabel(iso: string) {
  const today = todayISO();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (iso === today) return "Hoy";
  if (iso === yesterday) return "Ayer";
  const [yy, mm, dd] = iso.split("-").map(Number);
  return new Date(yy!, mm! - 1, dd!).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
