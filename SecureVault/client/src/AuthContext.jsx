import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { refreshSession, setAccessToken, setAuthFailureHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthFailureHandler(() => setUser(null));
    refreshSession()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Step 1 of sign-in. Returns { mfaRequired, mfaToken } or signs the user in.
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password }, { skipAuthRefresh: true });
    if (data.mfaRequired) return data;
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  const verifyMfa = useCallback(async (mfaToken, code) => {
    const { data } = await api.post('/auth/mfa/verify', { mfaToken, code }, { skipAuthRefresh: true });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', null, { skipAuthRefresh: true }); } catch { /* cookie is cleared server-side when possible */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  const reloadUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, verifyMfa, logout, reloadUser, setUser }}>{children}</AuthContext.Provider>;
}
