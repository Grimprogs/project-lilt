import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { AppNotification, NotificationType, Role } from "@/data/seed";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/integrations/supabase/types";

interface SessionUser {
  role: Role;
  employeeId?: string;
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

  notificationPermission: NotificationPermission | "unsupported";
  requestNotificationPermission: () => Promise<void>;
  pushNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
}

const Ctx = createContext<AppCtx | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fireNativeNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/ztasks-logo.jpg",
      badge: "/ztasks-logo.jpg",
      tag: `ztasks-${Date.now()}`,
      silent: false,
    });
    setTimeout(() => n.close(), 6000);
  } catch { /* ignore on unsupported browsers */ }
}

const VERB: Record<string, string> = {
  task_assigned: "assigned you a task",
  task_started: "started working on",
  task_stopped: "stopped working on",
  completion_requested: "requested approval for",
  completion_approved: "approved",
  completion_rejected: "rejected",
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("ztasksforce.theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // ── Supabase Auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchProfileAndSetUser(session.user.id);
      else setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchProfileAndSetUser(session.user.id);
      else { setUser(null); setProfile(null); setAuthLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfileAndSetUser(userId: string) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single<Profile>();
    if (data) {
      setProfile(data as Profile);
      const sessionUser: SessionUser = {
        role: data.role as Role,
        employeeId: data.id, // always set — both admin and employee need their ID
        name: data.name,
        username: data.username,
      };
      setUser(sessionUser);
      setAuthLoading(false);

      // Auto-request OS notification permission on first login
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        setTimeout(async () => {
          const result = await Notification.requestPermission();
          setNotifPerm(result);
        }, 2000); // small delay so the UI loads first
      }

      // Load existing unread notifications from DB
      loadNotificationsFromDB(data.id, data.role as Role);

      return data as Profile;
    }
    setAuthLoading(false);
    return null;
  }

  // ── Load notifications from Supabase ──────────────────────────────────────
  async function loadNotificationsFromDB(userId: string, role: Role) {
    // Fetch notifications where user_id = profileId OR user_id = 'admin' (if admin/superadmin)
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (role === "admin" || role === "superadmin") {
      // Admins see notifications addressed to them specifically OR broadcast 'admin'
      query = query.or(`audience.eq.${userId},audience.eq.admin`);
    } else {
      query = query.eq("audience", userId);
    }

    const { data } = await query;
    if (!data) return;

    const mapped: AppNotification[] = data.map((row: any) => ({
      id: row.id,
      type: row.type as NotificationType,
      taskId: row.task_id ?? "",
      taskTitle: row.task_title ?? "—",
      taskDescription: undefined,
      actorId: row.actor_id ?? "",
      actorName: row.actor_name ?? "Someone",
      audience: row.audience ?? row.user_id ?? "admin",
      createdAt: row.created_at,
      read: row.read,
    }));

    setNotifications(mapped);
  }

  // ── Supabase Realtime subscription for new notifications ─────────────────
  const profileRef = useRef<Profile | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          // Use audience column — either their profile UUID or 'admin' broadcast
          filter: (profile.role === "admin" || profile.role === "superadmin")
            ? `audience=in.(${profile.id},admin)`
            : `audience=eq.${profile.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          const notif: AppNotification = {
            id: row.id,
            type: row.type as NotificationType,
            taskId: row.task_id ?? "",
            taskTitle: row.task_title ?? "—",
            actorId: row.actor_id ?? "",
            actorName: row.actor_name ?? "Someone",
            audience: row.audience ?? row.user_id ?? "admin",
            createdAt: row.created_at,
            read: false,
          };
          setNotifications(prev => [notif, ...prev].slice(0, 200));
          // Fire OS notification
          fireNativeNotification(
            "Z-Tasksforce",
            `${notif.actorName} ${VERB[notif.type] ?? notif.type} "${notif.taskTitle}"`
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, profile?.role]);

  const login = async (email: string, password: string): Promise<{ ok: boolean; profile?: Profile; error?: string }> => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setAuthLoading(false); return { ok: false, error: error.message }; }
    if (data?.user) {
      const profile = await fetchProfileAndSetUser(data.user.id);
      return { ok: true, profile };
    }
    setAuthLoading(false);
    return { ok: false, error: "Login failed. No user returned." };
  };

  const logout = async () => { await supabase.auth.signOut(); };

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark"); else root.classList.remove("dark");
    localStorage.setItem("ztasksforce.theme", theme);
  }, [theme]);

  // ── Push Notification Permission ─────────────────────────────────────────
  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPerm(result);
  }, []);

  // ── In-App push (also persists to Supabase for cross-user delivery) ───────
  const pushNotification = useCallback((n: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    // Optimistically add to local state
    const localNotif: AppNotification = {
      ...n,
      id: "n" + Math.random().toString(36).slice(2, 9),
      createdAt: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [localNotif, ...prev].slice(0, 200));

    // Persist to Supabase so the recipient's realtime subscription picks it up
    // audience is either a profile UUID or the string 'admin' (broadcast)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n.audience);
    supabase.from("notifications").insert({
      user_id: isUUID ? n.audience : null, // only set if real profile UUID
      audience: n.audience,                 // always set (includes 'admin' string)
      task_id: n.taskId || null,
      type: n.type as any,
      read: false,
      actor_name: n.actorName,
      task_title: n.taskTitle,
      actor_id: n.actorId,
    }).then(({ error }) => {
      if (error) console.warn("Failed to persist notification:", error.message);
    });
  }, []);

  // ── Visible notifications (for current user) ──────────────────────────────
  // Everyone sees:
  //  1. Notifications addressed specifically to their profile ID
  //     (task assigned, approval requests routed to them by the hierarchy matrix)
  //  2. 'admin' broadcast — informational feed (task_started/stopped)
  //     only visible to admin/superadmin roles
  // Admins do NOT see all notifications — the Control Center matrix in useTasks
  // controls exactly which admins get approval notifications via getApproverIds.
  const visibleNotifications = useMemo(() => {
    if (!user || !profile) return [];
    return notifications.filter(n =>
      n.audience === profile.id ||
      ((user.role === "admin" || user.role === "superadmin") && n.audience === "admin")
    );
  }, [notifications, user, profile]);

  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    // Also mark as read in DB
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const ids = visibleNotifications.filter(n => !n.read).map(n => n.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (ids.length > 0) {
      await supabase.from("notifications").update({ read: true }).in("id", ids);
    }
  }, [visibleNotifications]);

  const toggleTheme = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);

  const value = useMemo<AppCtx>(() => ({
    user, profile, authLoading, login, logout,
    notifications,
    markNotificationRead, markAllNotificationsRead, visibleNotifications, unreadCount,
    theme, toggleTheme,
    notificationPermission: notifPerm,
    requestNotificationPermission,
    pushNotification,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, authLoading, notifications, visibleNotifications, unreadCount, theme, toggleTheme, notifPerm, requestNotificationPermission, pushNotification, markNotificationRead, markAllNotificationsRead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
