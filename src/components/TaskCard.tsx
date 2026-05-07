import { useState } from "react";
import type { Profile, Task } from "@/integrations/supabase/types";
import { useProfiles } from "@/hooks/useProfiles";
import { useTaskActions } from "@/hooks/useTasks";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { UserAvatar } from "./UserAvatar";
import { Button } from "@/components/ui/button";
import { CalendarClock, Check, Clock, Pause, Pencil, Play, Send, Trash2, X } from "lucide-react";
import { formatDue, timeRemaining } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  task: Task;
  showAssignee?: boolean;
  canManage?: boolean;
  canComplete?: boolean; // employee actions
  canApprove?: boolean;  // admin approval actions
  compact?: boolean;
}

export function TaskCard({
  task,
  showAssignee = true,
  canManage = false,
  canComplete = false,
  canApprove = false,
  compact = false,
}: Props) {
  const { data } = useProfiles();
  const employees = (data ?? []) as Profile[];
  const actions = useTaskActions();
  const assignee = employees.find(e => e.id === task.assignee_id);
  const due = formatDue(task);
  const overdue = task.status === "overdue";
  const requested = task.status === "completion_requested";

  // Read more state
  const [expanded, setExpanded] = useState(false);
  const descLong = (task.description?.length ?? 0) > 120;

  return (
    <article
      className={cn(
        "surface-card hover-lift p-4 sm:p-5 animate-fade-in group transition-all",
        overdue && "border-destructive/40 bg-destructive/5",
        requested && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h3 className="font-display text-base font-semibold leading-snug">{task.title}</h3>

          {/* Description with Read more */}
          {!compact && task.description && (
            <div className="mt-1">
              <p className={cn("text-sm text-muted-foreground", !expanded && descLong && "line-clamp-2")}>
                {task.description}
              </p>
              {descLong && (
                <button
                  className="mt-0.5 text-xs text-primary hover:underline font-medium"
                  onClick={() => setExpanded(e => !e)}
                >
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          )}
        </div>
        {showAssignee && assignee && (
          <UserAvatar name={assignee.name} color={assignee.avatar_color ?? undefined} size="md" />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {task.due_time}
          </span>
          <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
            <Clock className="h-3.5 w-3.5" />
            {timeRemaining(task)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canComplete && task.status !== "completed" && task.status !== "completion_requested" && (
            <>
              {(task.status === "pending" || task.status === "overdue") && (
                <Button size="sm" className="h-8 bg-info text-info-foreground hover:bg-info/90" onClick={() => actions.startTask(task.id, task)}>
                  <Play className="h-3.5 w-3.5" /> I'm On It
                </Button>
              )}
              {task.status === "in_progress" && (
                <>
                  <Button size="sm" variant="secondary" className="h-8" onClick={() => actions.stopTask(task.id, task)}>
                    <Pause className="h-3.5 w-3.5" /> Not Doing
                  </Button>
                  <Button size="sm" className="h-8 bg-gradient-primary text-white hover:opacity-95" onClick={() => actions.requestCompletion(task.id, task)}>
                    <Send className="h-3.5 w-3.5" /> Request Completion
                  </Button>
                </>
              )}
            </>
          )}

          {canComplete && requested && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Send className="h-3 w-3" /> Awaiting admin approval
            </span>
          )}

          {canApprove && requested && (
            <>
              <Button size="sm" variant="outline" className="h-8" onClick={() => actions.rejectCompletion(task.id, task)}>
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button size="sm" className="h-8 bg-success text-success-foreground hover:bg-success/90" onClick={() => actions.approveCompletion(task.id, task)}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
            </>
          )}

          {/* Edit button — admins only (canManage) */}
          {canManage && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" asChild>
              <Link to={`/admin/tasks/${task.id}/edit`} aria-label="Edit task">
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}

          {/* Delete button — admins only — with confirmation toast */}
          {canManage && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="Delete task"
              onClick={() => {
                toast.warning(
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">Delete "{task.title}"?</span>
                    <span className="text-xs text-muted-foreground">This cannot be undone.</span>
                  </div>,
                  {
                    duration: 6000,
                    action: {
                      label: "Delete",
                      onClick: () => actions.deleteTask(task.id),
                    },
                    cancel: {
                      label: "Cancel",
                      onClick: () => {},
                    },
                  }
                );
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
