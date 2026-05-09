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
  pushActivityAndNotify: (n: {
    type: NotificationType;
    taskId?: string;
    taskTitle?: string;
    taskDescription?: string;
    actorId: string;
    actorName: string;
    audiences: string[];
    metadata?: any;
  }) => void;
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
      .from("user_notifications")
      .select("*, activity:activity_logs(*)")
      .order("created_at", { ascending: false })
      .limit(50)
      .eq("user_id", userId);

    const { data } = await query;
    if (!data || data.length === 0) return;

    // Collect missing actor_ids and task_ids to enrich old notifications if necessary
    const missingActorIds = [...new Set(
      data.filter((r: any) => r.activity && !r.activity.actor_name && r.activity.actor_id).map((r: any) => r.activity.actor_id)
    )];
    const missingTaskIds = [...new Set(
      data.filter((r: any) => r.activity && !r.activity.task_title && r.activity.task_id).map((r: any) => r.activity.task_id)
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

    const mapped: AppNotification[] = data.map((row: any) => {
      const act = row.activity || {};
      return {
        id: row.id,
        type: act.type as NotificationType,
        taskId: act.task_id ?? "",
        taskTitle: act.task_title || taskMap[act.task_id] || "Unknown task",
        taskDescription: act.task_description,
        actorId: act.actor_id ?? "",
        actorName: act.actor_name || profileMap[act.actor_id] || "System",
        audience: row.user_id,
        createdAt: row.created_at,
        read: row.read,
      };
    });

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
          table: "user_notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        async (payload) => {
          const row = payload.new as any;
          // Fetch the associated activity log to get full details
          const { data: act } = await supabase.from('activity_logs').select('*').eq('id', row.activity_id).single();
          if (!act) return;

          const notif: AppNotification = {
            id: row.id,
            type: act.type as NotificationType,
            taskId: act.task_id ?? "",
            taskTitle: act.task_title ?? "—",
            actorId: act.actor_id ?? "",
            actorName: act.actor_name ?? "Someone",
            audience: row.user_id,
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
          table: "user_notifications",
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

  // ── In-App push (Legacy - do not use for new logic) ───────
  const pushNotification = useCallback((n: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    // This is kept for backwards compatibility where it hasn't been updated yet.
    // It creates an activity log and a user notification.
    pushActivityAndNotify({
      type: n.type,
      taskId: n.taskId,
      taskTitle: n.taskTitle,
      actorId: n.actorId,
      actorName: n.actorName,
      audiences: [n.audience]
    });
  }, []);

  const pushActivityAndNotify = useCallback(async (n: {
    type: NotificationType;
    taskId?: string;
    taskTitle?: string;
    taskDescription?: string;
    actorId: string;
    actorName: string;
    audiences: string[];
    metadata?: any;
  }) => {
    if (!n.audiences || n.audiences.length === 0) return;

    // 1. Create activity log
    const { data: act, error: actError } = await supabase.from('activity_logs').insert({
      type: n.type,
      actor_id: n.actorId,
      actor_name: n.actorName,
      task_id: n.taskId,
      task_title: n.taskTitle,
      task_description: n.taskDescription,
      metadata: n.metadata || {}
    }).select().single();

    if (actError || !act) {
      console.error("Failed to insert activity log:", actError);
      return;
    }

    // 2. Create user notifications
    // Filter out invalid UUIDs just in case
    const validAudiences = n.audiences.filter(a => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a));
    if (validAudiences.length === 0) return;

    const notificationsToInsert = validAudiences.map(userId => ({
      activity_id: act.id,
      user_id: userId,
      read: false
    }));

    const { error: notifError } = await supabase.from('user_notifications').insert(notificationsToInsert);
    if (notifError) console.error("Failed to insert user notifications:", notifError);
    
    // 3. Optimistic local update for the current user
    if (validAudiences.includes(profile?.id ?? "")) {
      const localNotif: AppNotification = {
        id: "n" + Math.random().toString(36).slice(2, 9),
        type: n.type,
        taskId: n.taskId || "",
        taskTitle: n.taskTitle || "—",
        actorId: n.actorId,
        actorName: n.actorName,
        audience: profile?.id ?? "",
        createdAt: new Date().toISOString(),
        read: false,
      };
      setNotifications(prev => [localNotif, ...prev].slice(0, 200));
    }
  }, [profile?.id]);

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
    await supabase.from("user_notifications").update({ read: true }).eq("id", id);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const ids = visibleNotifications.filter(n => !n.read).map(n => n.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (ids.length > 0) {
      await supabase.from("user_notifications").update({ read: true }).in("id", ids);
    }
  }, [visibleNotifications]);

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from("user_notifications").delete().eq("id", id);
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
    pushActivityAndNotify,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, authLoading, notifications, visibleNotifications, unreadCount, theme, toggleTheme, notifPerm, requestNotificationPermission, pushNotification, pushActivityAndNotify, markNotificationRead, markAllNotificationsRead, dismissNotification]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
