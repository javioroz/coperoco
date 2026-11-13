import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/** Pop-up centrado con fondo oscuro. Se cierra con Escape o tocando fuera. */
export default function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-root">
      <div className="backdrop shown" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
