"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type SessionUser } from "./api";

const TOKEN_KEY = "voice-bot-token";
const USER_KEY = "voice-bot-user";

type AuthContextValue = {
  token: string | null;
  user: SessionUser | null;
  ready: boolean;
  setSession: (token: string, user: SessionUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser) as SessionUser);
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    setReady(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      ready,
      setSession: (nextToken, nextUser) => {
        localStorage.setItem(TOKEN_KEY, nextToken);
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
        setToken(nextToken);
        setUser(nextUser);
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      },
    }),
    [token, user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export async function refreshUser(token: string) {
  return api<SessionUser>("/auth/me", { token });
}
