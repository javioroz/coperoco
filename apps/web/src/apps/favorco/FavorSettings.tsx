import { DEFAULT_LLM_ENDPOINT, DEFAULT_LLM_MODEL, type LlmConfigStatus } from "@coperoco/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";

const PRESETS = [
  { name: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  { name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-4o-mini" },
  { name: "Groq", endpoint: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  { name: "Mistral", endpoint: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
];

/** Sección de los ajustes de un grupo de FavoresCo: la IA que puntúa los favores. */
export default function FavorSettings({ groupId, open, isOwner }: { groupId: string; open: boolean; isOwner: boolean }) {
  const [status, setStatus] = useState<LlmConfigStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_LLM_ENDPOINT);
  const [model, setModel] = useState(DEFAULT_LLM_MODEL);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMsg(""); setOffline(false);
    api.llmConfig(groupId)
      .then((s) => { setStatus(s); setEndpoint(s.endpoint); setModel(s.model); })
      .catch(() => setOffline(true));
  }, [open, groupId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(""); setSaving(true);
    try {
      const s = await api.saveLlmConfig(groupId, { endpoint, model, ...(apiKey ? { apiKey } : {}) });
      setStatus(s); setApiKey(""); setMsg("Guardado");
    } catch (err) {
      setMsg(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Necesitas conexión para guardar");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!confirm("¿Quitar la IA de este grupo? Se borrará la clave guardada.")) return;
    try { await api.deleteLlmConfig(groupId); setStatus((s) => s && { ...s, configured: false }); setApiKey(""); setMsg("IA desactivada"); }
    catch { setMsg("Necesitas conexión"); }
  }

  return (
    <section>
      <h3>Puntuación con IA</h3>
      {offline && <p className="muted">No se pudo cargar (¿sin conexión?).</p>}
      {!offline && !status && <p className="muted">Cargando…</p>}

      {status && !status.available && <p className="error">El servidor no tiene activada la puntuación con IA (falta SECRETS_KEY).</p>}

      {status && !isOwner && (
        <p className="muted">{status.configured ? `Activada · modelo ${status.model}.` : "No configurada. Solo el creador del grupo puede configurarla."}</p>
      )}

      {status && isOwner && status.available && (
        <form onSubmit={save} className="stack">
          <p className="muted" style={{ margin: 0 }}><small>
            API compatible con OpenAI. Tu clave se guarda <strong>cifrada en el servidor</strong> y no se envía a ningún otro dispositivo.
            Al puntuar, el servidor manda a tu proveedor la descripción del favor y los nombres de usuario de las personas implicadas.
          </small></p>
          <label className="field">
            <span>Proveedor</span>
            <select value={PRESETS.find((p) => p.endpoint === endpoint)?.name ?? "Otro"}
              onChange={(e) => { const p = PRESETS.find((x) => x.name === e.target.value); if (p) { setEndpoint(p.endpoint); setModel(p.model); } }}>
              {PRESETS.map((p) => <option key={p.name}>{p.name}</option>)}
              <option>Otro</option>
            </select>
          </label>
          <label className="field"><span>Endpoint</span><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} required maxLength={300} inputMode="url" /></label>
          <label className="field"><span>Modelo</span><input value={model} onChange={(e) => setModel(e.target.value)} required maxLength={100} /></label>
          <label className="field">
            <span>Clave de la API</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder={status.configured ? "•••••••• (guardada; déjalo vacío para conservarla)" : "sk-…"} required={!status.configured} />
          </label>
          <button disabled={saving}>{saving ? "Guardando…" : status.configured ? "Guardar cambios" : "Activar IA"}</button>
          {status.configured && <button type="button" className="danger" onClick={remove}>Quitar la IA</button>}
          {msg && <p className={msg === "Guardado" || msg === "IA desactivada" ? "muted" : "error"}>{msg}</p>}
        </form>
      )}
    </section>
  );
}
