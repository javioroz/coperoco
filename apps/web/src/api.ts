import type {
  AuthResponse, Credentials, ExpenseSyncRequest, ExpenseSyncResponse, Group, Invite, Member, RegisterInput, SignupInvite, SyncRequest, SyncResponse,
} from "@coperoco/shared";

const TOKEN_KEY = "coperoco:session";
export interface Session { token: string; user: { id: string; username: string } }

export const getSession = (): Session | null => {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null"); } catch { return null; }
};
export const setSession = (s: Session | null) =>
  s ? localStorage.setItem(TOKEN_KEY, JSON.stringify(s)) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Error de red (offline / servidor caído), distinto de una respuesta HTTP de error. */
export const isNetworkError = (e: unknown) => !(e instanceof ApiError);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getSession()?.token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event("coperoco:unauthorized"));
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

export const api = {
  register: (c: RegisterInput) => request<AuthResponse>("POST", "/auth/register", c),
  signupInvites: () => request<SignupInvite[]>("GET", "/signup-invites"),
  createSignupInvite: () => request<SignupInvite>("POST", "/signup-invites"),
  login: (c: Credentials) => request<AuthResponse>("POST", "/auth/login", c),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  groups: () => request<Group[]>("GET", "/groups"),
  createGroup: (g: Group) => request<Group>("POST", "/groups", g),
  updateGroup: (id: string, g: { name: string; emoji: string }) => request<Group>("PATCH", `/groups/${id}`, g),
  removeMember: (id: string, userId: string) => request<{ ok: true }>("DELETE", `/groups/${id}/members/${userId}`),
  members: (id: string) => request<Member[]>("GET", `/groups/${id}/members`),
  leaveGroup: (id: string) => request<{ ok: true }>("DELETE", `/groups/${id}/membership`),
  createInvite: (id: string) => request<Invite>("POST", `/groups/${id}/invites`),
  join: (code: string) => request<Group>("POST", `/invites/${encodeURIComponent(code)}/join`),
  syncExpenses: (id: string, body: ExpenseSyncRequest) => request<ExpenseSyncResponse>("POST", `/groups/${id}/expenses/sync`, body),
  sync: (id: string, body: SyncRequest) => request<SyncResponse>("POST", `/groups/${id}/sync`, body),
};
