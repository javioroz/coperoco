import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/** Menú lateral (derecha) con fondo oscuro. Se cierra con Escape o tocando fuera. */
export default function Drawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`drawer-root ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
