import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { fetchWithTimeout } from "@/lib/fetch-helper";

interface UserData {
  id: string;
  fullName: string;
  email: string;
  referralCode: string;
  referredBy: string | null;
  balance: string;
  isBlocked: boolean;
  referralCount: number;
  qualifiedReferrals: number;
  totalYieldPercent: number;
  createdAt: string;
}

interface AuthContextValue {
  user: UserData | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { fullName: string; email: string; password: string; referralCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem("auth_token");
      if (storedToken) {
        setToken(storedToken);
        await fetchUser(storedToken);
      }
    } catch (err) {
      console.error("Failed to load auth:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchUser(authToken: string) {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/user/me", baseUrl);
      const res = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 15000,
      }, 1);
      if (!res.ok) {
        await AsyncStorage.removeItem("auth_token");
        setToken(null);
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error("Failed to fetch user:", err);
    }
  }

  async function login(email: string, password: string) {
    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/login", baseUrl);
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      timeout: 15000,
    }, 1);
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Login failed");
    }
    const data = await res.json();
    await AsyncStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function register(regData: { fullName: string; email: string; password: string; referralCode?: string }) {
    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/register", baseUrl);
    const res = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
      timeout: 15000,
    }, 1);
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Registration failed");
    }
    const data = await res.json();
    await AsyncStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    await AsyncStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (token) {
      await fetchUser(token);
    }
  }

  const value = useMemo(() => ({
    user, token, isLoading, login, register, logout, refreshUser,
  }), [user, token, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
