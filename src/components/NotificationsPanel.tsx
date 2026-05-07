import { useApp } from "@/context/AppContext";
import { AppNotification, NotificationType } from "@/data/seed";
import { Play, Pause, Send, CheckCircle2, XCircle, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const meta: Record<NotificationType, { icon: any; tone: string; verb: string }> = {
  task_started:          { icon: Play,        tone: "text-info bg-info/15",                 verb: "started" },
  task_stopped:          { icon: Pause,       tone: "text-warning bg-warning/15",           verb: "stopped working on" },
  completion_requested:  { icon: Send,        tone: "text-primary bg-primary/15",           verb: "requested completion of" },
  completion_approved:   { icon: CheckCircle2,tone: "text-success bg-success/15",           verb: "approved" },
  completion_rejected:   { icon: XCircle,     tone: "text-destructive bg-destructive/15",   verb: "rejected" },
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationsPanel({ onItemClick }: { onItemClick?: () => void }) {
  const { visibleNotifications, unreadCount, markAllNotificationsRead, markNotificationRead, user,
    notificationPermission, requestNotificationPermission } = useApp();

  return (
    <div className="w-[22rem] max-w-[90vw]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </div>
          <div className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllNotificationsRead}>
            Mark all read
          </Button>
        )}
      </div>

      {/* ── Push notification permission prompt ─────────── */}
      {notificationPermission !== "unsupported" && notificationPermission !== "granted" && (
        <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2.5">
          <BellOff className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">Enable notifications</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Get alerts on your phone when tasks update</p>
          </div>
          <Button size="sm" className="h-7 text-xs shrink-0" onClick={requestNotificationPermission}>
            Allow
          </Button>
        </div>
      )}

      <ul className="max-h-96 overflow-auto py-1">
        {visibleNotifications.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </li>
        )}
        {visibleNotifications.map(n => <Item key={n.id} n={n} onClick={() => { markNotificationRead(n.id); onItemClick?.(); }} />)}
      </ul>

      {user?.role === "admin" && (
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full justify-center text-sm" onClick={onItemClick}>
            <Link to="/admin/approvals">Review approvals</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function Item({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  const m = meta[n.type];
  const Icon = m.icon;
  return (
    <li
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 animate-fade-in",
        !n.read && "bg-primary/5",
      )}
    >
      <div className={cn("mt-0.5 grid h-8 w-8 place-items-center rounded-lg", m.tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">
          <span className="font-semibold">{n.actorName}</span>{" "}
          <span className="text-muted-foreground">{m.verb}</span>{" "}
          <span className="font-medium">{n.taskTitle}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</div>
      </div>
      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </li>
  );
}
