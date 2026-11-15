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
