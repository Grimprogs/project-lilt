import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { AppNotification, NotificationType, Role } from "@/data/seed";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/integrations/supabase/types";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Badge } from "@capawesome/capacitor-badge";
import { useRealtimeTasks } from "@/hooks/useNotifications";

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
  dismissNotification: (id: string) => void;
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
let _channelReady = false;
async function ensureNotificationChannel() {
  if (_channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: "ztasks_high",
      name: "ZTasks Alerts",
      importance: 5,
      description: "Task notifications",
      visibility: 1,
      vibration: true,
    });
    _channelReady = true;
  } catch (e) {
    console.warn("[ZTasks] Channel creation failed:", e);
  }
}

async function ensureNotificationPermission() {
  try {
    const perms = await LocalNotifications.checkPermissions();
    if (perms.display !== "granted") {
      const result = await LocalNotifications.requestPermissions();
      return result.display === "granted";
    }
    return true;
  } catch (e) {
    console.warn("[ZTasks] Permission check failed:", e);
    return false;
  }
}

async function fireNativeNotification(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      console.warn("[ZTasks] Notification permission not granted");
      return;
    }
    await ensureNotificationChannel();
    try {
      const result = await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 2000000000),
            channelId: "ztasks_high",
          }
        ]
      });
      console.log("[ZTasks] Notification scheduled:", result);
    } catch (e) {
      console.error("[ZTasks] Notification schedule FAILED:", e);
    }
  } else {
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

  // Enable realtime subscriptions for tasks
  useRealtimeTasks();

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
      if (Capacitor.isNativePlatform()) {
        await ensureNotificationPermission();
        await ensureNotificationChannel();
        console.log("[ZTasks] Native notification setup complete");
      } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
        setTimeout(async () => {
          const result = await Notification.requestPermission();
          setNotifPerm(result);
        }, 2000);
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
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .eq("audience", userId);

    const { data } = await query;
    if (!data || data.length === 0) return;

    // Collect missing actor_ids and task_ids to enrich old notifications
    const missingActorIds = [...new Set(
      data.filter((r: any) => !r.actor_name && r.actor_id).map((r: any) => r.actor_id)
    )];
    const missingTaskIds = [...new Set(
      data.filter((r: any) => !r.task_title && r.task_id).map((r: any) => r.task_id)
    )];

    // Batch fetch profiles and tasks for enrichment
    let profileMap: Record<string, string> = {};
    let taskMap: Record<string, string> = {};

    if (missingActorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", missingActorIds);
      if (profiles) profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.name]));
    }
    if (missingTaskIds.length > 0) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", missingTaskIds);
      if (tasks) taskMap = Object.fromEntries(tasks.map((t: any) => [t.id, t.title]));
    }

    const mapped: AppNotification[] = data.map((row: any) => ({
      id: row.id,
      type: row.type as NotificationType,
      taskId: row.task_id ?? "",
      taskTitle: row.task_title || taskMap[row.task_id] || "Unknown task",
      taskDescription: undefined,
      actorId: row.actor_id ?? "",
      actorName: row.actor_name || profileMap[row.actor_id] || "System",
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
          filter: `audience=eq.${profile.id}`,
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
          setNotifications(prev => {
            if (prev.some(n => n.id === notif.id)) return prev;
            return [notif, ...prev].slice(0, 200);
          });
          // Fire OS notification
          fireNativeNotification(
            "Z-Tasksforce",
            `${notif.actorName} ${VERB[notif.type] ?? notif.type} "${notif.taskTitle}"`
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
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
    // audience is a profile UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n.audience);
    supabase.from("notifications").insert({
      user_id: isUUID ? n.audience : null,
      audience: n.audience,
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
  // Notifications addressed specifically to their profile ID
  // (task assigned, approval requests, and logs routed to them by the hierarchy matrix)
  const visibleNotifications = useMemo(() => {
    if (!user || !profile) return [];
    return notifications.filter(n => n.audience === profile.id);
  }, [notifications, user, profile]);

  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      Badge.set({ count: unreadCount }).catch(() => { });
    }
  }, [unreadCount]);

  // Channel creation is now handled inline by ensureNotificationChannel()

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

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  const toggleTheme = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);

  const value = useMemo<AppCtx>(() => ({
    user, profile, authLoading, login, logout,
    notifications,
    markNotificationRead, markAllNotificationsRead, dismissNotification, visibleNotifications, unreadCount,
    theme, toggleTheme,
    notificationPermission: notifPerm,
    requestNotificationPermission,
    pushNotification,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, authLoading, notifications, visibleNotifications, unreadCount, theme, toggleTheme, notifPerm, requestNotificationPermission, pushNotification, markNotificationRead, markAllNotificationsRead, dismissNotification]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
