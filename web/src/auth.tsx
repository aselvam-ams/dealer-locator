import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from '@dealer/shared';
import { api, getToken, setToken } from './api/client';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const CAP: Record<string, string[]> = {
  search: ['admin', 'ams_power_user', 'consultant', 'service_provider', 'oem_office', 'dealer'],
  manage_tenant_dealers: ['admin', 'ams_power_user', 'oem_office'],
  import_export: ['admin', 'ams_power_user', 'oem_office'],
  set_stop_tow: ['admin', 'ams_power_user', 'oem_office', 'dealer'],
  change_register: ['admin', 'ams_power_user'],
  manage_users: ['admin', 'ams_power_user', 'oem_office'],
  manage_tenants: ['admin'],
  view_audit: ['admin', 'ams_power_user'],
  sync_charging: ['admin', 'ams_power_user'],
};

export function can(role: string | undefined, cap: keyof typeof CAP): boolean {
  return !!role && CAP[cap].includes(role);
}
