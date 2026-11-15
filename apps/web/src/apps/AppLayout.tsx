import { createContext, useContext, type CSSProperties } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { accentVars } from "../color";
import { getApp, type AppDef } from "./registry";

const AppCtx = createContext<AppDef>(null!);
export const useApp = () => useContext(AppCtx);

/** Layout de /:appId — resuelve la app y aplica su color de acento a todo lo que cuelga de ella. */
export default function AppLayout() {
  const { appId } = useParams();
  const app = getApp(appId);
  if (!app) return <Navigate to="/" replace />;
  return (
    <AppCtx.Provider value={app}>
      <div className="app-theme" style={accentVars(app.color) as CSSProperties}>
        <Outlet />
      </div>
    </AppCtx.Provider>
  );
}
