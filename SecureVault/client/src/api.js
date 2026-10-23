import axios from 'axios';

// Access token lives in memory only (never localStorage). The refresh token is an httpOnly cookie.
let accessToken = null;
let onAuthFailure = () => {};
export const setAccessToken = (t) => { accessToken = t; };
export const setAuthFailureHandler = (fn) => { onAuthFailure = fn; };

const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing = null; // de-duplicates simultaneous refreshes (also React StrictMode double-mount)
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios.post('/api/auth/refresh', null, { withCredentials: true })
      .then((r) => { setAccessToken(r.data.accessToken); return r.data; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && original && !original._retry && !original.skipAuthRefresh) {
      original._retry = true;
      try {
        await refreshSession();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
        onAuthFailure();
      }
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err) => {
  if (err?.response?.data instanceof Blob) return 'Request failed';
  return err?.response?.data?.message || (err?.request ? 'Cannot reach the server. Is the backend running?' : 'Something went wrong');
};

// Fetches a file as a blob (with the auth header) and opens it or saves it.
export async function fetchFile(id, { version, inline, fallbackName } = {}) {
  // Open the tab synchronously so popup blockers allow it.
  const tab = inline ? window.open('', '_blank') : null;
  try {
    const res = await api.get(`/files/${id}/download`, { params: { version, inline: inline ? 1 : undefined }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    if (inline) {
      tab.location.href = url;
    } else {
      const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers['content-disposition'] || '');
      const a = document.createElement('a');
      a.href = url;
      a.download = m ? decodeURIComponent(m[1]) : fallbackName || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch (err) {
    if (tab) tab.close();
    if (err.response?.data instanceof Blob) {
      try { err.response.data = JSON.parse(await err.response.data.text()); } catch { /* ignore */ }
    }
    throw err;
  }
}

export async function saveBlob(path, params, filename) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default api;
