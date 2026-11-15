const BASE = import.meta.env.VITE_API_URL || '/api';

let access = localStorage.getItem('access');
let refresh = localStorage.getItem('refresh');
let onLost = () => {};

export const onAuthLost = (fn) => { onLost = fn; };
export const hasToken = () => Boolean(access || refresh);

function setTokens(a, r) {
  access = a || null;
  if (r !== undefined) refresh = r || null;
  access ? localStorage.setItem('access', access) : localStorage.removeItem('access');
  refresh ? localStorage.setItem('refresh', refresh) : localStorage.removeItem('refresh');
}

export function logout() { setTokens(null, null); }

function flatten(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(flatten).join(' ');
  if (data.detail) return flatten(data.detail);
  return Object.values(data).map(flatten).join(' ');
}

async function refreshAccess() {
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access, data.refresh);
    return true;
  } catch {
    return false;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const run = () =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res;
  try {
    res = await run();
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && auth) {
    if (await refreshAccess()) {
      res = await run();
    } else {
      logout();
      onLost();
    }
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(flatten(data) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getConfig = () => request('/config/', { auth: false });

export async function login(username, password) {
  const data = await request('/auth/login/', { method: 'POST', body: { username, password }, auth: false });
  setTokens(data.access, data.refresh);
}

// Step 1 of signup: the server emails a 6-digit code. No account exists yet.
export const register = (form) => request('/auth/register/', { method: 'POST', body: form, auth: false });

// Step 2: verify the code. On success the account is created and the user is signed in.
export async function verifySignup(email, code) {
  const data = await request('/auth/verify-otp/', { method: 'POST', body: { email, code }, auth: false });
  setTokens(data.access, data.refresh);
  return data.user;
}

export const resendSignupCode = (email) =>
  request('/auth/resend-otp/', { method: 'POST', body: { email }, auth: false });

export const me = () => request('/auth/me/');
export const listConversations = () => request('/conversations/');
export const createConversation = () => request('/conversations/', { method: 'POST', body: {} });
export const getConversation = (id) => request(`/conversations/${id}/`);
export const deleteConversation = (id) => request(`/conversations/${id}/`, { method: 'DELETE' });
export const sendMessage = (id, content) =>
  request(`/conversations/${id}/send/`, { method: 'POST', body: { content } });
export const sendFeedback = (id, value) =>
  request(`/messages/${id}/feedback/`, { method: 'POST', body: { value } });
export const getAnalytics = () => request('/analytics/');

export const getPreferences = () => request('/preferences/');
export const updatePreferences = (body) => request('/preferences/', { method: 'PATCH', body });
export const resetPreferences = () => request('/preferences/', { method: 'DELETE' });

// ---- Admin ----
export const adminListUsers = ({ search = '', role = '', page = 1 } = {}) =>
  request(`/admin/users/?search=${encodeURIComponent(search)}&role=${role}&page=${page}`);
export const adminUpdateUser = (id, body) => request(`/admin/users/${id}/`, { method: 'PATCH', body });
export const adminDeleteUser = (id) => request(`/admin/users/${id}/`, { method: 'DELETE' });
export const adminResetPassword = (id, password) =>
  request(`/admin/users/${id}/password/`, { method: 'POST', body: { password } });
export const adminGetBot = () => request('/admin/bot-settings/');
export const adminSaveBot = (body) => request('/admin/bot-settings/', { method: 'PATCH', body });
export const adminListModels = () => request('/admin/models/');
export const adminAddModel = (body) => request('/admin/models/', { method: 'POST', body });
export const adminUpdateModel = (id, body) => request(`/admin/models/${id}/`, { method: 'PATCH', body });
export const adminDeleteModel = (id) => request(`/admin/models/${id}/`, { method: 'DELETE' });