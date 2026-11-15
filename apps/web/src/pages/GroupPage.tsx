import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../apps/AppLayout";
import GroupSettings from "../components/GroupSettings";
import Header from "../components/Header";
import { BackIcon, SettingsIcon } from "../components/icons";
import { db } from "../db";
import { refreshGroups } from "../groups";

/** Pantalla genérica de un grupo: header + ajustes. El contenido lo pone cada app. */
export default function GroupPage() {
  const { id = "" } = useParams();
  const app = useApp();
  const nav = useNavigate();
  const listPath = `/${app.id}`;
  const group = useLiveQuery(() => db.groups.get(id), [id]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Al abrir: refresca los grupos; si ya no existe (expulsado, borrado) vuelve al listado.
  useEffect(() => {
    refreshGroups()
      .then(async () => { if (!(await db.groups.get(id))) nav(listPath, { replace: true }); })
      .catch(() => {}); // sin red: se usa lo local
  }, [id, nav, listPath]);

  // URL de otra app para este grupo
  if (group && group.app !== app.id) return <Navigate to={`/${group.app}/g/${id}`} replace />;

  return (
    <>
      <Header
        left={<Link className="icon-btn" to={listPath} aria-label="Volver"><BackIcon /></Link>}
        title={group ? `${group.emoji ?? app.defaultEmoji} ${group.name}` : "…"}
        right={<button className="icon-btn" aria-label={`Ajustes ${app.ofThe}`} onClick={() => setSettingsOpen(true)}><SettingsIcon /></button>}
      />
      <main>
        {group && <app.Content group={group} onGone={() => { void db.groups.delete(id); nav(listPath, { replace: true }); }} />}
      </main>
      <GroupSettings groupId={id} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
