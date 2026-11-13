import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await (mode === "login" ? api.login : api.register)({ username, password });
      signIn(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h1>CoPeroCo</h1>
      <input placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      <input type="password" placeholder="Contraseña (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
      {error && <p className="error">{error}</p>}
      <button type="submit">{mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
      </button>
    </form>
  );
}
