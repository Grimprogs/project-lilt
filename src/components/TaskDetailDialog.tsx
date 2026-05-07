import { useState, useMemo } from "react";
import type { Task, Profile } from "@/integrations/supabase/types";
import { useApp } from "@/context/AppContext";
import { useProfiles } from "@/hooks/useProfiles";
import { useTaskActions } from "@/hooks/useTasks";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { getVisibilitySettings } from "@/lib/permissions";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { UserAvatar } from "./UserAvatar";
import { formatDue, timeRemaining } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CalendarClock, Clock, Check, X, Pause, Pencil, Play, Send, Trash2, User, Building2, Briefcase,
} from "lucide-react";

interface Props {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Permissions passed from the parent context */
  canManage?: boolean;
  canComplete?: boolean;
  canApprove?: boolean;
  canSelfAssign?: boolean;  // from visibility matrix: can_assign_self
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  canManage = false,
  canComplete = false,
  canApprove = false,
  canSelfAssign = false,
}: Props) {
  const { profile, user } = useApp();
  const { data: profiles = [] } = useProfiles();
  const actions = useTaskActions();
  const assignee = profiles.find(e => e.id === task.assignee_id) as Profile | undefined;
  const creator = profiles.find(e => e.id === task.created_by) as Profile | undefined;
  const due = formatDue(task);
  const overdue = task.status === "overdue";
  const requested = task.status === "completion_requested";

  // Self-assigned check: user created this task AND assigned it to themselves
  const isSelfAssigned = task.created_by === profile?.id && task.assignee_id === profile?.id;
  // Can edit self-assigned tasks if they have can_assign_self permission
  const canEditSelfTask = isSelfAssigned && canSelfAssign;

  const handleDelete = () => {
    toast(`Delete "${task.title}"?`, {
      description: "This cannot be undone.",
      duration: 6000,
      action: { label: "Delete", onClick: () => { actions.deleteTask(task.id); onOpenChange(false); } },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header with gradient accent */}
        <div className={cn(
          "px-6 pt-6 pb-4 border-b",
          overdue && "bg-destructive/5 border-destructive/20",
          requested && "bg-primary/5 border-primary/20",
        )}>
          <DialogHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>
            <DialogTitle className="font-display text-xl leading-snug pr-8">
              {task.title}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          {/* Description */}
          {task.description && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Description</h4>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Meta Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Assignee */}
            <div className="surface-card p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Assigned to
              </div>
              {assignee ? (
                <div className="flex items-center gap-2">
                  <UserAvatar name={assignee.name} color={assignee.avatar_color ?? undefined} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{assignee.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{assignee.job_title}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unassigned</p>
              )}
            </div>

            {/* Created by */}
            <div className="surface-card p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Created by
              </div>
              {creator ? (
                <div className="flex items-center gap-2">
                  <UserAvatar name={creator.name} color={creator.avatar_color ?? undefined} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{creator.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{creator.role}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">System</p>
              )}
            </div>

            {/* Due */}
            <div className="surface-card p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Due
              </div>
              <p className="text-sm font-medium">
                {due.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
              </p>
              <p className="text-xs text-muted-foreground">{task.due_time}</p>
            </div>

            {/* Time remaining */}
            <div className="surface-card p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time left
              </div>
              <p className={cn("text-sm font-medium", overdue && "text-destructive")}>
                {timeRemaining(task)}
              </p>
            </div>

            {/* Department */}
            {assignee?.department && (
              <div className="surface-card p-3 space-y-1 col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Department
                </div>
                <p className="text-sm font-medium">{assignee.department}</p>
              </div>
            )}
          </div>

          {/* Self-assigned badge */}
          {isSelfAssigned && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <User className="h-3.5 w-3.5 text-primary" />
              <span>Self-assigned task</span>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>Created: {new Date(task.created_at).toLocaleString()}</p>
            {task.started_at && <p>Started: {new Date(task.started_at).toLocaleString()}</p>}
            {task.completion_requested_at && <p>Completion requested: {new Date(task.completion_requested_at).toLocaleString()}</p>}
            {task.approved_at && <p>Approved: {new Date(task.approved_at).toLocaleString()}</p>}
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t px-6 py-4 flex flex-wrap items-center gap-2 bg-muted/20">
          {/* Employee actions */}
          {canComplete && task.status !== "completed" && task.status !== "completion_requested" && (
            <>
              {(task.status === "pending" || task.status === "overdue") && (
                <Button size="sm" className="h-9 bg-info text-info-foreground hover:bg-info/90 gap-1.5"
                  onClick={() => { actions.startTask(task.id, task); onOpenChange(false); }}>
                  <Play className="h-3.5 w-3.5" /> I'm On It
                </Button>
              )}
              {task.status === "in_progress" && (
                <>
                  <Button size="sm" variant="secondary" className="h-9 gap-1.5"
                    onClick={() => { actions.stopTask(task.id, task); onOpenChange(false); }}>
                    <Pause className="h-3.5 w-3.5" /> Not Doing
                  </Button>
                  <Button size="sm" className="h-9 bg-gradient-primary text-white hover:opacity-95 gap-1.5"
                    onClick={() => { actions.requestCompletion(task.id, task); onOpenChange(false); }}>
                    <Send className="h-3.5 w-3.5" /> Request Completion
                  </Button>
                </>
              )}
            </>
          )}

          {canComplete && requested && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <Send className="h-3 w-3" /> Awaiting admin approval
            </span>
          )}

          {/* Approval actions */}
          {canApprove && requested && (
            <>
              <Button size="sm" variant="outline" className="h-9 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => { actions.rejectCompletion(task.id, task); onOpenChange(false); }}>
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button size="sm" className="h-9 bg-success text-success-foreground hover:bg-success/90 gap-1.5"
                onClick={() => { actions.approveCompletion(task.id, task); onOpenChange(false); }}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
            </>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Edit — available if canManage OR self-assigned with can_assign_self */}
          {(canManage || canEditSelfTask) && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" asChild>
              <Link to={`/admin/tasks/${task.id}/edit`} onClick={() => onOpenChange(false)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
          )}

          {/* Delete — only full canManage */}
          {canManage && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
