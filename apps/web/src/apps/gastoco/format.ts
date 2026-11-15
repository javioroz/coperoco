const eurFmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const eur = (cents: number) => eurFmt.format(cents / 100);

/** "12,5" / "12.50" -> 1250. Devuelve null si no es un importe válido (> 0, máx. 2 decimales). */
export function parseAmountToCents(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(parseFloat(t) * 100);
  return cents > 0 ? cents : null;
}

export { dateLabel, todayISO } from "../../dates";
