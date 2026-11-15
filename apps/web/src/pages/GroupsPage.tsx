import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../apps/AppLayout";
import { api } from "../api";
import EmojiPicker from "../components/EmojiPicker";
import Header from "../components/Header";
import { BackIcon, PlusIcon } from "../components/icons";
import Modal from "../components/Modal";
import UserMenu from "../components/UserMenu";
import { db } from "../db";
import { refreshGroups } from "../groups";

export default function GroupsPage() {
  const app = useApp();
  const groups = useLiveQuery(() => db.groups.where("app").equals(app.id).toArray(), [app.id]);

  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(app.defaultEmoji);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  useEffect(() => { refreshGroups().catch(() => {}); }, []); // sin red: se usa lo local
  useEffect(() => { setEmoji(app.defaultEmoji); }, [app.defaultEmoji]);

  function closeModal() { setModalOpen(false); setError(""); }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const g = await api.createGroup({ id: crypto.randomUUID(), app: app.id, name, emoji });
      await db.groups.put(g);
      setName(""); setEmoji(app.defaultEmoji); setModalOpen(false);
      nav(`/${app.id}/g/${g.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const c = code.trim();
    setCode(""); setModalOpen(false);
    nav(`/join/${encodeURIComponent(c)}`);
  }

  return (
    <>
      <Header
        left={<Link className="icon-btn" to="/" aria-label="Volver"><BackIcon /></Link>}
        title={<span className="brand"><img src={app.logo} alt="" />{app.name}</span>}
        right={<UserMenu />}
      />
      <main className="with-fab">
        <h2>Mis {app.plural}</h2>
        <ul className="cards">
          {groups?.map((g) => (
            <li key={g.id}>
              <Link to={`/${app.id}/g/${g.id}`} className="group-card">
                <span className="group-emoji">{g.emoji ?? app.defaultEmoji}</span>
                <span className="group-name">{g.name}</span>
                {app.Badge && <app.Badge groupId={g.id} />}
              </Link>
            </li>
          ))}
          {groups?.length === 0 && <li className="muted">Aún no tienes {app.plural}. Pulsa + para crear {app.noun === "cesta" ? "una" : "uno"} o unirte a {app.noun === "cesta" ? "una" : "uno"}.</li>}
        </ul>
      </main>

      <button className="fab" aria-label={`Crear o unirse ${app.toThe}`} onClick={() => setModalOpen(true)}>
        <PlusIcon />
      </button>

      <Modal open={modalOpen} onClose={closeModal} title={`Añadir ${app.noun}`}>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "create"} className={tab === "create" ? "active" : ""} onClick={() => { setTab("create"); setError(""); }}>Crear</button>
          <button role="tab" aria-selected={tab === "join"} className={tab === "join" ? "active" : ""} onClick={() => { setTab("join"); setError(""); }}>Unirme</button>
        </div>

        {tab === "create" ? (
          <form onSubmit={create} className="stack">
            <EmojiPicker emojis={app.emojis} value={emoji} onChange={setEmoji} />
            <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
            <button>Crear {app.noun}</button>
          </form>
        ) : (
          <form onSubmit={join} className="stack">
            <input placeholder="Código de invitación" value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="characters" />
            <button>Unirme</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </Modal>
    </>
  );
}
