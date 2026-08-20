import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import * as authApi from "../api/auth";
import type { RegisterInput, User } from "../api/auth";
import { setOnForbidden } from "../api/client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      const { user } = await authApi.fetchMe();
      setUser(user);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setOnForbidden(() => {
      refreshUser();
    });
    return () => setOnForbidden(null);
  }, []);

  async function login(username: string, password: string) {
    const { user } = await authApi.login(username, password);
    setUser(user);
  }

  async function register(input: RegisterInput) {
    const { user } = await authApi.register(input);
    setUser(user);
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider");
  }
  return ctx;
}
