import { useLiveQuery } from "dexie-react-hooks";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { logos } from "../assets/logos";
import { accentVars } from "../color";
import { APPS } from "../apps/registry";
import Header from "../components/Header";
import UserMenu from "../components/UserMenu";
import { db } from "../db";
import { refreshGroups } from "../groups";
import { useEffect } from "react";

export default function LandingPage() {
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  useEffect(() => { refreshGroups().catch(() => {}); }, []);

  return (
    <>
      <Header title={<span className="brand"><img src={logos.coperoco} alt="" />CoPeroCo</span>} right={<UserMenu />} />
      <main>
        <h2>Tus aplicaciones</h2>
        <div className="tiles">
          {APPS.map((app) => {
            const n = groups?.filter((g) => g.app === app.id).length ?? 0;
            return (
              <Link key={app.id} to={`/${app.id}`} className="tile" style={accentVars(app.color) as CSSProperties}>
                <img className="tile-logo" src={app.logo} alt="" />
                <span className="tile-name">{app.name}</span>
                <span className="tile-tagline">{app.tagline}</span>
                <span className="tile-meta">
                  {!app.ready ? "Próximamente" : n === 0 ? `Sin ${app.plural}` : `${n} ${n === 1 ? app.noun : app.plural}`}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
