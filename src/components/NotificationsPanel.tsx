import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { AppNotification, NotificationType } from "@/data/seed";
import { useTaskActions } from "@/hooks/useTasks";
import { useTasks } from "@/hooks/useTasks";
import { Play, Pause, Send, CheckCircle2, XCircle, Bell, BellOff, BellRing, Check, X, ChevronDown, ChevronUp, Inbox, ListTodo, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Task } from "@/integrations/supabase/types";

const activityMeta: Record<string, { icon: any; tone: string; verb: string }> = {
  task_assigned:        { icon: Bell,         tone: "text-primary bg-primary/15",           verb: "assigned you" },
  task_started:         { icon: Play,          tone: "text-info bg-info/15",                 verb: "started" },
  task_stopped:         { icon: Pause,         tone: "text-warning bg-warning/15",           verb: "stopped working on" },
  completion_requested: { icon: Send,          tone: "text-purple-500 bg-purple-500/15",     verb: "requested approval for" },
  completion_approved:  { icon: CheckCircle2,  tone: "text-success bg-success/15",           verb: "approved" },
  completion_rejected:  { icon: XCircle,       tone: "text-destructive bg-destructive/15",   verb: "rejected" },
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Notification Permission Banner ──────────────────────────────────────────
function PermissionBanner() {
  const { notificationPermission, requestNotificationPermission } = useApp();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (notificationPermission === "unsupported") return null;

  if (notificationPermission === "granted") {
    return (
      <div className="flex items-center gap-3 border-b bg-success/5 px-4 py-2.5">
        <BellRing className="h-4 w-4 text-success shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-success">Notifications enabled</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            You'll get OS alerts for task updates.
            <button className="ml-1 underline" onClick={() => setDismissed(true)}>Dismiss</button>
          </p>
        </div>
      </div>
    );
  }

  if (notificationPermission === "denied") {
    return (
      <div className="flex items-center gap-3 border-b bg-destructive/5 px-4 py-2.5">
        <BellOff className="h-4 w-4 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">Notifications blocked</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Enable them in browser settings → Site Settings → Notifications.</p>
        </div>
      </div>
    );
  }

  // default / not yet asked
  return (
    <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2.5">
      <BellOff className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">Enable push alerts</p>
        <p className="text-[10px] text-muted-foreground leading-tight">Get phone alerts when tasks update</p>
      </div>
      <Button size="sm" className="h-7 text-xs shrink-0" onClick={requestNotificationPermission}>
        Allow
      </Button>
    </div>
  );
}

// ── Log Item (no navigation — just informational) ────────────────────────────
function LogItem({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  const m = activityMeta[n.type] ?? activityMeta.task_started;
  const Icon = m.icon;

  return (
    <li className={cn(
      "flex items-start gap-3 px-4 py-3 transition-colors border-b last:border-0 animate-fade-in group/item",
      !n.read && "bg-muted/30",
    )}>
      <div className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", m.tone)}>
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
      <div className="flex items-center gap-1 shrink-0 mt-1">
        {!n.read && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
        <button
          className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/item:opacity-100 transition-opacity"
          onClick={onDismiss}
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

// ── Approval Card (with inline approve/reject + navigation) ──────────────────
function ApprovalCard({ n, onAction }: { n: AppNotification; onAction: () => void }) {
  const { markNotificationRead, dismissNotification } = useApp();
  const actions = useTaskActions();
  const { data: tasks = [] } = useTasks({ role: "admin" });
  const task = tasks.find((t: Task) => t.id === n.taskId);
  const [expanded, setExpanded] = useState(false);

  const handleApprove = () => {
    if (!task) return;
    toast.promise(
      new Promise<void>((resolve, reject) => {
        try { actions.approveCompletion(task.id, task); resolve(); }
        catch (e) { reject(e); }
      }),
      { loading: "Approving…", success: "Task approved ✓", error: "Failed to approve" }
    );
    markNotificationRead(n.id);
    onAction();
  };

  const handleReject = () => {
    if (!task) return;
    toast.promise(
      new Promise<void>((resolve, reject) => {
        try { actions.rejectCompletion(task.id, task); resolve(); }
        catch (e) { reject(e); }
      }),
      { loading: "Rejecting…", success: "Task sent back to in-progress", error: "Failed to reject" }
    );
    markNotificationRead(n.id);
    onAction();
  };

  return (
    <li className={cn(
      "px-4 py-3 border-b last:border-0 transition-colors animate-fade-in group/item",
      !n.read && "bg-purple-500/5"
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-500/15 text-purple-500">
          <Send className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug">
            <span className="font-semibold">{n.actorName}</span>
            {" "}<span className="text-muted-foreground">requested approval for</span>{" "}
            <Link
              to={`/admin/tasks`}
              state={{ highlightTaskId: n.taskId }}
              className="font-medium hover:underline text-primary"
              onClick={() => markNotificationRead(n.id)}
            >
              {n.taskTitle}
            </Link>
          </div>
          {n.taskDescription && (
            <button
              className="mt-0.5 text-[10px] text-muted-foreground text-left w-full"
              onClick={() => setExpanded(e => !e)}
            >
              <span className={cn("line-clamp-2", expanded && "line-clamp-none")}>{n.taskDescription}</span>
              <span className="text-primary text-[10px] flex items-center gap-0.5">
                {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
              </span>
            </button>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</div>

          {/* Inline approve/reject */}
          {task && task.status === "completion_requested" && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs bg-success text-success-foreground hover:bg-success/90 gap-1"
                onClick={handleApprove}
              >
                <Check className="h-3 w-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1"
                onClick={handleReject}
              >
                <X className="h-3 w-3" /> Reject
              </Button>
            </div>
          )}
          {task && task.status !== "completion_requested" && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Already {task.status === "completed" ? "approved ✓" : `${task.status.replace(/_/g, " ")}`}
            </div>
          )}
          {!task && (
            <div className="mt-1 text-[10px] text-muted-foreground italic">Task not found or already actioned</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-1">
          {!n.read && <span className="h-2 w-2 rounded-full bg-purple-500" />}
          <button
            className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/item:opacity-100 transition-opacity"
            onClick={() => dismissNotification(n.id)}
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ── My Task Item (task_assigned — navigates to tasks page) ───────────────────
function MyTaskItem({ n, onClick, onDismiss }: { n: AppNotification; onClick: () => void; onDismiss: () => void }) {
  // Always navigate to personal task board for personal assignments
  const taskLink = `/me/tasks`;

  return (
    <li className={cn(
      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 border-b last:border-0 animate-fade-in group/item",
      !n.read && "bg-primary/5",
    )}>
      <Link
        to={taskLink}
        state={{ highlightTaskId: n.taskId }}
        className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={onClick}
      >
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug">
            <span className="font-semibold">{n.actorName}</span>{" "}
            <span className="text-muted-foreground">assigned you</span>{" "}
            <span className="font-medium text-primary">{n.taskTitle}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</div>
        </div>
      </Link>
      <div className="flex items-center gap-1 shrink-0 mt-1">
        {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
        <button
          className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/item:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function NotificationsPanel({ onItemClick }: { onItemClick?: () => void }) {
  const { visibleNotifications, unreadCount, markAllNotificationsRead, markNotificationRead, dismissNotification, user } = useApp();
  const [activeTab, setActiveTab] = useState<"logs" | "approvals" | "tasks">("logs");

  // Split notifications into 3 categories
  const logs = visibleNotifications.filter(n =>
    ["task_started", "task_stopped", "completion_approved", "completion_rejected"].includes(n.type)
  );
  const approvals = visibleNotifications.filter(n => n.type === "completion_requested");
  const myTasks = visibleNotifications.filter(n => n.type === "task_assigned");

  const unreadLogs = logs.filter(n => !n.read).length;
  const unreadApprovals = approvals.filter(n => !n.read).length;
  const unreadTasks = myTasks.filter(n => !n.read).length;

  return (
    <div className="w-[22rem] max-w-[90vw] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
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

      {/* Permission banner */}
      <PermissionBanner />

      {/* 3 Tabs: Logs | Approvals | My Tasks */}
      <div className="flex border-b shrink-0">
        {/* Logs tab */}
        <button
          onClick={() => setActiveTab("logs")}
          className={cn(
            "flex-1 px-2 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors",
            activeTab === "logs"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Logs
          {unreadLogs > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted-foreground/30 px-1 text-[10px] font-bold">
              {unreadLogs}
            </span>
          )}
        </button>

        {/* Approvals tab */}
        <button
          onClick={() => setActiveTab("approvals")}
          className={cn(
            "flex-1 px-2 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors",
            activeTab === "approvals"
              ? "border-b-2 border-purple-500 text-purple-500"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Inbox className="h-3.5 w-3.5" />
          Approvals
          {unreadApprovals > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-500 px-1 text-[10px] text-white font-bold">
              {unreadApprovals}
            </span>
          )}
        </button>

        {/* My Tasks tab */}
        <button
          onClick={() => setActiveTab("tasks")}
          className={cn(
            "flex-1 px-2 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors",
            activeTab === "tasks"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ListTodo className="h-3.5 w-3.5" />
          My Tasks
          {unreadTasks > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground font-bold">
              {unreadTasks}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <ul className="max-h-[28rem] overflow-auto">
        {/* ── Logs tab ── */}
        {activeTab === "logs" && (
          <>
            {logs.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                <ScrollText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                No activity logs yet.
              </li>
            )}
            {logs.map(n => (
              <LogItem
                key={n.id}
                n={n}
                onDismiss={() => dismissNotification(n.id)}
              />
            ))}
          </>
        )}

        {/* ── Approvals tab ── */}
        {activeTab === "approvals" && (
          <>
            {approvals.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                No pending approvals
              </li>
            )}
            {approvals.map(n => (
              <ApprovalCard key={n.id} n={n} onAction={() => onItemClick?.()} />
            ))}
          </>
        )}

        {/* ── My Tasks tab ── */}
        {activeTab === "tasks" && (
          <>
            {myTasks.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                <ListTodo className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                No new task assignments.
              </li>
            )}
            {myTasks.map(n => (
              <MyTaskItem
                key={n.id}
                n={n}
                onClick={() => { markNotificationRead(n.id); onItemClick?.(); }}
                onDismiss={() => dismissNotification(n.id)}
              />
            ))}
          </>
        )}
      </ul>
    </div>
  );
}
