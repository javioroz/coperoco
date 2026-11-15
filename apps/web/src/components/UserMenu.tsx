import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { UserIcon } from "./icons";
import SignupInviteModal from "./SignupInviteModal";

/** Icono de usuario con popover: nombre + cerrar sesión. */
export default function UserMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button className="icon-btn" aria-label="Usuario" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <UserIcon />
      </button>
      {open && (
        <div className="popover" role="menu">
          <p className="popover-name">{session?.user.username}</p>
          <button onClick={() => { setOpen(false); setInviteOpen(true); }}>Invitar a CoPeroCo</button>
          <button className="danger" onClick={signOut}>Cerrar sesión</button>
        </div>
      )}
      <SignupInviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
