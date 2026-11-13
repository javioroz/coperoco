import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Member } from "@coperoco/shared";
import { api } from "../api";
import { useAuth } from "../auth";
import { db } from "../db";
import { useApp } from "../apps/AppLayout";
import Drawer from "./Drawer";
import EmojiPicker from "./EmojiPicker";

export default function GroupSettings({ groupId, open, onClose }: { groupId: string; open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { session } = useAuth();
  const app = useApp();
  const group = useLiveQuery(() => db.groups.get(groupId), [groupId]);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(app.defaultEmoji);
  const [saveMsg, setSaveMsg] = useState("");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [membersError, setMembersError] = useState(false);
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadMembers = useCallback(() => {
    setMembersError(false);
    api.members(groupId).then(setMembers).catch(() => setMembersError(true));
  }, [groupId]);

  // Al abrir: precarga el formulario con los valores actuales y refresca miembros (si hay red)
  useEffect(() => {
    if (!open) return;
    setSaveMsg("");
    loadMembers();
    void db.groups.get(groupId).then((g) => { if (g) { setName(g.name); setEmoji(g.emoji ?? app.defaultEmoji); } });
  }, [open, groupId, loadMembers, app.defaultEmoji]);

  const isOwner = members?.some((m) => m.id === session?.user.id && m.role === "owner") ?? false;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaveMsg("");
    try {
      const g = await api.updateGroup(groupId, { name, emoji });
      await db.groups.update(groupId, { name: g.name, emoji: g.emoji });
      setSaveMsg("Guardado");
    } catch (err) {
      setSaveMsg(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Necesitas conexión para guardar");
    }
  }

  async function removeMember(m: Member) {
    if (!confirm(`¿Quitar a ${m.username} de la cesta?`)) return;
    try { await api.removeMember(groupId, m.id); loadMembers(); }
    catch (err) { alert(err instanceof Error ? err.message : "Necesitas conexión"); }
  }

  async function createInvite() {
    setInviteError(""); setCopied(false);
    try {
      const { code } = await api.createInvite(groupId);
      setInvite(`${location.origin}/join/${code}`);
    } catch { setInviteError("Necesitas conexión para invitar"); }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: `Únete a mi ${app.noun} en ${app.name}`, url: invite }); return; } catch { /* cancelado */ }
    }
    await navigator.clipboard?.writeText(invite);
    setCopied(true);
  }

  async function leave() {
    if (!confirm(`¿Salir de ${app.thisOne}?`)) return;
    try { await api.leaveGroup(groupId); await db.groups.delete(groupId); nav("/"); }
    catch { alert("Necesitas conexión para salir"); }
  }

  return (
    <Drawer open={open} onClose={onClose} title={`Ajustes de ${app.the}`}>
      <section>
        <h3>{app.noun}</h3>
        <form onSubmit={save} className="stack">
          <EmojiPicker emojis={app.emojis} value={emoji} onChange={setEmoji} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required maxLength={60} />
          <button disabled={!group || (name.trim() === group.name && emoji === (group.emoji ?? app.defaultEmoji))}>Guardar</button>
          {saveMsg && <p className={saveMsg === "Guardado" ? "muted" : "error"}>{saveMsg}</p>}
        </form>
      </section>

      <section>
        <h3>Invitar</h3>
        {invite ? (
          <>
            <code>{invite}</code>
            <p className="muted"><small>Caduca en 7 días.</small></p>
            <button onClick={share}>{copied ? "¡Copiado!" : typeof navigator.share === "function" ? "Compartir" : "Copiar enlace"}</button>
          </>
        ) : (
          <button onClick={createInvite}>Generar enlace de invitación</button>
        )}
        {inviteError && <p className="error">{inviteError}</p>}
      </section>

      <section>
        <h3>Miembros</h3>
        {membersError && <p className="muted">No se pudo cargar (¿sin conexión?).</p>}
        {!members && !membersError && <p className="muted">Cargando…</p>}
        <ul className="list">
          {members?.map((m) => (
            <li key={m.id}>
              <span>{m.username} {m.role === "owner" && "👑"}</span>
              {isOwner && m.id !== session?.user.id && (
                <button className="danger small" onClick={() => removeMember(m)}>Quitar</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <button className="danger" onClick={leave}>Salir de {app.the}</button>
      </section>
    </Drawer>
  );
}
