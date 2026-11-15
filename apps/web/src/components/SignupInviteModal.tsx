import { useEffect, useState } from "react";
import type { SignupInvite } from "@coperoco/shared";
import { api } from "../api";
import Modal from "./Modal";

/** Invitaciones para que otra persona cree cuenta en CoPeroCo. */
export default function SignupInviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [invites, setInvites] = useState<SignupInvite[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(""); setCopied("");
    api.signupInvites().then(setInvites).catch(() => setError("Necesitas conexión para ver tus invitaciones"));
  }, [open]);

  async function create() {
    setError("");
    try { const inv = await api.createSignupInvite(); setInvites((l) => [inv, ...(l ?? [])]); }
    catch (e) { setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Necesitas conexión para invitar"); }
  }

  async function share(code: string) {
    const url = `${location.origin}/invite/${code}`;
    if (navigator.share) { try { await navigator.share({ title: "Únete a CoPeroCo", url }); return; } catch { /* cancelado */ } }
    await navigator.clipboard?.writeText(url);
    setCopied(code);
  }

  const now = Date.now();
  return (
    <Modal open={open} onClose={onClose} title="Invitar a CoPeroCo">
      <p className="muted" style={{ margin: 0 }}>
        <small>Cada invitación sirve para crear <strong>una</strong> cuenta y caduca a los 7 días. Compártela solo con quien quieras que use la plataforma.</small>
      </p>
      <button onClick={create}>Nueva invitación</button>
      {error && <p className="error">{error}</p>}
      <ul className="list" style={{ margin: 0 }}>
        {invites?.map((i) => {
          const status = i.usedBy ? `Usada por ${i.usedBy}` : i.expiresAt < now ? "Caducada" : `Disponible hasta el ${new Date(i.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
          const active = !i.usedBy && i.expiresAt >= now;
          return (
            <li key={i.code}>
              <span style={{ minWidth: 0 }}>
                <code style={{ margin: 0, display: "inline" }}>{i.code}</code><br />
                <small className="muted">{status}</small>
              </span>
              {active && <button className="small" onClick={() => share(i.code)}>{copied === i.code ? "¡Copiado!" : typeof navigator.share === "function" ? "Compartir" : "Copiar enlace"}</button>}
            </li>
          );
        })}
        {invites?.length === 0 && <li className="muted">Aún no has creado invitaciones.</li>}
      </ul>
    </Modal>
  );
}
