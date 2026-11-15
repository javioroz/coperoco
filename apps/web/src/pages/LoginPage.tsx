import { useState, type FormEvent } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { logos } from "../assets/logos";
import { useAuth } from "../auth";
import { db } from "../db";

export default function LoginPage() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  // Un enlace de invitación (/invite/CÓDIGO de la plataforma o /join/CÓDIGO de un grupo) abre el registro con el código ya puesto
  const fromLink = (matchPath("/invite/:code", loc.pathname) ?? matchPath("/join/:code", loc.pathname))?.params.code
    ?? new URLSearchParams(loc.search).get("invite") ?? "";

  const [mode, setMode] = useState<"login" | "register">(fromLink ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(fromLink.toUpperCase());
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") return signIn(await api.login({ username, password }));
      const res = await api.register({ username, password, inviteCode });
      if (res.group) await db.groups.put(res.group); // te registraste con el enlace de un grupo: ya estás dentro
      signIn(res);
      if (res.group) nav(`/${res.group.app}/g/${res.group.id}`, { replace: true });
      else nav("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <img className="login-logo" src={logos.coperoco} alt="" />
      <h1 className="login-title">CoPeroCo</h1>
      {mode === "register" && (
        <>
          <input placeholder="Código de invitación" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            autoCapitalize="characters" autoComplete="off" required />
          <p className="muted" style={{ margin: 0 }}><small>Para crear una cuenta necesitas la invitación de alguien que ya use CoPeroCo.</small></p>
        </>
      )}
      <input placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      <input type="password" placeholder="Contraseña (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
      {error && <p className="error">{error}</p>}
      <button type="submit">{mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
        {mode === "login" ? "Tengo una invitación" : "Ya tengo cuenta"}
      </button>
    </form>
  );
}
