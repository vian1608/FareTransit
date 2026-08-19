import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const BackOfficeAuthContext = createContext(null);
const storedProfile = () => { try { return JSON.parse(sessionStorage.getItem('adminSession') || 'null'); } catch { return null; } };

export function BackOfficeAuthProvider({ children }) {
  const [profile, setProfile] = useState(storedProfile);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    fetch('/api/backoffice/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error('Back-office session expired'); return response.json(); })
      .then(result => { const next = result?.data || null; setProfile(next); if (next) sessionStorage.setItem('adminSession', JSON.stringify(next)); })
      .catch(() => setProfile(null)).finally(() => setLoading(false));
  }, []);
  const value = useMemo(() => ({
    profile, loading,
    hasPermission(permission) { return Boolean(profile?.permissions?.includes('*') || profile?.permissions?.includes(permission)); },
    scopeFor(permission) { return profile?.permissions?.includes('*') ? 'ALL' : profile?.permissionScopes?.[permission]; },
    logout() { localStorage.removeItem('token'); sessionStorage.removeItem('adminSession'); setProfile(null); window.location.assign('/admin/login'); }
  }), [profile, loading]);
  return <BackOfficeAuthContext.Provider value={value}>{children}</BackOfficeAuthContext.Provider>;
}
export const useBackOfficeAuth = () => useContext(BackOfficeAuthContext);
