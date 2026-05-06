import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { AppNotification, NotificationType, Role } from "@/data/seed";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/integrations/supabase/types";

interface SessionUser {
  role: Role;
  employeeId?: string;  // same as supabase profile id for employees
  name: string;
  username: string;
  email?: string;
}

interface AppCtx {
  user: SessionUser | null;
  profile: Profile | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; profile?: Profile; error?: string }>;
  logout: () => Promise<void>;

  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  visibleNotifications: AppNotification[];
  unreadCount: number;

  theme: "light" | "dark";
  toggleTheme: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("ztasksforce.theme"); //saves or sees if pv user saved any data 
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // ── Supabase Auth Session ─────────────────────────────────────────────────
  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchProfileAndSetUser(session.user.id);
      } else {
        setAuthLoading(false);
      }
    });

    // Listen for login / logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchProfileAndSetUser(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfileAndSetUser(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single<Profile>();

    if (data) {
      setProfile(data as Profile);
      setUser({
        role: data.role as Role,
        employeeId: data.role === "employee" ? data.id : undefined,
        name: data.name,
        username: data.username,
      });
      setAuthLoading(false);
      return data as Profile;
    }
    setAuthLoading(false);
    return null;
  }

  const login = async (email: string, password: string): Promise<{ ok: boolean; profile?: Profile; error?: string }> => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthLoading(false);
      return { ok: false, error: error.message };
    }
    if (data?.user) {
      const profile = await fetchProfileAndSetUser(data.user.id);
      return { ok: true, profile };
    }
    setAuthLoading(false);
    return { ok: false, error: "Login failed. No user returned." };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark"); else root.classList.remove("dark");
    localStorage.setItem("ztasksforce.theme", theme);
  }, [theme]);



  const pushNotification = useCallback((n: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    setNotifications(prev => [
      {
        ...n,
        id: "n" + Math.random().toString(36).slice(2, 9),
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ].slice(0, 200)); 
  }, []);

  const markNotificationRead = (id: string) =>
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllNotificationsRead = () =>
    setNotifications(prev => prev.map(n => {
      if (!user) return n;
      const isMine = user.role === "admin" ? n.audience === "admin" : n.audience === user.employeeId;
      return isMine ? { ...n, read: true } : n;
    }));

  const visibleNotifications = useMemo(() => {
    if (!user) return [];
    return notifications.filter(n =>
      user.role === "admin" ? n.audience === "admin" : n.audience === user.employeeId
    );
  }, [notifications, user]);

  const unreadCount = visibleNotifications.filter(n => !n.read).length;
  const toggleTheme = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);

  const value = useMemo<AppCtx>(() => ({
    user, profile, authLoading, login, logout,
    notifications,
    markNotificationRead, markAllNotificationsRead, visibleNotifications, unreadCount,
    theme, toggleTheme,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, authLoading, notifications, visibleNotifications, unreadCount, theme, toggleTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
