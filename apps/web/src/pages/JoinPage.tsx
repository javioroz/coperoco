import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Header from "../components/Header";
import { BackIcon } from "../components/icons";
import { db } from "../db";

export default function JoinPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.join(code!)
      .then(async (g) => { await db.groups.put(g); if (!cancelled) nav(`/${g.app}/g/${g.id}`, { replace: true }); })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "error"));
    return () => { cancelled = true; };
  }, [code, nav]);

  return (
    <>
      <Header left={<Link className="icon-btn" to="/" aria-label="Volver"><BackIcon /></Link>} title="Unirse" />
      <main>{error ? <p className="error">{error}</p> : <p>Uniéndote…</p>}</main>
    </>
  );
}
